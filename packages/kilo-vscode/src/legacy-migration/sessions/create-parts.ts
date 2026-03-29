import type { KilocodeSessionImportPartData as Part } from "@kilocode/sdk/v2"
import type { LegacyApiMessage, LegacyHistoryItem } from "./legacy-session-types"
import { getApiConversationHistory, parseFile } from "./api-history"
import { createMessageID, createPartID, createSessionID } from "./ids"
import { createReasoningPart, createSimpleTextPart, createTextPartWithinMessage, createToolUsePart } from "./create-parts-builders"
import {
  isReasoningPart,
  isSimpleTextPart,
  isSingleTextPartWithinMessage,
  isToolResult,
  isToolUse,
} from "./create-parts-util"
import { mergeToolUseAndResult, thereIsNoToolResult } from "./merge-tool-parts"

export async function createParts(id: string, dir: string, item?: LegacyHistoryItem): Promise<Array<NonNullable<Part["body"]>>> {
  const file = await getApiConversationHistory(id, dir)
  const conversation = parseFile(file)

  return conversation.flatMap((entry, index) => parseParts(entry, index, id, item))
}

function parseParts(
  entry: LegacyApiMessage,
  index: number,
  id: string,
  item?: LegacyHistoryItem,
): Array<NonNullable<Part["body"]>> {
  const messageID = createMessageID(id, index)
  const sessionID = createSessionID(id)
  const created = entry.ts ?? item?.ts ?? 0

  if (isSimpleTextPart(entry)) {
    return [createSimpleTextPart(createPartID(id, index, 0), messageID, sessionID, created, entry.content)]
  }

  if (!Array.isArray(entry.content)) return []

  const parts: Array<NonNullable<Part["body"]>> = []

  entry.content.forEach((part, partIndex) => {
    const partID = createPartID(id, index, partIndex)

    // Legacy can store a message as several pieces; this handles one text block inside that larger message.
    if (isSingleTextPartWithinMessage(part)) {
      parts.push(createTextPartWithinMessage(partID, messageID, sessionID, created, part.text))
      return
    }

    if (isToolUse(part) && thereIsNoToolResult(entry, part.id)) {
      parts.push(createToolUsePart(partID, messageID, sessionID, created, part))
      return
    }

    if (isToolResult(part)) {
      const tool = mergeToolUseAndResult(partID, messageID, sessionID, created, entry, part)
      if (!tool) return
      parts.push(tool)
      return
    }

    if (isReasoningPart(entry)) {
      parts.push(createReasoningPart(partID, messageID, sessionID, created, entry.text))
    }
  })

  return parts
}
