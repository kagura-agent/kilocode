# Review: LSP Server Improvements

## Files Reviewed

- `packages/opencode/src/lsp/server.ts`
- `packages/opencode/src/lsp/index.ts`

## Summary

Significant improvements to the LSP (Language Server Protocol) implementation, including a critical Windows fix and new language server support.

## Key Changes

### 1. Windows Console Fix (CRITICAL)

**Problem**: Spawning LSP servers on Windows caused cmd.exe console windows to flash.

**Solution**: Added a `spawn()` wrapper with `windowsHide: true`:

```typescript
// kilocode_change start
function spawn(cmd: string, opts?: SpawnOptions): ChildProcessWithoutNullStreams
function spawn(cmd: string, args: readonly string[], opts?: SpawnOptions): ChildProcessWithoutNullStreams
function spawn(cmd: string, ...rest: any[]): ChildProcessWithoutNullStreams {
  const opts = typeof rest[rest.length - 1] === "object" && !Array.isArray(rest[rest.length - 1]) ? rest.pop() : {}
  const args = rest[0] as readonly string[] | undefined
  return args ? _spawn(cmd, args, { ...opts, windowsHide: true }) : _spawn(cmd, { ...opts, windowsHide: true })
}
// kilocode_change end
```

**Quality: EXCELLENT** - Critical UX improvement for Windows users.

### 2. TypeScript LSP Support (Experimental)

Added native `tsgo` LSP support behind `KILO_EXPERIMENTAL_LSP_TOOL` flag:

- Spawns `tsgo --lsp --stdio` when flag is enabled
- Falls back to lightweight TsClient when disabled

### 3. JDTLS (Java) Improvements

Fixed memory issues in Java monorepos:

- Added `NearestRoot` with exclusions for monorepo markers
- Better root detection for Gradle/Maven projects
- Prevents multiple JDTLS instances in monorepos

### 4. New Language Servers

- **Kotlin**: Added `KotlinLS` with automatic download from JetBrains
- **YAML**: Added `YamlLS` support
- **PHP**: Added `PHPIntelephense` support

### 5. Rust Analyzer Improvements

Better workspace detection for Rust:

```typescript
// Finds workspace root by looking for [workspace] in Cargo.toml
// Stops at filesystem root or above worktree
```

## LSP Server List (Complete)

| Server          | Languages | Auto-install | Notes                           |
| --------------- | --------- | ------------ | ------------------------------- |
| Deno            | TS/JS     | No           | Requires deno binary            |
| TypeScript      | TS/JS     | Yes (tsgo)   | Behind experimental flag        |
| Vue             | .vue      | Yes          | Downloads @vue/language-server  |
| ESLint          | Multiple  | Yes          | Downloads VS Code ESLint server |
| Oxlint          | JS/TS/Vue | No           | Uses local or global binary     |
| Biome           | Multiple  | Yes          | Via bun x biome                 |
| Gopls           | Go        | Yes          | go install                      |
| Rubocop         | Ruby      | Yes          | gem install                     |
| Ty              | Python    | No           | Behind experimental flag        |
| Pyright         | Python    | Yes          | npm install                     |
| ElixirLS        | Elixir    | Yes          | mix compile from source         |
| Zls             | Zig       | Yes          | GitHub releases                 |
| CSharp          | C#        | Yes          | dotnet tool install             |
| FSharp          | F#        | Yes          | dotnet tool install             |
| SourceKit       | Swift     | No           | Requires Xcode/swift            |
| RustAnalyzer    | Rust      | No           | Requires rust-analyzer          |
| Clangd          | C/C++     | Yes          | GitHub releases                 |
| Svelte          | Svelte    | Yes          | npm install                     |
| Astro           | Astro     | Yes          | npm install                     |
| JDTLS           | Java      | Yes          | Eclipse download                |
| KotlinLS        | Kotlin    | Yes          | JetBrains download              |
| YamlLS          | YAML      | Yes          | npm install                     |
| LuaLS           | Lua       | Yes          | GitHub releases                 |
| PHPIntelephense | PHP       | Yes          | npm install                     |
| Prisma          | Prisma    | No           | Requires prisma binary          |

## Code Quality

- Consistent pattern for all servers: `id`, `extensions`, `root()`, `spawn()`
- Proper error handling and logging
- Platform-specific binary resolution
- Automatic installation when possible

## Verdict

**APPROVED** - Significant improvements, especially the Windows console fix. The JDTLS monorepo fix addresses a real memory issue.
