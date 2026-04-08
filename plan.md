# Per-Edit Revert

## Approach

Add per-tool-call revert using existing step-start snapshots. No changes to upstream files — all core logic lives in `src/kilocode/`, UI work in `packages/kilo-vscode/`.

## How It Works

Each `step-start` part already records a snapshot hash (the worktree state before any tools in that step run). Each tool part's `state.input` contains the files it modified. To revert a specific tool call:

1. Find the tool part and its parent `step-start` snapshot hash
2. Restore only the files that tool touched from that snapshot via `git checkout <hash> -- <file>`
3. Set session revert state with the tool part as the boundary

**Edge case**: Two tools in the same step editing the same file can't be independently reverted (the snapshot predates both). This is rare in practice.

## UI Pattern (from legacy `kilocode-legacy`)

Replicate the `CheckpointSaved` divider pattern from the legacy project. Between each file-modifying tool call in the chat, render a **horizontal checkpoint line**:

- **Default**: 40% opacity, subtle gradient line using `--vscode-editorGroup-border`
- **Hover**: Fade to 100% opacity, reveal action buttons
- **Layout**: `[GitCommitVertical icon] [label] [---gradient line---] [action buttons]`
- **Actions on hover**:
  - **Restore** — revert files to this checkpoint (calls the per-tool revert endpoint)
  - **View Diff** — show what changed since this point (optional, stretch goal)

The line renders between consecutive tool call parts that modify files (not between read-only tools or text parts). It acts as a visual "you can go back to here" marker.

Reference files in legacy:

- `kilocode-legacy/webview-ui/src/components/chat/checkpoints/CheckpointSaved.tsx` — divider component
- `kilocode-legacy/webview-ui/src/components/chat/checkpoints/CheckpointMenu.tsx` — hover action buttons

## Core Changes

### 1. `packages/opencode/src/kilocode/tool-revert.ts` (new file)

Kilocode-specific per-tool revert logic:

- `revert(sessionID, toolPartID)` — walks parts to find the tool, finds its step-start snapshot hash, extracts target files from `state.input`, restores them via `git checkout`, sets `Session.setRevert()` with `partID`
- `unrevert` — delegates to existing `SessionRevert.unrevert()`
- `cleanup` — delegates to existing `SessionRevert.cleanup()`
- Needs a helper to extract file paths from tool input (map tool name → input field: `file_edit` → `filePath`, `file_write` → `filePath`, `bash` → skip, etc.)

### 2. `packages/opencode/src/server/routes/session.ts` (kilocode_change)

Small marker change: when the revert endpoint receives a `partID` that points to a tool part (not a patch part), route to the kilocode tool-revert logic instead of `SessionRevert.revert()`.

Alternatively, add a separate kilocode route `/session/:id/revert-tool` to avoid touching the shared route at all.

## Extension Changes

### 3. New component: `CheckpointDivider`

New SolidJS component in `packages/kilo-vscode/webview-ui/src/components/chat/` (or in `packages/kilo-ui/`). Replicates the legacy `CheckpointSaved` pattern:

```
┌──────────────────────────────────────────────────────┐
│  ○  Checkpoint  ─────────────────────  [Restore]     │
│     (40% opacity, buttons hidden until hover)        │
└──────────────────────────────────────────────────────┘
```

- Receives `messageID`, `partID`, and `onRevert` callback as props
- Rendered between file-modifying tool parts in the turn layout

### 4. `packages/kilo-vscode/webview-ui/src/components/chat/VscodeSessionTurn.tsx`

Insert `CheckpointDivider` between tool call parts. For each completed tool part where the tool is a file-modifying tool (`file_edit`, `file_write`), render a divider after it. Wire `onRevert` to call `session.revertSession(messageID, partID)`.

### 5. `packages/kilo-vscode/webview-ui/src/context/session.tsx`

Update `revertSession(messageID, partID?)` to accept and forward `partID`.

### 6. `packages/kilo-vscode/webview-ui/src/types/messages.ts`

Add `partID?: string` to `RevertSessionRequest`.

### 7. `packages/kilo-vscode/src/KiloProvider.ts`

Pass `partID` through `handleRevertSession` → SDK call.

### 8. `packages/kilo-vscode/webview-ui/src/components/chat/MessageList.tsx`

When reverted to a `partID`, show the message but visually dim/grey-out tool parts after the revert boundary instead of hiding the entire message.

### 9. `packages/kilo-vscode/webview-ui/src/components/chat/RevertBanner.tsx`

Update reverted count and redo logic to work with part-level boundaries (step forward/back by tool part, not by message).

## Testing

### Unit tests (`packages/opencode/test/kilocode/`)

**`tool-revert.test.ts`** — test the core per-tool revert logic:

- Create a session with multiple messages, each containing multiple tool parts and step-start/finish parts
- Test `revert(sessionID, toolPartID)`:
  - Verify correct step-start snapshot hash is found for a given tool part
  - Verify correct files are extracted from tool input
  - Verify session revert state is set with the right `partID` and `messageID`
  - Verify files on disk are restored from the snapshot
- Test reverting the 2nd of 3 tool calls in a step — files from tools 2 and 3 are reverted, tool 1's changes preserved
- Test reverting across step boundaries — patches from later steps are also collected and reverted
- Test `unrevert` restores all files
- Test `cleanup` deletes the correct parts from the DB (parts after the boundary)
- Test edge case: two tools editing the same file in one step

Follow the existing pattern in `packages/opencode/test/session/revert-compact.test.ts` — use `tmpdir({ git: true })`, `Instance.provide()`, real `Session.create()` + `Session.updatePart()`.

### Storybook stories (`packages/kilo-vscode/webview-ui/src/stories/`)

**`checkpoint-divider.stories.tsx`** — visual states for the new `CheckpointDivider` component:

- Default state (subtle, 40% opacity)
- Hover state (full opacity, action buttons visible)
- Disabled state (agent busy)
- In reverted context (after revert boundary, greyed out)

**Update `chat.stories.tsx`** — add a story variant showing a conversation with checkpoint dividers between tool calls, including the reverted state with the `RevertBanner` visible and parts after the boundary dimmed.

These stories automatically get picked up by the Playwright visual regression suite.

### Bun unit tests (`packages/kilo-vscode/tests/unit/`)

**`tool-revert-utils.test.ts`** — test pure helper functions:

- File path extraction from tool input (tool name → file path mapping)
- Identifying which tool parts are file-modifying
- Computing reverted part count for a given `partID` boundary
- Finding the next/previous revert point for redo/undo stepping

## File-Path Extraction Map

Tool parts store their input in `state.input`. Map of tool name → file path field(s):

| Tool          | Input field | Notes                       |
| ------------- | ----------- | --------------------------- |
| `edit`        | `filePath`  | Single file                 |
| `write`       | `filePath`  | Single file                 |
| `multiedit`   | `filePath`  | Single file                 |
| `apply_patch` | `filePath`  | Single file                 |
| `read`        | —           | Read-only, skip             |
| `bash`        | —           | Can't determine files, skip |
| `glob`        | —           | Read-only, skip             |
| `grep`        | —           | Read-only, skip             |

Only render checkpoint dividers after tool parts in the map (file-modifying tools).

## Not Changed

- `packages/opencode/src/session/processor.ts` — no per-tool snapshots
- `packages/opencode/src/session/revert.ts` — existing message-level revert untouched
- `packages/opencode/src/snapshot/index.ts` — reuses existing git checkout
- `packages/sdk/js/` — already supports `partID`
