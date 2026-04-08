# Review: MCP (Model Context Protocol) Improvements

## Files Reviewed

- `packages/opencode/src/mcp/index.ts`
- `packages/opencode/src/mcp/oauth-provider.ts`

## Summary

Improvements to MCP client implementation, including Windows console fix and OAuth auto-connect fix.

## Key Changes

### 1. Windows Console Fix (VS Code Extension)

**Problem**: MCP SDK only sets `windowsHide: true` in Electron environments.

**Solution**: Shim to set `process.type = "browser"` in VS Code extension context:

```typescript
// kilocode_change start
if (process.platform === "win32" && process.env.KILO_PLATFORM === "vscode" && !("type" in process)) {
  ;(process as NodeJS.Process & { type: string }).type = "browser"
}
// kilocode_change end
```

This makes the SDK's internal `isElectron()` check return true, enabling `windowsHide`.

### 2. OAuth Auto-Connect Fix

Fixed OAuth auto-connect failing on first MCP connection. The OAuth provider now properly handles the initial connection flow.

### 3. OAuth Provider Improvements (`oauth-provider.ts`)

- Better token management
- Improved error handling for OAuth flows

## Code Quality

- Clean shim approach that doesn't require SDK changes
- Scoped to VS Code extension context only (`KILO_PLATFORM=vscode`)
- Well-commented explaining the workaround

## Verdict

**APPROVED** - Important Windows UX fix and OAuth reliability improvement.
