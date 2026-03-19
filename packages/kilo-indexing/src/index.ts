export { KiloIndexingPlugin, default } from "./plugin.js"
export { IndexingConfig, toIndexingConfigInput } from "./config.js"
export { hasIndexingPlugin, isIndexingPlugin, normalizePluginName, INDEXING_PLUGIN_NAMES } from "./detect.js"
export { IndexingStatus, disabledIndexingStatus, normalizeIndexingStatus } from "./status.js"

export type { IndexingConfig as IndexingConfigInfo } from "./config.js"
export type { IndexingStatus as IndexingStatusInfo } from "./status.js"
