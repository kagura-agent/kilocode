/**
 * Provider action handlers extracted from KiloProvider to stay under max-lines.
 * These are pure async functions that operate on the SDK client — no vscode dependency.
 */
import type { KiloClient } from "@kilocode/sdk/v2"
import { validateProviderID as validateProviderIDShared } from "./shared/custom-provider"
import { resolveCustomProviderAuth, sanitizeCustomProviderConfig } from "./shared/custom-provider"
import { KILO_AUTO, parseModelString } from "./shared/provider-model"

/**
 * Compute the default model selection from CLI config, VS Code settings, or hardcoded fallback.
 * Pure function — takes cachedConfig and vscode settings as parameters.
 */
type AuthState = "api" | "oauth" | "wellknown"

/** Fetch auth methods alongside the provider list. Auth states default to empty (endpoint not yet available). */
export async function fetchProviderData(client: KiloClient, dir: string) {
  const authRequest =
    typeof client.provider.auth === "function"
      ? client.provider
          .auth({ directory: dir }, { throwOnError: true })
          .then((r) => r.data ?? {})
          .catch(() => ({}))
      : Promise.resolve({})

  const [{ data: response }, authMethods] = await Promise.all([
    client.provider.list({ directory: dir }, { throwOnError: true }),
    authRequest,
  ])
  const authStates: Record<string, AuthState> = {}
  const all = response.all.map((item) => {
    const raw = item as Record<string, unknown>
    if (typeof raw.id === "string" && typeof raw.key === "string" && raw.key) {
      authStates[raw.id] = "api"
    }
    if (!("key" in raw)) return item
    const next = { ...raw }
    delete next.key
    return next as (typeof response.all)[number]
  })
  return { response: { ...response, all }, authMethods, authStates }
}

export function buildActionContext(
  client: KiloClient,
  post: (msg: unknown) => void,
  errFn: (err: unknown) => string,
  dir: string,
  refresh: () => Promise<void>,
): ActionContext {
  return {
    client,
    postMessage: post,
    getErrorMessage: errFn,
    workspaceDir: dir,
    disposeGlobal: async (reason: string) => {
      // Wait for the server to finish disposing before refreshing providers.
      // Shared State.dispose() now has a hard per-disposer timeout, so this
      // wait is bounded without needing a client-side timeout here.
      await client.global.dispose().catch((error: unknown) => {
        console.warn(`[Kilo New] KiloProvider: global.dispose() after ${reason} failed:`, error)
      })
    },
    fetchAndSendProviders: refresh,
  }
}

function isModelSelection(r: unknown): r is { providerID: string; modelID: string } {
  return (
    !!r &&
    typeof r === "object" &&
    typeof (r as Record<string, unknown>).providerID === "string" &&
    typeof (r as Record<string, unknown>).modelID === "string"
  )
}

/** Validate and sanitize recent model selections from untrusted sources. */
export function validateRecents(raw: unknown): Array<{ providerID: string; modelID: string }> {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isModelSelection)
    .slice(0, 5)
    .map((r) => ({ providerID: r.providerID, modelID: r.modelID }))
}

/** Validate and sanitize favorite model selections from untrusted sources. */
export function validateFavorites(raw: unknown): Array<{ providerID: string; modelID: string }> {
  if (!Array.isArray(raw)) return []
  return raw.filter(isModelSelection).map((r) => ({ providerID: r.providerID, modelID: r.modelID }))
}

export function computeDefaultSelection(
  cachedConfig: { config?: { model?: string } } | null,
  vscodePID: string,
  vscodeMID: string,
): { providerID: string; modelID: string } {
  const configured = parseModelString(cachedConfig?.config?.model)
  if (configured) return configured
  if (vscodePID && vscodeMID) return { providerID: vscodePID, modelID: vscodeMID }
  return { ...KILO_AUTO }
}

type PostMessage = (message: unknown) => void
type GetErrorMessage = (error: unknown) => string
type Store = {
  get<T>(key: string): T | undefined
  update(key: string, value: unknown): PromiseLike<void>
}

type ModelSelection = { providerID: string; modelID: string }

type StoredContext = {
  msg: Record<string, unknown>
  store?: Store
  postMessage: PostMessage
  notifyFavoritesChanged: (favorites: ModelSelection[]) => void
}

function updateFavorites(current: ModelSelection[], next: ModelSelection & { action: "add" | "remove" }) {
  const key = `${next.providerID}/${next.modelID}`
  const exists = current.some((f) => `${f.providerID}/${f.modelID}` === key)
  if (next.action === "add" && !exists) return [...current, { providerID: next.providerID, modelID: next.modelID }]
  if (next.action === "remove" && exists) return current.filter((f) => `${f.providerID}/${f.modelID}` !== key)
  return current
}

export async function handleStoredModelMessage(ctx: StoredContext): Promise<boolean> {
  switch (ctx.msg.type) {
    case "persistVariant": {
      const msg = ctx.msg as { key: string; value: string }
      const stored = ctx.store?.get<Record<string, string>>("variantSelections") ?? {}
      stored[msg.key] = msg.value
      await ctx.store?.update("variantSelections", stored)
      return true
    }
    case "requestVariants": {
      const variants = ctx.store?.get<Record<string, string>>("variantSelections") ?? {}
      ctx.postMessage({ type: "variantsLoaded", variants })
      return true
    }
    case "persistRecents": {
      const msg = ctx.msg as { recents: unknown }
      await ctx.store?.update("recentModels", validateRecents(msg.recents))
      return true
    }
    case "requestRecents": {
      const recents = validateRecents(ctx.store?.get("recentModels"))
      ctx.postMessage({ type: "recentsLoaded", recents })
      return true
    }
    case "toggleFavorite": {
      const msg = ctx.msg as ModelSelection & { action: "add" | "remove" }
      const current = validateFavorites(ctx.store?.get("favoriteModels"))
      const favorites = updateFavorites(current, msg)
      await ctx.store?.update("favoriteModels", favorites)
      ctx.notifyFavoritesChanged(favorites)
      return true
    }
    case "requestFavorites": {
      const favorites = validateFavorites(ctx.store?.get("favoriteModels"))
      ctx.postMessage({ type: "favoritesLoaded", favorites })
      return true
    }
  }
  return false
}

interface ActionContext {
  client: KiloClient
  postMessage: PostMessage
  getErrorMessage: GetErrorMessage
  workspaceDir: string
  disposeGlobal: (reason: string) => Promise<void>
  fetchAndSendProviders: () => Promise<void>
}

function postError(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  action: "connect" | "disconnect" | "authorize",
  message: string,
) {
  ctx.postMessage({ type: "providerActionError", requestId, providerID, action, message })
}

function validateID(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  action: "connect" | "disconnect" | "authorize",
): string | null {
  const result = validateProviderIDShared(providerID)
  if ("value" in result) return result.value
  postError(ctx, requestId, providerID, action, result.error)
  return null
}

export async function connectProvider(ctx: ActionContext, requestId: string, providerID: string, apiKey: string) {
  const id = validateID(ctx, requestId, providerID, "connect")
  if (!id) return
  try {
    await ctx.client.auth.set({ providerID: id, auth: { type: "api", key: apiKey } }, { throwOnError: true })
    await ctx.disposeGlobal(`provider connect (${id})`)
    await ctx.fetchAndSendProviders()
    ctx.postMessage({ type: "providerConnected", requestId, providerID: id })
  } catch (error) {
    postError(ctx, requestId, providerID, "connect", ctx.getErrorMessage(error) || "Failed to connect provider")
  }
}

export async function authorizeProviderOAuth(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  method: number,
) {
  const id = validateID(ctx, requestId, providerID, "authorize")
  if (!id) return
  try {
    const { data: authorization } = await ctx.client.provider.oauth.authorize(
      { providerID: id, method, directory: ctx.workspaceDir },
      { throwOnError: true },
    )
    if (!authorization) {
      postError(ctx, requestId, providerID, "authorize", "Failed to start provider authorization")
      return
    }
    ctx.postMessage({ type: "providerOAuthReady", requestId, providerID: id, authorization })
  } catch (error) {
    postError(
      ctx,
      requestId,
      providerID,
      "authorize",
      ctx.getErrorMessage(error) || "Failed to start provider authorization",
    )
  }
}

export async function completeProviderOAuth(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  method: number,
  code?: string,
) {
  const id = validateID(ctx, requestId, providerID, "connect")
  if (!id) return
  try {
    await ctx.client.provider.oauth.callback(
      { providerID: id, method, code, directory: ctx.workspaceDir },
      { throwOnError: true },
    )
    await ctx.disposeGlobal(`provider oauth (${id})`)
    await ctx.fetchAndSendProviders()
    ctx.postMessage({ type: "providerConnected", requestId, providerID: id })
  } catch (error) {
    postError(
      ctx,
      requestId,
      providerID,
      "connect",
      ctx.getErrorMessage(error) || "Failed to complete provider authorization",
    )
  }
}

export async function disconnectProvider(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  cachedConfigMessage: unknown,
  setCachedConfig: (msg: unknown) => void,
) {
  const id = validateID(ctx, requestId, providerID, "disconnect")
  if (!id) return
  try {
    const globalConfig = (await ctx.client.global.config.get({ throwOnError: true })).data ?? {}
    const configured = !!globalConfig.provider?.[id]

    // Remove auth store entry. Config-sourced providers may not have an auth
    // store entry (credentials come from config or env), so failure is non-fatal.
    // For auth-only providers, failure means disconnect failed.
    try {
      await ctx.client.auth.remove({ providerID: id }, { throwOnError: true })
    } catch (err) {
      if (!configured) throw err
      console.warn(`[Kilo New] auth.remove failed for configured provider ${id} (non-fatal):`, err)
    }

    if (id === "kilo") {
      ctx.postMessage({ type: "profileData", data: null })
    }

    // Config-sourced providers stay "connected" after auth.remove because the
    // server rebuilds state from config. Add to disabled_providers so the server
    // excludes them. The config entry is preserved (user may re-enable later).
    // This matches the desktop app's disableProvider() pattern.
    if (configured) {
      const disabled = globalConfig.disabled_providers ?? []
      if (!disabled.includes(id)) {
        const merged = (
          await ctx.client.global.config.update(
            { config: { disabled_providers: [...disabled, id] } },
            { throwOnError: true },
          )
        ).data
        if (merged) {
          setCachedConfig({ type: "configLoaded", config: merged })
          ctx.postMessage({ type: "configUpdated", config: merged })
        }
      }
    }

    await ctx.disposeGlobal(`provider disconnect (${id})`)
    await ctx.fetchAndSendProviders()
    ctx.postMessage({ type: "providerDisconnected", requestId, providerID: id })
  } catch (error) {
    postError(ctx, requestId, providerID, "disconnect", ctx.getErrorMessage(error) || "Failed to disconnect provider")
  }
}

export async function saveCustomProvider(
  ctx: ActionContext,
  requestId: string,
  providerID: string,
  provider: Record<string, unknown>,
  apiKey: string | undefined,
  apiKeyChanged: boolean,
  cachedConfigMessage: unknown,
  setCachedConfig: (msg: unknown) => void,
) {
  const id = validateID(ctx, requestId, providerID, "connect")
  if (!id) return

  const sanitized = sanitizeCustomProviderConfig(provider)
  if ("error" in sanitized) {
    postError(ctx, requestId, providerID, "connect", sanitized.error)
    return
  }

  const refresh = async () => {
    await ctx.disposeGlobal(`custom provider save (${id})`)
    await ctx.fetchAndSendProviders()
  }

  try {
    const globalConfig = (await ctx.client.global.config.get({ throwOnError: true })).data ?? {}
    const disabled = globalConfig.disabled_providers ?? []
    const nextDisabled = disabled.filter((item: string) => item !== id)
    const { data: updated } = await ctx.client.global.config.update(
      {
        config: {
          provider: { [id]: sanitized.value },
          disabled_providers: nextDisabled,
        },
      },
      { throwOnError: true },
    )

    const msg = { type: "configLoaded", config: updated }
    setCachedConfig(msg)
    ctx.postMessage({ type: "configUpdated", config: updated })

    const auth = resolveCustomProviderAuth(apiKey, apiKeyChanged)

    try {
      if (auth.mode === "set") {
        await ctx.client.auth.set({ providerID: id, auth: { type: "api", key: auth.key } }, { throwOnError: true })
      }
      if (auth.mode === "clear") {
        await ctx.client.auth.remove({ providerID: id }, { throwOnError: true })
      }
    } catch (error) {
      await refresh()
      postError(ctx, requestId, providerID, "connect", ctx.getErrorMessage(error) || "Failed to save custom provider")
      return
    }

    await refresh()
    ctx.postMessage({ type: "providerConnected", requestId, providerID: id })
  } catch (error) {
    postError(ctx, requestId, providerID, "connect", ctx.getErrorMessage(error) || "Failed to save custom provider")
  }
}
