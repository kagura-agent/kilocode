# OpenCode v1.2.25 Upstream Merge Review Summary

**PR:** #8028 - OpenCode v1.2.25
**Stats:** 418 files changed, 14,838 additions, 7,268 deletions
**Review model:** anthropic/claude-opus-4.6
**Review requested by:** @markijbema

---

## Overall Assessment

This is a large upstream merge bringing OpenCode v1.2.25 into Kilo. The changes span all major packages and introduce several cross-cutting themes. The merge appears well-structured with Kilo-specific `kilocode_change` markers preserved throughout.

**Overall risk: MEDIUM** -- driven by the branded type migration's breadth, new Effect library dependency, session prefetch rewrite, and followup queue system. Most individual changes are mechanical and LOW risk.

---

## Cross-Cutting Themes

### 1. Branded ID Types (LOW risk, HIGH breadth)

The single largest change by file count. All string-based IDs are migrated to Effect `Schema.brand()` nominal types:

- `SessionID`, `MessageID`, `PartID`, `ProjectID`, `WorkspaceID`
- `ProviderID`, `ModelID`, `PermissionID`, `PtyID`, `QuestionID`, `ToolID`, `AccountID`, `OrgID`

Each type provides `.make()`, `.ascending()`, `.zod` statics. Touches ~200+ files but is entirely mechanical -- same runtime values, stronger compile-time safety.

### 2. Bun Shell Removal (MEDIUM risk)

Systematic migration from `import { $ } from "bun"` shell templates to:

- `Process.run()` / `Process.text()` / `Process.lines()` utilities
- `git()` utility wrapper for git commands
- Node.js `fs` APIs for filesystem operations

This improves Node.js portability and is actually safer (array args vs shell interpolation). Affects CLI commands, LSP server, installation, worktree management, and clipboard operations.

### 3. Effect Library Adoption (MEDIUM risk)

`effect@4.0.0-beta.31` added as a dependency across 3 packages (opencode, app, desktop). Used for:

- Account service (OAuth device flow, token management)
- CLI prompt helpers (`@clack/prompts` wrappers)
- App connection gate (health check with retry/timeout)

**Concern:** Beta dependency with large transitive tree (kubernetes-types, msgpackr native binaries, fast-check).

### 4. Account System (MEDIUM risk)

New `Account` module replacing the old `Control` system:

- Full OAuth device code flow for login/logout/switch/orgs
- Token refresh, org fetching, remote config
- Two new DB migrations (account tables, org-to-state migration)
- CLI commands: `kilo login`, `kilo logout`, `kilo switch`, `kilo orgs`

### 5. Session Prefetch & Followup Queue (HIGH risk -- app only)

Major rewrites in `packages/app/`:

- Multi-stage session sync with prefetch cache, inflight dedup, TTL-based staleness
- Span-4 prefetch warming (up from 1) with aggressive hover triggers
- New followup queue system (queue vs steer mode) with dual send paths
- Auto-fill on scroll, stale prefetch detection, terminal focus preferences

### 6. Desktop Architecture Simplification (MEDIUM risk)

Both Electron and Tauri apps remove the "connect to existing server" flow:

- Always spawn local sidecar, credentials available immediately
- `ServerGate` blocking component removed, web layer handles health gating
- Windows ARM64 support added

### 7. UI/Theme Overhaul (LOW risk)

- Redesigned Card component with composable sub-components
- New ToolErrorCard component
- Session review search infrastructure removed
- Major theme engine overhaul (color scale generation, contrast-aware `on()`, AMOLED theme)
- SVG icons compressed/redrawn, PNG icons dramatically reduced

---

## Risk Summary by Area

| Area                  | Risk       | Key Concerns                                                      |
| --------------------- | ---------- | ----------------------------------------------------------------- |
| Root/CI               | MEDIUM     | `effect@4.0.0-beta.31` beta dependency with native binaries       |
| opencode/ Core        | HIGH       | Config rewrite, SSE chunk timeout, share auth, symlink resolution |
| opencode/ Tools       | MEDIUM     | Skill format change (XML to markdown) affects LLM prompts         |
| opencode/ Server/CLI  | MEDIUM     | Server singleton refactor, Bun shell migration breadth            |
| opencode/ Tests       | LOW        | 5 medium-risk items (mock patterns, deleted test)                 |
| packages/app/         | HIGH       | Session prefetch rewrite, followup queue, sync complexity         |
| Desktop packages      | MEDIUM     | Architecture simplification, Windows ARM64 naming                 |
| packages/ui/          | LOW        | Clean upstream updates, one Kilo override preserved               |
| SDK/Plugin/Migrations | LOW-MEDIUM | Org migration loses non-active account data                       |

---

## Action Items (Priority Order)

### Must Verify Before Merge

1. **`installation/index.ts` npm scope prefix** -- The upgrade commands may have dropped `@` from `@kilocode/cli`, which would install from GitHub shorthand instead of npm registry.

2. **`packages/desktop/scripts/utils.ts` naming** -- New Windows ARM64 entry uses upstream `opencode-windows-arm64` instead of Kilo convention `@kilocode/cli-windows-arm64`. All other entries use `@kilocode/cli-*`.

3. **`account/service.ts` client ID** -- Hardcoded `"opencode-cli"` should likely be `"kilo-cli"` for Kilo branding.

4. **`storage/db.ts` schema removal** -- Drizzle `schema` parameter removed from `drizzle()` call. Verify no relational queries (`db.query.*`) exist that would break.

### Should Verify

5. **SSE chunk timeout (120s)** -- New per-chunk timeout on all streaming providers. Test with slow reasoning models that have long thinking phases.

6. **Skill format change** -- Skills now rendered as markdown bullets instead of XML with `<location>` tags. Verify this is intentional for LLM prompts.

7. **Session prefetch complexity** -- The interaction between prefetch cache, inflight promises, and SolidJS store has many timing edge cases. Test session switching, tab changes, reconnection.

8. **`util/filesystem.ts` symlink resolution** -- `realpathSync()` changes path identity semantics. Verify worktree and caching scenarios.

9. **CLI breaking change** -- `kilo auth` replaced by `kilo login`/`kilo logout`/`kilo switch`/`kilo orgs`. Update docs/scripts.

### Style/Quality Notes

10. **`packages/util/src/module.ts`** -- Empty `catch {}` block violates project style guide.

11. **`bun/registry.test.ts`** -- Tests a locally duplicated function instead of real implementation.

12. **`tool-error-card.tsx`** -- Hardcoded `"Copy error"` string should be i18n key.

13. **`move_org_to_state` migration** -- Non-active accounts' `selected_org_id` silently lost. Likely intentional but worth confirming.

---

## Detailed Review Documents

| Document                                                     | Scope                       | Files |
| ------------------------------------------------------------ | --------------------------- | ----- |
| [01-root-ci.md](./01-root-ci.md)                             | Root & CI files             | 7     |
| [02-opencode-core.md](./02-opencode-core.md)                 | opencode/ core source       | 76    |
| [03-opencode-tools.md](./03-opencode-tools.md)               | opencode/src/tool/          | 9     |
| [04-opencode-server-cli.md](./04-opencode-server-cli.md)     | Server, CLI & Kilo-specific | 41    |
| [05-opencode-tests.md](./05-opencode-tests.md)               | opencode/ tests             | 48    |
| [06-app.md](./06-app.md)                                     | packages/app/               | 90    |
| [07-desktop.md](./07-desktop.md)                             | Desktop packages            | 23    |
| [08-ui.md](./08-ui.md)                                       | UI components & themes      | 30+   |
| [09-sdk-plugin-migrations.md](./09-sdk-plugin-migrations.md) | SDK, plugin, migrations     | 12    |
