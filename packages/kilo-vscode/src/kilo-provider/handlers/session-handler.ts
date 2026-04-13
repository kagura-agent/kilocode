/**
 * Session lifecycle handlers — extracted from KiloProvider.
 *
 * Covers CRUD (create, load, delete, rename, sync), message send/command,
 * abort, revert/unrevert, compact, and the visible retry-with-backoff loop.
 * No vscode dependency.
 */

import type { KiloClient, Session, SessionStatus, TextPartInput, FilePartInput } from "@kilocode/sdk/v2/client"
import type { EditorContext } from "../../services/cli-backend/types"
import {
  getErrorMessage,
  sessionToWebview,
  runWithMessageConfirmation,
  loadSessions as loadSessionsUtil,
  flushPendingSessionRefresh as flushPendingSessionRefreshUtil,
  type SessionRefreshContext,
  type MessageConfirmation,
} from "../../kilo-provider-utils"
import { retry } from "../../services/cli-backend/retry"
import { slimParts } from "../slim-metadata"
import { retryable, backoff, MAX_RETRIES } from "../../util/retry"

export interface SessionContext {
  readonly client: KiloClient | null
  currentSession: Session | null
  contextSessionID: string | undefined
  connectionState: "connecting" | "connected" | "disconnected" | "error"
  readonly trackedSessionIds: Set<string>
  readonly syncedChildSessions: Set<string>
  readonly sessionDirectories: Map<string, string>
  readonly confirmations: MessageConfirmation
  readonly slimEditMetadata: boolean
  pendingSessionRefresh: boolean
  projectID: string | undefined
  postMessage(msg: unknown): void
  getWorkspaceDirectory(sessionId?: string): string
  getContextDirectory(): string
  gatherEditorContext(): Promise<EditorContext>
  recordMessageSessionId(messageId: string, sessionId: string): void
  trackDirectory(sessionId: string, dir: string): void
  recoverPendingPrompts(): void
  focusSession(id?: string): void
}

// --- Session CRUD ---

export async function handleCreateSession(ctx: SessionContext): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({ type: "error", message: "Not connected to CLI backend" })
    return
  }

  try {
    const dir = ctx.getContextDirectory()
    const { data: session } = await ctx.client.session.create({ directory: dir }, { throwOnError: true })
    ctx.currentSession = session
    ctx.contextSessionID = session.id
    ctx.trackDirectory(session.id, dir)
    ctx.trackedSessionIds.add(session.id)

    ctx.postMessage({
      type: "sessionCreated",
      session: sessionToWebview(session),
    })
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to create session:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to create session",
    })
  }
}

/** Abort controller for the current loadMessages request; aborted when a new session is selected. */
let loadMessagesAbort: AbortController | null = null

export async function handleLoadMessages(ctx: SessionContext, sessionID: string): Promise<void> {
  ctx.trackedSessionIds.add(sessionID)
  ctx.focusSession(sessionID)
  ctx.contextSessionID = sessionID

  if (!ctx.client) {
    ctx.postMessage({ type: "error", message: "Not connected to CLI backend", sessionID })
    return
  }

  // Abort any previous in-flight loadMessages request so the backend
  // isn't overwhelmed when the user switches sessions rapidly.
  loadMessagesAbort?.abort()
  const abort = new AbortController()
  loadMessagesAbort = abort

  try {
    const dir = ctx.getWorkspaceDirectory(sessionID)
    const { data: messages } = await retry(() =>
      ctx.client!.session.messages({ sessionID, directory: dir }, { throwOnError: true, signal: abort.signal }),
    )

    // If this request was aborted while awaiting, skip posting stale results
    if (abort.signal.aborted) return

    // Update currentSession so fallback logic in handleSendMessage/handleAbort
    // references the correct session after switching.  loadMessages is the
    // canonical "user switched to this session" signal, so always update —
    // the old guard `this.currentSession.id === sessionID` prevented updates
    // when switching between different sessions.
    // Non-blocking: don't let a failure here prevent messages from loading.
    // 404s are expected for cross-worktree sessions — use silent to suppress HTTP error logs.
    ctx.client.session
      .get({ sessionID, directory: dir })
      .then((result) => {
        if (result.data && !abort.signal.aborted) {
          ctx.currentSession = result.data
          ctx.contextSessionID = result.data.id
        }
      })
      .catch((err: unknown) => console.warn("[Kilo New] KiloProvider: getSession failed (non-critical):", err))

    ctx.postMessage({
      type: "workspaceDirectoryChanged",
      directory: ctx.getWorkspaceDirectory(sessionID),
    })

    // Fetch current session status so the webview has the correct busy/idle
    // state after switching tabs (SSE events may have been missed).
    ctx.client.session
      .status({ directory: dir })
      .then((result) => {
        if (!result.data) return
        for (const [sid, info] of Object.entries(result.data) as [string, SessionStatus][]) {
          if (!ctx.trackedSessionIds.has(sid)) continue
          ctx.postMessage({
            type: "sessionStatus",
            sessionID: sid,
            status: info.type,
            ...(info.type === "retry" ? { attempt: info.attempt, message: info.message, next: info.next } : {}),
          })
        }
      })
      .catch((err: unknown) => console.error("[Kilo New] KiloProvider: Failed to fetch session statuses:", err))

    const slim = ctx.slimEditMetadata
    const mapped = messages.map((m) => ({
      ...m.info,
      parts: slim ? slimParts(m.parts) : m.parts,
      createdAt: new Date(m.info.time.created).toISOString(),
    }))

    for (const message of mapped) {
      ctx.recordMessageSessionId(message.id, message.sessionID)
    }

    ctx.postMessage({ type: "messagesLoaded", sessionID, messages: mapped })

    // Recover any prompts missed while the webview was loading or during an SSE reconnection.
    ctx.recoverPendingPrompts()
  } catch (error) {
    // Silently ignore aborted requests — the user switched to a different session
    if (abort.signal.aborted) return
    console.error("[Kilo New] KiloProvider: Failed to load messages:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to load messages",
      sessionID,
    })
  }
}

/**
 * Handle syncing a child session (e.g. spawned by the task tool).
 * Tracks the session for SSE events and fetches its messages.
 */
export async function handleSyncSession(
  ctx: SessionContext,
  sessionID: string,
  parentSessionID?: string,
): Promise<void> {
  if (!ctx.client) return
  if (ctx.syncedChildSessions.has(sessionID)) return

  ctx.syncedChildSessions.add(sessionID)
  ctx.trackedSessionIds.add(sessionID)

  // Inherit the parent's worktree directory so permission responses use
  // the correct backend Instance. Without this, child sessions in Agent
  // Manager worktrees fall back to workspace root and fail to find the
  // pending permission request.
  if (!ctx.sessionDirectories.has(sessionID) && parentSessionID) {
    const dir = ctx.sessionDirectories.get(parentSessionID)
    if (dir) {
      ctx.sessionDirectories.set(sessionID, dir)
    }
  }

  try {
    const dir = ctx.getWorkspaceDirectory(sessionID)
    const { data: messages } = await retry(() =>
      ctx.client!.session.messages({ sessionID, directory: dir }, { throwOnError: true }),
    )

    const slim = ctx.slimEditMetadata
    const mapped = messages.map((m) => ({
      ...m.info,
      parts: slim ? slimParts(m.parts) : m.parts,
      createdAt: new Date(m.info.time.created).toISOString(),
    }))

    for (const message of mapped) {
      ctx.recordMessageSessionId(message.id, message.sessionID)
    }

    ctx.postMessage({ type: "messagesLoaded", sessionID, messages: mapped })

    // Recover any prompts emitted by the child before we started tracking it.
    ctx.recoverPendingPrompts()
  } catch (err) {
    ctx.syncedChildSessions.delete(sessionID)
    console.error("[Kilo New] KiloProvider: Failed to sync child session:", err)
  }
}

/**
 * Build the context object used by the extracted session-refresh helpers.
 */
export function buildSessionRefreshContext(ctx: SessionContext): SessionRefreshContext {
  const client = ctx.client
  return {
    pendingSessionRefresh: ctx.pendingSessionRefresh,
    connectionState: ctx.connectionState,
    listSessions: client
      ? (dir: string) =>
          client.session.list({ directory: dir, roots: true }, { throwOnError: true }).then(({ data }) => data)
      : null,
    sessionDirectories: ctx.sessionDirectories,
    workspaceDirectory: ctx.getWorkspaceDirectory(),
    postMessage: (msg: unknown) => ctx.postMessage(msg),
  }
}

/**
 * Retry a deferred sessions refresh once the client is ready.
 */
export async function flushPendingSessionRefresh(ctx: SessionContext, reason: string): Promise<void> {
  if (!ctx.pendingSessionRefresh) return
  console.log("[Kilo New] KiloProvider: Flushing deferred sessions refresh", { reason })
  const refresh = buildSessionRefreshContext(ctx)
  try {
    const resolved = await flushPendingSessionRefreshUtil(refresh)
    if (resolved) ctx.projectID = resolved
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to flush session refresh:", error)
  }
  ctx.pendingSessionRefresh = refresh.pendingSessionRefresh
}

/**
 * Handle loading all sessions.
 */
export async function handleLoadSessions(ctx: SessionContext): Promise<void> {
  const refresh = buildSessionRefreshContext(ctx)
  try {
    const resolved = await loadSessionsUtil(refresh)
    if (resolved) ctx.projectID = resolved
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to load sessions:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to load sessions",
    })
  }
  ctx.pendingSessionRefresh = refresh.pendingSessionRefresh
}

export async function handleDeleteSession(ctx: SessionContext, sessionID: string): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({ type: "error", message: "Not connected to CLI backend" })
    return
  }

  try {
    const dir = ctx.getWorkspaceDirectory(sessionID)
    await ctx.client.session.delete({ sessionID, directory: dir }, { throwOnError: true })
    ctx.trackedSessionIds.delete(sessionID)
    ctx.syncedChildSessions.delete(sessionID)
    ctx.sessionDirectories.delete(sessionID)
    if (ctx.currentSession?.id === sessionID) {
      ctx.currentSession = null
    }
    ctx.postMessage({ type: "sessionDeleted", sessionID })
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to delete session:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to delete session",
    })
  }
}

export async function handleRenameSession(ctx: SessionContext, sessionID: string, title: string): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({ type: "error", message: "Not connected to CLI backend" })
    return
  }

  try {
    const dir = ctx.getWorkspaceDirectory(sessionID)
    const { data: updated } = await ctx.client.session.update(
      { sessionID, directory: dir, title },
      { throwOnError: true },
    )
    if (ctx.currentSession?.id === sessionID) {
      ctx.currentSession = updated
    }
    ctx.postMessage({ type: "sessionUpdated", session: sessionToWebview(updated) })
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to rename session:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to rename session",
    })
  }
}

// --- Message send, abort, revert, compact ---

/** Abort controllers for active retry loops, keyed by session ID */
const retryControllers = new Map<string, AbortController>()

/** Execute an SDK call with visible exponential backoff for retryable HTTP errors. */
export async function withRetry(
  ctx: SessionContext,
  fn: () => Promise<{ error?: unknown; response?: Response }>,
  sid: string,
  messageID?: string,
): Promise<void> {
  const abort = new AbortController()
  retryControllers.set(sid, abort)

  try {
    for (let attempt = 1; ; attempt++) {
      if (abort.signal.aborted) {
        // User cancelled — return normally without triggering sendMessageFailed
        return
      }

      const result = await fn()
      if (!result.error) return
      if (ctx.confirmations.has(messageID)) return

      const status = result.response?.status ?? 0

      // Non-retryable status codes fail immediately without retry
      if (!retryable(status)) {
        ctx.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
        throw result.error
      }

      // Stop retrying after MAX_RETRIES attempts
      if (attempt >= MAX_RETRIES) {
        ctx.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
        throw result.error
      }

      const delay = backoff(attempt, result.response?.headers)
      console.log(`[Kilo New] KiloProvider: Retry on ${status}, attempt ${attempt}/${MAX_RETRIES}, delay ${delay}ms`)

      ctx.postMessage({
        type: "sessionStatus",
        sessionID: sid,
        status: "retry",
        attempt,
        message: `Error (${status}). Retrying...`,
        next: Date.now() + delay,
      })

      // Wait for delay or until aborted
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          abort.signal.removeEventListener("abort", done)
          resolve()
        }
        const timer = setTimeout(done, delay)
        abort.signal.addEventListener("abort", done, { once: true })
      })
      if (ctx.confirmations.has(messageID)) return
    }
  } finally {
    retryControllers.delete(sid)
  }
}

/** Cancel an active retry loop for a session */
export function cancelRetry(ctx: SessionContext, sid: string): void {
  const controller = retryControllers.get(sid)
  if (controller) {
    controller.abort()
    ctx.postMessage({ type: "sessionStatus", sessionID: sid, status: "idle" })
  }
}

/**
 * Ensure a session exists, creating one if needed. Returns the resolved
 * session ID and workspace directory, or undefined when the client is
 * disconnected.
 */
async function resolveSession(
  ctx: SessionContext,
  sessionID?: string,
  draftID?: string,
): Promise<{ sid: string; dir: string } | undefined> {
  if (!ctx.client) return undefined

  const dir = sessionID ? ctx.getWorkspaceDirectory(sessionID) : ctx.getContextDirectory()

  if (!sessionID && !ctx.currentSession) {
    const { data: session } = await ctx.client.session.create({ directory: dir }, { throwOnError: true })
    ctx.currentSession = session
    ctx.contextSessionID = session.id
    ctx.trackDirectory(session.id, dir)
    ctx.trackedSessionIds.add(session.id)
    if (draftID) ctx.contextSessionID = session.id
    ctx.postMessage({
      type: "sessionCreated",
      session: sessionToWebview(session),
      draftID,
    })
  }

  const sid = sessionID || ctx.currentSession?.id
  if (!sid) throw new Error("No session available")
  ctx.trackedSessionIds.add(sid)
  return { sid, dir }
}

export async function handleSendMessage(
  ctx: SessionContext,
  text: string,
  messageID?: string,
  sessionID?: string,
  draftID?: string,
  providerID?: string,
  modelID?: string,
  agent?: string,
  variant?: string,
  files?: Array<{ mime: string; url: string }>,
): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({
      type: "sendMessageFailed",
      error: "Not connected to CLI backend",
      text,
      sessionID,
      draftID,
      messageID,
      files,
    })
    return
  }

  let resolved: { sid: string; dir: string } | undefined
  try {
    resolved = await resolveSession(ctx, sessionID, draftID)

    const parts: Array<TextPartInput | FilePartInput> = []
    if (files) {
      for (const f of files) {
        parts.push({ type: "file", mime: f.mime, url: f.url })
      }
    }
    parts.push({ type: "text", text })

    const editor = await ctx.gatherEditorContext()

    if (messageID) {
      ctx.recordMessageSessionId(messageID, resolved!.sid)
    }

    const sid = resolved!.sid
    const dir = resolved!.dir
    await runWithMessageConfirmation(ctx.confirmations, messageID, "KiloProvider: Message request", () =>
      withRetry(
        ctx,
        () =>
          ctx.client!.session.promptAsync({
            sessionID: sid,
            directory: dir,
            messageID,
            parts,
            model: providerID && modelID ? { providerID, modelID } : undefined,
            agent,
            variant,
            editorContext: editor,
          }),
        sid,
        messageID,
      ),
    )
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to send message:", error)
    ctx.postMessage({
      type: "sendMessageFailed",
      error: getErrorMessage(error) || "Failed to send message",
      text,
      sessionID: resolved?.sid ?? sessionID,
      draftID,
      messageID,
      files,
    })
  }
}

export async function handleSendCommand(
  ctx: SessionContext,
  command: string,
  args: string,
  messageID?: string,
  sessionID?: string,
  draftID?: string,
  providerID?: string,
  modelID?: string,
  agent?: string,
  variant?: string,
  files?: Array<{ mime: string; url: string }>,
): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({
      type: "sendMessageFailed",
      error: "Not connected to CLI backend",
      text: `/${command} ${args}`.trim(),
      sessionID,
      draftID,
      messageID,
      files,
    })
    return
  }

  let resolved: { sid: string; dir: string } | undefined
  try {
    resolved = await resolveSession(ctx, sessionID, draftID)

    if (messageID) {
      ctx.recordMessageSessionId(messageID, resolved!.sid)
    }

    const parts = files?.map((f) => ({ type: "file" as const, mime: f.mime, url: f.url }))

    const sid = resolved!.sid
    const dir = resolved!.dir
    await runWithMessageConfirmation(ctx.confirmations, messageID, "KiloProvider: Command request", () =>
      withRetry(
        ctx,
        () =>
          ctx.client!.session.command({
            sessionID: sid,
            directory: dir,
            command,
            arguments: args,
            messageID,
            model: providerID && modelID ? `${providerID}/${modelID}` : undefined,
            agent,
            variant,
            parts,
          }),
        sid,
        messageID,
      ),
    )
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to send command:", error)
    ctx.postMessage({
      type: "sendMessageFailed",
      error: getErrorMessage(error) || "Failed to send command",
      text: `/${command} ${args}`.trim(),
      sessionID: resolved?.sid ?? sessionID,
      draftID,
      messageID,
      files,
    })
  }
}

export async function handleAbort(ctx: SessionContext, sessionID?: string): Promise<void> {
  if (!ctx.client) return

  const target = sessionID || ctx.currentSession?.id
  if (!target) return

  try {
    const dir = ctx.getWorkspaceDirectory(target)
    await ctx.client.session.abort({ sessionID: target, directory: dir }, { throwOnError: true })
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to abort session:", error)
  }
}

export async function handleRevertSession(ctx: SessionContext, sessionID: string, messageID: string): Promise<void> {
  if (!ctx.client) return
  const dir = ctx.getWorkspaceDirectory(sessionID)
  const { data, error } = await ctx.client.session.revert({ sessionID, messageID, directory: dir })
  if (error) {
    console.error("[Kilo New] KiloProvider: Failed to revert session:", error)
    ctx.postMessage({ type: "error", message: "Failed to revert session", sessionID })
    return
  }
  if (data) ctx.postMessage({ type: "sessionUpdated", session: sessionToWebview(data) })
}

export async function handleUnrevertSession(ctx: SessionContext, sessionID: string): Promise<void> {
  if (!ctx.client) return
  const dir = ctx.getWorkspaceDirectory(sessionID)
  const { data, error } = await ctx.client.session.unrevert({ sessionID, directory: dir })
  if (error) {
    console.error("[Kilo New] KiloProvider: Failed to unrevert session:", error)
    ctx.postMessage({ type: "error", message: "Failed to redo session", sessionID })
    return
  }
  if (data) ctx.postMessage({ type: "sessionUpdated", session: sessionToWebview(data) })
}

export async function handleCompact(
  ctx: SessionContext,
  sessionID?: string,
  providerID?: string,
  modelID?: string,
): Promise<void> {
  if (!ctx.client) {
    ctx.postMessage({ type: "error", message: "Not connected to CLI backend" })
    return
  }

  const target = sessionID || ctx.currentSession?.id
  if (!target) {
    console.error("[Kilo New] KiloProvider: No sessionID for compact")
    return
  }

  if (!providerID || !modelID) {
    console.error("[Kilo New] KiloProvider: No model selected for compact")
    ctx.postMessage({
      type: "error",
      message: "No model selected. Connect a provider to compact this session.",
    })
    return
  }

  try {
    const dir = ctx.getWorkspaceDirectory(target)
    await ctx.client.session.summarize(
      { sessionID: target, directory: dir, providerID, modelID },
      { throwOnError: true },
    )
  } catch (error) {
    console.error("[Kilo New] KiloProvider: Failed to compact session:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to compact session",
    })
  }
}
