# OpenCode v1.2.25 Upstream Merge - Review Summary

## Overview

This PR merges OpenCode v1.2.25 upstream changes into Kilo. It contains **418 files changed** with **+14,838/-7,268** lines, representing a significant update with new features, type safety improvements, and critical bug fixes.

## Review Model

- **Model Used**: kilo/moonshotai/kimi-k2.5
- **Review Requested By**: @markijbema
- **Total Files Reviewed**: 418
- **Review Components**: 20 detailed reviews created

---

## Major Features

### 1. Account System (NEW)

**Status**: APPROVED

A comprehensive multi-account workspace authentication system has been introduced:

- Device OAuth flow for secure authentication
- Multi-account support with organization switching
- Token refresh with automatic persistence
- Effect-based service architecture

**Files**: `packages/opencode/src/account/*` (5 new files)

### 2. Type Branding (MAJOR IMPROVEMENT)

**Status**: APPROVED

All ID types are now branded using Effect Schema for compile-time type safety:

- `ProviderID`, `ModelID`, `ProjectID`, `SessionID`, `MessageID`, `PartID`
- `PermissionID`, `QuestionID`, `PtyID`, `ToolID`, `AccountID`, `OrgID`

This prevents accidental mixing of different ID types (e.g., using a SessionID where a ToolID is expected).

**Files**: `packages/opencode/src/*/schema.ts`

---

## Critical Bug Fixes

### 3. Windows Console Hiding (CRITICAL)

**Status**: APPROVED - CRITICAL FIX

Fixed flashing cmd.exe console windows on Windows:

- LSP server spawning now uses `windowsHide: true`
- Electron app properly hides background consoles
- MCP SDK shim for VS Code extension context

**Impact**: Critical UX improvement for Windows users
**Files**: `packages/opencode/src/lsp/server.ts`, `packages/desktop-electron/src/main/*`

### 4. JDTLS Memory Fix (CRITICAL)

**Status**: APPROVED - CRITICAL FIX

Fixed multiple jdtls LSPs eating memory in Java monorepos:

- Better root detection with monorepo marker exclusions
- Proper workspace detection for Gradle/Maven projects

**Impact**: Prevents memory exhaustion in Java projects
**Files**: `packages/opencode/src/lsp/server.ts`

### 5. Terminal State Corruption Fix (CRITICAL)

**Status**: APPROVED - CRITICAL FIX

Fixed terminal state corruption, focus issues, and jank in the app:

- Proper cleanup on unmount
- Better lifecycle handling
- Focus management improvements

**Impact**: Critical stability improvement for terminal feature
**Files**: `packages/app/src/context/terminal.tsx`, `packages/app/src/components/terminal.tsx`

### 6. Chunk Timeout Fix (CRITICAL)

**Status**: APPROVED - CRITICAL FIX

Fixed chunk timeout when processing LLM stream - prevents streams from getting stuck.

**Files**: `packages/opencode/src/session/processor.ts`

---

## Security Improvements

### 7. Protected Paths (NEW)

**Status**: APPROVED

New `Protected` namespace prevents access to system directories:

- macOS TCC-protected directories (Music, Pictures, Mail, etc.)
- Windows protected directories
- Prevents permission prompts and accidental data access

**Files**: `packages/opencode/src/file/protected.ts` (new)

---

## Platform Support

### 8. ARM64 Support (NEW)

**Status**: APPROVED

Added ARM64 release targets for:

- Windows CLI
- Windows Desktop
- macOS Apple Silicon (already supported, now enhanced)

**Files**: `.github/workflows/*.yml`, `packages/desktop-electron/scripts/*`

---

## User Experience Improvements

### 9. Session Restore & Fork (NEW)

**Status**: APPROVED

New session management features:

- Restore to any message in session history
- Fork session from current state
- New E2E tests for session review

**Files**: `packages/app/src/pages/session.tsx`, `packages/app/e2e/session/session-review.spec.ts` (new)

### 10. New Debug Bar (NEW)

**Status**: APPROVED

Development/debug overlay showing:

- Connection status
- Server health
- Session statistics
- Performance metrics

**Files**: `packages/app/src/components/debug-bar.tsx` (new)

### 11. New Themes

**Status**: APPROVED

- **Amoled**: Pure black theme for OLED displays
- **OC-2**: OpenCode variant theme
- Multiple existing themes updated

**Files**: `packages/ui/src/theme/themes/*.json`

### 12. New Tool Error Card

**Status**: APPROVED

Better error display for tool execution failures with structured error details.

**Files**: `packages/ui/src/components/tool-error-card.tsx` (new)

---

## Build System

### 13. Build Improvements

**Status**: APPROVED

- Removed external sourcemap generation (reduces artifacts)
- Replaced Bun semver with npm semver
- Replaced Bun shell with direct spawn calls
- OpenTUI upgraded to v0.1.87

**Files**: `package.json`, `bun.lock`, `packages/opencode/script/build.ts`

---

## Provider & Model Support

### 14. Azure Non-OpenAI Support

**Status**: APPROVED

Support for Azure models using completions endpoints (not just chat completions).

### 15. Google Vertex Location

**Status**: APPROVED

Added `GOOGLE_VERTEX_LOCATION` environment variable support for Vertex AI.

### 16. SAP AI Thinking Variants

**Status**: APPROVED

Added thinking variants support for SAP AI provider.

---

## New Language Server Support

### 17. New LSP Servers

**Status**: APPROVED

| Server          | Language | Auto-install |
| --------------- | -------- | ------------ |
| KotlinLS        | Kotlin   | Yes          |
| YamlLS          | YAML     | Yes          |
| PHPIntelephense | PHP      | Yes          |

**Files**: `packages/opencode/src/lsp/server.ts`

---

## API Changes

### 18. CLI Changes

**Status**: APPROVED

- `kilo account` - NEW: Multi-account management
- `kilo providers` - RENAMED from `kilo auth`
- Updated for branded types throughout

### 19. Server API Updates

**Status**: APPROVED

- New `workspaceID` parameter for session creation (experimental)
- All routes updated for branded types
- `createApp()` function extracted for better testability

---

## Database Changes

### 20. New Migrations

**Status**: APPROVED

Two new migrations:

1. `blue_harpoon` - Account system tables
2. `move_org_to_state` - Organization state consolidation

**Files**: `packages/opencode/migration/*/`

---

## Potential Concerns

1. **Protected Paths**: May block legitimate access to common dirs (Downloads, Documents) - monitor user reports
2. **Account System**: Existing users will need to re-authenticate
3. **CLI Rename**: `kilo auth` → `kilo providers` requires user education
4. **Experimental Features**: Workspace routing behind `KILO_EXPERIMENTAL_WORKSPACES` flag

---

## Overall Assessment

### Strengths

- **Type Safety**: Branded types prevent entire classes of bugs
- **Windows UX**: Console hiding is a major improvement
- **Stability**: Terminal and JDTLS fixes address real pain points
- **Multi-Account**: Foundation for enterprise/team features
- **ARM64**: Expands hardware support

### Risk Level: MEDIUM

- Large change surface (418 files)
- New account system requires migration
- CLI command rename affects muscle memory
- Protected paths may need tuning

### Verdict: **APPROVED FOR MERGE**

The benefits significantly outweigh the risks. Critical bug fixes for Windows and terminals make this merge essential. The type safety improvements and new account system are valuable additions.

### Recommended Actions Post-Merge

1. Monitor Windows users for any remaining console issues
2. Update documentation for `kilo account` commands
3. Communicate CLI rename (`auth` → `providers`)
4. Test protected paths with common workflows
5. Verify JDTLS memory usage in Java projects

---

## Individual Review Files

1. `01-account-system.md` - Account system review
2. `02-type-branding.md` - Type branding review
3. `03-security-protected-paths.md` - Protected paths review
4. `04-lsp-improvements.md` - LSP server review
5. `05-mcp-improvements.md` - MCP improvements review
6. `06-provider-system.md` - Provider system review
7. `07-workspace-project.md` - Workspace/project review
8. `08-cli-commands.md` - CLI commands review
9. `09-tui-changes.md` - TUI changes review
10. `10-app-package.md` - App package review
11. `11-desktop-electron.md` - Desktop Electron review
12. `12-session-processing.md` - Session processing review
13. `13-ui-package.md` - UI package review
14. `14-sdk-changes.md` - SDK changes review
15. `15-build-tooling.md` - Build tooling review
16. `16-acp-changes.md` - ACP changes review
17. `17-kilocode-specific.md` - Kilo-specific changes
18. `18-database-migrations.md` - Database migrations
19. `19-server-api.md` - Server API review
20. `20-utilities.md` - Utilities review
