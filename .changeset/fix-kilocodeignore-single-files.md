---
"@kilocode/cli": patch
---

fix(ignore): match unrooted .kilocodeignore patterns at any tree depth

Patterns like `secret.txt` or `secrets/` (without a path separator at the
beginning or middle) should match at any depth per gitignore spec. Previously
they only matched at the workspace root, so `.kilocodeignore` entries for
single files or bare directory names had no effect in subdirectories.

For each unrooted pattern, we now emit both the root-level rule and a
`*/`-prefixed variant so `Wildcard.all` can deny access inside nested
directories as well.
