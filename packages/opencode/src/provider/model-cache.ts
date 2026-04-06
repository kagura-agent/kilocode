// kilocode_change new file
import { fetchKiloModels } from "@kilocode/kilo-gateway"
import { Config } from "../config/config"
import { Auth } from "../auth"
import { Env } from "../env"
import { Hash } from "../util/hash"
import { Log } from "../util/log"

export namespace ModelCache {
  const log = Log.create({ service: "model-cache" })

  // Cache structure
  const cache = new Map<
    string,
    {
      models: Record<string, any>
      timestamp: number
    }
  >()

  const TTL = 5 * 60 * 1000 // 5 minutes
  const STALE_TTL = 30 * 60 * 1000 // 30 minutes — max age for stale-while-revalidate
  const inFlight = new Map<string, Promise<Record<string, any>>>()

  function key(providerID: string, options?: Record<string, unknown>): string {
    const list = Object.entries(options ?? {})
      .filter(([, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([item, value]) => [item, typeof value === "string" ? value : JSON.stringify(value)])
    return `${providerID}:${Hash.fast(JSON.stringify(list))}`
  }

  /**
   * Get cached models if available and not expired
   * @param providerID - Provider identifier (e.g., "kilo")
   * @returns Cached models or undefined if cache miss or expired
   */
  export function get(providerID: string, options?: Record<string, unknown>): Record<string, any> | undefined {
    const id = key(providerID, options)
    const cached = cache.get(id)

    if (!cached) {
      log.debug("cache miss", { providerID, key: id })
      return undefined
    }

    const now = Date.now()
    const age = now - cached.timestamp

    if (age > TTL) {
      log.debug("cache expired", { providerID, key: id, age })
      cache.delete(id)
      return undefined
    }

    log.debug("cache hit", { providerID, key: id, age })
    return cached.models
  }

  /**
   * Fetch models with cache-first approach
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Models from cache or freshly fetched
   */
  export async function fetch(providerID: string, options?: any): Promise<Record<string, any>> {
    const auth = await getAuthOptions(providerID)
    const merged = { ...auth, ...options }
    const id = key(providerID, merged)

    // Check cache — return immediately if fresh, or stale-while-revalidate
    // if expired within the grace window. Note: we read `cache` directly
    // instead of using `get()` which deletes expired entries.
    const entry = cache.get(id)
    if (entry) {
      const age = Date.now() - entry.timestamp
      if (age <= TTL) {
        log.debug("cache hit", { providerID, key: id, age })
        return entry.models
      }
      if (age <= STALE_TTL) {
        log.debug("returning stale cache, refreshing in background", { providerID, key: id, age })
        refresh(providerID, options).catch(() => {})
        return entry.models
      }
      // Too stale — discard
      cache.delete(id)
    }

    // Full cache miss — blocking fetch with request dedup
    const pending = inFlight.get(id)
    if (pending) {
      log.debug("fetch already in flight, coalescing", { providerID, key: id })
      return pending
    }

    const promise = (async () => {
      log.info("fetching models", { providerID, key: id })
      try {
        const models = await fetchModels(providerID, merged)
        cache.set(id, { models, timestamp: Date.now() })
        log.info("models fetched and cached", { providerID, key: id, count: Object.keys(models).length })
        return models
      } catch (error) {
        log.error("failed to fetch models", { providerID, key: id, error })
        return {}
      }
    })()

    inFlight.set(id, promise)
    try {
      return await promise
    } finally {
      inFlight.delete(id)
    }
  }

  /**
   * Force refresh models (bypass cache)
   * Uses atomic refresh pattern to prevent race conditions
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Freshly fetched models
   */
  export async function refresh(providerID: string, options?: any): Promise<Record<string, any>> {
    const auth = await getAuthOptions(providerID)
    const merged = { ...auth, ...options }
    const id = key(providerID, merged)

    // Check if refresh already in progress
    const existing = inFlight.get(id)
    if (existing) {
      log.debug("refresh already in progress, returning existing promise", { providerID, key: id })
      return existing
    }

    // Create new refresh promise
    const refreshPromise = (async () => {
      log.info("refreshing models", { providerID, key: id })

      try {
        const models = await fetchModels(providerID, merged)

        // Update cache with new models
        cache.set(id, {
          models,
          timestamp: Date.now(),
        })

        log.info("models refreshed", { providerID, key: id, count: Object.keys(models).length })
        return models
      } catch (error) {
        log.error("failed to refresh models", { providerID, key: id, error })

        // Return existing cache or empty object
        const cached = cache.get(id)
        if (cached) {
          log.debug("returning stale cache after refresh failure", { providerID, key: id })
          return cached.models
        }

        return {}
      }
    })()

    // Track in-flight refresh
    inFlight.set(id, refreshPromise)

    try {
      return await refreshPromise
    } finally {
      // Clean up in-flight tracking
      inFlight.delete(id)
    }
  }

  /**
   * Clear cached models for a provider
   * @param providerID - Provider identifier
   */
  export function clear(providerID: string): void {
    const prefix = `${providerID}:`
    const keys = new Set<string>()

    for (const item of cache.keys()) {
      if (item.startsWith(prefix)) {
        keys.add(item)
      }
    }

    for (const item of inFlight.keys()) {
      if (item.startsWith(prefix)) {
        keys.add(item)
      }
    }

    for (const item of keys) {
      cache.delete(item)
      inFlight.delete(item)
    }

    if (keys.size > 0) {
      log.info("cache cleared", { providerID, count: keys.size })
      return
    }

    log.debug("no cache to clear", { providerID })
  }

  /**
   * Fetch models based on provider type
   * @param providerID - Provider identifier
   * @param options - Provider options
   * @returns Fetched models
   */
  async function fetchModels(providerID: string, options: any): Promise<Record<string, any>> {
    if (providerID === "kilo") {
      return fetchKiloModels(options)
    }

    // kilocode_change start
    if (providerID === "apertis") {
      return fetchApertisModels(options)
    }
    // kilocode_change end

    // Other providers not implemented yet
    log.debug("provider not implemented", { providerID })
    return {}
  }

  // kilocode_change start
  const APERTIS_BASE_URL = "https://api.apertis.ai/v1"

  async function fetchApertisModels(options: any): Promise<Record<string, any>> {
    const baseURL = options.baseURL ?? APERTIS_BASE_URL
    const apiKey = options.apiKey

    if (!apiKey) {
      log.debug("no API key for apertis, skipping model fetch")
      return {}
    }

    const url = `${baseURL.replace(/\/+$/, "")}/models`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      log.error("apertis model fetch failed", { status: response.status })
      return {}
    }

    const json = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> }
    const models: Record<string, any> = {}

    for (const model of json.data ?? []) {
      models[model.id] = {
        id: model.id,
        name: model.id,
        family: model.owned_by ?? "",
        release_date: "",
        attachment: false,
        reasoning: false,
        temperature: true,
        tool_call: true,
        cost: { input: 0, output: 0 },
        limit: { context: 128000, output: 4096 },
        options: {},
        modalities: {
          input: ["text"],
          output: ["text"],
        },
      }
    }

    return models
  }
  // kilocode_change end

  /**
   * Get authentication options from multiple sources
   * Priority: Config > Auth > Env
   * @param providerID - Provider identifier
   * @returns Options object with authentication credentials
   */
  async function getAuthOptions(providerID: string): Promise<any> {
    const options: any = {}

    if (providerID === "kilo") {
      // Get from Config
      const config = await Config.get()
      const providerConfig = config.provider?.[providerID]
      if (providerConfig?.options?.apiKey) {
        options.kilocodeToken = providerConfig.options.apiKey
      }

      // kilocode_change start
      if (providerConfig?.options?.kilocodeOrganizationId) {
        options.kilocodeOrganizationId = providerConfig.options.kilocodeOrganizationId
      }
      // kilocode_change end

      // Get from Auth
      const auth = await Auth.get(providerID)
      if (auth) {
        if (auth.type === "api") {
          options.kilocodeToken = auth.key
        } else if (auth.type === "oauth") {
          options.kilocodeToken = auth.access
          // kilocode_change start - read org ID from OAuth accountId for enterprise model filtering
          if (auth.accountId) {
            options.kilocodeOrganizationId = auth.accountId
          }
          // kilocode_change end
        }
      }

      // Get from Env
      const env = Env.all()
      if (env.KILO_API_KEY) {
        options.kilocodeToken = env.KILO_API_KEY
      }
      if (env.KILO_ORG_ID) {
        options.kilocodeOrganizationId = env.KILO_ORG_ID
      }

      log.debug("auth options resolved", {
        providerID,
        hasToken: !!options.kilocodeToken,
        hasOrganizationId: !!options.kilocodeOrganizationId,
      })
    }

    // kilocode_change start
    if (providerID === "apertis") {
      const config = await Config.get()
      const providerConfig = config.provider?.[providerID]
      if (providerConfig?.options?.apiKey) {
        options.apiKey = providerConfig.options.apiKey
      }
      if (providerConfig?.options?.baseURL) {
        options.baseURL = providerConfig.options.baseURL
      }

      const auth = await Auth.get(providerID)
      if (auth && auth.type === "api") {
        options.apiKey = auth.key
      }

      const env = Env.all()
      if (env.APERTIS_API_KEY) {
        options.apiKey = env.APERTIS_API_KEY
      }
      if (env.APERTIS_BASE_URL) {
        options.baseURL = env.APERTIS_BASE_URL
      }

      log.debug("apertis auth options resolved", {
        providerID,
        hasKey: !!options.apiKey,
        hasBaseURL: !!options.baseURL,
      })
    }
    // kilocode_change end

    return options
  }
}
