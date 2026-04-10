import type { Command } from "@/command"
import { Review } from "./review"

/**
 * /local-review-uncommitted - local review (uncommitted changes)
 */
export function localReviewUncommittedCommand(): Command.Info {
  return {
    name: "local-review-uncommitted",
    description: "local review (uncommitted changes)",
    get template() {
      return Review.buildReviewPromptUncommitted()
    },
    hints: [],
  }
}

/**
 * /local-review - local review (current branch vs base)
 * Accepts an optional base branch argument: /local-review origin/develop
 */
export function localReviewCommand(): Command.Info {
  return {
    name: "local-review",
    description: "local review (current branch) [base-branch]",
    get template() {
      return Review.buildReviewPromptBranch()
    },
    build(args: string) {
      const branch = args.trim() || undefined
      return Review.buildReviewPromptBranch(branch)
    },
    hints: ["$ARGUMENTS"],
  }
}
