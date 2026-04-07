import { describe, it, expect } from "bun:test"

/** Tools whose execution modifies files on disk (mirrors AssistantMessage.tsx). */
const FILE_MODIFYING_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch"])

/** Check whether a tool part modifies files. */
function isFileModifying(part: { type: string; tool?: string; state?: { status: string } }): boolean {
  if (part.type !== "tool") return false
  return FILE_MODIFYING_TOOLS.has(part.tool ?? "") && part.state?.status === "completed"
}

/** Extract file paths from a tool's state.input. */
function extractFiles(tool: string, input: Record<string, unknown>): string[] | undefined {
  if (!FILE_MODIFYING_TOOLS.has(tool)) return undefined
  const fp = input.filePath ?? input.file_path ?? input.path
  if (typeof fp === "string") return [fp]
  return undefined
}

describe("tool-revert-utils", () => {
  describe("isFileModifying", () => {
    it("returns true for completed edit", () => {
      expect(isFileModifying({ type: "tool", tool: "edit", state: { status: "completed" } })).toBe(true)
    })

    it("returns true for completed write", () => {
      expect(isFileModifying({ type: "tool", tool: "write", state: { status: "completed" } })).toBe(true)
    })

    it("returns true for completed multiedit", () => {
      expect(isFileModifying({ type: "tool", tool: "multiedit", state: { status: "completed" } })).toBe(true)
    })

    it("returns true for completed apply_patch", () => {
      expect(isFileModifying({ type: "tool", tool: "apply_patch", state: { status: "completed" } })).toBe(true)
    })

    it("returns false for running edit", () => {
      expect(isFileModifying({ type: "tool", tool: "edit", state: { status: "running" } })).toBe(false)
    })

    it("returns false for bash tool", () => {
      expect(isFileModifying({ type: "tool", tool: "bash", state: { status: "completed" } })).toBe(false)
    })

    it("returns false for read tool", () => {
      expect(isFileModifying({ type: "tool", tool: "read", state: { status: "completed" } })).toBe(false)
    })

    it("returns false for text parts", () => {
      expect(isFileModifying({ type: "text" })).toBe(false)
    })

    it("returns false for step-start parts", () => {
      expect(isFileModifying({ type: "step-start" })).toBe(false)
    })

    it("returns false for glob tool", () => {
      expect(isFileModifying({ type: "tool", tool: "glob", state: { status: "completed" } })).toBe(false)
    })

    it("returns false for grep tool", () => {
      expect(isFileModifying({ type: "tool", tool: "grep", state: { status: "completed" } })).toBe(false)
    })
  })

  describe("extractFiles", () => {
    it("extracts filePath from edit", () => {
      expect(extractFiles("edit", { filePath: "/foo/bar.ts" })).toEqual(["/foo/bar.ts"])
    })

    it("extracts filePath from write", () => {
      expect(extractFiles("write", { filePath: "/baz.ts" })).toEqual(["/baz.ts"])
    })

    it("extracts filePath from multiedit", () => {
      expect(extractFiles("multiedit", { filePath: "/multi.ts" })).toEqual(["/multi.ts"])
    })

    it("falls back to file_path key", () => {
      expect(extractFiles("edit", { file_path: "/alt.ts" })).toEqual(["/alt.ts"])
    })

    it("falls back to path key", () => {
      expect(extractFiles("write", { path: "/path.ts" })).toEqual(["/path.ts"])
    })

    it("returns undefined for non-file tools", () => {
      expect(extractFiles("bash", { command: "echo hi" })).toBeUndefined()
    })

    it("returns undefined for read tool", () => {
      expect(extractFiles("read", { filePath: "/read.ts" })).toBeUndefined()
    })

    it("returns undefined when no path field present", () => {
      expect(extractFiles("edit", { content: "hello" })).toBeUndefined()
    })
  })

  describe("reverted part count", () => {
    // Simulate computing the number of reverted edits for a given partID boundary
    function revertedEditCount(
      parts: Array<{ id: string; type: string; tool?: string; state?: { status: string } }>,
      partID: string,
    ): number {
      let found = false
      let count = 0
      for (const part of parts) {
        if (part.id === partID) found = true
        if (found && isFileModifying(part)) count++
      }
      return count
    }

    it("counts edits from boundary onward", () => {
      const parts = [
        { id: "p1", type: "tool", tool: "edit", state: { status: "completed" } },
        { id: "p2", type: "tool", tool: "edit", state: { status: "completed" } },
        { id: "p3", type: "tool", tool: "write", state: { status: "completed" } },
      ]
      expect(revertedEditCount(parts, "p2")).toBe(2)
    })

    it("returns 0 when partID is not found", () => {
      const parts = [{ id: "p1", type: "tool", tool: "edit", state: { status: "completed" } }]
      expect(revertedEditCount(parts, "nonexistent")).toBe(0)
    })

    it("counts only file-modifying tools", () => {
      const parts = [
        { id: "p1", type: "tool", tool: "edit", state: { status: "completed" } },
        { id: "p2", type: "text" },
        { id: "p3", type: "tool", tool: "bash", state: { status: "completed" } },
        { id: "p4", type: "tool", tool: "write", state: { status: "completed" } },
      ]
      expect(revertedEditCount(parts, "p1")).toBe(2)
    })
  })

  describe("finding revert points", () => {
    // Find all part IDs that can serve as revert checkpoints
    function checkpoints(
      parts: Array<{ id: string; type: string; tool?: string; state?: { status: string } }>,
    ): string[] {
      return parts.filter((p) => isFileModifying(p)).map((p) => p.id)
    }

    it("returns only file-modifying tool part IDs", () => {
      const parts = [
        { id: "p1", type: "step-start" },
        { id: "p2", type: "tool", tool: "edit", state: { status: "completed" } },
        { id: "p3", type: "text" },
        { id: "p4", type: "tool", tool: "bash", state: { status: "completed" } },
        { id: "p5", type: "tool", tool: "write", state: { status: "completed" } },
        { id: "p6", type: "step-finish" },
      ]
      expect(checkpoints(parts)).toEqual(["p2", "p5"])
    })

    it("returns empty for no file-modifying tools", () => {
      const parts = [
        { id: "p1", type: "text" },
        { id: "p2", type: "tool", tool: "bash", state: { status: "completed" } },
      ]
      expect(checkpoints(parts)).toEqual([])
    })
  })
})
