# Review: TUI (Terminal UI) Changes

## Files Reviewed

- `packages/opencode/src/cli/cmd/tui/app.tsx`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/home.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
- `packages/opencode/src/cli/cmd/tui/routes/session/header.tsx`
- `packages/opencode/src/cli/cmd/tui/util/clipboard.ts`
- `packages/opencode/src/cli/cmd/tui/worker.ts`

## Summary

TUI improvements including better clipboard handling, workspace dialog updates, and auto-submit fixes.

## Key Changes

### 1. Clipboard Utility Improvements (`clipboard.ts`)

Enhanced clipboard operations with better error handling:

- Fallback mechanisms for different platforms
- Better handling of clipboard access errors

### 2. Prompt Component Updates

- Updated to use branded ProviderID/ModelID
- Better handling of model store loading
- Auto-submit with `--prompt` flag now waits for model store

### 3. Session Route Improvements

- Updated for account/workspace context
- Better error handling when creating sessions

### 4. Home Route Updates

- Workspace list dialog improvements
- Better handling of multi-account scenarios

### 5. Worker Thread Updates

- Updated for new schema types
- Better error propagation

## Notable Fix: Auto-Submit Wait

Fixed a race condition where `--prompt` would auto-submit before the model store was loaded:

```typescript
// Now waits for model store before auto-submitting
const modelStore = await waitForModelStore()
if (modelStore) {
  // Safe to auto-submit
}
```

## Quality Assessment

- **Clipboard**: More robust across platforms
- **Auto-submit Fix**: Better UX for scripted usage
- **Type Updates**: Consistent branded types

## Verdict

**APPROVED** - Solid TUI improvements. The auto-submit fix prevents race conditions.
