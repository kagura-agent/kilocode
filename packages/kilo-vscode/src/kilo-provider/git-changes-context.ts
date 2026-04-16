import type { KiloClient } from "@kilocode/sdk/v2/client"
import { getGitChangesContext } from "../services/git/context"

const LIMIT = 400_000

type Input = {
  requestId: string
  dir: string
  client: KiloClient | null
  base?: string
  post: (message: unknown) => void
  error: (error: unknown) => string
}

export async function captureGitChangesContext(input: Input): Promise<void> {
  try {
    const output =
      input.client && input.base
        ? await worktree(input.client, input.dir, input.base)
        : await getGitChangesContext(input.dir)
    input.post({
      type: "gitChangesContextResult",
      requestId: input.requestId,
      content: output.content,
      truncated: output.truncated,
    })
  } catch (error) {
    console.error("[Kilo New] Failed to capture git changes context:", error)
    input.post({
      type: "gitChangesContextError",
      requestId: input.requestId,
      error: input.error(error) || "Failed to capture git changes",
    })
  }
}

async function worktree(
  client: KiloClient,
  dir: string,
  base: string,
): Promise<{ content: string; truncated: boolean }> {
  const { data } = await client.worktree.diff({ directory: dir, base }, { throwOnError: true })
  const files = data ?? []
  if (files.length === 0) {
    return { content: `Working directory: ${dir}\nBase: ${base}\n\nNo changes in worktree diff.`, truncated: false }
  }

  const parts = [
    `Working directory: ${dir}`,
    `Base: ${base}`,
    "",
    "Files:",
    ...files.map((file) => `${label(file.status)} ${file.file} (+${file.additions} -${file.deletions})`),
    "",
    "Diff:",
    ...files.map((file) => file.patch?.trim() || `(No diff available for ${file.file})`),
  ]
  return cap(parts.join("\n"))
}

function label(status: string | undefined) {
  if (status === "added") return "A"
  if (status === "deleted") return "D"
  return "M"
}

function cap(content: string) {
  if (Buffer.byteLength(content, "utf8") <= LIMIT) return { content, truncated: false }
  const text = Buffer.from(content, "utf8").subarray(0, LIMIT).toString("utf8")
  return { content: `${text}\n\nOutput truncated.`, truncated: true }
}
