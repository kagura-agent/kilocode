# Memory Profiling

Infrastructure for profiling memory usage in the `kilo serve` backend process, primarily to investigate memory leaks that occur when the Agent Manager is used over extended periods.

## Background

When using the Agent Manager for an hour+ with large diffs between main and worktree branches, the `kilo serve` Bun process can accumulate multiple gigabytes of RSS. This is most severe on Windows, likely due to differences in process/pipe cleanup and memory allocator behavior.

### Suspected causes

| Suspect                            | Why                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun shell `$` stdout buffering** | Git commands use `$\`git diff ...\`.quiet()` which buffers all stdout into a single native buffer (outside V8 heap). Large diffs = large buffers per poll cycle. On Windows, pipe handles may not be released promptly.                                     |
| **Instance cache never shrinks**   | Each worktree directory creates a permanent `InstanceContext` with file watchers, LSP, snapshot git repo, DB connections (`packages/opencode/src/project/instance.ts`). `Instance.dispose()` exists but the extension never calls it for deleted worktrees. |
| **Aggressive diff polling**        | `GitStatsPoller` calls `diffSummary` every 5s per worktree. `WorktreeDiffController` calls `diffFile` every 2.5s. Each poll spawns git processes whose stdout is buffered entirely in memory.                                                               |
| **Effect PubSub unbounded queues** | `PubSub.unbounded()` in `packages/opencode/src/bus/index.ts` — if a subscriber falls behind (stalled SSE connection on Windows), messages queue up indefinitely.                                                                                            |
| **InstanceBootstrap per worktree** | Each worktree gets file watchers, LSP servers, snapshot repos. File watchers on Windows use ReadDirectoryChangesW which may hold more memory.                                                                                                               |

### Important: heap vs native memory

The memory growth is likely **outside the V8 heap** — in Bun's native allocations from child process stdout buffering. V8 heap snapshots capture JS objects but not native buffers. If `/global/debug/memory` shows RSS growing while `heapUsedMB` stays flat, the leak is in native memory and heap snapshots alone won't identify it. OS-level tools (`vmmap` on macOS, `!heap` / Process Explorer on Windows) are needed for that case.

## Quick start

### Launch the extension with profiling

```bash
bun run extension --profile
```

This sets `KILO_PROFILE=1` and `KILO_AUTO_HEAP_SNAPSHOT=1` in the environment. These propagate from the VS Code extension host to the spawned `kilo serve` child process (via `server-manager.ts` which spreads `process.env`).

When profiling is active:

- Memory stats are logged every 30 seconds in the CLI backend logs
- Debug HTTP endpoints are enabled on the `kilo serve` process
- Auto heap snapshots fire when RSS exceeds 2 GB

The Extension Host output channel will print the debug endpoint URLs after the server starts.

### Without the launch script

Set the environment variables manually before launching VS Code:

```bash
KILO_PROFILE=1 KILO_AUTO_HEAP_SNAPSHOT=1 code .
```

## Debug endpoints

All endpoints require `KILO_PROFILE=1` to be set (returns 403 otherwise). They are served on the `kilo serve` HTTP port which is printed in the Extension Host output.

Authentication uses the same basic auth as all other server endpoints. The password is in the `KILO_SERVER_PASSWORD` env var of the `kilo serve` process.

```bash
# Find the password (macOS/Linux)
PASSWORD=$(ps eww $(pgrep -f "kilo serve") | tr ' ' '\n' | grep KILO_SERVER_PASSWORD | cut -d= -f2)
AUTH=$(echo -n "kilo:$PASSWORD" | base64)
PORT=<port from Extension Host output>
```

### GET /global/debug/memory

Returns current `process.memoryUsage()` stats.

```bash
curl -s -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/memory
```

Response:

```json
{
  "rss": 229441536,
  "heapTotal": 136283136,
  "heapUsed": 178550515,
  "external": 77595238,
  "arrayBuffers": 29603240,
  "rssMB": 218.8,
  "heapUsedMB": 170.3,
  "pid": 45130,
  "uptime": 76.8
}
```

- `rss` — total process memory (includes native allocations, V8 heap, etc.)
- `heapUsed` — V8 JS heap usage
- `external` — memory for V8 external allocations (Buffers, etc.)
- `arrayBuffers` — memory for ArrayBuffer and SharedArrayBuffer

If `rssMB` grows but `heapUsedMB` stays flat, the leak is in native memory.

### POST /global/debug/snapshot

Writes a V8 heap snapshot to `~/.local/share/kilo/log/` and returns the file path.

```bash
curl -s -X POST -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/snapshot
```

Response:

```json
{
  "file": "/Users/you/.local/share/kilo/log/heap-45130-20260415T115924468Z.heapsnapshot",
  "rssMB": 1398.1,
  "heapUsedMB": 172.6
}
```

Note: RSS will spike during snapshot creation (V8 serializes the entire heap graph). This is expected and temporary.

### POST /global/debug/gc

Forces garbage collection via `Bun.gc(true)` and reports before/after memory.

```bash
curl -s -X POST -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/gc
```

Response:

```json
{
  "before": { "rssMB": 482.1, "heapUsedMB": 156.2 },
  "after": { "rssMB": 484.1, "heapUsedMB": 156.2 },
  "freedMB": 0.0
}
```

If `freedMB` is 0 and RSS doesn't drop, the retained memory is not JS heap objects.

## Profiling workflow

### 1. Establish a baseline

Start the extension with `--profile`, wait for it to fully initialize, then:

```bash
curl -s -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/memory
curl -s -X POST -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/snapshot
```

### 2. Reproduce the leak

Use the Agent Manager normally — create worktrees, run sessions, especially with branches that have large diffs from main. Wait 30-60 minutes.

### 3. Take comparison measurements

```bash
# Check current memory
curl -s -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/memory

# Force GC to separate JS heap leaks from native leaks
curl -s -X POST -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/gc

# Take comparison snapshot
curl -s -X POST -H "Authorization: Basic $AUTH" http://127.0.0.1:$PORT/global/debug/snapshot
```

### 4. Analyze snapshots

**Chrome DevTools** (best for comparing two snapshots):

1. Open `chrome://inspect` → "Open dedicated DevTools for Node"
2. Memory tab → Load both `.heapsnapshot` files
3. Select the later snapshot → switch to "Comparison" view
4. Sort by "Size Delta" to see which object types grew

**heap-snapshot-toolkit** (already a dev dependency):

```bash
bunx heap-snapshot-toolkit analyze ~/.local/share/kilo/log/heap-*.heapsnapshot
```

### 5. If the leak is native (RSS grows, heap stays flat)

V8 heap snapshots won't help. Use OS-level tools instead:

- **macOS**: `vmmap <pid> | grep MALLOC` — shows native heap regions
- **Windows**: Process Explorer → Properties → Performance → Virtual Size breakdown, or `!heap` in WinDbg
- **Cross-platform**: Track child process count over time — `pgrep -P <kilo_pid> | wc -l` — to check if git processes are accumulating

## Files changed

| File                                                              | What                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/opencode/src/flag/flag.ts`                              | `KILO_PROFILE` env var flag                                                    |
| `packages/opencode/src/cli/heap.ts`                               | Periodic memory logging (every 30s) when `KILO_PROFILE=1`                      |
| `packages/opencode/src/server/routes/global.ts`                   | `/global/debug/memory`, `/global/debug/snapshot`, `/global/debug/gc` endpoints |
| `packages/kilo-vscode/script/launch.ts`                           | `--profile` flag for `bun run extension`                                       |
| `packages/kilo-vscode/src/services/cli-backend/server-manager.ts` | Logs debug endpoint URLs when profiling is active                              |
