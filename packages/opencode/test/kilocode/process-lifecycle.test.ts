import { describe, expect, test } from "bun:test"
import { ProcessLifecycle } from "../../src/kilocode/process-lifecycle"

describe("kilocode/process-lifecycle", () => {
  test("detects a live parent", () => {
    expect(
      ProcessLifecycle.parentGone({
        parent: 42,
        ppid: 42,
        kill: () => true,
      }),
    ).toBe(false)
  })

  test("detects parent pid changes", () => {
    expect(
      ProcessLifecycle.parentGone({
        parent: 42,
        ppid: 1,
        kill: () => true,
      }),
    ).toBe(true)
  })

  test("detects a missing parent from ESRCH", () => {
    expect(
      ProcessLifecycle.parentGone({
        parent: 42,
        ppid: 42,
        kill: () => {
          const err = new Error("missing") as NodeJS.ErrnoException
          err.code = "ESRCH"
          throw err
        },
      }),
    ).toBe(true)
  })

  test("treats permission errors as live parents", () => {
    expect(
      ProcessLifecycle.parentGone({
        parent: 42,
        ppid: 42,
        kill: () => {
          const err = new Error("denied") as NodeJS.ErrnoException
          err.code = "EPERM"
          throw err
        },
      }),
    ).toBe(false)
  })

  test("runs once-wrapped async work only once", async () => {
    const state = { calls: 0 }
    const fn = ProcessLifecycle.once(async () => {
      state.calls++
    })

    await Promise.all([fn(), fn(), fn()])
    expect(state.calls).toBe(1)
  })

  test("backs off with jitter and respects cap", () => {
    const result = ProcessLifecycle.nextBackoff(250)
    expect(result).toBeGreaterThanOrEqual(250)
    expect(result).toBeLessThanOrEqual(500)

    const capped = ProcessLifecycle.nextBackoff(60_000)
    expect(capped).toBeGreaterThanOrEqual(30_000)
    expect(capped).toBeLessThanOrEqual(60_000)
  })

  test("abortable sleep resolves before its timer", async () => {
    const abort = new AbortController()
    const started = Date.now()
    const pending = ProcessLifecycle.sleep(1000, abort.signal)

    abort.abort()
    await pending

    expect(Date.now() - started).toBeLessThan(250)
  })

  test("watchParent fires onExit when parent is gone", async () => {
    const state = { exited: false, tick: 0 }
    const unwatch = ProcessLifecycle.watchParent({
      onExit: () => {
        state.exited = true
      },
      interval: 10,
      parent: 42,
      ppid: () => {
        state.tick++
        return state.tick >= 2 ? 1 : 42
      },
    })

    await Bun.sleep(100)
    unwatch()

    expect(state.exited).toBe(true)
  })

  test("watchParent unwatch stops polling", async () => {
    const state = { calls: 0 }
    const unwatch = ProcessLifecycle.watchParent({
      onExit: () => {
        state.calls++
      },
      interval: 10,
      parent: 42,
      ppid: () => 42,
    })

    unwatch()
    await Bun.sleep(50)

    expect(state.calls).toBe(0)
  })

  test("forceExit can be cancelled", async () => {
    const state = { exited: false }
    const cancel = ProcessLifecycle.forceExit({
      timeout: 1,
      exit: () => {
        state.exited = true
      },
    })

    cancel()
    await Bun.sleep(20)

    expect(state.exited).toBe(false)
  })
})
