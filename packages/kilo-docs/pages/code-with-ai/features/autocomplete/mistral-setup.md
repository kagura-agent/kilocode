# Setting Up Mistral (Codestral) for Autocomplete

This guide walks you through setting up Mistral's Codestral model for autocomplete in Kilo Code. Mistral offers a free tier for Codestral that's perfect for AI-powered code completions. In the new extension, autocomplete is routed through the **Kilo Gateway**, and you can use your own Mistral API key via **Bring Your Own Key (BYOK)** to avoid consuming Kilo credits.

## Prerequisites

- A [Kilo Code account](https://app.kilo.ai) (free to create)
- A Mistral AI account with a Codestral API key

## Step 1: Get a Codestral API Key from Mistral

1. Go to the [Mistral AI console](https://console.mistral.ai/).
2. Sign up or sign in to your account.
3. Navigate to **Codestral** under the Code section in the sidebar, or go directly to [console.mistral.ai/codestral](https://console.mistral.ai/codestral).
4. Click **Generate API Key** (or copy an existing one).
5. Copy the API key to your clipboard.

{% callout type="note" %}
The Codestral API key is separate from the standard Mistral La Plateforme API key. Make sure you generate a key specifically from the **Codestral** section of the Mistral console.
{% /callout %}

## Step 2: Add Your Key via BYOK in Kilo

1. Log into the [Kilo platform](https://app.kilo.ai).
2. Navigate to the [Bring Your Own Key (BYOK) page](https://app.kilo.ai/byok), available in the sidebar under **Account**.
3. Click **Add Your First Key** (or **Add Key** if you already have keys configured).
4. Select **Mistral (Codestral)** as the provider.
5. Paste your Codestral API key.
6. Click **Save**.

{% callout type="tip" %}
For more details on BYOK, see the [Bring Your Own Key documentation](/docs/getting-started/byok).
{% /callout %}

## Step 3: Verify Autocomplete is Working

Once your BYOK key is saved, Kilo Code's autocomplete will automatically use your Codestral key through the Kilo Gateway. No additional configuration is needed in the extension.

1. Open VS Code with the Kilo Code extension installed.
2. Start typing in any code file — you should see inline ghost-text suggestions powered by Codestral.
3. Press `Tab` to accept a suggestion.

The autocomplete status bar in VS Code shows the current provider ("Kilo Gateway") and tracks cumulative cost. With BYOK, requests are billed directly by Mistral at their rates (Codestral has a free tier) and show as $0.00 on your Kilo balance.

## How It Works

When you add a Codestral BYOK key, the request flow is:

```
Your Editor → Kilo Gateway → Vercel AI Gateway (with your key) → Mistral
```

- The Kilo Gateway detects your BYOK key and routes autocomplete requests using it.
- You are billed directly by Mistral — Kilo does not add any markup.
- If your BYOK key is invalid, the request will fail (it does not fall back to Kilo's keys).
- All Kilo platform features (usage tracking, Code Reviews, Cloud Agents) continue to work normally.

## Troubleshooting

- **Autocomplete not appearing?** Check that autocomplete is enabled in Kilo Code settings (it is on by default). Also verify you are signed into Kilo Code in the extension.
- **Key not working?** Ensure you copied the **Codestral** API key (not the standard La Plateforme key). You can verify your key at [console.mistral.ai/codestral](https://console.mistral.ai/codestral).
- **Seeing charges on your Kilo balance?** If you haven't configured BYOK, autocomplete defaults to using your Kilo credits. Add your Codestral key via BYOK to route requests through your own Mistral account.

## Next Steps

- Learn more about [Autocomplete features](/docs/code-with-ai/features/autocomplete)
- Explore [triggering options](/docs/code-with-ai/features/autocomplete#triggering-options) for autocomplete
- Read about [BYOK](/docs/getting-started/byok) for other providers
