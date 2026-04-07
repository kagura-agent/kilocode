// kilocode_change - new file
import { Log } from "../util/log"
import { Snapshot } from "../snapshot"
import { MessageV2 } from "../session/message-v2"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"
import { SessionRevert } from "../session/revert"
import { SessionSummary } from "../session/summary"
import { Storage } from "../storage/storage"
import { Bus } from "../bus"

export namespace ToolRevert {
  const log = Log.create({ service: "tool-revert" })

  /** Tools whose state.input contains a filePath field. */
  const FILE_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch"])

  /** Extract the file path(s) a tool part modified, or undefined if not a file-modifying tool. */
  export function files(part: MessageV2.ToolPart): string[] | undefined {
    if (!FILE_TOOLS.has(part.tool)) return undefined
    const input =
      part.state.status !== "pending" ? (part.state as { input?: Record<string, unknown> }).input : undefined
    if (!input) return undefined
    const fp = input.filePath ?? input.file_path ?? input.path
    if (typeof fp === "string") return [fp]
    return undefined
  }

  /** Check whether a tool part modifies files (i.e. should get a checkpoint divider). */
  export function modifies(part: MessageV2.Part): boolean {
    if (part.type !== "tool") return false
    return FILE_TOOLS.has(part.tool)
  }

  /**
   * Revert to the state just before a specific tool part executed.
   *
   * Unlike SessionRevert.revert() which works at message/patch granularity,
   * this finds the step-start snapshot that precedes the target tool part
   * and restores only the files that were modified by it (and subsequent tools).
   */
  export async function revert(input: { sessionID: string; partID: string }) {
    SessionPrompt.assertNotBusy(input.sessionID)
    const all = await Session.messages({ sessionID: input.sessionID })
    const session = await Session.get(input.sessionID)

    // Walk all parts to find context around the target tool part
    let snapshot: string | undefined // most recent step-start snapshot hash
    let found = false
    let targetMsg: MessageV2.WithParts | undefined
    const affected: string[] = [] // files modified by target + subsequent tools

    for (const msg of all) {
      for (const part of msg.parts) {
        if (found) {
          // Collect files from all subsequent tool parts
          if (part.type === "tool") {
            const f = files(part as MessageV2.ToolPart)
            if (f) affected.push(...f)
          }
          continue
        }

        // Track the most recent step-start snapshot
        if (part.type === "step-start" && part.snapshot) {
          snapshot = part.snapshot
        }

        if (part.id === input.partID) {
          found = true
          targetMsg = msg
          // Collect files from the target tool itself
          if (part.type === "tool") {
            const f = files(part as MessageV2.ToolPart)
            if (f) affected.push(...f)
          }
        }
      }
    }

    if (!found || !snapshot || !targetMsg) {
      log.warn("tool revert target not found or no snapshot available", {
        partID: input.partID,
        found,
        hasSnapshot: !!snapshot,
      })
      return session
    }

    if (affected.length === 0) {
      log.warn("no file-modifying tools found at or after target", { partID: input.partID })
      return session
    }

    // Deduplicate file paths
    const unique = [...new Set(affected)]

    // Take a snapshot of current state for unrevert
    const current = session.revert?.snapshot ?? (await Snapshot.track())

    // Compute diffs before reverting so they reflect changes being undone
    const rangeMessages = all.filter((msg) => msg.info.id >= targetMsg!.info.id)
    const diffs = await SessionSummary.computeDiff({ messages: rangeMessages })

    // Restore each file from the step-start snapshot
    log.info("reverting files", { snapshot, files: unique })
    await Snapshot.revert([{ hash: snapshot, files: unique }])

    // Compute unified diff for display
    const diff = current ? await Snapshot.diff(current) : ""

    // Persist session diff data
    await Storage.write(["session_diff", input.sessionID], diffs)
    Bus.publish(Session.Event.Diff, {
      sessionID: input.sessionID,
      diff: diffs,
    })

    const summaryDiffs = diffs.map((d) => ({
      file: d.file,
      additions: d.additions,
      deletions: d.deletions,
      status: d.status,
    }))

    return Session.setRevert({
      sessionID: input.sessionID,
      revert: {
        messageID: targetMsg.info.id,
        partID: input.partID,
        snapshot: current,
        diff,
      },
      summary: {
        additions: diffs.reduce((sum, x) => sum + x.additions, 0),
        deletions: diffs.reduce((sum, x) => sum + x.deletions, 0),
        files: diffs.length,
        diffs: summaryDiffs,
      },
    })
  }

  /** Delegates to the standard unrevert. */
  export async function unrevert(input: { sessionID: string }) {
    return SessionRevert.unrevert(input)
  }

  /** Delegates to the standard cleanup. */
  export async function cleanup(session: Session.Info) {
    return SessionRevert.cleanup(session)
  }
}
