import type { LegacyApiMessage } from "./legacy-session-types"

type ToolUse = {
  type?: string
  id?: string
  name?: string
  input?: unknown
}

export function isSimpleTextPart(input: LegacyApiMessage): input is LegacyApiMessage & { content: string } {
  return typeof input.content === "string" && Boolean(input.content)
}

export function isReasoningPart(input: LegacyApiMessage): input is LegacyApiMessage & { type: "reasoning"; text: string } {
  return input.type === "reasoning" && typeof input.text === "string" && Boolean(input.text)
}

export function isSingleTextPartWithinMessage(input: unknown): input is { type?: string; text: string } {
  return isText(input) && Boolean(input.text)
}

export function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

export function isToolUse(input: unknown): input is { type?: string; id?: string; name?: string; input?: unknown } {
  return Boolean(input && typeof input === "object" && "type" in input && input.type === "tool_use")
}

export function isText(input: unknown): input is { type?: string; text?: string } {
  return Boolean(input && typeof input === "object" && "type" in input && input.type === "text")
}

export function isToolResult(input: unknown): input is { type?: string; tool_use_id?: string; content?: unknown } {
  return Boolean(input && typeof input === "object" && "type" in input && input.type === "tool_result")
}

// This looks through the blocks inside one legacy message and finds the tool_use whose id
// matches the tool_result we are processing, so we know which tool call produced that result.
export function getToolUse(input: LegacyApiMessage, id: string | undefined) {
  if (!Array.isArray(input.content)) return undefined
  return input.content.find((part) => isToolUse(part) && part.id === id) as ToolUse | undefined
}

export function getText(input: unknown) {
  if (typeof input === "string") return input
  if (!Array.isArray(input)) return undefined
  const text = input
    .flatMap((item) => {
      if (isText(item) && item.text) return [item.text]
      return []
    })
    .join("\n")
    .trim()
  return text || undefined
}
