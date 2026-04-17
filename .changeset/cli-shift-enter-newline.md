---
"@kilocode/cli": patch
---

Fix Shift+Enter inserting a newline in the CLI prompt on terminals that support the Kitty keyboard protocol (iTerm2 3.5+, Ghostty, Kitty, WezTerm, Alacritty, Windows Terminal 1.19+). On terminals that don't support it (e.g. Apple Terminal.app), show a one-time hint pointing to Ctrl+J as the universal alternative.
