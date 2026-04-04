# Git Process Load Analysis

Tracking issue: #8345

## Problem

Users report heavy system load caused by git processes spawned by the extension.

## Root Cause Analysis

### Polling-Based Git Operations (Highest Impact)

The primary cause is **multiple independent `GitStatsPoller` instances** running on 5-second intervals, each spawning several git processes per cycle.

#### GitStatsPoller (5s interval)

Per poll cycle, the poller runs:

- `git worktree list --porcelain` (presence probe)
- `git rev-parse --abbrev-ref HEAD` (current branch)
- `git rev-parse` variants (tracking/remote resolution, 2-3 calls)
- `git symbolic-ref` (default branch)
- `git rev-list --left-right --count` (ahead/behind for local + each worktree)
- HTTP calls to CLI backend for `diffSummary`, each triggering server-side `git merge-base` + `git diff --numstat` + `git ls-files`
- Conditionally `git fetch` (throttled to 120s per remote)

With 3 worktrees: **~20 git processes every 5 seconds**.

#### Diff Polling (2.5s interval)

Both `AgentManagerProvider` and `DiffViewerProvider` poll diffs at 2.5s intervals, each triggering ~3 server-side git processes.

#### Multiple Simultaneous Pollers

When the Agent Manager is open, up to 3 independent pollers run:

| Poller                             | Starts        | Pauses on hide? | Scope                  |
| ---------------------------------- | ------------- | --------------- | ---------------------- |
| AgentManagerProvider.statsPoller   | Panel open    | No              | Worktree + local stats |
| KiloProvider.statsPoller (sidebar) | Sidebar shown | Yes             | Local stats only       |
| Embedded KiloProvider.statsPoller  | Panel open    | No              | Local stats only       |

The sidebar poller is the only one that pauses when hidden (via `onDidChangeVisibility`). The Agent Manager pollers continue running when the tab is not visible.

### Worst Case Load

With Agent Manager open (3 worktrees) + diff view + sidebar visible:

- ~32 git processes every 5 seconds (~6.4/second)

## Recommendations

1. **Add visibility-based pausing to the Agent Manager panel** — Use `WebviewPanel.onDidChangeViewState` to pause polling when the panel is not visible, matching the sidebar's behavior.

2. **Deduplicate the embedded KiloProvider poller** — The embedded KiloProvider creates a redundant poller for local stats that the Agent Manager's main poller already fetches.

3. **Increase polling intervals or use event-driven updates** — Consider filesystem watchers on `.git/` to trigger updates only on actual changes, with a longer fallback interval (15-30s) for safety.

4. **Add a global git process limiter** — A semaphore or queue to cap concurrent git processes across all pollers.
