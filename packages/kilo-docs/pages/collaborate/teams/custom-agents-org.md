---
title: "Custom Agents (Org)"
description: "Create organization-wide custom agents"
---

# Custom Agents (Org)

Custom Agents let you create tailored versions of Kilo's built-in [agents](/docs/code-with-ai/agents/using-agents) for your organization. You can also adjust the settings for Kilo Code's original default agents. You can define an agent's purpose, behavior, and tool access — helping Kilo adapt to your team's unique workflows.

For example, Admins and Owners can extend these by creating **Custom Agents** with specialized roles or personalities (e.g. "Documentation Writer" or "Security Reviewer").

{% image src="/docs/img/teams/custom_modes.png" alt="Create a new custom agent tab." caption="Create a new custom agent tab." /%}

## Creating a Custom Agent

1. Go to **Enterprise/Team Dashboard → Custom Agents**.
2. Click **Create New Agent**.
3. Optionally select a **template** (e.g. _User Story Creator_, _Project Research_, _DevOps_).
4. Fill in the following fields:

| Field                              | Description                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Agent Name**                     | Display name for the new agent (e.g. _Security Reviewer_).                                             |
| **Agent Slug**                     | A short identifier used internally (e.g. `security-reviewer`).                                         |
| **Role Definition**                | Describe Kilo's role and personality for this agent. Shapes how it reasons and responds.               |
| **Short Description**              | A brief summary shown in the agent selector.                                                           |
| **When to Use (optional)**         | Guidance for when this agent should be used. Helps the Orchestrator choose the right agent for a task. |
| **Custom Instructions (optional)** | Add behavioral guidelines specific to this agent.                                                      |
| **Available Tools**                | Select which tools this agent can access (Read, Edit, Browser, Commands, MCP).                         |

5. Click **Create Agent** to save.

Your new agent appears under **Custom Agents** in the Agents dashboard.

---

## Managing Custom Agents

- **Edit:** Click the edit icon to update any field or tool permissions.
- **Delete:** Click the 🗑️ icon to permanently remove the agent.
