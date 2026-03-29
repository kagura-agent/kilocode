import type { KilocodeSessionImportPartData as Part } from "@kilocode/sdk/v2"
import { record } from "./create-parts-util"

export function createToolUsePart(
  partID: string,
  messageID: string,
  sessionID: string,
  created: number,
  part: { type?: string; id?: string; name?: string; input?: unknown },
): NonNullable<Part["body"]> {
  const tool = typeof part.name === "string" ? part.name : "unknown"

  return {
    id: partID,
    messageID,
    sessionID,
    timeCreated: created,
    data: {
      type: "tool",
      callID: part.id ?? partID,
      tool,
      state: {
        // We store tool_use as completed for now because we only have historical snapshots, not live transitions.
        status: "completed",
        input: record(part.input),
        output: tool,
        title: tool,
        metadata: {},
        time: {
          start: created,
          end: created,
        },
      },
    },
  }
}

export function createSimpleTextPart(
  partID: string,
  messageID: string,
  sessionID: string,
  created: number,
  text: string,
): NonNullable<Part["body"]> {
  return {
    id: partID,
    messageID,
    sessionID,
    timeCreated: created,
    data: {
      type: "text",
      text,
      time: {
        start: created,
        end: created,
      },
    },
  }
}

export function createTextPartWithinMessage(
  partID: string,
  messageID: string,
  sessionID: string,
  created: number,
  text: string,
): NonNullable<Part["body"]> {
  return {
    id: partID,
    messageID,
    sessionID,
    timeCreated: created,
    data: {
      type: "text",
      text,
      time: {
        start: created,
        end: created,
      },
    },
  }
}

export function createReasoningPart(
  partID: string,
  messageID: string,
  sessionID: string,
  created: number,
  text: string,
): NonNullable<Part["body"]> {
  return {
    id: partID,
    messageID,
    sessionID,
    timeCreated: created,
    data: {
      type: "reasoning",
      text,
      time: {
        start: created,
        end: created,
      },
    },
  }
}
