import { describe, it } from "bun:test"

describe("legacy migration tools", () => {
  it.todo("creates a fallback tool part from tool_use when there is no matching tool_result", () => {})
  it.todo("merges tool_use and tool_result into one completed tool part using the correct tool id", () => {})
  it.todo("does not duplicate a tool part when a matching tool_result exists later in the conversation", () => {})
})
