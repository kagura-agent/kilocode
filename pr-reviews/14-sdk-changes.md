# Review: SDK Changes

## Files Reviewed

- `packages/sdk/js/src/gen/` (auto-generated)
- `packages/sdk/js/package.json`

## Summary

SDK updates for ESM imports and new API endpoints.

## Key Changes

### 1. ESM Import Fix

Fixed ESM imports for `@opencode-ai/plugin`:

- Better compatibility with modern bundlers
- Proper export maps in package.json

### 2. New API Endpoints

Auto-generated SDK now includes:

- Account management endpoints
- Workspace routing endpoints
- New session endpoints (with workspaceID support)

### 3. Type Branding in SDK

SDK types now use branded IDs:

- `ProviderID` instead of `string`
- `ModelID` instead of `string`
- `SessionID` instead of `string`
- etc.

## Generation

The SDK is auto-generated from the server OpenAPI spec. Changes are triggered by:

- Server route changes
- Schema updates
- New endpoints

To regenerate: `./script/generate.ts` from repo root.

## Quality Assessment

- **ESM Fix**: Important for modern JS ecosystem
- **Auto-generation**: Ensures SDK stays in sync with server

## Verdict

**APPROVED** - SDK improvements for better compatibility.
