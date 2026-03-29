import * as vscode from "vscode"
import type { KiloClient } from "@kilocode/sdk/v2/client"
import type { LegacyHistoryItem } from "./legacy-session-types"
import { normalizeSession } from "./normalize-session"

export async function migrateSession(id: string, context: vscode.ExtensionContext, client: KiloClient) {
  const dir = vscode.Uri.joinPath(context.globalStorageUri, "tasks").fsPath
  const items = context.globalState.get<LegacyHistoryItem[]>("taskHistory", [])
  const item = items.find((item) => item.id === id)
  const payload = await normalizeSession(id, dir, item)

  try {
    await client.kilocode.sessionImport.project(payload.project, { throwOnError: true })
    await client.kilocode.sessionImport.session(payload.session, { throwOnError: true })

    for (const msg of payload.messages) {
      await client.kilocode.sessionImport.message(msg, { throwOnError: true })
    }

    for (const part of payload.parts) {
      await client.kilocode.sessionImport.part(part, { throwOnError: true })
    }

    return {
      ok: true,
      payload,
    }
  } catch (error) {
    return {
      ok: false,
      payload,
      error,
    }
  }
}
