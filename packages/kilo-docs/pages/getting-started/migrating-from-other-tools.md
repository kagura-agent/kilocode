---
title: "Migrating from Other Tools"
description: "Guide for migrating to Kilo Code from Claude Code, GitHub Copilot, and other AI coding tools"
---

# Migrating from Other Tools

This guide covers migrating to Kilo Code from AI coding tools not covered in our dedicated [Cursor/Windsurf](/docs/getting-started/migrating) or [Cline](/docs/getting-started/switching-from-cline) guides. If you're coming from one of those tools, start there instead.

---

## Migrating from Claude Code

Claude Code users can get started with Kilo quickly. Kilo supports loading your existing `CLAUDE.md` instructions and `.claude/skills/` directories, so you can preserve your setup while gaining access to Kilo's multi-mode system, 500+ model options, and platform features.

### Claude Code Compatibility Toggle

Kilo includes a **Claude Code Compatibility** setting that controls whether your `CLAUDE.md` instructions and Claude Code skills are loaded into Kilo sessions. This is disabled by default to keep sessions clean, but you can enable it to reuse your existing Claude Code configuration.

#### What it does

When enabled, Kilo loads:

- **`CLAUDE.md` files** from your project root and `~/.claude/CLAUDE.md` from your home directory into the system prompt for every session
- **Skills** from `.claude/skills/` directories (both project-level and global)

When disabled (the default), these files are ignored and only Kilo-native configuration (`.kilo/`, `AGENTS.md`, etc.) is used.

#### Enabling in VS Code

1. Open the Kilo settings panel (gear icon)
2. Navigate to **Agent Behaviour > Rules**
3. Find the **Claude Code Compatibility** section
4. Toggle **Load Claude Code Files** on
5. Restart the extension for changes to take effect

{% callout type="info" %}
The toggle requires an extension restart to take effect. After enabling it, restart VS Code or reload the window (`Cmd+Shift+P` / `Ctrl+Shift+P` > "Developer: Reload Window").
{% /callout %}

#### Enabling in the CLI

Set the environment variable before running Kilo:

```bash
# Enable Claude Code compatibility (load CLAUDE.md and skills)
kilo

# Disable explicitly (this is the default)
KILO_DISABLE_CLAUDE_CODE=true kilo
```

In the CLI, Claude Code files are loaded by default unless `KILO_DISABLE_CLAUDE_CODE=true` is set. The VS Code extension sets this variable automatically based on the toggle.

{% callout type="tip" %}
You can also control the two components independently:

- `KILO_DISABLE_CLAUDE_CODE_PROMPT=true` — skip `CLAUDE.md` files only
- `KILO_DISABLE_CLAUDE_CODE_SKILLS=true` — skip `.claude/skills/` only
  {% /callout %}

### Migrating Your Configuration

If you prefer to fully migrate rather than use the compatibility toggle, convert your Claude Code configuration to Kilo's native format:

**1. Convert `CLAUDE.md` to `AGENTS.md`:**

Kilo natively supports `AGENTS.md` (and loads it automatically). Copy the contents of your `CLAUDE.md` into an `AGENTS.md` file at your project root:

```bash
cp CLAUDE.md AGENTS.md
```

Both files use plain Markdown, so no format conversion is needed. If you also have a global `~/.claude/CLAUDE.md`, move its contents to your Kilo config directory:

```bash
mkdir -p ~/.config/kilo
cp ~/.claude/CLAUDE.md ~/.config/kilo/AGENTS.md
```

**2. Convert skills to Kilo skills:**

Claude Code skills in `.claude/skills/` can be moved to `.kilo/skills/`:

```bash
mkdir -p .kilo/skills
cp -r .claude/skills/* .kilo/skills/
```

Kilo skills follow a similar structure. See [Skills](/docs/customize/skills) for the full format.

**3. Convert custom rules:**

If you have project-specific rules, place them in `.kilocode/rules/`:

```bash
mkdir -p .kilocode/rules
# Move any rule content from CLAUDE.md sections into separate rule files
```

### Feature Comparison

| Claude Code                             | Kilo Code                             | Notes                                                |
| --------------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Single agent                            | Five specialized modes                | Code, Ask, Debug, Architect, Orchestrator            |
| `CLAUDE.md` instructions                | `AGENTS.md` + `.kilocode/rules/`      | Kilo also reads `CLAUDE.md` with compat toggle       |
| `.claude/skills/`                       | `.kilo/skills/`                       | Kilo also reads Claude skills with compat toggle     |
| Claude models only                      | 500+ models from any provider         | Anthropic, OpenAI, Google, local models, and more    |
| Terminal-based                          | VS Code, JetBrains, CLI, Web          | Work from any interface, sessions sync automatically |
| `/` slash commands                      | Mode dropdown + slash commands        | Modes provide structured workflows                   |
| `claude --dangerously-skip-permissions` | Auto-approve settings per action type | Granular control over what runs without confirmation |
| Single conversation                     | Parallel agents                       | Run multiple agents simultaneously without conflicts |

---

## Migrating from GitHub Copilot

GitHub Copilot focuses on inline completions and chat. Kilo provides both inline completions (Ghost) and a full agentic workflow.

### Key Differences

| GitHub Copilot                    | Kilo Code                        | Notes                                              |
| --------------------------------- | -------------------------------- | -------------------------------------------------- |
| Inline completions                | Ghost (inline completions)       | Enable in Settings > Ghost                         |
| Copilot Chat                      | Five specialized modes           | More structured than a single chat                 |
| `.github/copilot-instructions.md` | `.kilocode/rules/` + `AGENTS.md` | More flexible rule system with mode-specific rules |
| GitHub-only models                | 500+ models from any provider    | Bring your own keys or use Kilo Gateway            |
| GitHub integration only           | Multi-platform                   | VS Code, JetBrains, CLI, Web                       |

### Migration Steps

**1. Migrate instructions:**

If you have a `.github/copilot-instructions.md` file, copy its contents to Kilo's rules:

```bash
mkdir -p .kilocode/rules
cp .github/copilot-instructions.md .kilocode/rules/project-instructions.md
```

**2. Enable Ghost for inline completions:**

If you rely on Copilot's inline suggestions, enable Kilo's Ghost feature:

1. Open Settings (gear icon)
2. Navigate to the Ghost section
3. Enable Ghost autocomplete
4. Configure your preferred model

**3. Use modes for chat workflows:**

Replace Copilot Chat with Kilo's mode system:

- **Ask mode** for questions about code (replaces `@workspace` queries)
- **Code mode** for generating implementations
- **Debug mode** for troubleshooting errors

---

## Migrating from Aider

Aider is a terminal-based AI coding assistant. Kilo's CLI provides a similar terminal experience with additional capabilities.

### Key Differences

| Aider                | Kilo Code                        | Notes                                     |
| -------------------- | -------------------------------- | ----------------------------------------- |
| Terminal UI          | Terminal UI + VS Code + Web      | Same agent, multiple interfaces           |
| `.aider.conf.yml`    | `kilo.json` + `.kilocode/rules/` | Configuration via JSON and Markdown rules |
| Git-centric workflow | Git-aware with checkpoints       | Automatic session saving and checkpoints  |
| BYOK only            | BYOK or Kilo Gateway             | Use your keys or Kilo's managed gateway   |
| Single conversation  | Parallel agents + Orchestrator   | Run multiple tasks simultaneously         |

### Migration Steps

**1. Install the CLI:**

```bash
npm install -g @kilocode/cli
kilo
```

**2. Migrate configuration:**

Convert `.aider.conf.yml` settings to `kilo.json` at your project root. Key mappings:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

**3. Migrate instructions:**

If you use `.aider.instructions.md` or similar convention files, move them to:

```bash
mkdir -p .kilocode/rules
cp .aider.instructions.md .kilocode/rules/project-instructions.md
```

---

## General Migration Tips

### AGENTS.md Works Everywhere

If your project already has an `AGENTS.md` file (increasingly common across AI coding tools), Kilo loads it automatically. No migration needed for this file.

```bash
# Verify it exists
ls AGENTS.md

# Kilo loads it by default — nothing else to do
```

### Start with What You Have

You don't need to migrate everything at once:

1. **Install Kilo** in your preferred environment
2. **Enable compatibility toggles** for your previous tool (e.g., Claude Code compatibility)
3. **Start using Kilo** with your existing configuration
4. **Gradually migrate** configuration files to Kilo-native formats as you discover Kilo-specific features you want to use

### Choosing Your Workflow

Kilo supports two complementary approaches:

- **Ghost (Autocomplete):** Tab-to-accept inline suggestions, similar to Copilot or Cursor's autocomplete. Enable in Settings > Ghost.
- **Chat-driven modes:** Describe what you want in the chat panel. Five specialized modes give you more control than a single chat interface.

Most developers combine both approaches for different situations.

---

## Next Steps

- [Quickstart guide](/docs/getting-started/quickstart) — Get up and running in minutes
- [Custom Rules](/docs/customize/custom-rules) — Configure rules for your project
- [Skills](/docs/customize/skills) — Create and manage skills
- [Custom Modes](/docs/customize/custom-modes) — Define specialized workflows
- [Join our Discord](https://kilo.ai/discord) — Get migration help from the community
