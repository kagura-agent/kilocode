import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Instance } from "../../project/instance" // kilocode_change
import { Workspace } from "../../control-plane/workspace"
import { Project } from "../../project/project"
import { Installation } from "../../installation"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless kilo server", // kilocode_change
  handler: async (args) => {
    // kilocode_change start - commented out hard validation gate; the SDK auto-generates
    // a password when spawning `kilo serve`, so callers that go through createKiloServer()
    // are already protected. A hard exit here would break local/dev workflows where the
    // server is started manually without a password. Keep the soft warning instead.
    // if (!Flag.KILO_SERVER_PASSWORD || Flag.KILO_SERVER_PASSWORD.length < 12) {
    //   console.error(
    //     "Error: KILO_SERVER_PASSWORD environment variable must be set and must be at least 12 characters long.",
    //   )
    //   process.exit(1)
    // }
    // kilocode_change end
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

    // kilocode_change start - graceful signal shutdown
    const abort = new AbortController()
    const shutdown = async () => {
      try {
        await Instance.disposeAll()
        await server.stop(true)
        await Promise.all(workspaceSync.map((item) => item.stop()))
      } finally {
        abort.abort()
      }
    }
    process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)
    process.on("SIGHUP", shutdown)
    await new Promise((resolve) => abort.signal.addEventListener("abort", resolve))
    // kilocode_change end
  },
})
