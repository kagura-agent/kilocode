import { type ChildProcess, spawnSync } from "child_process"
import launch from "cross-spawn"
import { buffer } from "node:stream/consumers"

export namespace Process {
  export type Stdio = "inherit" | "pipe" | "ignore"
  export type Shell = boolean | string

  export interface Options {
    cwd?: string
    env?: NodeJS.ProcessEnv | null
    stdin?: Stdio
    stdout?: Stdio
    stderr?: Stdio
    shell?: Shell
    abort?: AbortSignal
    kill?: NodeJS.Signals | number
    timeout?: number
  }

  export interface RunOptions extends Omit<Options, "stdout" | "stderr"> {
    nothrow?: boolean
  }

  export interface Result {
    code: number
    stdout: Buffer
    stderr: Buffer
  }

  export class RunFailedError extends Error {
    readonly cmd: string[]
    readonly code: number
    readonly stdout: Buffer
    readonly stderr: Buffer

    constructor(cmd: string[], code: number, stdout: Buffer, stderr: Buffer) {
      const text = stderr.toString().trim()
      super(
        text
          ? `Command failed with code ${code}: ${cmd.join(" ")}\n${text}`
          : `Command failed with code ${code}: ${cmd.join(" ")}`,
      )
      this.name = "ProcessRunFailedError"
      this.cmd = [...cmd]
      this.code = code
      this.stdout = stdout
      this.stderr = stderr
    }
  }

  export type Child = ChildProcess & { exited: Promise<number> }

  export function spawn(cmd: string[], opts: Options = {}): Child {
    if (cmd.length === 0) throw new Error("Command is required")
    opts.abort?.throwIfAborted()

    const proc = launch(cmd[0]!, cmd.slice(1), {
      cwd: opts.cwd,
      shell: opts.shell,
      env: (opts.env === null ? {} : opts.env ? { ...process.env, ...opts.env } : undefined) as NodeJS.ProcessEnv | undefined,
      stdio: [opts.stdin ?? "ignore", opts.stdout ?? "ignore", opts.stderr ?? "ignore"],
      windowsHide: process.platform === "win32",
    })

    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const abort = () => {
      if (closed) return
      if (proc.exitCode !== null || proc.signalCode !== null) return
      closed = true

      if (!(proc.pid && killpid(proc.pid))) {
        proc.kill(opts.kill ?? "SIGTERM")
      }

      const ms = opts.timeout ?? 5_000
      if (ms <= 0) return
      timer = setTimeout(() => {
        if (proc.exitCode !== null || proc.signalCode !== null) return
        if (!(proc.pid && killpid(proc.pid))) {
          proc.kill("SIGKILL")
        }
      }, ms)
    }

    const exited = new Promise<number>((resolve, reject) => {
      const done = () => {
        opts.abort?.removeEventListener("abort", abort)
        if (timer) clearTimeout(timer)
      }

      proc.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        done()
        resolve(code ?? (signal ? 1 : 0))
      })

      proc.once("error", (error: Error) => {
        done()
        reject(error)
      })
    })
    void exited.catch(() => undefined)

    if (opts.abort) {
      opts.abort.addEventListener("abort", abort, { once: true })
      if (opts.abort.aborted) abort()
    }

    const child = proc as Child
    child.exited = exited
    return child
  }

  export async function run(cmd: string[], opts: RunOptions = {}): Promise<Result> {
    const proc = spawn(cmd, {
      cwd: opts.cwd,
      env: opts.env,
      stdin: opts.stdin,
      shell: opts.shell,
      abort: opts.abort,
      kill: opts.kill,
      timeout: opts.timeout,
      stdout: "pipe",
      stderr: "pipe",
    })

    if (!proc.stdout || !proc.stderr) throw new Error("Process output not available")

    const [code, stdout, stderr] = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
    const out = {
      code,
      stdout,
      stderr,
    }
    if (out.code === 0 || opts.nothrow) return out
    throw new RunFailedError(cmd, out.code, out.stdout, out.stderr)
  }

  // kilocode_change start — synchronous Windows process tree kill helper.
  // Centralises the taskkill pattern used by abort(), stop(), pty, ts-check, and mcp.
  // On non-Windows this is a no-op and returns false so callers can fall back to signals.
  export function killpid(pid: number, tree = true): boolean {
    if (process.platform !== "win32") return false
    const args = ["/pid", String(pid), "/F"]
    if (tree) args.push("/T")
    const r = spawnSync("taskkill", args, { windowsHide: true, stdio: "ignore" })
    return r.status === 0
  }
  // kilocode_change end

  // Duplicated in `packages/sdk/js/src/process.ts` because the SDK cannot import
  // `opencode` without creating a cycle. Keep both copies in sync.
  export function stop(proc: ChildProcess) {
    if (proc.exitCode !== null || proc.signalCode !== null) return
    if (proc.pid && killpid(proc.pid)) return
    proc.kill()
  }
}
