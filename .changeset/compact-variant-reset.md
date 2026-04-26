---
"@kilocode/cli": patch
---

fix(cli): preserve model variant across /compact command

The `/compact` command was resetting the model variant to default because the
variant was not passed through the summarize API endpoint. This fix threads the
variant through the server route, compaction service, and both the web and TUI
clients so that the selected variant is preserved after compaction.
