import * as path from "path"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import { mergeFileSearchResults } from "../kilo-provider-utils"

type Input = {
  client: KiloClient | null
  query: string
  requestId: string
  dir: string
  active?: string
  open: (dir: string) => Promise<Set<string>>
  post: (message: unknown) => void
}

export async function handleFileSearch(input: Input): Promise<void> {
  if (!input.client) {
    input.post({ type: "fileSearchResult", paths: [], dir: "", requestId: input.requestId })
    return
  }

  try {
    const open = input.dir ? await input.open(input.dir) : new Set<string>()
    const active = activePath(input.dir, input.active)
    const { data } = await input.client.find.files(
      { query: input.query, directory: input.dir, type: "file", limit: 50 },
      { throwOnError: true },
    )
    const paths = mergeFileSearchResults({ query: input.query, backend: data, open, active })
    input.post({ type: "fileSearchResult", paths, dir: input.dir, requestId: input.requestId })
  } catch (error) {
    console.error("[Kilo New] File search failed:", error)
    input.post({ type: "fileSearchResult", paths: [], dir: input.dir, requestId: input.requestId })
  }
}

function activePath(dir: string, active?: string) {
  if (!dir || !active) return undefined
  const root = path.resolve(dir)
  const file = path.resolve(active)
  if (file !== root && !file.startsWith(root + path.sep)) return undefined
  return path.relative(root, file).replaceAll("\\", "/")
}
