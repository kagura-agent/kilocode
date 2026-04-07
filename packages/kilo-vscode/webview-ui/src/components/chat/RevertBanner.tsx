/**
 * RevertBanner component
 * Shows when the session is in a reverted state, displaying the number of
 * reverted messages (or edits for part-level revert), per-file diff stats,
 * and Redo / Redo All actions.
 */

import { Component, For, Show } from "solid-js"
import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { DiffChanges } from "@kilocode/kilo-ui/diff-changes"
import { useSession } from "../../context/session"
import { useLanguage } from "../../context/language"

export const RevertBanner: Component = () => {
  const session = useSession()
  const language = useLanguage()

  const info = () => session.revert()
  const count = () => session.revertedCount()
  const diffs = () => session.summary()?.diffs
  const isPartLevel = () => !!info()?.partID

  const users = () => session.userMessages()

  const handleRedo = () => {
    const rev = info()
    if (!rev) return
    // For part-level revert, redo just goes back to full undo
    if (rev.partID) {
      session.unrevertSession()
      return
    }
    const next = users().find((m) => m.id > rev.messageID)
    if (!next) {
      session.unrevertSession()
      return
    }
    session.revertSession(next.id)
  }

  const label = () => {
    if (isPartLevel()) {
      const n = diffs()?.length ?? 0
      return n === 1
        ? language.t("revert.banner.count_one", { count: n })
        : language.t("revert.banner.count_other", { count: n })
    }
    return count() === 1
      ? language.t("revert.banner.count_one", { count: count() })
      : language.t("revert.banner.count_other", { count: count() })
  }

  return (
    <Show when={info()}>
      <div class="revert-banner">
        <div class="revert-banner-header">
          <div class="revert-banner-info">
            <Icon name="arrow-left" size="small" />
            <span class="revert-banner-count">{label()}</span>
          </div>
          <div class="revert-banner-actions">
            <Button variant="ghost" size="small" onClick={handleRedo}>
              {language.t("revert.banner.redo")}
            </Button>
            <Show when={!isPartLevel() && count() > 1}>
              <Button variant="ghost" size="small" onClick={() => session.unrevertSession()}>
                {language.t("revert.banner.redo.all")}
              </Button>
            </Show>
          </div>
        </div>
        <Show when={diffs()?.length}>
          <div class="revert-banner-files">
            <For each={diffs()!}>
              {(file) => (
                <div class="revert-banner-file">
                  <span class="revert-banner-filename">{file.file}</span>
                  <DiffChanges changes={file} />
                </div>
              )}
            </For>
          </div>
        </Show>
        <div class="revert-banner-hint">{language.t("revert.banner.hint")}</div>
      </div>
    </Show>
  )
}
