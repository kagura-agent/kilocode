import { test, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { clearLegacyKiloAuth } from "@kilocode/kilo-gateway"
import { Auth } from "../../src/auth"
import { Global } from "../../src/global"
import { Filesystem } from "../../src/util/filesystem"
import { tmpdir } from "../fixture/fixture"

test("set normalizes trailing slashes in keys", async () => {
  await Auth.set("https://example.com/", {
    type: "wellknown",
    key: "TOKEN",
    token: "abc",
  })
  const data = await Auth.all()
  expect(data["https://example.com"]).toBeDefined()
  expect(data["https://example.com/"]).toBeUndefined()
})

test("set cleans up pre-existing trailing-slash entry", async () => {
  // Simulate a pre-fix entry with trailing slash
  await Auth.set("https://example.com/", {
    type: "wellknown",
    key: "TOKEN",
    token: "old",
  })
  // Re-login with normalized key (as the CLI does post-fix)
  await Auth.set("https://example.com", {
    type: "wellknown",
    key: "TOKEN",
    token: "new",
  })
  const data = await Auth.all()
  const keys = Object.keys(data).filter((k) => k.includes("example.com"))
  expect(keys).toEqual(["https://example.com"])
  const entry = data["https://example.com"]!
  expect(entry.type).toBe("wellknown")
  if (entry.type === "wellknown") expect(entry.token).toBe("new")
})

test("remove deletes both trailing-slash and normalized keys", async () => {
  await Auth.set("https://example.com", {
    type: "wellknown",
    key: "TOKEN",
    token: "abc",
  })
  await Auth.remove("https://example.com/")
  const data = await Auth.all()
  expect(data["https://example.com"]).toBeUndefined()
  expect(data["https://example.com/"]).toBeUndefined()
})

test("set and remove are no-ops on keys without trailing slashes", async () => {
  await Auth.set("anthropic", {
    type: "api",
    key: "sk-test",
  })
  const data = await Auth.all()
  expect(data["anthropic"]).toBeDefined()
  await Auth.remove("anthropic")
  const after = await Auth.all()
  expect(after["anthropic"]).toBeUndefined()
})

test("remove cleans up stale trailing-slash entries when removing the normalized key", async () => {
  const file = path.join(Global.Path.data, "auth.json")
  const data = await Auth.all()

  await Filesystem.writeJson(
    file,
    {
      ...data,
      "https://example.com/": {
        type: "wellknown",
        key: "TOKEN",
        token: "abc",
      },
    },
    0o600,
  )

  await Auth.remove("https://example.com")

  const after = await Auth.all()
  expect(after["https://example.com"]).toBeUndefined()
  expect(after["https://example.com/"]).toBeUndefined()
})

test("clearLegacyKiloAuth removes kilo credentials from the legacy config file", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "config.json")

  await fs.writeFile(
    file,
    JSON.stringify(
      {
        providers: [
          {
            id: "kilo",
            provider: "kilocode",
            kilocodeToken: "token",
            kilocodeOrganizationId: "org",
          },
          {
            id: "openrouter",
            provider: "openrouter",
          },
        ],
      },
      null,
      2,
    ),
  )

  const changed = await clearLegacyKiloAuth(file)
  const content = await fs.readFile(file, "utf-8")
  const data = JSON.parse(content) as {
    providers: Array<Record<string, string | undefined>>
  }

  expect(changed).toBe(true)
  expect(data.providers[0]?.kilocodeToken).toBeUndefined()
  expect(data.providers[0]?.kilocodeOrganizationId).toBeUndefined()
  expect(data.providers[1]).toEqual({
    id: "openrouter",
    provider: "openrouter",
  })
})
