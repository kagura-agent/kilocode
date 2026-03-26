/**
 * SessionTerminalManager tests.
 *
 * The class is tightly coupled to VS Code terminal APIs. We use ts-morph
 * static analysis to verify structural invariants that protect against
 * real regressions — focusing on ordering constraints and cleanup logic
 * that are easy to break during refactoring.
 */

import { describe, it, expect } from "bun:test"
import path from "node:path"
import { Project, SyntaxKind } from "ts-morph"

const ROOT = path.resolve(import.meta.dir, "../..")
const FILE = path.join(ROOT, "src/agent-manager/SessionTerminalManager.ts")

function getClass() {
  const project = new Project({ compilerOptions: { allowJs: true } })
  const source = project.addSourceFileAtPath(FILE)
  return source.getFirstDescendantByKind(SyntaxKind.ClassDeclaration)!
}

function body(name: string): string {
  const cls = getClass()
  const method = cls.getMethod(name)
  expect(method, `method ${name} not found in SessionTerminalManager`).toBeTruthy()
  return method!.getText()
}

describe("SessionTerminalManager structure", () => {
  it("constructor registers both terminal lifecycle listeners", () => {
    const cls = getClass()
    const ctor = cls.getConstructors()[0]
    expect(ctor).toBeTruthy()
    const text = ctor!.getText()
    // Both listeners are required: close (cleanup) and active-change (context key)
    expect(text).toContain("onTerminalClosed")
    expect(text).toContain("onActiveTerminalChanged")
  })

  it("dispose clears the context key, disposes terminals, and clears the groups", () => {
    const text = body("dispose")
    // All three are required for clean shutdown — missing any would leak resources
    expect(text).toContain("kilo-code.agentTerminalFocus")
    expect(text).toContain("handle.dispose()")
    expect(text).toContain("groups.clear()")
  })

  it("showTerminal resolves CWD from worktree with repo fallback", () => {
    const text = body("showTerminal")
    // The fallback chain must be worktreePath ?? repoPath, not the reverse.
    // Getting this wrong would run agents in the wrong directory.
    expect(text).toContain("worktreePath ?? repoPath")
  })

  /**
   * Regression: addTerminalToGroup must check exit status before adding.
   * cleanExited is called at the start to remove stale terminals.
   */
  it("addTerminalToGroup cleans exited terminals before adding new ones", () => {
    const text = body("addTerminalToGroup")
    const cleanIdx = text.indexOf("cleanExited")
    const createIdx = text.indexOf("createTerminal")
    expect(cleanIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(cleanIdx, "clean check must come before create").toBeLessThan(createIdx)
  })

  it("addTerminalToGroup updates context key after showing terminal", () => {
    const text = body("addTerminalToGroup")
    const showIdx = text.lastIndexOf("target.handle.show")
    const contextIdx = text.lastIndexOf("this.updateContextKey()")
    expect(showIdx).toBeGreaterThan(-1)
    expect(contextIdx).toBeGreaterThan(-1)
    expect(showIdx, "show must precede updateContextKey").toBeLessThan(contextIdx)
  })

  it("syncOnSessionSwitch only switches when panel is open", () => {
    const text = body("syncOnSessionSwitch")
    expect(text).toContain("if (!this.panelOpen)")
    expect(text).toContain("this.showExisting(sessionId)")
  })

  it("syncLocalOnSessionSwitch only switches when panel is open", () => {
    const text = body("syncLocalOnSessionSwitch")
    expect(text).toContain("if (!this.panelOpen)")
    expect(text).toContain("this.showExistingLocal()")
  })

  it("createSplitTerminal uses parent terminal for grouping", () => {
    const text = body("addTerminalToGroup")
    expect(text).toContain("createSplitTerminal")
    expect(text).toContain("parent: parent.handle")
  })

  it("tracks last-focused terminal in onActiveTerminalChanged", () => {
    const cls = getClass()
    const ctor = cls.getConstructors()[0]
    expect(ctor).toBeTruthy()
    const text = ctor!.getText()
    expect(text).toContain("group.focused = idx")
  })
})
