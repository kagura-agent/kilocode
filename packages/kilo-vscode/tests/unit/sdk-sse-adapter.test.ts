import { describe, expect, it } from "bun:test"
import {
  nextSSEReconnectDelay,
  SSE_RECONNECT_DELAY_MS,
  SSE_RECONNECT_MAX_DELAY_MS,
} from "../../src/services/cli-backend/sdk-sse-adapter"

describe("SdkSSEAdapter reconnect backoff", () => {
  it("starts with the legacy reconnect delay", () => {
    expect(SSE_RECONNECT_DELAY_MS).toBe(250)
  })

  it("doubles reconnect delays until capped", () => {
    expect(nextSSEReconnectDelay(250)).toBe(500)
    expect(nextSSEReconnectDelay(500)).toBe(1000)
    expect(nextSSEReconnectDelay(SSE_RECONNECT_MAX_DELAY_MS)).toBe(SSE_RECONNECT_MAX_DELAY_MS)
  })
})
