/**
 * Apply chat-specific post-processing to a suggestion:
 * - Filter suggestions that look like code comments
 * - Truncate at first newline (chat is single-line)
 * - Trim trailing whitespace
 * Returns empty string when the suggestion should be discarded.
 */
export function finalizeChatSuggestion(cleaned: string): string {
  if (!cleaned) return ""

  if (cleaned.match(/^(\/\/|\/\*|\*|#)/)) {
    return ""
  }

  const firstNewline = cleaned.indexOf("\n")
  const truncated = firstNewline !== -1 ? cleaned.substring(0, firstNewline) : cleaned
  return truncated.trimEnd()
}

/**
 * Build the prefix string for a chat completion request from user text, visible code context,
 * and prompt history.
 */
export function buildChatPrefix(
  userText: string,
  editors?: Array<{
    filePath: string
    languageId: string
    visibleRanges: Array<{ content: string }>
  }>,
  history?: string[],
  lastResponse?: string,
): string {
  const parts: string[] = []
  if (editors && editors.length > 0) {
    parts.push("// Code visible in editor:")
    for (const editor of editors) {
      const fileName = editor.filePath.split("/").pop() || editor.filePath
      parts.push(`\n// File: ${fileName} (${editor.languageId})`)
      for (const range of editor.visibleRanges) {
        parts.push(range.content)
      }
    }
  }
  if (history && history.length > 0) {
    parts.push("\n// Recent prompts by the user:")
    for (const prompt of history) {
      parts.push(`// - ${prompt}`)
    }
  }
  if (lastResponse) {
    parts.push("\n// Last assistant response:")
    parts.push(`// ${lastResponse}`)
  }
  parts.push("\n// User's message:")
  parts.push(userText)
  return parts.join("\n")
}
