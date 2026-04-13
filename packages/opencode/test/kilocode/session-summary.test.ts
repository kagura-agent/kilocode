import { describe, expect, test } from "bun:test"
import { SessionSummary } from "../../src/session/summary"
import type { Snapshot } from "../../src/snapshot"

describe("session summary diffs", () => {
  test("slim strips file contents but keeps stats", () => {
    const diffs: Snapshot.FileDiff[] = [
      {
        file: "src/app.ts",
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
        file: "src/app.ts",
        before: "",
        after: "",
        additions: 2,
        deletions: 1,
        status: "modified",
      },
    ])
    expect(diffs[0]!.before).toBe("old content")
    expect(diffs[0]!.after).toBe("new content")
  })
})
