---
title: "Setting Up Other Services"
description: "Configure your KiloClaw agent to use third-party tools and services that aren't pre-installed"
---

# Setting Up Other Services

While KiloClaw comes with a set of [pre-configured tool integrations](/docs/kiloclaw/tools), your agent isn't limited to just those. KiloClaw can be configured to use virtually any third-party integration as a tool — as long as it has a CLI or an API, you can teach your agent to work with it.

We have seen this pattern work well with outside services like ZenDesk, Todoist, GitLab, and more.

## If There Is a CLI

When the tool you want to integrate provides a command-line interface, follow these steps:

1. **Tell KiloClaw to install the CLI.** Prompt the agent to install the CLI so it's available in the agent's environment. For example: _"Install the Fly.io CLI."_

2. **Get a key, PAT, or token for the CLI and add it to the agent's 1Password vault.** Generate the necessary credentials from the tool's dashboard or settings, then store them in [1Password](/docs/kiloclaw/tools/1password) so the agent can access them securely.

3. **Add the tool to `TOOLS.md`.** Navigate to the KiloClaw Dashboard (`app.kilo.ai/claw/settings`) > **Danger Zone** > **Edit Files** > `workspace` folder > `TOOLS.md`, and add the following to the bottom of the file:

   ```
   <TOOLNAME> is <1 sentence description>. You have access to it via the <CLI NAME> CLI. The username and password are in the 1Password vault under <TOOL NAME>.
   ```

4. **Prompt the agent to use the CLI.** Ask the agent to perform a task using the tool. 

## If There Is No CLI, but There Is an API

When the tool only provides an API (no CLI), follow these steps:

1. **Get an API key with proper scopes and add it to the agent's 1Password vault.** Generate an API key from the tool's developer settings with the appropriate permissions. Store the key along with any other API details (e.g. base URL, username) in [1Password](/docs/kiloclaw/tools/1password).

2. **Add the tool to `TOOLS.md`.** Navigate to the KiloClaw Dashboard (`app.kilo.ai/claw/settings`) > **Danger Zone** > **Edit Files** > workspace folder > `TOOLS.md`, and add the following to the bottom of the file:

   ```
   <TOOLNAME> is <1 sentence description>. You have access to it via the API. API documentation is at <URL OF API DOCUMENTATION>. Credentials are in 1Password under <TOOL NAME>.
   ```

3. **Prompt the agent to use the API.** Ask the agent to perform a task using the tool's API. It will read the documentation and credentials from the information you provided.

{% callout type="note" %}
If you have not configured your KiloClaw with the 1Password CLI, you can add the username in `TOOLS.md` and the key in the [KiloClaw Dashboard](app.kilo.ai/claw/settings) under **Additional Secrets** with the config path `skills.entries.<TOOL_NAME>.apiKey` and environment variable name `<TOOL_NAME>_API_KEY`. 

Change the TOOLS.md instruction to reference the correct Environment Variable.
{% /callout %}

## Improving performance

The instructions above will get your KiloClaw started with using the tool, but it will have to read the documentation every time and may fumble to use the CLI or API in question. 

As you use the CLI or API, instruct KiloClaw to do the following to make usage more reliable and less token-intensive:

* Save usage patterns to `TOOLS.md`
* Extract usage patterns into a skill
* Write a python or javascript wrapper for the CLI or API to encompass the ways you tend to use it
  
