# CLI CPU & Memory Usage Audit — March 24–31, 2025

Investigation of changes merged to `main` in the last 7 days that could increase CPU or memory usage in the Kilo CLI runtime (`packages/opencode/`).

---

## Executive Summary

**5 findings** were identified with potential CPU/memory impact, ranked by severity:

| #   | Severity         | Finding                                                                                                 | PR/Commit           |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| 1   | **HIGH**         | Directory tree re-enabled in system prompt — runs `rg --files` on every agent loop step without caching | `03691ebe4` (#7949) |
| 2   | **MEDIUM**       | WebSocket activity watchdog adds a new `setInterval` timer per remote connection                        | `23c7d053f` (#7941) |
| 3   | **LOW-POSITIVE** | MCP listTools caching reduces CPU but introduces an unbounded in-memory Map                             | `2cdf6b61c` (#7922) |
| 4   | **LOW**          | Session import service adds new HTTP endpoints and DB writes during migration                           | `80f187ebb` (#7924) |
| 5   | **LOW**          | Apertis provider addition fetches model list on startup for unconfigured provider                       | `0578a23e9` (#7205) |

Additionally, **3 positive mitigations** were merged that actively reduce CPU/memory:

| #   | Finding                                                                  | PR/Commit                                     |
| --- | ------------------------------------------------------------------------ | --------------------------------------------- |
| A   | MCP listTools caching eliminates redundant RPCs (~300-750ms/step saved)  | `2cdf6b61c` (#7922)                           |
| B   | Strip `summary.diffs` from TUI store to reduce multi-MB memory retention | `6878ddb03` (session-diff-memory-leak branch) |
| C   | TUI store eviction on session navigation prevents unbounded growth       | `1a07ad1a5` (session-diff-memory-leak branch) |

---

## Detailed Findings

### 1. [HIGH] Directory Tree Re-enabled in System Prompt

**Commit:** `03691ebe4` — `fix(cli): restore directory tree in system prompt`
**PR:** #7949
**File:** `packages/opencode/src/session/system.ts`

**What changed:** A `&& false` guard was removed from the condition `project.vcs === "git" && false`, re-enabling `Ripgrep.tree()` calls in the system prompt generation.

**Impact:**

- `Ripgrep.tree()` spawns a child process (`rg --files`) that walks the entire repository.
- It collects ALL file paths into a JS array via `Array.fromAsync()`, then builds a directory tree in memory.
- **This runs on every agent loop step** (every tool call round-trip), not just once per session.
- For a 50K-file project: ~2-5MB transient memory per call, ~10-100ms wall time per call.
- A typical agentic turn with 10 tool calls = 10 ripgrep invocations = ~100ms-1s of CPU time just for directory listing.
- The directory tree is rebuilt identically each time since directories rarely change within a single turn.

**Recommendation:** Cache `Ripgrep.tree()` result per session turn, similar to how `envBlock` is cached in `prompt.ts`. The directory structure does not change within a single agentic loop execution.

**Code location:** `packages/opencode/src/session/system.ts` — the `SystemPrompt.environment()` function, called from the main loop in `packages/opencode/src/session/prompt.ts`.

---

### 2. [MEDIUM] WebSocket Activity Watchdog Timer

**Commit:** `23c7d053f` — `feat(cli): add WebSocket activity watchdog with heartbeat_ack support`
**PR:** #7941
**File:** `packages/opencode/src/kilo-sessions/remote-ws.ts`

**What changed:** A new `setInterval` timer is added per remote WebSocket connection that fires at `Math.min(heartbeat_interval, 30_000)` ms intervals to check for inactivity.

**Impact:**

- Adds a persistent `setInterval` timer per remote connection (default: fires every 5s based on heartbeat interval).
- The timer reads `Date.now()` and compares against last activity — minimal CPU per tick.
- **Properly cleaned up** on `close()`, `onclose`, and `stopWatchdog()`.
- The implementation is correct and well-structured, but adds a new background timer that contributes to CPU wake-ups.

**Assessment:** Low CPU impact per timer tick. The cleanup is thorough. However, the interval fires frequently (every 5s) for what is essentially an inactivity check with a 30s timeout. Consider using a longer check interval (e.g., `timeout / 2` instead of `Math.min(interval, timeout)`).

---

### 3. [LOW-POSITIVE] MCP listTools Cache

**Commit:** `2cdf6b61c` — `perf(cli): cache MCP listTools results to avoid redundant RPCs per loop step`
**PR:** #7922
**File:** `packages/opencode/src/mcp/index.ts`

**What changed:** Added a `Map<string, MCPToolDef[]>` cache for MCP `listTools()` results. Previously, `listTools()` was called for every connected server on every agent loop iteration.

**Impact (positive):**

- **Eliminates 300-750ms of overhead per agent step** for users with multiple MCP servers.
- Massive CPU improvement — this was the single largest per-step overhead for remote MCP servers.

**Impact (concern):**

- The `toolsCache` Map lives on the module-level state and grows with each connected server.
- It stores full tool definition arrays per server — could be several KB per server.
- Cache is properly invalidated on: `ToolListChangedNotification`, server add/connect/disconnect, instance dispose.
- **Not a real concern** — the number of MCP servers is bounded (typically <10) and cache entries are small.

---

### 4. [LOW] Session Import Service

**Commit:** `80f187ebb` — `feat(kilo-vscode): migrate legacy sessions into new extension`
**PR:** #7924
**Files:** `packages/opencode/src/kilocode/session-import/service.ts`, `routes.ts`, `types.ts`

**What changed:** New HTTP endpoints were added to the CLI server for importing legacy sessions from the VS Code extension. These endpoints write directly to SQLite.

**Impact:**

- The import routes are **on-demand only** — they are called by the VS Code extension during one-time migration.
- They do not run in the background or on a timer.
- Each call does a single SQLite insert with `onConflictDoNothing` or `onConflictDoUpdate`.
- **No ongoing CPU/memory impact** after migration is complete.

---

### 5. [LOW] Apertis Provider Model Fetching

**Commit:** `0578a23e9` — `feat/apertis-opencode-provider`
**PR:** #7205
**File:** `packages/opencode/src/provider/models.ts`, `model-cache.ts`

**What changed:** Added Apertis as a new provider with dynamic model fetching from `https://api.apertis.ai/v1/models`.

**Impact:**

- On provider initialization, if no cached Apertis models exist, it fires `ModelCache.refresh("apertis", ...)` as a background `.catch(() => {})` fire-and-forget.
- This happens on every `ModelsDev.all()` call if models are empty.
- The fetch has a 10s timeout via `AbortSignal.timeout(10_000)`.
- For users without an Apertis API key, the fetch silently fails (returns `{}`), but the attempt is still made.

**Recommendation:** Guard the model fetch behind an API key check to avoid unnecessary network requests for users who don't use Apertis.

---

## Positive Changes (Mitigations)

### A. Session Diff Memory Reduction

**Commits:** `6878ddb03`, `1a07ad1a5`, `a3c834040`, `f2dcafc2c`, `24517648b`, `54105335f`
**Branch:** `fix/session-diff-memory-leak`

These commits address a significant memory issue where `summary.diffs` (containing full before/after file contents) were retained in the TUI store:

- `6878ddb03`: Strip `summary.diffs` from messages in TUI store — multi-MB savings per session.
- `1a07ad1a5`: Evict per-session data from TUI store on navigation — prevents unbounded growth.
- `f2dcafc2c`: Strip bloated file contents from tool metadata — fixes session loading perf.
- `24517648b`: Scrub oversized diffs from stored `session_diff` on read.
- `54105335f`: Cap file content at 256 KB in `Snapshot.diffFull()`.

### B. Worker Restart Revert

**Commit:** `5d611d6da` — `revert: remove /new worker/subprocess restart`

The subprocess restart approach for reclaiming native memory was tried and reverted because it did not solve the underlying Bun native memory retention issue (`oven-sh/bun#28318`). The diff-size and store-eviction fixes remain as the primary mitigations.

### C. MCP listTools Caching (see Finding #3)

---

## Changes NOT on `main` (Feature Branches Only)

### Codebase Indexing Feature (NOT merged)

**Commit:** `0fffb5f0a` — `feat: Implement codebase indexing for CLI and new extension`
**Branch:** `remotes/origin/codebase-indexing` (NOT on `main`)

This is a massive change (~23,000 lines) that adds:

- A `@kilocode/kilo-indexing` package with tree-sitter parsing, vector stores (Qdrant, LanceDB), embedding providers
- File watcher, scanner, and orchestrator for background indexing
- New `semantic_search` tool
- `tree-sitter-wasms` dependency (~large WASM binaries)
- Initialization in `packages/opencode/src/project/bootstrap.ts` via `await KiloIndexing.init()`

**If/when merged, this will be the largest CPU/memory impact** of any recent change, as it:

- Adds a file watcher for the entire project
- Runs background file scanning and embedding generation
- Maintains an in-memory or on-disk vector store
- Loads tree-sitter WASM modules for code parsing
- Adds `@kilocode/kilo-indexing` as a new dependency to `packages/opencode/package.json`
- The `KiloIndexing.init()` call in bootstrap is `await`ed, meaning it blocks server startup

**Recommendation:** Before merging, audit startup time impact, ensure indexing can be fully disabled with zero cost, and verify file watcher doesn't consume excessive file descriptors.

---

## Summary of Recommendations

1. **Cache `Ripgrep.tree()` per agent turn** in `SystemPrompt.environment()` to avoid redundant child process spawns (Finding #1).
2. **Consider longer watchdog interval** in `remote-ws.ts` — `timeout / 2` instead of `Math.min(interval, timeout)` (Finding #2).
3. **Guard Apertis model fetch** behind API key check (Finding #5).
4. **Before merging codebase indexing**: audit startup time, file descriptor usage, and verify zero-cost when disabled.
5. **Monitor Bun native memory retention** — the root cause (`oven-sh/bun#28318`) remains unresolved; the store-eviction mitigations are workarounds.
