import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { serve } from "bun"

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    
    // forcefully close the stream controller to simulate state change
    await stream.close()
    
    try {
      await stream.writeSSE({ data: "2" })
    } catch(e) {
      console.error("write 2 caught:", e.message)
      // now try closing again inside catch
      try {
         await stream.close()
         console.log("close succeeded")
      } catch(e2) {
         console.error("close threw:", e2.message)
      }
    }
  })
})

const server = serve({
  fetch: myApp.fetch,
  port: 3003
})

fetch("http://localhost:3003/sse").then(async res => {
  const reader = res.body.getReader()
  await reader.read()
}).catch(console.error)

setTimeout(() => {
  server.stop()
}, 500)
