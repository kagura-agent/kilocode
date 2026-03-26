import type { WorktreeStateManager } from "./WorktreeStateManager"

export function snapshot(state?: WorktreeStateManager, active?: number): Record<string, unknown> {
  const sessions = state?.getSessions() ?? []
  const worktree = sessions.filter((item) => item.worktreeId !== null).length
  const local = sessions.length - worktree
  return {
    managedSessionCount: sessions.length,
    localSessionCount: local,
    worktreeSessionCount: worktree,
    worktreeCount: state?.getWorktrees().length ?? 0,
    ...(active === undefined ? {} : { activeSessionCount: active }),
  }
}
