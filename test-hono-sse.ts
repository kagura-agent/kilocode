import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { app } from "./packages/opencode/src/server/routes/global.ts" // just import hono

const myApp = new Hono()
myApp.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    try {
      await stream.writeSSE({ data: "1" })
      await stream.close()
      console.log("closed once")
      await stream.writeSSE({ data: "2" })
      console.log("wrote after close!?")
    } catch(e) {
      console.error("writeSSE after close caught:", e.message)
    }
    
    try {
      await stream.close()
      console.log("closed twice")
    } catch(e) {
      console.error("double close caught:", e.message)
    }
  })
})

const req = new Request("http://localhost/sse")
myApp.fetch(req).then(async (res) => {
  if (res.body) {
    const reader = res.body.getReader()
    await reader.read()
    await reader.read()
  }
})
