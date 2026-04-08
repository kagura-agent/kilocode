import { Hono } from "hono"
import { streamSSE } from "hono/streaming"

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    let closed = false
    stream.onAbort(() => {
      console.log("stream aborted!")
      closed = true
    })
    
    await stream.writeSSE({ data: "1" })
    
    // wait for abort
    await new Promise(r => setTimeout(r, 100))
    
    try {
      await stream.writeSSE({ data: "2" })
      console.log("wrote 2 successfully?")
    } catch(e) {
      console.error("write 2 caught:", e.message)
    }
  })
})

const ac = new AbortController()
const res = await myApp.request("/sse", { signal: ac.signal })
if (res.body) {
  const reader = res.body.getReader()
  await reader.read()
  ac.abort()
}
