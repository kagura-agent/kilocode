import { describe, expect, test } from "bun:test"
import { SessionSummary } from "../../src/session/summary"
import type { Snapshot } from "../../src/snapshot"

describe("session summary diffs", () => {
  test("slim strips file contents and normalizes file paths", () => {
    const diffs: Snapshot.FileDiff[] = [
      {
        file: '"src/space\\040name.ts"',
        before: "old content",
        after: "new content",
        additions: 2,
        deletions: 1,
        status: "modified",
      },
    ]

    const result = SessionSummary.slim(diffs)

    expect(result).toEqual([
      {
        file: "src/space name.ts",
        before: "",
        after: "",
        additions: 2,
        deletions: 1,
        status: "modified",
      },
    ])
    expect(diffs[0]!.file).toBe('"src/space\\040name.ts"')
    expect(diffs[0]!.before).toBe("old content")
    expect(diffs[0]!.after).toBe("new content")
  })
})
