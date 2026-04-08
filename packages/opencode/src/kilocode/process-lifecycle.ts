export namespace ProcessLifecycle {
  export type Kill = (pid: number, signal?: NodeJS.Signals | 0) => boolean

  export function nextBackoff(delay: number, max = 60_000) {
    return Math.min(delay * 2, max)
  }

  export function once(fn: () => void | Promise<void>) {
    const state: { promise?: Promise<void> } = {}
    return () => {
      if (!state.promise) state.promise = Promise.resolve(fn())
      return state.promise
    }
  }

  export function parentGone(input: { parent: number; ppid?: number; kill?: Kill }) {
    const ppid = input.ppid ?? process.ppid
    if (ppid !== input.parent) return true
    if (input.parent === 1) return false

    const kill = input.kill ?? process.kill
    try {
      kill(input.parent, 0)
      return false
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return code === "ESRCH"
    }
  }

  export function watchParent(input: { onExit: () => void; interval?: number; parent?: number; ppid?: () => number }) {
    const parent = input.parent ?? process.ppid
    const timer = setInterval(() => {
      if (!parentGone({ parent, ppid: input.ppid?.() })) return
      clearInterval(timer)
      input.onExit()
    }, input.interval ?? 1000)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  export function forceExit(input: { timeout?: number; code?: number; exit?: (code?: number) => void }) {
    const timer = setTimeout(() => {
      const exit = input.exit ?? process.exit
      exit(input.code ?? 1)
    }, input.timeout ?? 10_000)
    timer.unref?.()
    return () => clearTimeout(timer)
  }

  export function sleep(delay: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(done, delay)
      timer.unref?.()

      function done() {
        clearTimeout(timer)
        signal?.removeEventListener("abort", done)
        resolve()
      }

      if (signal?.aborted) {
        done()
        return
      }

      signal?.addEventListener("abort", done, { once: true })
    })
  }
}
