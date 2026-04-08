// kilocode_change - new file
import { Log } from "./log"
import { Instance } from "../project/instance"

export namespace ProcessMonitor {
  const log = Log.create({ service: "process-monitor" })
  const POLL_MS = 5_000
  const GRACE_MS = 2_000

  export interface Entry {
    pid: number
    label: string
    subsystem: "mcp" | "lsp" | "formatter"
    limit: number // RSS limit in bytes, 0 = no limit
    onExceeded?: () => void
    onExit?: (code: number | null) => void
  }

  interface Tracked extends Entry {
    warned: boolean
    killing: boolean
    rss: number
  }

  const state = Instance.state(
    () => {
      const entries = new Map<number, Tracked>()
      let active = false
      const timer =
        process.platform !== "win32"
          ? setInterval(() => {
              if (active) return
              active = true
              poll(entries).finally(() => {
                active = false
              })
            }, POLL_MS)
          : undefined
      if (timer) timer.unref()
      return { entries, timer }
    },
    async (s) => {
      if (s.timer) clearInterval(s.timer)
      s.entries.clear()
    },
  )

  export function register(entry: Entry) {
    if (process.platform === "win32") return
    state().entries.set(entry.pid, {
      ...entry,
      warned: false,
      killing: false,
      rss: 0,
    })
    log.info("registered", {
      pid: entry.pid,
      label: entry.label,
      limit: entry.limit > 0 ? Math.round(entry.limit / 1024 / 1024) + "MB" : "none",
    })
  }

  export function unregister(pid: number) {
    if (process.platform === "win32") return
    state().entries.delete(pid)
  }

  export function snapshot() {
    return [...state().entries.values()].map((e) => ({
      pid: e.pid,
      label: e.label,
      subsystem: e.subsystem,
      rss: e.rss,
      limit: e.limit,
    }))
  }

  async function poll(entries: Map<number, Tracked>) {
    if (entries.size === 0) return
    const pids = [...entries.keys()]
    const rss = await getRSS(pids)

    for (const [pid, entry] of entries) {
      if (entry.killing) continue

      const mem = rss.get(pid)
      if (mem === undefined) {
        entries.delete(pid)
        log.info("process gone", { pid, label: entry.label })
        try {
          entry.onExit?.(null)
        } catch {}
        continue
      }

      entry.rss = mem
      if (entry.limit <= 0) continue

      if (mem >= entry.limit * 0.75 && !entry.warned) {
        entry.warned = true
        log.warn("high memory", {
          label: entry.label,
          pid,
          rss: Math.round(mem / 1024 / 1024) + "MB",
          limit: Math.round(entry.limit / 1024 / 1024) + "MB",
        })
      }

      if (mem >= entry.limit) {
        entry.killing = true
        log.error("memory exceeded, killing", {
          label: entry.label,
          pid,
          rss: Math.round(mem / 1024 / 1024) + "MB",
          limit: Math.round(entry.limit / 1024 / 1024) + "MB",
        })
        try {
          entry.onExceeded?.()
        } catch {}
        setTimeout(() => {
          try {
            process.kill(pid, "SIGTERM")
          } catch {}
          setTimeout(() => {
            try {
              process.kill(pid, "SIGKILL")
            } catch {}
            entries.delete(pid)
            try {
              entry.onExit?.(null)
            } catch {}
          }, GRACE_MS)
        }, GRACE_MS)
      }
    }
  }

  async function getRSS(pids: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>()
    if (pids.length === 0) return result

    try {
      const proc = Bun.spawn(["ps", "-o", "pid=,rss=", "-p", pids.join(",")], {
        stdout: "pipe",
        stderr: "pipe",
      })
      const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()]).catch(
        () => [-1, ""] as const,
      )

      // If ps fails with multiple PIDs (some may have exited), query individually
      if (code !== 0 && pids.length > 1) {
        for (const pid of pids) {
          const one = await getRSS([pid])
          for (const [k, v] of one) result.set(k, v)
        }
        return result
      }

      for (const line of out.trim().split("\n")) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 2) continue
        const p = parseInt(parts[0], 10)
        const kb = parseInt(parts[1], 10)
        if (!isNaN(p) && !isNaN(kb)) result.set(p, kb * 1024) // KB to bytes
      }
    } catch (err) {
      log.error("rss query failed", { error: err })
    }

    return result
  }
}
