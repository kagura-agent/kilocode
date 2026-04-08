# Review: packages/opencode/src/tool/

Upstream merge: OpenCode v1.2.25 into Kilo

Two main themes across these files:

1. **Branded ID types** — `Identifier.ascending("part")` / `Identifier.ascending("message")` replaced with `PartID.ascending()` / `MessageID.ascending()` etc. Same underlying logic, but IDs are now nominal types (`SessionID`, `MessageID`, `PartID`, `ToolID`, `ProviderID`, `ModelID`) via Effect `Schema.brand`. This is a cross-cutting type-safety improvement.
2. **Skill refactoring** — permission filtering and formatting logic moved from `skill.ts` (tool) into `Skill` module (`Skill.available()`, `Skill.fmt()`), reducing duplication and clarifying ownership.

---

## bash.ts

**Risk: LOW**

- Replaced Bun shell `$\`realpath ...\``invocation with`fs.realpath(path.resolve(cwd, arg))`. This removes a Bun-specific API call (`import { $ } from "bun"`) in favor of Node's `fs/promises` `realpath`.
- The new code does `path.resolve(cwd, arg)` first (pure JS), then `fs.realpath()` to resolve symlinks, with `.catch(() => "")` as the fallback — matching the previous `.nothrow()` + `.text()` + `.then(x => x.trim())` pattern.
- **No concerns.** This is a strict improvement: removes a subprocess spawn for each arg, works on non-Bun runtimes, and is functionally equivalent (`realpath` resolves symlinks the same way). The `catch(() => "")` preserves the no-throw behavior.

---

## batch.ts

**Risk: LOW**

- Replaced `Identifier.ascending("part")` (3 call sites) with `PartID.ascending()`.
- Replaced `Identifier` import with `PartID` from `../session/schema`.
- Added `ProviderID` / `ModelID` imports and used `ProviderID.make("")` / `ModelID.make("")` for the empty-string model stub passed to `ToolRegistry.tools()`.
- **No concerns.** Mechanical type migration. The runtime values produced are identical — branded wrappers call through to the same `Identifier.ascending` underneath.

---

## plan.ts

**Risk: LOW**

- Same branded-ID migration: `Identifier.ascending("message")` → `MessageID.ascending()`, `Identifier.ascending("part")` → `PartID.ascending()`.
- Function signature `getLastModel(sessionID: string)` → `getLastModel(sessionID: SessionID)` — tighter type contract.
- **No concerns.** Purely mechanical.

---

## registry.ts

**Risk: LOW**

- The `tools()` function parameter `model: { providerID: string; modelID: string }` is now `{ providerID: ProviderID; modelID: ModelID }`.
- This is a **breaking change for callers** that pass raw strings, but all callers in this PR have been updated (e.g., `batch.ts` now uses `ProviderID.make("")`).
- Import of `ProviderID` and `ModelID` from `../provider/schema` added.
- **Minor concern:** Any Kilo-specific code calling `ToolRegistry.tools()` with plain strings will fail to compile. Verify all call sites are updated (search for `ToolRegistry.tools` across the codebase).

---

## schema.ts (NEW FILE)

**Risk: LOW**

- New file introducing `ToolID` branded type using Effect `Schema.brand`.
- Provides `ToolID.make(id)`, `ToolID.ascending(id?)`, and `ToolID.zod` (Zod integration).
- Delegates to `Identifier.ascending("tool", id)` under the hood.
- **No concerns.** Clean addition following the same pattern as `SessionID`, `MessageID`, `PartID` in `session/schema.ts`.

---

## skill.ts

**Risk: MEDIUM**

- **Permission filtering logic removed** — was inline in `SkillTool.define()`, now delegated to `Skill.available(ctx?.agent)`. This is a Kilo-specific concern since permission filtering was a Kilo addition (`kilocode_change`).
- **Formatting logic removed** — the inline XML `<available_skills>` generation moved to `Skill.fmt(list, { verbose: false })`. Note: the tool now passes `verbose: false`, which means skills are rendered as markdown bullet points (`## Available Skills\n- **name**: description`) instead of the previous XML format with `<location>` tags. This is a **behavioral change** — the LLM prompt for the skill tool now gets a different format.
- The `BUILTIN` local constant was removed; references now use `Skill.BUILTIN_LOCATION` directly.
- `Skill.all()` return type apparently changed — `.then(x => Object.keys(x))` became `.then(x => x.map(skill => skill.name))`, indicating `all()` now returns an array of `Skill.Info` instead of a record/object. This is consistent with the new `Skill.available()` also returning an array.
- **Concerns:**
  - The switch from verbose XML to concise markdown for skill descriptions means the model no longer sees `<location>` in the skill listing. Verify this is intentional — the location info was previously available to the model.
  - The `kilocode_change` markers for the `pathToFileURL` guard have been moved into `Skill.fmt()` in the Skill module, which is good — but ensure the new location (`packages/opencode/src/skill/skill.ts`) is properly annotated. It is — confirmed in the Skill diff.

---

## task.ts

**Risk: LOW**

- `Identifier.ascending("message")` → `MessageID.ascending()`.
- `Session.get(params.task_id)` → `Session.get(SessionID.make(params.task_id))` — wraps the user-provided string in a branded type.
- **No concerns.** `params.task_id` is a user-provided string (from the Zod schema), so `SessionID.make()` is the correct conversion point.

---

## tool.ts

**Risk: LOW**

- `Tool.Context` type updated: `sessionID: string` → `sessionID: SessionID`, `messageID: string` → `messageID: MessageID`.
- This is the **foundational change** that all other files respond to. Every tool's `ctx` parameter now carries branded IDs.
- **Minor concern:** This is the most impactful type change since it affects every tool implementation. Any tool (including Kilo-specific tools) that accesses `ctx.sessionID` or `ctx.messageID` as `string` will need no code changes at runtime (branded types are structurally strings), but TypeScript may flag issues if they pass these to functions expecting plain `string`. Should be fine in practice since branded types are assignable to their base type.

---

## truncation.ts

**Risk: LOW**

- `Identifier.ascending("tool")` → `ToolID.ascending()` using the new `ToolID` from `./schema`.
- **No concerns.** Mechanical migration matching the new branded ID pattern.

---

## Summary

| File            | Risk   | Type of Change                                         |
| --------------- | ------ | ------------------------------------------------------ |
| `bash.ts`       | LOW    | Replace Bun shell `$` with `fs.realpath`               |
| `batch.ts`      | LOW    | Branded ID migration                                   |
| `plan.ts`       | LOW    | Branded ID migration                                   |
| `registry.ts`   | LOW    | Branded ID types in function signature                 |
| `schema.ts`     | LOW    | New file — `ToolID` branded type                       |
| `skill.ts`      | MEDIUM | Refactor: logic moved to `Skill` module, format change |
| `task.ts`       | LOW    | Branded ID migration                                   |
| `tool.ts`       | LOW    | Core `Context` type updated to branded IDs             |
| `truncation.ts` | LOW    | Branded ID migration                                   |

### Key Action Items

1. **Verify all `ToolRegistry.tools()` call sites** pass branded `ProviderID`/`ModelID` — not raw strings.
2. **Confirm the skill format change** (`verbose: false` → markdown bullets instead of XML) is intentional, as this changes what the LLM sees in system prompts.
3. **Check Kilo-specific tools** that use `ctx.sessionID` or `ctx.messageID` — they should be compatible since branded types extend `string`, but worth a quick `typecheck` pass.
