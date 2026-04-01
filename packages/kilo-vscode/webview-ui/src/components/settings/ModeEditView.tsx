import { Component, Show, For, createMemo, createSignal } from "solid-js"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Switch } from "@kilocode/kilo-ui/switch"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import type { AgentConfig, AgentInfo } from "../../types/messages"
import SettingsRow from "./SettingsRow"
import { buildExport } from "./mode-io"

interface Props {
  name: string
  onBack: () => void
  onRemove: (agent: AgentInfo) => void
}

const ModeEditView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()
  const session = useSession()

  // agent() may be undefined for modes that only exist in the config draft (just
  // created, not yet saved). This is fine — native defaults to false (correct for
  // custom modes) and all fields read from cfg() which comes from config context.
  const agent = () => session.agents().find((a) => a.name === props.name)
  const native = () => agent()?.native ?? false

  const cfg = createMemo<AgentConfig>(() => config().agent?.[props.name] ?? {})

  const update = (partial: Partial<AgentConfig>) => {
    const existing = config().agent ?? {}
    const current = existing[props.name] ?? {}
    updateConfig({
      agent: {
        ...existing,
        [props.name]: { ...current, ...partial },
      },
    })
  }

  const exportMode = () => {
    const data = buildExport(props.name, cfg())
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${props.name}.agent.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          "margin-bottom": "16px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center" }}>
          <IconButton size="small" variant="ghost" icon="arrow-left" onClick={props.onBack} />
          <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
            {language.t("settings.agentBehaviour.editMode")} — {props.name}
          </span>
        </div>
        <Show when={!native()}>
          <div style={{ display: "flex", gap: "4px" }}>
            <IconButton
              size="small"
              variant="ghost"
              icon="download"
              title={language.t("settings.agentBehaviour.exportMode")}
              onClick={exportMode}
            />
            <IconButton
              size="small"
              variant="ghost"
              icon="close"
              onClick={() => {
                const a = agent()
                if (a) props.onRemove(a)
              }}
            />
          </div>
        </Show>
      </div>

      <Show when={native()}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div
            style={{
              "font-size": "12px",
              color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              padding: "4px 0",
            }}
          >
            {language.t("settings.agentBehaviour.editMode.native")}
          </div>
        </Card>
      </Show>

      {/* Description (full-width, custom modes only) */}
      <Show when={!native()}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.editMode.description")}
          </div>
          <TextField
            value={cfg().description ?? ""}
            placeholder={language.t("settings.agentBehaviour.createMode.description.placeholder")}
            onChange={(val) => update({ description: val || undefined })}
          />
        </Card>
      </Show>

      {/* Prompt override (full-width, auto-resizing) */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
          {native()
            ? language.t("settings.agentBehaviour.editMode.promptOverride")
            : language.t("settings.agentBehaviour.editMode.prompt")}
        </div>
        <TextField
          value={cfg().prompt ?? ""}
          placeholder={language.t("settings.agentBehaviour.createMode.prompt.placeholder")}
          multiline
          onChange={(val) => update({ prompt: val || undefined })}
        />
      </Card>

      {/* Default system prompt (read-only, collapsible) */}
      <Show when={native()}>
        <DefaultPromptSection prompt={agent()?.prompt} />
      </Show>

      {/* Sub-agents section */}
      <Show when={agent()?.mode !== "subagent" && session.subagents().length > 0}>
        <SubagentsSection agents={session.subagents()} />
      </Show>

      {/* Config overrides (wider inputs) */}
      <Card data-variant="wide-input" style={{ "margin-bottom": "12px" }}>
        <SettingsRow
          title={language.t("settings.agentBehaviour.modelOverride.title")}
          description={language.t("settings.agentBehaviour.modelOverride.description")}
        >
          <TextField
            value={cfg().model ?? ""}
            placeholder="e.g. anthropic/claude-sonnet-4-20250514"
            onChange={(val) => update({ model: val || undefined })}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.temperature.title")}
          description={language.t("settings.agentBehaviour.temperature.description")}
        >
          <TextField
            value={cfg().temperature?.toString() ?? ""}
            placeholder={language.t("common.default")}
            onChange={(val) => {
              const parsed = parseFloat(val)
              update({ temperature: isNaN(parsed) ? undefined : parsed })
            }}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.topP.title")}
          description={language.t("settings.agentBehaviour.topP.description")}
        >
          <TextField
            value={cfg().top_p?.toString() ?? ""}
            placeholder={language.t("common.default")}
            onChange={(val) => {
              const parsed = parseFloat(val)
              update({ top_p: isNaN(parsed) ? undefined : parsed })
            }}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.maxSteps.title")}
          description={language.t("settings.agentBehaviour.maxSteps.description")}
        >
          <TextField
            value={cfg().steps?.toString() ?? ""}
            placeholder={language.t("common.default")}
            onChange={(val) => {
              const parsed = parseInt(val, 10)
              update({ steps: isNaN(parsed) ? undefined : parsed })
            }}
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.hidden.title")}
          description={language.t("settings.agentBehaviour.hidden.description")}
        >
          <Switch
            checked={cfg().hidden ?? false}
            onChange={(val) => {
              update({ hidden: val || undefined })
              // Clear default_agent if hiding the current default
              if (val && config().default_agent === props.name) {
                updateConfig({ default_agent: undefined })
              }
            }}
            hideLabel
          >
            {language.t("settings.agentBehaviour.hidden.title")}
          </Switch>
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentBehaviour.disable.title")}
          description={language.t("settings.agentBehaviour.disable.description")}
          last
        >
          <Switch
            checked={cfg().disable ?? false}
            onChange={(val) => {
              update({ disable: val || undefined })
              // Clear default_agent if disabling the current default
              if (val && config().default_agent === props.name) {
                updateConfig({ default_agent: undefined })
              }
            }}
            hideLabel
          >
            {language.t("settings.agentBehaviour.disable.title")}
          </Switch>
        </SettingsRow>
      </Card>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

/** Collapsible read-only view of the built-in default system prompt. */
const DefaultPromptSection: Component<{ prompt: string | undefined }> = (props) => {
  const language = useLanguage()
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)

  const copy = () => {
    if (!props.prompt) return
    navigator.clipboard.writeText(props.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
          <IconButton
            size="small"
            variant="ghost"
            icon={expanded() ? "chevron-down" : "chevron-right"}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          />
          <span data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
            {language.t("settings.agentBehaviour.editMode.defaultPrompt")}
          </span>
        </div>
        <Show when={props.prompt && expanded()}>
          <div onClick={(e: MouseEvent) => e.stopPropagation()}>
            <Button variant="ghost" size="small" onClick={copy}>
              {copied()
                ? language.t("settings.agentBehaviour.editMode.defaultPrompt.copied")
                : language.t("settings.agentBehaviour.editMode.defaultPrompt.copy")}
            </Button>
          </div>
        </Show>
      </div>
      <div
        style={{
          "font-size": "11px",
          color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
          "margin-top": "4px",
          "padding-left": "30px",
        }}
      >
        {language.t("settings.agentBehaviour.editMode.defaultPrompt.description")}
      </div>
      <Show when={expanded()}>
        <Show
          when={props.prompt}
          fallback={
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                "margin-top": "8px",
                "padding-left": "30px",
                "font-style": "italic",
              }}
            >
              {language.t("settings.agentBehaviour.editMode.defaultPrompt.none")}
            </div>
          }
        >
          <pre
            style={{
              "margin-top": "8px",
              "margin-bottom": "0",
              padding: "8px 12px",
              "background-color": "var(--bg-inset-base, var(--vscode-editor-background))",
              border: "1px solid var(--border-weak-base, var(--vscode-panel-border))",
              "border-radius": "4px",
              "font-family": "var(--vscode-editor-font-family, monospace)",
              "font-size": "12px",
              "line-height": "1.5",
              "white-space": "pre-wrap",
              "word-break": "break-word",
              "max-height": "400px",
              "overflow-y": "auto",
              color: "var(--vscode-editor-foreground)",
            }}
          >
            {props.prompt}
          </pre>
        </Show>
      </Show>
    </Card>
  )
}

/** Shows the list of available sub-agents that primary modes can delegate to. */
const SubagentsSection: Component<{ agents: AgentInfo[] }> = (props) => {
  const language = useLanguage()
  const [expanded, setExpanded] = createSignal(false)

  return (
    <Card style={{ "margin-bottom": "12px" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          cursor: "pointer",
          gap: "6px",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <IconButton
          size="small"
          variant="ghost"
          icon={expanded() ? "chevron-down" : "chevron-right"}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        />
        <span data-slot="settings-row-label-title" style={{ "margin-bottom": "0" }}>
          {language.t("settings.agentBehaviour.editMode.subagents")}
        </span>
      </div>
      <div
        style={{
          "font-size": "11px",
          color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
          "margin-top": "4px",
          "padding-left": "30px",
        }}
      >
        {language.t("settings.agentBehaviour.editMode.subagents.description")}
      </div>
      <Show when={expanded()}>
        <Show
          when={props.agents.length > 0}
          fallback={
            <div
              style={{
                "font-size": "12px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                "margin-top": "8px",
                "padding-left": "30px",
                "font-style": "italic",
              }}
            >
              {language.t("settings.agentBehaviour.editMode.subagents.none")}
            </div>
          }
        >
          <div style={{ "margin-top": "8px" }}>
            <For each={props.agents}>
              {(agent, index) => <SubagentCard agent={agent} last={index() === props.agents.length - 1} />}
            </For>
          </div>
        </Show>
      </Show>
    </Card>
  )
}

/** A single sub-agent card with its name, description, and collapsible prompt. */
const SubagentCard: Component<{ agent: AgentInfo; last: boolean }> = (props) => {
  const [open, setOpen] = createSignal(false)

  return (
    <div
      style={{
        padding: "8px 0 8px 30px",
        "border-bottom": props.last ? "none" : "1px solid var(--border-weak-base)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "6px",
          cursor: props.agent.prompt ? "pointer" : "default",
        }}
        onClick={() => {
          if (props.agent.prompt) setOpen((v) => !v)
        }}
      >
        <Show when={props.agent.prompt}>
          <IconButton
            size="small"
            variant="ghost"
            icon={open() ? "chevron-down" : "chevron-right"}
            onClick={(e: MouseEvent) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
          />
        </Show>
        <div style={{ "font-weight": "500", "font-size": "13px" }}>{props.agent.name}</div>
      </div>
      <Show when={props.agent.description}>
        <div
          style={{
            "font-size": "11px",
            color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
            "margin-top": "2px",
            "padding-left": props.agent.prompt ? "30px" : "0",
          }}
        >
          {props.agent.description}
        </div>
      </Show>
      <Show when={open() && props.agent.prompt}>
        <pre
          style={{
            "margin-top": "6px",
            "margin-bottom": "0",
            padding: "8px 12px",
            "background-color": "var(--bg-inset-base, var(--vscode-editor-background))",
            border: "1px solid var(--border-weak-base, var(--vscode-panel-border))",
            "border-radius": "4px",
            "font-family": "var(--vscode-editor-font-family, monospace)",
            "font-size": "12px",
            "line-height": "1.5",
            "white-space": "pre-wrap",
            "word-break": "break-word",
            "max-height": "300px",
            "overflow-y": "auto",
            color: "var(--vscode-editor-foreground)",
          }}
        >
          {props.agent.prompt}
        </pre>
      </Show>
    </div>
  )
}

export default ModeEditView
