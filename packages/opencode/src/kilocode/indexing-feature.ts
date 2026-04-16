import { pathToFileURL } from "url"
import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"

export const INDEXING_PLUGIN = "@kilocode/kilo-indexing"

type PluginItem = string | readonly [string, unknown]

type ConfigLike = {
  plugin?: readonly PluginItem[] | null
}

type Req = {
  resolve: (id: string) => string
}

type LogLike = {
  debug: (msg: string, data?: Record<string, unknown>) => void
}

function spec(item: PluginItem): string {
  if (typeof item === "string") return item
  return item[0]
}

function list(items?: readonly PluginItem[] | null): string[] {
  return items?.map(spec) ?? []
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

export function ensureIndexingPlugin<T extends PluginItem>(
  items?: readonly T[] | null,
  plugin?: string,
): Array<T | string> {
  const plugins = items ? [...items] : []
  if (!plugin) return plugins
  if (hasIndexingPlugin(list(plugins))) return plugins
  return [...plugins, plugin]
}
