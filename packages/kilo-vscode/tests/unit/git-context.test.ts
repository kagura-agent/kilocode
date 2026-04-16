import { describe, expect, it } from "bun:test"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import { getGitChangesContext } from "../../src/services/git/context"

function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode === 0) return Buffer.from(result.stdout).toString("utf8")
  throw new Error(Buffer.from(result.stderr).toString("utf8") || Buffer.from(result.stdout).toString("utf8"))
}

async function repo(run: (dir: string) => Promise<void>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-git-context-"))
  try {
    git(dir, ["init"])
    git(dir, ["-c", "user.name=Kilo", "-c", "user.email=kilo@example.com", "commit", "--allow-empty", "-m", "init"])
    await run(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

describe("getGitChangesContext", () => {
  it("reports non-git directories", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kilo-no-git-"))
    try {
      const result = await getGitChangesContext(dir)
      expect(result.content).toContain("Not a git repository.")
      expect(result.truncated).toBe(false)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it("reports clean repositories", async () => {
    await repo(async (dir) => {
      const result = await getGitChangesContext(dir)
      expect(result.content).toContain("No changes in working directory.")
      expect(result.truncated).toBe(false)
    })
  })

  it("includes tracked diffs", async () => {
    await repo(async (dir) => {
      await fs.writeFile(path.join(dir, "tracked.txt"), "before\n")
      git(dir, ["add", "tracked.txt"])
      git(dir, ["-c", "user.name=Kilo", "-c", "user.email=kilo@example.com", "commit", "-m", "tracked"])
      await fs.writeFile(path.join(dir, "tracked.txt"), "after\n")

      const result = await getGitChangesContext(dir)
      expect(result.content).toContain("M tracked.txt")
      expect(result.content).toContain("diff --git a/tracked.txt b/tracked.txt")
      expect(result.content).toContain("+after")
    })
  })

  it("includes untracked file contents as patches", async () => {
    await repo(async (dir) => {
      await fs.mkdir(path.join(dir, "src"))
      await fs.writeFile(path.join(dir, "src", "new.txt"), "hello\nworld\n")

      const result = await getGitChangesContext(dir)
      expect(result.content).toContain("?? src/")
      expect(result.content).toContain("diff --git a/src/new.txt b/src/new.txt")
      expect(result.content).toContain("--- /dev/null")
      expect(result.content).toContain("+++ b/src/new.txt")
      expect(result.content).toContain("+hello")
      expect(result.content).toContain("+world")
    })
  })
})
