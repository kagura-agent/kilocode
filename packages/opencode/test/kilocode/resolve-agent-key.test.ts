import { test, expect } from "bun:test"
import { resolveAgentKey, resolveKey } from "../../src/kilocode/agent"

const agents = {
  code: { name: "code" },
  jarvis: { name: "Jarvis" },
  "my-agent": { name: "My Custom Agent" },
  plan: { name: "plan" },
}

test("resolveKey maps build to code", () => {
  expect(resolveKey("build")).toBe("code")
  expect(resolveKey("plan")).toBe("plan")
})

test("resolveAgentKey returns exact slug match", () => {
  expect(resolveAgentKey("code", agents)).toBe("code")
  expect(resolveAgentKey("jarvis", agents)).toBe("jarvis")
})

test("resolveAgentKey handles build→code mapping", () => {
  expect(resolveAgentKey("build", agents)).toBe("code")
})

test("resolveAgentKey resolves case-insensitive slug", () => {
  expect(resolveAgentKey("Jarvis", agents)).toBe("jarvis")
  expect(resolveAgentKey("JARVIS", agents)).toBe("jarvis")
  expect(resolveAgentKey("Plan", agents)).toBe("plan")
})

test("resolveAgentKey resolves by display name", () => {
  expect(resolveAgentKey("My Custom Agent", agents)).toBe("my-agent")
})

test("resolveAgentKey returns input when no match found", () => {
  expect(resolveAgentKey("nonexistent", agents)).toBe("nonexistent")
})
