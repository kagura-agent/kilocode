---
"@kilocode/cli": patch
---

fix(suggest): auto-dismiss suggestions after 5-minute timeout to prevent stuck sessions

When a suggestion goes unanswered (e.g. user closes VS Code or misses the prompt), the session could become stuck indefinitely in a false "queued" state. Adds a server-side timeout that auto-dismisses pending suggestions after 5 minutes, ensuring sessions always recover.

Fixes #9150