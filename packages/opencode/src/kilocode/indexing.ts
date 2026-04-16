import z from "zod"
import path from "path"
import {
  CodeIndexManager,
  type IndexingTelemetryEvent,
  type VectorStoreSearchResult,
} from "@kilocode/kilo-indexing/engine"
import { toIndexingConfigInput } from "@kilocode/kilo-indexing/config"
import { hasIndexingPlugin } from "@kilocode/kilo-indexing/detect"
import { IndexingStatus, disabledIndexingStatus, normalizeIndexingStatus } from "@kilocode/kilo-indexing/status"
import { Telemetry } from "@kilocode/kilo-telemetry"
import { Instance } from "@/project/instance"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { Global } from "@/global"
import { Log } from "@/util/log"

const log = Log.create({ service: "kilocode-indexing" })
const missing = () => disabledIndexingStatus("Indexing plugin is not enabled for this workspace.")

function trackTelemetry(event: IndexingTelemetryEvent): void {
  if (event.type === "started") {
    Telemetry.trackIndexingStarted({
      trigger: event.trigger,
      source: event.source,
      mode: event.mode,
      provider: event.provider,
      vectorStore: event.vectorStore,
      modelId: event.modelId,
    })
    return
  }

  if (event.type === "completed") {
    Telemetry.trackIndexingCompleted({
      trigger: event.trigger,
      source: event.source,
      mode: event.mode,
      provider: event.provider,
      vectorStore: event.vectorStore,
      modelId: event.modelId,
      filesIndexed: event.filesIndexed,
      filesDiscovered: event.filesDiscovered,
      totalBlocks: event.totalBlocks,
      batchErrors: event.batchErrors,
    })
    return
  }

  if (event.type === "file_count") {
    Telemetry.trackIndexingFileCount({
      source: event.source,
      mode: event.mode,
      provider: event.provider,
      vectorStore: event.vectorStore,
      modelId: event.modelId,
      discovered: event.discovered,
      candidate: event.candidate,
    })
    return
  }

  if (event.type === "batch_retry") {
    Telemetry.trackIndexingBatchRetry({
      source: event.source,
      mode: event.mode,
      provider: event.provider,
      vectorStore: event.vectorStore,
      modelId: event.modelId,
      attempt: event.attempt,
      maxRetries: event.maxRetries,
      batchSize: event.batchSize,
      error: event.error,
    })
    return
  }

  Telemetry.trackIndexingError({
    source: event.source,
    trigger: event.trigger,
    mode: event.mode,
    provider: event.provider,
    vectorStore: event.vectorStore,
    modelId: event.modelId,
    location: event.location,
    error: event.error,
    retryCount: event.retryCount,
    maxRetries: event.maxRetries,
  })
}

export namespace KiloIndexing {
  type Entry = {
    manager?: CodeIndexManager
    publish(): Promise<void>
    dispose(): void
  }

  export const Status = IndexingStatus
  export type Status = z.infer<typeof Status>

  export const Event = BusEvent.define(
    "indexing.status",
    z.object({
      status: Status,
    }),
  )

  const state = Instance.state(
    async () => {
      const cfg = await Config.get()
      if (!hasIndexingPlugin((cfg.plugin ?? []).map(Config.pluginSpecifier))) {
        const publish = async () => {
          await Bus.publish(Event, { status: missing() })
        }

        await publish()
        return {
          publish,
          dispose() {},
        }
      }

      log.info("initializing project indexing", { workspacePath: Instance.directory })
      const cache = path.join(Global.Path.state, "indexing")
      const manager = new CodeIndexManager(Instance.directory, cache)
      const input = toIndexingConfigInput(cfg.indexing)

      const publish = async () => {
        const status = normalizeIndexingStatus(manager)
        await Bus.publish(Event, { status })
      }

      const unsub = manager.onProgressUpdate.on(() => {
        publish().catch((err) => {
          log.error("failed to publish indexing status", { err })
        })
      })
      const telemetrySub = manager.onTelemetry.on((event) => {
        trackTelemetry(event)
      })

      await manager.initialize(input)
      log.info("project indexing initialized", {
        workspacePath: Instance.directory,
        featureEnabled: manager.isFeatureEnabled,
        featureConfigured: manager.isFeatureConfigured,
        state: manager.getCurrentStatus().systemStatus,
      })
      await publish()

      return {
        manager,
        publish,
        dispose() {
          unsub.dispose()
          telemetrySub.dispose()
          manager.dispose()
        },
      }
    },
    async (entry: Entry) => {
      entry.dispose()
    },
  )

  export async function init() {
    await state()
  }

  export async function current(): Promise<Status> {
    const entry = await state()
    if (!entry.manager) return missing()
    return normalizeIndexingStatus(entry.manager)
  }

  export async function available(): Promise<boolean> {
    return (await current()).state !== "Disabled"
  }

  export async function search(query: string, directoryPrefix?: string): Promise<VectorStoreSearchResult[]> {
    const entry = await state()
    if (!entry.manager) return []
    return entry.manager.searchIndex(query, directoryPrefix)
  }
}
