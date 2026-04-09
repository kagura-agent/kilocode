import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import { Filesystem } from "@/util/filesystem"
import { which } from "@/util/which"
import path from "path"
import { spawn, type ChildProcess } from "child_process"
import { setTimeout as sleep } from "node:timers/promises"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore", windowsHide: true })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.KILO_GIT_BASH_PATH) return Flag.KILO_GIT_BASH_PATH
      const git = which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (Filesystem.stat(bash)?.size) return bash
      }
      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = which("bash")
    if (bash) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) return s
    return fallback()
  })

  // kilocode_change start — prevent nul file creation on Windows (GH #13369)
  const UNIX_SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash"])

  /** True when the resolved shell is a POSIX-like shell (bash, sh, zsh, …). */
  export function isUnixLike(shell: string): boolean {
    const base = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()
    return UNIX_SHELLS.has(base)
  }

  /**
   * On Windows + POSIX shell (e.g. Git Bash): rewrite `>nul` / `2>nul` →
   * `>/dev/null` / `2>/dev/null` so the null-device redirect works instead of
   * creating a literal file named `nul`.
   *
   * On Windows + cmd/PowerShell: rewrite `>/dev/null` → `>NUL` (reverse).
   *
   * No-op on non-Windows platforms.
   */
  export function sanitizeNullRedirect(command: string, shell: string): string {
    if (process.platform !== "win32") return command
    if (isUnixLike(shell)) {
      // POSIX shell on Windows — replace Windows-style >nul with >/dev/null
      // Matches: >nul  2>nul  1>nul  > nul  (case-insensitive, word-bounded)
      return command.replace(/(\d?>)\s*nul\b/gi, "$1/dev/null")
    }
    // Native Windows shell — replace Unix-style >/dev/null with >NUL
    return command.replace(/(\d?>)\s*\/dev\/null\b/g, "$1NUL")
  }
  // kilocode_change end
}
