/**
 * Tests for issue #8391: Repeated external-directory read approval prompts
 * even when external_directory and read are both set to allow.
 *
 * Verifies that when a user configures `permission.external_directory` and
 * `permission.read` to "allow", Kilo does not prompt for external-directory
 * reads during task execution.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { Permission } from "../../../src/permission"
import { PermissionID } from "../../../src/permission/schema"
import { SessionID, MessageID } from "../../../src/session/schema"
import { Instance } from "../../../src/project/instance"
import { Config } from "../../../src/config/config"
import { Global } from "../../../src/global"
import { ConfigProtection } from "../../../src/kilocode/permission/config-paths"
import { Agent } from "../../../src/agent/agent"
import { AppFileSystem } from "../../../src/filesystem"
import * as CrossSpawnSpawner from "../../../src/effect/cross-spawn-spawner"
import { FileTime } from "../../../src/file/time"
import { LSP } from "../../../src/lsp"
import { Instruction } from "../../../src/session/instruction"
import { ReadTool } from "../../../src/tool/read"
import { Tool } from "../../../src/tool/tool"
import { Truncate } from "../../../src/tool/truncate"
import { tmpdir, tmpdirScoped, provideInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

afterAll(async () => {
  const dir = Global.Path.config
  for (const file of ["kilo.jsonc", "kilo.json", "config.json", "opencode.json", "opencode.jsonc"]) {
    await fs.rm(path.join(dir, file), { force: true }).catch(() => {})
  }
  await Config.invalidate(true)
})

afterEach(async () => {
  await Instance.disposeAll()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ruleset mimicking the real agent defaults from agent.ts:97-115 */
function defaults(): Permission.Ruleset {
  return Permission.fromConfig({
    "*": "allow",
    doom_loop: "ask",
    external_directory: {
      "*": "ask",
    },
    question: "deny",
    plan_enter: "deny",
    plan_exit: "deny",
    read: {
      "*": "allow",
      "*.env": "ask",
      "*.env.*": "ask",
      "*.env.example": "allow",
    },
  })
}

/** Build user config ruleset with both external_directory and read set to allow */
function userAllow(): Permission.Ruleset {
  return Permission.fromConfig({
    external_directory: "allow",
    read: "allow",
  })
}

// ---------------------------------------------------------------------------
// Test 1 & 2: Permission.evaluate returns "allow" when user config overrides defaults
// ---------------------------------------------------------------------------

describe("Permission.evaluate with external_directory allow override", () => {
  test("returns allow for external_directory when user config overrides default ask", () => {
    const merged = Permission.merge(defaults(), userAllow())
    const rule = Permission.evaluate("external_directory", "/some/external/dir/*", merged)
    expect(rule.action).toBe("allow")
  })

  test("returns allow for external_directory with various directory patterns", () => {
    const merged = Permission.merge(defaults(), userAllow())
    for (const pattern of ["/tmp/outside/*", "/home/user/docs/*", "/var/data/*"]) {
      const rule = Permission.evaluate("external_directory", pattern, merged)
      expect(rule.action).toBe("allow")
    }
  })

  test("returns allow for read when user config overrides defaults", () => {
    const merged = Permission.merge(defaults(), userAllow())
    const rule = Permission.evaluate("read", "/some/external/dir/file.txt", merged)
    expect(rule.action).toBe("allow")
  })

  test("returns allow for read even for .env files when user overrides with wildcard allow", () => {
    // User's read: "allow" (pattern "*") comes after the default "*.env": "ask"
    const merged = Permission.merge(defaults(), userAllow())
    const rule = Permission.evaluate("read", "/project/.env", merged)
    expect(rule.action).toBe("allow")
  })
})

// ---------------------------------------------------------------------------
// Test 3: Full agent permission merge with real config
// ---------------------------------------------------------------------------

describe("config-loaded permissions override defaults for external_directory", () => {
  // KILO_CONFIG_CONTENT can inject permissions that override project config
  // (e.g. in cloud agent or VS Code extension environments). Save and clear
  // it during these tests to isolate project-level config behavior.
  const saved = process.env.KILO_CONFIG_CONTENT

  test("evaluate respects external_directory allow from config", async () => {
    delete process.env.KILO_CONFIG_CONTENT
    try {
      await Config.invalidate(true)
      await using tmp = await tmpdir({
        git: true,
        config: {
          permission: {
            external_directory: "allow",
            read: "allow",
          },
        },
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const cfg = await Config.get()
          const user = Permission.fromConfig(cfg.permission ?? {})
          const merged = Permission.merge(defaults(), user)

          const ext = Permission.evaluate("external_directory", "/tmp/outside/*", merged)
          expect(ext.action).toBe("allow")

          const rd = Permission.evaluate("read", "/tmp/outside/file.txt", merged)
          expect(rd.action).toBe("allow")
        },
      })
    } finally {
      if (saved !== undefined) process.env.KILO_CONFIG_CONTENT = saved
      await Config.invalidate(true)
    }
  })

  test("evaluate respects external_directory allow as object form from config", async () => {
    delete process.env.KILO_CONFIG_CONTENT
    try {
      await Config.invalidate(true)
      await using tmp = await tmpdir({
        git: true,
        config: {
          permission: {
            external_directory: { "*": "allow" },
            read: { "*": "allow" },
          },
        },
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const cfg = await Config.get()
          const user = Permission.fromConfig(cfg.permission ?? {})
          const merged = Permission.merge(defaults(), user)

          const ext = Permission.evaluate("external_directory", "/tmp/outside/*", merged)
          expect(ext.action).toBe("allow")

          const rd = Permission.evaluate("read", "/tmp/outside/file.txt", merged)
          expect(rd.action).toBe("allow")
        },
      })
    } finally {
      if (saved !== undefined) process.env.KILO_CONFIG_CONTENT = saved
      await Config.invalidate(true)
    }
  })

  test("KILO_CONFIG_CONTENT can override project permission (reproduction path)", async () => {
    // This test demonstrates one cause of the bug: KILO_CONFIG_CONTENT
    // is loaded AFTER project config files, so its permissions win.
    // When the extension or cloud env sets external_directory: deny,
    // user's project-level "allow" gets overwritten.
    const override = JSON.stringify({
      permission: {
        external_directory: { "*": "deny" },
      },
    })
    process.env.KILO_CONFIG_CONTENT = override
    try {
      await Config.invalidate(true)
      await using tmp = await tmpdir({
        git: true,
        config: {
          permission: {
            external_directory: "allow",
            read: "allow",
          },
        },
      })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const cfg = await Config.get()
          const user = Permission.fromConfig(cfg.permission ?? {})
          // The merged config picks up the deny from KILO_CONFIG_CONTENT
          // even though the project config says "allow"
          const merged = Permission.merge(defaults(), user)
          const ext = Permission.evaluate("external_directory", "/tmp/outside/*", merged)
          // BUG PATH: user set "allow" but gets "deny" due to KILO_CONFIG_CONTENT override
          expect(ext.action).toBe("deny")
        },
      })
    } finally {
      if (saved !== undefined) process.env.KILO_CONFIG_CONTENT = saved
      else delete process.env.KILO_CONFIG_CONTENT
      await Config.invalidate(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests 4 & 5: Permission.ask returns immediately when permissions are "allow"
// ---------------------------------------------------------------------------

describe("Permission.ask returns without blocking when allow is configured", () => {
  test("external_directory ask resolves immediately with allow ruleset", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const merged = Permission.merge(defaults(), userAllow())
        const result = await Permission.ask({
          sessionID: SessionID.make("session_test"),
          permission: "external_directory",
          patterns: ["/tmp/outside/*"],
          metadata: { filepath: "/tmp/outside/file.txt", parentDir: "/tmp/outside" },
          always: ["/tmp/outside/*"],
          ruleset: merged,
        })
        // Should resolve immediately (undefined means no prompt needed)
        expect(result).toBeUndefined()
      },
    })
  })

  test("read ask resolves immediately with allow ruleset", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const merged = Permission.merge(defaults(), userAllow())
        const result = await Permission.ask({
          sessionID: SessionID.make("session_test"),
          permission: "read",
          patterns: ["/tmp/outside/file.txt"],
          metadata: {},
          always: ["*"],
          ruleset: merged,
        })
        expect(result).toBeUndefined()
      },
    })
  })

  test("both external_directory and read resolve immediately in sequence", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const merged = Permission.merge(defaults(), userAllow())

        const ext = await Permission.ask({
          sessionID: SessionID.make("session_test"),
          permission: "external_directory",
          patterns: ["/tmp/outside/*"],
          metadata: { filepath: "/tmp/outside/file.txt", parentDir: "/tmp/outside" },
          always: ["/tmp/outside/*"],
          ruleset: merged,
        })
        expect(ext).toBeUndefined()

        const rd = await Permission.ask({
          sessionID: SessionID.make("session_test"),
          permission: "read",
          patterns: ["/tmp/outside/file.txt"],
          metadata: {},
          always: ["*"],
          ruleset: merged,
        })
        expect(rd).toBeUndefined()
      },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests 6 & 7: Read tool does not prompt when both permissions are "allow"
// ---------------------------------------------------------------------------

const baseCtx: Tool.Context = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    AppFileSystem.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    FileTime.defaultLayer,
    Instruction.defaultLayer,
    LSP.defaultLayer,
  ),
)

const init = Effect.fn("Test.init")(function* () {
  const info = yield* ReadTool
  return yield* Effect.promise(() => info.init())
})

const run = Effect.fn("Test.run")(function* (args: Tool.InferParameters<typeof ReadTool>, ctx: Tool.Context = baseCtx) {
  const tool = yield* init()
  return yield* Effect.promise(() => tool.execute(args, ctx))
})

const exec = Effect.fn("Test.exec")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  ctx: Tool.Context = baseCtx,
) {
  return yield* provideInstance(dir)(run(args, ctx))
})

const put = Effect.fn("Test.put")(function* (p: string, content: string) {
  const fs = yield* AppFileSystem.Service
  yield* fs.writeWithDirs(p, content)
})

/** Capture permission requests and evaluate them against the provided ruleset */
function capture(ruleset: Permission.Ruleset) {
  const items: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
  let blocked = 0
  return {
    items,
    blocked: () => blocked,
    ctx: {
      ...baseCtx,
      ask: async (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) => {
        items.push(req)
        // Evaluate the same way Permission.ask does
        for (const pattern of req.patterns) {
          const rule = Permission.evaluate(req.permission, pattern, ruleset)
          if (rule.action === "deny") throw new Permission.DeniedError({ ruleset })
          if (rule.action === "ask") blocked++
        }
      },
    },
  }
}

describe("read tool does not prompt when external_directory and read are allow", () => {
  it.live("no external_directory prompt when reading external file with allow config", () =>
    Effect.gen(function* () {
      const outer = yield* tmpdirScoped()
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(outer, "file.txt"), "external content")

      const merged = Permission.merge(defaults(), userAllow())
      const { items, blocked, ctx } = capture(merged)

      yield* exec(dir, { filePath: path.join(outer, "file.txt") }, ctx)

      // external_directory request is issued but should evaluate to "allow"
      const ext = items.find((r) => r.permission === "external_directory")
      expect(ext).toBeDefined()
      expect(blocked()).toBe(0)
    }),
  )

  it.live("no read prompt when reading external file with allow config", () =>
    Effect.gen(function* () {
      const outer = yield* tmpdirScoped()
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(outer, "file.txt"), "external content")

      const merged = Permission.merge(defaults(), userAllow())
      const { items, blocked, ctx } = capture(merged)

      yield* exec(dir, { filePath: path.join(outer, "file.txt") }, ctx)

      const rd = items.find((r) => r.permission === "read")
      expect(rd).toBeDefined()
      expect(blocked()).toBe(0)
    }),
  )

  it.live("neither external_directory nor read blocks when both are allow", () =>
    Effect.gen(function* () {
      const outer = yield* tmpdirScoped()
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(outer, "file.txt"), "external content")

      const merged = Permission.merge(defaults(), userAllow())
      const { blocked, ctx } = capture(merged)

      yield* exec(dir, { filePath: path.join(outer, "file.txt") }, ctx)
      expect(blocked()).toBe(0)
    }),
  )
})

// ---------------------------------------------------------------------------
// Test 8: Multiple different external directories don't prompt
// ---------------------------------------------------------------------------

describe("multiple external directories do not prompt when globally allowed", () => {
  it.live("reads from three different external dirs without any blocking prompts", () =>
    Effect.gen(function* () {
      const dir1 = yield* tmpdirScoped()
      const dir2 = yield* tmpdirScoped()
      const dir3 = yield* tmpdirScoped()
      const project = yield* tmpdirScoped({ git: true })

      yield* put(path.join(dir1, "a.txt"), "content a")
      yield* put(path.join(dir2, "b.txt"), "content b")
      yield* put(path.join(dir3, "c.txt"), "content c")

      const merged = Permission.merge(defaults(), userAllow())
      const { items, blocked, ctx } = capture(merged)

      yield* exec(project, { filePath: path.join(dir1, "a.txt") }, ctx)
      yield* exec(project, { filePath: path.join(dir2, "b.txt") }, ctx)
      yield* exec(project, { filePath: path.join(dir3, "c.txt") }, ctx)

      // All three should have produced external_directory requests
      const ext = items.filter((r) => r.permission === "external_directory")
      expect(ext.length).toBe(3)

      // None should have blocked
      expect(blocked()).toBe(0)
    }),
  )
})

// ---------------------------------------------------------------------------
// Test 9: "always" approval for one dir still prompts for different dirs
// (expected behavior — validates the distinction)
// ---------------------------------------------------------------------------

describe("always approval is directory-scoped (not global)", () => {
  test("approving always for dir1 does not auto-allow dir2 with default config", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        // Use default ruleset (external_directory: ask)
        const ruleset = defaults()

        // First ask for dir1 — will block
        const promise1 = Permission.ask({
          id: PermissionID.make("permission_dir1"),
          sessionID: SessionID.make("session_test"),
          permission: "external_directory",
          patterns: ["/ext/dir1/*"],
          metadata: { filepath: "/ext/dir1/file.txt", parentDir: "/ext/dir1" },
          always: ["/ext/dir1/*"],
          ruleset,
        })

        // Reply with "always" for dir1
        await Permission.reply({ requestID: PermissionID.make("permission_dir1"), reply: "always" })
        await expect(promise1).resolves.toBeUndefined()

        // Second ask for dir2 — should still block because "always" only covers dir1
        const promise2 = Permission.ask({
          id: PermissionID.make("permission_dir2"),
          sessionID: SessionID.make("session_test"),
          permission: "external_directory",
          patterns: ["/ext/dir2/*"],
          metadata: { filepath: "/ext/dir2/file.txt", parentDir: "/ext/dir2" },
          always: ["/ext/dir2/*"],
          ruleset,
        })

        // Verify it's pending (not auto-resolved)
        const pending = await Permission.list()
        const dir2 = pending.find((r) => r.patterns.includes("/ext/dir2/*"))
        expect(dir2).toBeDefined()

        // Clean up — reply to unblock
        await Permission.reply({ requestID: PermissionID.make("permission_dir2"), reply: "once" })
        await expect(promise2).resolves.toBeUndefined()
      },
    })
  })
})

// ---------------------------------------------------------------------------
// Test 10: Truncate.GLOB appended after user rules doesn't override allow
// ---------------------------------------------------------------------------

describe("Truncate.GLOB post-processing does not interfere with external_directory allow", () => {
  test("arbitrary external directory still evaluates to allow after Truncate.GLOB is appended", () => {
    // Simulate the exact merge order from agent.ts:
    // 1. defaults (external_directory: { "*": "ask" })
    // 2. user config (external_directory: "allow")
    // 3. Truncate.GLOB guarantee (external_directory: { [Truncate.GLOB]: "allow" })
    const merged = Permission.merge(
      defaults(),
      userAllow(),
      Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
    )

    // An arbitrary external dir should still be "allow" from user's rule
    const rule = Permission.evaluate("external_directory", "/some/random/external/*", merged)
    expect(rule.action).toBe("allow")
  })

  test("Truncate.GLOB itself evaluates to allow", () => {
    const merged = Permission.merge(
      defaults(),
      userAllow(),
      Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
    )
    const rule = Permission.evaluate("external_directory", Truncate.GLOB, merged)
    expect(rule.action).toBe("allow")
  })
})

// ---------------------------------------------------------------------------
// Test 11: ConfigProtection.isRequest returns false for read tool requests
// ---------------------------------------------------------------------------

describe("ConfigProtection does not interfere with file-tool external_directory reads", () => {
  test("returns false for external_directory request with filepath metadata (file tool)", () => {
    // The read tool's assertExternalDirectory sets metadata.filepath,
    // which should cause isRequest to return false (bypassing config protection)
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: ["/some/external/dir/*"],
      metadata: { filepath: "/some/external/dir/file.txt", parentDir: "/some/external/dir" },
    })
    expect(result).toBe(false)
  })

  test("returns false for external_directory request targeting non-config absolute paths", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: ["/tmp/project-data/*"],
      metadata: { filepath: "/tmp/project-data/report.csv" },
    })
    expect(result).toBe(false)
  })

  test("returns false for read permission requests (not gated by config protection)", () => {
    const result = ConfigProtection.isRequest({
      permission: "read",
      patterns: ["/tmp/outside/file.txt"],
      metadata: {},
    })
    expect(result).toBe(false)
  })

  test("returns true for external_directory without filepath targeting global config dir", () => {
    // bash-originated external_directory requests lack metadata.filepath
    // and can trigger config protection for config directories
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [path.join(Global.Path.config, "*")],
      metadata: {},
    })
    expect(result).toBe(true)
  })
})
