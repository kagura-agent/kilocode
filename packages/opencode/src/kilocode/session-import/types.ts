import z from "zod"

export namespace SessionImportType {
  export const Result = z.object({
    ok: z.boolean(),
    id: z.string(),
  })

  export const Project = z.object({
    id: z.string(),
    worktree: z.string(),
    vcs: z.string().optional(),
    name: z.string().optional(),
    iconUrl: z.string().optional(),
    iconColor: z.string().optional(),
    timeCreated: z.number(),
    timeUpdated: z.number(),
    timeInitialized: z.number().optional(),
    sandboxes: z.array(z.string()),
    commands: z
      .object({
        start: z.string().optional(),
      })
      .optional(),
  })

  export const Session = z.object({
    id: z.string(),
    projectID: z.string(),
    workspaceID: z.string().optional(),
    parentID: z.string().optional(),
    slug: z.string(),
    directory: z.string(),
    title: z.string(),
    version: z.string(),
    shareURL: z.string().optional(),
    summary: z
      .object({
        additions: z.number(),
        deletions: z.number(),
        files: z.number(),
        diffs: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .optional(),
    revert: z
      .object({
        messageID: z.string(),
        partID: z.string().optional(),
        snapshot: z.string().optional(),
        diff: z.string().optional(),
      })
      .optional(),
    permission: z.record(z.string(), z.unknown()).optional(),
    timeCreated: z.number(),
    timeUpdated: z.number(),
    timeCompacting: z.number().optional(),
    timeArchived: z.number().optional(),
  })

  export const Message = z.object({
    id: z.string(),
    sessionID: z.string(),
    timeCreated: z.number(),
    data: z.record(z.string(), z.unknown()),
  })

  export const Part = z.object({
    id: z.string(),
    messageID: z.string(),
    sessionID: z.string(),
    timeCreated: z.number().optional(),
    data: z.record(z.string(), z.unknown()),
  })

  export type Result = z.infer<typeof Result>
  export type Project = z.infer<typeof Project>
  export type Session = z.infer<typeof Session>
  export type Message = z.infer<typeof Message>
  export type Part = z.infer<typeof Part>
}
