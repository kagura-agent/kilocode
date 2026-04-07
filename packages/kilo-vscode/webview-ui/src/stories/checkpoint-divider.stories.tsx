/** @jsxImportSource solid-js */
/**
 * Stories for the CheckpointDivider component.
 * Shows the interactive divider line that appears between file-modifying tool calls.
 */

import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { StoryProviders, mockSessionValue } from "./StoryProviders"
import { CheckpointDivider } from "../components/chat/CheckpointDivider"

const meta: Meta = {
  title: "Chat/CheckpointDivider",
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj

// ---------------------------------------------------------------------------
// Default state — subtle, low opacity
// ---------------------------------------------------------------------------

export const Default: Story = {
  name: "Default",
  render: () => (
    <StoryProviders>
      <div style={{ padding: "16px", background: "var(--vscode-editor-background)" }}>
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [file_edit tool result above]
        </div>
        <CheckpointDivider messageID="msg_1" partID="part_1" />
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [next tool call below]
        </div>
      </div>
    </StoryProviders>
  ),
}

// ---------------------------------------------------------------------------
// Disabled state — when agent is busy
// ---------------------------------------------------------------------------

export const Disabled: Story = {
  name: "Disabled (Agent Busy)",
  render: () => (
    <StoryProviders>
      <div style={{ padding: "16px", background: "var(--vscode-editor-background)" }}>
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [file_edit tool result above]
        </div>
        <CheckpointDivider messageID="msg_1" partID="part_1" disabled />
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [next tool call below]
        </div>
      </div>
    </StoryProviders>
  ),
}

// ---------------------------------------------------------------------------
// Multiple dividers — between several tool calls
// ---------------------------------------------------------------------------

export const Multiple: Story = {
  name: "Multiple Checkpoints",
  render: () => (
    <StoryProviders>
      <div style={{ padding: "16px", background: "var(--vscode-editor-background)" }}>
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [file_edit: src/index.ts]
        </div>
        <CheckpointDivider messageID="msg_1" partID="part_1" />
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [file_write: src/utils.ts]
        </div>
        <CheckpointDivider messageID="msg_1" partID="part_2" />
        <div style={{ padding: "8px", "font-size": "12px", color: "var(--vscode-foreground)" }}>
          [file_edit: src/config.ts]
        </div>
        <CheckpointDivider messageID="msg_1" partID="part_3" />
      </div>
    </StoryProviders>
  ),
}
