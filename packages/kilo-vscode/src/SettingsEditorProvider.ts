import * as vscode from "vscode"
import { KiloProvider } from "./KiloProvider"
import { resolvePanelProjectDirectory } from "./project-directory"
import type { KiloConnectionService } from "./services/cli-backend"
import type { RemoteStatusService } from "./services/RemoteStatusService"

type PanelView = "settings" | "profile" | "marketplace"

const PANEL_TITLES: Record<PanelView, string> = {
  settings: "Kilo Settings",
  profile: "Kilo Profile",
  marketplace: "Kilo Marketplace",
}

/**
 * Opens Settings, Profile, or Marketplace as an editor-area WebviewPanel,
 * keeping the sidebar chat undisturbed.
 *
 * Each view type is a singleton panel — calling openPanel() again
 * reveals the existing panel instead of creating a duplicate.
 *
 * Uses a full KiloProvider under the hood so each panel has
 * the same backend connectivity (config, providers, profile, auth)
 * as the sidebar.
 */
export class SettingsEditorProvider implements vscode.Disposable {
  private panels = new Map<PanelView, vscode.WebviewPanel>()
  private providers = new Map<PanelView, KiloProvider>()
  private tabs = new Map<PanelView, string>()
  private remoteService: RemoteStatusService | null = null

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly connectionService: KiloConnectionService,
    private readonly context: vscode.ExtensionContext,
  ) {}

  private getProjectDirectory(): string | null {
    const editor = vscode.window.activeTextEditor
    const active =
      editor?.document.uri.scheme === "file"
        ? vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath
        : undefined
    return resolvePanelProjectDirectory(active, vscode.workspace.workspaceFolders)
  }

  /** Extract the PanelView from a viewType string like "kilo-code.new.settingsPanel". */
  static viewFromType(type: string): PanelView | undefined {
    const match = type.match(/^kilo-code\.new\.(\w+)Panel$/)
    if (!match) return undefined
    const view = match[1] as PanelView
    if (!(view in PANEL_TITLES)) return undefined
    return view
  }

  openPanel(view: PanelView, tab?: string, directory?: string | null): void {
    if (tab) this.tabs.set(view, tab)

    const projectDirectory = directory ?? this.getProjectDirectory()
    const existing = this.panels.get(view)
    if (existing) {
      this.providers.get(view)?.setProjectDirectory(projectDirectory)
      if (tab) {
        const provider = this.providers.get(view)
        provider?.postMessage({ type: "navigate", view, tab })
      }
      existing.reveal(vscode.ViewColumn.One)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      `kilo-code.new.${view}Panel`,
      PANEL_TITLES[view],
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    )

    this.wirePanel(panel, view, projectDirectory)
  }

  /** Re-wire a deserialized panel after extension restart. */
  deserializePanel(panel: vscode.WebviewPanel): void {
    const view = SettingsEditorProvider.viewFromType(panel.viewType)
    if (!view) {
      panel.dispose()
      return
    }
    this.wirePanel(panel, view, this.getProjectDirectory())
  }

  private wirePanel(panel: vscode.WebviewPanel, view: PanelView, projectDirectory: string | null): void {
    panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "kilo-light.svg"),
      dark: vscode.Uri.joinPath(this.extensionUri, "assets", "icons", "kilo-dark.svg"),
    }

    // Create a dedicated KiloProvider for this panel so it has full
    // backend connectivity (config, providers, agents, profile, auth).
    const provider = new KiloProvider(this.extensionUri, this.connectionService, this.context, {
      projectDirectory,
    })
    if (this.remoteService) {
      provider.setRemoteService(this.remoteService)
    }
    provider.resolveWebviewPanel(panel)

    // Listen for closePanel and agent manager settings from the webview
    const closePanelDisposable = panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "closePanel") {
        panel.dispose()
      }
      // Forward agent manager setup script action to the registered command
      if (msg.type === "agentManager.configureSetupScript") {
        void vscode.commands.executeCommand("kilo-code.new.agentManager.configureSetupScript")
      }
      // Agent manager settings: read current values and push to webview
      if (msg.type === "requestAgentManagerSettings") {
        const settings = await vscode.commands.executeCommand("kilo-code.new.agentManager.getSettings")
        provider.postMessage({ type: "agentManagerSettings", ...(settings as object) })
      }
      // Agent manager settings: write a value via command
      if (msg.type === "setAgentManagerSetting") {
        const { key, value } = msg as { key: string; value: unknown }
        if (key === "defaultBaseBranch") {
          void vscode.commands.executeCommand("kilo-code.new.agentManager.setDefaultBaseBranch", value)
        }
        if (key === "reviewDiffStyle") {
          void vscode.commands.executeCommand("kilo-code.new.agentManager.setReviewDiffStyle", value)
        }
      }
      // Agent manager branches: fetch branch list for the default base branch picker
      if (msg.type === "requestAgentManagerBranches") {
        const data = await vscode.commands.executeCommand("kilo-code.new.agentManager.getBranches")
        provider.postMessage({ type: "agentManagerBranches", ...(data as object) })
      }
    })

    // Navigate to the target view on every webviewReady (including after
    // "Developer: Reload Webviews" which re-creates the JS context).
    const readyDisposable = panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "webviewReady") {
        // Small delay to let KiloProvider's own webviewReady handler finish first
        setTimeout(() => {
          provider.postMessage({ type: "navigate", view, tab: this.tabs.get(view) })
        }, 50)
      }
    })

    // Remember the active settings tab so it survives webview reloads.
    const tabDisposable = panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "settingsTabChanged" && typeof msg.tab === "string") {
        this.tabs.set(view, msg.tab)
      }
    })

    this.panels.set(view, panel)
    this.providers.set(view, provider)

    const title = PANEL_TITLES[view]
    panel.onDidDispose(() => {
      console.log(`[Kilo New] ${title} panel disposed`)
      closePanelDisposable.dispose()
      readyDisposable.dispose()
      tabDisposable.dispose()
      provider.dispose()
      this.panels.delete(view)
      this.providers.delete(view)
      this.tabs.delete(view)
    })
  }

  setRemoteService(service: RemoteStatusService): void {
    this.remoteService = service
    // Apply to any existing providers
    for (const [, provider] of this.providers) {
      provider.setRemoteService(service)
    }
  }

  dispose(): void {
    for (const [, panel] of this.panels) {
      panel.dispose()
    }
    this.panels.clear()
    this.providers.clear()
  }
}
