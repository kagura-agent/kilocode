// kilocode_change - new file
// Test that aborting during a retry backoff (e.g. user switches model)
// properly stops the processor instead of continuing to retry.

process.env.KILO_SESSION_RETRY_LIMIT = "2"

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"

mock.module("@/kilo-sessions/remote-sender", () => ({
  RemoteSender: {
    create() {
      return {
        queue() {},
        flush: async () => undefined,
      }
    },
  },
}))

import { APICallError } from "ai"
import type { Provider } from "../../src/provider/provider"
import type { LLM as LLMType } from "../../src/session/llm"
import type { MessageV2 } from "../../src/session/message-v2"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterEach(() => {
  delete process.env.KILO_SESSION_RETRY_LIMIT
})

function createModel(): Provider.Model {
  return {
    id: "gpt-4",
    providerID: "openai",
    name: "GPT-4",
    limit: {
      context: 128000,
      input: 0,
      output: 4096,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true,
      attachment: false,
      reasoning: false,
      temperature: true,
      input: { text: true, image: false, audio: false, video: false },
      output: { text: true, image: false, audio: false, video: false },
    },
    api: { id: "openai", url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" },
    options: {},
    headers: {},
  } as Provider.Model
}

function retryable429() {
  return new APICallError({
    message: "429 status code (no body)",
    url: "https://api.openai.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode: 429,
    responseHeaders: { "content-type": "application/json" },
    isRetryable: true,
  })
}

describe("session processor abort during retry", () => {
  test("abort during retry sleep stops the processor", async () => {
    const { Bus } = await import("../../src/bus")
    const { Identifier } = await import("../../src/id/id")
    const { Instance } = await import("../../src/project/instance")
    const { LLM } = await import("../../src/session/llm")
    const { SessionRetry } = await import("../../src/session/retry")
    const { SessionStatus } = await import("../../src/session/status")

    await using tmp = await tmpdir({ git: true })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { Session } = await import("../../src/session")
        const { SessionProcessor } = await import("../../src/session/processor")
        const model = createModel()
        const session = await Session.create({})
        const user = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "user",
          sessionID: session.id,
          time: { created: Date.now() },
          agent: "code",
          model: { providerID: model.providerID, modelID: model.id },
          tools: {},
        })) as MessageV2.User
        const assistant = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: user.id,
          role: "assistant",
          mode: "code",
          agent: "code",
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: { created: Date.now() },
          sessionID: session.id,
        })) as MessageV2.Assistant

        const controller = new AbortController()

        // First call: retryable 429. Second call: should never happen.
        const llm = spyOn(LLM, "stream")
          .mockRejectedValueOnce(retryable429())
          .mockRejectedValue(new Error("should not be called after abort"))

        // Simulate the abort firing during backoff sleep (e.g. user changed model).
        const sleep = spyOn(SessionRetry, "sleep").mockImplementation(async () => {
          controller.abort()
          throw new DOMException("Aborted", "AbortError")
        })

        const statuses: string[] = []
        const unsub = Bus.subscribe(SessionStatus.Event.Status, (event) => {
          if (event.properties.sessionID !== session.id) return
          statuses.push(event.properties.status.type)
        })

        const processor = SessionProcessor.create({
          assistantMessage: assistant,
          sessionID: session.id,
          model,
          abort: controller.signal,
        })

        const inp: LLMType.StreamInput = {
          user,
          sessionID: session.id,
          model,
          agent: { name: "code", mode: "primary", permission: [], options: {} } as any,
          system: [],
          abort: controller.signal,
          messages: [],
          tools: {},
        }

        try {
          const result = await processor.process(inp)

          // LLM.stream called once (the initial 429), then abort during sleep
          // prevents any further calls.
          expect(llm).toHaveBeenCalledTimes(1)
          expect(sleep).toHaveBeenCalledTimes(1)

          // No error on the message — this was an intentional abort, not
          // an exhausted retry budget.
          expect(processor.message.error).toBeUndefined()

          // Status should have transitioned to "retry" then back to "idle".
          expect(statuses).toContain("retry")
          expect(statuses[statuses.length - 1]).toBe("idle")
        } finally {
          unsub()
          llm.mockRestore()
          sleep.mockRestore()
        }
      },
    })
  })
})
