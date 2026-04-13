import { expect, test } from "bun:test"
import { rm } from "fs/promises"
import path from "path"
import type { ModelMessage } from "ai"
import { LLM } from "../../src/session/llm"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ProviderID, ModelID } from "../../src/provider/schema"
import { Auth } from "../../src/auth"
import { Global } from "../../src/global"
import type { Agent } from "../../src/agent/agent"
import type { MessageV2 } from "../../src/session/message-v2"
import { MessageID, SessionID } from "../../src/session/schema"
import { tmpdir } from "../fixture/fixture"

type Body = Record<string, unknown> & {
  instructions?: string
  messages?: Array<{ role?: string; content?: string }>
}

type Fixture = {
  models: Record<string, { id: string } & Record<string, unknown>>
}

function defer<T>() {
  const result = {} as { promise: Promise<T>; resolve: (value: T) => void }
  result.promise = new Promise((resolve) => {
    result.resolve = resolve
  })
  return result
}

function chat(text: string) {
  const data =
    [
      `data: ${JSON.stringify({
        id: "chatcmpl-system-prompt",
        object: "chat.completion.chunk",
        choices: [{ delta: { role: "assistant" } }],
      })}`,
      `data: ${JSON.stringify({
        id: "chatcmpl-system-prompt",
        object: "chat.completion.chunk",
        choices: [{ delta: { content: text } }],
      })}`,
      `data: ${JSON.stringify({
        id: "chatcmpl-system-prompt",
        object: "chat.completion.chunk",
        choices: [{ delta: {}, finish_reason: "stop" }],
      })}`,
      "data: [DONE]",
    ].join("\n\n") + "\n\n"
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(data))
      controller.close()
    },
  })
}

function responses(model: string) {
  const data =
    [
      `data: ${JSON.stringify({
        type: "response.created",
        response: {
          id: "resp-system-prompt",
          created_at: Math.floor(Date.now() / 1000),
          model,
          service_tier: null,
        },
      })}`,
      `data: ${JSON.stringify({
        type: "response.output_text.delta",
        item_id: "item-system-prompt",
        delta: "ok",
        logprobs: null,
      })}`,
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          incomplete_details: null,
          usage: {
            input_tokens: 1,
            input_tokens_details: null,
            output_tokens: 1,
            output_tokens_details: null,
          },
          service_tier: null,
        },
      })}`,
      "data: [DONE]",
    ].join("\n\n") + "\n\n"
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(data))
      controller.close()
    },
  })
}

async function fixture(provider: string, model: string) {
  const file = path.join(import.meta.dir, "../tool/fixtures/models-api.json")
  const data = (await Bun.file(file).json()) as Record<string, Fixture>
  const item = data[provider]?.models[model]
  if (!item) throw new Error(`Missing fixture model: ${provider}/${model}`)
  return item
}

async function body(input: RequestInit["body"] | null | undefined) {
  if (!input) return ""
  if (typeof input === "string") return input
  return new Response(input).text()
}

test("system_prompt config suppresses default provider prompt for agents without a prompt", async () => {
  const req = defer<Body>()
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      req.resolve((await request.json()) as Body)
      return new Response(chat("ok"), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    },
  })

  try {
    const provider = "alibaba"
    const model = "qwen-plus"

    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://app.kilo.ai/config.json",
            enabled_providers: [provider],
            system_prompt: "Custom core prompt",
            provider: {
              [provider]: {
                options: {
                  apiKey: "test-key",
                  baseURL: `${server.url.origin}/v1`,
                },
              },
            },
          }),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const resolved = await Provider.getModel(ProviderID.make(provider), ModelID.make(model))
        const sessionID = SessionID.make("session-system-prompt")
        const agent = {
          name: "code",
          mode: "primary",
          options: {},
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
        } satisfies Agent.Info
        const user = {
          id: MessageID.make("user-system-prompt"),
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: agent.name,
          model: { providerID: ProviderID.make(provider), modelID: resolved.id },
        } satisfies MessageV2.User

        const result = await LLM.stream({
          user,
          sessionID,
          model: resolved,
          agent,
          system: ["Runtime context"],
          abort: new AbortController().signal,
          messages: [{ role: "user", content: "Hello" }] satisfies ModelMessage[],
          tools: {},
        })

        for await (const _ of result.fullStream) {
        }
      },
    })

    const body = await req.promise
    const sys = body.messages?.find((msg) => msg.role === "system")?.content ?? ""

    expect(sys.startsWith("Custom core prompt")).toBe(true)
    expect(sys).toContain("Runtime context")
    expect(sys).not.toContain("You are Kilo")
    expect(sys).not.toContain("You are an interactive CLI tool")
  } finally {
    server.stop()
  }
})

test("system_prompt config suppresses default provider prompt for OpenAI OAuth instructions", async () => {
  const req = defer<Body>()
  const model = await fixture("openai", "gpt-5.2")
  const fetch = globalThis.fetch
  globalThis.fetch = (async (_input, init) => {
    const text = await body(init?.body)
    req.resolve(text ? (JSON.parse(text) as Body) : {})
    return new Response(responses(model.id), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })
  }) as typeof fetch

  try {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://app.kilo.ai/config.json",
            enabled_providers: ["openai"],
            system_prompt: "Custom OAuth prompt",
            provider: {
              openai: {
                name: "OpenAI",
                env: ["OPENAI_API_KEY"],
                npm: "@ai-sdk/openai",
                api: "https://api.openai.com/v1",
                models: {
                  [model.id]: model,
                },
                options: {
                  apiKey: "test-openai-key",
                },
              },
            },
          }),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const auth = path.join(Global.Path.data, "auth.json")
        const before = await Bun.file(auth)
          .text()
          .catch(() => undefined)
        await Auth.set("openai", {
          type: "oauth",
          access: "test-openai-oauth-token",
          refresh: "test-openai-refresh-token",
          expires: Date.now() + 3_600_000,
        })
        try {
          const resolved = await Provider.getModel(ProviderID.openai, ModelID.make(model.id))
          const sessionID = SessionID.make("session-system-prompt-oauth")
          const agent = {
            name: "code",
            mode: "primary",
            options: {},
            permission: [{ permission: "*", pattern: "*", action: "allow" }],
          } satisfies Agent.Info
          const user = {
            id: MessageID.make("user-system-prompt-oauth"),
            sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: agent.name,
            model: { providerID: ProviderID.openai, modelID: resolved.id },
          } satisfies MessageV2.User

          const result = await LLM.stream({
            user,
            sessionID,
            model: resolved,
            agent,
            system: ["Runtime context"],
            abort: new AbortController().signal,
            messages: [{ role: "user", content: "Hello" }] satisfies ModelMessage[],
            tools: {},
          })

          for await (const _ of result.fullStream) {
          }
        } finally {
          if (before === undefined) await rm(auth, { force: true })
          else await Bun.write(auth, before)
        }
      },
    })

    const body = await req.promise
    const instructions = body.instructions ?? ""

    expect(instructions.startsWith("Custom OAuth prompt")).toBe(true)
    expect(instructions).toContain("Runtime context")
    expect(instructions).not.toContain("You are Kilo")
    expect(instructions).not.toContain("You are an interactive CLI tool")
  } finally {
    globalThis.fetch = fetch
  }
})
