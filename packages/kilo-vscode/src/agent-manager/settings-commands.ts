import type { WorktreeStateManager } from "./WorktreeStateManager"
import type { WorktreeManager } from "./WorktreeManager"
import { normalizeBaseBranch } from "./base-branch"

/** Minimal context needed by settings commands — avoids importing the full provider. */
export interface SettingsContext {
  stateReady: Promise<void> | undefined
  state: WorktreeStateManager | undefined
  getStateManager(): WorktreeStateManager | undefined
  getWorktreeManager(): WorktreeManager | undefined
  pushState(): void
}

async function ensure(ctx: SettingsContext): Promise<WorktreeStateManager | undefined> {
  if (ctx.stateReady) {
    await ctx.stateReady.catch(() => {})
    if (ctx.state) return ctx.state
  }
  const state = ctx.getStateManager()
  if (!state) return undefined
  await state.load()
  return state
}

export async function getDefaultBaseBranch(ctx: SettingsContext): Promise<string | undefined> {
  const state = await ensure(ctx)
  return state?.getDefaultBaseBranch()
}

export async function setDefaultBaseBranch(ctx: SettingsContext, value: string | undefined): Promise<void> {
  const state = await ensure(ctx)
  if (!state) return
  state.setDefaultBaseBranch(normalizeBaseBranch(value))
  ctx.pushState()
}

export async function getReviewDiffStyle(ctx: SettingsContext): Promise<"unified" | "split"> {
  const state = await ensure(ctx)
  return state?.getReviewDiffStyle() ?? "unified"
}

export async function setReviewDiffStyle(ctx: SettingsContext, value: "unified" | "split"): Promise<void> {
  const state = await ensure(ctx)
  if (!state) return
  state.setReviewDiffStyle(value)
  ctx.pushState()
}

export async function getBranches(ctx: SettingsContext): Promise<{
  branches: Array<{ name: string; isLocal: boolean; isRemote: boolean; isDefault: boolean; lastCommitDate?: string }>
  defaultBranch: string
}> {
  const manager = ctx.getWorktreeManager()
  if (!manager) return { branches: [], defaultBranch: "main" }
  const result = await manager.listBranches()
  return { branches: result.branches, defaultBranch: result.defaultBranch }
}
