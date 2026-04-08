// kilocode_change - new file
// Minimal Effect-scoped git runner for testing deterministic process cleanup.
// Used only by WorktreeDiff.summary() to validate whether Bun $ shell buffering
// is the source of memory growth during gitstatspoller polling.
import * as Effect from "effect/Effect"
import { spawn } from "child_process"
import { buffer } from "node:stream/consumers"

interface GitResult {
  code: number
  text: string
  stderr: string
}

export function git(args: string[], cwd: string): Effect.Effect<GitResult> {
  return Effect.scoped(
    Effect.gen(function* () {
      const proc = yield* Effect.acquireRelease(
        Effect.sync(() =>
          spawn("git", args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
          }),
        ),
        (p) =>
          Effect.sync(() => {
            if (p.exitCode === null && p.signalCode === null) p.kill()
          }),
      )

      const result = yield* Effect.promise(() =>
        Promise.all([
          new Promise<number>((resolve) => {
            proc.once("exit", (c) => resolve(c ?? 1))
            proc.once("error", () => resolve(1))
          }),
          buffer(proc.stdout!),
          buffer(proc.stderr!),
        ]),
      )

      return {
        code: result[0],
        text: result[1].toString(),
        stderr: result[2].toString(),
      }
    }),
  )
}
