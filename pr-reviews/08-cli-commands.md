# Review: CLI and Command Changes

## Files Reviewed

- `packages/opencode/src/cli/cmd/account.ts` (new)
- `packages/opencode/src/cli/cmd/providers.ts` (renamed from auth.ts)
- `packages/opencode/src/cli/cmd/github.ts`
- `packages/opencode/src/cli/cmd/import.ts`
- `packages/opencode/src/cli/cmd/export.ts`
- `packages/opencode/src/cli/cmd/session.ts`

## Summary

New account CLI commands, renamed auth command, and updates to existing commands for branded types.

## Key Changes

### 1. New Account Command (`account.ts`)

New CLI subcommands for account management:

```bash
kilo account list       # List all accounts
kilo account login      # Login to a new account
kilo account logout     # Logout from current account
kilo account switch     # Switch between accounts
kilo account remove     # Remove an account
```

Implementation uses the new Effect-based AccountService.

### 2. Renamed auth.ts → providers.ts

The auth command has been renamed to `providers` to better reflect its purpose (managing provider configurations, not user authentication).

### 3. GitHub Command Updates

- Updated to use branded `ProviderID` and `ModelID`
- Improved error handling

### 4. Import/Export Updates

- Updated for new schema types
- Proper handling of branded IDs during serialization/deserialization

### 5. Session Command Updates

- Can now pass `workspaceID` to session create endpoint
- Updated for branded `SessionID`

## Command Changes Summary

| Command     | Change                         |
| ----------- | ------------------------------ |
| `account`   | NEW - Multi-account management |
| `providers` | RENAMED from `auth`            |
| `github`    | UPDATED - Branded types        |
| `import`    | UPDATED - Branded types        |
| `export`    | UPDATED - Branded types        |
| `session`   | UPDATED - Workspace support    |

## Quality Assessment

- **New Account Command**: Clean implementation using Effect
- **Rename**: Logical separation between account auth and provider config
- **Type Updates**: Consistent use of branded types across all commands

## Migration Notes

- Users used to `kilo auth` will need to switch to `kilo providers`
- New `kilo account` commands for multi-account users

## Verdict

**APPROVED** - Logical command reorganization. New account commands enable multi-account workflows.
