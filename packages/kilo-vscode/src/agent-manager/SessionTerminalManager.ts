import type { WorktreeStateManager } from "./WorktreeStateManager"

// ---------------------------------------------------------------------------
// TerminalHost — narrow interface for the VS Code capabilities this module
// needs.  Implemented by AgentManagerProvider using the real vscode API.
// ---------------------------------------------------------------------------

export interface TerminalHandle {
  show(preserveFocus: boolean): void
  dispose(): void
  readonly exitStatus: { code?: number } | undefined
}

export interface TerminalHost {
  createTerminal(opts: { cwd: string; name: string; color?: string }): TerminalHandle
  createSplitTerminal(opts: { cwd: string; name: string; color?: string; parent: TerminalHandle }): TerminalHandle
  activeTerminal(): TerminalHandle | undefined
  repoPath(): string | undefined
  showWarning(msg: string): void
  setContext(key: string, value: boolean): void
  onTerminalClosed(cb: (handle: TerminalHandle) => void): Disposable
  onActiveTerminalChanged(cb: (handle: TerminalHandle | undefined) => void): Disposable
  registerCommand(id: string, handler: (...args: unknown[]) => Promise<unknown>): Disposable
  executeCommand(id: string, ...args: unknown[]): Promise<unknown>
}

export interface Disposable {
  dispose(): void
}

// ---------------------------------------------------------------------------
// Terminal group — tracks N terminals per session
// ---------------------------------------------------------------------------

export interface TerminalEntry {
  handle: TerminalHandle
  name: string
  cwd: string
}

export interface TerminalGroup {
  terminals: TerminalEntry[]
  focused: number // index of last-focused terminal
  color: string
}

/** Info about a single terminal, sent to the webview. */
export interface TerminalInfo {
  name: string
  index: number
  active: boolean
}

// Rotating colors assigned to each worktree group
const GROUP_COLORS = [
  "terminal.ansiGreen",
  "terminal.ansiBlue",
  "terminal.ansiYellow",
  "terminal.ansiMagenta",
  "terminal.ansiCyan",
  "terminal.ansiRed",
]

/**
 * Manages terminal groups for agent manager sessions.
 * Each session can have multiple terminals grouped together as split panes.
 * Switching sessions switches to the corresponding terminal group.
 */
export class SessionTerminalManager {
  private static readonly LOCAL_KEY = "__local__"

  private groups = new Map<string, TerminalGroup>()
  private disposables: Disposable[] = []
  private commandHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  private commandDisposables = new Map<string, Disposable>()
  private panelOpen = false
  private colorIndex = 0
  private onChange: ((sessionId: string, terminals: TerminalInfo[]) => void) | undefined

  constructor(
    private log: (msg: string) => void,
    private host: TerminalHost,
  ) {
    this.disposables.push(
      host.onTerminalClosed((terminal) => {
        for (const [sessionId, group] of this.groups) {
          const idx = group.terminals.findIndex((t) => t.handle === terminal)
          if (idx === -1) continue
          group.terminals.splice(idx, 1)
          // Adjust focused index
          if (group.focused >= group.terminals.length) group.focused = Math.max(0, group.terminals.length - 1)
          this.log(`Removed terminal ${idx} from group ${sessionId} (terminal closed)`)
          if (group.terminals.length === 0) {
            this.groups.delete(sessionId)
            this.log(`Removed empty group for session ${sessionId}`)
          }
          this.emitChange(sessionId)
          break
        }
        this.updateContextKey()
      }),
      host.onActiveTerminalChanged((terminal) => {
        if (terminal) {
          this.panelOpen = true
          // Track last-focused terminal within its group
          for (const [, group] of this.groups) {
            const idx = group.terminals.findIndex((t) => t.handle === terminal)
            if (idx !== -1) {
              group.focused = idx
              break
            }
          }
        }
        const managed = terminal ? this.isManaged(terminal) : false
        void host.setContext("kilo-code.agentTerminalFocus", managed)
      }),
    )

    this.registerPanelCommand("workbench.action.togglePanel", () => {
      this.panelOpen = !this.panelOpen
      this.log(`panel visibility toggled via command (open=${this.panelOpen})`)
    })
    this.registerPanelCommand("workbench.action.closePanel", () => {
      this.panelOpen = false
      this.log("panel hidden via command")
    })
    this.registerPanelCommand("workbench.action.focusPanel", () => {
      this.panelOpen = true
      this.log("panel focused via command")
    })
    this.registerPanelCommand("workbench.action.terminal.focus", () => {
      this.panelOpen = true
      this.log("terminal focused via command")
    })
  }

  /** Register a callback for when the terminal list changes for a session. */
  onTerminalListChanged(cb: (sessionId: string, terminals: TerminalInfo[]) => void): void {
    this.onChange = cb
  }

  /**
   * Show (or create) the first terminal for the given session.
   * Resolves CWD from the worktree state, falling back to repo root.
   */
  showTerminal(sessionId: string, state: WorktreeStateManager | undefined): void {
    const group = this.groups.get(sessionId)
    if (group && group.terminals.length > 0) {
      const target = this.focusedEntry(group)
      if (target && target.handle.exitStatus === undefined) {
        target.handle.show(false)
        this.panelOpen = true
        this.updateContextKey()
        return
      }
    }

    const repoPath = this.host.repoPath()
    const worktreePath = state?.directoryFor(sessionId)
    const cwd = worktreePath ?? repoPath

    if (!cwd) {
      this.log(`showTerminal: no cwd resolved for session ${sessionId}`)
      this.host.showWarning("Open a folder that contains a git repository to use worktrees")
      return
    }

    const session = state?.getSession(sessionId)
    const worktree = session?.worktreeId ? state?.getWorktree(session.worktreeId) : undefined
    const label = worktree ? worktree.branch : "local"
    const name = `Agent: ${label}`

    this.addTerminalToGroup(sessionId, cwd, name)
  }

  /**
   * Add a new terminal to an existing session's group (split pane).
   * If no group exists yet, creates a new standalone terminal.
   */
  addTerminal(sessionId: string, state: WorktreeStateManager | undefined, name?: string): void {
    const repoPath = this.host.repoPath()
    const worktreePath = state?.directoryFor(sessionId)
    const cwd = worktreePath ?? repoPath

    if (!cwd) {
      this.log(`addTerminal: no cwd resolved for session ${sessionId}`)
      this.host.showWarning("Open a folder that contains a git repository to use worktrees")
      return
    }

    const session = state?.getSession(sessionId)
    const worktree = session?.worktreeId ? state?.getWorktree(session.worktreeId) : undefined
    const label = worktree ? worktree.branch : "local"
    const group = this.groups.get(sessionId)
    const count = group ? group.terminals.length + 1 : 1
    const terminal = name || `${label} (${count})`

    this.addTerminalToGroup(sessionId, cwd, terminal)
  }

  /**
   * Focus a specific terminal within a session's group by index.
   */
  focusTerminal(sessionId: string, index: number): void {
    const group = this.groups.get(sessionId)
    if (!group) return

    const entry = group.terminals[index]
    if (!entry || entry.handle.exitStatus !== undefined) return

    group.focused = index
    entry.handle.show(false)
    this.panelOpen = true
    this.updateContextKey()
  }

  /**
   * Close a specific terminal within a session's group by index.
   */
  closeTerminal(sessionId: string, index: number): void {
    const group = this.groups.get(sessionId)
    if (!group) return

    const entry = group.terminals[index]
    if (!entry) return

    entry.handle.dispose()
    // The onTerminalClosed callback handles cleanup
  }

  /**
   * Show (or create) a terminal for the local repo (no session required).
   */
  showLocalTerminal(): void {
    const group = this.groups.get(SessionTerminalManager.LOCAL_KEY)
    if (group && group.terminals.length > 0) {
      const target = this.focusedEntry(group)
      if (target && target.handle.exitStatus === undefined) {
        target.handle.show(false)
        this.panelOpen = true
        this.updateContextKey()
        return
      }
    }

    const cwd = this.host.repoPath()
    if (!cwd) {
      this.log("showLocalTerminal: no repo folder open")
      this.host.showWarning("Open a folder to use the local terminal")
      return
    }

    this.addTerminalToGroup(SessionTerminalManager.LOCAL_KEY, cwd, "Agent: local")
  }

  /**
   * Add a new terminal to the local group.
   */
  addLocalTerminal(name?: string): void {
    const cwd = this.host.repoPath()
    if (!cwd) {
      this.log("addLocalTerminal: no repo folder open")
      this.host.showWarning("Open a folder to use the local terminal")
      return
    }

    const group = this.groups.get(SessionTerminalManager.LOCAL_KEY)
    const count = group ? group.terminals.length + 1 : 1
    const label = name || `local (${count})`

    this.addTerminalToGroup(SessionTerminalManager.LOCAL_KEY, cwd, label)
  }

  /**
   * Show the existing local terminal if one was previously created (used on context switch).
   */
  showExistingLocal(): boolean {
    return this.showExisting(SessionTerminalManager.LOCAL_KEY)
  }

  /**
   * Sync terminal on session switch: only switch terminals when panel is open.
   * Shows the last-focused terminal in the session's group.
   */
  syncOnSessionSwitch(sessionId: string): boolean {
    if (!this.panelOpen) {
      this.log(`syncOnSessionSwitch: panel hidden, skipping session ${sessionId}`)
      return false
    }

    return this.showExisting(sessionId)
  }

  /**
   * Sync local terminal on context switch: only switch when panel is open.
   */
  syncLocalOnSessionSwitch(): boolean {
    if (!this.panelOpen) {
      this.log("syncLocalOnSessionSwitch: panel hidden, skipping")
      return false
    }

    return this.showExistingLocal()
  }

  /**
   * Show the last-focused terminal for a session if a group exists.
   * Returns true if the terminal was shown, false if no group exists.
   */
  showExisting(sessionId: string, preserveFocus = true): boolean {
    const group = this.groups.get(sessionId)
    if (!group || group.terminals.length === 0) return false

    // Clean up exited terminals
    this.cleanExited(sessionId, group)
    if (group.terminals.length === 0) return false

    const target = this.focusedEntry(group)
    if (!target) return false

    target.handle.show(preserveFocus)
    this.panelOpen = true
    this.log(`showExisting: revealed terminal ${group.focused} for session ${sessionId}`)
    return true
  }

  /**
   * Check if a session has any active terminal.
   */
  hasTerminal(sessionId: string): boolean {
    const group = this.groups.get(sessionId)
    if (!group) return false
    return group.terminals.some((t) => t.handle.exitStatus === undefined)
  }

  /**
   * Get the terminal list for a session (for sending to webview).
   */
  getTerminals(sessionId: string): TerminalInfo[] {
    const group = this.groups.get(sessionId)
    if (!group) return []
    return group.terminals.map((t, i) => ({
      name: t.name,
      index: i,
      active: i === group.focused,
    }))
  }

  dispose(): void {
    void this.host.setContext("kilo-code.agentTerminalFocus", false)
    for (const group of this.groups.values()) {
      for (const entry of group.terminals) entry.handle.dispose()
    }
    this.groups.clear()
    for (const d of this.commandDisposables.values()) d.dispose()
    this.commandDisposables.clear()
    this.commandHandlers.clear()
    for (const d of this.disposables) d.dispose()
  }

  private registerPanelCommand(id: string, onAfterRun: () => void): void {
    const handler = async (...args: unknown[]) => {
      const result = await this.runOriginalCommand(id, args)
      onAfterRun()
      return result
    }

    this.commandHandlers.set(id, handler)
    this.commandDisposables.set(id, this.host.registerCommand(id, handler))
  }

  private async runOriginalCommand(id: string, args: unknown[]): Promise<unknown> {
    const disposable = this.commandDisposables.get(id)
    if (!disposable) return this.host.executeCommand(id, ...args)

    disposable.dispose()
    this.commandDisposables.delete(id)

    try {
      return await this.host.executeCommand(id, ...args)
    } finally {
      const handler = this.commandHandlers.get(id)
      if (!handler) return
      const replacement = this.host.registerCommand(id, handler)
      this.commandDisposables.set(id, replacement)
    }
  }

  private isManaged(terminal: TerminalHandle): boolean {
    for (const group of this.groups.values()) {
      if (group.terminals.some((t) => t.handle === terminal)) return true
    }
    return false
  }

  private updateContextKey(): void {
    const active = this.host.activeTerminal()
    const managed = active ? this.isManaged(active) : false
    if (active) this.panelOpen = true
    void this.host.setContext("kilo-code.agentTerminalFocus", managed)
  }

  private nextColor(): string {
    const color = GROUP_COLORS[this.colorIndex % GROUP_COLORS.length]
    this.colorIndex++
    return color
  }

  private focusedEntry(group: TerminalGroup): TerminalEntry | undefined {
    return group.terminals[group.focused] ?? group.terminals[0]
  }

  private cleanExited(sessionId: string, group: TerminalGroup): void {
    const before = group.terminals.length
    group.terminals = group.terminals.filter((t) => t.handle.exitStatus === undefined)
    if (group.terminals.length !== before) {
      if (group.focused >= group.terminals.length) group.focused = Math.max(0, group.terminals.length - 1)
      if (group.terminals.length === 0) this.groups.delete(sessionId)
      this.emitChange(sessionId)
    }
  }

  private addTerminalToGroup(sessionId: string, cwd: string, name: string): void {
    let group = this.groups.get(sessionId)

    if (group) {
      // Clean exited terminals first
      this.cleanExited(sessionId, group)
      group = this.groups.get(sessionId) // may have been deleted
    }

    if (!group) {
      // First terminal — create a standalone terminal and a new group
      const color = this.nextColor()
      const handle = this.host.createTerminal({ cwd, name, color })
      group = { terminals: [{ handle, name, cwd }], focused: 0, color }
      this.groups.set(sessionId, group)
      this.log(`created new terminal group for session ${sessionId} (color=${color})`)
    } else {
      // Additional terminal — split alongside the first terminal in the group
      const parent = group.terminals[0]
      const handle = this.host.createSplitTerminal({ cwd, name, color: group.color, parent: parent.handle })
      const idx = group.terminals.length
      group.terminals.push({ handle, name, cwd })
      group.focused = idx
      this.log(`added terminal ${idx} to group ${sessionId}`)
    }

    const target = this.focusedEntry(group)
    if (target) target.handle.show(false)
    this.panelOpen = true
    this.updateContextKey()
    this.emitChange(sessionId)
  }

  private emitChange(sessionId: string): void {
    if (!this.onChange) return
    this.onChange(sessionId, this.getTerminals(sessionId))
  }
}
