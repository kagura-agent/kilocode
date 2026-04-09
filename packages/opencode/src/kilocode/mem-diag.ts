// kilocode_change - new file
// Temporary memory diagnostics. Logs heap stats + tracked counters every 30s.
// Activate by calling `MemDiag.start()` from the server startup path.
// Remove this file once the memory issue is resolved.

import { Log } from "../util/log"
import { GlobalBus } from "../bus/global"

const log = Log.create({ service: "mem-diag" })

// Tracked counters — other modules increment these
const counters: Record<string, number> = {
  "sse.instance.open": 0,
  "sse.instance.closed": 0,
  "sse.global.open": 0,
  "sse.global.closed": 0,
  "sse.workspace.open": 0,
  "sse.workspace.closed": 0,
  "diffSummary.calls": 0,
}

export namespace MemDiag {
  export function inc(key: string) {
    counters[key] = (counters[key] ?? 0) + 1
  }

  export function start() {
    log.info("memory diagnostics started")

    setInterval(() => {
      const mem = process.memoryUsage()
      const globalListeners = GlobalBus.listenerCount("event")

      log.info("mem-snapshot", {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        arrayBuffersMB: Math.round(mem.arrayBuffers / 1024 / 1024),
        globalBusListeners: globalListeners,
        ...counters,
      })
    }, 30_000).unref()
  }
}
