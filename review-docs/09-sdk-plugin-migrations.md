# Review: SDK, Plugin, Util, Script, Kilo-Docs, and Migrations

**PR:** OpenCode v1.2.25 upstream merge into Kilo
**Reviewer:** Kilo Agent
**Date:** 2026-04-08

---

## 1. `packages/sdk/js/src/v2/gen/sdk.gen.ts`

**What changed:** Added `workspaceID` as an optional body parameter to the `Session2.create()` method. The new field is wired into both the method signature and the parameter mapping array.

**Why:** Upstream added workspace association when creating sessions, supporting the new workspace/session relationship visible in the migration snapshots.

**Concerns:** This is auto-generated code (via `./script/generate.ts`). The change is additive and backward-compatible -- `workspaceID` is optional. No manual edits needed.

**Risk:** LOW

---

## 2. `packages/sdk/js/src/v2/gen/types.gen.ts`

**What changed:**

1. Added `chunkTimeout?: number` to `ProviderConfig` -- a new per-provider setting for SSE chunk timeout.
2. Added `workspaceID?: string` to `SessionCreateData.body` to match the SDK method change above.
3. Removed JSDoc `/** Session ID */` / `/** Message ID */` / `/** Part ID */` comments from many path parameter types (`SessionTodoData`, `SessionInitData`, `SessionSummarizeData`, `SessionMessagesData`, `SessionPromptData`, `SessionDeleteMessageData`, `SessionMessageData`, `PartDeleteData`, `PartUpdateData`, `SessionPromptAsyncData`, `SessionCommandData`, `SessionShellData`).
4. The index signature on `ProviderConfig` changed from `unknown | string | boolean | number | false | undefined` to `unknown | string | boolean | number | false | number | undefined` (duplicate `number`).

**Concerns:**

- The duplicate `number` in the index signature (`number | false | number`) is harmless (TypeScript deduplicates union members) but is sloppy codegen. Not a blocking issue since this is auto-generated.
- Comment removal is cosmetic cleanup from upstream codegen -- no functional impact.
- All changes are additive/optional. Backward-compatible.

**Risk:** LOW

---

## 3. `packages/plugin/src/example.ts`

**What changed:** Import paths changed from `"./index"` to `"./index.js"` and `"./tool"` to `"./tool.js"`, adding explicit `.js` extensions.

**Why:** Required by the `nodenext` module resolution now configured in `tsconfig.json` (see next file). Node.js ESM requires explicit file extensions in imports.

**Concerns:** None. This is a necessary companion change to the tsconfig update.

**Risk:** LOW

---

## 4. `packages/plugin/tsconfig.json`

**What changed:**

- `module` changed from `"preserve"` to `"nodenext"`
- `moduleResolution` changed from `"bundler"` to `"nodenext"`
- Added `// kilocode_change` comment on the `types` line

**Why:** The plugin package is switching from bundler-style resolution to Node.js native ESM resolution. This is a meaningful change -- `nodenext` enforces stricter import resolution rules (explicit extensions, `package.json` `exports` fields, etc.).

**Concerns:**

- The `// kilocode_change` marker on the `types` line is odd -- the `types` field itself didn't change; only `module` and `moduleResolution` changed. This marker may cause confusion during future upstream merges since it marks an unchanged line. It appears this was added to prevent the Kilo-specific `"types": ["node"]` from being clobbered during merge, but the original already had it.
- The module/moduleResolution switch from `preserve`/`bundler` to `nodenext` is an upstream change. Any downstream consumers of this plugin package that relied on bundler-style bare imports will need to add `.js` extensions.

**Risk:** LOW -- the example.ts was already updated to match.

---

## 5. `packages/util/src/module.ts`

**What changed:** New file. Adds a `Module` namespace with a `resolve()` function that uses `createRequire` to resolve a module ID relative to a given directory.

**Why:** Provides a utility for resolving modules from arbitrary directories, useful for finding plugins or tools installed in project-local `node_modules`.

**Concerns:**

- **Empty catch block.** The function has a bare `catch {}` with no error handling or logging. This violates the project style guide ("No empty catch blocks"). The intent is clearly to return `undefined` on resolution failure, but per the codebase conventions, it should at minimum log the error. Consider:
  ```ts
  } catch (err) {
    log.warn("module resolve failed", { id, dir, err })
  }
  ```
  Or restructure to avoid try/catch entirely if the consumer handles `undefined`.
- The function signature and behavior are reasonable -- this is a standard Node.js pattern.

**Risk:** LOW (functional), but the empty catch is a **style violation** that should be flagged.

---

## 6. `packages/script/package.json`

**What changed:**

- Added `semver` (`^7.6.3`) as a runtime dependency (previously `dependencies` was empty `{}`)
- Added `@types/semver` (`^7.5.8`) as a dev dependency
- Minor structural reorder (dependencies block moved above devDependencies)

**Why:** The script package switches from Bun's built-in `semver` to the `semver` npm package (see next file). This makes the script more portable across runtimes.

**Concerns:** None. Standard dependency addition.

**Risk:** LOW

---

## 7. `packages/script/src/index.ts`

**What changed:** Import changed from `import { $, semver } from "bun"` to separate imports: `import { $ } from "bun"` and `import semver from "semver"`.

**Why:** Decouples semver logic from the Bun runtime. The `semver` npm package is the canonical implementation and is more portable. Still uses Bun's `$` shell for command execution.

**Concerns:** The `semver` npm package API is slightly different from Bun's built-in. Should verify that all usage sites (e.g., `semver.satisfies`, `semver.compare`, etc.) are compatible. However, Bun's `semver` module mirrors the npm API, so this should be a drop-in replacement.

**Risk:** LOW

---

## 8. `packages/kilo-docs/source-links.md`

**What changed:** Three source-link comment annotations updated: references to `packages/opencode/src/cli/cmd/auth.ts` changed to `packages/opencode/src/cli/cmd/providers.ts`. Affected URLs:

- `https://opencode.ai/auth`
- `https://opencode.ai/docs/providers/#cloudflare-ai-gateway`
- `https://vercel.link/ai-gateway-token`

**Why:** Upstream renamed/moved the `auth.ts` CLI command to `providers.ts`. The source-links file tracks which source files reference which URLs. This is a required update to keep CI's `extract-source-links.ts` check passing.

**Concerns:** None. Purely a tracking file update.

**Risk:** LOW

---

## 9. `packages/opencode/migration/20260228203230_blue_harpoon/migration.sql`

**What changed:** New migration. Creates two tables:

1. **`account`** -- Stores authenticated user accounts with fields: `id` (PK), `email`, `url`, `access_token`, `refresh_token`, `token_expiry`, `selected_org_id`, `time_created`, `time_updated`.
2. **`account_state`** -- Singleton table tracking which account is active: `id` (integer PK), `active_account_id` (FK to `account.id`, ON DELETE SET NULL).

**Why:** Adds multi-account authentication support. The `account` table stores credentials for each authenticated provider/service, and `account_state` tracks which one is currently selected.

**Concerns:**

- **Tokens stored in plaintext.** `access_token` and `refresh_token` are stored as plain `text` columns in SQLite. This is a local database so the risk is limited to local file system access, but it's worth noting. This mirrors the existing `control_account` table pattern.
- **No unique constraint on `email`+`url`.** Two accounts with the same email/url combination could be inserted. The existing `control_account` table uses a composite PK on `(email, url)`. This may be intentional (the `id` column provides the primary identity), but duplicates are possible.
- The `account_state` table uses `ON DELETE SET NULL` for the FK, which is correct -- if an account is deleted, the state gracefully clears.
- `CREATE TABLE` is safe -- it won't fail if the table doesn't exist (it's a fresh install or upgrade path).

**Risk:** LOW -- additive schema change, no data modification.

---

## 10. `packages/opencode/migration/20260228203230_blue_harpoon/snapshot.json`

**What changed:** New snapshot file capturing the full database schema state after the `blue_harpoon` migration. This is the Drizzle ORM migration snapshot.

**Concerns:** The snapshot is consistent with the migration SQL. It includes all existing tables plus the new `account` and `account_state` tables. The `workspace` table in this snapshot shows `config` and `project_id` columns (which differ from the later snapshot), indicating intermediate schema evolution.

**Risk:** LOW -- auto-generated migration metadata.

---

## 11. `packages/opencode/migration/20260309230000_move_org_to_state/migration.sql`

**What changed:** Three-step migration:

1. `ALTER TABLE account_state ADD active_org_id text` -- Adds org ID to the state table.
2. `UPDATE account_state SET active_org_id = (SELECT selected_org_id FROM account WHERE account.id = account_state.active_account_id)` -- Copies existing org selection from the account to the state.
3. `ALTER TABLE account DROP COLUMN selected_org_id` -- Removes the column from the account table.

**Why:** Moves `selected_org_id` from being per-account (`account` table) to being global state (`account_state` table). This makes sense -- the selected org is a UI/session state concern, not an account property. A user might switch orgs without switching accounts.

**Concerns:**

- **Data migration is handled.** The `UPDATE` correctly copies existing `selected_org_id` values before dropping the column. The subquery correctly joins on `active_account_id`.
- **Edge case:** If `account_state.active_account_id` is NULL (no active account), the subquery returns NULL, and `active_org_id` stays NULL. This is correct behavior.
- **Edge case:** If there are multiple accounts but only the active one's org ID is migrated. Non-active accounts' `selected_org_id` values are lost. This appears intentional -- the new model only tracks one org globally.
- **SQLite `DROP COLUMN`** requires SQLite 3.35.0+ (2021-03-12). This is generally safe for any modern system, but worth noting for very old embedded deployments.
- The migration is not wrapped in a transaction, but the `statement-breakpoint` markers handle this in the Drizzle migration runner.

**Risk:** MEDIUM -- data migration with column drop. The logic is correct, but non-active account org selections are silently lost. This is likely an acceptable trade-off given the new architecture.

---

## 12. `packages/opencode/migration/20260309230000_move_org_to_state/snapshot.json`

**What changed:** Updated schema snapshot reflecting:

- `account_state` now has `active_org_id` column
- `account` no longer has `selected_org_id`
- `workspace` table has evolved: new columns `type`, `name`, `directory`, `extra`; removed `config` column
- `session` table gained `workspace_id` column and `session_workspace_idx` index

**Concerns:**

- The workspace table changes (`type`, `name`, `directory`, `extra` replacing `config`) and session's `workspace_id` addition indicate significant schema evolution between the two migration snapshots. These intermediate migrations are presumably in other migration files not in this review set.
- The snapshot's `prevIds` includes two IDs, confirming it builds on both the `blue_harpoon` migration and at least one other intermediate migration.

**Risk:** LOW -- auto-generated snapshot metadata, consistent with the migration SQL.

---

## Summary

| File                              | Risk   | Action Needed                                                          |
| --------------------------------- | ------ | ---------------------------------------------------------------------- |
| `sdk.gen.ts`                      | LOW    | None -- auto-generated                                                 |
| `types.gen.ts`                    | LOW    | None -- auto-generated (note: duplicate `number` in union is cosmetic) |
| `plugin/example.ts`               | LOW    | None                                                                   |
| `plugin/tsconfig.json`            | LOW    | Consider if `kilocode_change` marker placement is intentional          |
| `util/module.ts`                  | LOW    | **Flag: empty catch block violates style guide**                       |
| `script/package.json`             | LOW    | None                                                                   |
| `script/src/index.ts`             | LOW    | None                                                                   |
| `kilo-docs/source-links.md`       | LOW    | None                                                                   |
| `blue_harpoon/migration.sql`      | LOW    | None -- additive, no data risk                                         |
| `blue_harpoon/snapshot.json`      | LOW    | None                                                                   |
| `move_org_to_state/migration.sql` | MEDIUM | Verify that losing non-active accounts' org selections is acceptable   |
| `move_org_to_state/snapshot.json` | LOW    | None                                                                   |

### Key Findings

1. **Empty catch block in `packages/util/src/module.ts`** -- Violates project style guide. Should at minimum log the error or restructure to avoid try/catch.
2. **`move_org_to_state` migration** -- Correctly migrates data but silently discards `selected_org_id` for non-active accounts. This is the only migration with real data transformation risk in this set.
3. **All SDK/types changes** are auto-generated and backward-compatible (additive optional fields).
