# Plan Mode vs Architect Mode: Analysis and Recommendation

**Issue:** [#8259](https://github.com/Kilo-Org/kilocode/issues/8259)
**Status:** Analysis complete

## Context

Users report that Plan mode and old Architect mode are not equivalent. This document compares the two modes based on actual code, prompts, and configuration.

## Structural Comparison

| Aspect              | Old Architect (v5.x extension)                                                                                                  | Current Plan (CLI-based)                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/persona    | Custom role: "experienced technical leader who is inquisitive and an excellent planner" (`native-mode-defaults.ts:29-30`)       | No custom persona — inherits base system prompt with plan-mode system reminders appended (`prompt.ts:1422-1437`)                                |
| System prompt       | `roleDefinition` + `customInstructions` with a 7-step collaborative workflow                                                    | Injected as `<system-reminder>` block from `plan.txt` (25 lines) or the experimental 5-phase workflow (`prompt.ts:1487-1556`)                   |
| Planning output     | Primary artifact: todo list via `update_todo_list` tool, with fallback to any `.md` file; framed as collaborative brainstorming | Primary artifact: single plan markdown file at `.kilo/plans/<timestamp>-<slug>.md` (`session/index.ts:378-383`); structured as a gated workflow |
| Edit scope          | Any `.md` file anywhere in the project (regex: `\.md$`)                                                                         | Only `.kilo/plans/*.md` or `.opencode/plans/*.md` (`agent.ts:237-241`)                                                                          |
| Shell/command       | No `command` group — cannot run any terminal commands                                                                           | Inherits default bash permissions — can run read-only shell commands (prompt-steered, not permission-gated)                                     |
| Browser/web         | Explicit `browser` group                                                                                                        | Inherits defaults for `webfetch`, `websearch`, `codesearch`                                                                                     |
| MCP tools           | Explicit `mcp` group                                                                                                            | Inherits defaults (MCP available if configured)                                                                                                 |
| Mode switching      | `switch_mode` tool to request transition to Code/Debug                                                                          | `plan_exit` tool + `PlanFollowup.ask()` flow with 3 options (`plan-followup.ts:219-256`)                                                        |
| Collaboration style | "Brainstorming session where you can discuss the task and refine the todo list"                                                 | Gated workflow: explore → design → review → write plan → exit                                                                                   |
| Diagrams            | Explicitly encouraged: "Include Mermaid diagrams"                                                                               | Not mentioned in any plan prompt                                                                                                                |
| Time estimates      | Explicitly forbidden                                                                                                            | No such restriction                                                                                                                             |

## Key Behavioral Differences

### Conversational vs Procedural

Architect emphasized iterative refinement: "Ask the user if they are pleased with this plan, or if they would like to make any changes." Plan mode imposes a structured pipeline (explore → design → review → finalize → exit) with less room for organic conversation.

### Multiple Artifacts vs Single File

Architect could edit ANY `.md` file, enabling architecture docs, API specs, README drafts, etc. Plan mode restricts edits to a single plan file in `.kilo/plans/`. This is the most commonly reported difference.

### Todo Lists vs Prose Plans

Architect's primary planning artifact was a structured todo list (`update_todo_list` tool). Plan mode writes a prose plan in markdown. Todo lists are better for implementation tracking; prose plans capture context and design rationale.

### Shell Access

Plan mode inherits bash permissions (prompt-steered read-only). Architect had no `command` group at all. Plan mode can run `git log`, `ls`, etc. for research — more useful but less restrictive.

### Handoff Mechanism

Plan mode's `plan_exit` → `PlanFollowup.ask()` flow is a significant improvement. It generates a handover summary, transfers todos, and lets users choose between a fresh session or continuing in-place. Architect just had `switch_mode` with no structured handoff.

## Recommendation

**Enhance Plan mode rather than reintroducing Architect as a separate mode.**

### Rationale

- The underlying capability set is nearly identical — two modes with subtle prompt differences would confuse users.
- Migration already maps `architect → plan`. Reintroducing Architect creates ambiguity.
- Plan mode's `plan_exit` → handoff flow is strictly superior to Architect's `switch_mode`.
- Plan mode's permission model and subagent delegation are more sophisticated.

### Proposed Enhancements

1. **Widen edit scope to all `.md` files** — Change `agent.ts:237-241` from `.kilo/plans/*.md` to any `*.md`. Restores Architect's ability to create architecture docs while keeping source code protected.

2. **Add a collaborative persona to the plan prompt** — Inject Architect's role framing ("experienced technical leader", "brainstorming session") into `plan.txt`.

3. **Mention Mermaid diagrams** — Add encouragement for visual architecture diagrams in the plan prompt.

4. **Make the workflow less rigid** — The experimental 5-phase prompt is too prescriptive for simple tasks. Consider adaptive prompting based on task complexity.

5. **Add plan export** — Per the existing proposal in `architect-mode-plan-files.md`, let users save plans to a visible location outside `.kilo/`.

6. **Integrate todo lists more prominently** — The `todowrite` tool is available but not mentioned in plan prompts. Architect's emphasis on structured todo lists was valuable.

## Advantages and Disadvantages

### Plan Mode

**Advantages:**

- Structured `plan_exit` → handoff flow with handover summary generation
- Bash access for read-only research (git log, file inspection)
- Subagent delegation (explore, general) for parallel research
- Persistent plan files with session-linked naming
- Permission-based edit restrictions

**Disadvantages:**

- No distinct persona — feels procedural rather than collaborative
- Overly narrow edit scope (only plan files, not general `.md`)
- No mention of Mermaid diagrams
- Rigid 5-phase workflow in experimental mode; too simple in non-experimental mode
- Bash restriction is prompt-steered, not permission-gated
- Known over-prompting issue (#6143)

### Old Architect Mode

**Advantages:**

- Strong collaborative identity and brainstorming framing
- Flexible `.md` editing anywhere in the project
- Todo-list-centric planning
- Explicit Mermaid diagram encouragement
- Simpler mental model: "design partner" rather than "planning pipeline"

**Disadvantages:**

- No structured handoff mechanism
- No subagent delegation
- No bash access at all
- No persistent plan file storage
- Less granular permission model
