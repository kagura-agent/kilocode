---
title: "Setting Up Other Tools"
description: "Configure your KiloClaw agent to use third-party tools that aren't pre-installed"
---

# Setting Up Other Tools

While KiloClaw comes with a set of [pre-configured tool integrations](/docs/kiloclaw/tools), your agent isn't limited to just those. KiloClaw can be configured to use virtually any third-party tool — as long as it has a CLI or an API, you can teach your agent to work with it.

## If There Is a CLI

When the tool you want to integrate provides a command-line interface, follow these steps:

1. **Install the CLI.** Install the tool's CLI on your KiloClaw instance. You can do this by prompting your agent to run the appropriate install command, or by using the KiloClaw Dashboard to execute it directly.

2. **Tell KiloClaw to install the CLI.** Prompt the agent to install the CLI so it's available in the agent's environment. For example: _"Install the Fly.io CLI."_

3. **Get a key, PAT, or token for the CLI and add it to the agent's 1Password vault.** Generate the necessary credentials from the tool's dashboard or settings, then store them in [1Password](/docs/kiloclaw/tools/1password) so the agent can access them securely.

4. **Add the tool to `TOOLS.md`.** Navigate to the KiloClaw Dashboard (`app.kilo.ai/claw/settings`) > **Danger Zone** > **Edit Files** > workspace folder > `TOOLS.md`, and add the following to the bottom of the file:

   ```
   <TOOLNAME> is <1 sentence description>. You have access to it via the <CLI NAME> CLI. The username and password are in the 1Password vault under <TOOL NAME>.
   ```

5. **Prompt the agent to use the CLI.** Ask the agent to perform a task using the tool. As it learns how to use the CLI, instruct it to save any usage details, flags, or workflow notes back to `TOOLS.md` for future reference.

## If There Is No CLI, but There Is an API

When the tool only provides an API (no CLI), follow these steps:

1. **Get an API key with proper scopes and add it to the agent's 1Password vault.** Generate an API key from the tool's developer settings with the appropriate permissions. Store the key along with any other API details (e.g. base URL, username) in [1Password](/docs/kiloclaw/tools/1password).

2. **Add the tool to `TOOLS.md`.** Navigate to the KiloClaw Dashboard (`app.kilo.ai/claw/settings`) > **Danger Zone** > **Edit Files** > workspace folder > `TOOLS.md`, and add the following to the bottom of the file:

   ```
   <TOOLNAME> is <1 sentence description>. You have access to it via the API. API documentation is at <URL OF API DOCUMENTATION>. Credentials are in 1Password under <TOOL NAME>.
   ```

3. **Prompt the agent to use the API.** Ask the agent to perform a task using the tool's API. It will read the documentation and credentials from the information you provided.
