# Review: Workspace and Project Changes

## Files Reviewed

- `packages/opencode/src/project/project.ts`
- `packages/opencode/src/project/project.sql.ts`
- `packages/opencode/src/control-plane/workspace.ts`
- `packages/opencode/src/control-plane/workspace.sql.ts`
- `packages/opencode/src/control-plane/workspace-context.ts`
- `packages/opencode/src/control-plane/workspace-router-middleware.ts`

## Summary

Significant changes to workspace handling, including project ID branding, worktree improvements, and experimental workspace routing.

## Key Changes

### 1. Project ID Branding

Project IDs now use branded types:

```typescript
// schema.ts
export const ProjectID = projectIdSchema.pipe(
  withStatics((schema) => ({
    global: schema.makeUnsafe("global"),
    make: (id: string) => schema.makeUnsafe(id),
    zod: z.string().pipe(z.custom<ProjectID>()),
  })),
)
```

### 2. Worktree Project ID Resolution

Worktrees now read the project ID from the local workspace configuration instead of generating new ones. This ensures consistency across git worktrees.

### 3. Workspace Routing (Experimental)

New `KILO_EXPERIMENTAL_WORKSPACES` flag controls workspace routing:

- When enabled, uses new workspace-aware routing
- Allows passing `workspaceID` into session create endpoint
- Supports multi-account workspace authentication

### 4. Database Schema Updates

```sql
-- project table now includes:
- id: ProjectID (primary key)
- worktree: string (path)
- vcs: string (version control info)
- name: string
- icon_url / icon_color: string
- sandboxes: string[] (JSON)
- commands: { start?: string } (JSON)
```

### 5. Organization Data Fetching

Implemented resilient organization data fetching with error handling:

- Graceful degradation when org fetch fails
- Better error messages for auth issues

## Quality Assessment

- **Branded ProjectID**: Good type safety improvement
- **Worktree Fix**: Important for developers using git worktrees
- **Experimental Flag**: Proper gating of new features
- **Resilient Fetching**: Better UX when network/org issues occur

## Verdict

**APPROVED** - Solid improvements to workspace/project handling. The worktree fix is particularly important for advanced git workflows.
