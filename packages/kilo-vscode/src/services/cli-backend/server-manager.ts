import { type ChildProcess } from "child_process"
import { spawn } from "../../util/process"
import * as crypto from "crypto"
import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import { t } from "./i18n"
import { parseServerPort } from "./server-utils"

export interface ServerInstance {
  port: number
  password: string
  pid: number
  /** null when reconnecting to a server from a previous session. */
  process: ChildProcess | null
}

const STARTUP_TIMEOUT_SECONDS = 30
const KILO_DIR = ".kilo"
const STATE_FILE = "server.json"
const HEALTH_TIMEOUT_MS = 3000

export class ServerManager {
  private instance: ServerInstance | null = null
  private startupPromise: Promise<ServerInstance> | null = null
  private workdir: string | null = null

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get or start the server instance.
   * On first call after a restart, attempts to reconnect to a server that
   * survived the previous session (via `.kilo/server.json`) before spawning
   * a fresh process.
   */
  async getServer(workspaceDir: string): Promise<ServerInstance> {
    console.log("[Kilo New] ServerManager: getServer called")
    this.workdir = workspaceDir

    // For reconnected servers (no ChildProcess exit handler), re-check liveness.
    if (this.instance && !this.instance.process && !ServerManager.isProcessAlive(this.instance.pid)) {
      console.log("[Kilo New] ServerManager: Reconnected server PID", this.instance.pid, "died, clearing")
      this.instance = null
      this.deleteCurrentState()
    }

    if (this.instance) {
      console.log("[Kilo New] ServerManager: Returning existing instance:", { port: this.instance.port })
      return this.instance
    }

    if (this.startupPromise) {
      console.log("[Kilo New] ServerManager: Startup already in progress, waiting...")
      return this.startupPromise
    }

    console.log("[Kilo New] ServerManager: Resolving server instance...")
    this.startupPromise = this.resolveServer(workspaceDir)
    try {
      this.instance = await this.startupPromise
      console.log("[Kilo New] ServerManager: Server ready:", { port: this.instance.port, pid: this.instance.pid })
      return this.instance
    } finally {
      this.startupPromise = null
    }
  }

  /**
   * Try reconnecting to a surviving server, fall back to spawning a fresh one.
   * Wrapped in a single async path so `startupPromise` guards against concurrent callers.
   */
  private async resolveServer(workspaceDir: string): Promise<ServerInstance> {
    const reconnected = await this.tryReconnect(workspaceDir)
    if (reconnected) return reconnected
    return this.startServer(workspaceDir)
  }

  /**
   * Attempt to reconnect to a `kilo serve` process from a previous VS Code
   * session. Reads `.kilo/server.json`, checks whether the PID is alive, and
   * hits the health endpoint. Returns a ServerInstance on success, or null if
   * the old server is gone/unreachable.
   */
  private async tryReconnect(workspaceDir: string): Promise<ServerInstance | null> {
    const file = ServerManager.statePath(workspaceDir)
    let raw: string
    try {
      raw = fs.readFileSync(file, "utf-8")
    } catch (err) {
      console.log("[Kilo New] ServerManager: No server.json found, starting fresh:", err)
      return null
    }

    let state: { port: number; password: string; pid: number }
    try {
      state = JSON.parse(raw)
    } catch (err) {
      console.warn("[Kilo New] ServerManager: Corrupt server.json, ignoring:", err)
      ServerManager.deleteStateFile(file)
      return null
    }

    if (!state.port || !state.password || !state.pid) {
      console.warn("[Kilo New] ServerManager: Incomplete server.json, ignoring")
      ServerManager.deleteStateFile(file)
      return null
    }

    // Is the old process still alive?
    if (!ServerManager.isProcessAlive(state.pid)) {
      console.log("[Kilo New] ServerManager: Previous server PID", state.pid, "is no longer alive")
      ServerManager.deleteStateFile(file)
      return null
    }

    // Process is alive — verify it's actually our kilo server by hitting health.
    // If health fails, the PID may have been recycled by the OS — do NOT kill it.
    const healthy = await ServerManager.checkHealth(state.port, state.password)
    if (!healthy) {
      console.log("[Kilo New] ServerManager: Previous server failed health check, discarding stale state")
      ServerManager.deleteStateFile(file)
      return null
    }

    console.log("[Kilo New] ServerManager: Previous server is healthy, reusing PID", state.pid, "on port", state.port)
    return { port: state.port, password: state.password, pid: state.pid, process: null }
  }

  private async startServer(workspaceDir: string): Promise<ServerInstance> {
    const password = crypto.randomBytes(32).toString("hex")
    const cliPath = this.getCliPath()
    console.log("[Kilo New] ServerManager: CLI path:", cliPath)
    console.log("[Kilo New] ServerManager: Generated password (length):", password.length)

    // Verify the CLI binary exists
    if (!fs.existsSync(cliPath)) {
      throw new Error(
        `CLI binary not found at expected path: ${cliPath}. Please ensure the CLI is built and bundled with the extension.`,
      )
    }

    const stat = fs.statSync(cliPath)
    console.log("[Kilo New] ServerManager: CLI isFile:", stat.isFile())
    console.log("[Kilo New] ServerManager: CLI mode (octal):", (stat.mode & 0o777).toString(8))

    return new Promise((resolve, reject) => {
      console.log("[Kilo New] ServerManager: Spawning CLI process:", cliPath, ["serve", "--port", "0"])
      const serverProcess = spawn(cliPath, ["serve", "--port", "0"], {
        env: {
          ...process.env,
          KILO_SERVER_PASSWORD: password,
          KILO_CLIENT: "vscode",
          KILO_ENABLE_QUESTION_TOOL: "true",
          KILOCODE_FEATURE: "vscode-extension",
          KILO_TELEMETRY_LEVEL: vscode.env.isTelemetryEnabled ? "all" : "off",
          KILO_APP_NAME: "kilo-code",
          KILO_EDITOR_NAME: vscode.env.appName,
          KILO_PLATFORM: "vscode",
          KILO_MACHINE_ID: vscode.env.machineId,
          KILO_APP_VERSION: this.context.extension.packageJSON.version,
          KILO_VSCODE_VERSION: vscode.version,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      })
      console.log("[Kilo New] ServerManager: Process spawned with PID:", serverProcess.pid)

      let resolved = false
      const stderrLines: string[] = []

      serverProcess.stdout?.on("data", (data: Buffer) => {
        const output = data.toString()
        console.log("[Kilo New] ServerManager: CLI Server stdout:", output)

        const port = parseServerPort(output)
        if (port !== null && !resolved) {
          resolved = true
          console.log("[Kilo New] ServerManager: Port detected:", port)
          const pid = serverProcess.pid ?? 0
          this.writeState(workspaceDir, { port, password, pid })
          resolve({ port, password, pid, process: serverProcess })
        }
      })

      serverProcess.stderr?.on("data", (data: Buffer) => {
        const errorOutput = data.toString()
        console.error("[Kilo New] ServerManager: CLI Server stderr:", errorOutput)
        stderrLines.push(errorOutput)
      })

      serverProcess.on("error", (error) => {
        console.error("[Kilo New] ServerManager: Process error:", error)
        if (!resolved) {
          reject(error)
        }
      })

      serverProcess.on("exit", (code) => {
        console.log("[Kilo New] ServerManager: Process exited with code:", code)
        if (this.instance?.process === serverProcess) {
          this.instance = null
          this.deleteCurrentState()
        }
        if (!resolved) {
          const { userMessage, userDetails } = toErrorMessage(
            t("server.processExited", { code: code ?? "null" }),
            stderrLines,
            cliPath,
          )
          reject(new ServerStartupError(userMessage, userDetails))
        }
      })

      setTimeout(() => {
        if (!resolved) {
          console.error(`[Kilo New] ServerManager: Server startup timeout (${STARTUP_TIMEOUT_SECONDS}s)`)
          ServerManager.killProcess(serverProcess)
          const { userMessage, userDetails } = toErrorMessage(
            t("server.startupTimeout", { seconds: STARTUP_TIMEOUT_SECONDS }),
            stderrLines,
            cliPath,
          )
          reject(new ServerStartupError(userMessage, userDetails))
        }
      }, STARTUP_TIMEOUT_SECONDS * 1000)
    })
  }

  private getCliPath(): string {
    // Always use the bundled binary from the extension directory
    const binName = process.platform === "win32" ? "kilo.exe" : "kilo"
    const cliPath = path.join(this.context.extensionPath, "bin", binName)
    console.log("[Kilo New] ServerManager: Using CLI path:", cliPath)
    return cliPath
  }

  // ── State persistence ────────────────────────────────────────────────

  private static statePath(workspaceDir: string): string {
    return path.join(workspaceDir, KILO_DIR, STATE_FILE)
  }

  private writeState(workspaceDir: string, state: { port: number; password: string; pid: number }): void {
    const dir = path.join(workspaceDir, KILO_DIR)
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(ServerManager.statePath(workspaceDir), JSON.stringify(state, null, 2))
    } catch (err) {
      console.warn("[Kilo New] ServerManager: Failed to write server.json:", err)
    }
  }

  private deleteCurrentState(): void {
    if (!this.workdir) return
    ServerManager.deleteStateFile(ServerManager.statePath(this.workdir))
  }

  private static deleteStateFile(file: string): void {
    try {
      fs.unlinkSync(file)
    } catch (err) {
      console.log("[Kilo New] ServerManager: Could not delete server.json:", err)
    }
  }

  // ── Process helpers ──────────────────────────────────────────────────

  /** Check whether a PID is still alive (works cross-platform). */
  private static isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch (err) {
      console.log("[Kilo New] ServerManager: PID", pid, "is not alive:", err)
      return false
    }
  }

  /** Hit GET /global/health to verify the server is responsive and authentic. */
  private static async checkHealth(port: number, password: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
      const auth = `Basic ${Buffer.from(`kilo:${password}`).toString("base64")}`
      const res = await fetch(`http://127.0.0.1:${port}/global/health`, {
        headers: { Authorization: auth },
        signal: controller.signal,
      })
      clearTimeout(timer)
      return res.ok
    } catch (err) {
      console.log("[Kilo New] ServerManager: Health check failed:", err)
      return false
    }
  }

  /**
   * Kill a process and its entire process group.
   * On Unix, we send the signal to -pid (negative) to reach the whole group,
   * mirroring the desktop app's ProcessGroup::leader() + start_kill() pattern.
   * On Windows, process.kill() on the child handle is sufficient.
   */
  private static killProcess(proc: ChildProcess, signal: NodeJS.Signals = "SIGTERM"): void {
    if (proc.pid === undefined) {
      return
    }
    ServerManager.killPid(proc.pid, signal)
  }

  /** Send a signal to a PID (and its process group on Unix). */
  private static killPid(pid: number, signal: NodeJS.Signals = "SIGTERM"): void {
    try {
      if (process.platform !== "win32") {
        // Negative PID targets the entire process group
        process.kill(-pid, signal)
      } else {
        process.kill(pid, signal)
      }
    } catch (err) {
      console.log("[Kilo New] ServerManager: Process", pid, "already gone:", err)
    }
  }

  dispose(): void {
    if (!this.instance) {
      return
    }

    const { process: proc, pid } = this.instance
    this.instance = null
    this.deleteCurrentState()

    if (proc) {
      // We own the ChildProcess handle — use it for clean shutdown.
      console.log("[Kilo New] ServerManager: Disposing — sending SIGTERM to process group, PID:", pid)
      ServerManager.killProcess(proc, "SIGTERM")

      // SIGKILL fallback after 5s: mirrors the desktop app going straight to
      // start_kill(). Ensures the process tree dies even if SIGTERM is ignored
      // or Instance.disposeAll() hangs past the serve.ts shutdown timeout.
      const timer = setTimeout(() => {
        if (proc.exitCode === null) {
          console.warn("[Kilo New] ServerManager: Process did not exit after SIGTERM, sending SIGKILL")
          ServerManager.killProcess(proc, "SIGKILL")
        }
      }, 5000)
      // unref so this timer doesn't prevent the extension host from exiting
      timer.unref()
      proc.on("exit", () => clearTimeout(timer))
    } else {
      // Reconnected server — no ChildProcess handle, kill by PID directly.
      console.log("[Kilo New] ServerManager: Disposing reconnected server, PID:", pid)
      ServerManager.killPid(pid, "SIGTERM")
    }
  }
}

export class ServerStartupError extends Error {
  readonly userMessage: string
  readonly userDetails: string
  constructor(userMessage: string, userDetails: string) {
    super(userDetails)
    this.name = "ServerStartupError"
    this.userMessage = userMessage
    this.userDetails = userDetails
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

export function toErrorMessage(
  error: string,
  stderrLines: string[],
  cliPath?: string,
): {
  userMessage: string
  userDetails: string
  error: string
} {
  let lines = stderrLines.flatMap((line) => line.split("\n"))

  const errorLine = lines.map(stripAnsi).find((line) => /Error:\s+/.test(line))
  const userMessage = errorLine
    ? errorLine.match(/Error:\s+(.+)/)![1].trim()
    : stripAnsi([...lines].reverse().find((line) => line.trim() !== "") ?? error).trim()

  lines = [error, ...lines]
  if (cliPath && cliPath.trim() !== "") {
    lines = [`CLI path: ${cliPath}`, ...lines]
  }

  const detailsText = lines.map(stripAnsi).join("\n").trim()

  return {
    userMessage,
    userDetails: detailsText,
    error,
  }
}
