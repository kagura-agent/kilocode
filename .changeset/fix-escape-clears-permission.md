---
"@kilocode/cli": patch
---

fix(permission): clear permission prompt when session is aborted

When a user presses Escape to abort a session while a permission prompt is pending, the prompt now correctly disappears. Previously, the server-side cleanup removed the pending request but never published the `permission.replied` event, leaving the TUI prompt stuck.
