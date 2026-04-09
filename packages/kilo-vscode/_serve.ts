import { join } from "path"
import { existsSync } from "fs"

const dir = join(import.meta.dir, "storybook-static")

Bun.serve({
  port: 6007,
  fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname
    if (path === "/") path = "/index.html"
    const filepath = join(dir, path)
    if (!existsSync(filepath)) {
      return new Response("Not found", { status: 404 })
    }
    return new Response(Bun.file(filepath))
  },
})

console.log("Storybook server running on http://localhost:6007")
