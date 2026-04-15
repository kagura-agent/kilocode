import path from "path"
import { writeHeapSnapshot } from "node:v8"
import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Log } from "@/util/log"

const log = Log.create({ service: "heap" })
const MINUTE = 60_000
const LIMIT = 2 * 1024 * 1024 * 1024

export namespace Heap {
  let timer: Timer | undefined
  let lock = false
  let armed = true

  export function start() {
    // kilocode_change start - periodic memory logging when KILO_PROFILE is set
    if (Flag.KILO_PROFILE) {
      const interval = 30_000
      const profiler = setInterval(() => {
        const mem = process.memoryUsage()
        log.info("memory", {
          rss: +(mem.rss / 1024 / 1024).toFixed(1),
          heap: +(mem.heapUsed / 1024 / 1024).toFixed(1),
          external: +(mem.external / 1024 / 1024).toFixed(1),
          buffers: +(mem.arrayBuffers / 1024 / 1024).toFixed(1),
          pid: process.pid,
        })
      }, interval)
      profiler.unref?.()
      log.info("memory profiling enabled", { interval })
    }
    // kilocode_change end

    if (!Flag.KILO_AUTO_HEAP_SNAPSHOT) return
    if (timer) return

    const run = async () => {
      if (lock) return

      const stat = process.memoryUsage()
      if (stat.rss <= LIMIT) {
        armed = true
        return
      }
      if (!armed) return

      lock = true
      armed = false
      const file = path.join(
        Global.Path.log,
        `heap-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.heapsnapshot`,
      )
      log.warn("heap usage exceeded limit", {
        rss: stat.rss,
        heap: stat.heapUsed,
        file,
      })

      await Promise.resolve()
        .then(() => writeHeapSnapshot(file))
        .catch((err) => {
          log.error("failed to write heap snapshot", {
            error: err instanceof Error ? err.message : String(err),
            file,
          })
        })

      lock = false
    }

    timer = setInterval(() => {
      void run()
    }, MINUTE)
    timer.unref?.()
  }
}
