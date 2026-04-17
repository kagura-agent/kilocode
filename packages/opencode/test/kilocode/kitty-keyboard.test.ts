import { describe, test, expect } from "bun:test"
import {
  HINT_MESSAGE,
  KV_KEY,
  hasKittyKeyboardSupport,
  runKittyKeyboardCheck,
} from "../../src/kilocode/cli/cmd/tui/kitty-keyboard"

// -----------------------------------------------------------------------------
// Pure decision logic for the opaque capability payload.
// -----------------------------------------------------------------------------

describe("hasKittyKeyboardSupport", () => {
  test("returns undefined for null / non-object payloads", () => {
    expect(hasKittyKeyboardSupport(null)).toBeUndefined()
    expect(hasKittyKeyboardSupport(undefined)).toBeUndefined()
    expect(hasKittyKeyboardSupport("kitty")).toBeUndefined()
    expect(hasKittyKeyboardSupport(42)).toBeUndefined()
  })

  test("reads boolean kittyKeyboard flag", () => {
    expect(hasKittyKeyboardSupport({ kittyKeyboard: true })).toBe(true)
    expect(hasKittyKeyboardSupport({ kittyKeyboard: false })).toBe(false)
  })

  test("accepts snake_case alias", () => {
    expect(hasKittyKeyboardSupport({ kitty_keyboard: true })).toBe(true)
  })

  test("treats numeric flag as truthy-when-positive", () => {
    expect(hasKittyKeyboardSupport({ kittyKeyboard: 3 })).toBe(true)
    expect(hasKittyKeyboardSupport({ kittyKeyboard: 0 })).toBe(false)
  })

  test("unwraps nested { enabled } shape", () => {
    expect(hasKittyKeyboardSupport({ kittyKeyboard: { enabled: true } })).toBe(true)
    expect(hasKittyKeyboardSupport({ kittyKeyboard: { enabled: false } })).toBe(false)
  })

  test("unwraps nested { flags } shape", () => {
    expect(hasKittyKeyboardSupport({ kittyKeyboard: { flags: 3 } })).toBe(true)
    expect(hasKittyKeyboardSupport({ kittyKeyboard: { flags: 0 } })).toBe(false)
  })

  test("returns undefined when the payload has no kitty field", () => {
    expect(hasKittyKeyboardSupport({ osc52: true })).toBeUndefined()
    expect(hasKittyKeyboardSupport({ terminal: { name: "iTerm2" } })).toBeUndefined()
  })
})

// -----------------------------------------------------------------------------
// Hand-rolled stubs — no `createCliRenderer`, no SolidJS context.
// -----------------------------------------------------------------------------

type CapsHandler = (caps: unknown) => void

function makeRenderer(initial: unknown) {
  const listeners = new Set<CapsHandler>()
  const renderer = {
    capabilities: initial,
    on(event: "capabilities", handler: CapsHandler) {
      if (event === "capabilities") listeners.add(handler)
      return renderer
    },
    off(event: "capabilities", handler: CapsHandler) {
      if (event === "capabilities") listeners.delete(handler)
      return renderer
    },
    emit(caps: unknown) {
      renderer.capabilities = caps
      for (const h of [...listeners]) h(caps)
    },
  }
  return renderer
}

function makeKv(initial: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...initial }
  return {
    store,
    get: (key: string, fallback: unknown) => (key in store ? store[key] : fallback),
    set: (key: string, value: unknown) => {
      store[key] = value
    },
  }
}

function makeToast() {
  const calls: Array<{ variant: string; title?: string; message: string; duration?: number }> = []
  return {
    calls,
    show(opts: { variant: string; title?: string; message: string; duration?: number }) {
      calls.push(opts)
    },
  }
}

// -----------------------------------------------------------------------------
// Core runner behaviour.
// -----------------------------------------------------------------------------

describe("runKittyKeyboardCheck", () => {
  test("does not toast when initial capabilities report Kitty support", async () => {
    const renderer = makeRenderer({ kittyKeyboard: true })
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 10 })
    await new Promise((r) => setTimeout(r, 30))
    dispose()

    expect(toast.calls).toHaveLength(0)
    expect(kv.store[KV_KEY]).toBeUndefined()
  })

  test("toasts exactly once when the payload reports no Kitty support", async () => {
    const renderer = makeRenderer({ kittyKeyboard: false })
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 10 })
    await new Promise((r) => setTimeout(r, 30))

    // Re-emit the same event — the hook must not fire again.
    renderer.emit({ kittyKeyboard: false })
    renderer.emit({ kittyKeyboard: true })
    dispose()

    expect(toast.calls).toHaveLength(1)
    expect(toast.calls[0].variant).toBe("warning")
    expect(toast.calls[0].message).toBe(HINT_MESSAGE)
    expect(toast.calls[0].message).toContain("Ctrl+J")
    expect(kv.store[KV_KEY]).toBe(true)
  })

  test("fires after the grace period when no capability response arrives", async () => {
    // Simulates a terminal that never answers the Kitty query (Apple Terminal).
    // `renderer.capabilities` is null throughout → decision falls back to the timer.
    const renderer = makeRenderer(null)
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 10 })

    // Before the grace period: no toast yet.
    await new Promise((r) => setTimeout(r, 2))
    expect(toast.calls).toHaveLength(0)

    // After the grace period: null caps → hasKittyKeyboardSupport returns
    // undefined → the timeout path should NOT toast (defensive behaviour).
    await new Promise((r) => setTimeout(r, 30))
    dispose()
    expect(toast.calls).toHaveLength(0)
  })

  test("honours a capability response that arrives during the grace period", async () => {
    const renderer = makeRenderer(null)
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 50 })

    await new Promise((r) => setTimeout(r, 5))
    renderer.emit({ kittyKeyboard: false })
    await new Promise((r) => setTimeout(r, 80))
    dispose()

    expect(toast.calls).toHaveLength(1)
    expect(kv.store[KV_KEY]).toBe(true)
  })

  test("stays silent when capability shape is unknown (defensive default)", async () => {
    // Mimics a future opentui version that exposes capabilities under a name
    // we don't recognise. We must not show a false-positive hint.
    const renderer = makeRenderer({ something: "else" })
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 10 })
    await new Promise((r) => setTimeout(r, 30))
    dispose()

    expect(toast.calls).toHaveLength(0)
    expect(kv.store[KV_KEY]).toBeUndefined()
  })

  test("suppresses the hint on a subsequent run (persistent kv flag)", async () => {
    // Simulate app restart: kv already has the flag from a previous session.
    const renderer = makeRenderer({ kittyKeyboard: false })
    const kv = makeKv({ [KV_KEY]: true })
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 10 })
    await new Promise((r) => setTimeout(r, 30))
    renderer.emit({ kittyKeyboard: false })
    dispose()

    expect(toast.calls).toHaveLength(0)
  })

  test("dispose removes listeners and cancels the timer", async () => {
    const renderer = makeRenderer(null)
    const kv = makeKv()
    const toast = makeToast()

    const dispose = runKittyKeyboardCheck({ renderer, kv, toast, graceMs: 30 })
    dispose()
    // Even if a late capability event arrives, no toast should fire.
    renderer.emit({ kittyKeyboard: false })
    await new Promise((r) => setTimeout(r, 60))
    expect(toast.calls).toHaveLength(0)
  })
})
