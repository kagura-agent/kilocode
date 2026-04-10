/**
 * Built-in context injection plugin — Kilo Code
 *
 * Queries configured MCP sources before every LLM call and injects the results
 * into the system prompt unconditionally, at the infrastructure level.
 *
 * This is structurally equivalent to Claude Code's UserPromptSubmit hook
 * (and what ByteRover, Hindsight, and Glean independently converged on)
 * except that Kilo's implementation:
 *   - Fires on every LLM call, including agent sub-turns (not just user-turn boundaries)
 *   - Is in-process with zero subprocess overhead
 *   - Has session-level caching to avoid re-querying identical prompts
 *   - Can also enrich tool results via tool.execute.after
 *
 * Configuration (kilo.json):
 * ```json
 * {
 *   "context": {
 *     "sources": [
 *       { "mcp": "kilo-context", "tool": "search_kb" }
 *     ],
 *     "timeout_ms": 5000
 *   }
 * }
 * ```
 */

// kilocode_change start
import type { Hooks, Plugin, PluginInput } from "@kilocode/plugin"
import { Config } from "../config/config"
import { MCP } from "../mcp"
import { Log } from "../util/log"
import { Session } from "../session"
import type { MessageV2 } from "../session/message-v2"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"

const log = Log.create({ service: "context-plugin" })

const DEFAULT_TIMEOUT_MS = 5_000

/** Minimum prompt length to bother querying — avoids wasting calls on trivial inputs. */
const MIN_PROMPT_LENGTH = 5

/**
 * Non-cryptographic djb2-style hash — fast, good enough for prompt deduplication.
 * Not for security; purely for cache key equality checks.
 */
function hashString(text: string): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h
}

/** Per-session cache entry so identical prompts don't re-query on every agent sub-turn. */
type CacheEntry = {
  promptHash: number
  /** Formatted injection string, empty string if query returned nothing. */
  result: string
}

/**
 * Extract the text of the last user message from a session.
 * Returns undefined when no user message with text content is found.
 */
async function getLastUserPrompt(sessionID: string): Promise<string | undefined> {
  const msgs = await Session.messages({ sessionID })
  // messages() returns newest-first after the internal reverse()
  for (const msg of msgs) {
    if (msg.info.role !== "user") continue
    // Narrow from the discriminated Part union to TextPart
    const parts = msg.parts as MessageV2.Part[]
    const text = parts
      .filter((p): p is MessageV2.TextPart => p.type === "text" && !(p as MessageV2.TextPart).ignored)
      .map((p: MessageV2.TextPart) => p.text)
      .filter(Boolean)
      .join("\n")
      .trim()
    if (text.length >= MIN_PROMPT_LENGTH) return text
  }
  return undefined
}

/**
 * Call a single MCP source tool with the given query text.
 * Returns trimmed text content or undefined on failure/timeout.
 */
async function callSource(
  mcp: string,
  tool: string,
  query: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const allClients = await MCP.clients()
  const client = allClients[mcp]
  if (!client) {
    log.warn("context-plugin: MCP client not found or not connected", { mcp, tool })
    return undefined
  }

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
  )

  const callPromise = client.callTool(
    { name: tool, arguments: { query } },
    CallToolResultSchema,
  )

  const result = await Promise.race([callPromise, timeoutPromise]).catch((err: unknown) => {
    log.warn("context-plugin: MCP tool call failed or timed out", {
      mcp,
      tool,
      error: err instanceof Error ? err.message : String(err),
    })
    return undefined
  })

  if (!result) return undefined

  // CallToolResult.content is typed as unknown in the MCP SDK generic return.
  // We cast here because we validated the schema via CallToolResultSchema.
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? []
  const text = content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n")
    .trim()

  return text || undefined
}

export const ContextPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  /** Per-session injection cache. Keyed by sessionID. */
  const sessionCache = new Map<string, CacheEntry>()

  return {
    /**
     * experimental.chat.system.transform — fires before every LLM call.
     *
     * Retrieves the last user prompt, queries all configured context sources,
     * and injects results as a new system prompt entry at the end of system[].
     *
     * Injection position:
     *   system[0] = soul + agent prompt (static, Anthropic-cached)
     *   system[1] = environment + AGENTS.md (dynamic)
     *   system[2] = this injection (ephemeral, not cached)
     *
     * Graceful fallback: on any error or timeout the prompt proceeds untouched.
     */
    "experimental.chat.system.transform": async ({ sessionID, model: _model }, output) => {
      if (!sessionID) return

      const config = await Config.get()
      const sources = config.context?.sources
      if (!sources?.length) return

      const globalTimeout = config.context?.timeout_ms ?? DEFAULT_TIMEOUT_MS

      // Retrieve the last user prompt to use as the query
      let promptText: string | undefined
      try {
        promptText = await getLastUserPrompt(sessionID)
      } catch (err) {
        log.warn("context-plugin: failed to retrieve session messages", {
          sessionID,
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }

      if (!promptText) return

      // Check session-level cache — reuse result if prompt unchanged
      const promptHash = hashString(promptText)
      const cached = sessionCache.get(sessionID)
      if (cached?.promptHash === promptHash) {
        if (cached.result) output.system.push(cached.result)
        log.info("context-plugin: cache hit, reusing context", { sessionID })
        return
      }

      // Query all sources in parallel with individual timeouts
      const parts = await Promise.all(
        sources.map(async (src) => {
          const timeout = src.timeout_ms ?? globalTimeout
          const text = await callSource(src.mcp, src.tool, promptText!, timeout)
          if (!text) return ""
          return `<context source="${src.mcp}/${src.tool}">\n${text}\n</context>`
        }),
      )

      const injected = parts.filter(Boolean).join("\n\n").trim()

      // Update cache regardless of whether there was content (avoids redundant re-queries)
      sessionCache.set(sessionID, { promptHash, result: injected })

      if (injected) {
        output.system.push(injected)
        log.info("context-plugin: injected context", {
          sessionID,
          sources: sources.map((s) => `${s.mcp}/${s.tool}`),
          bytes: injected.length,
        })
      }
    },

    /**
     * tool.execute.after — fires after any tool completes.
     *
     * For file-reading tools (read, glob, grep), queries context sources
     * about the path/query being accessed and appends a <context> note to the
     * tool output. This co-locates relevant knowledge with the evidence the
     * model is already looking at, which is richer than pre-prompt injection.
     *
     * Runs async and best-effort — failures are silently discarded.
     */
    "tool.execute.after": async ({ tool, sessionID, args }, output) => {
      // Only enrich file-reading tools
      const FILE_TOOLS = new Set(["read", "glob", "grep"])
      if (!FILE_TOOLS.has(tool)) return

      const config = await Config.get()
      const sources = config.context?.sources
      if (!sources?.length) return
      // Skip enrichment if no context output was produced in this session
      // (i.e., sources are configured but the MCP server isn't connected)
      if (!sessionCache.has(sessionID)) return

      // Extract the file path or query string from tool args
      const argsObj = args as Record<string, unknown>
      const query: string | undefined =
        typeof argsObj.filePath === "string"
          ? argsObj.filePath
          : typeof argsObj.pattern === "string"
            ? argsObj.pattern
            : typeof argsObj.query === "string"
              ? argsObj.query
              : undefined

      if (!query) return

      const globalTimeout = config.context?.timeout_ms ?? DEFAULT_TIMEOUT_MS

      const parts = await Promise.all(
        sources.map(async (src) => {
          const timeout = src.timeout_ms ?? globalTimeout
          const text = await callSource(src.mcp, src.tool, query, timeout)
          if (!text) return ""
          return `<context source="${src.mcp}/${src.tool}" for="${query}">\n${text}\n</context>`
        }),
      )

      const enrichment = parts.filter(Boolean).join("\n\n").trim()
      if (enrichment) {
        output.output = output.output + "\n\n" + enrichment
      }
    },
  }
}
// kilocode_change end
