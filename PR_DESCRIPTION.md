# OpenCode v1.2.25 Upstream Merge

> **Review Requested By**: @markijbema  
> **Review Model**: kilo/moonshotai/kimi-k2.5  
> **Original PR**: #8028

## Summary

This PR merges OpenCode v1.2.25 upstream changes (418 files, +14,838/-7,268 lines). This is a significant update containing new features, critical bug fixes, and major type safety improvements.

## Major Features

### 1. New Account System

- Multi-account workspace authentication with organization support
- Device OAuth flow with automatic token refresh
- Effect-based service architecture

### 2. Type Branding (Type Safety)

All ID types are now branded using Effect Schema:

- `ProviderID`, `ModelID`, `ProjectID`, `SessionID`, `MessageID`, `PartID`
- `PermissionID`, `QuestionID`, `PtyID`, `ToolID`, `AccountID`, `OrgID`

### 3. Windows Console Hiding (Critical Fix)

- Fixes flashing cmd.exe windows when spawning LSP servers
- Fixes background consoles in Electron app
- MCP SDK shim for VS Code extension

### 4. JDTLS Memory Fix (Critical Fix)

- Fixes multiple jdtls LSPs eating memory in Java monorepos
- Better root detection with monorepo markers

### 5. Terminal Stability (Critical Fix)

- Fixed terminal state corruption
- Fixed terminal focus issues and jank
- Proper lifecycle handling

### 6. Protected Paths (Security)

- Prevents access to TCC-protected directories on macOS
- Prevents access to system directories on Windows
- New `Protected` namespace in file utilities

### 7. ARM64 Support

- ARM64 release targets for Windows CLI and Desktop
- Enhanced Apple Silicon support

### 8. Session Restore & Fork

- Restore to any message in session history
- Fork session from current state
- New E2E tests for session review

## New Language Servers

- **KotlinLS**: Kotlin language support (auto-install)
- **YamlLS**: YAML language support (auto-install)
- **PHPIntelephense**: PHP language support (auto-install)

## New Themes

- **Amoled**: Pure black for OLED displays
- **OC-2**: OpenCode variant theme

## CLI Changes

- `kilo account` - **NEW**: Multi-account management (list, login, logout, switch, remove)
- `kilo providers` - **RENAMED** from `kilo auth`

## API Changes

- Session creation now accepts optional `workspaceID` parameter (experimental)
- All routes updated for branded types
- New `createApp()` function for server initialization

## Database Migrations

Two new migrations:

1. `blue_harpoon` - Account system tables
2. `move_org_to_state` - Organization state consolidation

## Build System

- Removed external sourcemap generation
- Replaced Bun semver with npm semver
- Replaced Bun shell with direct spawn calls
- OpenTUI upgraded to v0.1.87

## Provider Support

- Azure non-OpenAI models (completions endpoint)
- Google Vertex Location env variable support
- SAP AI thinking variants

## Risk Assessment

**Risk Level**: MEDIUM

**Potential Concerns**:

1. Protected paths may block legitimate access to common dirs (Downloads, Documents)
2. Existing users will need to re-authenticate with new account system
3. CLI rename (`auth` → `providers`) requires user education
4. Large change surface (418 files)

**Mitigations**:

- Protected paths can be tuned based on feedback
- Account migration is one-time
- Experimental features behind flags

## Verdict

**APPROVED FOR MERGE**

The critical bug fixes (Windows consoles, JDTLS memory, terminal stability) make this merge essential. The type safety improvements and new account system are valuable additions that justify the risk.

## Detailed Reviews

20 individual component reviews are available in `/pr-reviews/`:

1. Account System
2. Type Branding
3. Security (Protected Paths)
4. LSP Improvements
5. MCP Improvements
6. Provider System
7. Workspace/Project
8. CLI Commands
9. TUI Changes
10. App Package
11. Desktop Electron
12. Session Processing
13. UI Package
14. SDK Changes
15. Build Tooling
16. ACP Changes
17. Kilo-specific Changes
18. Database Migrations
19. Server API
20. Utilities

See `pr-reviews/SUMMARY.md` for comprehensive review details.

## Post-Merge Actions

1. Monitor Windows users for any remaining console issues
2. Update documentation for `kilo account` commands
3. Communicate CLI rename (`auth` → `providers`)
4. Test protected paths with common workflows
5. Verify JDTLS memory usage in Java projects
