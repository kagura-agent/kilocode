This is an excellent and very thorough PR. It handles several subtle race conditions and cross-platform edge cases correctly. 

### What's working well:
1. **Orphan Process Detection (`ProcessLifecycle`)**:
   - The use of `process.ppid` correctly tracks reparenting on Linux/macOS.
   - The fallback to `process.kill(pid, 0)` flawlessly handles Windows, where `process.ppid` is static but `kill` throws `ESRCH` if the parent is missing.
2. **Process Sleep / Timers**: 
   - Great use of `.unref?.()` on intervals and timeouts. This ensures that the newly added reconnect logic and heartbeats don't artificially keep the Node event loop alive.
3. **SSE Connection Lifecycles**: 
   - Wiring up the stream `onAbort` and catching failures on `stream.writeSSE` ensures the memory leak with stale streams is finally plugged. The 10s heartbeat interval is properly cleaned up.

### Recommendations & Minor Polish

There are a couple of very minor things to consider for maximum robustness:

**1. Prevent hot-looping in `workspace.ts` if the connection is immediately closed**
In `packages/opencode/src/control-plane/workspace.ts`, the exponential backoff is reset to 250ms *immediately* upon a successful HTTP connection:
```typescript
      if (!res || !res.ok || !res.body) {
         // ... handles backoff
      }
      retry.delay = 250 // Reset happens here
      await parseSSE(res.body, stop, (event) => {
```
If an HTTP proxy or a bad server accepts the connection (HTTP 200) but immediately closes the stream without sending events, `workspaceEventLoop` will loop rapidly at 4 requests per second.
**Recommendation**: Move `retry.delay = 250` inside the `parseSSE` callback. This matches the behavior in `tui/worker.ts` and `sdk-sse-adapter.ts`, ensuring the backoff is only reset after a successful event (like the 10s heartbeat) is received:
```typescript
      await parseSSE(res.body, stop, (event) => {
        retry.delay = 250
        GlobalBus.emit("event", { ... })
      })
```

**2. Synchronous throws in `ProcessLifecycle.once`**
In `packages/opencode/src/kilocode/process-lifecycle.ts`:
```typescript
  export function once(fn: () => void | Promise<void>) {
    const state: { promise?: Promise<void> } = {}
    return () => {
      if (!state.promise) state.promise = Promise.resolve(fn())
      return state.promise
    }
  }
```
If `fn()` throws *synchronously* (which isn't the case for current usages since they are all `async`), `Promise.resolve(fn())` will throw an unhandled exception instead of returning a rejected promise.
**Recommendation**: Wrap `fn()` in an async IIFE to guarantee a promise is always caught:
```typescript
      if (!state.promise) state.promise = (async () => fn())()
```

Everything else looks very solid! Great work on hardening the CLI's process boundaries.
