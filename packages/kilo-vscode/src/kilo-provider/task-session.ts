type Meta = { sessionId?: string }

type State = {
  metadata?: Meta
  input?: Record<string, unknown>
  title?: string
  status?: string
}

type TaskPart = {
  type?: string
  tool?: string
  metadata?: Meta
  state?: State
}

export function childID(part: TaskPart): string | undefined {
  if (part.type !== "tool" || part.tool !== "task") return undefined
  return part.metadata?.sessionId ?? part.state?.metadata?.sessionId
}
