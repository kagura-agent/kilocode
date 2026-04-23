---
"@kilocode/cli": patch
---

Dynamically clamp max output tokens based on the model's context window and estimated input size. When the input prompt approaches the context limit, output tokens are reduced to fit within the remaining space instead of always requesting a static 32,000. This prevents ContextOverflowError during autocompact on models with strict context validation (e.g., local LLMs via LiteLLM).
