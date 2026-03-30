/** @jsxImportSource solid-js */
import { Component, Show, createSignal } from "solid-js"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Card } from "@kilocode/kilo-ui/card"
import { Button } from "@kilocode/kilo-ui/button"
import { IconButton } from "@kilocode/kilo-ui/icon-button"

import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import type { McpConfig } from "../../types/messages"

type Transport = "stdio" | "sse"

interface Props {
  taken: string[]
  onBack: () => void
}

const McpAddView: Component<Props> = (props) => {
  const language = useLanguage()
  const { config, updateConfig } = useConfig()

  const [name, setName] = createSignal("")
  const [transport, setTransport] = createSignal<Transport>("stdio")
  const [command, setCommand] = createSignal("")
  const [args, setArgs] = createSignal("")
  const [url, setUrl] = createSignal("")
  const [error, setError] = createSignal("")

  const validate = (): string => {
    const val = name().trim()
    if (!val) return language.t("settings.agentBehaviour.addMcp.nameRequired")
    if (props.taken.includes(val)) return language.t("settings.agentBehaviour.addMcp.nameTaken")
    if (transport() === "stdio" && !command().trim())
      return language.t("settings.agentBehaviour.addMcp.commandRequired")
    if (transport() === "sse" && !url().trim()) return language.t("settings.agentBehaviour.addMcp.urlRequired")
    return ""
  }

  const reset = () => {
    setName("")
    setTransport("stdio")
    setCommand("")
    setArgs("")
    setUrl("")
    setError("")
  }

  const cancel = () => {
    reset()
    props.onBack()
  }

  const submit = () => {
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    const slug = name().trim()
    const argv = [command().trim(), ...args().trim().split(/\n/).filter(Boolean)]
    const mcp: McpConfig =
      transport() === "stdio" ? { type: "local", command: argv } : { type: "remote", url: url().trim() }
    const existing = config().mcp ?? {}
    updateConfig({ mcp: { ...existing, [slug]: mcp } })
    reset()
    props.onBack()
  }

  return (
    <div>
      <div style={{ display: "flex", "align-items": "center", "margin-bottom": "16px" }}>
        <IconButton size="small" variant="ghost" icon="arrow-left" onClick={cancel} />
        <span style={{ "font-weight": "600", "font-size": "14px", "margin-left": "8px" }}>
          {language.t("settings.agentBehaviour.addMcp")}
        </span>
      </div>

      {/* Name */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
          {language.t("settings.agentBehaviour.addMcp.name")}
        </div>
        <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
          {language.t("settings.agentBehaviour.addMcp.name.description")}
        </div>
        <TextField
          value={name()}
          placeholder={language.t("settings.agentBehaviour.addMcp.name.placeholder")}
          onChange={(val) => {
            setName(val)
            setError("")
          }}
        />
        <Show when={error()}>
          <div style={{ "font-size": "11px", color: "var(--vscode-errorForeground)", "margin-top": "4px" }}>
            {error()}
          </div>
        </Show>
      </Card>

      {/* Transport type */}
      <Card style={{ "margin-bottom": "12px" }}>
        <div data-slot="settings-row-label-title" style={{ "margin-bottom": "8px" }}>
          {language.t("settings.agentBehaviour.addMcp.transport")}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            variant={transport() === "stdio" ? "primary" : "ghost"}
            size="small"
            onClick={() => setTransport("stdio")}
          >
            {language.t("settings.agentBehaviour.addMcp.transport.stdio")}
          </Button>
          <Button
            variant={transport() === "sse" ? "primary" : "ghost"}
            size="small"
            onClick={() => setTransport("sse")}
          >
            {language.t("settings.agentBehaviour.addMcp.transport.sse")}
          </Button>
        </div>
      </Card>

      {/* Transport-specific fields */}
      <Show when={transport() === "stdio"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addMcp.command")}
          </div>
          <TextField
            value={command()}
            placeholder={language.t("settings.agentBehaviour.addMcp.command.placeholder")}
            onChange={(val) => setCommand(val)}
          />
        </Card>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addMcp.args")}
          </div>
          <div data-slot="settings-row-label-subtitle" style={{ "margin-bottom": "8px" }}>
            {language.t("settings.agentBehaviour.addMcp.args.help")}
          </div>
          <TextField
            value={args()}
            placeholder={language.t("settings.agentBehaviour.addMcp.args.placeholder")}
            multiline
            onChange={(val) => setArgs(val)}
          />
        </Card>
      </Show>

      <Show when={transport() === "sse"}>
        <Card style={{ "margin-bottom": "12px" }}>
          <div data-slot="settings-row-label-title" style={{ "margin-bottom": "4px" }}>
            {language.t("settings.agentBehaviour.addMcp.url")}
          </div>
          <TextField
            value={url()}
            placeholder={language.t("settings.agentBehaviour.addMcp.url.placeholder")}
            onChange={(val) => setUrl(val)}
          />
        </Card>
      </Show>

      <div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
        <Button variant="ghost" onClick={cancel}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={submit}>
          {language.t("settings.agentBehaviour.addMcp.button")}
        </Button>
      </div>
    </div>
  )
}

export default McpAddView
