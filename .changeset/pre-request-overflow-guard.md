---
"@kilocode/cli": patch
---

fix(cli): proactive context overflow detection before LLM request

Adds a pre-request overflow guard that estimates input token count before
sending to the LLM. When the estimated input exceeds the model's context
limit and auto-compress is enabled, compaction is triggered proactively
instead of sending a request that will be rejected.

Previously, the overflow check only ran after receiving a response, so
new content added between turns (user messages, tool results) could push
the input past the limit without triggering compaction. The API would
reject the request, and if the provider's error message didn't match the
known overflow patterns, the session could enter a retry loop.
