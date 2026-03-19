# Webview Performance: Editor Tab vs Sidebar

Analysis of potential performance differences when the Kilo Code webview runs in an editor tab versus the default sidebar position.

## Executive Summary

The extension uses **identical code paths** for sidebar and editor tab webviews. `KiloProvider` serves both via `resolveWebviewView()` (sidebar) and `resolveWebviewPanel()` (tab), with the same HTML, JS bundle, message handling, and SSE pipeline. There is no sidebar-specific or tab-specific rendering logic.

However, several architectural patterns interact differently with VS Code's internal webview management depending on position, and the extension has **no visibility-aware throttling** anywhere in the pipeline. This creates measurable differences in resource usage between the two positions.

## Key Findings

### 1. No Event Coalescing in the SSE-to-Webview Pipeline

**Files:** `src/services/cli-backend/sdk-sse-adapter.ts:22-27`, `src/KiloProvider.ts:2574-2584`, `src/KiloProvider.ts:2606-2622`

During active AI streaming, `message.part.delta` events fire **per-token**. Each token traverses this unthrottled pipeline:

```
CLI backend (SSE) -> SdkSSEAdapter -> ConnectionService broadcast
  -> per-KiloProvider session filtering -> handleEvent()
  -> mapSSEEventToWebviewMessage() -> postMessage()
  -> [VS Code IPC boundary]
  -> window.message event -> VSCodeProvider fan-out to all handlers
  -> SessionProvider store mutation -> Solid.js DOM update
```

The `sdk-sse-adapter.ts` explicitly documents the design decision (lines 22-27):

> NOTE on event coalescing: The app batches rapid events into 16 ms windows before flushing to the UI. We don't do that here because `postMessage()` to the webview already acts as an implicit async buffer. If profiling shows the webview is overwhelmed by high-frequency events, adding a similar coalescing queue here would be a straightforward improvement.

**Tab impact:** When the webview is in an editor tab that occupies a larger viewport, each per-token DOM update triggers layout/paint over a larger area. The sidebar's narrow viewport means less layout work per update.

### 2. No Visibility-Aware Throttling

**Absence across:** `src/KiloProvider.ts` (no `.visible` checks), `webview-ui/src/` (no `document.visibilityState` or `visibilitychange` listeners)

The extension has **zero visibility awareness**:

- `KiloProvider.postMessage()` (`src/KiloProvider.ts:2606-2622`) fires unconditionally regardless of whether the webview is visible
- The webview JS has no `visibilitychange` listener and no `document.hidden` checks
- `WebviewView` (sidebar) does not expose `onDidChangeViewState` -- the extension cannot detect sidebar visibility changes at all
- `WebviewPanel` (tab) exposes `onDidChangeViewState` but it is only used once, in `waitForWebviewPanelToBeActive()` (`src/extension.ts:251-264`), for the "open in tab" setup flow -- **not for throttling**

**Tab impact:** When using "Open in Tab", the `openKiloInNewTab()` function creates a separate `KiloProvider` instance (`src/extension.ts:233`). If the user also has the sidebar open, **two independent KiloProvider instances** both receive SSE events from the shared `ConnectionService`, both call `postMessage()`, and both trigger DOM updates -- even though the user can only see one at a time. Neither instance checks visibility before posting messages.

### 3. Multiple KiloProvider Instances Share One SSE Stream

**Files:** `src/services/cli-backend/connection-service.ts:286-291`, `src/KiloProvider.ts:830-843`

All `KiloProvider` instances subscribe to the same `ConnectionService` event stream. Each instance filters events by its `trackedSessionIds` set. However:

- The sidebar provider and tab provider may track overlapping or identical session IDs
- Every SSE event is delivered to **every** provider, each performing its own filtering
- Each provider independently calls `postMessage()` to its webview
- Each webview independently processes the message through its full handler chain

**Tab impact:** Opening Kilo in a tab while the sidebar is still active doubles the message processing for shared sessions. The `ConnectionService.onEventFiltered()` broadcasts to all listeners without deduplication.

### 4. No Virtual Scrolling in Message List

**File:** `webview-ui/src/components/chat/MessageList.tsx:146-162`

```tsx
<For each={userMessages()}>
  {(msg, index) => (
    <VscodeSessionTurn sessionID={...} messageID={msg.id} queued={queued()} />
  )}
</For>
```

All messages are rendered into the DOM without virtualization. For long sessions with many messages, the DOM grows unboundedly.

**Tab impact:** An editor tab typically occupies 2-4x the pixel area of the sidebar. Wider viewports mean:

- Text wraps less, producing taller rendered messages
- More DOM nodes are in the visible viewport simultaneously
- Layout reflows during streaming affect a larger paint area
- The browser's compositor has more work for each scroll-linked update

### 5. `retainContextWhenHidden: true` Keeps Background Webviews Alive

**Files:** `src/extension.ts:45` (sidebar), `src/extension.ts:224` (tab)

Both sidebar and tab webviews set `retainContextWhenHidden: true`. This means:

- The webview JS context stays alive when the webview is not visible
- All `setInterval` retry timers continue (config, providers, agents, notifications -- each at 500ms x 5 retries)
- `window.message` listeners continue processing every `postMessage`
- Solid.js reactive computations continue executing store updates
- DOM mutations happen invisibly, wasting CPU cycles

**Tab impact:** The key difference is **how often each position is hidden**:

- Sidebar: hidden frequently (user switches to Explorer, Git, Search, etc.)
- Editor tab: hidden only when another editor tab is active in the same group

When the sidebar is hidden, VS Code may internally deprioritize its `postMessage` delivery, creating a natural (if unintentional) throttle. The editor tab receives this implicit throttle less often because it tends to stay visible for longer stretches.

### 6. Message Fan-Out in Webview Context

**File:** `webview-ui/src/context/vscode.tsx:42-47`

```ts
const handlers = new Set<(message: ExtensionMessage) => void>()
const messageListener = (event: MessageEvent) => {
  const message = event.data as ExtensionMessage
  handlers.forEach((handler) => handler(message))
}
```

Every incoming `postMessage` is broadcast to **all** registered handlers (server, session, config, provider, notifications, app-level). During streaming, every part delta hits all handlers, each doing a `switch` on `message.type`. Most handlers immediately return on type mismatch, but the iteration overhead scales with handler count.

**Tab vs sidebar impact:** Identical -- same handler chain. But combined with finding #1, the per-token fan-out to 6+ handlers without coalescing creates a high baseline CPU cost per token.

### 7. Sidebar CSS Border Creates Minor Paint Overhead

**File:** `src/KiloProvider.ts:2780`

```ts
extraStyles: `.container { ... border-right: 1px solid var(--border-weak-base); }`
```

This `border-right` CSS is applied to **both** sidebar and tab webviews (the same `_getHtmlForWebview` method serves both). In a tab context, this border is unnecessary and adds a minor compositor layer, though the impact is negligible.

### 8. Editor Group Lock After Tab Creation

**File:** `src/extension.ts:238-239`

```ts
await waitForWebviewPanelToBeActive(panel)
await vscode.commands.executeCommand("workbench.action.lockEditorGroup")
```

After creating a tab panel, the extension locks the editor group. This is a one-time operation and does not affect runtime performance, but it does change VS Code's tab management behavior in that editor group.

### 9. Auto-Scroll During Streaming

**File:** `webview-ui/src/components/chat/MessageList.tsx:50-53, 94-95`

The `createAutoScroll` hook fires on every scroll event. During token streaming, auto-scroll continuously repositions to the bottom of content. This fires `scrollTop` mutations at the rate of incoming tokens.

**Tab impact:** In a larger viewport (editor tab), the scroll container is larger, and each `scrollTop` assignment may trigger more layout recalculation than in the narrow sidebar.

## Architectural Summary Table

| Pattern                         | Sidebar behavior                | Tab behavior               | Performance risk          |
| ------------------------------- | ------------------------------- | -------------------------- | ------------------------- |
| postMessage during streaming    | Unthrottled, per-token          | Identical                  | High                      |
| Multiple KiloProvider instances | 1 instance                      | +1 per "Open in Tab"       | Medium -- duplicated work |
| Visibility detection            | Impossible (no API)             | Available but unused       | Medium -- no throttling   |
| Virtual scrolling               | None                            | None                       | Medium -- larger viewport |
| retainContextWhenHidden         | Hidden often (natural throttle) | Hidden less often          | Low-Medium                |
| Event coalescing                | None                            | None                       | High                      |
| Auto-scroll                     | Narrow viewport, less layout    | Wide viewport, more layout | Low-Medium                |
| Background retry timers         | Run when hidden                 | Run when hidden            | Low                       |

## Recommendations

### Short-term (low effort, high impact)

1. **Add 16ms event coalescing in `SdkSSEAdapter`** -- Match the `packages/app/` reference implementation. Batch rapid `message.part.delta` events into 16ms windows before dispatching to handlers. This is explicitly called out as a straightforward improvement in the existing code comment.

2. **Skip `postMessage` when webview is not visible** -- For `WebviewPanel` (tab), check `panel.visible` before calling `postMessage()`. Queue messages and flush on `onDidChangeViewState` when the panel becomes visible again. For the sidebar `WebviewView`, VS Code 1.89+ exposes `onDidChangeVisibility` -- adopt it if the minimum VS Code version allows.

### Medium-term (moderate effort)

3. **Deduplicate SSE event handling across providers** -- When the sidebar and tab providers track the same session, only one should process and forward events. The other should either be paused or share the processed result.

4. **Add `visibilitychange` listener in the webview** -- When `document.hidden` is true, pause reactive computations, defer store updates, and stop auto-scroll. Flush accumulated state on `visibilitychange` to `visible`.

### Long-term (higher effort)

5. **Implement virtual scrolling for the message list** -- Use a windowed/virtualized list renderer to cap the number of DOM nodes regardless of session length. This benefits both sidebar and tab, but has a larger impact on the wider tab viewport.

6. **Remove `retainContextWhenHidden` for non-critical panels** -- Settings, Diff Viewer, and Sub-agent Viewer panels could use `retainContextWhenHidden: false` to release resources when hidden, since they don't need to process real-time events.

## Conclusion

Reports of worse performance in a dedicated tab compared to the sidebar are likely explained by three compounding factors:

1. **Larger viewport = more layout/paint work per update** -- The unthrottled per-token streaming pipeline causes more rendering work in a wider tab than in a narrow sidebar.
2. **Less implicit throttling** -- The sidebar benefits from VS Code's internal deprioritization when hidden (which happens frequently during normal development). The tab stays visible and active more often, receiving the full firehose of uncoalesced events.
3. **Duplicate work when both are open** -- If the user has both the sidebar and a tab open, two independent KiloProvider instances process the same SSE events, doubling message passing and DOM update overhead.

The most impactful fix is adding event coalescing at the SSE adapter level, which the codebase already identifies as a planned improvement.
