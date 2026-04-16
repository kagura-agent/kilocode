import type { KiloClient } from "@kilocode/sdk/v2/client"
import { handleFileSearch } from "./file-search"
import { captureGitChangesContext } from "./git-changes-context"

type Input = {
  message: Record<string, unknown>
  client: KiloClient | null
  dir: (sessionID?: string) => string
  active: () => string | undefined
  open: (dir: string) => Promise<Set<string>>
  post: (message: unknown) => void
  terminal: (requestId: string) => void
  chat: (text: string, requestId: string) => void
  accept: (length?: number) => void
  error: (error: unknown) => string
}

export function handleContextRequest(input: Input): boolean {
  const message = input.message
  const requestId = typeof message.requestId === "string" ? message.requestId : ""
  const sessionID = typeof message.sessionID === "string" ? message.sessionID : undefined
  const dir = typeof message.contextDirectory === "string" ? message.contextDirectory : input.dir(sessionID)
  if (message.type === "requestChatCompletion" && typeof message.text === "string" && requestId) {
    input.chat(message.text, requestId)
    return true
  }
  if (message.type === "requestFileSearch" && typeof message.query === "string" && requestId) {
    void handleFileSearch({
      client: input.client,
      query: message.query,
      requestId,
      dir,
      active: input.active(),
      open: input.open,
      post: input.post,
    })
    return true
  }
  if (message.type === "requestTerminalContext" && requestId) {
    input.terminal(requestId)
    return true
  }
  if (message.type === "requestGitChangesContext" && requestId) {
    void captureGitChangesContext({
      requestId,
      dir,
      client: input.client,
      base: typeof message.gitChangesBase === "string" ? message.gitChangesBase : undefined,
      post: input.post,
      error: input.error,
    })
    return true
  }
  if (message.type === "chatCompletionAccepted") {
    input.accept(typeof message.suggestionLength === "number" ? message.suggestionLength : undefined)
    return true
  }
  return false
}
