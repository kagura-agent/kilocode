/**
 * LoginBanner component
 * Shown in the welcome screen header when the user is not logged in.
 * Clicking opens the profile editor tab.
 */

import { Component, Show } from "solid-js"
import { useServer } from "../../context/server"
import { useVSCode } from "../../context/vscode"
import { useLanguage } from "../../context/language"

export const LoginBanner: Component = () => {
  const server = useServer()
  const vscode = useVSCode()
  const language = useLanguage()

  return (
    <Show when={!server.profileData()}>
      <button type="button" class="kilo-login-banner" onClick={() => vscode.postMessage({ type: "openProfilePanel" })}>
        <span class="kilo-login-banner-title">{language.t("welcome.login.title")}</span>
        <span class="kilo-login-banner-desc">{language.t("welcome.login.desc")}</span>
      </button>
    </Show>
  )
}
