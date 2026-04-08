# Review: ACP (Agent Control Protocol) Changes

## Files Reviewed

- `packages/opencode/src/acp/agent.ts`
- `packages/opencode/src/acp/types.ts`

## Summary

ACP improvements including snapshot re-enablement and type updates.

## Key Changes

### 1. Snapshot Re-enabled in ACP

Snapshots were previously disabled; now re-enabled with improvements:

- Better state serialization
- Proper handling of branded types
- Improved agent state recovery

### 2. Type Updates

Updated for branded types:

- `ProviderID` integration
- `ModelID` integration
- Better type safety in agent communication

### 3. Agent Improvements

- Better error handling
- Improved state management
- Updated for new schema types

## Quality Assessment

- **Snapshot Fix**: Important for agent reliability
- **Type Safety**: Consistent with rest of codebase

## Verdict

**APPROVED** - Good ACP improvements.
