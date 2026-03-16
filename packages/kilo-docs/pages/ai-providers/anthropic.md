---
sidebar_label: Anthropic
---

# Using Anthropic With Kilo Code

Anthropic is an AI safety and research company that builds reliable, interpretable, and steerable AI systems. Their Claude models are known for their strong reasoning abilities, helpfulness, and honesty.

**Website:** [https://www.anthropic.com/](https://www.anthropic.com/)

## Getting an API Key

1.  **Sign Up/Sign In:** Go to the [Anthropic Console](https://console.anthropic.com/). Create an account or sign in.
2.  **Navigate to API Keys:** Go to the [API keys](https://console.anthropic.com/settings/keys) section.
3.  **Create a Key:** Click "Create Key". Give your key a descriptive name (e.g., "Kilo Code").
4.  **Copy the Key:** **Important:** Copy the API key _immediately_. You will not be able to see it again. Store it securely.

## Configuration in Kilo Code

1.  **Open Kilo Code Settings:** Click the gear icon ({% codicon name="gear" /%}) in the Kilo Code panel.
2.  **Select Provider:** Choose "Anthropic" from the "API Provider" dropdown.
3.  **Enter API Key:** Paste your Anthropic API key into the "Anthropic API Key" field.
4.  **Select Model:** Choose your desired Claude model from the "Model" dropdown.
5.  **(Optional) Custom Base URL:** If you need to use a custom base URL for the Anthropic API, check "Use custom base URL" and enter the URL. Most people won't need to adjust this.

## Tips and Notes

- **Prompt Caching:** Claude 3 models support [prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching), which can significantly reduce costs and latency for repeated prompts.
- **Context Window:** Claude 3.5+ models support a 1,000,000 token context window (1M). Kilo Code automatically enables this extended context for supported models (Claude 3.5 Sonnet, Claude 3.7 Sonnet, Claude Sonnet 4+, Claude Opus 4+, and Claude Haiku 4.5+). Older Claude 3 models have a 200,000 token context window.
- **Pricing:** Refer to the [Anthropic Pricing](https://www.anthropic.com/pricing) page for the latest pricing information.
- **Rate Limits:** Anthropic has strict rate limits based on [usage tiers](https://docs.anthropic.com/en/api/rate-limits#requirements-to-advance-tier). If you're repeatedly hitting rate limits, consider contacting Anthropic sales or accessing Claude through a different provider like [OpenRouter](/docs/ai-providers/openrouter) or [Requesty](/docs/ai-providers/requesty).
