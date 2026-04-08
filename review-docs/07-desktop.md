# Review: Desktop Packages

This review covers upstream OpenCode v1.2.25 changes to both `packages/desktop-electron/` (Electron desktop app) and `packages/desktop/` (Tauri desktop app). The dominant theme is a major **architecture simplification**: removing the "connect to existing server" flow and always spawning a local sidecar, making credentials available immediately (before health check), and eliminating the `ServerGate` blocking component in favor of a `<Show>` that resolves eagerly. Secondary themes are **Windows ARM64 support** and **titlebar theming**.

---

## packages/desktop-electron/

### electron.vite.config.ts

**Risk: LOW**

- `publicDir` changed from `"../app/public"` to `"../../../app/public"`. Vite resolves `publicDir` relative to the renderer `root` (`src/renderer`), so after accounting for that, the previous value resolved incorrectly. The new path correctly reaches `packages/app/public` from `packages/desktop-electron/src/renderer/`.
- A companion test (`html.test.ts`) was added to guard against future regressions here.
- No concerns.

### package.json

**Risk: LOW**

- Adds `"effect": "4.0.0-beta.31"` as a dependency. This is likely required by upstream `@opencode-ai/app` which now uses Effect for `ServerConnection.Key.make()`.
- Pre-release (beta) dependency — acceptable since this is an upstream sync.

### scripts/finalize-latest-yml.ts

**Risk: LOW**

- Windows auto-updater manifests now merge ARM64 + x64 builds into a single `latest.yml`, rather than passing through only x64. Uses the ARM64 manifest as base, appends x64 files list.
- Straightforward logic. If only one arch is available, it still works (null-coalescing with `??`).

### scripts/utils.ts

**Risk: LOW**

- Adds `aarch64-pc-windows-msvc` to `SIDECAR_BINARIES` with `ocBinary: "opencode-windows-arm64"`.
- Updates `nativeTarget()` to return the correct Rust target for Windows ARM64.
- Note: The binary name uses the upstream `opencode-` prefix. This file doesn't have `kilocode_change` markers on the new entry, which is fine since the upstream name is correct for this package (desktop-electron uses upstream names throughout).

### src/main/cli.ts

**Risk: LOW**

- Adds `windowsHide: true` to `execFileSync` call to avoid flashing console windows on Windows.
- Sets `detached: process.platform !== "win32"` — on Windows, detached processes behave differently (creates a new console), so this avoids that.
- Both are Windows platform fixes, safe and well-understood.

### src/main/index.ts

**Risk: MEDIUM**

- **Major refactor**: Removes `setupServerConnection()` and the `ServerConnection` type entirely. The desktop app now always spawns a local sidecar and resolves `serverReady` immediately with URL + credentials (before health check completes).
- Removes the `loadingWindow` variable shadowing issue (was declared at module level and again in the function).
- Loading window logic is simplified: show only if SQLite migration takes >1s (using `Promise.race`), then always create the main window after loading completes.
- Adds a 30-second timeout on health check with error logging (previously no timeout on the Electron side).
- The `wireMenu()` call is moved before the loading window, which is correct since `mainWindow` is created after.
- **Concern**: If the sidecar health check fails or times out, the error is only logged — the app continues and creates the main window anyway. This is intentional (the web app handles its own health gating), but could lead to a confusing UX if the sidecar never becomes healthy. Acceptable trade-off for the simpler architecture.

### src/main/ipc.ts

**Risk: LOW**

- Adds `set-titlebar` IPC handler that calls `setTitlebar()` from windows module, allowing the renderer to dynamically update the Windows titlebar overlay theme.
- Clean, minimal change.

### src/main/server.ts

**Risk: LOW**

- Removes `getSavedServerUrl()`, `checkHealthOrAskRetry()`, `normalizeHostnameForUrl()`, and `getServerUrlFromConfig()`. These are no longer needed since the app always spawns its own sidecar.
- Removes the `dialog` import (no more retry dialogs).
- `checkHealth()` is retained for the health check loop in `spawnLocalServer`.
- Clean removal of dead code.

### src/main/windows.ts

**Risk: LOW**

- Adds `setTitlebar()` export for dynamic titlebar theme changes on Windows.
- Adds `tone()` helper using `nativeTheme.shouldUseDarkColors`.
- Replaces hardcoded `symbolColor: "#999"` with dynamic light/dark detection, using transparent background and white/black symbols.
- Applied consistently to both main window and loading window.
- Good improvement for Windows dark mode support.

### src/preload/index.ts

**Risk: LOW**

- Exposes `setTitlebar` IPC bridge to renderer. Single line addition, consistent with existing pattern.

### src/preload/types.ts

**Risk: LOW**

- Adds `username` field to `ServerReadyData` (was previously hardcoded as `"opencode"` in the renderer).
- Adds `TitlebarTheme` type with `mode: "light" | "dark"`.
- Adds `setTitlebar` to `ElectronAPI`.
- Clean type additions.

### src/renderer/html.test.ts

**Risk: LOW**

- **New file**: Tests that `index.html` and `loading.html` use relative paths (`./`) for all resources (scripts, links), don't include web manifests, and that the Vite `publicDir` config resolves correctly.
- Good defensive tests — Electron's `file://` protocol breaks with absolute paths. Prevents regressions.

### src/renderer/index.html

**Risk: LOW**

- All resource paths changed from absolute (`/favicon-v3.svg`) to relative (`./favicon-v3.svg`).
- Removes `rel="manifest"` link (web manifests don't apply in Electron).
- Required fix for Electron's `file://` protocol. Well-tested by the new html.test.ts.

### src/renderer/index.tsx

**Risk: MEDIUM**

- **Major refactor**: Removes `ServerGate` component and its splash screen fallback. Replaces with eager resource fetching:
  - `sidecar` resource calls `awaitInitialization` (resolves immediately with credentials).
  - `defaultServer` resource fetches the configured default server.
  - `servers()` derives the sidecar connection from credentials.
- `<Show when={!defaultServer.loading && !sidecar.loading}>` replaces the old blocking gate.
- Platform API renames: `getDefaultServerUrl` → `getDefaultServer`, `setDefaultServerUrl` → `setDefaultServer`. Return type changes from raw URL string to `ServerConnection.Key`.
- Default server key changed from `ServerConnection.key(server)` to `ServerConnection.Key.make("sidecar")` as fallback.
- `Inner` component (menu bridge) moved outside of the render callback.
- Removes unused imports (`Splash`, `Accessor`, `JSX`, `ServerReadyData`).
- **Concern**: The `servers()` accessor returns `[]` while `sidecar` is loading, but `<Show>` gates on `!sidecar.loading` so `AppInterface` should always get a populated array. Logic looks correct.

### src/renderer/loading.html

**Risk: LOW**

- Same relative path fixes as `index.html`. Removes web manifest link.

### src/renderer/loading.tsx

**Risk: LOW**

- Import reorder (cosmetic).
- When SQLite migration completes (`Done`), now also sets `step({ phase: "done" })` in addition to setting percent to 100. Previously the loading screen might not have reflected completion state.

### tsconfig.json

**Risk: LOW**

- Adds `"exclude": ["src/**/*.test.ts"]` to prevent test files from being included in the type-checked project build.
- Adds trailing comma to `include` (formatting fix).

---

## packages/desktop/

### scripts/finalize-latest-json.ts

**Risk: LOW**

- Adds `windows-aarch64-nsis` target and its alias for the Tauri updater manifest.
- Straightforward addition, consistent with existing patterns.

### scripts/utils.ts

**Risk: MEDIUM**

- Adds `aarch64-pc-windows-msvc` entry with `ocBinary: "opencode-windows-arm64"`.
- **Concern**: All other Kilo-specific entries use `@kilocode/cli-*` naming (e.g., `@kilocode/cli-darwin-arm64`, `@kilocode/cli-windows-x64`), but the new Windows ARM64 entry uses the upstream `opencode-windows-arm64` name. This is **likely a merge oversight** — it should probably be `@kilocode/cli-windows-arm64` with a `// kilocode_change` marker, consistent with the other entries.
- No `// kilocode_change` marker on the new entry, which further suggests this was introduced by the upstream merge without being adapted to the Kilo naming convention.

### src-tauri/src/lib.rs

**Risk: MEDIUM**

- **Major refactor** matching the Electron changes:
  - Removes `ServerConnection` enum and `setup_server_connection()` function.
  - Removes `ServerState` struct's `status` field and its `new()`/`set_child()` methods. Replaces with a simple struct holding only `Arc<Mutex<Option<CommandChild>>>`.
  - Adds `SidecarReady` newtype wrapping a shared future for `ServerReadyData`.
  - Sidecar is spawned immediately in `initialize()` and credentials are sent to `SidecarReady` before health check.
  - `await_initialization` now reads from `SidecarReady` instead of `ServerState.status`.
  - Removes `is_sidecar` field from `ServerReadyData`.
  - Removes `get_logs()` function (was used for error reporting on health check failure).
  - Loading task simplified: waits for SQLite migration then health check, but only for loading window progress. Main window is created immediately after (web app handles its own health gating).
  - Health check failures are logged but don't block app startup.
- **Concern**: Same as Electron — if sidecar never becomes healthy, the main window shows but the app won't function. This is an intentional architectural decision to let the web layer handle connection retries.
- Clean simplification overall. Removes ~120 lines.

### src-tauri/src/server.rs

**Risk: LOW**

- Removes `get_saved_server_url()`, `check_health_or_ask_retry()`, `is_localhost_url()`, `url_is_localhost()`, `normalize_hostname_for_url()`, and `get_server_url_from_config()`.
- `check_health()` visibility changed from `pub` to `pub(crate)` (private to crate) — actually just removed `pub`, making it module-private. This is correct since it's only called from within `server.rs` now.
- The localhost detection logic previously in `url_is_localhost()` is inlined into `check_health()` for the no-proxy decision.
- Removes `tauri_plugin_dialog` import (no more retry dialogs).
- Clean removal of dead code.

### src/bindings.ts

**Risk: LOW**

- Removes `is_sidecar: boolean` from `ServerReadyData` type. Consistent with the Rust side change.

### src/index.tsx

**Risk: MEDIUM**

- **Major refactor** mirroring the Electron renderer changes:
  - Removes `ServerGate` component and splash screen.
  - Fetches sidecar credentials eagerly via `createResource`.
  - Platform API renames: `getDefaultServerUrl` → `getDefaultServer`, `setDefaultServerUrl` → `setDefaultServer`.
  - `servers()` derives connection from sidecar data, `<Show>` gates on both resources loaded.
  - Default server fallback uses `ServerConnection.Key.make("sidecar")`.
  - `Inner` component moved outside render callback.
  - Removes unused imports (`Splash`, `JSX`, `ServerReadyData`).
- Same architectural pattern as the Electron version, well-aligned.
- No additional concerns beyond those noted for the Electron renderer.

---

## Summary

| Area                                       | Risk       | Notes                                                                                                             |
| ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Windows ARM64 support                      | LOW        | New sidecar binary entries, updater manifests, platform detection                                                 |
| Titlebar theming (Electron)                | LOW        | Dynamic dark/light titlebar on Windows                                                                            |
| HTML relative paths (Electron)             | LOW        | Fix for `file://` protocol, with tests                                                                            |
| Server connection simplification           | MEDIUM     | Major arch change: always spawn sidecar, credentials before health check                                          |
| ServerGate removal (renderers)             | MEDIUM     | Web layer now handles health gating instead of native shell                                                       |
| `packages/desktop/scripts/utils.ts` naming | **MEDIUM** | Windows ARM64 binary uses upstream `opencode-` name instead of `@kilocode/cli-` convention — **likely needs fix** |

### Action Items

1. **Fix `packages/desktop/scripts/utils.ts`**: The new `aarch64-pc-windows-msvc` entry should use `@kilocode/cli-windows-arm64` (with `// kilocode_change` marker) instead of `opencode-windows-arm64`, matching the convention of all other entries in this file.
