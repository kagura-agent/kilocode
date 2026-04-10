// kilocode_change - new file
import { describe, test, expect } from "bun:test"
import { ConfigProtection } from "../../src/kilocode/permission/config-paths"
import { PermissionNext } from "../../src/permission/next"

describe("ConfigProtection.isRequest", () => {
  test("returns true for edit permission targeting config dir", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: [".kilo/skills/my-skill/SKILL.md"],
      }),
    ).toBe(true)
  })

  test("returns true for edit permission targeting .kilocode dir", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: [".kilocode/agent/foo.md"],
      }),
    ).toBe(true)
  })

  test("returns true for edit permission targeting .opencode dir", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: [".opencode/config.json"],
      }),
    ).toBe(true)
  })

  test("returns true for edit permission targeting root config files", () => {
    expect(ConfigProtection.isRequest({ permission: "edit", patterns: ["kilo.json"] })).toBe(true)
    expect(ConfigProtection.isRequest({ permission: "edit", patterns: ["AGENTS.md"] })).toBe(true)
    expect(ConfigProtection.isRequest({ permission: "edit", patterns: ["opencode.json"] })).toBe(true)
  })

  test("returns false for read permission targeting config dir", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "read",
        patterns: [".kilo/skills/my-skill/SKILL.md"],
      }),
    ).toBe(false)
  })

  test("returns false for read permission targeting root config files", () => {
    expect(ConfigProtection.isRequest({ permission: "read", patterns: ["kilo.json"] })).toBe(false)
    expect(ConfigProtection.isRequest({ permission: "read", patterns: ["AGENTS.md"] })).toBe(false)
  })

  test("returns false for edit permission targeting non-config files", () => {
    expect(ConfigProtection.isRequest({ permission: "edit", patterns: ["src/index.ts"] })).toBe(false)
    expect(ConfigProtection.isRequest({ permission: "edit", patterns: ["README.md"] })).toBe(false)
  })

  test("returns false for edit permission targeting plan files (excluded subdir)", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: [".kilo/plans/my-plan.md"],
      }),
    ).toBe(false)
  })

  test("returns true for nested config dirs", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: ["packages/sub/.kilo/foo.md"],
      }),
    ).toBe(true)
  })

  test("returns true when metadata.filepath points to config", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "edit",
        patterns: ["some-file.ts"],
        metadata: { filepath: ".kilo/agent/foo.md" },
      }),
    ).toBe(true)
  })

  test("returns false for glob permission", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "glob",
        patterns: [".kilo/skills/*"],
      }),
    ).toBe(false)
  })

  test("returns false for skill permission", () => {
    expect(
      ConfigProtection.isRequest({
        permission: "skill",
        patterns: ["my-skill"],
      }),
    ).toBe(false)
  })
})

describe("ConfigProtection.isExplicitConfigRule", () => {
  test("returns false for blanket wildcard pattern", () => {
    expect(ConfigProtection.isExplicitConfigRule("*")).toBe(false)
  })

  test("returns false for generic file patterns", () => {
    expect(ConfigProtection.isExplicitConfigRule("*.md")).toBe(false)
    expect(ConfigProtection.isExplicitConfigRule("*.ts")).toBe(false)
    expect(ConfigProtection.isExplicitConfigRule("src/*")).toBe(false)
  })

  test("returns true for .kilo/ paths", () => {
    expect(ConfigProtection.isExplicitConfigRule(".kilo/*")).toBe(true)
    expect(ConfigProtection.isExplicitConfigRule(".kilo/skills/*")).toBe(true)
    expect(ConfigProtection.isExplicitConfigRule(".kilo/agent/foo.md")).toBe(true)
  })

  test("returns true for .kilocode/ paths", () => {
    expect(ConfigProtection.isExplicitConfigRule(".kilocode/*")).toBe(true)
    expect(ConfigProtection.isExplicitConfigRule(".kilocode/skills/my-skill/SKILL.md")).toBe(true)
  })

  test("returns true for .opencode/ paths", () => {
    expect(ConfigProtection.isExplicitConfigRule(".opencode/*")).toBe(true)
  })

  test("returns true for root config files", () => {
    expect(ConfigProtection.isExplicitConfigRule("kilo.json")).toBe(true)
    expect(ConfigProtection.isExplicitConfigRule("AGENTS.md")).toBe(true)
    expect(ConfigProtection.isExplicitConfigRule("opencode.json")).toBe(true)
  })

  test("returns false for non-config files", () => {
    expect(ConfigProtection.isExplicitConfigRule("README.md")).toBe(false)
    expect(ConfigProtection.isExplicitConfigRule("package.json")).toBe(false)
    expect(ConfigProtection.isExplicitConfigRule("src/index.ts")).toBe(false)
  })

  test("returns true for nested config dir patterns", () => {
    expect(ConfigProtection.isExplicitConfigRule("packages/sub/.kilo/foo")).toBe(true)
  })
})

describe("ConfigProtection.isRelative", () => {
  test("matches bare config dir names", () => {
    expect(ConfigProtection.isRelative(".kilo")).toBe(true)
    expect(ConfigProtection.isRelative(".kilocode")).toBe(true)
    expect(ConfigProtection.isRelative(".opencode")).toBe(true)
  })

  test("matches files inside config dirs", () => {
    expect(ConfigProtection.isRelative(".kilo/foo.md")).toBe(true)
    expect(ConfigProtection.isRelative(".kilocode/skills/s/SKILL.md")).toBe(true)
  })

  test("excludes plan files", () => {
    expect(ConfigProtection.isRelative(".kilo/plans/plan.md")).toBe(false)
    expect(ConfigProtection.isRelative(".opencode/plans/my-plan.md")).toBe(false)
  })

  test("matches nested config dirs", () => {
    expect(ConfigProtection.isRelative("sub/.kilo/foo")).toBe(true)
    expect(ConfigProtection.isRelative("packages/pkg/.kilocode/bar")).toBe(true)
  })

  test("rejects non-config paths", () => {
    expect(ConfigProtection.isRelative("src/index.ts")).toBe(false)
    expect(ConfigProtection.isRelative("README.md")).toBe(false)
  })

  test("matches root config files", () => {
    expect(ConfigProtection.isRelative("kilo.json")).toBe(true)
    expect(ConfigProtection.isRelative("AGENTS.md")).toBe(true)
  })
})

describe("config write-protection with evaluate and rulesets", () => {
  /**
   * Integration tests verifying that blanket wildcard rules do NOT bypass
   * config write-protection, but explicit config-path rules DO.
   */

  function enforced(permission: string, pattern: string, ...rulesets: PermissionNext.Ruleset[]): boolean {
    const request = { permission, patterns: [pattern] }
    const protected_ = ConfigProtection.isRequest(request)
    if (!protected_) return false
    const rule = PermissionNext.evaluate(permission, pattern, ...rulesets)
    return rule.action === "allow" && !ConfigProtection.isExplicitConfigRule(rule.pattern)
  }

  test("blanket '*': 'allow' does NOT bypass config write-protection", () => {
    const ruleset = PermissionNext.fromConfig({ "*": "allow" })
    // Edit to config dir should be enforced (prompted)
    expect(enforced("edit", ".kilo/skills/my-skill/SKILL.md", ruleset)).toBe(true)
    expect(enforced("edit", ".kilocode/agent/foo.md", ruleset)).toBe(true)
    expect(enforced("edit", "kilo.json", ruleset)).toBe(true)
    expect(enforced("edit", "AGENTS.md", ruleset)).toBe(true)
  })

  test("blanket edit: 'allow' does NOT bypass config write-protection", () => {
    const ruleset = PermissionNext.fromConfig({ edit: "allow" })
    expect(enforced("edit", ".kilo/agent/foo.md", ruleset)).toBe(true)
    expect(enforced("edit", "AGENTS.md", ruleset)).toBe(true)
  })

  test("explicit config-path rule DOES bypass config write-protection", () => {
    const ruleset = PermissionNext.fromConfig({
      edit: { ".kilo/*": "allow" },
    })
    // The matching rule pattern is ".kilo/*", which is an explicit config path
    expect(enforced("edit", ".kilo/skills/my-skill/SKILL.md", ruleset)).toBe(false)
  })

  test("explicit root config file rule DOES bypass config write-protection", () => {
    const ruleset = PermissionNext.fromConfig({
      edit: { "AGENTS.md": "allow" },
    })
    expect(enforced("edit", "AGENTS.md", ruleset)).toBe(false)
  })

  test("explicit .kilocode path rule DOES bypass config write-protection", () => {
    const ruleset = PermissionNext.fromConfig({
      edit: { ".kilocode/*": "allow" },
    })
    expect(enforced("edit", ".kilocode/agent/foo.md", ruleset)).toBe(false)
  })

  test("generic wildcard *.md does NOT bypass config write-protection for AGENTS.md", () => {
    const ruleset = PermissionNext.fromConfig({
      edit: { "*.md": "allow" },
    })
    // *.md matches AGENTS.md, but the pattern "*.md" is not a config path
    expect(enforced("edit", "AGENTS.md", ruleset)).toBe(true)
  })

  test("non-config edits are not enforced even with blanket allow", () => {
    const ruleset = PermissionNext.fromConfig({ "*": "allow" })
    expect(enforced("edit", "src/index.ts", ruleset)).toBe(false)
    expect(enforced("edit", "README.md", ruleset)).toBe(false)
  })

  test("read access to config dirs is never enforced", () => {
    const ruleset = PermissionNext.fromConfig({ "*": "allow" })
    expect(enforced("read", ".kilo/skills/my-skill/SKILL.md", ruleset)).toBe(false)
    expect(enforced("read", "kilo.json", ruleset)).toBe(false)
  })

  test("plan files under config dirs are not enforced", () => {
    const ruleset = PermissionNext.fromConfig({ "*": "allow" })
    expect(enforced("edit", ".kilo/plans/my-plan.md", ruleset)).toBe(false)
  })

  test("mixed ruleset: blanket allow with explicit config path override", () => {
    const ruleset = PermissionNext.fromConfig({
      "*": "allow",
      edit: { "*": "allow", ".kilo/skills/*": "allow" },
    })
    // .kilo/skills/* is explicit → not enforced
    expect(enforced("edit", ".kilo/skills/my-skill/SKILL.md", ruleset)).toBe(false)
    // .kilo/agent/* is NOT explicitly allowed, so blanket rule applies → enforced
    expect(enforced("edit", ".kilo/agent/foo.md", ruleset)).toBe(true)
  })

  test("last-match-wins: explicit config rule after blanket allow wins", () => {
    // fromConfig preserves order; last matching rule wins in evaluate
    const ruleset = PermissionNext.fromConfig({
      edit: { "*": "allow", ".kilo/*": "allow" },
    })
    // The last matching rule for ".kilo/foo" is ".kilo/*" → explicit → not enforced
    expect(enforced("edit", ".kilo/agent/foo.md", ruleset)).toBe(false)
  })
})
