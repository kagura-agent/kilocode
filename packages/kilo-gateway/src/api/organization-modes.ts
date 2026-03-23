import { z } from "zod"
import { KILO_API_BASE } from "./constants.js"
import { buildKiloHeaders } from "../headers.js"

/**
 * Schema for a single organization mode returned by the Kilo API.
 * The API returns a wrapper with top-level name/slug and a nested config object.
 */
const OrgModeConfigSchema = z.object({
  roleDefinition: z.string().optional(),
  groups: z
    .array(
      z.union([
        z.string(),
        z.tuple([z.string(), z.object({ fileRegex: z.string().optional(), description: z.string().optional() })]),
      ]),
    )
    .optional()
    .default([]),
  customInstructions: z.string().optional(),
  whenToUse: z.string().optional(),
  description: z.string().optional(),
})

const OrgModeWrapperSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  config: OrgModeConfigSchema,
})

const OrgModesResponseSchema = z.object({
  modes: z.array(OrgModeWrapperSchema),
})

export interface OrganizationMode {
  slug: string
  name: string
  description?: string
  roleDefinition?: string
  groups: Array<string | [string, { fileRegex?: string; description?: string }]>
  customInstructions?: string
}

/**
 * Fetch organization custom modes from the Kilo API.
 *
 * Calls GET /api/organizations/{orgId}/modes and returns validated modes.
 * Returns an empty array on any error (network, auth, malformed response).
 */
export async function fetchOrganizationModes(token: string, organizationId: string): Promise<OrganizationMode[]> {
  const url = `${KILO_API_BASE}/api/organizations/${organizationId}/modes`

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...buildKiloHeaders(undefined, { kilocodeOrganizationId: organizationId }),
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      console.warn(`[Kilo Gateway] Failed to fetch org modes: ${response.status}`)
      return []
    }

    const json = await response.json()
    const result = OrgModesResponseSchema.safeParse(json)

    if (!result.success) {
      console.warn("[Kilo Gateway] Org modes response validation failed:", result.error.format())
      return []
    }

    return result.data.modes.map((wrapper) => ({
      slug: wrapper.slug,
      name: wrapper.name,
      description: wrapper.config.description ?? wrapper.config.whenToUse,
      roleDefinition: wrapper.config.roleDefinition,
      groups: wrapper.config.groups,
      customInstructions: wrapper.config.customInstructions,
    }))
  } catch (error) {
    console.warn("[Kilo Gateway] Error fetching org modes:", error)
    return []
  }
}
