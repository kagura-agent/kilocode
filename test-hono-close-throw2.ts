import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    try {
      await stream.close()
    } catch(e) { console.error("close 1", e) }
    
    try {
      await stream.close()
      console.log("close 2 succeeded")
    } catch(e2) {
      console.error("close 2 threw:", e2.message)
    }
  })
})

const req = new Request("http://localhost/sse")
myApp.request(req).then(async res => {
  const reader = res.body.getReader()
  await reader.read()
}).catch(console.error)
