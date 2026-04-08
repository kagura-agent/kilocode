# Review: packages/app/

## e2e/AGENTS.md

**Risk: LOW**

- Documents new `waitTerminalReady` and `runTerminal` action helpers
- Adds "Terminal Tests" best practices section advising browser-based typing over PTY SDK writes
- Pure documentation update, no runtime impact

## e2e/actions.ts

**Risk: LOW**

- Adds `terminalID()`, `terminalReady()`, `terminalHas()` helpers that read terminal probe state from `window.__opencode_e2e`
- Exports `waitTerminalReady()` and `runTerminal()` for e2e terminal interaction
- Uses `expect.poll()` pattern for readiness checks — well-structured
- Imports from `../src/testing/terminal` (new shared types) and `./selectors` (new `terminalSelector`)

## e2e/fixtures.ts

**Risk: LOW**

- Seeds `window.__opencode_e2e.terminal` in `addInitScript` to enable terminal probe during tests
- Straightforward fixture setup with no production impact

## e2e/prompt/prompt-slash-terminal.spec.ts

**Risk: LOW**

- Replaces `prompt.click()` + `page.keyboard.type()` with `prompt.fill()` for slash command input
- Adds `waitTerminalReady()` after toggling terminal open
- Adds resilient retry loop for focus-stealing race condition when terminal panel retries focus
- Good defensive test pattern with clear comments explaining the race condition

## e2e/selectors.ts

**Risk: LOW**

- Adds `terminalPanelSelector` targeting `#terminal-panel[aria-hidden="false"]`
- Changes `terminalSelector` to scope within visible terminal panel instead of any `[data-component="terminal"]`
- This is a breaking change for any test using the old broad selector, but all e2e tests in this PR have been updated

## e2e/session/session-review.spec.ts

**Risk: LOW**

- New 217-line e2e test for review panel scroll position preservation during live diff updates
- Skipped in CI (`test.skip(Boolean(process.env.CI))`) — marked flaky
- Creates deterministic file patches via SDK, verifies scroll position stays within 32px tolerance after live update
- Complex but well-isolated test with proper cleanup via `withSession`/`withProject`

## e2e/settings/settings-keybinds.spec.ts

**Risk: LOW**

- Replaces `await expect(terminal).toBeVisible()` with `waitTerminalReady()` for terminal toggle keybind test
- Consistent with the new terminal readiness pattern across all e2e tests

## e2e/terminal/terminal-init.spec.ts

**Risk: LOW**

- Replaces manual visibility + textarea checks with `waitTerminalReady()` helper
- Reduces test fragility by relying on the terminal probe state

## e2e/terminal/terminal-tabs.spec.ts

**Risk: LOW**

- Replaces inline `open()` and `run()` helpers with shared `waitTerminalReady` and `runTerminal`
- Reduces poll timeouts from 30s to 5s — relies on `runTerminal` confirming output before switching tabs
- Cleaner test code with consistent terminal interaction patterns

## e2e/terminal/terminal.spec.ts

**Risk: LOW**

- Simple replacement of `toBeVisible()` with `waitTerminalReady()` for terminal toggle test

## package.json

**Risk: LOW**

- Alphabetizes `@solid-primitives/i18n` and `@solid-primitives/event-bus` entries
- Adds `effect` package (`4.0.0-beta.31`) — used in `app.tsx` for the `ConnectionGate` health check with `Effect.gen`/`Effect.sleep`/`Effect.timeoutOrElse`
- **Note:** Using a beta version of `effect` in production code. Worth monitoring for stability.

## src/app.tsx

**Risk: MEDIUM**

- Major addition: `ConnectionGate` replaces simple `ServerKey` component with health check logic
  - Uses `effect` library for retry/timeout/sleep orchestration
  - Shows splash screen during blocking startup health check (1.2s min duration)
  - Shows `ConnectionError` UI with retry timer and server switching when health check fails
  - Auto-retries every 1 second in background mode
- Exports `serverName` from server context for display in error UI
- Adds `window.api?.setTitlebar` callback on theme changes (desktop integration)
- `effectMinDuration` utility wraps an Effect to enforce minimum duration
- **Concern:** The `effect` library adds significant bundle weight for a single use case. The blocking/background mode transition could have subtle timing issues if the component remounts.

## src/components/debug-bar.tsx

**Risk: LOW**

- New 441-line development-only debug overlay (gated by `import.meta.env.DEV`)
- Tracks FPS, frame gap, jank count, long tasks, input delay, INP, CLS, heap memory, route nav timing
- Uses `PerformanceObserver` for layout-shift, longtask, and event timing
- Rolling 5-second window with 250ms refresh interval
- Well-structured with proper cleanup in `onCleanup`, visibility change handling
- Only rendered in dev mode — zero production impact

## src/components/dialog-custom-provider-form.ts

**Risk: LOW**

- New file extracting validation logic from `dialog-custom-provider.tsx` into a pure, testable module
- Exports `FormState`, `ModelRow`, `HeaderRow`, `ModelErr`, `HeaderErr` types
- `validateCustomProvider()` handles provider ID format, duplicate detection, model/header dedup
- `modelRow()` and `headerRow()` use monotonic `row` counter for stable keys
- Clean extraction with good separation of concerns

## src/components/dialog-custom-provider.test.ts

**Risk: LOW**

- New tests for `validateCustomProvider` covering trimmed config payloads, duplicate row detection, and disabled provider reconnection
- Good coverage of edge cases (whitespace trimming, case-insensitive header dedup)

## src/components/dialog-custom-provider.tsx

**Risk: MEDIUM**

- Significant refactor: Moves validation to extracted form module, merges `errors` store into `form.err`
- Replaces array spread (`[...v, newItem]`) with `produce` + `splice`/`push` for model/header mutations — more performant for SolidJS reactivity
- Adds `setField`/`setModel`/`setHeader` helpers that clear errors inline on change
- Uses `data-row` attributes on `<For>` items (keyed by `row` field) for stable identity
- Row items now have unique `row` IDs instead of relying on index — fixes potential reactivity bugs with array manipulation
- **Note:** Functional behavior preserved, but the store shape change is a notable refactor

## src/components/dialog-select-file.tsx

**Risk: MEDIUM**

- Replaces `useParams` with `useSessionLayout` for `params`/`tabs`/`view`
- Introduces `createSessionTabs` abstraction for tab normalization and active file tab derivation
- Uses `tabState.openedTabs()` and `tabState.activeFileTab()` instead of raw `tabs().all()`/`tabs().active()`
- This change is part of a broader refactor to centralize session layout state
- **Concern:** Depends on new `useSessionLayout` context being available — must be used within session routes

## src/components/dialog-select-server.tsx

**Risk: MEDIUM**

- Renames `getDefaultServerUrl`/`setDefaultServerUrl` to `getDefaultServer`/`setDefaultServer` throughout
- Default comparison uses `ServerConnection.key(conn)` instead of `conn.http.url` — more correct for multi-field keys
- `useServerPreview` and health checks now use `useCheckServerHealth()` hook instead of accepting a `fetcher` param
- Default username changed from empty string to `"opencode"` for new server form
- Username is now only sent when password is also present
- **Concern:** The default username change could affect existing connections if servers don't expect it. The API rename is a coordinated change across platform.tsx, entry.tsx, and this component.

## src/components/prompt-input.tsx

**Risk: MEDIUM**

- Adds `edit`/`onEditLoaded`/`shouldQueue`/`onQueue`/`onAbort` props for followup queue and edit support
- Adds IME composition handling (`handleCompositionStart`/`handleCompositionEnd`) with `reconcile()` to suppress stale updates during IME input
- Replaces inline `buttonsSpring()` style calculations with memoized `motion()`/`buttons()`/`shell()`/`control()` helpers
- Removes RadioGroup toggle from toolbar bottom
- `createEffect` watches `props.edit?.id` to restore draft content when editing a queued followup
- **Concern:** The IME composition handling adds complexity. The `reconcile()` timeout (120ms) is a heuristic that may not work for all IME implementations.

## src/components/prompt-input/submit.ts

**Risk: MEDIUM**

- Exports new `FollowupDraft` type and `sendFollowupDraft()` function
- Adds `shouldQueue`/`onQueue`/`onAbort` to `PromptSubmitInput` for queue-mode followups
- Adds `clearContext()` helper that resets context state after send
- When `shouldQueue()` is true, builds a `FollowupDraft` and calls `onQueue` instead of immediately sending
- `sendFollowupDraft()` provides the deferred send path
- Refactored submit flow: builds parts → checks queue → either queues or sends
- **Concern:** Two distinct send paths (immediate vs queued) increase code surface for bugs

## src/components/server/server-row.tsx

**Risk: LOW**

- Adds `min-w-0` classes to prevent text overflow in server name/version display
- Adds `contentStyle` to tooltip for non-wrapping display
- Pure layout fix — no behavioral changes

## src/components/session-context-usage.tsx

**Risk: LOW**

- Replaces `useParams` with `useSessionLayout` for shared state
- Uses `createSessionTabs` + `tabState.activeTab()` instead of raw `tabs().active()`
- Consistent with the broader session layout refactor

## src/components/session/session-context-tab.tsx

**Risk: LOW**

- Uses `useSessionLayout` instead of direct `useParams`/`useLayout`
- Minor refactor for consistency with centralized session state

## src/components/session/session-header.tsx

**Risk: LOW**

- Uses `useSessionLayout` for params/tabs
- Replaces `tabs().active()` with `tabState.activeTab()` via `createSessionTabs`
- Adds review tab button with `aria-expanded` state tracking

## src/components/session/session-new-view.tsx

**Risk: LOW**

- Removes `onWorktreeChange` prop and associated worktree selection logic
- Simplifies new session view

## src/components/session/session-sortable-terminal-tab.tsx

**Risk: LOW**

- Minor refactor with no functional changes based on diff context

## src/components/settings-agents.tsx

**Risk: LOW**

- **Deleted** — Was a 16-line placeholder component with title and description only
- No functionality lost

## src/components/settings-commands.tsx

**Risk: LOW**

- **Deleted** — Was a 16-line placeholder component
- No functionality lost

## src/components/settings-general.tsx

**Risk: MEDIUM**

- Major restructure: Merges old `FeedSection` into new `GeneralSection` (top of settings)
- Adds followup behavior setting (queue vs steer) with `Select` dropdown
- Renames "Appearance" row to "Color scheme"
- Adds `triggerStyle={{ "min-width": "180px" }}` / `"220px"` for consistent dropdown widths
- Updates `SettingsRow` layout: `justify-between` → no justify, adds `flex-1` to label, `sm:flex-nowrap` for responsive
- **Concern:** The settings restructure changes the visual layout for all users. The SettingsRow CSS changes affect every settings row globally.

## src/components/settings-mcp.tsx

**Risk: LOW**

- **Deleted** — Was a 16-line placeholder component
- No functionality lost

## src/components/settings-permissions.tsx

**Risk: LOW**

- **Deleted** — Was a 230-line permissions settings page with tool-level permission controls
- This removes the entire permissions UI — either moved elsewhere or intentionally removed
- **Concern:** If permissions were being used, this is a feature regression. Verify permissions are managed through config files or another UI.

## src/components/status-popover.tsx

**Risk: LOW**

- Switches from `checkServerHealth` to `useCheckServerHealth` hook (removes explicit `fetcher` threading)
- Adds controlled `shown` signal for popover open/close state
- Updates trigger to use `status`/`status-active` icons with badge positioning
- Wider trigger button (w-6 → w-8)
- Uses `getDefaultServer` instead of `getDefaultServerUrl`

## src/components/terminal.tsx

**Risk: MEDIUM**

- Adds testing probe infrastructure (`terminalAttr`, `terminalProbe`) for e2e test observability
- Adds `autoFocus` prop (defaults to true, can be disabled when terminal shouldn't steal focus)
- Probe lifecycle: `init()` on mount, `connect()` on WebSocket open, `render(data)` on write, `settle()` after render, `drop()` on cleanup
- Default WebSocket username changed from `""` to `"opencode"`
- Removed commented-out scroll handler code
- `terminalWriter` callback now calls `probe.render()` and `probe.settle()` on every write
- **Concern:** The probe hooks fire on every terminal write in non-test environments too, though `terminalProbe` should be a no-op when `__opencode_e2e` is not set. Verify the probe is truly zero-cost in production.

## src/components/titlebar.tsx

**Risk: LOW**

- Adds `creating` memo to detect new session creation route
- Simplified sidebar toggle: 3-icon hover/active system → single `sidebar`/`sidebar-active` icon toggle
- New session button uses `new-session-active` icon when on create route, with `aria-current="page"`
- Windows spacer width changed from `w-6` to `w-36` (non-Tauri only) — accommodates native window controls

## src/context/global-sync.test.ts

**Risk: LOW**

- Updates imports from `./global-sync` to `./global-sync/eviction` and `./global-sync/session-load` after module restructure
- No test logic changes

## src/context/global-sync.tsx

**Risk: LOW**

- Imports and calls `clearSessionPrefetchDirectory()` when disposing a directory store
- Removes re-exports of `canDisposeDirectory`/`pickDirectoriesToEvict`/`estimateRootSessionTotal`/`loadRootSessionsWithFallback` (consumers import directly from submodules)

## src/context/global-sync/session-prefetch.test.ts

**Risk: LOW**

- New test file for session prefetch cache module
- Tests: store/clear by directory, deduplicate inflight work, clear entire directory
- Good coverage of the key operations

## src/context/global-sync/session-prefetch.ts

**Risk: MEDIUM**

- New module managing prefetched session message metadata cache
- Uses `Map<string, Meta>` for cache, `Map<string, Promise>` for inflight dedup, `Map<string, number>` for version tracking
- `runSessionPrefetch()` deduplicates concurrent fetches for the same session
- `clearSessionPrefetch()` bumps version to invalidate in-flight results
- `SESSION_PREFETCH_TTL = 15_000` — 15 second TTL for prefetched data
- **Concern:** Module-level mutable maps — not cleaned up on HMR. The `isSessionPrefetchCurrent` version check prevents stale writes but adds complexity.

## src/context/highlights.tsx

**Risk: LOW**

- Replaces two `createSignal` calls (`from`, `to`) with a single `createStore({ from, to })`
- Returns accessors `() => range.from` / `() => range.to` for compatible API
- Avoids double reactive updates when both values change simultaneously

## src/context/layout.tsx

**Risk: MEDIUM**

- Adds `openPath`, `closePath`, `togglePath` methods to `review` view state
- `review.open` now defaults to `[]` instead of potentially `undefined`
- Uses `produce` for `closePath` with `splice` — proper SolidJS store mutation
- `setOpen` deduplicates via `new Set(open)`
- **Concern:** The `togglePath` method references `this.openPath` / `this.closePath` — in SolidJS store context, `this` binding should work but is unusual. Verify it doesn't cause issues when destructured.

## src/context/notification-index.ts

**Risk: LOW**

- **Deleted** — `buildNotificationIndex` function removed
- Likely moved or replaced by a different notification strategy

## src/context/notification.test.ts

**Risk: LOW**

- **Deleted** — Tests for `buildNotificationIndex` removed alongside the module
- No orphaned test coverage

## src/context/platform.tsx

**Risk: LOW**

- Renames `getDefaultServerUrl`/`setDefaultServerUrl` to `getDefaultServer`/`setDefaultServer`
- Changes types from `string | null` to `ServerConnection.Key | null`
- Adds import for `ServerConnection` type
- API contract change that must be coordinated with all platform implementations

## src/context/server.tsx

**Risk: LOW**

- Replaces `usePlatform` with `useCheckServerHealth` hook
- Removes explicit `fetcher` construction — now handled by the hook
- Cleaner separation of concerns

## src/context/settings.tsx

**Risk: LOW**

- Adds `followup` setting with `"queue" | "steer"` type, defaults to `"steer"`
- Adds `setFollowup()` method using `withFallback` pattern consistent with other settings
- Clean addition following existing patterns

## src/context/sync.tsx

**Risk: HIGH**

- Major changes to session data sync flow:
  - `sync()` and `diff()` and `todo()` now accept `opts?: { force?: boolean }` to bypass cache
  - Session sync now checks prefetch cache first, awaits any pending prefetch promise before loading
  - Message loading result is stored in prefetch cache via `setSessionPrefetch()`
  - `evict()` clears prefetch cache for evicted sessions
  - `loadMessages` finally block uses `produce` to properly handle tracked/untracked state cleanup
- The `sync()` method now has a complex multi-stage flow: check prefetch → await inflight prefetch → check cache → load
- **Concern:** This is the most complex change in the PR. The interaction between prefetch cache, inflight promises, and SolidJS store updates has many timing edge cases. The `force` option bypasses caches but may race with prefetch writes. Careful testing of session switching, tab changes, and reconnection scenarios is essential.

## src/context/terminal.test.ts

**Risk: LOW**

- Adds `migrateTerminalState` tests covering invalid terminal filtering, duplicate ID dedup, active terminal recovery, and titleNumber extraction
- Good edge case coverage

## src/context/terminal.tsx

**Risk: MEDIUM**

- Adds `migrateTerminalState()` function for sanitizing persisted terminal state on load
- Validates each terminal entry: requires `id`, deduplicates by ID, extracts `titleNumber` from title string
- Passes `migrate: migrateTerminalState` to `persisted()` — runs at deserialization time
- Removes post-load `createEffect` migration in favor of upfront migration
- Extracts `numberFromTitle()`, `record()`, `text()`, `num()`, `pty()` validation helpers
- **Concern:** The migration runs synchronously at store hydration — any errors would prevent terminal state from loading. The `pty()` validator silently drops invalid entries, which is correct but could be confusing if terminals disappear.

## src/entry.tsx

**Risk: MEDIUM**

- Separates `getCurrentUrl()` (origin-based) from `getDefaultUrl()` (localStorage-based with fallback)
- Server is always initialized with `getCurrentUrl()`, but `defaultServer` key uses `getDefaultUrl()`
- Uses `ServerConnection.Key.make()` for type-safe key construction
- Replaces `iife` utility import with regular function declarations
- `getDefaultServer` now wraps stored URL in `ServerConnection.Key.make()` for type safety
- **Concern:** The separation of `getCurrentUrl` and `getDefaultUrl` means the initial server list always includes the current origin, while the active server key may point to a stored URL. This is intentional for multi-server support but could cause confusion if the stored URL is stale.

## src/hooks/use-providers.ts

**Risk: LOW**

- Converts `createMemo` wrappers to plain functions/closures
- `connectedIDs` set is now computed inline within `connected()` and `paid()` — recomputed on each access
- Removes unnecessary memoization for derived data that's already reactive via store access
- Uses `.some()` instead of `.find()` for boolean check in `paid()`
- **Concern:** Minor: `connected()` and `paid()` now recompute the `Set` on every call. For small provider lists this is fine.

## src/i18n/ (all translation files)

**Risk: LOW**

- Adds translation keys for:
  - `session.followupDock.*` — queued message UI strings
  - `session.revertDock.*` — rolled back message UI strings
  - `settings.general.row.colorScheme.*` — renamed appearance setting
  - `settings.general.row.followup.*` — new followup behavior setting
- 17 locale files updated (ar, br, bs, da, de, en, es, fr, ja, ko, no, pl, ru, th, tr, zh, zht)
- Russian file has the most changes (63 insertions, 11 deletions) — likely includes broader translation improvements
- All follow consistent patterns with the English source

## src/pages/layout.tsx

**Risk: HIGH**

- Massive changes to session prefetching strategy:
  - `prefetchConcurrency` bumped 1→2, `prefetchPendingLimit` bumped 6→10
  - New `span = 4` constant: prefetches 4 sessions in each direction around current
  - `warm()` helper replaces scattered prefetch logic — called on navigate, hover, and notification jump
  - Prefetch now uses `runSessionPrefetch()` for deduplication and `setSessionPrefetch()` for caching
  - Stale prefetch detection via `SESSION_PREFETCH_TTL` (15s) in the cached check
  - `clearSessionPrefetchInflight()` on directory/URL change
  - Prefetch queues now cleaned up when directory leaves visible set
  - `markPrefetched` now runs inside the prefetch task (after fetch, before store write) instead of at queue time
- `DebugBar` added to dev builds: `{import.meta.env.DEV && <DebugBar />}`
- Layout structure change: adds `min-w-0` to flex containers, wraps content in additional `<div>` layers
- Sidebar content extracted into `sidebarContent()` helper for reuse between desktop and mobile
- `SortableWorkspace` and `LocalWorkspace` gain `popover` prop
- Session prefetch eviction moves stale cleanup into prefetch task
- `projectOverlay` and `sidebarContent` extracted as closures outside JSX
- **Concern:** The prefetching rewrite is the highest-risk change. The span increase (1→4) significantly increases background network traffic. The interaction between `runSessionPrefetch`, `clearSessionPrefetchInflight`, `prefetchToken`, and queue cleanup is complex. Edge cases around rapid directory switching, concurrent prefetches, and store consistency need thorough testing.

## src/pages/layout/helpers.test.ts

**Risk: LOW**

- Renames `syncWorkspaceOrder` test to `effectiveWorkspaceOrder` (alias was removed)
- Removes `getDraggableId` test (moved to `solid-dnd` utils)
- Updates imports after module restructure

## src/pages/layout/helpers.ts

**Risk: LOW**

- Makes `sortSessions` and `isRootVisibleSession` private (no longer exported)
- Removes `getDraggableId` (moved to `@/utils/solid-dnd`)
- Removes `syncWorkspaceOrder` alias for `effectiveWorkspaceOrder`
- Clean API surface reduction

## src/pages/layout/sidebar-items.tsx

**Risk: MEDIUM**

- `SessionItem` gains `list` and `navList` props for prefetch warming
- New `warm()` helper inside `SessionItem` that prefetches neighbors by list position
- `SessionRow` replaces `prefetchSession`/`scheduleHoverPrefetch` with `warmHover`/`warmPress`/`warmFocus` callbacks
- Hover prefetch delay reduced from 200ms to 80ms
- Hover triggers immediate `warm(1, "high")` + delayed `warm(2, "low")`
- Press and focus trigger `warm(2, "high")` immediately
- Project preview panels now show `.slice(0, 2)` sessions (slice moved from data source to render)
- **Concern:** The warming strategy change is aggressive — every pointer enter triggers immediate prefetch of 3 sessions (current + 2 neighbors). Could cause excessive network requests when scrolling through long session lists.

## src/pages/layout/sidebar-project-helpers.test.ts

**Risk: LOW**

- **Deleted** — Tests for `projectSelected` and `projectTileActive` removed
- Logic inlined into the component

## src/pages/layout/sidebar-project-helpers.ts

**Risk: LOW**

- **Deleted** — `projectSelected` and `projectTileActive` inlined into `sidebar-project.tsx`

## src/pages/layout/sidebar-project.tsx

**Risk: LOW**

- Inlines `projectSelected` and `projectTileActive` logic directly
- Session list no longer sliced to 2 at data source — done at render site instead
- Passes `list` prop to `SessionItem` for neighbor warming
- Clean simplification

## src/pages/layout/sidebar-shell-helpers.ts

**Risk: LOW**

- **Deleted** — One-liner `sidebarExpanded` function inlined

## src/pages/layout/sidebar-shell.test.ts

**Risk: LOW**

- **Deleted** — Tests for trivial `sidebarExpanded` function removed

## src/pages/layout/sidebar-shell.tsx

**Risk: LOW**

- Inlines `sidebarExpanded` logic
- Adds `flex-1` to panel container

## src/pages/layout/sidebar-workspace-helpers.ts

**Risk: LOW**

- **Deleted** — One-liner `workspaceOpenState` inlined

## src/pages/layout/sidebar-workspace.test.ts

**Risk: LOW**

- **Deleted** — Tests for trivial `workspaceOpenState` removed

## src/pages/layout/sidebar-workspace.tsx

**Risk: MEDIUM**

- Adds `navList` to `WorkspaceSidebarContext` for cross-workspace session navigation
- Passes `list`, `navList`, `popover` props to `SessionItem` and `WorkspaceSessionList`
- Extracts `WorkspaceHeader` JSX into `header()` closure to avoid duplicating 14 lines of JSX
- Removes `mobile` and `nav` props from `WorkspaceActions` (unused)
- `LocalWorkspace` replaced its inline `<For>` loop with `WorkspaceSessionList` component for consistency
- **Concern:** `navList` propagation adds cross-workspace awareness to session items — make sure the list reference is stable to avoid unnecessary re-renders.

## src/pages/session.tsx

**Risk: HIGH**

- Massive session page refactor:
  - Uses `useSessionLayout` for centralized `params`/`tabs`/`view` state
  - `createSessionTabs` replaces inline tab derivation
  - New `followup` store with `queue`/`send`/`edit`/`clear`/`halt`/`fork`/`revert`/`restore` operations
  - `fill()` function auto-loads more messages when viewport isn't full
  - Stale prefetch detection: reloads if data older than `SESSION_PREFETCH_TTL`
  - Deferred diff/todo refresh on tab visibility changes
  - Removed `SessionMobileTabs` — replaced with inline `Tabs` component
  - Terminal focus preference: when terminal panel is open, focus goes to terminal instead of prompt
  - New `reviewEmpty` helper for empty state
  - New `revert` and `followup` props passed to composer region
- **Concern:** This is one of the two highest-risk files. The followup queue introduces a second message flow path alongside the existing immediate send. The `fill()` auto-loading is triggered by scroll/resize — needs throttling verification. The stale prefetch check adds latency to session switching.

## src/pages/session/composer/index.ts

**Risk: LOW**

- Removes `createSessionComposerBlocked` export (function was removed)
- Removes `SessionComposerState` type export (no longer needed externally)

## src/pages/session/composer/session-composer-region.tsx

**Risk: MEDIUM**

- Removes animation config props (hardcoded internally now)
- Replaces `useParams` with `useSessionKey` for session identification
- Adds `followup` prop with `SessionFollowupDock` component
- Adds `revert` prop with `SessionRevertDock` component
- Replaces `createSignal` with `createStore` for height/body state
- Two new dock components rendered below the prompt area

## src/pages/session/composer/session-composer-state.test.ts

**Risk: LOW**

- Adds `todoState` test suite covering all state transitions (hide/open/close/clear)
- Tests verify pure function behavior without mocking

## src/pages/session/composer/session-composer-state.ts

**Risk: MEDIUM**

- Extracts `todoState` as pure function for testability
- Removes `createSessionComposerBlocked` function
- Adds `done`/`status`/`busy`/`live` memos for richer session state tracking
- Todo dock now auto-clears stale todos when session becomes idle
- **Concern:** The stale todo clearing logic relies on `status` and `live` memos — timing matters. If status transitions are delayed, todos could be cleared prematurely.

## src/pages/session/composer/session-followup-dock.tsx

**Risk: MEDIUM**

- New component: Collapsible dock showing queued followup messages
- Supports "Send now" and "Edit" actions per queued item
- Animated collapse/expand with spring physics
- Shows message count badge
- **Concern:** New UI pattern that users need to discover. The dock appears below the prompt which may not be immediately obvious.

## src/pages/session/composer/session-revert-dock.tsx

**Risk: MEDIUM**

- New component: Collapsible dock showing rolled-back messages
- "Restore" button per item to recover reverted messages
- Auto-collapses when item list changes
- **Concern:** Same discoverability concern as followup dock. Two new docks below the prompt may create visual clutter.

## src/pages/session/composer/session-todo-dock.tsx

**Risk: LOW**

- Removes animation config props in favor of hardcoded values
- Replaces `createSignal` with `createStore` for state management
- Removes blur filter effects
- Makes `dockProgress` required prop
- Consistent with the broader composer refactor

## src/pages/session/file-tabs.tsx

**Risk: LOW**

- Uses `useSessionLayout` and `createSessionTabs` for tab state
- Uses `activeFileTab()` instead of `tabs().active()` — more precise file tab tracking
- Consistent with centralized session layout pattern

## src/pages/session/helpers.test.ts

**Risk: LOW**

- Adds `createSessionTabs` test suite
- Tests tab normalization, context/review special tab handling, active file tab derivation
- Good coverage for the new abstraction

## src/pages/session/helpers.ts

**Risk: MEDIUM**

- Adds `getSessionKey()` utility for deriving session key from params
- Adds `createSessionTabs()` — major new abstraction providing:
  - `activeTab()` — current active tab (raw)
  - `activeFileTab()` — active tab only if it's a file tab
  - `openedTabs()` — all tabs excluding special tabs (context, review)
  - `closableTabs()` — tabs that can be closed
  - Tab normalization via `normalizeTab` callback
- Removes `createPresence` helper (animation presence utility)
- Uses `same()` utility for array equality checks
- **Concern:** `createSessionTabs` centralizes tab logic but adds indirection. The `normalizeTab` callback creates coupling between file context and tab rendering.

## src/pages/session/message-timeline.tsx

**Risk: MEDIUM**

- Adds share UI: popover with publish/unpublish, copy URL, view shared session
- Adds `content-visibility: auto` CSS for virtual rendering performance
- Wraps comments in `<Show when>` guard
- Adds `UserActions` type for fork/revert operations
- Introduces `useSessionKey`/`useGlobalSDK`/`usePlatform`
- `TextField` for share URL display with copy button
- **Concern:** Share functionality is a significant new user-facing feature. The `content-visibility: auto` change improves scroll performance but may cause layout shift during scrolling.

## src/pages/session/review-tab.tsx

**Risk: LOW**

- Removes exported `StickyAddButton` component (inlined into `session-side-panel.tsx`)
- Clean code movement, no behavioral change

## src/pages/session/session-command-helpers.ts

**Risk: LOW**

- **Deleted** — `canAddSelectionContext` inlined into `use-session-commands.tsx`

## src/pages/session/session-layout.ts

**Risk: MEDIUM**

- New file: Exports `useSessionKey` and `useSessionLayout` hooks
- `useSessionKey` derives `dir/id` session key from route params
- `useSessionLayout` provides `params`, `sessionKey`, `tabs`, `view` as a single context
- Centralizes what was previously scattered across many components
- **Concern:** Must be used within routes that have `dir` param — will throw/return empty otherwise. Components using this must ensure they're in the right route context.

## src/pages/session/session-mobile-tabs.tsx

**Risk: LOW**

- **Deleted** — `SessionMobileTabs` component removed, functionality inlined in `session.tsx`

## src/pages/session/session-side-panel.tsx

**Risk: MEDIUM**

- Uses `createSessionTabs` and `useSessionLayout`
- Inlines `StickyAddButton` markup (previously imported from `review-tab.tsx`)
- Simplifies drag overlay path logic
- **Concern:** The inlined `StickyAddButton` adds render weight to this component. Verify it doesn't cause unnecessary re-renders in the side panel.

## src/pages/session/terminal-panel.tsx

**Risk: MEDIUM**

- Removes `createPresence` animation utility — uses direct `opened()` checks
- Removes `byId` Map lookup — uses `all().find()` inline
- Adds viewport height tracking for max panel size calculation
- Adds retry focus logic with RAF + exponential timeouts (0ms, RAF, 120ms, 240ms) to handle focus race conditions
- Restructured to always-mounted `<div>` with `aria-hidden`/`inert` instead of conditional `<Show>`
- Adds `autoFocus` prop to Terminal component
- Terminal panel now has `id="terminal-panel"` for e2e selector targeting
- **Concern:** The retry focus logic is complex and could cause issues with focus management in other parts of the app. The always-mounted approach means terminal WebSocket connections stay alive even when panel is hidden (but `inert` should prevent interaction).

## src/pages/session/use-session-commands.test.ts

**Risk: LOW**

- **Deleted** — Tests for `canAddSelectionContext` removed (helper was inlined)

## src/pages/session/use-session-commands.tsx

**Risk: MEDIUM**

- Major refactor: Flattens multiple command groups into a single `command.register("session", ...)` call
- Uses `createSessionTabs` for active/closable tab logic
- Inlines `canAddSelectionContext`
- Converts several `createMemo` to plain functions
- Adds `useSessionLayout` for centralized state
- Adds `review` accessor to `SessionCommandContext`
- **Concern:** The single flat command array is simpler but harder to maintain for large command sets. Function-based computation instead of `createMemo` means commands are recomputed more frequently.

## src/pages/session/use-session-hash-scroll.ts

**Risk: LOW**

- Removes re-export `export { messageIdFromHash } from "./message-id-from-hash"`
- Clean API surface change

## src/testing/terminal.ts

**Risk: LOW**

- New file: E2E terminal probe utilities
- `terminalProbe(id)` creates a probe object with `init`/`drop`/`connect`/`render`/`settle` methods
- Uses `window.__opencode_e2e` global for cross-boundary communication with Playwright
- `terminalAttr = "data-terminal-id"` constant for DOM identification
- `settle()` uses debounced pattern (clear pending settle, schedule new one at 32ms)
- Exports `E2EWindow` type for use in test fixtures
- Zero-cost when `__opencode_e2e` is not initialized (early returns on all methods)

## src/utils/dom.ts

**Risk: LOW**

- **Deleted** — DOM selection utilities (`getCharacterOffsetInLine`, `getNodeOffsetInLine`, `getSelectionInContainer`)
- These were likely unused or moved elsewhere

## src/utils/index.ts

**Risk: LOW**

- **Deleted** — Was a single re-export of `./dom`

## src/utils/server-health.ts

**Risk: LOW**

- Adds `useCheckServerHealth()` hook that captures `platform.fetch` and returns a bound `checkServerHealth` function
- Eliminates the need to thread `fetcher` through component props
- Clean improvement following React/SolidJS hook patterns

## src/utils/speech.ts

**Risk: LOW**

- **Deleted** — 326-line speech recognition utility removed
- Used Web Speech API for voice input with interim/final result handling, commit delays, and shrink detection
- **Concern:** If speech recognition was used anywhere, this is a feature regression. Verify no consumers remain.

---

## Summary

### High Risk

- `src/context/sync.tsx` — Complex multi-stage session sync with prefetch integration
- `src/pages/layout.tsx` — Prefetching rewrite with span-4 warming, dedup, and eviction
- `src/pages/session.tsx` — Followup queue, auto-fill, stale prefetch detection, terminal focus changes

### Medium Risk

- `src/app.tsx` — ConnectionGate with Effect library, new error UI
- `src/components/dialog-custom-provider.tsx` — Store shape refactor
- `src/components/dialog-select-file.tsx` — useSessionLayout dependency
- `src/components/dialog-select-server.tsx` — Default server key API rename
- `src/components/prompt-input.tsx` — IME handling, queue/edit props
- `src/components/prompt-input/submit.ts` — Dual send path (immediate vs queued)
- `src/components/settings-general.tsx` — Settings layout restructure
- `src/components/terminal.tsx` — Testing probes on every write
- `src/context/layout.tsx` — Review path toggle with `this` binding
- `src/context/global-sync/session-prefetch.ts` — Module-level mutable state
- `src/context/terminal.tsx` — Migration at deserialization time
- `src/entry.tsx` — Server URL vs key separation
- `src/pages/layout/helpers.ts` — New createSessionTabs abstraction
- `src/pages/layout/sidebar-items.tsx` — Aggressive prefetch warming
- `src/pages/layout/sidebar-workspace.tsx` — navList propagation
- `src/pages/session/composer/session-composer-region.tsx` — Two new dock components
- `src/pages/session/composer/session-composer-state.ts` — Stale todo clearing logic
- `src/pages/session/composer/session-followup-dock.tsx` — New queued message UI
- `src/pages/session/composer/session-revert-dock.tsx` — New revert message UI
- `src/pages/session/message-timeline.tsx` — Share feature, content-visibility
- `src/pages/session/session-layout.ts` — New centralized session layout hook
- `src/pages/session/session-side-panel.tsx` — Inlined components
- `src/pages/session/terminal-panel.tsx` — Always-mounted, retry focus
- `src/pages/session/use-session-commands.tsx` — Flattened command registration

### Low Risk

- All e2e files, deleted placeholders, i18n updates, test files, utility deletions, import reshuffling
