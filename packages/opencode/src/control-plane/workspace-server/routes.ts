import { GlobalBus } from "../../bus/global"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { MemDiag } from "../../kilocode/mem-diag" // kilocode_change

// kilocode_change start — SSE dead-stream detection to prevent memory leak
export function WorkspaceServerRoutes() {
  return new Hono().get("/event", async (c) => {
    MemDiag.inc("sse.workspace.open") // kilocode_change
    c.header("X-Accel-Buffering", "no")
    c.header("X-Content-Type-Options", "nosniff")
    return streamSSE(c, async (stream) => {
      let dead = false
      const cleanup = () => {
        if (dead) return
        dead = true
        clearInterval(heartbeat)
        GlobalBus.off("event", handler)
        MemDiag.inc("sse.workspace.closed") // kilocode_change
      }

      const send = async (event: unknown) => {
        if (dead) return
        try {
          await stream.writeSSE({
            data: JSON.stringify(event),
          })
        } catch {
          cleanup()
        }
      }
      const handler = async (event: { directory?: string; payload: unknown }) => {
        await send(event.payload)
      }
      GlobalBus.on("event", handler)
      await send({ type: "server.connected", properties: {} })
      const heartbeat = setInterval(() => {
        void send({ type: "server.heartbeat", properties: {} })
      }, 10_000)

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          cleanup()
          resolve()
        })
      })
    })
  })
}
// kilocode_change end
