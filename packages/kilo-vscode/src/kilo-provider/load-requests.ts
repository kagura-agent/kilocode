type Handler = () => void

export function handleLoadRequest(type: unknown, handlers: Record<string, Handler>): boolean {
  if (typeof type !== "string") return false
  const handler = handlers[type]
  if (!handler) return false
  handler()
  return true
}
