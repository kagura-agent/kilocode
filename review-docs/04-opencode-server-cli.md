# Review: packages/opencode/ Server, CLI & Kilo-specific

## server/routes/config.ts

**Risk: LOW**

- Wraps `kiloApiDefault` with `ModelID.make()` when assigning to `defaults["kilo"]`. Part of the upstream branded-type migration — all IDs now go through `.make()` constructors instead of being plain strings.
- No concerns. The `kilocode_change` markers are intact.

## server/routes/experimental.ts

**Risk: LOW**

- Wraps `provider` and `model` query params with `ProviderID.make()` and `ModelID.make()` before passing to `ToolRegistry.tools()`.
- Consistent with the branded-type migration across all routes.

## server/routes/permission.ts

**Risk: LOW**

- Replaces `z.string()` validators for `requestID` params with `PermissionID.zod` (two routes: reply and reject).
- Adds stricter runtime validation. If SDK clients send non-conforming IDs, they'll now get 400 instead of passing through. This is correct behavior.

## server/routes/project.ts

**Risk: LOW**

- Replaces `z.string()` validator for `projectID` param with `ProjectID.zod`.
- Same pattern as all other route changes.

## server/routes/provider.ts

**Risk: LOW**

- Replaces `z.string()` validators for `providerID` in two routes (update model and custom model) with `ProviderID.zod`.
- `kilocode_change` marker on the `remeda` import is preserved.

## server/routes/pty.ts

**Risk: LOW**

- Replaces `z.string()` validators for `ptyID` with `PtyID.zod` across four routes (get, update, remove, WebSocket).
- In the WebSocket upgrade handler, replaces manual `c.req.param("ptyID")` + null check with `PtyID.zod.parse()`, which is cleaner and provides the same error semantics (throws on invalid).

## server/routes/question.ts

**Risk: LOW**

- Replaces `z.string()` validators for `requestID` with `QuestionID.zod` in two routes (reply and reject).

## server/routes/session.ts

**Risk: LOW**

- Largest route file change — replaces all `z.string()` param validators with branded zod types: `SessionID.zod`, `MessageID.zod`, `PartID.zod`, `ProviderID.zod`, `ModelID.zod`, `PermissionID.zod`.
- Affects ~20 route definitions (get, list messages, initialize, delete, share, unshare, chat, prompt, shell, revert, snapshot, permission respond, etc.).
- All changes are mechanical. No logic changes.
- No concerns — this is the largest single chunk of the branded-type migration but each change is trivial.

## server/server.ts

**Risk: MEDIUM**

- **Major structural refactor**: The server app is no longer a module-level singleton. `Server.App()` is replaced by `Server.createApp(opts)` factory function. `Server.Default` is a lazy singleton created via `createApp({})`.
- CORS whitelist is now passed via `opts.cors` to `createApp()` instead of a module-level `_corsWhitelist` variable. This is cleaner.
- `Server.url` changed from a function returning a URL (with fallback) to a mutable `let` property (with `@deprecated` JSDoc). The `listen()` method now sets `url` directly instead of relying on `server.url` from Bun.
- `_url` and `_corsWhitelist` module-level state variables removed.
- `workspaceID` query/header value now wrapped with `WorkspaceID.make()`.
- Auth `providerID` params now use `ProviderID.zod`.
- `lazy` import moved from `../util/lazy` to `@/util/lazy` (path alias).
- The catch-all `/*` route for app.opencode.ai proxy had its commented-out code cleaned up (Kilo disables it).
- **Concern**: The `as unknown as Hono` cast at the end of the old catch-all route is removed — the new `createApp` returns `Hono` directly. The `openapi()` function now uses `Default()` instead of `App()`. Callers referencing `Server.App()` (found in `run.ts`, `worker.ts`) are updated to `Server.Default()`.
- **Concern**: `Server.url` being a mutable `let` with `@deprecated` is a bit ugly, but it's a transitional step. The old fallback `new URL("http://localhost:4096")` is removed, which means accessing `Server.url` before `listen()` will throw. This is likely fine since nothing should read URL before the server starts.
- Kilo-specific changes (auth password variable names, telemetry skip logging, proxy disable, kilo routes) are all preserved correctly.

## cli/cmd/account.ts

**Risk: LOW**

- **New file** — adds `login`, `logout`, `switch`, and `orgs` CLI commands for account management using Effect-based patterns.
- Uses `AccountService` from `@/account/service` (new upstream feature).
- Uses the new `cli/effect/prompt.ts` Effect wrappers around `@clack/prompts`.
- Opens browser via `open` package for OAuth device flow.
- Commands are hidden (`describe: false`) — likely behind feature flags or for internal use.
- No security concerns — device code flow is standard OAuth.

## cli/cmd/debug/agent.ts

**Risk: LOW**

- Replaces `Identifier.ascending("message")` and `Identifier.ascending("part")` with `MessageID.ascending()` and `PartID.ascending()`.
- Mechanical branded-type migration.

## cli/cmd/export.ts

**Risk: LOW**

- Wraps `args.sessionID` with `SessionID.make()`.
- Minor cleanup: uses `sessionInfo.id` (already typed) instead of `sessionID!` for the `messages()` call.
- The `selectedSession` assignment no longer needs a cast to string.

## cli/cmd/github.ts

**Risk: MEDIUM**

- **Large refactor**: All `$\`...\``(Bun shell) calls replaced with`git()`utility function (from`@/util/git`) and `Process.run()`.
- New helper functions: `gitText()`, `gitRun()`, `gitStatus()`, `commitChanges()` — all using the `git()` utility with `cwd: Instance.worktree`.
- `Identifier.ascending("message"/"part")` replaced with `MessageID.ascending()` / `PartID.ascending()`.
- Error handling: `$.ShellError` catch replaced with `Process.RunFailedError`.
- Session type annotation updated: `session.id` is now `SessionID` instead of `string`.
- **Concern**: The `commitChanges` function constructs the commit message as a single `-m` flag for the summary, then adds a second `-m` for co-author. Git treats multiple `-m` flags as separate paragraphs in the commit body, which is equivalent to the old template literal approach. This is correct.
- **Concern**: The move from Bun shell to `Process.run`/`git()` is a significant behavioral change. Bun shell handles quoting/escaping internally; the new approach passes args as arrays which is actually safer against injection. Good improvement.
- `import { $ } from "bun"` removed — reduces Bun-specific coupling.

## cli/cmd/import.ts

**Risk: MEDIUM**

- Session import now parses incoming data through `Session.Info.parse()`, `MessageV2.Info.parse()`, and `MessageV2.Part.parse()` before inserting into DB.
- Uses destructuring to separate branded IDs from data before DB insertion (e.g., `const { id, sessionID: _, ...msgData } = msgInfo`).
- The info type changed from `Session.Info` to `SDKSession` (from the SDK types) for the `exportData.info` field.
- Comment URL updated from `/api/share/:id/data` to `/api/shares/:id/data`.
- New `shouldAttachShareAuthHeaders()` export added — utility function to check if auth headers should be sent based on URL origin matching.
- **Concern**: The parse-then-destructure pattern means imported data now goes through full schema validation. If the schema is stricter than before (e.g., requiring branded types), imports from older exports could fail. However, since `parse()` is constructive (wraps strings into branded types), this should be fine.
- **Concern**: `Session.Info.parse()` receives `{ ...exportData.info, projectID: Instance.project.id }` — this overrides the projectID from the export with the current project. This is intentional for import behavior.

## cli/cmd/models.ts

**Risk: LOW**

- `printModels` function parameter changed from `string` to `ProviderID`.
- Call sites wrap raw strings with `ProviderID.make()`.
- Mechanical branded-type migration.

## cli/cmd/pr.ts

**Risk: MEDIUM**

- All `$\`...\``(Bun shell) calls replaced with`Process.run()`, `Process.text()`, and `git()`.
- `exitCode` property renamed to `code` on `Process.run` results.
- `result.text()` method calls become `result.text` property access (on `Process.text` results).
- **Concern**: The `nothrow: true` option is used consistently, matching old `.nothrow()` behavior. Error handling appears correct.
- The `kilo import` call also uses `Process.text()` instead of Bun shell.

## cli/cmd/providers.ts

**Risk: LOW**

- **New file** — replaces the old `auth.ts` command with `providers.ts`. This is the upstream rename from `AuthCommand` to `ProvidersCommand`.
- Contains `ProvidersCommand` (parent), `ProvidersListCommand`, `ProvidersLoginCommand`, `ProvidersLogoutCommand`.
- Adds `handlePluginAuth()` for plugin-based OAuth/API auth flows.
- Adds `resolvePluginProviders()` helper (exported for testing).
- Kilo-specific changes are present: priority ordering puts `kilo` first, hint shows "recommended" for kilo, `Instance.provide` wrapping is noted with `kilocode_change` markers.
- New well-known URL auth flow (`/.well-known/opencode`) — fetches auth command from server and executes it.
- **Concern**: `Process.spawn(wellknown.auth.command, ...)` executes an arbitrary command from a remote server. This is the upstream pattern for well-known auth. The URL must be explicitly provided by the user via CLI arg, so the attack surface is limited to social engineering.

## cli/cmd/run.ts

**Risk: LOW**

- `Server.App().fetch` replaced with `Server.Default().fetch`.
- `pathToFileURL` import moved from `"bun"` to `"url"` (Node.js standard lib).
- Both changes align with the server refactor and Bun-specific coupling reduction.

## cli/cmd/session.ts

**Risk: LOW**

- `args.sessionID` wrapped with `SessionID.make()` before passing to `Session.get()` and `Session.remove()`.
- Mechanical branded-type migration.

## cli/cmd/tui/app.tsx

**Risk: LOW**

- `Flag.KILO_EXPERIMENTAL_WORKSPACES_TUI` renamed to `Flag.KILO_EXPERIMENTAL_WORKSPACES` — upstream consolidated the feature flag.
- When navigating home from a session, the `workspaceID` is now extracted from the current session and passed to the home route. This ensures workspace context is preserved during navigation.

## cli/cmd/tui/component/dialog-workspace-list.tsx

**Risk: LOW**

- Passes `workspaceID` to `client.session.create()` when opening a workspace. Previously the workspace context may not have been preserved during session creation.

## cli/cmd/tui/component/prompt/index.tsx

**Risk: LOW**

- Adds `workspaceID` prop to `Prompt` component, passed through to `sdk.client.session.create()`.
- `Identifier.ascending("message"/"part")` replaced with `MessageID.ascending()` / `PartID.ascending()`.
- Session creation now has error handling with toast notification on failure (was previously a silent `.then(x => x.data!.id)` which would throw on error).
- Good improvement on error handling.

## cli/cmd/tui/context/route.tsx

**Risk: LOW**

- Adds optional `workspaceID` field to `HomeRoute` type.
- Supports workspace context propagation in the routing system.

## cli/cmd/tui/event.ts

**Risk: LOW**

- `z.string().regex(/^ses/)` replaced with `SessionID.zod` for the `SessionSelect` event schema.
- Stricter typing via branded type.

## cli/cmd/tui/routes/home.tsx

**Risk: LOW**

- Auto-submit of `--prompt` argument is now deferred until `sync.ready && local.model.ready` via `createEffect`. Previously, `prompt.submit()` was called in `onMount` which could fire before the model store was initialized, potentially causing failures.
- Passes `workspaceID` from route to `Prompt` component.
- This is a good fix — prevents race conditions with `--prompt` auto-submit.

## cli/cmd/tui/routes/session/header.tsx

**Risk: LOW**

- `Flag.KILO_EXPERIMENTAL_WORKSPACES_TUI` renamed to `Flag.KILO_EXPERIMENTAL_WORKSPACES` in two places.
- Same flag rename as in `app.tsx`.

## cli/cmd/tui/routes/session/index.tsx

**Risk: LOW**

- Share/unshare error handlers now show the actual error message when available (`error.message`) instead of a generic string.
- Better UX for debugging share failures.

## cli/cmd/tui/util/clipboard.ts

**Risk: MEDIUM**

- All `$\`...\``(Bun shell) calls replaced with`Process.run()`and`Process.text()`.
- macOS clipboard image read now uses `Process.run()` with individual args instead of shell interpolation.
- File cleanup uses `fs.rm()` instead of `$\`rm -f ...\``.
- Windows PowerShell clipboard uses `Process.text()`.
- Linux `wl-paste` and `xclip` use `Process.run()`.
- macOS text clipboard write uses `Process.run()` for `osascript`.
- **Concern**: The macOS osascript text escaping (`escaped = text.replace(...)`) is preserved. The string is now passed as a single argument to `Process.run()` via array, which means shell escaping is no longer relevant — the escaped text is now the literal osascript command argument. The existing escaping of backslashes and quotes is still appropriate for AppleScript string literals within the `-e` argument.
- **Concern**: The empty catch block in the macOS image clipboard read is pre-existing and not introduced by this PR.

## cli/cmd/tui/worker.ts

**Risk: LOW**

- `Server.App().fetch` replaced with `Server.Default().fetch` in two places (event stream and RPC).
- Aligns with the server refactor.

## cli/cmd/uninstall.ts

**Risk: LOW**

- `$\`...\``(Bun shell) calls replaced with`Process.run()`.
- `result.exitCode` becomes `result.code`.
- The choco special case (`echo Y | choco uninstall`) is simplified to just the command args (the `echo Y` pipe workaround is removed; the `-y` flag should handle confirmation).
- Error text is now combined from stdout + stderr for the choco elevated-shell check.
- `import { $ } from "bun"` removed.

## cli/effect/prompt.ts

**Risk: LOW**

- **New file** — Effect-based wrappers around `@clack/prompts` for use in Effect pipelines.
- Provides `intro`, `outro`, `log.info`, `select` (returns `Option<Value>`), and `spinner` helpers.
- Used by the new `account.ts` commands.
- Clean, minimal implementation.

## kilo-sessions/kilo-sessions.ts

**Risk: LOW**

- String session/provider/model IDs wrapped with branded `.make()` constructors: `SessionID.make()`, `ProviderID.make()`, `ModelID.make()`.
- Affects `Session.get()`, `Session.diff()`, `MessageV2.stream()`, and `Provider.getModel()` calls.
- Mechanical branded-type migration in Kilo-specific code.

## kilo-sessions/remote-sender.ts

**Risk: MEDIUM**

- `RemotePromptInput` schema initialization is now lazy via `getRemotePromptInput()` to avoid circular dependency (`Server → RemoteRoutes → RemoteSender → SessionPrompt` at module load time). Good fix.
- `normalizeModel` now returns branded `ProviderID.make()` and `ModelID.make()` values.
- `normalizePrompt` input type changed from zod-inferred to explicit `SessionPrompt.PromptInput & { model?: string }`.
- Question/Permission reply/reject calls now wrap IDs with `QuestionID.make()`, `PermissionID.make()`.
- `Session.children()` call wraps parentId with `SessionID.make()`.
- **Concern**: The `parsed.data as SessionPrompt.PromptInput & { model?: string }` cast is needed because the lazy schema's inferred type doesn't narrow cleanly. This is a minor type-safety gap but acceptable given the lazy initialization constraint.
- The `kilocode_change` markers are properly added for the lazy init pattern.

## kilocode/commands.ts

**Risk: LOW**

- `AuthCommand` import replaced with `ProvidersCommand` from `../cli/cmd/providers`.
- `AuthCommand` in the commands array replaced with `ProvidersCommand`.
- Proper `kilocode_change` markers added.
- Aligns with upstream rename.

## kilocode/permission/drain.ts

**Risk: LOW**

- `pending` parameter type changed from `Record<string, ...>` to `Map<string, ...>`.
- `Object.entries(pending)` becomes iteration over `pending` (Map is iterable).
- `delete pending[id]` becomes `pending.delete(id)`.
- This follows an upstream change where the permission pending store switched from object to Map.
- **Concern**: Any Kilo-specific code that creates/passes this `pending` parameter must also use Map. This should be verified against the callers.

## kilocode/plan-followup.ts

**Risk: LOW**

- `Identifier.ascending("session"/"message"/"part")` replaced with `SessionID.make(Identifier.ascending("session"))`, `MessageID.ascending()`, `PartID.ascending()`.
- Function signatures updated from `string` to branded types for `sessionID` parameter.
- `Session.get()` call wraps ID with `SessionID.make()`.
- All changes are in Kilo-specific code (`src/kilocode/`), so no `kilocode_change` markers needed.

## kilocode/session-import/service.ts

**Risk: MEDIUM**

- All DB insert values now wrapped with branded type constructors: `SessionID.make()`, `ProjectID.make()`, `WorkspaceID.make()`, `MessageID.make()`, `PartID.make()`.
- Nullable fields (workspaceID, parentID, revert.partID) handle the `undefined` case with ternary operators.
- The `revert` field handling is complex — spreads original, wraps `messageID` and conditionally wraps `partID`.
- Both insert and onConflictDoUpdate paths are updated identically.
- **Concern**: The `revert` field wrapping is done inline and duplicated between insert and update. Could be extracted to a helper, but this is a style nit.
- **Concern**: This is Kilo-specific code in `src/kilocode/`, so no upstream conflict risk.

## package.json

**Risk: LOW**

- New devDependencies: `@effect/language-service` (0.79.0), `@types/semver` (^7.5.8).
- New dependencies: `effect` (catalog:), `semver` (^7.6.3).
- `@parcel/watcher-win32-x64` and `@parcel/watcher-win32-arm64` reordered alphabetically (no functional change).
- `effect` library addition supports the new account commands and Effect-based patterns.
- `semver` addition supports version comparison (likely for upgrade/compatibility checks).
- No concerns with the new dependencies.

## script/build.ts

**Risk: LOW**

- Adds Windows ARM64 (`win32`/`arm64`) as a build target with `kilocode_change` markers.
- Removes `sourcemap: "external"` from the build config — source maps will no longer be emitted. This reduces binary distribution size.
- **Concern**: Removing sourcemaps will make production debugging harder. This is likely intentional for release builds.

## script/seed-e2e.ts

**Risk: LOW**

- `Identifier.ascending("message"/"part")` replaced with `MessageID.ascending()` / `PartID.ascending()`.
- `providerID` and `modelID` wrapped with `ProviderID.make()` and `ModelID.make()`.
- Test seeding script aligned with branded-type migration.

## tsconfig.json

**Risk: LOW**

- Adds `@effect/language-service` plugin configuration for better Effect type inference in editors.
- Configures `namespaceImportPackages` for `effect` and `@effect/*`.
- Development tooling only — no runtime impact.

---

## Summary

### Key themes across all files:

1. **Branded type migration (LOW-MEDIUM risk)**: The largest change across all files. All string IDs (SessionID, MessageID, PartID, ProviderID, ModelID, ProjectID, WorkspaceID, PermissionID, QuestionID, PtyID) are migrated from plain `z.string()` / raw strings to branded types with `.zod` validators and `.make()` constructors. This is mechanical and consistent.

2. **Bun shell removal (MEDIUM risk)**: All `$\`...\``(Bun shell template literals) replaced with`Process.run()`, `Process.text()`, `git()`utilities, and`fs`APIs. This reduces Bun-specific coupling and is actually safer (array args vs shell interpolation). Affects`github.ts`, `pr.ts`, `clipboard.ts`, `uninstall.ts`.

3. **Server architecture refactor (MEDIUM risk)**: `Server.App()` singleton replaced with `Server.createApp(opts)` factory + `Server.Default` lazy singleton. CORS whitelist passed via options. `Server.url` changed to a mutable property.

4. **Effect library integration (LOW risk)**: New `effect` dependency, `cli/effect/prompt.ts` helpers, and `cli/cmd/account.ts` commands using Effect patterns.

5. **Feature flag rename (LOW risk)**: `KILO_EXPERIMENTAL_WORKSPACES_TUI` → `KILO_EXPERIMENTAL_WORKSPACES`.

6. **Auth → Providers rename (LOW risk)**: `AuthCommand` → `ProvidersCommand`, file renamed from `auth.ts` to `providers.ts`.

### Overall risk: **LOW-MEDIUM**

The changes are primarily mechanical (branded types, Bun shell removal) with one structural server refactor. All Kilo-specific markers appear to be preserved correctly. The branded type migration provides better type safety at the cost of slightly more verbose code at boundaries.
