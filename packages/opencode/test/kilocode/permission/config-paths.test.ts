// kilocode_change - new file
import path from "path"
import { describe, expect, test } from "bun:test"
import { ConfigProtection } from "../../../src/kilocode/permission/config-paths"
import { Global } from "../../../src/global"
import { KilocodePaths } from "../../../src/kilocode/paths"

describe("ConfigProtection.isRequest", () => {
  const config = path.resolve(Global.Path.config)
  const legacy = KilocodePaths.globalDirs().map((d) => path.resolve(d))

  // --- external_directory: bash-originated (no metadata.filepath) ---

  test("returns true for bash external_directory targeting global config", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [config + "/*"],
      metadata: {},
    })
    expect(result).toBe(true)
  })

  test("returns true for bash external_directory targeting skill dir", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [path.join(config, "skills", "my-skill") + "/*"],
      metadata: {},
    })
    expect(result).toBe(true)
  })

  test("returns true for bash external_directory targeting legacy global dir", () => {
    for (const dir of legacy) {
      const result = ConfigProtection.isRequest({
        permission: "external_directory",
        patterns: [dir + "/*"],
        metadata: {},
      })
      expect(result).toBe(true)
    }
  })

  // --- external_directory: file-tool-originated (has metadata.filepath) ---

  test("returns false for file-tool external_directory targeting global config", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [config + "/*"],
      metadata: { filepath: path.join(config, "kilo.json"), parentDir: config },
    })
    expect(result).toBe(false)
  })

  test("returns false for file-tool external_directory targeting global config root dir", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [config + "/*"],
      metadata: { filepath: config, parentDir: config },
    })
    expect(result).toBe(false)
  })

  test("returns false for file-tool external_directory targeting readable global command dir", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [path.join(config, "command") + "/*"],
      metadata: { filepath: path.join(config, "command", "foo.md"), parentDir: path.join(config, "command") },
    })
    expect(result).toBe(false)
  })

  test("returns false for file-tool external_directory targeting readable global skill dir", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: [path.join(config, "skills") + "/*"],
      metadata: {
        filepath: path.join(config, "skills", "my-skill", "SKILL.md"),
        parentDir: path.join(config, "skills"),
      },
    })
    expect(result).toBe(false)
  })

  // --- external_directory: non-config dirs ---

  test("returns false for bash external_directory targeting non-config dir", () => {
    const result = ConfigProtection.isRequest({
      permission: "external_directory",
      patterns: ["/tmp/some-project/*"],
      metadata: {},
    })
    expect(result).toBe(false)
  })

  // --- edit permission (write operations) ---

  test("returns true for edit targeting global config file via metadata.filepath", () => {
    const result = ConfigProtection.isRequest({
      permission: "edit",
      patterns: [],
      metadata: { filepath: path.join(config, "config.json") },
    })
    expect(result).toBe(true)
  })

  test("returns true for edit targeting skill file via metadata.filepath", () => {
    const result = ConfigProtection.isRequest({
      permission: "edit",
      patterns: [],
      metadata: { filepath: path.join(config, "skills", "my-skill", "SKILL.md") },
    })
    expect(result).toBe(true)
  })

  test("returns true for edit targeting legacy global dir via metadata.filepath", () => {
    for (const dir of legacy) {
      const result = ConfigProtection.isRequest({
        permission: "edit",
        patterns: [],
        metadata: { filepath: path.join(dir, "config.json") },
      })
      expect(result).toBe(true)
    }
  })

  test("returns true for edit targeting relative config path via patterns", () => {
    const result = ConfigProtection.isRequest({
      permission: "edit",
      patterns: [".kilo/command/foo.md"],
    })
    expect(result).toBe(true)
  })

  test("returns false for edit targeting excluded subdir (plans)", () => {
    const result = ConfigProtection.isRequest({
      permission: "edit",
      patterns: [".kilo/plans/plan.md"],
    })
    expect(result).toBe(false)
  })

  // --- read permission (should never be protected) ---

  test("returns false for read permission targeting config files", () => {
    const result = ConfigProtection.isRequest({
      permission: "read",
      patterns: [".kilo/config.json"],
    })
    expect(result).toBe(false)
  })

  test("returns false for read permission targeting global config", () => {
    const result = ConfigProtection.isRequest({
      permission: "read",
      patterns: [path.join(config, "config.json")],
    })
    expect(result).toBe(false)
  })

  // --- glob permission (should never be protected) ---

  test("returns false for glob permission targeting config dirs", () => {
    const result = ConfigProtection.isRequest({
      permission: "glob",
      patterns: [".kilo/command/*.md"],
    })
    expect(result).toBe(false)
  })

  // --- bash permission (should be protected when targeting config) ---

  test("returns true for bash permission targeting config files", () => {
    const result = ConfigProtection.isRequest({
      permission: "bash",
      patterns: ["rm " + path.join(config, "config.json")],
      metadata: { filepath: path.join(config, "config.json") },
    })
    expect(result).toBe(true)
  })

  // --- root config files ---

  test("returns true for edit targeting root config files", () => {
    for (const file of ["kilo.json", "kilo.jsonc", "AGENTS.md"]) {
      const result = ConfigProtection.isRequest({
        permission: "edit",
        patterns: [file],
      })
      expect(result).toBe(true)
    }
  })

  test("returns false for edit targeting non-config files", () => {
    const result = ConfigProtection.isRequest({
      permission: "edit",
      patterns: ["src/index.ts"],
    })
    expect(result).toBe(false)
  })
})

describe("ConfigProtection.hasWildcardAllow", () => {
  test("returns true when ruleset contains * allow *", () => {
    const rules = [{ permission: "*", pattern: "*", action: "allow" }]
    expect(ConfigProtection.hasWildcardAllow(rules)).toBe(true)
  })

  test("returns false when ruleset is empty", () => {
    expect(ConfigProtection.hasWildcardAllow([])).toBe(false)
  })

  test("returns false when ruleset has specific allows but no wildcard", () => {
    const rules = [
      { permission: "edit", pattern: "*", action: "allow" },
      { permission: "*", pattern: "src/*", action: "allow" },
    ]
    expect(ConfigProtection.hasWildcardAllow(rules)).toBe(false)
  })

  test("returns true when any of multiple rulesets has wildcard allow", () => {
    const rules1 = [{ permission: "edit", pattern: "*", action: "allow" }]
    const rules2 = [{ permission: "*", pattern: "*", action: "allow" }]
    expect(ConfigProtection.hasWildcardAllow(rules1, rules2)).toBe(true)
  })

  test("returns false when action is not allow", () => {
    const rules = [{ permission: "*", pattern: "*", action: "ask" }]
    expect(ConfigProtection.hasWildcardAllow(rules)).toBe(false)
  })
})
