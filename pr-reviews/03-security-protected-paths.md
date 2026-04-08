# Review: Security Improvements (Protected Paths)

## Files Reviewed

- `packages/opencode/src/file/protected.ts` (new)
- `packages/opencode/src/file/index.ts` (modifications)
- `packages/opencode/src/file/watcher.ts` (modifications)

## Summary

This PR introduces a **Protected** namespace that prevents access to system directories that could trigger permission prompts (TCC on macOS) or contain sensitive data.

## New Protected Module (`protected.ts`)

### Protected Directories by Platform

**macOS (Darwin):**

- Home: Music, Pictures, Movies, Downloads, Desktop, Documents, Public, Applications, Library
- Library subdirs: AddressBook, Calendars, Mail, Messages, Safari, Cookies, TCC, etc.
- Root: .DocumentRevisions-V100, .Spotlight-V100, .Trashes, .fseventsd

**Windows:**

- Home: AppData, Downloads, Desktop, Documents, Pictures, Music, Videos, OneDrive

**Linux:**

- No protected paths (returns empty sets)

### API

```typescript
export namespace Protected {
  /** Directory basenames to skip when scanning home */
  export function names(): ReadonlySet<string>

  /** Absolute paths that should never be watched/stated/scanned */
  export function paths(): string[]
}
```

## Integration Points

### File Operations (`file/index.ts`)

- `isProtected()` helper checks paths against protected list
- File operations return `ProtectedPathError` for protected paths
- Functions like `read()`, `readdir()` check protection before proceeding

### File Watcher (`file/watcher.ts`)

- Watcher ignores protected paths
- Prevents watching system directories

## Quality Assessment

**Strengths:**

1. **Platform-aware**: Different protections for macOS/Windows/Linux
2. **Comprehensive**: Covers major TCC-triggering directories on macOS
3. **Clean API**: Simple functions to check protection status
4. **Error Handling**: Returns structured errors rather than failing silently

**Potential Concerns:**

1. **Over-protection**: Some protected dirs (Downloads, Documents) are commonly used in development - verify this doesn't break legitimate use cases
2. **macOS Updates**: Apple may add new TCC-protected paths in future macOS versions

## Code Pattern Example

```typescript
export const read = fn(ReadInput, async (input) => {
  const absolute = path.resolve(input.path)
  if (isProtected(absolute)) {
    return new ProtectedPathError({ path: absolute })
  }
  // ... proceed with read
})
```

## Verdict

**APPROVED** - Good security improvement. Prevents accidental access to system directories. Monitor for user reports about over-protection.
