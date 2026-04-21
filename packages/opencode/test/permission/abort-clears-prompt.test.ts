import { describe, expect } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { Bus } from "../../src/bus"
import { Permission } from "../../src/permission"
import { SessionID } from "../../src/session/schema"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const bus = Bus.layer
const env = Layer.mergeAll(Permission.layer.pipe(Layer.provide(bus)), bus, CrossSpawnSpawner.defaultLayer)
const { effect: it, live } = testEffect(env)

const ask = (input: Parameters<Permission.Interface["ask"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.ask(input)
  })

const reply = (input: Parameters<Permission.Interface["reply"]>[0]) =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.reply(input)
  })

const list = () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    return yield* permission.list()
  })

describe("Permission abort", () => {
  live("publishes Replied event when ask fiber is interrupted", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessionID = SessionID.make("session_test")
        const b = yield* Bus.Service

        const replied: string[] = []
        yield* b.subscribeCallback(Permission.Event.Replied, (evt: any) => {
          replied.push(evt.properties.requestID as string)
        })

        const fiber = yield* ask({
          sessionID,
          permission: "bash",
          patterns: ["*"],
          ruleset: [],
          metadata: {},
          always: [],
        }).pipe(Effect.forkScoped)

        yield* Effect.gen(function* () {
          let pending = yield* list()
          while (pending.length === 0) {
            yield* Effect.sleep("10 millis")
            pending = yield* list()
          }
          expect(pending).toHaveLength(1)
        })

        // Interrupt the fiber (simulating session abort)
        yield* Fiber.interrupt(fiber)
        yield* Effect.sleep("100 millis")

        // Permission should be cleared from pending
        const remaining = yield* list()
        expect(remaining).toHaveLength(0)

        // Replied event should have been published so the TUI clears the prompt
        expect(replied).toHaveLength(1)
      }),
    ),
  )

  live("does not double-publish Replied event on normal reply", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessionID = SessionID.make("session_test")
        const b = yield* Bus.Service

        const replied: string[] = []
        yield* b.subscribeCallback(Permission.Event.Replied, (evt: any) => {
          replied.push(evt.properties.requestID as string)
        })

        const fiber = yield* ask({
          sessionID,
          permission: "bash",
          patterns: ["*"],
          ruleset: [],
          metadata: {},
          always: [],
        }).pipe(Effect.forkScoped)

        yield* Effect.gen(function* () {
          let pending = yield* list()
          while (pending.length === 0) {
            yield* Effect.sleep("10 millis")
            pending = yield* list()
          }
          const requestID = pending[0].id

          // Reply normally
          yield* reply({ requestID, reply: "once" })
        })

        yield* Fiber.join(fiber)
        yield* Effect.sleep("50 millis")

        // Only one Replied event from the explicit reply, none from interrupt
        expect(replied).toHaveLength(1)
      }),
    ),
  )
})
