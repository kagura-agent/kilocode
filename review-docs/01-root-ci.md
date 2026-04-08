# Review: Root & CI Files

## .github/actions/setup-bun/action.yml

**Risk: LOW**

Three changes:

1. **Cache key fix**: The cache hash input changed from `**/bun.lockb` to `**/bun.lock`. Bun v1.2+ uses `bun.lock` (text-based) instead of `bun.lockb` (binary). The old key was likely producing constant cache misses. The cache step also moved _after_ Bun installation and now uses `bun pm cache` to dynamically resolve the cache directory instead of hardcoding `~/.bun/install/cache`. This is more robust across Bun versions and platforms.

2. **Ordering fix**: The cache restore was previously done _before_ Bun was installed, which meant the `bun pm cache` command wasn't available. Now Bun is installed first, then the cache directory is resolved, then the cache is restored. Correct ordering.

3. **setuptools compatibility shim**: A new step installs `setuptools` via pip for `distutils` compatibility. This is needed because Python 3.12+ removed `distutils` from the standard library, and some native npm/bun dependencies (node-gyp) still require it. The `|| true` fallback prevents CI failure if pip isn't available. This is likely related to the new `msgpackr-extract` native dependency pulled in by the `effect` package.

- No concerns. All changes are improvements to CI reliability.

## .github/workflows/test.yml

**Risk: LOW**

Two additions:

1. **Concurrency control**: Added `concurrency` group keyed on workflow + PR number (or ref). `cancel-in-progress: true` means pushing a new commit to a PR cancels the previous in-flight test run. Saves CI minutes and avoids stale results.

2. **Explicit permissions**: Added `permissions: contents: read` at the workflow level. This follows the principle of least privilege and is a security best practice for GitHub Actions -- restricts the `GITHUB_TOKEN` to read-only content access.

- No concerns. Both are standard CI hygiene improvements.

## .opencode/.gitignore

**Risk: LOW**

Added `package-lock.json` to the ignore list alongside the already-ignored `bun.lock` and `package.json`. The `.opencode/` directory can auto-generate lock files and this prevents them from being accidentally committed.

- No concerns. Trivial housekeeping.

## .opencode/tool/github-triage.txt

**Risk: LOW**

Removed a trailing blank line at end of file. No functional change.

- No concerns.

## bun.lock

**Risk: MEDIUM**

Major dependency changes:

1. **`effect` 4.0.0-beta.31** added as a direct dependency to three packages: `packages/app`, `packages/desktop`, and `packages/opencode`. This is a beta version of the Effect library (a TypeScript framework for building production-grade applications with structured concurrency, observability, and error handling). It's also pinned in the catalog.

2. **`effect` transitive dependencies**: The `effect` package brings in a substantial dependency tree including `fast-check` (property-based testing), `find-my-way-ts` (HTTP router), `ini` (upgraded to v6), `kubernetes-types`, `msgpackr` + native `msgpackr-extract` binaries, `multipasta` (multipart parser), `toml`, `uuid` (upgraded to v13), and `yaml`. This is a large footprint for a single dependency.

3. **`semver` + `@types/semver`** added to `packages/opencode` and `packages/script`. Used for semantic version parsing/comparison.

4. **`@effect/language-service`** added as a devDependency to `packages/opencode`. Provides IDE support for Effect.

5. **`ini` upgraded from 1.3.8 to 6.0.0** at the top level (the old version is still used by `rc` as a nested dependency). Major version jump -- v6 has breaking API changes but this is pulled in transitively by `effect`.

6. **`uuid` upgraded from 11.1.0 to 13.0.0** at the top level (mermaid still uses 11.1.0 via nesting). Also transitively via `effect`.

**Concerns**:

- **Beta dependency in production**: `effect@4.0.0-beta.31` is a pre-release version. API surface may change between beta releases, creating upgrade friction.
- **Large transitive dependency tree**: Effect brings in kubernetes-types, msgpackr with native binaries, fast-check, etc. The native `msgpackr-extract` binaries require `node-gyp` to build (hence the new setuptools CI step). This increases install time, binary surface area, and potential platform-specific breakage.
- **Three packages depend on it**: Both app packages and the core CLI now depend on effect, suggesting it's being adopted broadly rather than experimentally in one package.
- Worth verifying that `effect` is actually used in the merged code and not just added speculatively. If it's used, the adoption is intentional upstream and should be accepted.

## package.json

**Risk: LOW**

Added `"effect": "4.0.0-beta.31"` to the catalog overrides in the root `package.json`. This pins the Effect version across all workspaces that reference it via `catalog:`.

- Concern is the same as noted in `bun.lock` -- this is a beta dependency. But the root package.json change itself is mechanical and correct for the monorepo catalog pattern.

## script/beta.ts

**Risk: LOW**

Changed the `gh pr list` command to include `--draft=false`, filtering out draft PRs from the beta build process. Previously, draft PRs with the `beta` label would be included in beta builds, which is undesirable since drafts are typically work-in-progress.

- No concerns. Sensible improvement to the beta release script logic.

---

## Summary

| File                                   | Risk   | Notes                                                          |
| -------------------------------------- | ------ | -------------------------------------------------------------- |
| `.github/actions/setup-bun/action.yml` | LOW    | Cache fix, ordering fix, setuptools shim                       |
| `.github/workflows/test.yml`           | LOW    | Concurrency + least-privilege permissions                      |
| `.opencode/.gitignore`                 | LOW    | Ignore package-lock.json                                       |
| `.opencode/tool/github-triage.txt`     | LOW    | Trailing whitespace removal                                    |
| `bun.lock`                             | MEDIUM | `effect` beta dep with large transitive tree + native binaries |
| `package.json`                         | LOW    | Catalog pin for effect                                         |
| `script/beta.ts`                       | LOW    | Exclude draft PRs from beta builds                             |

**Overall risk: MEDIUM** -- driven entirely by the `effect@4.0.0-beta.31` dependency addition. All CI and script changes are straightforward improvements.
