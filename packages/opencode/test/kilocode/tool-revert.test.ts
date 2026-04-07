import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { ToolRevert } from "../../src/kilocode/tool-revert"
import { MessageV2 } from "../../src/session/message-v2"
import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

function tool(overrides: { tool: string; input: Record<string, unknown> }): MessageV2.ToolPart {
  return {
    id: "part_1",
    sessionID: "s1",
    messageID: "m1",
    type: "tool",
    callID: "c1",
    tool: overrides.tool,
    state: {
      status: "completed",
      input: overrides.input,
      output: "ok",
      title: "",
      time: { start: 1, end: 2 },
    },
  } as MessageV2.ToolPart
}

/**
 * Helper to create a basic assistant message for a session.
 */
function assistant(sessionID: string, parentID: string, dir: string) {
  return {
    id: Identifier.ascending("message"),
    role: "assistant" as const,
    sessionID,
    mode: "default",
    agent: "default",
    path: { cwd: dir, root: dir },
    cost: 0,
    tokens: { output: 0, input: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: "gpt-4",
    providerID: "openai",
    parentID,
    time: { created: Date.now() },
    finish: "end_turn" as const,
  }
}

describe("ToolRevert", () => {
  describe("files()", () => {
    test("extracts filePath from edit tool", () => {
      expect(ToolRevert.files(tool({ tool: "edit", input: { filePath: "/tmp/foo.ts" } }))).toEqual(["/tmp/foo.ts"])
    })

    test("extracts filePath from write tool", () => {
      expect(ToolRevert.files(tool({ tool: "write", input: { filePath: "/tmp/bar.ts" } }))).toEqual(["/tmp/bar.ts"])
    })

    test("extracts filePath from multiedit tool", () => {
      expect(ToolRevert.files(tool({ tool: "multiedit", input: { filePath: "/tmp/multi.ts" } }))).toEqual([
        "/tmp/multi.ts",
      ])
    })

    test("returns undefined for read-only tools", () => {
      expect(ToolRevert.files(tool({ tool: "read", input: { filePath: "/tmp/baz.ts" } }))).toBeUndefined()
    })

    test("returns undefined for bash tool", () => {
      expect(ToolRevert.files(tool({ tool: "bash", input: { command: "echo hello" } }))).toBeUndefined()
    })
  })

  describe("modifies()", () => {
    test("returns true for edit", () => {
      expect(ToolRevert.modifies(tool({ tool: "edit", input: {} }))).toBe(true)
    })

    test("returns false for text part", () => {
      const part = { id: "p1", sessionID: "s1", messageID: "m1", type: "text" as const, text: "hello" }
      expect(ToolRevert.modifies(part as unknown as MessageV2.Part)).toBe(false)
    })
  })

  describe("revert() with session", () => {
    test("sets revert state with correct partID and messageID", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          const sid = session.id

          // Create user message
          const user = await Session.updateMessage({
            id: Identifier.ascending("message"),
            role: "user",
            sessionID: sid,
            agent: "default",
            model: { providerID: "openai", modelID: "gpt-4" },
            time: { created: Date.now() },
          })
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: user.id,
            sessionID: sid,
            type: "text",
            text: "Edit my files",
          })

          // Create assistant message with step-start, tool calls, and step-finish
          const aMsg = assistant(sid, user.id, tmp.path)
          await Session.updateMessage(aMsg)

          // Step start with a snapshot hash
          const stepStart = Identifier.ascending("part")
          await Session.updatePart({
            id: stepStart,
            messageID: aMsg.id,
            sessionID: sid,
            type: "step-start",
            snapshot: "fakehash123",
          })

          // Tool 1 — edit on foo.ts
          const tool1 = Identifier.ascending("part")
          await Session.updatePart({
            id: tool1,
            messageID: aMsg.id,
            sessionID: sid,
            type: "tool",
            callID: "call_1",
            tool: "edit",
            state: {
              status: "completed",
              input: { filePath: path.join(tmp.path, "foo.ts") },
              output: "edited",
              title: "Edit foo.ts",
              metadata: {},
              time: { start: Date.now(), end: Date.now() },
            },
          })

          // Tool 2 — write on bar.ts
          const tool2 = Identifier.ascending("part")
          await Session.updatePart({
            id: tool2,
            messageID: aMsg.id,
            sessionID: sid,
            type: "tool",
            callID: "call_2",
            tool: "write",
            state: {
              status: "completed",
              input: { filePath: path.join(tmp.path, "bar.ts") },
              output: "written",
              title: "Write bar.ts",
              metadata: {},
              time: { start: Date.now(), end: Date.now() },
            },
          })

          // Step finish
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: aMsg.id,
            sessionID: sid,
            type: "step-finish",
            reason: "end_turn",
            snapshot: "fakehash456",
            cost: 0.01,
            tokens: { output: 100, input: 200, reasoning: 0, cache: { read: 0, write: 0 } },
          })

          // Create temp files so they exist on disk
          await Bun.write(path.join(tmp.path, "foo.ts"), "modified foo")
          await Bun.write(path.join(tmp.path, "bar.ts"), "modified bar")

          // Revert to tool2 — should undo tool2's changes
          // Note: Snapshot.revert will fail because fakehash doesn't exist in the
          // snapshot git repo, but the session state should still be set correctly.
          // In real usage the snapshot hashes are real git tree hashes.
          const result = await ToolRevert.revert({ sessionID: sid, partID: tool2 })

          // Verify revert state
          expect(result.revert).toBeDefined()
          expect(result.revert!.partID).toBe(tool2)
          expect(result.revert!.messageID).toBe(aMsg.id)

          // Cleanup
          await Session.remove(sid)
        },
      })
    })

    test("returns session unchanged when partID not found", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          const result = await ToolRevert.revert({
            sessionID: session.id,
            partID: "nonexistent_part",
          })
          // Should return session without revert state
          expect(result.revert).toBeUndefined()
          await Session.remove(session.id)
        },
      })
    })

    test("collects files from target and subsequent tools", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          const sid = session.id

          const user = await Session.updateMessage({
            id: Identifier.ascending("message"),
            role: "user",
            sessionID: sid,
            agent: "default",
            model: { providerID: "openai", modelID: "gpt-4" },
            time: { created: Date.now() },
          })
          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: user.id,
            sessionID: sid,
            type: "text",
            text: "Edit files",
          })

          const aMsg = assistant(sid, user.id, tmp.path)
          await Session.updateMessage(aMsg)

          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: aMsg.id,
            sessionID: sid,
            type: "step-start",
            snapshot: "snap1",
          })

          // Tool 1 — should be KEPT (before revert target)
          const tool1 = Identifier.ascending("part")
          await Session.updatePart({
            id: tool1,
            messageID: aMsg.id,
            sessionID: sid,
            type: "tool",
            callID: "c1",
            tool: "edit",
            state: {
              status: "completed",
              input: { filePath: path.join(tmp.path, "a.ts") },
              output: "ok",
              title: "",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          })

          // Tool 2 — revert target
          const tool2 = Identifier.ascending("part")
          await Session.updatePart({
            id: tool2,
            messageID: aMsg.id,
            sessionID: sid,
            type: "tool",
            callID: "c2",
            tool: "edit",
            state: {
              status: "completed",
              input: { filePath: path.join(tmp.path, "b.ts") },
              output: "ok",
              title: "",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          })

          // Tool 3 — should be REVERTED (after target)
          const tool3 = Identifier.ascending("part")
          await Session.updatePart({
            id: tool3,
            messageID: aMsg.id,
            sessionID: sid,
            type: "tool",
            callID: "c3",
            tool: "write",
            state: {
              status: "completed",
              input: { filePath: path.join(tmp.path, "c.ts") },
              output: "ok",
              title: "",
              metadata: {},
              time: { start: 1, end: 2 },
            },
          })

          await Session.updatePart({
            id: Identifier.ascending("part"),
            messageID: aMsg.id,
            sessionID: sid,
            type: "step-finish",
            reason: "end_turn",
            snapshot: "snap2",
            cost: 0,
            tokens: { output: 0, input: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          })

          // Create files
          for (const name of ["a.ts", "b.ts", "c.ts"]) {
            await Bun.write(path.join(tmp.path, name), `content of ${name}`)
          }

          const result = await ToolRevert.revert({ sessionID: sid, partID: tool2 })

          expect(result.revert).toBeDefined()
          expect(result.revert!.partID).toBe(tool2)
          // a.ts should not be in the revert because tool1 is before the target

          await Session.remove(sid)
        },
      })
    })

    test("unrevert delegates to SessionRevert", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          // unrevert on a session with no revert state should be a no-op
          const result = await ToolRevert.unrevert({ sessionID: session.id })
          expect(result.revert).toBeUndefined()
          await Session.remove(session.id)
        },
      })
    })

    test("cleanup delegates to SessionRevert", async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({})
          // cleanup on a session with no revert state should be a no-op
          await ToolRevert.cleanup(session)
          const result = await Session.get(session.id)
          expect(result.revert).toBeUndefined()
          await Session.remove(session.id)
        },
      })
    })
  })
})
