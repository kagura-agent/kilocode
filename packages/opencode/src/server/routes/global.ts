import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { streamSSE } from "hono/streaming"
import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { SyncEvent } from "@/sync"
import { GlobalBus } from "@/bus/global"
import { AsyncQueue } from "@/util/queue"
import { Instance } from "../../project/instance"
import { Installation } from "@/installation"
import { Log } from "../../util/log"
import { lazy } from "../../util/lazy"
import { Config } from "../../config/config"
import { errors } from "../error"
import { Flag } from "../../flag/flag" // kilocode_change

const log = Log.create({ service: "server" })

export const GlobalDisposedEvent = BusEvent.define("global.disposed", z.object({}))

async function streamEvents(c: Context, subscribe: (q: AsyncQueue<string | null>) => () => void) {
  return streamSSE(c, async (stream) => {
    const q = new AsyncQueue<string | null>()
    let done = false

    q.push(
      JSON.stringify({
        payload: {
          type: "server.connected",
          properties: {},
        },
      }),
    )

    // Send heartbeat every 10s to prevent stalled proxy streams.
    const heartbeat = setInterval(() => {
      q.push(
        JSON.stringify({
          payload: {
            type: "server.heartbeat",
            properties: {},
          },
        }),
      )
    }, 10_000)

    const stop = () => {
      if (done) return
      done = true
      clearInterval(heartbeat)
      unsub()
      q.push(null)
      log.info("global event disconnected")
    }

    const unsub = subscribe(q)

    stream.onAbort(stop)

    // kilocode_change start
    // On Windows, stream.onAbort() may never fire after a client disconnects
    // (delayed TCP RST detection via IOCP). Without this try/catch, the
    // GlobalBus listener, heartbeat interval, and AsyncQueue stay alive
    // indefinitely for each dead connection — leaking memory on every
    // SSE reconnect. Catching write errors lets us clean up eagerly.
    try {
      for await (const data of q) {
        if (data === null) return
        try {
          await stream.writeSSE({ data })
        } catch {
          log.info("global event write failed, cleaning up dead stream")
          stop()
          return
        }
      }
    } finally {
      stop()
    }
    // kilocode_change end
  })
}

export const GlobalRoutes = lazy(
  () =>
    new Hono()
      .get(
        "/health",
        describeRoute({
          summary: "Get health",
          description: "Get health information about the OpenCode server.",
          operationId: "global.health",
          responses: {
            200: {
              description: "Health information",
              content: {
                "application/json": {
                  schema: resolver(z.object({ healthy: z.literal(true), version: z.string() })),
                },
              },
            },
          },
        }),
        async (c) => {
          return c.json({ healthy: true, version: Installation.VERSION })
        },
      )
      .get(
        "/event",
        describeRoute({
          summary: "Get global events",
          description: "Subscribe to global events from the OpenCode system using server-sent events.",
          operationId: "global.event",
          responses: {
            200: {
              description: "Event stream",
              content: {
                "text/event-stream": {
                  schema: resolver(
                    z
                      .object({
                        directory: z.string(),
                        payload: BusEvent.payloads(),
                      })
                      .meta({
                        ref: "GlobalEvent",
                      }),
                  ),
                },
              },
            },
          },
        }),
        async (c) => {
          log.info("global event connected")
          c.header("Cache-Control", "no-cache, no-transform")
          c.header("X-Accel-Buffering", "no")
          c.header("X-Content-Type-Options", "nosniff")

          return streamEvents(c, (q) => {
            async function handler(event: any) {
              q.push(JSON.stringify(event))
            }
            GlobalBus.on("event", handler)
            return () => GlobalBus.off("event", handler)
          })
        },
      )
      .get(
        "/sync-event",
        describeRoute({
          summary: "Subscribe to global sync events",
          description: "Get global sync events",
          operationId: "global.sync-event.subscribe",
          responses: {
            200: {
              description: "Event stream",
              content: {
                "text/event-stream": {
                  schema: resolver(
                    z
                      .object({
                        payload: SyncEvent.payloads(),
                      })
                      .meta({
                        ref: "SyncEvent",
                      }),
                  ),
                },
              },
            },
          },
        }),
        async (c) => {
          log.info("global sync event connected")
          c.header("Cache-Control", "no-cache, no-transform")
          c.header("X-Accel-Buffering", "no")
          c.header("X-Content-Type-Options", "nosniff")
          return streamEvents(c, (q) => {
            return SyncEvent.subscribeAll(({ def, event }) => {
              // TODO: don't pass def, just pass the type (and it should
              // be versioned)
              q.push(
                JSON.stringify({
                  payload: {
                    ...event,
                    type: SyncEvent.versionedType(def.type, def.version),
                  },
                }),
              )
            })
          })
        },
      )
      .get(
        "/config",
        describeRoute({
          summary: "Get global configuration",
          description: "Retrieve the current global OpenCode configuration settings and preferences.",
          operationId: "global.config.get",
          responses: {
            200: {
              description: "Get global config info",
              content: {
                "application/json": {
                  schema: resolver(Config.Info),
                },
              },
            },
          },
        }),
        async (c) => {
          return c.json(await Config.getGlobal())
        },
      )
      .patch(
        "/config",
        describeRoute({
          summary: "Update global configuration",
          description: "Update global OpenCode configuration settings and preferences.",
          operationId: "global.config.update",
          responses: {
            200: {
              description: "Successfully updated global config",
              content: {
                "application/json": {
                  schema: resolver(Config.Info),
                },
              },
            },
            ...errors(400),
          },
        }),
        validator("json", Config.Info),
        async (c) => {
          const config = c.req.valid("json")
          const next = await Config.updateGlobal(config)
          return c.json(next)
        },
      )
      .post(
        "/dispose",
        describeRoute({
          summary: "Dispose instance",
          description: "Clean up and dispose all OpenCode instances, releasing all resources.",
          operationId: "global.dispose",
          responses: {
            200: {
              description: "Global disposed",
              content: {
                "application/json": {
                  schema: resolver(z.boolean()),
                },
              },
            },
          },
        }),
        async (c) => {
          await Config.invalidate() // kilocode_change - reset cached global config so re-init reads fresh data from disk
          GlobalBus.emit("event", {
            directory: "global",
            payload: {
              type: GlobalDisposedEvent.type,
              properties: {},
            },
          })
          return c.json(true)
        },
      )
      .post(
        "/upgrade",
        describeRoute({
          summary: "Upgrade kilo", // kilocode_change
          description: "Upgrade kilo to the specified version or latest if not specified.", // kilocode_change
          operationId: "global.upgrade",
          responses: {
            200: {
              description: "Upgrade result",
              content: {
                "application/json": {
                  schema: resolver(
                    z.union([
                      z.object({
                        success: z.literal(true),
                        version: z.string(),
                      }),
                      z.object({
                        success: z.literal(false),
                        error: z.string(),
                      }),
                    ]),
                  ),
                },
              },
            },
            ...errors(400),
          },
        }),
        validator(
          "json",
          z.object({
            target: z.string().optional(),
          }),
        ),
        async (c) => {
          const method = await Installation.method()
          if (method === "unknown") {
            return c.json({ success: false, error: "Unknown installation method" }, 400)
          }
          const target = c.req.valid("json").target || (await Installation.latest(method))
          const result = await Installation.upgrade(method, target)
            .then(() => ({ success: true as const, version: target }))
            .catch((e) => ({ success: false as const, error: e instanceof Error ? e.message : String(e) }))
          if (result.success) {
            GlobalBus.emit("event", {
              directory: "global",
              payload: {
                type: Installation.Event.Updated.type,
                properties: { version: target },
              },
            })
            return c.json(result)
          }
          return c.json(result, 500)
        },
      )
      // kilocode_change start - debug/profiling endpoints for memory leak investigation
      .get("/debug/memory", async (c) => {
        if (!Flag.KILO_PROFILE) return c.json({ error: "profiling not enabled" }, 403)
        const mem = process.memoryUsage()
        return c.json({
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
          arrayBuffers: mem.arrayBuffers,
          rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
          heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
          pid: process.pid,
          uptime: process.uptime(),
        })
      })
      .post("/debug/snapshot", async (c) => {
        if (!Flag.KILO_PROFILE) return c.json({ error: "profiling not enabled" }, 403)
        const { writeHeapSnapshot } = await import("node:v8")
        const { join } = await import("node:path")
        const { Global } = await import("../../global")
        const ts = new Date().toISOString().replace(/[:.]/g, "")
        const file = join(Global.Path.log, `heap-${process.pid}-${ts}.heapsnapshot`)
        log.warn("writing heap snapshot", { file })
        const result = writeHeapSnapshot(file)
        const mem = process.memoryUsage()
        return c.json({
          file: result,
          rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
          heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
        })
      })
      .post("/debug/gc", async (c) => {
        if (!Flag.KILO_PROFILE) return c.json({ error: "profiling not enabled" }, 403)
        const before = process.memoryUsage()
        if (typeof Bun !== "undefined") Bun.gc(true)
        else if (typeof globalThis.gc === "function") globalThis.gc()
        const after = process.memoryUsage()
        return c.json({
          before: {
            rssMB: +(before.rss / 1024 / 1024).toFixed(1),
            heapUsedMB: +(before.heapUsed / 1024 / 1024).toFixed(1),
          },
          after: {
            rssMB: +(after.rss / 1024 / 1024).toFixed(1),
            heapUsedMB: +(after.heapUsed / 1024 / 1024).toFixed(1),
          },
          freedMB: +((before.heapUsed - after.heapUsed) / 1024 / 1024).toFixed(1),
        })
      }),
  // kilocode_change end
)
