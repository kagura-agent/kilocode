import { GitOps } from "../agent-manager/GitOps"
import { resolveLocalDiffTarget } from "../review-utils"

export async function resolveGitChangesTarget(message: Record<string, unknown>, dir: string) {
  if (message.type !== "requestGitChangesContext") return message
  if (typeof message.contextDirectory === "string" || typeof message.gitChangesBase === "string") return message

  const git = new GitOps({ log: () => undefined })
  try {
    const target = await resolveLocalDiffTarget(git, () => undefined, dir)
    if (!target) return { ...message, contextDirectory: dir }
    return { ...message, contextDirectory: target.directory, gitChangesBase: target.baseBranch }
  } finally {
    git.dispose()
  }
}
