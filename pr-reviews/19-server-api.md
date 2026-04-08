# Review: Server Routes and API

## Files Reviewed

- `packages/opencode/src/server/server.ts`
- `packages/opencode/src/server/routes/session.ts`
- `packages/opencode/src/server/routes/project.ts`
- `packages/opencode/src/server/routes/provider.ts`
- `packages/opencode/src/server/routes/experimental.ts`

## Summary

Server improvements including new routes, branded types, and workspace routing.

## Key Changes

### 1. Server Initialization

- New `createApp()` function extracted for server initialization
- Better separation of concerns
- Easier testing

### 2. Session Routes

- Now accepts `workspaceID` parameter
- Updated for branded `SessionID`
- Better error handling

### 3. Project Routes

- Updated for branded `ProjectID`
- Better worktree handling
- Support for project metadata (icon, name, etc.)

### 4. Provider Routes

- Updated for branded `ProviderID` and `ModelID`
- Better provider configuration handling

### 5. Experimental Routes

New experimental endpoints behind `KILO_EXPERIMENTAL_WORKSPACES` flag:

- Workspace-aware routing
- Multi-account session creation

## API Changes Summary

### New Parameters

| Endpoint          | New Parameter | Type                   |
| ----------------- | ------------- | ---------------------- |
| POST /session     | workspaceID   | WorkspaceID (optional) |
| GET /project/:id  | -             | ProjectID (branded)    |
| GET /provider/:id | -             | ProviderID (branded)   |

### New Endpoints

- Account management endpoints (via AccountService)
- Workspace routing (experimental)

## Quality Assessment

- **Type Safety**: Branded types throughout
- **Experimental Flag**: Proper gating of new features
- **Error Handling**: Improved

## Verdict

**APPROVED** - Good API improvements with proper type safety.
