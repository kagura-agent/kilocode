import type { ProviderConfig } from "@kilocode/sdk/v2"
import { z } from "zod"
import { CUSTOM_PROVIDER_PACKAGE, PROVIDER_ID_PATTERN } from "./provider-model"

const INVALID_PROVIDER_ID = "Invalid provider ID"
const INVALID_ENV = "Invalid environment variable name"
const INVALID_BASE_URL = "Base URL must start with http:// or https://"

const CostSchema = z
  .object({
    input: z.number().finite().nonnegative().optional(),
    output: z.number().finite().nonnegative().optional(),
    cache_read: z.number().finite().nonnegative().optional(),
    cache_write: z.number().finite().nonnegative().optional(),
  })
  .strict()

const LimitSchema = z
  .object({
    context: z.number().int().positive().optional(),
    input: z.number().int().positive().optional(),
    output: z.number().int().positive().optional(),
  })
  .strict()

const ModelSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    cost: CostSchema.optional(),
    limit: LimitSchema.optional(),
  })
  .strict()

export const ProviderIDSchema = z.string().trim().regex(PROVIDER_ID_PATTERN, INVALID_PROVIDER_ID)
export const EnvSchema = z
  .string()
  .trim()
  .regex(/^[A-Z_][A-Z0-9_]*$/, INVALID_ENV)
export const CustomProviderConfigSchema = z
  .object({
    npm: z.string().optional(),
    name: z.string().trim().min(1).max(200),
    env: z.array(EnvSchema).max(1).optional(),
    options: z
      .object({
        baseURL: z
          .string()
          .trim()
          .url()
          .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
            message: INVALID_BASE_URL,
          }),
        headers: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
      })
      .strict(),
    models: z
      .record(z.string().trim().min(1), ModelSchema)
      .refine((value) => Object.keys(value).length > 0, "At least one model is required"),
  })
  .strict()

type SanitizedProviderModel = NonNullable<NonNullable<ProviderConfig["models"]>[string]>

export type SanitizedProviderConfig = ProviderConfig & {
  npm: typeof CUSTOM_PROVIDER_PACKAGE
  name: string
  options: {
    baseURL: string
    headers?: Record<string, string>
  }
  models: Record<string, SanitizedProviderModel>
}

export type CustomProviderAuthChange = { mode: "preserve" } | { mode: "clear" } | { mode: "set"; key: string }

export const MASKED_CUSTOM_PROVIDER_KEY = "********"

type Issue = { error: string; issue?: z.ZodIssue }

function fail(error: string, issue?: z.ZodIssue): Issue {
  return issue ? { error, issue } : { error }
}

function normalizeModel(model: z.output<typeof ModelSchema>): SanitizedProviderModel {
  const cost = model.cost
    ? {
        input: model.cost.input ?? 0,
        output: model.cost.output ?? 0,
        ...(model.cost.cache_read !== undefined ? { cache_read: model.cost.cache_read } : {}),
        ...(model.cost.cache_write !== undefined ? { cache_write: model.cost.cache_write } : {}),
      }
    : undefined
  const limit = model.limit
    ? {
        context: model.limit.context ?? 128_000,
        output: model.limit.output ?? 4_096,
        ...(model.limit.input !== undefined ? { input: model.limit.input } : {}),
      }
    : undefined

  return {
    name: model.name.trim(),
    ...(cost ? { cost } : {}),
    ...(limit ? { limit } : {}),
  }
}

export function validateProviderID(providerID: string): { value: string } | Issue {
  const result = ProviderIDSchema.safeParse(providerID)
  if (result.success) return { value: result.data }
  const issue = result.error.issues[0]
  return fail(issue?.message ?? INVALID_PROVIDER_ID, issue)
}

export function parseCustomProviderSecret(raw: string): { value: { apiKey?: string; env?: string } } | Issue {
  const value = raw.trim()
  if (!value) return { value: {} }

  const match = value.match(/^\{env:([^}]+)\}$/)
  if (!match) return { value: { apiKey: value } }

  const env = match[1]?.trim() ?? ""
  const result = EnvSchema.safeParse(env)
  if (result.success) return { value: { env: result.data } }
  const issue = result.error.issues[0]
  return fail(issue?.message ?? INVALID_ENV, issue)
}

export function resolveCustomProviderAuth(apiKey: string | undefined, changed: boolean): CustomProviderAuthChange {
  const key = apiKey?.trim()
  if (!changed) return { mode: "preserve" }
  if (key) return { mode: "set", key }
  return { mode: "clear" }
}

export function resolveCustomProviderKey(auth: "api" | "oauth" | "wellknown" | undefined) {
  if (auth !== "api") return ""
  return MASKED_CUSTOM_PROVIDER_KEY
}

export function normalizeCustomProviderConfig(
  config: z.output<typeof CustomProviderConfigSchema>,
): SanitizedProviderConfig {
  const headers = config.options.headers
    ? Object.fromEntries(
        Object.entries(config.options.headers)
          .map(([key, value]) => [key.trim(), value.trim()] as const)
          .filter(([key, value]) => key.length > 0 && value.length > 0),
      )
    : undefined

  return {
    npm: CUSTOM_PROVIDER_PACKAGE,
    name: config.name.trim(),
    ...(config.env ? { env: config.env.map((item) => item.trim()) } : {}),
    options: {
      baseURL: config.options.baseURL.trim(),
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    },
    models: Object.fromEntries(
      Object.entries(config.models).map(([id, model]) => [id.trim(), normalizeModel(model)]),
    ) as Record<string, SanitizedProviderModel>,
  }
}

export function sanitizeCustomProviderConfig(provider: unknown): { value: SanitizedProviderConfig } | Issue {
  const result = CustomProviderConfigSchema.safeParse(provider)
  if (!result.success) {
    const issue = result.error.issues[0]
    return fail(issue?.message ?? "Invalid custom provider config", issue)
  }

  return { value: normalizeCustomProviderConfig(result.data) }
}
