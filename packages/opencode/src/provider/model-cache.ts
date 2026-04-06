// kilocode_change new file
import { fetchKiloModels } from "@kilocode/kilo-gateway"
import { Config } from "../config/config"
import { Auth } from "../auth"
import { Env } from "../env"
import { Log } from "../util/log"

export namespace ModelCache {
  const log = Log.create({ service: "model-cache" })

  // Cache structure — keyed by "providerID:optionsFingerprint" so that
  // config changes (org ID, base URL, etc.) automatically cause a cache miss
  // rather than serving the previous model set until TTL expiry.
  const cache = new Map<
    string,
    {
      models: Record<string, any>
      timestamp: number
    }
  >()

  const TTL = 5 * 60 * 1000 // 5 minutes
  const inFlightRefresh = new Map<string, Promise<Record<string, any>>>()
  // Set of keys whose in-flight refresh has been cancelled by clear()
  const cancelled = new Set<string>()

  /**
   * Stable fingerprint of the options that affect which models are returned.
   * Only includes fields that change the model set (org ID, base URL).
   * Keeps the key short and deterministic without a full JSON sort.
   */
  function fingerprint(providerID: string, options?: any): string {
    if (!options) return providerID
    const parts: string[] = [providerID]
    if (options.kilocodeOrganizationId) parts.push(`org:${options.kilocodeOrganizationId}`)
    if (options.baseURL) parts.push(`url:${options.baseURL}`)
    return parts.join("|")
  }

  /**
   * Get cached models for a provider + options combination.
   * Returns stale entries too (caller decides what to do with them).
   * @param providerID - Provider identifier
   * @param options - Same options passed to fetch/refresh
   * @returns Cached entry with stale flag, or undefined on cache miss
   */
  export function get(providerID: string, options?: any): { models: Record<string, any>; stale: boolean } | undefined {
    const key = fingerprint(providerID, options)
    const cached = cache.get(key)

    if (!cached) {
      log.debug("cache miss", { key })
      return undefined
    }

    const age = Date.now() - cached.timestamp

    if (age > TTL) {
      log.debug("cache stale", { key, age })
      return { models: cached.models, stale: true }
    }

    log.debug("cache hit", { key, age })
    return { models: cached.models, stale: false }
  }

  /**
   * Fetch models with cache-first + stale-while-revalidate approach.
   * If cached data exists but is stale, it is returned immediately while
   * a background refresh is kicked off to update the cache.
   * @param providerID - Provider identifier
   * @param options - Provider options (org ID, base URL, etc.)
   * @returns Models from cache or freshly fetched
   */
  export async function fetch(providerID: string, options?: any): Promise<Record<string, any>> {
    const key = fingerprint(providerID, options)
    const entry = get(providerID, options)

    if (entry) {
      if (!entry.stale) return entry.models
      // Stale — return immediately and revalidate in background
      log.info("returning stale models, revalidating in background", { key })
      refresh(providerID, options).catch(() => {})
      return entry.models
    }

    // Cold cache miss — must block on fetch
    log.info("fetching models", { key })

    try {
      const authOptions = await getAuthOptions(providerID)
      const mergedOptions = { ...authOptions, ...options }

      const models = await fetchModels(providerID, mergedOptions)

      cache.set(key, {
        models,
        timestamp: Date.now(),
      })

      log.info("models fetched and cached", { key, count: Object.keys(models).length })
      return models
    } catch (error) {
      log.error("failed to fetch models", { key, error })
      return {}
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
    const key = fingerprint(providerID, options)

    // Check if refresh already in progress for this exact key
    const existing = inFlightRefresh.get(key)
    if (existing) {
      log.debug("refresh already in progress, returning existing promise", { key })
      return existing
    }

    // Track cancellation for this key before starting the async work
    cancelled.delete(key)

    // Create new refresh promise
    const refreshPromise = (async () => {
      log.info("refreshing models", { key })

      try {
        const authOptions = await getAuthOptions(providerID)
        const mergedOptions = { ...authOptions, ...options }

        const models = await fetchModels(providerID, mergedOptions)

        // Only write back if this refresh was not cancelled by clear()
        if (!cancelled.has(key)) {
          cache.set(key, {
            models,
            timestamp: Date.now(),
          })
          log.info("models refreshed", { key, count: Object.keys(models).length })
        } else {
          log.info("refresh cancelled by clear(), discarding result", { key })
          cancelled.delete(key)
        }

        return models
      } catch (error) {
        log.error("failed to refresh models", { key, error })

        const cached = cache.get(key)
        if (cached) {
          log.debug("returning stale cache after refresh failure", { key })
          return cached.models
        }

        return {}
      }
    })()

    inFlightRefresh.set(key, refreshPromise)

    try {
      return await refreshPromise
    } finally {
      inFlightRefresh.delete(key)
    }
  }

  /**
   * Clear all cached entries for a provider (all option variants).
   * Called on auth changes — wipes every fingerprinted key for the providerID.
   * @param providerID - Provider identifier
   */
  export function clear(providerID: string): void {
    const prefix = providerID + "|"
    let count = 0
    for (const key of cache.keys()) {
      if (key === providerID || key.startsWith(prefix)) {
        cache.delete(key)
        count++
      }
    }
    // Also cancel any in-flight refreshes for this provider so that a stale
    // refresh completing after the clear cannot write old models back into cache.
    for (const key of inFlightRefresh.keys()) {
      if (key === providerID || key.startsWith(prefix)) {
        cancelled.add(key)
        inFlightRefresh.delete(key)
      }
    }
    if (count > 0) {
      log.info("cache cleared", { providerID, count })
    } else {
      log.debug("no cache to clear", { providerID })
    }
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
