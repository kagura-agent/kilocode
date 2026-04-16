import { Prompt, type PromptRef } from "@tui/component/prompt"
import { createEffect, createMemo, createSignal, Match, Show, Switch } from "solid-js"
import { Logo } from "../component/logo"
import { useSync } from "../context/sync"
import { Toast } from "../ui/toast"
import { useArgs } from "../context/args"
import { useRouteData } from "@tui/context/route"
import { usePromptRef } from "../context/prompt"
import { useLocal } from "../context/local"
import { TuiPluginRuntime } from "../plugin"
import { useTheme } from "@tui/context/theme"
import { useDirectory } from "../context/directory"
import { Installation } from "@/installation"
import { RemoteIndicator } from "@/kilocode/remote-tui" // kilocode_change
import { useSDK } from "../context/sdk" // kilocode_change
import { indexingEnabled } from "@/kilocode/indexing-feature" // kilocode_change
import { formatIndexingLabel } from "@/kilocode/indexing-label" // kilocode_change

// TODO: what is the best way to do this?
let once = false
const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function Home() {
  const sync = useSync()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const [ref, setRef] = createSignal<PromptRef | undefined>()
  const args = useArgs()
  const local = useLocal()
  const sdk = useSDK() // kilocode_change
  const { theme } = useTheme() // kilocode_change
  const directory = useDirectory() // kilocode_change
  let sent = false

  const mcp = createMemo(() => Object.keys(sync.data.mcp).length > 0) // kilocode_change
  const mcpError = createMemo(() => Object.values(sync.data.mcp).some((x) => x.status === "failed")) // kilocode_change
  const connectedMcpCount = createMemo(
    () => Object.values(sync.data.mcp).filter((x) => x.status === "connected").length,
  ) // kilocode_change
  const indexingOn = createMemo(() => indexingEnabled(sync.data.config)) // kilocode_change
  const indexing = createMemo(() => sync.data.indexing) // kilocode_change
  const indexingLabel = createMemo(() => formatIndexingLabel(indexing())) // kilocode_change
  const indexingColor = createMemo(() => {
    // kilocode_change
    if (indexing().state === "Complete") return theme.success
    if (indexing().state === "Error") return theme.error
    if (indexing().state === "In Progress") return theme.warning
    return theme.textMuted
  })

  const bind = (r: PromptRef | undefined) => {
    setRef(r)
    promptRef.set(r)
    if (once || !r) return
    if (route.initialPrompt) {
      r.set(route.initialPrompt)
      once = true
      return
    }
    if (!args.prompt) return
    r.set({ input: args.prompt, parts: [] })
    once = true
  }

  // Wait for sync and model store to be ready before auto-submitting --prompt
  createEffect(() => {
    const r = ref()
    if (sent) return
    if (!r) return
    if (!sync.ready || !local.model.ready) return
    if (!args.prompt) return
    if (r.current.input !== args.prompt) return
    sent = true
    r.submit()
  })

  return (
    <>
      <box flexGrow={1} alignItems="center" paddingLeft={2} paddingRight={2}>
        <box flexGrow={1} minHeight={0} />
        <box height={4} minHeight={0} flexShrink={1} />
        <box flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_logo" mode="replace">
            <Logo />
          </TuiPluginRuntime.Slot>
        </box>
        <box height={1} minHeight={0} flexShrink={1} />
        <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
          <TuiPluginRuntime.Slot name="home_prompt" mode="replace" workspace_id={route.workspaceID} ref={bind}>
            <Prompt
              ref={bind}
              workspaceID={route.workspaceID}
              right={<TuiPluginRuntime.Slot name="home_prompt_right" workspace_id={route.workspaceID} />}
              placeholders={placeholder}
            />
          </TuiPluginRuntime.Slot>
        </box>
        <TuiPluginRuntime.Slot name="home_bottom" />
        <box flexGrow={1} minHeight={0} />
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <TuiPluginRuntime.Slot name="home_footer" mode="single_winner">
          <box
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={2}
            paddingRight={2}
            flexDirection="row"
            flexShrink={0}
            gap={2}
          >
            <text fg={theme.textMuted}>{directory()}</text>
            <box gap={1} flexDirection="row" flexShrink={0}>
              <RemoteIndicator sdk={sdk} theme={theme} kilo={sync.data.provider_next.connected.includes("kilo")} />
              <Show when={mcp()}>
                <text fg={theme.text}>
                  <Switch>
                    <Match when={mcpError()}>
                      <span style={{ fg: theme.error }}>⊙ </span>
                    </Match>
                    <Match when={true}>
                      <span style={{ fg: connectedMcpCount() > 0 ? theme.success : theme.textMuted }}>⊙ </span>
                    </Match>
                  </Switch>
                  {connectedMcpCount()} MCP
                </text>
                <text fg={theme.textMuted}>/status</text>
              </Show>
              <Show when={indexingOn()}>
                <text fg={indexingColor()}>{indexingLabel().slice(0, 48)}</text>
              </Show>
            </box>
            <box flexGrow={1} />
            <box flexShrink={0}>
              <text fg={theme.textMuted}>{Installation.VERSION}</text>
            </box>
          </box>
        </TuiPluginRuntime.Slot>
      </box>
    </>
  )
}
