import { EventEmitter } from "events"

export const GlobalBus = new EventEmitter<{
  event: [
    {
      directory?: string
      payload: any
    },
  ]
}>()

// kilocode_change — cap listeners so leaked SSE connections produce a visible warning
GlobalBus.setMaxListeners(50)
