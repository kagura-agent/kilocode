---
"@kilocode/cli": patch
---

fix(cli): prefer Kilo-branded config paths in `kilo plugin` command

`kilo plugin` now writes to `.kilo/kilo.json(c)` instead of `.opencode/opencode.json(c)` for fresh installs. Existing projects that already have `.opencode/` or `.kilocode/` config directories continue to work — the command detects existing directories and writes there.
