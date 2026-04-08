import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { WorkspaceServer } from "../../control-plane/workspace-server/server"
import { ProcessLifecycle } from "../../kilocode/process-lifecycle" // kilocode_change

export const WorkspaceServeCommand = cmd({
  command: "workspace-serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a remote workspace event server",
  handler: async (args) => {
    const opts = await resolveNetworkOptions(args)
    const server = WorkspaceServer.Listen(opts)
    console.log(`workspace event server listening on http://${server.hostname}:${server.port}/event`)

    // kilocode_change start - graceful shutdown and orphan detection
    const abort = new AbortController()
    const shutdown = ProcessLifecycle.once(async () => {
      const cancel = ProcessLifecycle.forceExit({ timeout: 10_000 })
      try {
        await server.stop()
      } finally {
        cancel()
        abort.abort()
      }
    })
    const unwatch = ProcessLifecycle.watchParent({
      onExit: () => {
        void shutdown()
      },
    })
    abort.signal.addEventListener("abort", unwatch, { once: true })
    process.once("SIGTERM", () => void shutdown())
    process.once("SIGINT", () => void shutdown())
    process.once("SIGHUP", () => void shutdown())
    await new Promise((resolve) => abort.signal.addEventListener("abort", resolve))
    // kilocode_change end
  },
})
