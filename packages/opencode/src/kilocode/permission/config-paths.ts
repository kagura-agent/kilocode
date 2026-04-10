import path from "path"
import { Global } from "@/global"
import { KilocodePaths } from "@/kilocode/paths"

export namespace ConfigProtection {
  /**
   * Config directory prefixes (relative paths, forward-slash normalized).
   * Matches .kilo/, .kilocode/, .opencode/ at any depth within the project.
   */
  const CONFIG_DIRS = [".kilo/", ".kilocode/", ".opencode/"]

  /**
   * Subdirectories under CONFIG_DIRS that are NOT config files (e.g. plan files).
   * Paths under these subdirs are exempt from config protection.
   */
  const EXCLUDED_SUBDIRS = ["plans/"]

  /**
   * Root-level config files that must be protected.
   * Matched only when the relative path has no directory component.
   */
  const CONFIG_ROOT_FILES = new Set(["kilo.json", "kilo.jsonc", "opencode.json", "opencode.jsonc", "AGENTS.md"])

  /** Metadata key used to signal the UI to hide the "Allow always" option. */
  export const DISABLE_ALWAYS_KEY = "disableAlways" as const

  function normalize(p: string): string {
    return path.posix.normalize(p.replaceAll("\\", "/"))
  }

  /** Return the remainder after the config dir prefix, or undefined if excluded. */
  function excluded(remainder: string): boolean {
    return EXCLUDED_SUBDIRS.some((sub) => remainder.startsWith(sub))
  }

  /** Check if a project-relative path points to a config file or directory. */
  export function isRelative(pattern: string): boolean {
    const normalized = normalize(pattern)
    for (const dir of CONFIG_DIRS) {
      const bare = dir.slice(0, -1) // e.g. ".kilo"
      // Match at root (e.g. ".kilo/foo") or nested (e.g. "packages/sub/.kilo/foo")
      if (normalized === bare || normalized.endsWith("/" + bare)) return true
      if (normalized.startsWith(dir)) {
        if (excluded(normalized.slice(dir.length))) continue
        return true
      }
      const nested = normalized.indexOf("/" + dir)
      if (nested !== -1) {
        if (excluded(normalized.slice(nested + 1 + dir.length))) continue
        return true
      }
    }
    return CONFIG_ROOT_FILES.has(normalized)
  }

  /** Check if `child` is equal to or nested inside `parent`. */
  function within(child: string, parent: string): boolean {
    return child === parent || child.startsWith(parent + path.sep)
  }

  /** Check if an absolute path is inside a known CLI config directory. */
  export function isAbsolute(filepath: string): boolean {
    const resolved = path.resolve(filepath)

    // ~/.config/kilo/ (XDG config)
    if (within(resolved, path.resolve(Global.Path.config))) return true

    // ~/.kilo/ and ~/.kilocode/ (legacy global dirs)
    for (const dir of KilocodePaths.globalDirs()) {
      if (within(resolved, path.resolve(dir))) return true
    }

    return false
  }

  /** Check a single path (absolute or relative) against config protection. */
  function protected_(p: string): boolean {
    return path.isAbsolute(p) ? isAbsolute(p) : isRelative(p)
  }

  /**
   * Permissions that are considered write operations for config protection.
   * Only these trigger the config write-protection gate.
   * Read-only permissions (read, glob, grep, external_directory from file
   * tools) are always allowed without prompting.
   */
  const WRITE_PERMISSIONS = new Set(["edit", "bash"])

  /**
   * Determine if a permission request is a **write** to config files.
   * Read access to config dirs is always allowed — only writes are gated.
   */
  export function isRequest(request: {
    permission: string
    patterns: string[]
    metadata?: Record<string, any>
  }): boolean {
    // external_directory: bash commands touching config dirs are writes;
    // file-tool reads are not.
    if (request.permission === "external_directory") {
      // File tools (read, glob) include metadata.filepath — these are reads.
      if (request.metadata?.filepath) return false
      // Bash-originated requests (no filepath) that target config dirs are writes.
      for (const pattern of request.patterns) {
        const dir = pattern.replace(/\/\*$/, "")
        if (path.isAbsolute(dir) && isAbsolute(dir)) return true
      }
      return false
    }

    if (!WRITE_PERMISSIONS.has(request.permission)) return false

    // Check patterns — handle both relative and absolute
    for (const pattern of request.patterns) {
      if (protected_(pattern)) return true
    }

    // Check metadata.filepath (absolute for edit, comma-joined relative for apply_patch)
    const fp = request.metadata?.filepath
    if (typeof fp === "string") {
      // apply_patch joins relative paths with ", "
      const parts = fp.includes(", ") ? fp.split(", ") : [fp]
      for (const part of parts) {
        if (protected_(part)) return true
      }
    }

    // Check metadata.files[] (apply_patch file objects with absolute filePath/movePath)
    const files = request.metadata?.files
    if (Array.isArray(files)) {
      for (const file of files) {
        for (const key of ["filePath", "movePath"] as const) {
          const val = file?.[key]
          if (typeof val === "string" && protected_(val)) return true
        }
      }
    }

    return false
  }

  /**
   * Check if a ruleset contains a wildcard allow-all rule (`"*": "allow"`).
   * When present, config write-protection is waived because the user has
   * explicitly opted into allowing everything.
   */
  export function hasWildcardAllow(
    ...rulesets: Array<Array<{ permission: string; pattern: string; action: string }>>
  ): boolean {
    for (const rules of rulesets) {
      for (const rule of rules) {
        if (rule.permission === "*" && rule.pattern === "*" && rule.action === "allow") return true
      }
    }
    return false
  }
}
