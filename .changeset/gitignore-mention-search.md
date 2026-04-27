---
"@kilocode/cli": patch
---

fix(search): include gitignored files in @mention file search

Files matching `.gitignore` patterns (e.g. `*.log`) were invisible to
the `@` mention file picker because the file cache only contained
tracked files. When the primary fuzzy search returns fewer results
than the limit, a supplementary ripgrep search now runs with
`--no-ignore-vcs` to surface gitignored files as additional matches.

Fixes #9532
