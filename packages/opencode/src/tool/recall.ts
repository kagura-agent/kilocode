// kilocode_change - new file
import z from "zod"
import { Tool } from "./tool"
import { Session } from "../session"
import { Instance } from "../project/instance"
import { Locale } from "../util/locale"
import DESCRIPTION from "./recall.txt"

export const RecallTool = Tool.define("kilo_local_recall", {
  description: DESCRIPTION,
  parameters: z.object({
    mode: z.enum(["search", "read"]).describe("'search' to find sessions by title, 'read' to get a session transcript"),
    query: z.string().optional().describe("Search query to match against session titles (required for search mode)"),
    sessionID: z.string().optional().describe("Session ID to read the transcript of (required for read mode)"),
    limit: z.number().optional().describe("Maximum number of search results to return (default: 20, max: 50)"),
  }),
  async execute(params, ctx) {
    if (params.mode === "search") {
      return search(params, ctx)
    }
    return read(params, ctx)
  },
})

async function search(params: { query?: string; limit?: number }, _ctx: Tool.Context) {
  if (!params.query) {
    throw new Error("The 'query' parameter is required when mode is 'search'")
  }

  const limit = Math.min(params.limit ?? 20, 50)
  const current = Instance.project.id

  const results: Array<{
    id: string
    title: string
    project: string
    directory: string
    updated: string
    current: boolean
  }> = []

  for (const session of Session.listGlobal({
    search: params.query,
    roots: true,
    limit,
  })) {
    results.push({
      id: session.id,
      title: session.title,
      project: session.project?.name ?? session.project?.worktree ?? "unknown",
      directory: session.directory,
      updated: Locale.todayTimeOrDateTime(session.time.updated),
      current: session.projectID === current,
    })
  }

  if (results.length === 0) {
    return {
      title: `Search: "${params.query}" (no results)`,
      output: `No sessions found matching "${params.query}".`,
      metadata: {},
    }
  }

  const lines = results.map(
    (r) =>
      `- **${r.title}** (${r.current ? "current project" : r.project})\n  ID: ${r.id} | Updated: ${r.updated} | Dir: ${r.directory}`,
  )

  return {
    title: `Search: "${params.query}" (${results.length} results)`,
    output: lines.join("\n"),
    metadata: {},
  }
}

async function read(params: { sessionID?: string }, ctx: Tool.Context) {
  if (!params.sessionID) {
    throw new Error("The 'sessionID' parameter is required when mode is 'read'")
  }

  const session = await Session.get(params.sessionID).catch(() => {
    throw new Error(`Session "${params.sessionID}" not found. Use search mode first to find valid session IDs.`)
  })
  const cross = session.projectID !== Instance.project.id

  if (cross) {
    await ctx.ask({
      permission: "recall",
      patterns: [session.directory],
      always: [session.directory],
      metadata: {
        sessionID: session.id,
        title: session.title,
        directory: session.directory,
      },
    })
  }

  const msgs = await Session.messages({ sessionID: session.id, limit: 200 })
  const lines: string[] = [
    `# Session: ${session.title}`,
    `Project: ${session.directory}`,
    `Created: ${Locale.todayTimeOrDateTime(session.time.created)}`,
    "",
  ]

  for (const msg of msgs) {
    if (msg.info.role === "user") {
      lines.push("## User")
      for (const part of msg.parts) {
        if (part.type === "text") lines.push(part.text)
      }
      lines.push("")
    }
    if (msg.info.role === "assistant") {
      lines.push("## Assistant")
      for (const part of msg.parts) {
        if (part.type === "text") lines.push(part.text)
        if (part.type === "tool" && part.state.status === "completed") {
          lines.push(`[Tool: ${part.tool}] ${part.state.title}`)
        }
      }
      lines.push("")
    }
  }

  return {
    title: `Read: ${session.title}`,
    output: lines.join("\n"),
    metadata: {},
  }
}
