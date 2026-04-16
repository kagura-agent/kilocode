import * as vscode from "vscode"

type Message = {
  type?: string
  config?: unknown
  tab?: string
}

type Handler = () => void | Promise<void>

type Handlers = {
  config: Handler
  global: Handler
  indexing: Handler
  update: (config: unknown) => void | Promise<void>
}

export async function handleConfigMessage(message: Message, handlers: Handlers): Promise<boolean> {
  switch (message.type) {
    case "requestConfig":
      await handlers.config()
      return true
    case "requestGlobalConfig":
      await handlers.global()
      return true
    case "requestIndexingStatus":
      await handlers.indexing()
      return true
    case "updateConfig":
      await handlers.update(message.config)
      return true
    case "openSettingsTab":
      if (message.tab === "indexing") {
        await vscode.commands.executeCommand("kilo-code.new.openIndexingSettings")
      }
      return true
    default:
      return false
  }
}
