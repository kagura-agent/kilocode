import { describe, test, expect } from "bun:test"
import type { ParsedKey } from "@opentui/core"
import { Keybind } from "../../src/util/keybind"

/**
 * Mirrors the real match logic in `src/cli/cmd/tui/context/keybind.tsx:83-93`
 * so the Layer B intercept in `prompt/index.tsx` stays honest: given the user's
 * configured `input_newline` / `input_submit` strings, a `ParsedKey` is routed
 * to the expected binding. No mocks — parses real config, builds real events.
 */
function match(configValue: string, evt: ParsedKey): boolean {
  const list = Keybind.parse(configValue)
  if (!list.length) return false
  const parsed = Keybind.fromParsedKey(evt)
  for (const item of list) {
    if (Keybind.match(item, parsed)) return true
  }
  return false
}

function key(overrides: Partial<ParsedKey> = {}): ParsedKey {
  return {
    name: "",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press",
    source: "raw",
    ...overrides,
  }
}

const NEWLINE_DEFAULT = "shift+return,ctrl+return,alt+return,ctrl+j"
const SUBMIT_DEFAULT = "return"

describe("Layer B: input_newline vs input_submit routing", () => {
  test("Shift+Return matches input_newline, not input_submit", () => {
    const evt = key({ name: "return", shift: true })
    expect(match(NEWLINE_DEFAULT, evt)).toBe(true)
    expect(match(SUBMIT_DEFAULT, evt)).toBe(false)
  })

  test("plain Return matches input_submit, not input_newline", () => {
    const evt = key({ name: "return" })
    expect(match(SUBMIT_DEFAULT, evt)).toBe(true)
    expect(match(NEWLINE_DEFAULT, evt)).toBe(false)
  })

  test("Ctrl+J matches input_newline (terminal-agnostic fallback)", () => {
    const evt = key({ name: "j", ctrl: true })
    expect(match(NEWLINE_DEFAULT, evt)).toBe(true)
    expect(match(SUBMIT_DEFAULT, evt)).toBe(false)
  })

  test("Alt+Return (meta) matches input_newline", () => {
    const evt = key({ name: "return", meta: true })
    expect(match(NEWLINE_DEFAULT, evt)).toBe(true)
    expect(match(SUBMIT_DEFAULT, evt)).toBe(false)
  })

  test("Ctrl+Return matches input_newline", () => {
    const evt = key({ name: "return", ctrl: true })
    expect(match(NEWLINE_DEFAULT, evt)).toBe(true)
    expect(match(SUBMIT_DEFAULT, evt)).toBe(false)
  })

  test('config override: input_newline="none" disables newline match', () => {
    const evt = key({ name: "return", shift: true })
    expect(match("none", evt)).toBe(false)
  })

  test('config override: input_newline="return" flips defaults', () => {
    const evt = key({ name: "return" })
    expect(match("return", evt)).toBe(true)
  })

  test("Shift+Return does not accidentally match plain Return submit", () => {
    // Belt-and-braces: verifies Keybind.match compares all modifier flags exactly.
    const evt = key({ name: "return", shift: true })
    expect(match("return", evt)).toBe(false)
  })

  test("unrelated keys with the same modifiers don't match input_newline", () => {
    // Sanity check: Keybind.match compares `name` exactly, so Shift+A (or any
    // other key sharing a modifier with a newline entry) must not route to the
    // Layer B intercept.
    const evt = key({ name: "a", shift: true })
    expect(match(NEWLINE_DEFAULT, evt)).toBe(false)
  })
})
