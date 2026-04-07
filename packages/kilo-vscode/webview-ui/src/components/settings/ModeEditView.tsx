import { Component, Show, createMemo, For } from "solid-js"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Switch } from "@kilocode/kilo-ui/switch"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Collapsible } from "@kilocode/kilo-ui/collapsible"

import { useConfig } from "../../context/config"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"
import type { AgentConfig, AgentInfo, PermissionRuleSet } from "../../types/messages"
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

      {/* Prompt (full-width, auto-resizing) */}
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

      <Collapsible variant="ghost">
        <Collapsible.Trigger
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            width: "100%",
            padding: "8px 12px",
            background: "var(--background-2, var(--vscode-editorWidget-background))",
            "border-radius": "6px",
            cursor: "pointer",
            "border-bottom": "1px solid var(--border-1, var(--vscode-widget-border))",
          }}
        >
          <Collapsible.Arrow />
          <div style={{ "text-align": "left", flex: "1" }}>
            <div style={{ "font-size": "13px", "font-weight": "500" }}>
              {language.t("settings.agentBehaviour.editMode.permissions")}
            </div>
            <div
              style={{
                "font-size": "11px",
                color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
              }}
            >
              {language.t("settings.agentBehaviour.editMode.permissions.description")}
            </div>
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content
          style={{
            background: "var(--background-2, var(--vscode-editorWidget-background))",
            "border-radius": "0 0 6px 6px",
            "border-top": "none",
            overflow: "hidden",
          }}
        >
          <Show
            when={agent()?.permission && agent()!.permission!.length > 0}
            fallback={
              <div
                style={{
                  padding: "12px",
                  "font-size": "13px",
                  color: "var(--text-weak-base, var(--vscode-descriptionForeground))",
                }}
              >
                {language.t("settings.agentBehaviour.editMode.permissions.empty")}
              </div>
            }
          >
            <div style={{ overflow: "auto", "max-height": "400px" }}>
              <table
                style={{
                  width: "100%",
                  "border-collapse": "collapse",
                  "font-size": "12px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--background-3, var(--vscode-sideBar-background))",
                      "border-bottom": "1px solid var(--border-1, var(--vscode-widget-border))",
                    }}
                  >
                    <th
                      style={{
                        padding: "8px",
                        "text-align": "left",
                        "font-weight": "600",
                        color: "var(--text-1, var(--vscode-foreground))",
                      }}
                    >
                      {language.t("settings.agentBehaviour.editMode.permissions.permission")}
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        "text-align": "left",
                        "font-weight": "600",
                        color: "var(--text-1, var(--vscode-foreground))",
                      }}
                    >
                      {language.t("settings.agentBehaviour.editMode.permissions.pattern")}
                    </th>
                    <th
                      style={{
                        padding: "8px",
                        "text-align": "left",
                        "font-weight": "600",
                        color: "var(--text-1, var(--vscode-foreground))",
                      }}
                    >
                      {language.t("settings.agentBehaviour.editMode.permissions.action")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={agent()?.permission ?? []}>
                    {(rule: PermissionRuleSet) => (
                      <tr
                        style={{
                          "border-bottom": "1px solid var(--border-1, var(--vscode-widget-border))",
                        }}
                      >
                        <td style={{ padding: "8px" }}>{rule.permission}</td>
                        <td
                          style={{
                            padding: "8px",
                            "font-family": "var(--font-family-mono, monospace)",
                            "word-break": "break-all",
                          }}
                        >
                          {rule.pattern}
                        </td>
                        <td style={{ padding: "8px" }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              "border-radius": "4px",
                              "font-size": "11px",
                              "font-weight": "500",
                              background:
                                rule.action === "allow"
                                  ? "rgba(46, 160, 67, 0.2)"
                                  : rule.action === "deny"
                                    ? "rgba(215, 58, 73, 0.2)"
                                    : "rgba(136, 132, 216, 0.2)",
                              color:
                                rule.action === "allow" ? "#2ea043" : rule.action === "deny" ? "#f85149" : "#8b84e4",
                            }}
                          >
                            {language.t(`settings.agentBehaviour.editMode.permissions.action.${rule.action}`)}
                          </span>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Collapsible.Content>
      </Collapsible>

      <div style={{ display: "flex", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={props.onBack}>
          {language.t("settings.agentBehaviour.editMode.back")}
        </Button>
      </div>
    </div>
  )
}

export default ModeEditView
