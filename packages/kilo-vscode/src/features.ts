import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"

type PluginItem = string | readonly [string, unknown]

type ConfigLike = {
  plugin?: readonly PluginItem[] | null
}

export type Features = {
  indexing: boolean
}

export function configFeatures(config?: ConfigLike | null): Features {
  return {
    indexing: hasIndexingPlugin(config?.plugin?.map((item) => (typeof item === "string" ? item : item[0]))),
  }
}
