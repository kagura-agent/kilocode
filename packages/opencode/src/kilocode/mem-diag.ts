// kilocode_change - new file
// Temporary memory diagnostics. Logs heap stats + tracked counters every 30s.
// Activate by calling `MemDiag.start()` from the server startup path.
// Remove this file once the memory issue is resolved.
//
// Writes directly to stderr AND the log file to guarantee visibility
// regardless of Log.init() timing or log routing issues.

import { Log } from "../util/log"
import { GlobalBus } from "../bus/global"
import syncfs from "fs"
import path from "path"
import { Global } from "../global"

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

function emit(msg: string) {
  const line = `[mem-diag] ${new Date().toISOString()} ${msg}\n`
  process.stderr.write(line)
  log.info(msg, counters)

  // Also append directly to a dedicated file in case log routing misses it
  try {
    const target = path.join(Global.Path.log, "mem-diag.log")
    syncfs.appendFileSync(target, line)
  } catch {}
}

export namespace MemDiag {
  export function inc(key: string) {
    counters[key] = (counters[key] ?? 0) + 1
  }

  export function start() {
    emit("----------------------------------------")
    emit("----------------------------------------")
    emit("memory diagnostics started")
    emit("----------------------------------------")
    emit("----------------------------------------")

    setInterval(() => {
      const mem = process.memoryUsage()
      const listeners = GlobalBus.listenerCount("event")

      const parts = [
        `heapUsedMB=${Math.round(mem.heapUsed / 1024 / 1024)}`,
        `heapTotalMB=${Math.round(mem.heapTotal / 1024 / 1024)}`,
        `rssMB=${Math.round(mem.rss / 1024 / 1024)}`,
        `externalMB=${Math.round(mem.external / 1024 / 1024)}`,
        `arrayBuffersMB=${Math.round(mem.arrayBuffers / 1024 / 1024)}`,
        `globalBusListeners=${listeners}`,
        ...Object.entries(counters).map(([k, v]) => `${k}=${v}`),
      ]

      emit("----------------------------------------")
      emit("----------------------------------------")
      emit(parts.join(" "))
      emit("----------------------------------------")
      emit("----------------------------------------")
    }, 5_000)
  }
}
