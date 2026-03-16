import * as fs from "fs/promises"
import * as path from "path"
import type { MarketplaceInstalledMetadata } from "./types"
import { MarketplacePaths } from "./paths"

type Entry = [string, { type: string }]

export interface CliSkill {
  name: string
  location: string
}

export class InstallationDetector {
  constructor(private paths: MarketplacePaths) {}

  /**
   * Detect installed marketplace items.
   *
   * MCP servers and modes are detected by reading kilo.json config files.
   * Skills are detected from CLI data (via `GET /skill`) when available,
   * which is the authoritative source — the CLI scans .kilocode/, .kilo/,
   * .claude/, .agents/, .opencode/, config paths, and skill URLs.
   *
   * When CLI skills are not available (client not connected), falls back
   * to a basic filesystem scan of .kilocode/skills/ and .kilo/skills/.
   */
  async detect(workspace?: string, skills?: CliSkill[]): Promise<MarketplaceInstalledMetadata> {
    const skillEntries = skills ? this.skillsFromCli(skills, workspace) : await this.skillsFromFilesystem(workspace)

    const project = workspace
      ? Object.fromEntries([
          ...(await this.detectFromConfig(this.paths.configPath("project", workspace))),
          ...skillEntries.project,
        ])
      : {}

    const global = Object.fromEntries([
      ...(await this.detectFromConfig(this.paths.configPath("global"))),
      ...skillEntries.global,
    ])

    return { project, global }
  }

  /**
   * Derive skill scope from CLI skill data by checking whether the
   * skill location path is under the workspace directory.
   */
  private skillsFromCli(skills: CliSkill[], workspace?: string): { project: Entry[]; global: Entry[] } {
    const project: Entry[] = []
    const global: Entry[] = []

    for (const skill of skills) {
      const entry: Entry = [skill.name, { type: "skill" }]
      if (workspace && skill.location.startsWith(workspace)) {
        project.push(entry)
      } else {
        global.push(entry)
      }
    }

    return { project, global }
  }

  /**
   * Fallback: scan .kilocode/skills/ and .kilo/skills/ directories directly.
   * Used when CLI client is not available.
   */
  private async skillsFromFilesystem(workspace?: string): Promise<{ project: Entry[]; global: Entry[] }> {
    const project = workspace
      ? (await Promise.all(this.paths.allSkillsDirs("project", workspace).map((d) => this.scanSkillDir(d)))).flat()
      : []

    const global = (await Promise.all(this.paths.allSkillsDirs("global").map((d) => this.scanSkillDir(d)))).flat()

    return { project, global }
  }

  /** Read mcp and agent entries from a kilo.json config file. */
  private async detectFromConfig(filepath: string): Promise<Entry[]> {
    try {
      const content = await fs.readFile(filepath, "utf-8")
      const parsed = JSON.parse(content)
      const entries: Entry[] = []

      if (parsed?.mcp && typeof parsed.mcp === "object") {
        for (const key of Object.keys(parsed.mcp)) {
          entries.push([key, { type: "mcp" }])
        }
      }

      if (parsed?.agent && typeof parsed.agent === "object") {
        for (const key of Object.keys(parsed.agent)) {
          entries.push([key, { type: "mode" }])
        }
      }

      return entries
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to detect items from ${filepath}:`, err)
      }
      return []
    }
  }

  private async scanSkillDir(dir: string): Promise<Entry[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const results: Entry[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          await fs.access(path.join(dir, entry.name, "SKILL.md"))
          results.push([entry.name, { type: "skill" }])
        } catch {
          console.warn(`Skill directory ${entry.name} missing SKILL.md, skipping`)
        }
      }
      return results
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`Failed to detect skills from ${dir}:`, err)
      }
      return []
    }
  }
}
