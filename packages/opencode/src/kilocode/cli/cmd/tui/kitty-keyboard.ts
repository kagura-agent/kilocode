// kilocode_change - new file
//
// Kilo-specific helpers for verifying the Kitty keyboard protocol is active and
// for surfacing a one-time hint when the terminal cannot distinguish Shift+Return
// from Return. Keeps the fix out of shared opencode files to minimise upstream
// merge conflicts.
//
// Background: OpenTUI requests Kitty keyboard support on startup via
// `useKittyKeyboard: {}`. Terminals that honour the request report Return as
// `CSI 13u` and Shift+Return as `CSI 13;2u`, making the two distinguishable.
// Terminals that ignore it (e.g. Apple Terminal.app) send plain `\r` for both,
// so the textarea's `shift+return` → newline binding cannot fire. We can't
// synthesise the modifier inside the process, so the best we can do is tell
// the user to use the universal Ctrl+J fallback (or enable CSI u in their
// terminal preferences).

import { onCleanup } from "solid-js"
import { useRenderer } from "@opentui/solid"
import { useKV } from "@tui/context/kv"
import { useToast } from "@tui/ui/toast"
import { Log } from "@/util/log"

const log = Log.create({ service: "tui.kitty" })

export const KV_KEY = "kilo.shift_enter_hint_shown"
export const GRACE_MS = 500

export const HINT_MESSAGE =
  "Your terminal doesn't appear to support Shift+Enter for newlines. " +
  "Use Ctrl+J or Alt+Enter instead, or enable Kitty keyboard protocol " +
  "(iTerm2 3.5+: Profiles → Keys → Report modifier keys using CSI u)."

/**
 * Inspect an opaque capabilities payload and decide whether the terminal
 * definitely supports the Kitty keyboard protocol. Defensive: when the shape
 * is unknown, returns `undefined` so callers don't show a false-positive hint.
 *
 * The payload comes from native code (`getTerminalCapabilities`) and is typed
 * `any` upstream. Field names observed so far: `osc52` (boolean), `terminal`
 * (object with `name`/`version`). `kittyKeyboard` is the best guess for the
 * flag we care about; accept a few aliases for forward compatibility.
 */
export function hasKittyKeyboardSupport(caps: unknown): boolean | undefined {
  if (!caps || typeof caps !== "object") return undefined
  const obj = caps as Record<string, unknown>
  const direct = obj.kittyKeyboard ?? obj.kitty_keyboard ?? obj.kitty
  if (typeof direct === "boolean") return direct
  if (typeof direct === "number") return direct > 0
  if (typeof direct === "object" && direct !== null) {
    const enabled = (direct as Record<string, unknown>).enabled
    if (typeof enabled === "boolean") return enabled
    const flags = (direct as Record<string, unknown>).flags
    if (typeof flags === "number") return flags > 0
  }
  return undefined
}

// -----------------------------------------------------------------------------
// Core logic — kept pure so it can be unit-tested without SolidJS context.
// -----------------------------------------------------------------------------

type RendererLike = {
  capabilities: unknown
  on(event: "capabilities", handler: (caps: unknown) => void): unknown
  off(event: "capabilities", handler: (caps: unknown) => void): unknown
}

type KvLike = {
  get(key: string, fallback: unknown): unknown
  set(key: string, value: unknown): void
}

type ToastLike = {
  show(options: { variant: string; title?: string; message: string; duration?: number }): void
}

export interface KittyKeyboardCheckOptions {
  renderer: RendererLike
  kv: KvLike
  toast: ToastLike
  graceMs?: number
}

/**
 * Runs the capability check. Returns a dispose function.
 *
 * Shows the hint once (persisted via kv) if the renderer reports no Kitty
 * keyboard support. Stays silent when the shape is unknown to avoid false
 * positives. Idempotent: subsequent capability events and the grace timer
 * cannot re-fire the toast within a single call.
 */
export function runKittyKeyboardCheck(opts: KittyKeyboardCheckOptions): () => void {
  if (opts.kv.get(KV_KEY, false)) {
    log.info("hint.suppressed", { reason: "kv.already_shown" })
    return () => {}
  }

  let decided = false

  function decide(trigger: string) {
    if (decided) return
    const caps = opts.renderer.capabilities
    const support = hasKittyKeyboardSupport(caps)

    if (process.env["KILO_LOG_KEYS"] === "1") {
      log.info("diagnostics", { trigger, capabilities: caps, support })
    }

    // Only show the hint when we have high confidence the terminal does NOT
    // report Kitty keyboard. If the payload shape is unknown we stay silent.
    if (support !== false) return

    decided = true
    opts.kv.set(KV_KEY, true)
    log.info("hint.shown", { trigger })
    opts.toast.show({
      variant: "warning",
      title: "Shift+Enter not detected",
      message: HINT_MESSAGE,
      duration: 10000,
    })
  }

  // Capabilities may already be populated before we subscribe.
  if (opts.renderer.capabilities) decide("initial")

  const handler = () => decide("event")
  opts.renderer.on("capabilities", handler)

  // Final decision after the grace period — if no capability response arrived,
  // the terminal almost certainly does not support CSI u.
  const timer = setTimeout(() => decide("timeout"), opts.graceMs ?? GRACE_MS)

  return () => {
    clearTimeout(timer)
    opts.renderer.off("capabilities", handler)
  }
}

// -----------------------------------------------------------------------------
// SolidJS glue.
// -----------------------------------------------------------------------------

/**
 * Solid hook. Must be called inside a component body (needs Solid owner).
 * Pulls renderer / kv / toast from context and delegates to `runKittyKeyboardCheck`.
 */
export function useKittyKeyboardCheck() {
  const renderer = useRenderer()
  const kv = useKV()
  const toast = useToast()

  const dispose = runKittyKeyboardCheck({
    renderer: renderer as unknown as RendererLike,
    kv,
    toast,
  })
  onCleanup(dispose)
}

/**
 * One-shot diagnostic dump. Gated on `KILO_LOG_KEYS=1`. Logs current renderer
 * state plus the most recent raw input sequences so users can attach logs when
 * reporting Shift+Return regressions.
 */
export function logKeyboardDiagnostics() {
  if (process.env["KILO_LOG_KEYS"] !== "1") return
  const renderer = useRenderer()
  const debug = typeof renderer.getDebugInputs === "function" ? renderer.getDebugInputs() : []
  log.info("diagnostics.startup", {
    useKittyKeyboard: renderer.useKittyKeyboard,
    capabilities: renderer.capabilities,
    recentInputs: debug.slice(-10),
  })
}
