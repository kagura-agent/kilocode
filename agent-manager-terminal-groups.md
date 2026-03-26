# Agent Manager: Terminal Groups per Worktree

## Feasibility Analysis

### Can VS Code group terminals per worktree? Yes.

The VS Code Terminal API has full support for what we need via `TerminalSplitLocationOptions`:

```ts
vscode.window.createTerminal({
  name: "dev server",
  cwd: "/path/to/worktree",
  location: { parentTerminal: existingTerminal }, // TerminalSplitLocationOptions
})
```

When you pass `location: { parentTerminal }`, the new terminal is created as a **split pane** in the same terminal group as `parentTerminal`. This is the VS Code equivalent of "terminal groups" — terminals sharing a horizontal split in the panel.

### Key API capabilities

| Capability                         | API                                                               | Status                               |
| ---------------------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| Create terminal in a group (split) | `createTerminal({ location: { parentTerminal } })`                | Stable since VS Code 1.60 (Aug 2021) |
| Create standalone terminal         | `createTerminal({ name, cwd })`                                   | Stable                               |
| Color-code terminal tab            | `createTerminal({ color: new ThemeColor("terminal.ansiGreen") })` | Stable                               |
| Custom icon per terminal           | `createTerminal({ iconPath })`                                    | Stable                               |
| Show/focus a specific terminal     | `terminal.show(preserveFocus)`                                    | Stable                               |
| Hide terminal from user            | `createTerminal({ hideFromUser: true })`                          | Stable                               |
| Detect terminal close              | `onDidCloseTerminal`                                              | Stable                               |
| Detect active terminal change      | `onDidChangeActiveTerminal`                                       | Stable                               |
| List all terminals                 | `vscode.window.terminals`                                         | Stable                               |
| Send text to terminal              | `terminal.sendText(text)`                                         | Stable                               |
| Terminal name (read-only)          | `terminal.name`                                                   | Stable                               |

### What VS Code does NOT have

1. **No "select group" API** — You can't programmatically say "focus this terminal group." You can only `.show()` a specific terminal within a group, which brings that group into view and focuses that terminal.
2. **No "move terminal to group" API** — Once created, a terminal can't be programmatically moved between groups. You'd need to dispose and recreate.
3. **No terminal content read API** — You can't read what's displayed in a terminal (only the clipboard hack).
4. **No group enumeration API** — You can't ask "which terminals are in which group." You only get a flat `vscode.window.terminals` array.

### Workaround for group tracking

Since VS Code doesn't expose group membership, we track it ourselves. We know which terminals belong to which group because _we created them_. The `SessionTerminalManager` already maintains a `Map<sessionId, terminal>` — we extend this to `Map<sessionId, TerminalHandle[]>` and track which terminal in each group was last focused.

---

## Design Concept

### Data model change

Current (1 terminal per session):

```
Map<sessionId, { terminal: TerminalHandle; cwd: string }>
```

New (N terminals per session, grouped):

```
Map<sessionId, {
  terminals: Array<{ handle: TerminalHandle; name: string; cwd: string }>
  lastFocused: number  // index into terminals array
}>
```

### Terminal creation flow

**First terminal for a session** — created as a standalone terminal (no split):

```ts
const first = vscode.window.createTerminal({
  name: "feature-xyz", // branch name as group label
  cwd: worktreePath,
  color: assignedColor, // unique color per worktree
  iconPath: new ThemeIcon("terminal"),
})
```

**Additional terminals in the same session** — created as splits of the first:

```ts
const additional = vscode.window.createTerminal({
  name: "dev server",
  cwd: worktreePath,
  location: { parentTerminal: first }, // joins the group
  color: assignedColor, // same color as group
})
```

This creates a visual group in VS Code's terminal panel:

```
┌─ Terminal Groups ──────────────────────────────────┐
│ 🟢 feature-xyz      │  🟢 dev server              │  ← worktree A group
├──────────────────────┴─────────────────────────────┤
│ 🔵 fix-bug-123      │  🔵 storybook   │ 🔵 tests  │  ← worktree B group
├──────────────────────┴──────────────────┴──────────┤
│ ⚪ local                                            │  ← local (no worktree)
└────────────────────────────────────────────────────┘
```

### Session switch behavior

When the user switches between sessions in the Agent Manager:

1. Find the terminal group for the new session
2. Find the `lastFocused` terminal in that group
3. Call `lastFocused.show(false)` — this brings the entire group into view and focuses the remembered terminal

This is the critical piece: **`.show()` on any terminal in a group brings the whole group into view.** So we get "switch to the right terminal group" for free.

### TerminalHost interface changes

```ts
export interface TerminalHost {
  // Existing
  createTerminal(opts: { cwd: string; name: string }): TerminalHandle

  // New: create a terminal split alongside an existing one (same group)
  createSplitTerminal(opts: { cwd: string; name: string; parent: TerminalHandle }): TerminalHandle
}
```

The `terminal-host.ts` implementation:

```ts
createSplitTerminal: (opts) =>
  wrap(
    vscode.window.createTerminal({
      cwd: opts.cwd,
      name: opts.name,
      iconPath: new vscode.ThemeIcon("terminal"),
      location: { parentTerminal: unwrap(opts.parent) },  // needs reverse mapping
    }),
  ),
```

This requires the host to maintain a reverse mapping from `TerminalHandle` → `vscode.Terminal` (currently only forward mapping exists via `WeakMap`). Solvable by storing both directions, or by attaching the raw terminal to the handle.

### Webview UI: Terminal management panel

The webview needs a way to:

1. **See** which terminals exist for the current session
2. **Add** a new terminal to the current session's group
3. **Focus** a specific terminal in the group
4. **Remove/close** a terminal
5. **Rename** a terminal (optional, stretch)

Proposed UI location: A small terminal list in the Agent Manager, below the session tabs or in a collapsible section:

```
┌─ Session: feature-xyz ──────────────────────────────┐
│ [Chat messages...]                                    │
│                                                       │
├─ Terminals ──────────────────────────────────────────┤
│  ▶ feature-xyz (shell)          [x]                   │
│    dev server                   [x]                   │
│    storybook                    [x]                   │
│                              [+ New Terminal]          │
└───────────────────────────────────────────────────────┘
```

The `▶` indicator shows which terminal is currently focused. Clicking a terminal name calls `.show()` on it. The `[+ New Terminal]` button creates a split in the group.

### Message protocol (webview ↔ extension)

New messages:

| Direction     | Message                            | Payload                                             |
| ------------- | ---------------------------------- | --------------------------------------------------- |
| webview → ext | `agentManager.addTerminal`         | `{ sessionId, name? }`                              |
| webview → ext | `agentManager.focusTerminal`       | `{ sessionId, index }`                              |
| webview → ext | `agentManager.closeTerminal`       | `{ sessionId, index }`                              |
| ext → webview | `agentManager.terminalListUpdated` | `{ sessionId, terminals: Array<{ name, active }> }` |

### Color coding

Assign each worktree a distinct terminal color from `terminal.ansi*` theme colors:

```ts
const WORKTREE_COLORS = [
  "terminal.ansiGreen",
  "terminal.ansiBlue",
  "terminal.ansiYellow",
  "terminal.ansiMagenta",
  "terminal.ansiCyan",
  "terminal.ansiRed",
]
```

All terminals in the same group share the same color. This gives visual distinction in the VS Code terminal tab list even outside the Agent Manager.

### Tracking last-focused terminal per group

Use `onDidChangeActiveTerminal` to track which terminal was last focused per session:

```ts
host.onActiveTerminalChanged((terminal) => {
  if (!terminal) return
  for (const [sessionId, group] of this.groups) {
    const idx = group.terminals.findIndex((t) => t.handle === terminal)
    if (idx !== -1) {
      group.lastFocused = idx
      break
    }
  }
})
```

When switching sessions, restore the last-focused terminal:

```ts
syncOnSessionSwitch(sessionId: string): boolean {
  const group = this.groups.get(sessionId)
  if (!group || !this.panelOpen) return false
  const target = group.terminals[group.lastFocused] ?? group.terminals[0]
  target.handle.show(true)
  return true
}
```

---

## Implementation plan

### Phase 1: Multi-terminal groups (backend)

- Refactor `SessionTerminalManager` data structure from single terminal to terminal array per session
- Add `createSplitTerminal` to `TerminalHost` interface and `terminal-host.ts`
- Track `lastFocused` per session group
- Wire session switch to restore last-focused terminal in group
- Add color coding per worktree

### Phase 2: Webview terminal list UI

- Add terminal list component to Agent Manager webview
- New messages: `addTerminal`, `focusTerminal`, `closeTerminal`, `terminalListUpdated`
- Show active indicator, allow clicking to focus
- "New Terminal" button

### Phase 3: Setup script integration

- Allow setup scripts to declare terminals (e.g., "run dev server in terminal 1, run storybook in terminal 2")
- Auto-create terminal groups on session start based on script config
- Write port numbers to a file so the agent knows which port the app is on

### Phase 4: Terminal commands via sendText (optional)

- Allow the setup script or webview to send commands to specific terminals
- This would enable "start dev server automatically in one terminal, run tests in another"
- Currently blocked by arch test that forbids `sendText` — would need policy discussion

---

## Summary

| Question                                     | Answer                                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Can we have multiple terminals per worktree? | Yes, using `TerminalSplitLocationOptions`                                                                 |
| Can we group them visually?                  | Yes, splits create visual groups in VS Code's terminal panel                                              |
| Can we switch groups on session switch?      | Yes, `.show()` on any terminal in a group brings the whole group into view                                |
| Can we remember the last-focused terminal?   | Yes, via `onDidChangeActiveTerminal` tracking                                                             |
| Can we color-code per worktree?              | Yes, via `ThemeColor("terminal.ansi*")`                                                                   |
| Can we manage terminals from the UI?         | Yes, via new webview messages and a terminal list component                                               |
| Major limitation?                            | No API to enumerate existing groups or move terminals between groups — we must track everything ourselves |
