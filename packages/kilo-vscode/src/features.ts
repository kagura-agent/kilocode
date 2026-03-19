import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"

type ConfigLike = {
  plugin?: readonly string[] | null
}

export type Features = {
  indexing: boolean
}

export function configFeatures(config?: ConfigLike | null): Features {
  return {
    indexing: hasIndexingPlugin(config?.plugin?.filter((item): item is string => typeof item === "string")),
  }
}
