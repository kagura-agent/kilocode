import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { serve } from "bun"

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    stream.onAbort(() => {
      console.log("aborted")
    })
    
    // Simulate some work, wait for abort
    await new Promise(r => setTimeout(r, 200))
    
    try {
      await stream.close()
      console.log("close succeeded")
    } catch(e) {
      console.error("close threw:", e.message)
    }
  })
})

const server = serve({ fetch: myApp.fetch, port: 3004 })

const ac = new AbortController()
fetch("http://localhost:3004/sse", { signal: ac.signal }).then(async res => {
  const reader = res.body.getReader()
  await reader.read()
  ac.abort()
}).catch(() => {})

setTimeout(() => server.stop(), 500)
