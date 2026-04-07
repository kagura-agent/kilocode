/**
 * AssistantMessage component
 * Renders all parts of an assistant message as a flat list — no context grouping.
 * Unlike the upstream AssistantParts, this renders each read/glob/grep/list tool
 * individually for maximum verbosity in the VS Code sidebar context.
 *
 * Active questions and permissions are rendered in the bottom dock.
 */

import { Component, For, Show, createMemo } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Part, PART_MAPPING, ToolRegistry } from "@kilocode/kilo-ui/message-part"
import type {
  AssistantMessage as SDKAssistantMessage,
  Part as SDKPart,
  Message as SDKMessage,
  ToolPart,
} from "@kilocode/sdk/v2"
import { useData } from "@kilocode/kilo-ui/context/data"
import { CheckpointDivider } from "./CheckpointDivider"
import { useSession } from "../../context/session"

// Tools that the upstream message-part renderer suppresses (returns null for).
// We render these ourselves via ToolRegistry when they complete,
// so the user can see what the AI set up.
export const UPSTREAM_SUPPRESSED_TOOLS = new Set(["todowrite", "todoread"])

/** Tools whose execution modifies files on disk. */
const FILE_MODIFYING_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch"])

function isFileModifying(part: SDKPart): boolean {
  if (part.type !== "tool") return false
  const tool = (part as SDKPart & { tool: string }).tool
  const state = (part as SDKPart & { state: { status: string } }).state
  return FILE_MODIFYING_TOOLS.has(tool) && state.status === "completed"
}

function isRenderable(part: SDKPart): boolean {
  if (part.type === "tool") {
    const tool = (part as SDKPart & { tool: string }).tool
    const state = (part as SDKPart & { state: { status: string } }).state
    if (UPSTREAM_SUPPRESSED_TOOLS.has(tool)) {
      // Show todo parts only when completed (permissions are now in the dock)
      return state.status === "completed"
    }
    if (tool === "question" && (state.status === "pending" || state.status === "running")) return false
    return true
  }
  if (part.type === "text") return !!(part as SDKPart & { text: string }).text?.trim()
  if (part.type === "reasoning") return !!(part as SDKPart & { text: string }).text?.trim()
  return !!PART_MAPPING[part.type]
}

interface AssistantMessageProps {
  message: SDKAssistantMessage
  showAssistantCopyPartID?: string | null
}

function TodoToolCard(props: { part: ToolPart }) {
  const render = ToolRegistry.render(props.part.tool)
  const state = props.part.state as any
  return (
    <Show when={render}>
      {(renderFn) => (
        <Dynamic
          component={renderFn()}
          input={state?.input ?? {}}
          metadata={state?.metadata ?? {}}
          tool={props.part.tool}
          output={state?.output}
          status={state?.status}
          defaultOpen
          reveal={false}
        />
      )}
    </Show>
  )
}

export const AssistantMessage: Component<AssistantMessageProps> = (props) => {
  const data = useData()
  const session = useSession()

  const parts = createMemo(() => {
    const stored = data.store.part?.[props.message.id]
    if (!stored) return []
    const renderable = (stored as SDKPart[]).filter((part) => isRenderable(part))

    // Part-level revert: if this message is the boundary, truncate at the reverted partID.
    // Everything from that part onward was undone and should be hidden.
    const rev = session.revert()
    if (rev?.partID && rev.messageID === props.message.id) {
      const idx = renderable.findIndex((p) => p.id === rev.partID)
      if (idx !== -1) return renderable.slice(0, idx)
    }
    return renderable
  })

  const reverted = () => !!session.revert()

  return (
    <>
      <For each={parts()}>
        {(part) => {
          // Upstream PART_MAPPING["tool"] returns null for todowrite/todoread,
          // so we detect them here and render via ToolRegistry directly.
          const isUpstreamSuppressed =
            part.type === "tool" && UPSTREAM_SUPPRESSED_TOOLS.has((part as SDKPart & { tool: string }).tool)
          return (
            <Show when={isUpstreamSuppressed || PART_MAPPING[part.type]}>
              {/* Checkpoint divider before file-modifying tools — restore to state before this edit */}
              <Show when={isFileModifying(part) && !reverted()}>
                <CheckpointDivider
                  messageID={props.message.id}
                  partID={part.id}
                  disabled={session.status() !== "idle"}
                />
              </Show>
              <div data-component="tool-part-wrapper" data-part-type={part.type}>
                <Show
                  when={isUpstreamSuppressed}
                  fallback={
                    <Part
                      part={part}
                      message={props.message as SDKMessage}
                      showAssistantCopyPartID={props.showAssistantCopyPartID}
                      animate={
                        part.type === "tool" &&
                        ((part as unknown as ToolPart).state?.status === "pending" ||
                          (part as unknown as ToolPart).state?.status === "running")
                      }
                    />
                  }
                >
                  <TodoToolCard part={part as unknown as ToolPart} />
                </Show>
              </div>
            </Show>
          )
        }}
      </For>
    </>
  )
}
