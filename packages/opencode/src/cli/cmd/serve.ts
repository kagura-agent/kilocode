import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Instance } from "../../project/instance" // kilocode_change
import { Workspace } from "../../control-plane/workspace"
import { Project } from "../../project/project"
import { Installation } from "../../installation"
import { ProcessLifecycle } from "../../kilocode/process-lifecycle" // kilocode_change

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless kilo server", // kilocode_change
  handler: async (args) => {
    if (!Flag.KILO_SERVER_PASSWORD) {
      console.log("Warning: KILO_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = await resolveNetworkOptions(args)
    const server = Server.listen(opts)
    console.log(`kilo server listening on http://${server.hostname}:${server.port}`)

    let workspaceSync: Array<ReturnType<typeof Workspace.startSyncing>> = []
    // Only available in development right now
    if (Installation.isLocal()) {
      workspaceSync = Project.list().map((project) => Workspace.startSyncing(project))
    }

    // kilocode_change start - graceful shutdown and orphan detection
    const abort = new AbortController()
    const shutdown = ProcessLifecycle.once(async () => {
      const cancel = ProcessLifecycle.forceExit({ timeout: 10_000 })
      try {
        await Instance.disposeAll()
        await server.stop(true)
        await Promise.all(workspaceSync.map((item) => item.stop()))
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
