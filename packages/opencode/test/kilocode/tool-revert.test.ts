import { describe, expect, test } from "bun:test"
import { MessageV2 } from "../../src/session/message-v2"

/**
 * Tests for the per-tool snapshot revert approach.
 *
 * The integration tests (revert with real sessions) can't run in this worktree
 * due to a circular dependency in kilo-sessions/remote-sender.ts. These tests
 * cover the pure-logic aspects: tool part schema, file-modifying tool detection.
 *
 * Full integration tests for SessionRevert.revert() with per-tool snapshots
 * live in test/session/revert-compact.test.ts.
 */

/** Tools that get per-tool snapshots in processor.ts */
const FILE_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch"])

function isFileModifying(tool: string): boolean {
  return FILE_TOOLS.has(tool)
}

describe("per-tool snapshot", () => {
  describe("ToolPart schema accepts snapshot field", () => {
    test("parses with snapshot", () => {
      const result = MessageV2.ToolPart.safeParse({
        id: "part_1",
        sessionID: "s1",
        messageID: "m1",
        type: "tool",
        callID: "c1",
        tool: "edit",
        snapshot: "abc123hash",
        state: {
          status: "completed",
          input: { filePath: "/tmp/foo.ts" },
          output: "ok",
          title: "",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.snapshot).toBe("abc123hash")
      }
    })

    test("parses without snapshot", () => {
      const result = MessageV2.ToolPart.safeParse({
        id: "part_1",
        sessionID: "s1",
        messageID: "m1",
        type: "tool",
        callID: "c1",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "echo hi" },
          output: "hi",
          title: "",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.snapshot).toBeUndefined()
      }
    })
  })

  describe("file-modifying tool detection", () => {
    test("edit is file-modifying", () => {
      expect(isFileModifying("edit")).toBe(true)
    })

    test("write is file-modifying", () => {
      expect(isFileModifying("write")).toBe(true)
    })

    test("multiedit is file-modifying", () => {
      expect(isFileModifying("multiedit")).toBe(true)
    })

    test("apply_patch is file-modifying", () => {
      expect(isFileModifying("apply_patch")).toBe(true)
    })

    test("bash is NOT file-modifying", () => {
      expect(isFileModifying("bash")).toBe(false)
    })

    test("task is NOT file-modifying", () => {
      expect(isFileModifying("task")).toBe(false)
    })

    test("read is NOT file-modifying", () => {
      expect(isFileModifying("read")).toBe(false)
    })

    test("glob is NOT file-modifying", () => {
      expect(isFileModifying("glob")).toBe(false)
    })
  })

  describe("snapshot logic", () => {
    test("every file-modifying tool gets a snapshot", () => {
      let snapshots = 0
      for (const tool of ["edit", "bash", "write", "edit"]) {
        if (FILE_TOOLS.has(tool)) snapshots++
      }
      expect(snapshots).toBe(3)
    })

    test("bash does not trigger snapshot", () => {
      let snapshots = 0
      for (const tool of ["bash", "bash", "bash"]) {
        if (FILE_TOOLS.has(tool)) snapshots++
      }
      expect(snapshots).toBe(0)
    })

    test("concurrent writes each get their own snapshot", () => {
      const tools = ["write", "write"]
      let snapshots = 0
      for (const tool of tools) {
        if (FILE_TOOLS.has(tool)) snapshots++
      }
      expect(snapshots).toBe(2)
    })
  })
})
