/**
 * CheckpointDivider component
 * Renders a subtle horizontal divider line between file-modifying tool calls
 * in the chat. On hover, reveals a "Restore" button to revert to this checkpoint.
 *
 * Replicates the legacy kilocode CheckpointSaved UI pattern.
 */

import { Component, Show, createSignal } from "solid-js"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"

interface CheckpointDividerProps {
  messageID: string
  partID: string
  disabled?: boolean
}

export const CheckpointDivider: Component<CheckpointDividerProps> = (props) => {
  const session = useSession()
  const language = useLanguage()
  const [hovered, setHovered] = createSignal(false)

  const handleRestore = (e: MouseEvent) => {
    e.stopPropagation()
    if (props.disabled || session.status() !== "idle") return
    session.revertSession(props.messageID, props.partID)
  }

  return (
    <div
      class="checkpoint-divider"
      classList={{
        "checkpoint-divider--disabled": props.disabled || session.status() !== "idle",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div class="checkpoint-divider-left">
        <Icon name="history" size="small" />
      </div>
      <span class="checkpoint-divider-line" />
      <Show when={hovered()}>
        <div class="checkpoint-divider-actions">
          <Tooltip value={language.t("revert.checkpoint.restore")} placement="top" gutter={4}>
            <IconButton
              icon="arrow-left"
              size="small"
              variant="ghost"
              onMouseDown={(e: MouseEvent) => e.preventDefault()}
              onClick={handleRestore}
              aria-label={language.t("revert.checkpoint.restore")}
            />
          </Tooltip>
        </div>
      </Show>
    </div>
  )
}
