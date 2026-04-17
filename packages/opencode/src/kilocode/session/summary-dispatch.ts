// kilocode_change - new file
//
// Tracked dispatcher that wraps the fire-and-forget `SessionSummary.summarize`
// call with a timeout and a cancel hook. Lives here (not inside the shared
// `src/session/summary.ts`) to keep our diff against upstream tiny.
//
// Behaviour summary:
//   - Each summary runs under a fresh AbortController tracked in `inflight`.
//   - A previous in-flight summary for the same sessionID is aborted when a
//     new one starts, preventing pileup across rapid turns.
//   - A wall-clock timeout (default 10s) races against the Effect fiber so we
//     always unwind within a bounded time even on pathological input.
//   - `cancel(sessionID)` fires `ac.abort()`, which is bridged into
//     `Effect.interrupt` via a third racer inside `Effect.raceAllFirst`. That
//     is what makes the ESC path (SessionPrompt.cancel) actually stop the
//     running fiber rather than just dropping the map entry.
//
// The host module owns the Effect runtime (`runPromise`) and hands us a
// reference to `svc.summarize` via the `summarize` callback.

import { Cause, Effect } from "effect"
import { Bus } from "@/bus"
import { Session } from "@/session"
import { MessageID, SessionID } from "@/session/schema"
import { Log } from "@/util/log"

export namespace SummaryDispatch {
  const log = Log.create({ service: "session.summary" })

  export const SUMMARY_TIMEOUT_MS = 10_000

  export interface Input {
    sessionID: SessionID
    messageID: MessageID
  }

  export type RunPromise<S> = <A, Err>(fn: (svc: S) => Effect.Effect<A, Err, any>) => Promise<A>
  export type Summarize<S> = (svc: S, input: Input) => Effect.Effect<void>

  type Tagged = AbortController & { reason?: "superseded" | "cancel" }

  export function create<S>(opts: { runPromise: RunPromise<S>; summarize: Summarize<S> }) {
    const inflight = new Map<SessionID, Tagged>()

    const summarize = (input: Input) => {
      const prev = inflight.get(input.sessionID)
      if (prev) {
        prev.reason = "superseded"
        prev.abort()
      }

      const ac: Tagged = new AbortController()
      inflight.set(input.sessionID, ac)
      const started = Date.now()

      void opts
        .runPromise((svc) =>
          // raceAllFirst with three racers: the real work, a wall-clock
          // timeout, and an AbortSignal bridge. Whichever FINISHES FIRST wins
          // (success, failure, or interrupt — `raceAll` would keep waiting on
          // interrupts), and the other two are interrupted by the Effect
          // runtime. The signal-bridge racer is what makes `cancel(sessionID)`
          // actually stop the fiber instead of just removing the map entry.
          Effect.raceAllFirst([
            opts.summarize(svc, input),
            Effect.sleep(`${SUMMARY_TIMEOUT_MS} millis`).pipe(Effect.andThen(Effect.interrupt)),
            Effect.callback<void>((resume) => {
              if (ac.signal.aborted) {
                resume(Effect.interrupt)
                return
              }
              const onAbort = () => resume(Effect.interrupt)
              ac.signal.addEventListener("abort", onAbort, { once: true })
              return Effect.sync(() => ac.signal.removeEventListener("abort", onAbort))
            }),
          ]).pipe(
            Effect.onInterrupt(() =>
              Effect.sync(() => {
                const elapsed = Date.now() - started
                // Skip the user-facing warning when a newer summarize call
                // replaced this one — that is a normal pipeline event, not
                // a timeout or user cancel.
                if (ac.reason === "superseded") {
                  log.info("summary superseded", { sessionID: input.sessionID, elapsed })
                  return
                }
                log.warn("summary interrupted", { sessionID: input.sessionID, elapsed })
                Bus.publish(Session.Event.Warning, {
                  sessionID: input.sessionID,
                  kind: "summary_truncated",
                  message: `Session summary interrupted after ${elapsed}ms`,
                  details: { elapsed, timeout: SUMMARY_TIMEOUT_MS },
                }).catch(() => {})
              }),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                // Drop the entry only if it is still ours — a newer summarize
                // for the same session may have replaced it already.
                if (inflight.get(input.sessionID) === ac) inflight.delete(input.sessionID)
              }),
            ),
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                // onInterrupt already emitted a warning for the interrupt
                // path. Only emit "summary_failed" for real failures.
                if (Cause.hasInterrupts(cause)) return
                log.warn("summary failed", { sessionID: input.sessionID, cause: String(cause) })
                Bus.publish(Session.Event.Warning, {
                  sessionID: input.sessionID,
                  kind: "summary_failed",
                  message: "Session summary failed",
                }).catch(() => {})
              }),
            ),
          ),
        )
        .catch(() => {})
    }

    async function cancel(sessionID: SessionID) {
      const ac = inflight.get(sessionID)
      if (!ac) return
      ac.reason = "cancel"
      ac.abort()
      inflight.delete(sessionID)
      log.info("summary cancelled", { sessionID })
    }

    return {
      summarize,
      cancel,
    }
  }
}
