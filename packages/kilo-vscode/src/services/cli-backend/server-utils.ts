/**
 * Parse the port number from CLI server startup output.
 * Matches lines like: "kilo server listening on http://127.0.0.1:12345"
 * Returns the port number or null if not found.
 */
export function parseServerPort(output: string): number | null {
  const match = output.match(/listening on http:\/\/[\w.]+:(\d+)/)
  if (!match) return null
  return parseInt(match[1]!, 10)
}

/**
 * Registry entry for a spawned `kilo serve` child process.
 * Persisted to disk so the next activation can identify orphans whose owning
 * extension host is no longer running.
 */
export interface RegistryEntry {
  pid: number
  ownerPid: number
  startedAt: string
}

export function isValidRegistryEntry(e: unknown): e is RegistryEntry {
  if (typeof e !== "object" || e === null) return false
  const r = e as Record<string, unknown>
  return typeof r.pid === "number" && typeof r.ownerPid === "number" && typeof r.startedAt === "string"
}

/** Parse raw registry JSON. Returns [] for anything malformed. */
export function parseRegistry(raw: string): RegistryEntry[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidRegistryEntry) : []
  } catch {
    return []
  }
}

export function serializeRegistry(entries: RegistryEntry[]): string {
  return JSON.stringify(entries)
}

/**
 * Partition registry entries into orphans to kill and survivors to keep.
 * Pure — takes predicates for liveness/identity so it's fully testable.
 *
 * An entry is an orphan when:
 *   - its PID is alive, AND
 *   - its owner extension host is dead, AND
 *   - the PID still resolves to a kilo serve process (guards against PID reuse)
 *
 * Entries are dropped (neither killed nor kept) when:
 *   - their PID is already dead, OR
 *   - their PID is alive but no longer kilo (reused by another process)
 */
export function partitionRegistryEntries(
  entries: RegistryEntry[],
  isAlive: (pid: number) => boolean,
  isKiloServe: (pid: number) => boolean,
): { toKill: number[]; survivors: RegistryEntry[] } {
  const toKill: number[] = []
  const survivors: RegistryEntry[] = []
  for (const entry of entries) {
    if (!isAlive(entry.pid)) continue
    if (isAlive(entry.ownerPid)) {
      survivors.push(entry)
      continue
    }
    if (!isKiloServe(entry.pid)) continue
    toKill.push(entry.pid)
  }
  return { toKill, survivors }
}
