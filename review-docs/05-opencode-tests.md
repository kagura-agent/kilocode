# Review: packages/opencode/ Tests

## Overview

The dominant theme across these 48 test files is a **codebase-wide migration to branded/opaque ID types**. Raw string literals for session IDs, message IDs, part IDs, provider IDs, model IDs, permission IDs, project IDs, and PTY IDs have been replaced with domain-specific constructors (e.g., `SessionID.make("ses_test")`, `MessageID.ascending()`, `ProviderID.make("openai")`). This is a type-safety improvement that ensures IDs cannot be accidentally mixed across domains.

Beyond the ID migration, notable additions include:

- New test suites for the **account layer** (repo + service)
- New **OAuth auto-connect** tests for MCP
- New **share-next** tests for org-aware sharing
- New **SAP AI Core** provider variant tests
- New **filesystem** edge-case tests and **Module.resolve** tests
- A **Server.App() -> Server.Default()** rename
- An **auth -> providers** CLI command rename

---

## test/account/repo.test.ts

**Risk: LOW**

- **New file** (338 lines). Comprehensive test suite for `AccountRepo` data layer covering list, active account resolution, persist/upsert, remove, `use` (switching active account/org), `persistToken`, and upsert-on-conflict behavior.
- Uses an Effect-based test harness (`testEffect`) with a `truncate` layer that clears the DB between tests. Tests exercise real `AccountRepo` and `Database` with no mocks.
- Minor note: the `truncate` layer uses raw SQL `DELETE` statements coupled to internal table names (`account_state`, `account`).

## test/account/service.test.ts

**Risk: LOW**

- **New file** (224 lines). Tests for `AccountService` covering `orgsByAccount` (HTTP-mocked multi-account org fetch), token refresh flow, org header propagation, and the device-code `poll()` flow.
- Uses a fake `HttpClient` to mock HTTP responses via Effect's HTTP client API.
- Minor caution: imports from `effect/unstable/http` which may break on Effect library upgrades.

## test/agent/agent.test.ts

**Risk: LOW**

- Wraps `custom?.model?.providerID` and `custom?.model?.modelID` in `String(...)` before `.toBe()` assertions. This adapts to branded types that don't `===` match plain strings.
- No logic or test structure changes. 4 lines changed.

## test/bun/registry.test.ts

**Risk: MEDIUM**

- **New file** (79 lines). Tests semver guard logic (`isOutdated`) against invalid version strings (`"workspace:*"`, `"latest"`, empty strings).
- **Concern:** The `isOutdated` function is **reimplemented inline** in the test file rather than imported from production code. This means the test validates a local copy, not the actual implementation. If production code diverges, these tests won't catch regressions. This violates the repo's testing guideline: "Tests MUST test actual implementation, do not duplicate logic into a test."

## test/cli/github-action.test.ts

**Risk: LOW**

- All test helper functions (`createTextPart`, `createReasoningPart`, `createToolPart`, etc.) now use branded ID constructors (`PartID.ascending()`, `SessionID.make("s")`, `MessageID.make("m")`) instead of plain string literals.
- New imports for `SessionID`, `MessageID`, `PartID`. No logic changes, assertions untouched.

## test/cli/import.test.ts

**Risk: LOW**

- Added new import for `shouldAttachShareAuthHeaders` and a new test verifying share auth headers are only attached for same-origin URLs (same origin, different origin, same origin with explicit port, invalid URL).
- No existing tests modified or removed.

## test/cli/plugin-auth-picker.test.ts

**Risk: LOW**

- Import path changed from `../../src/cli/cmd/auth` to `../../src/cli/cmd/providers`. Reflects the `auth` -> `providers` CLI command rename.
- 1 line changed.

## test/config/config.test.ts

**Risk: LOW**

- Changed `"global"` string literal to `ProjectID.global` (branded type constant).
- Added new test: `"resolves env templates in account config with account token"` -- verifies `{env:KILO_CONSOLE_TOKEN}` in account config is resolved using the account's access token.
- New test uses `mock()` to override `Account` static methods with `try/finally` cleanup. Slightly fragile but acceptable for this use case.

## test/control-plane/session-proxy-middleware.test.ts

**Risk: LOW**

- `Identifier` import replaced with domain-specific `WorkspaceID` from `../../src/control-plane/schema`.
- ID generation changed from `Identifier.descending("workspace")` to `WorkspaceID.ascending()`.
- Added `Flag.KILO_EXPERIMENTAL_WORKSPACES = true` with `@ts-expect-error` suppression to enable experimental feature flag for tests, restored in `afterEach`.

## test/control-plane/workspace-sync.test.ts

**Risk: LOW**

- Same `Identifier` -> `WorkspaceID` migration as session-proxy-middleware. `Identifier.descending("workspace")` -> `WorkspaceID.ascending()`.
- 4 lines changed. No feature flag hack needed here.

## test/fixture/effect.ts

**Risk: LOW**

- **New file** (7 lines). Small test utility that creates an Effect-based test harness. Exports `testEffect(layer)` returning an `effect(name, value)` method wrapping tests in `Effect.runPromise`.
- Used by `repo.test.ts` and `service.test.ts`.

## test/kilocode/help.test.ts

**Risk: LOW**

- `AuthCommand` import replaced with `ProvidersCommand` from `../../src/cli/cmd/providers`, and the reference in the `commands` array updated.
- Properly annotated with `kilocode_change` marker per repo conventions.
- 4 lines changed.

## test/kilocode/permission/next.always-rules.test.ts

**Risk: LOW**

- All raw string permission IDs and session IDs replaced with branded constructors: `PermissionID.make(...)` and `SessionID.make(...)`.
- Purely mechanical. No logic, assertions, or test structure changes.
- Minor note: one line still uses raw string comparison `p.id === "permission_a4"` which could break if branded types don't `===` match plain strings.

## test/kilocode/plan-exit-detection.test.ts

**Risk: LOW**

- `Identifier.ascending("message")` -> `MessageID.ascending()`, `Identifier.ascending("part")` -> `PartID.ascending()`.
- Model objects now use `ProviderID.make("openai")` and `ModelID.make("gpt-4")`.
- No tests deleted or logic changed.

## test/kilocode/plan-followup.test.ts

**Risk: LOW**

- Same branded-type migration for message/part/provider/model IDs.
- Function signature `latestUser(sessionID: string)` changed to `latestUser(sessionID: SessionID)`. `created` array typed as `SessionID[]`.
- Mock `SessionPrompt.loop` return values updated with branded constructors.

## test/kilocode/session-processor-empty-tool-calls.test.ts

**Risk: LOW**

- Dynamic imports added for `MessageID`. `Identifier.ascending("message")` -> `MessageID.ascending()`.
- Minor: `Identifier` import may now be unused.

## test/kilocode/session-processor-retry-limit.test.ts

**Risk: LOW**

- Dynamic imports for `MessageID` and `ProviderID`. `Identifier.ascending("message")` -> `MessageID.ascending()`.
- `MessageV2.fromError` call updated from `{ providerID: "openai" }` to `{ providerID: ProviderID.make("openai") }`.
- Minor: `Identifier` import may now be unused.

## test/mcp/oauth-auto-connect.test.ts

**Risk: MEDIUM**

- **New file** (199 lines). Tests OAuth auto-connect behavior: when an OAuth server returns 401 the status should be `needs_auth` not `failed`; `McpOAuthProvider.state()` generates new states and returns saved states.
- **Concern:** Heavy use of `mock.module()` for MCP SDK transport classes and client internals. These mocks are fragile and tightly coupled to SDK implementation details. A `MockUnauthorizedError` duplicates SDK class structure.
- Important bug-fix coverage for OAuth auth flow.

## test/memory/abort-leak.test.ts

**Risk: LOW**

- `SessionID.make("ses_test")` and `MessageID.make("")` replace plain string IDs in the tool execution context.
- No test logic changes.

## test/permission/next.test.ts

**Risk: LOW**

- All raw string IDs replaced with `PermissionID.make(...)` and `SessionID.make(...)`.
- Permission ID values shortened (`permission_test1` -> `per_test1`) -- cosmetic.
- No tests deleted or logic changed.

## test/project/project.test.ts

**Risk: LOW**

- `"global"` -> `ProjectID.global` in three assertions.
- `"nonexistent-project-id"` -> `ProjectID.make("nonexistent-project-id")`.
- No tests deleted.

## test/provider/provider.test.ts

**Risk: LOW**

- All `Provider.getModel("anthropic", "model")` calls changed to `Provider.getModel(ProviderID.anthropic, ModelID.make("model"))`.
- Assertions use `String(x)` wrappers to compare branded types with plain strings.
- New `chunkTimeout: 15000` option tested in provider config.
- Large diff but all mechanical. No tests deleted.

## test/provider/transform.test.ts

**Risk: LOW**

- Branded-type migration for existing model objects.
- **New tests** (~140 lines): SAP AI Core (`@jerome-benoit/sap-ai-provider-v2`) provider variant mappings covering anthropic, gemini, gpt, o-series, sonar, and mistral models.
- Minor inconsistency: new SAP AI Core tests use plain strings in `createMockModel()` rather than branded types, but the helper likely handles conversion internally.

## test/pty/pty-session.test.ts

**Risk: LOW**

- `PtyID` type import added. `log` array and `pick` function signatures updated from `string` to `PtyID`.
- `let id = ""` changed to `let id: PtyID | undefined` with `id!` non-null assertions.
- Type-only import, no runtime impact.

## test/question/question.test.ts

**Risk: LOW**

- `SessionID.make("ses_test")` and `QuestionID.make("que_unknown")` replace plain string IDs.
- No logic or assertion changes.

## test/server/project-init-git.test.ts

**Risk: LOW**

- `Server.App()` -> `Server.Default()` in two test cases. Server factory method rename.

## test/server/session-select.test.ts

**Risk: LOW**

- `Server.App()` -> `Server.Default()` in three test cases. Same rename as above.

## test/session/llm.test.ts

**Risk: LOW**

- Branded ID migration across 4 streaming test blocks. `Provider.getModel(ProviderID.make(providerID), ModelID.make(model.id))`.
- Uses both `ProviderID.make("openai")` and `ProviderID.openai` (well-known constant). Verify `ProviderID.openai` exists.
- No tests deleted.

## test/session/message-v2.test.ts

**Risk: MEDIUM**

- Branded ID migration throughout (`ModelID`, `ProviderID`, `SessionID`, `MessageID`, `PartID`).
- **Deleted test:** `"maps github-copilot 403 to reauth guidance"` test case (~29 lines) was removed. This tested that a 403 from `github-copilot` provider mapped to a specific reauth guidance message.
- **Concern:** Verify the corresponding source code change (removal of github-copilot reauth mapping) is intentional and not a regression in error handling.

## test/session/prompt.test.ts

**Risk: LOW**

- `ProviderID.make()` / `ModelID.make()` wrappers in `SessionPrompt.prompt()` calls and assertion `.toEqual()` objects.
- No tests removed.

## test/session/retry.test.ts

**Risk: LOW**

- Module-level `const providerID = ProviderID.make("test")`. Two `MessageV2.fromError()` calls updated.
- Minimal, mechanical changes.

## test/session/revert-compact.test.ts

**Risk: LOW**

- `Identifier` import replaced by `MessageID`, `PartID`. `Identifier.ascending("message")` -> `MessageID.ascending()`, `Identifier.ascending("part")` -> `PartID.ascending()`.
- All raw `"openai"`, `"gpt-4"` strings wrapped with branded constructors.
- Verify `MessageID.ascending()` / `PartID.ascending()` produce compatible ID ordering with the old `Identifier.ascending()`.

## test/session/session.test.ts

**Risk: LOW**

- Same `Identifier` -> `MessageID`/`PartID` migration. 2-line change.

## test/session/structured-output.test.ts

**Risk: LOW**

- Raw string IDs in `safeParse` test data replaced with `MessageID.ascending()`, `SessionID.descending()`, etc.
- IDs are now dynamic (timestamp-based) rather than static, but tests only check `safeParse` success, not specific ID values.

## test/share/share-next.test.ts

**Risk: MEDIUM**

- **New file** (76 lines). Tests `ShareNext.request()` for legacy (no org) vs org-aware (authenticated) sharing, plus error case when org account has no token.
- **Concern:** Uses monkey-patching mocks (`Account.active = mock(...)`) with `try/finally` cleanup, which deviates from the project's "avoid mocks" testing convention. Acceptable given the need to avoid hitting real services.

## test/storage/json-migration.test.ts

**Risk: LOW**

- All ID assertions updated with branded constructors: `ProjectID.make(...)`, `SessionID.make(...)`, `MessageID.make(...)`, `PartID.make(...)`.
- High volume (~15+ assertion sites) but purely mechanical.
- Verify branded types compare correctly with `toBe()` (they should if backed by `string & Brand` pattern).

## test/tool/apply_patch.test.ts

**Risk: LOW**

- `SessionID.make("ses_test")` and `MessageID.make("")` replace plain string IDs in test context. Mechanical.

## test/tool/bash.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration as all tool tests.

## test/tool/edit.test.ts

**Risk: LOW**

- Same migration. `sessionID` -> `SessionID.make("ses_test-edit-session")`.

## test/tool/external-directory.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/tool/grep.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/tool/question.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/tool/read.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/tool/skill.test.ts

**Risk: MEDIUM**

- Same `SessionID`/`MessageID` migration as other tool tests.
- **Assertion change:** `tool.description` expectation changed from checking for a `<location>file://...</location>` XML tag to checking for `**tool-skill**: Skill for tool tests.` markdown format. This reflects a change in how skill descriptions are rendered -- from internal file URIs to human-readable format.
- **Concern:** Verify the corresponding source change in `SkillTool` was made. If the source description format wasn't updated, this test would fail.

## test/tool/webfetch.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/tool/write.test.ts

**Risk: LOW**

- Same `SessionID`/`MessageID` migration.

## test/util/filesystem.test.ts

**Risk: LOW**

- 5 new test cases added to `Filesystem.resolve` describe block: symlinked directory resolution, missing path fallback, symlink cycle detection (ELOOP), permission-denied propagation (EACCES), and ENOTDIR rethrow.
- Tests 4 and 5 are platform-conditional (skip on Windows; test 4 also skips when running as root).
- Purely additive. No existing tests modified.

## test/util/module.test.ts

**Risk: LOW**

- **New file** (59 lines). Tests for `Module.resolve()` covering package subpath resolution, ancestor `node_modules` resolution, directory-relative resolution, and graceful failure for missing packages.
- Uses `Filesystem.write` to set up synthetic `node_modules` structures.

---

## Summary

| Risk       | Count | Files                                                                                                                                    |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | 0     | --                                                                                                                                       |
| **MEDIUM** | 5     | `bun/registry.test.ts`, `mcp/oauth-auto-connect.test.ts`, `session/message-v2.test.ts`, `share/share-next.test.ts`, `tool/skill.test.ts` |
| **LOW**    | 43    | All remaining files                                                                                                                      |

### Key Items Requiring Attention

1. **`bun/registry.test.ts`** -- Tests a locally-duplicated function rather than the real implementation. Violates testing guidelines.
2. **`session/message-v2.test.ts`** -- Deleted `github-copilot 403 reauth` test. Verify the corresponding source change is intentional.
3. **`mcp/oauth-auto-connect.test.ts`** -- Heavy SDK mocking that could become stale if MCP SDK internals change.
4. **`share/share-next.test.ts`** -- Uses monkey-patching mock pattern against project conventions, though acceptable for this use case.
5. **`tool/skill.test.ts`** -- Skill description format changed from XML to markdown. Verify source code was updated accordingly.
