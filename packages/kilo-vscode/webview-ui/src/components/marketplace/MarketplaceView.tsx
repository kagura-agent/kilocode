import { Component, createSignal, createMemo, createEffect, on, onMount, onCleanup, For, Show } from "solid-js"
import { Tabs } from "@kilocode/kilo-ui/tabs"
import { Card } from "@kilocode/kilo-ui/card"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { useVSCode } from "../../context/vscode"
import { useServer } from "../../context/server"
import { useLanguage } from "../../context/language"
import type { MarketplaceItem, MarketplaceInstalledMetadata } from "../../types/marketplace"
import type { ExtensionMessage } from "../../types/messages"
import { MarketplaceListView } from "./MarketplaceListView"
import { SkillsMarketplace } from "./SkillsMarketplace"
import { InstallModal } from "./InstallModal"
import { RemoveDialog } from "./RemoveDialog"
import "./marketplace.css"

export const MarketplaceView: Component = () => {
  const vscode = useVSCode()
  const server = useServer()
  const dialog = useDialog()
  const { t } = useLanguage()

  const [items, setItems] = createSignal<MarketplaceItem[]>([])
  const [metadata, setMetadata] = createSignal<MarketplaceInstalledMetadata>({ project: {}, global: {} })
  const [fetching, setFetching] = createSignal(true)
  const [errors, setErrors] = createSignal<string[]>([])
  const [tab, setTab] = createSignal("mcp")
  const mcpItems = createMemo(() => items().filter((i) => i.type === "mcp"))
  const modeItems = createMemo(() => items().filter((i) => i.type === "mode"))
  const skillItems = createMemo(() => items().filter((i) => i.type === "skill"))

  const [pendingRemove, setPendingRemove] = createSignal<{ item: MarketplaceItem; scope: "project" | "global" } | null>(
    null,
  )
  const [removeError, setRemoveError] = createSignal<string | null>(null)

  const handleInstall = (item: MarketplaceItem) => {
    vscode.postMessage({
      type: "telemetry",
      event: "Marketplace Install Button Clicked",
      properties: { itemId: item.id, itemType: item.type, itemName: item.name },
    })
    dialog.show(() => <InstallModal item={item} onClose={dialog.close} onInstallResult={handleInstallResult} />)
  }

  const handleRemove = (item: MarketplaceItem, scope: "project" | "global") => {
    dialog.show(() => (
      <RemoveDialog
        item={item}
        scope={scope}
        onClose={dialog.close}
        onConfirm={() => handleRemoveConfirm(item, scope)}
      />
    ))
  }

  const handleInstallResult = (result: {
    success: boolean
    slug: string
    scope: "project" | "global"
    error?: string
  }) => {
    if (!result.success) return
    vscode.postMessage({
      type: "telemetry",
      event: "Marketplace Item Installed",
      properties: { itemId: result.slug, itemType: "unknown", itemName: result.slug, target: result.scope },
    })
    vscode.postMessage({ type: "fetchMarketplaceData" })
  }

  const handleRemoveConfirm = (item: MarketplaceItem, scope: "project" | "global") => {
    setPendingRemove({ item, scope })
    vscode.postMessage({
      type: "removeInstalledMarketplaceItem",
      mpItem: item,
      mpInstallOptions: { target: scope },
    })
    dialog.close()
  }

  onMount(() => {
    vscode.postMessage({ type: "telemetry", event: "Marketplace Tab Viewed" })
    vscode.postMessage({ type: "fetchMarketplaceData" })

    const unsubscribe = vscode.onMessage((msg: ExtensionMessage) => {
      if (msg.type === "marketplaceData") {
        setItems(msg.marketplaceItems)
        setMetadata(msg.marketplaceInstalledMetadata)
        setErrors(msg.errors ?? [])
        setFetching(false)
        return
      }
      if (msg.type === "marketplaceRemoveResult") {
        const pending = pendingRemove()
        if (msg.success) {
          if (pending) {
            vscode.postMessage({
              type: "telemetry",
              event: "Marketplace Item Removed",
              properties: {
                itemId: pending.item.id,
                itemType: pending.item.type,
                itemName: pending.item.name,
                target: pending.scope,
              },
            })
          }
          setRemoveError(null)
          vscode.postMessage({ type: "fetchMarketplaceData" })
        } else {
          setRemoveError(msg.error ?? t("marketplace.remove.failed", { name: pending?.item.name ?? "item" }))
        }
        setPendingRemove(null)
      }
      // Re-fetch marketplace data when agents or skills change externally
      // (e.g. mode removed via Settings, or CLI instance disposed)
      if (msg.type === "agentsLoaded" || msg.type === "skillsLoaded") {
        vscode.postMessage({ type: "fetchMarketplaceData" })
      }
    })

    onCleanup(unsubscribe)
  })

  createEffect(
    on(
      () => server.workspaceDirectory(),
      () => {
        setFetching(true)
        vscode.postMessage({ type: "fetchMarketplaceData" })
      },
      { defer: true },
    ),
  )

  return (
    <div class="marketplace-view">
      <Tabs value={tab()} onChange={setTab} class="marketplace-tabs-root">
        <Tabs.List>
          <Tabs.Trigger value="mcp">{t("marketplace.tab.mcp")}</Tabs.Trigger>
          <Tabs.Trigger value="mode">{t("marketplace.tab.modes")}</Tabs.Trigger>
          <Tabs.Trigger value="skill">{t("marketplace.tab.skills")}</Tabs.Trigger>
        </Tabs.List>

        <div class="marketplace-content">
          <For each={errors()}>
            {(err) => (
              <Card variant="error" class="marketplace-error-banner">
                {err}
              </Card>
            )}
          </For>
          <Show when={removeError()}>
            <Card variant="error" class="marketplace-error-banner">
              {removeError()}
              <IconButton icon="close" variant="ghost" size="small" onClick={() => setRemoveError(null)} />
            </Card>
          </Show>

          <Tabs.Content value="mcp">
            <MarketplaceListView
              type="mcp"
              items={mcpItems()}
              metadata={metadata()}
              fetching={fetching()}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>
          <Tabs.Content value="mode">
            <MarketplaceListView
              type="mode"
              items={modeItems()}
              metadata={metadata()}
              fetching={fetching()}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>
          <Tabs.Content value="skill">
            <SkillsMarketplace
              items={skillItems()}
              metadata={metadata()}
              fetching={fetching()}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  )
}
