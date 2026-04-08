import { describe, it, expect } from "bun:test"
import { tokenize, matchTokens, matchModel } from "../../webview-ui/src/components/shared/model-search"

describe("tokenize", () => {
  it("splits on hyphens", () => {
    expect(tokenize("gpt-5.4")).toEqual(["gpt", "5", "4"])
  })

  it("splits on spaces", () => {
    expect(tokenize("gpt 5.4")).toEqual(["gpt", "5", "4"])
  })

  it("splits on dots", () => {
    expect(tokenize("claude-3.5-sonnet")).toEqual(["claude", "3", "5", "sonnet"])
  })

  it("lowercases tokens", () => {
    expect(tokenize("GPT-4o")).toEqual(["gpt", "4o"])
  })

  it("handles colons and slashes", () => {
    expect(tokenize("openai/gpt-4o")).toEqual(["openai", "gpt", "4o"])
  })

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([])
  })

  it("handles underscores", () => {
    expect(tokenize("llama_3_70b")).toEqual(["llama", "3", "70b"])
  })

  it("keeps CamelCase words intact", () => {
    expect(tokenize("OpenAI")).toEqual(["openai"])
  })

  it("handles brackets and parens", () => {
    expect(tokenize("Llama (free)")).toEqual(["llama", "free"])
  })
})

describe("matchTokens", () => {
  it("matches when every query token is a prefix of a candidate token", () => {
    expect(matchTokens(["gpt", "4"], ["gpt", "4o", "mini"])).toBe(true)
  })

  it("does not match when a query token has no prefix match", () => {
    expect(matchTokens(["gpt", "5"], ["gpt", "4o", "mini"])).toBe(false)
  })

  it("matches empty query against any candidate", () => {
    expect(matchTokens([], ["gpt", "4o"])).toBe(true)
  })

  it("preserves forward order (greedy)", () => {
    expect(matchTokens(["cl", "son"], ["claude", "3", "5", "sonnet"])).toBe(true)
  })

  it("does not match out of order", () => {
    expect(matchTokens(["son", "cl"], ["claude", "3", "5", "sonnet"])).toBe(false)
  })

  it("matches single-character prefixes", () => {
    expect(matchTokens(["g", "4"], ["gpt", "4o"])).toBe(true)
  })
})

describe("matchModel", () => {
  it("matches when query is empty", () => {
    expect(matchModel("", "GPT-4o", "OpenAI", "openai", "gpt-4o")).toBe(true)
  })

  it("matches model name with different separators", () => {
    expect(matchModel("gpt 5.4", "GPT-5.4", "OpenAI", "openai", "gpt-5.4")).toBe(true)
  })

  it("matches model name with hyphens via spaces", () => {
    expect(matchModel("claude 3 5 sonnet", "Claude 3.5 Sonnet", "Anthropic", "anthropic", "claude-3-5-sonnet")).toBe(
      true,
    )
  })

  it("matches by provider name", () => {
    expect(matchModel("openai", "GPT-4o", "OpenAI", "openai", "gpt-4o")).toBe(true)
  })

  it("matches by provider name partial prefix", () => {
    expect(matchModel("anth", "Claude Sonnet", "Anthropic", "anthropic", "claude-sonnet")).toBe(true)
  })

  it("does not match unrelated query", () => {
    expect(matchModel("gemini", "GPT-4o", "OpenAI", "openai", "gpt-4o")).toBe(false)
  })

  it("matches model id tokens", () => {
    expect(matchModel("4o mini", "GPT-4o Mini", "OpenAI", "openai", "gpt-4o-mini")).toBe(true)
  })

  it("matches combined provider and model query", () => {
    expect(matchModel("openai gpt", "GPT-4o", "OpenAI", "openai", "gpt-4o")).toBe(true)
  })

  it("handles only-whitespace query as match-all", () => {
    expect(matchModel("   ", "GPT-4o", "OpenAI", "openai", "gpt-4o")).toBe(true)
  })

  it("matches kilo auto model", () => {
    expect(matchModel("auto", "Kilo: Auto", "Kilo", "kilo", "kilo-auto/frontier")).toBe(true)
  })

  it("matches by provider ID", () => {
    expect(matchModel("anthropic", "Claude Sonnet", "Anthropic", "anthropic", "claude-sonnet")).toBe(true)
  })
})
