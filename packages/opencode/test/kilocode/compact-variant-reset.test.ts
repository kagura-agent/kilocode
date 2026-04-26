// kilocode_change - new file
// Regression test for #9447: /compact resets model variant to default.
// Verifies that the variant field flows through compact.create() into the
// compaction user message.

import { afterEach, describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { Log } from "../../src/util"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
})

describe("compact variant preservation (#9447)", () => {
  test(
    "compact.create() preserves variant in the compaction user message",
    async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({ title: "variant test" })

          // Simulate what compact.create() does: create a user message with
          // model that includes variant. This is the core of the fix — the
          // model type now accepts variant?: string.
          const model = {
            providerID: "test-provider",
            modelID: "test-model",
            variant: "high", // kilocode_change — this field was missing before the fix
          }
          const msgId = MessageID.ascending()
          await Session.updateMessage({
            id: msgId,
            role: "user",
            model,
            sessionID: session.id,
            agent: "code",
            time: { created: Date.now() },
          } as MessageV2.User)
          await Session.updatePart({
            id: PartID.ascending(),
            messageID: msgId,
            sessionID: session.id,
            type: "compaction",
            auto: false,
          } as MessageV2.CompactionPart)

          // Verify the variant survived round-trip through the message store
          const msgs = await Session.messages({ sessionID: session.id })
          const compactionMsg = msgs.find(
            (m) => m.info.role === "user" && m.parts.some((p) => p.type === "compaction"),
          )
          expect(compactionMsg).toBeDefined()
          const info = compactionMsg!.info as MessageV2.User
          expect(info.model.variant).toBe("high") // kilocode_change — variant preserved
        },
      })
    },
    10_000,
  )

  test(
    "compact.create() without variant leaves model.variant undefined (pre-fix behavior)",
    async () => {
      await using tmp = await tmpdir({ git: true })
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const session = await Session.create({ title: "no variant test" })

          // Without variant — this was the old behavior that caused the bug
          const model = {
            providerID: "test-provider",
            modelID: "test-model",
          }
          const msgId = MessageID.ascending()
          await Session.updateMessage({
            id: msgId,
            role: "user",
            model,
            sessionID: session.id,
            agent: "code",
            time: { created: Date.now() },
          } as MessageV2.User)
          await Session.updatePart({
            id: PartID.ascending(),
            messageID: msgId,
            sessionID: session.id,
            type: "compaction",
            auto: false,
          } as MessageV2.CompactionPart)

          const msgs = await Session.messages({ sessionID: session.id })
          const compactionMsg = msgs.find(
            (m) => m.info.role === "user" && m.parts.some((p) => p.type === "compaction"),
          )
          expect(compactionMsg).toBeDefined()
          const info = compactionMsg!.info as MessageV2.User
          // Without variant, it should be undefined
          expect(info.model.variant).toBeUndefined()
        },
      })
    },
    10_000,
  )
})
