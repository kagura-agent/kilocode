# Review: packages/opencode/ Core Source

> OpenCode v1.2.25 upstream merge into Kilo
> 76 files reviewed across `packages/opencode/src/`

## Cross-Cutting Themes

1. **Branded types migration** -- `ProviderID`, `ModelID`, `SessionID`, `MessageID`, `PartID`, `ProjectID`, `WorkspaceID`, `PermissionID`, `PtyID`, `QuestionID`, `AccountID`, `OrgID` all gain compile-time type safety via Effect `Schema.brand()` + Zod adapters. Pervasive but mechanical.
2. **Bun `$` removal** -- Systematic migration from `$ from "bun"` tagged template shell to `Process.run()`/`Process.text()`/`git()` utilities. Improves Node.js portability.
3. **Account module replaces Control module** -- New `Account` system with Effect-based service, device auth flow, token refresh, remote config. Old `Control` namespace deleted.
4. **SSE chunk timeout** -- New `wrapSSE` in provider adds per-chunk read timeouts on streaming responses.
5. **Skills in system prompts** -- Agents now receive skill information in their context, filtered by permissions.
6. **`Record<string, T>` to `Map<BrandedType, T>`** -- Internal state stores in permission, question, and pty modules migrated to proper `Map` instances.

---

## Risk Summary

| Risk       | Count | Files                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | 3     | `config/config.ts`, `provider/provider.ts`, `share/share-next.ts`                                                                                                                                                                                                                                                                                                                                                                              |
| **MEDIUM** | 16    | `account/service.ts`, `acp/agent.ts`, `bun/registry.ts`, `control-plane/workspace-router-middleware.ts`, `index.ts`, `installation/index.ts`, `lsp/server.ts`, `permission/index.ts`, `permission/next.ts`, `plugin/index.ts`, `project/project.ts`, `provider/transform.ts`, `session/index.ts`, `session/prompt.ts`, `session/system.ts`, `skill/skill.ts`, `storage/db.ts`, `storage/storage.ts`, `util/filesystem.ts`, `worktree/index.ts` |
| **LOW**    | 57    | All remaining files                                                                                                                                                                                                                                                                                                                                                                                                                            |

---

## account/account.sql.ts

**Risk: LOW**

- New file. Drizzle SQLite schema for `account`, `account_state`, and legacy `control_account` table.
- Uses branded types (`AccountID`, `OrgID`, `AccessToken`, `RefreshToken`) via `$type<>()`.
- `AccountTable` introduces proper `id`-based primary key replacing the old email+url composite key.
- Legacy `ControlAccountTable` preserved for migration compatibility.
- Verify migration exists to create these tables and migrate data from old `control_account`.

## account/index.ts

**Risk: LOW**

- New file. Thin public API facade for `AccountService` Effect service.
- Exposes `Account.active()`, `Account.config()`, `Account.token()`.
- `runSync` for `active()` is fine since it reads from local SQLite.

## account/repo.ts

**Risk: LOW**

- New file. Data access layer for account management using Drizzle ORM + Effect.
- Standard repo pattern with CRUD operations. Singleton `ACCOUNT_STATE_ID = 1` for active account state.

## account/schema.ts

**Risk: LOW**

- New file. Branded types and Effect Schema classes for the account module.
- `AccountID`, `OrgID`, `AccessToken`, `RefreshToken`, `DeviceCode`, `UserCode` plus domain classes for OAuth device flow.

## account/service.ts

**Risk: MEDIUM**

- New file. Full account service (359 lines) implementing OAuth device flow, token refresh, org fetching, remote config.
- **Concern**: `clientId = "opencode-cli"` is hardcoded -- Kilo may want `"kilo-cli"` or configurable.
- **Concern**: Token expiry comparison (`row.token_expiry > now`) -- verify stored unit matches `Clock.currentTimeMillis` (milliseconds).
- `resolveToken` doesn't have retry logic for transient HTTP failures during refresh.

## acp/agent.ts

**Risk: MEDIUM**

- Branded type migration throughout: `providerID: string` and `modelID: string` replaced with `ProviderID` / `ModelID`.
- Import: `pathToFileURL` from `"bun"` changed to `"url"` (Node.js stdlib) -- portability improvement.
- Added null checks: `if (!msg.providerID || !msg.modelID) return` before `ProviderID.make()` / `ModelID.make()`.
- Large diff touching many functions. Risk is primarily volume.

## acp/types.ts

**Risk: LOW**

- Type-level change: `ACPSessionState.model` and `ACPConfig.defaultModel` now use `ProviderID` / `ModelID` instead of `string`.

## agent/agent.ts

**Risk: LOW**

- Agent config model field now uses `ModelID.zod` and `ProviderID.zod` instead of `z.string()`.
- Config files with model/provider IDs validated through branded type validators -- transparent since still strings underneath.

## bun/registry.ts

**Risk: MEDIUM**

- Switched from Bun's built-in `semver` to the `semver` npm package. `Process.spawn()` replaced with `Process.run()`.
- `semver.order()` changed to `semver.lt()` (different API).
- **Kilo-specific addition** (`kilocode_change`): Guards against invalid semver strings before comparison, returning `false` (not outdated) instead of crashing.
- The `semver` npm package is stricter than Bun's built-in; the Kilo guard handles this well.

## command/index.ts

**Risk: LOW**

- `sessionID` uses `SessionID.zod` instead of `Identifier.schema("session")`, `messageID` uses `MessageID.zod`.
- Straightforward type refinement.

## config/config.ts

**Risk: HIGH**

- Replaces `Control.token()` with the new `Account` module for remote config and token management.
- New block fetches config and token from active account: calls `Account.active()`, `Account.config()`, `Account.token()`.
- Sets `KILO_CONSOLE_TOKEN` env var and `Env.set()`.
- Merges remote config via `mergeConfigConcatArrays()`.
- New config field: `chunkTimeout` added to provider options.
- **Concern**: Environment mutation (`process.env["KILO_CONSOLE_TOKEN"]`) during config loading is a side effect that could be surprising.
- **Concern**: Failures fetching remote config are logged at `debug` level -- silent failures could hide auth issues.
- **Concern**: Config loading order is correct (account config before managed config) but the interaction is complex.

## control-plane/schema.ts

**Risk: LOW**

- New file. `WorkspaceID` branded type with `make()`, `ascending()`, `.zod` statics.

## control-plane/types.ts

**Risk: LOW**

- Branded type migration: `WorkspaceInfo.id` uses `WorkspaceID.zod`, `projectID` uses `ProjectID.zod`.

## control-plane/workspace-context.ts

**Risk: LOW**

- `workspaceID` field type changed from `string` to `WorkspaceID`. Type-level only.

## control-plane/workspace-router-middleware.ts

**Risk: MEDIUM**

- Workspace routing gate changed from `Installation.isLocal()` to `Flag.KILO_EXPERIMENTAL_WORKSPACES`.
- This changes when workspaces are available -- now behind explicit feature flag instead of installation type.
- Marked with `kilocode_change` comment.
- Verify `Flag.KILO_EXPERIMENTAL_WORKSPACES` is properly defined.

## control-plane/workspace-server/server.ts

**Risk: LOW**

- Raw workspace ID string converted to `WorkspaceID` via `WorkspaceID.make()` at the boundary.
- Variable renamed from `workspaceID` to `rawWorkspaceID` for clarity.

## control-plane/workspace.sql.ts

**Risk: LOW**

- `WorkspaceTable.id` typed as `$type<WorkspaceID>()`, `project_id` as `$type<ProjectID>()`.
- Import paths changed from `@/` to relative `../`.

## control-plane/workspace.ts

**Risk: LOW**

- Mechanical replacement of `Identifier.schema("workspace")` with `WorkspaceID.zod` and `Identifier.ascending("workspace")` with `WorkspaceID.ascending()`.

## control/control.sql.ts

**Risk: LOW**

- Deleted file. Old `ControlAccountTable` definition moved to `account/account.sql.ts` as legacy.
- Verify no other files still import from `@/control/control.sql`.

## control/index.ts

**Risk: LOW**

- Entire file deleted. `Control` namespace replaced by new `AccountService`.
- Consumers of `Control.account()` / `Control.token()` must use the new account system.

## effect/runtime.ts

**Risk: LOW**

- New 4-line file. Creates Effect `ManagedRuntime` with `AccountService.defaultLayer`.

## file/index.ts

**Risk: LOW**

- Migrated from Bun `$` to `git()` utility wrapper.
- Replaces inline platform-specific ignore sets with `Protected.names()`.
- Git diff commands now use `git(["diff", "--", file])` style.
- Adding `--` before file paths is good security practice.

## file/protected.ts

**Risk: LOW**

- New file. OS-specific directories excluded from scanning/watching.
- macOS TCC-protected dirs, Windows protected dirs, macOS system dirs.
- Good defensive measure preventing TCC permission prompts.

## file/ripgrep.ts

**Risk: LOW**

- Migrates ripgrep execution from Bun `$` to `Process.text()`.
- Adds `arm64-win32` platform support.
- Fixes glob quoting: removes shell quotes that were incorrect when args passed as array.
- Glob quoting fix is a correctness improvement.

## file/watcher.ts

**Risk: LOW**

- Migrates from Bun `$` to `git()` utility.
- Adds `Protected.paths()` to watcher ignore list.

## flag/flag.ts

**Risk: LOW**

- Renames `KILO_EXPERIMENTAL_WORKSPACES_TUI` to `KILO_EXPERIMENTAL_WORKSPACES` (broader scope).
- Adds `KILO_DISABLE_CHANNEL_DB` flag.
- **Concern**: Anyone setting env var `KILO_EXPERIMENTAL_WORKSPACES_TUI` must update.

## index.ts

**Risk: MEDIUM**

- **Breaking CLI change**: Single `AuthCommand` replaced with four commands: `LoginCommand`, `LogoutCommand`, `SwitchCommand`, `OrgsCommand`. Also adds `ProvidersCommand`.
- Users with `kilo auth` in scripts/aliases/docs need to update to `kilo login`/`kilo logout`/`kilo switch`/`kilo orgs`.

## installation/index.ts

**Risk: MEDIUM**

- Complete migration from Bun `$` to `Process.run()`/`Process.text()`.
- Adds `yarn` to detected package managers.
- `upgradeCurl()` reimplemented: fetches install script via `fetch()` and pipes to bash subprocess.
- `choco upgrade` now uses `-y` flag.
- **POTENTIAL BUG**: The npm/pnpm/bun upgrade commands appear to have dropped the `@` scope prefix: `@kilocode/cli@${target}` may have become `kilocode/cli@${target}`. The `@` in `@kilocode/cli` is the npm scope prefix -- dropping it installs from GitHub shorthand instead. **Needs verification.**

## lsp/index.ts

**Risk: LOW**

- Trivial formatting change: `windowsHide: true` moved up one line.
- `kilocode_change` comment removed -- upstream now includes `windowsHide: true` natively.

## lsp/server.ts

**Risk: MEDIUM**

- Large file: migrates all Bun `$` shell calls to `Process.run()`/`Process.text()`.
- `chmod +x` calls replaced with `fs.chmod(bin, 0o755)`.
- `Bun.resolve()` replaced with `Module.resolve()` from `@opencode-ai/util/module`.
- JDTLS/Kotlin downloads switch from `curl` subprocess to `fetch()` + `Filesystem.writeStream()`.
- JDTLS root resolution rewritten with monorepo-aware multi-pass algorithm.
- **Concern**: JDTLS monorepo root detection needs testing with actual Gradle projects.
- **Concern**: `Module.resolve()` replacing `Bun.resolve()` may have different resolution semantics.

## mcp/index.ts

**Risk: LOW**

- Broadens MCP OAuth error handling: now catches generic `Error`s containing "OAuth" in message (not just `UnauthorizedError`).
- Guard `authProvider &&` limits false positives.

## mcp/oauth-provider.ts

**Risk: LOW**

- `state()` method no longer throws when no OAuth state found. Instead generates new random state (32 bytes hex) and saves it.
- Bug fix: previous code threw on first connect because `startAuth()` hadn't pre-saved state.

## permission/index.ts

**Risk: MEDIUM**

- Branded types: `id`, `sessionID`, `messageID` now use `PermissionID`, `SessionID`, `MessageID`.
- `Record<string, ...>` maps replaced with `Map<BrandedType, ...>`.
- Empty session map cleanup added in `respond()`.
- "Always" auto-respond loop refactored to avoid mutating collection during iteration (correctness fix).
- **Concern**: `Map` won't serialize with `JSON.stringify()` -- verify nothing serializes the state.

## permission/next.ts

**Risk: MEDIUM**

- Same branded type migration: `PermissionID`, `SessionID`, `MessageID`, `ProjectID`.
- `pending` changed from `Record<string, PendingEntry>` to `Map<PermissionID, PendingEntry>`.
- All object bracket access replaced with Map methods.
- `kilocode_change` markers preserved correctly.

## permission/schema.ts

**Risk: LOW**

- New file. `PermissionID` branded type with `make()`, `ascending()`, `.zod`.

## plugin/codex.ts

**Risk: LOW**

- Codex plugin uses `ModelID.make("gpt-5.3-codex")` and `ProviderID.openai` instead of string literals.

## plugin/index.ts

**Risk: MEDIUM**

- SDK client creation removes `@ts-ignore` and old inline `fetch` adapter. Uses `Server.Default().fetch(...)`.
- Auth headers added when `KILO_SERVER_PASSWORD` is set (Basic auth).
- `Server.url` is now a property (not a function) -- API change.
- **Concern**: `Server.App()` renamed to `Server.Default()` -- must be matched by server module.

## project/project.sql.ts

**Risk: LOW**

- `id` column uses `.$type<ProjectID>()` for branded type safety.
- Import path changed from `@/` to relative `../`.

## project/project.ts

**Risk: MEDIUM**

- Branded `ProjectID` type throughout. `"global"` literal replaced with `ProjectID.global`.
- **Kilo-specific**: Cached ID file renamed from `opencode` to `kilo` in `.git` dir.
- Git worktree resolution moved earlier -- reads cached ID from parent `.git` dir when in a worktree (bug fix).
- **Concern**: Rename from `opencode` to `kilo` means existing caches regenerated on upgrade (low impact but notable).

## project/schema.ts

**Risk: LOW**

- New file. `ProjectID` branded type with `.make()`, `.global` constant, `.zod`.

## project/vcs.ts

**Risk: LOW**

- Replaces Bun `$` with `git()` utility for `git rev-parse --abbrev-ref HEAD`.
- Explicit `exitCode` check and empty-string guard added.

## provider/auth.ts

**Risk: LOW**

- `ProviderID.zod` replaces `z.string()` in authorize/callback/api input schemas and error schemas.

## provider/error.ts

**Risk: LOW**

- `message()` and `parseAPICallError()` accept `ProviderID` instead of `string`.
- Removed redundant `error()` call from `message()` that was duplicated logic.

## provider/provider.ts

**Risk: HIGH**

- Branded types throughout: `ModelID` and `ProviderID` in all schemas, function signatures, and type definitions.
- **New `wrapSSE` function**: Wraps SSE response streams with per-chunk read timeouts (`DEFAULT_CHUNK_TIMEOUT = 120_000`ms). Aborts if no data within timeout. Configurable via `chunkTimeout` provider option.
- **`varsLoaders` refactor**: Replaces ad-hoc `loadBaseURL`/`googleVertexVars` with per-provider variable substitution system. Cleaner architecture but meaningful logic change.
- Azure `resourceName` now read from `provider.options` (fallback to env var).
- `useLanguageModel` helper extracted. Azure/azure-cognitive-services now fall through to `sdk.languageModel()`.
- `shouldUseCopilotResponsesApi` simplified.
- Google Vertex: `GOOGLE_VERTEX_LOCATION` added to env var priority.
- Cloudflare: `baseURL` removed from options, uses `vars` loader.
- `sort` generalized: `sort<T extends { id: string }>(models: T[])`.
- Well-known provider constants replace string literals.
- **Concern**: SSE chunk timeout is new behavior for all streaming providers -- false aborts possible on slow providers.
- **Concern**: `varsLoaders` refactor touches base URL resolution for many providers -- needs integration testing.

## provider/schema.ts

**Risk: LOW**

- New file. `ProviderID` and `ModelID` branded types. `ProviderID` includes well-known constants (kilo, opencode, anthropic, openai, google, etc.). `kilo` constant marked `kilocode_change`.

## provider/transform.ts

**Risk: MEDIUM**

- **Breaking**: Removed `@mymediset/sap-ai-provider` case.
- Remaining SAP provider (`@jerome-benoit/sap-ai-provider-v2`) gets richer reasoning effort handling: Anthropic adaptive effort, Gemini `thinkingConfig`, GPT/o-series `reasoningEffort`.
- **Concern**: Removing `@mymediset/sap-ai-provider` breaks users of that package.

## pty/index.ts

**Risk: LOW**

- Branded `PtyID` type replaces `Identifier.schema("pty")`.
- Bug fix in `remove()`: `Bus.publish(Event.Deleted, { id: session.info.id })` instead of `{ id }` -- uses actual stored ID.

## pty/schema.ts

**Risk: LOW**

- New file. `PtyID` branded type. Standard pattern.

## question/index.ts

**Risk: LOW**

- Branded types: `QuestionID`, `SessionID`, `MessageID` replace string schemas.
- `pending` changed from `Record<string, ...>` to `Map<QuestionID, PendingEntry>`.

## question/schema.ts

**Risk: LOW**

- New file. `QuestionID` branded type.

## session/compaction.ts

**Risk: LOW**

- Branded types: `SessionID`, `MessageID`, `PartID`, `ProviderID`, `ModelID` replace string schemas.
- Mechanical type migration only.

## session/index.ts

**Risk: MEDIUM**

- Branded types pervasive: `SessionID`, `MessageID`, `PartID`, `ProjectID`, `WorkspaceID`, `ModelID`, `ProviderID`.
- **Behavioral change**: `createNext` now accepts explicit `workspaceID` parameter instead of reading from `WorkspaceContext.workspaceID` directly. Callers must provide it.
- Fork now inherits parent's workspaceID -- design improvement for testability.
- **Concern**: If any caller forgets to pass `workspaceID`, it will be undefined.

## session/message-v2.ts

**Risk: LOW**

- Branded types throughout: `SessionID`, `MessageID`, `PartID`, `ProviderID`, `ModelID`.
- `fromError` return type explicitly annotated as `NonNullable<Assistant["error"]>`.
- No logic changes.

## session/message.ts

**Risk: LOW**

- Branded types: `SessionID`, `ModelID`, `ProviderID` in legacy `Message` namespace schemas.
- Minimal change -- 3 fields updated.

## session/processor.ts

**Risk: LOW**

- `PartID.ascending()` replaces `Identifier.ascending("part")` throughout (10+ occurrences).
- Mechanical type migration only.

## session/prompt.ts

**Risk: MEDIUM**

- Branded types pervasive in `PromptInput`, `ShellInput`, `CommandInput`, `LoopInput`.
- `pathToFileURL`/`fileURLToPath` import source changed from `"bun"` to `"url"` (Node.js stdlib).
- **New**: `SystemPrompt.skills(agent)` call added to system prompt construction -- skills injected between environment and instruction prompts.
- Defensive metadata access: `"metadata" in part.state ? part.state.metadata : undefined`.
- **Concern**: Skills injection is a feature addition, not just a refactor.

## session/revert.ts

**Risk: LOW**

- Branded types: `SessionID`, `MessageID`, `PartID` replace `Identifier.schema()` in input schemas.

## session/schema.ts

**Risk: LOW**

- New file. Foundational branded types for `SessionID`, `MessageID`, `PartID` with ascending/descending ID generators and Zod schemas.

## session/session.sql.ts

**Risk: MEDIUM**

- All ID columns in `SessionTable`, `MessageTable`, `PartTable`, `TodoTable` typed with branded types via `$type<>()`.
- Import paths changed from `@/` to relative `../`.
- `revert` JSON column now expects `MessageID`/`PartID`.
- **Concern**: Code inserting plain strings into these columns will get type errors.

## session/status.ts

**Risk: LOW**

- `sessionID` fields in bus events use `SessionID.zod`.
- `get()` and `set()` take `SessionID` instead of `string`.

## session/summary.ts

**Risk: LOW**

- Input schemas use `SessionID.zod` / `MessageID.zod`.
- No logic changes.

## session/system.ts

**Risk: MEDIUM**

- Added `Workspace root folder: ${Instance.worktree}` to environment info in system prompts.
- **New `skills()` function**: Checks agent permissions, retrieves available skills, formats for system prompt.
- **Concern**: Agents now receive skill information -- affects token usage and model behavior.

## session/todo.ts

**Risk: LOW**

- `sessionID` in event and function signatures changed from `string` to `SessionID`.

## share/share-next.ts

**Risk: HIGH**

- **Major feature**: Account-based authenticated sharing via new `request()` function. Bearer token auth routes to console API (`/api/shares/`) vs legacy API (`/api/share/`).
- Proper error handling added: `create()` / `remove()` check `response.ok`.
- `ApiEndpoints` abstraction for URL management between legacy and console APIs.
- **Concern**: Security -- auth tokens passed via `Authorization` header, org IDs via `x-org-id`. `Account.token()` reliability is critical.
- **Concern**: If `Account.active()` returns active org but `Account.token()` returns null, it throws -- new failure mode.
- **Concern**: `secret` field still passed in console API path -- verify console API accepts it.

## share/share.sql.ts

**Risk: LOW**

- Single import path change: `@/storage/schema.sql` to `../storage/schema.sql`.

## shell/shell.ts

**Risk: LOW**

- Cosmetic formatting change only. No functional change.

## skill/skill.ts

**Risk: MEDIUM**

- **New `available()` function**: Filters skills based on agent permissions via `PermissionNext.evaluate()`.
- **New `fmt()` function**: Formats skill lists for prompt inclusion (verbose XML or concise markdown).
- Kilo-specific guard for `BUILTIN_LOCATION` sentinel with `kilocode_change` markers.
- **Concern**: `pathToFileURL()` could expose local filesystem paths in skill listings.

## storage/db.ts

**Risk: MEDIUM**

- `Client` type changed from `SQLiteBunDatabase<Schema>` to `SQLiteBunDatabase` (unparameterized).
- `drizzle()` call no longer passes `schema` parameter.
- `TxOrDb` type loosened with `any` generics.
- **Concern**: Removing schema from `drizzle()` means relational queries (`db.query.*`) will no longer work. If any code uses this pattern, it breaks at runtime.
- **Concern**: `any` types reduce compile-time guarantees.

## storage/schema.ts

**Risk: LOW**

- Added exports for `AccountTable` and `AccountStateTable` from new account module.
- Removed `ControlAccountTable` export from `control/control.sql` (now from `account/account.sql`).

## storage/storage.ts

**Risk: MEDIUM**

- Replaced Bun `$` for `git rev-list` with `git()` utility.
- **Concern**: Verify `git()` wrapper's error handling matches previous `.nothrow()` behavior.

## util/archive.ts

**Risk: LOW**

- Replaced Bun `$` with `Process.run()` for `powershell` (Windows) and `unzip` (Unix).
- Added early `return` after Windows branch.

## util/effect-http-client.ts

**Risk: LOW**

- New file. `withTransientReadRetry` utility wrapping Effect `HttpClient` with retry logic (2 retries, jittered exponential backoff from 200ms).

## util/filesystem.ts

**Risk: MEDIUM**

- `Filesystem.resolve()` now calls `realpathSync()` to resolve symlinks before normalizing. Falls back on ENOENT.
- **Concern**: Behavioral change affects any code using resolved paths as cache keys. Symlinked directories resolve to physical location, which changes path comparisons, storage keys, and worktree detection logic.

## util/process.ts

**Risk: LOW**

- Added `TextResult` interface extending `Result` with `text` property.
- `run()` catches promise rejections when `nothrow` is set, returning synthetic failure result.
- New `text()` and `lines()` convenience wrappers.
- Subtly changes error contract: spawn failures with `nothrow` return `code: 1` instead of throwing.

## util/schema.ts

**Risk: LOW**

- New file. `withStatics` utility for attaching static methods to Effect schema objects via `Object.assign`. Foundation for all branded types.

## worktree/index.ts

**Risk: MEDIUM**

- Massive migration (~20 call sites) from Bun `$` to `git()` utility and `Process.run()`.
- Branded types: `projectID` parameter changed from `string` to `ProjectID`.
- `createFromInfo()` return closure now returns the promise instead of fire-and-forget.
- **Concern**: `.exitCode` vs `.code` property names differ between `git()` and `Process.run()` results -- verify consistency.
- High surface area for subtle bugs, though the pattern is consistent.

---

## Action Items

1. **Verify `installation/index.ts` npm scope prefix**: The upgrade commands may have dropped the `@` from `@kilocode/cli` -- this would be a bug causing installs from GitHub shorthand instead of npm registry.
2. **Verify `account/service.ts` client ID**: Hardcoded `"opencode-cli"` should likely be `"kilo-cli"` for Kilo branding.
3. **Test SSE chunk timeout**: `provider/provider.ts` adds 120s per-chunk timeout for all streaming providers. Verify no false aborts on slow providers (e.g., reasoning models with long thinking phases).
4. **Test `storage/db.ts` schema removal**: Verify no relational queries (`db.query.*`) exist in the codebase that would break without the schema parameter.
5. **Test `util/filesystem.ts` symlink resolution**: The `realpathSync()` addition changes path identity semantics -- verify worktree and caching scenarios.
6. **Test `share/share-next.ts` auth flow**: New console API path with bearer tokens needs end-to-end testing.
7. **Document CLI breaking change**: `kilo auth` replaced by `kilo login`/`kilo logout`/`kilo switch`/`kilo orgs`.
8. **Verify `KILO_EXPERIMENTAL_WORKSPACES` flag**: All references to old `KILO_EXPERIMENTAL_WORKSPACES_TUI` must be updated.
9. **Verify `project/project.ts` cache rename**: Cache file renamed from `opencode` to `kilo` in `.git` dir -- existing caches will be regenerated on upgrade.
