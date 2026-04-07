import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { Instance } from "../../src/project/instance"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
  Config.global.reset()
})

describe("config resilience", () => {
  test("skips invalid agent markdown configs", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(
          path.join(dir, ".kilo", "agent", "skip.md"),
          `---
mode: "banana"
---
Broken agent prompt`,
        )
        await Filesystem.write(
          path.join(dir, ".kilo", "agent", "keep.md"),
          `---
model: test/model
---
Valid agent prompt`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cfg = await Config.get()

        expect(cfg.agent?.["skip"]).toBeUndefined()
        expect(cfg.agent?.["keep"]).toMatchObject({
          name: "keep",
          model: "test/model",
          prompt: "Valid agent prompt",
        })
      },
    })
  })

  test("publishes an error for invalid agent markdown configs", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(
          path.join(dir, ".kilo", "agent", "skip.md"),
          `---
mode: "banana"
---
Broken agent prompt`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const seen: Array<{ type: string; properties: { error: { name: string; data: { message: string } } } }> = []
        const unsub = Bus.subscribeAll((event) => {
          if (event.type === "session.error") seen.push(event)
        })

        await Config.get()
        unsub()

        expect(
          seen.some(
            (item) =>
              item.properties.error.name === "UnknownError" &&
              item.properties.error.data.message.includes("skip.md") &&
              item.properties.error.data.message.includes("mode"),
          ),
        ).toBe(true)
      },
    })
  })

  test("skips invalid command markdown configs", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(
          path.join(dir, ".kilo", "command", "skip.md"),
          `---
subtask: "banana"
---
Broken command template`,
        )
        await Filesystem.write(
          path.join(dir, ".kilo", "command", "keep.md"),
          `---
description: Valid command
---
Valid command template`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const cfg = await Config.get()

        expect(cfg.command?.["skip"]).toBeUndefined()
        expect(cfg.command?.["keep"]).toEqual({
          description: "Valid command",
          template: "Valid command template",
        })
      },
    })
  })

  test("publishes an error for invalid command markdown configs", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Filesystem.write(
          path.join(dir, ".kilo", "command", "skip.md"),
          `---
subtask: "banana"
---
Broken command template`,
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const seen: Array<{ type: string; properties: { error: { name: string; data: { message: string } } } }> = []
        const unsub = Bus.subscribeAll((event) => {
          if (event.type === "session.error") seen.push(event)
        })

        await Config.get()
        unsub()

        expect(
          seen.some(
            (item) =>
              item.properties.error.name === "UnknownError" &&
              item.properties.error.data.message.includes("skip.md") &&
              item.properties.error.data.message.includes("subtask"),
          ),
        ).toBe(true)
      },
    })
  })
})
