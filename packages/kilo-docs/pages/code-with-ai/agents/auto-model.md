---
title: "Auto Model"
description: "Smart model routing that automatically selects the optimal AI model based on your current mode"
---

# Auto Model

Auto Model is a smart model routing system that automatically selects the optimal AI model based on the Kilo Code mode you're using. It comes in multiple tiers so you can balance cost and capability to fit your needs.

| Tier                 | Best For                                          | Pricing |
| -------------------- | ------------------------------------------------- | ------- |
| `kilo-auto/frontier` | Maximum capability with the best available models | Paid    |
| `kilo-auto/balanced` | Strong performance at a lower cost                | Paid    |
| `kilo-auto/free`     | The best free models available                    | Free    |

## How It Works

1. Select an Auto Model tier (e.g. `kilo-auto/frontier`) in the model dropdown
2. Start working in any mode (Code, Architect, Debug, etc.)
3. The system automatically routes your requests to the best model for that task

That's it. No configuration needed.

## Auto Frontier

`kilo-auto/frontier` routes to the latest and most capable paid models available, optimizing for performance, capability, and cost.

For the current mode-to-model mappings, see the [Gateway docs](/docs/gateway/models-and-providers#kilo-autofrontier).

## Auto Balanced

`kilo-auto/balanced` follows the same mode-based routing structure as Frontier but uses a more cost-effective model — GPT 5.3 Codex across all modes.

For the current mode-to-model mappings, see the [Gateway docs](/docs/gateway/models-and-providers#kilo-autobalanced).

## Benefits

### Simplified Setup

No need to manually switch models when changing modes. Auto Model handles the routing transparently in the background.

### Cost Optimization

Uses cost-effective models matched to the task — Auto Balanced and Auto Free deliver strong capabilities at a fraction of frontier cost. You get optimal cost-to-capability ratio without thinking about it.

### Best-in-Class Models

Auto Model routes to capable models matched to your task:

- **Auto Frontier** uses the latest and most effective models across all modes
- **Auto Balanced** uses more cost-effective models while still providing strong capabilities
- **Auto Free** uses the best available free models

## Requirements

{% callout type="warning" title="Version Requirements" %}
Auto Model requires **VS Code/JetBrains extension v5.2.3+** or **CLI v1.0.15+** for automatic mode-based switching. On older versions, Auto Model tiers will default to a single model for all requests.
{% /callout %}

## Getting Started

{% callout type="tip" title="Quick Setup" %}
Select an Auto Model tier from the model dropdown in the Kilo Code chat interface. That's all you need to do.
{% /callout %}

1. Open Kilo Code in VS Code or JetBrains
2. Click the model selector dropdown
3. Choose an Auto Model such as `kilo-auto/frontier` or `kilo-auto/balanced`
4. Start chatting - the right model is selected automatically based on your current mode

## When to Use Auto Model

Auto Model is ideal for:

- **Developers who frequently switch between planning and coding** - No need to remember which model works best for each task
- **Teams wanting consistent model selection** - Everyone gets optimal routing without individual configuration
- **Cost-conscious developers** - Automatically balances cost and capability
- **New Kilo Code users** - Great defaults without needing to understand model differences

## When to Use a Specific Model

You may want to select a specific model instead when:

- Cost is not a factor for a particular task
- You need a particular model's unique capabilities (e.g., very long context windows)
- You're working with a specialized provider or local model
- You want full control over model selection

## Feedback

{% callout type="note" title="Help Us Improve" %}
Auto Model is actively being improved. We'd love to hear how it's working for you! Share feedback in our [Discord](https://kilo.ai/discord) or [open an issue on GitHub](https://github.com/Kilo-Org/kilocode/issues).
{% /callout %}

## Related

- [Model Selection Guide](/docs/code-with-ai/agents/model-selection) - General guidance on choosing models
- [Using Agents](/docs/code-with-ai/agents/using-agents) - Learn about different Kilo Code agents
- [Free & Budget Models](/docs/code-with-ai/agents/free-and-budget-models) - Cost-effective alternatives
