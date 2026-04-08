import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { serve } from "bun"

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    let aborted = false
    stream.onAbort(() => {
      console.log("server: stream aborted!")
      aborted = true
    })
    
    await stream.writeSSE({ data: "1" })
    
    await new Promise(r => setTimeout(r, 500))
    
    try {
      await stream.writeSSE({ data: "2" })
      console.log("server: wrote 2 successfully?", aborted)
    } catch(e) {
      console.error("server: write 2 caught:", e.message)
    }
  })
})

const server = serve({
  fetch: myApp.fetch,
  port: 3001
})

console.log("listening on", server.port)

const ac = new AbortController()
fetch("http://localhost:3001/sse", { signal: ac.signal }).then(async (res) => {
  const reader = res.body.getReader()
  await reader.read()
  console.log("client: aborting")
  ac.abort()
}).catch(e => console.log("client error:", e.message))

setTimeout(() => server.stop(), 2000)
