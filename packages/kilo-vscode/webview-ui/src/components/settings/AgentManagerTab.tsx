import { Component, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Portal } from "solid-js/web"
import { Select } from "@kilocode/kilo-ui/select"
import { Button } from "@kilocode/kilo-ui/button"
import { Card } from "@kilocode/kilo-ui/card"
import { Icon } from "@kilocode/kilo-ui/icon"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"
import type { BranchInfo } from "../../types/messages"
import SettingsRow from "./SettingsRow"
import "./AgentManagerTab.css"

interface DiffOption {
  value: "unified" | "split"
  label: string
}

const DIFF_OPTIONS: DiffOption[] = [
  { value: "unified", label: "Unified" },
  { value: "split", label: "Split" },
]

const AgentManagerTab: Component = () => {
  const vscode = useVSCode()
  const language = useLanguage()

  const [branch, setBranch] = createSignal("")
  const [style, setStyle] = createSignal<"unified" | "split">("unified")
  const [branches, setBranches] = createSignal<BranchInfo[]>([])
  const [detected, setDetected] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [search, setSearch] = createSignal("")
  const [highlighted, setHighlighted] = createSignal(-1)
  const [open, setOpen] = createSignal(false)

  let triggerRef: HTMLButtonElement | undefined
  let inputRef: HTMLInputElement | undefined
  const [pos, setPos] = createSignal({ top: 0, right: 0 })

  const filtered = createMemo(() => {
    const s = search().toLowerCase()
    if (!s) return branches()
    return branches().filter((b) => b.name.toLowerCase().includes(s))
  })

  const label = () => {
    const v = branch()
    if (!v) {
      const d = detected()
      return d
        ? `${language.t("settings.agentManager.defaultBaseBranch.auto")} (${d})`
        : language.t("settings.agentManager.defaultBaseBranch.auto")
    }
    return v
  }

  const toggle = () => {
    const next = !open()
    if (next && triggerRef) {
      const rect = triggerRef.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen(next)
    if (next) setTimeout(() => inputRef?.focus(), 0)
    else {
      setSearch("")
      setHighlighted(-1)
    }
  }

  const select = (name: string | undefined) => {
    const v = name ?? ""
    setBranch(v)
    setOpen(false)
    setSearch("")
    setHighlighted(-1)
    vscode.postMessage({ type: "setAgentManagerSetting", key: "defaultBaseBranch", value: v })
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const items = filtered()
    const total = items.length + 1
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((p) => Math.min(p + 1, total - 2))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((p) => Math.max(p - 1, -1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = highlighted()
      if (idx === -1) select(undefined)
      else {
        const b = items[idx]
        if (b) select(b.name)
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  let dropdownRef: HTMLDivElement | undefined

  // Close on outside click
  const handleClickOutside = (e: MouseEvent) => {
    if (!open()) return
    const target = e.target as Node
    if (triggerRef?.contains(target)) return
    if (dropdownRef?.contains(target)) return
    setOpen(false)
    setSearch("")
    setHighlighted(-1)
  }
  onMount(() => document.addEventListener("mousedown", handleClickOutside))
  onCleanup(() => document.removeEventListener("mousedown", handleClickOutside))

  onMount(() => {
    const unsub = vscode.onMessage((msg) => {
      if (msg.type === "agentManagerSettings") {
        const s = msg as { defaultBaseBranch: string; reviewDiffStyle: "unified" | "split" }
        setBranch(s.defaultBaseBranch)
        setStyle(s.reviewDiffStyle)
      }
      if (msg.type === "agentManagerBranches") {
        const s = msg as { branches: BranchInfo[]; defaultBranch: string }
        setBranches(s.branches)
        setDetected(s.defaultBranch)
        setLoading(false)
      }
    })
    vscode.postMessage({ type: "requestAgentManagerSettings" })
    vscode.postMessage({ type: "requestAgentManagerBranches" })
    onCleanup(unsub)
  })

  return (
    <div>
      <Card>
        <div class="am-settings-branch-picker-row">
          <SettingsRow
            title={language.t("settings.agentManager.defaultBaseBranch.title")}
            description={language.t("settings.agentManager.defaultBaseBranch.description")}
          >
            <div class="am-settings-branch-picker">
              <Button
                ref={triggerRef}
                variant="secondary"
                size="small"
                onClick={toggle}
                class="am-settings-branch-trigger"
              >
                <span class="am-settings-branch-label">{label()}</span>
                <Icon name="selector" size="small" />
              </Button>
              <Show when={open()}>
                <Portal>
                  <div
                    ref={dropdownRef}
                    class="am-settings-branch-dropdown"
                    style={{ top: `${pos().top}px`, right: `${pos().right}px` }}
                  >
                    <div class="am-settings-branch-search">
                      <Icon name="magnifying-glass" size="small" />
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder={language.t("settings.agentManager.defaultBaseBranch.search")}
                        value={search()}
                        onInput={(e) => {
                          setSearch(e.currentTarget.value)
                          setHighlighted(-1)
                        }}
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                    <div class="am-settings-branch-list">
                      {/* Auto-detect option */}
                      <button
                        type="button"
                        classList={{
                          "am-settings-branch-item": true,
                          "am-settings-branch-highlighted": highlighted() === -1,
                          "am-settings-branch-active": !branch(),
                        }}
                        onClick={() => select(undefined)}
                        onMouseEnter={() => setHighlighted(-1)}
                      >
                        <span class="am-settings-branch-left">
                          <Icon name="branch" size="small" />
                          <span>{language.t("settings.agentManager.defaultBaseBranch.auto")}</span>
                        </span>
                        <Show when={detected()}>
                          <span class="am-settings-branch-hint">{detected()}</span>
                        </Show>
                      </button>

                      <Show when={loading() && branches().length === 0}>
                        <div class="am-settings-branch-empty">
                          <Spinner />
                          <span>{language.t("settings.agentManager.defaultBaseBranch.loading")}</span>
                        </div>
                      </Show>

                      <For each={filtered()}>
                        {(b, index) => (
                          <button
                            type="button"
                            classList={{
                              "am-settings-branch-item": true,
                              "am-settings-branch-highlighted": highlighted() === index(),
                              "am-settings-branch-active": branch() === b.name,
                            }}
                            onClick={() => select(b.name)}
                            onMouseEnter={() => setHighlighted(index())}
                          >
                            <span class="am-settings-branch-left">
                              <Icon name="branch" size="small" />
                              <span>{b.name}</span>
                              <Show when={b.isDefault}>
                                <span class="am-settings-branch-badge">default</span>
                              </Show>
                              <Show when={!b.isLocal && b.isRemote}>
                                <span class="am-settings-branch-badge am-settings-branch-badge-remote">remote</span>
                              </Show>
                            </span>
                            <Show when={b.lastCommitDate}>
                              <span class="am-settings-branch-hint">{b.lastCommitDate}</span>
                            </Show>
                          </button>
                        )}
                      </For>

                      <Show when={!loading() && filtered().length === 0 && search()}>
                        <div class="am-settings-branch-empty">
                          {language.t("settings.agentManager.defaultBaseBranch.empty")}
                        </div>
                      </Show>
                    </div>
                  </div>
                </Portal>
              </Show>
            </div>
          </SettingsRow>
        </div>

        <SettingsRow
          title={language.t("settings.agentManager.reviewDiffStyle.title")}
          description={language.t("settings.agentManager.reviewDiffStyle.description")}
        >
          <Select
            options={DIFF_OPTIONS}
            current={DIFF_OPTIONS.find((o) => o.value === style())}
            value={(o) => o.value}
            label={(o) => o.label}
            onSelect={(o) => {
              if (!o || o.value === style()) return
              setStyle(o.value)
              vscode.postMessage({ type: "setAgentManagerSetting", key: "reviewDiffStyle", value: o.value })
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </SettingsRow>

        <SettingsRow
          title={language.t("settings.agentManager.setupScript.title")}
          description={language.t("settings.agentManager.setupScript.description")}
          last
        >
          <Button
            variant="secondary"
            size="small"
            onClick={() => vscode.postMessage({ type: "agentManager.configureSetupScript" })}
          >
            {language.t("settings.agentManager.setupScript.button")}
          </Button>
        </SettingsRow>
      </Card>
    </div>
  )
}

export default AgentManagerTab
