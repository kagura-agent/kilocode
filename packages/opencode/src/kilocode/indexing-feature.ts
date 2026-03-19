import { pathToFileURL } from "url"
import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"

export const INDEXING_PLUGIN = "@kilocode/kilo-indexing"

type ConfigLike = {
  plugin?: readonly string[] | null
}

type Req = {
  resolve: (id: string) => string
}

type LogLike = {
  debug: (msg: string, data?: Record<string, unknown>) => void
}

function list(items?: readonly string[] | null): string[] {
  return items?.filter((item): item is string => typeof item === "string") ?? []
}

export function indexingEnabled(config?: ConfigLike | null): boolean {
  return hasIndexingPlugin(list(config?.plugin))
}

export function resolveIndexingPlugin(req: Req, log?: LogLike): string {
  try {
    const file = req.resolve(INDEXING_PLUGIN)
    return pathToFileURL(file).href
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log?.debug("failed to resolve indexing plugin package, using package marker", { error })
    return INDEXING_PLUGIN
  }
}

export function ensureIndexingPlugin(items?: readonly string[] | null, plugin?: string): string[] {
  const plugins = list(items)
  if (!plugin) return plugins
  if (hasIndexingPlugin(plugins)) return plugins
  return [...plugins, plugin]
}
