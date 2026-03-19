import { describe, expect, test, mock } from "bun:test"
import path from "path"
import { CodeIndexServiceFactory } from "../../../src/indexing/service-factory"
import { CodeIndexConfigManager } from "../../../src/indexing/config-manager"
import { CacheManager } from "../../../src/indexing/cache-manager"

const workspacePath = "/tmp/ws"
const cacheDirectory = "/tmp/cache"

function createFactory(input?: Partial<ConstructorParameters<typeof CodeIndexConfigManager>[0]>) {
  const cfg = new CodeIndexConfigManager({
    enabled: true,
    embedderProvider: "openai",
    openAiKey: "sk-test",
    ...input,
  })

  const cache = {} as CacheManager

  return new CodeIndexServiceFactory(cfg, workspacePath, cache, cacheDirectory)
}

describe("CodeIndexServiceFactory", () => {
  test("uses default LanceDB directory when config is unset", () => {
    const factory = createFactory({ vectorStoreProvider: "lancedb", lancedbVectorStoreDirectory: undefined })

    const store = factory.createVectorStore() as unknown as { dbPath: string }

    expect(store).toBeDefined()
    expect(store.dbPath).toContain(path.join(cacheDirectory, "lancedb"))
  })

  test("uses explicit LanceDB directory when configured", () => {
    const dir = "/tmp/custom-lancedb"
    const factory = createFactory({ vectorStoreProvider: "lancedb", lancedbVectorStoreDirectory: dir })

    const store = factory.createVectorStore() as unknown as { dbPath: string }

    expect(store.dbPath).toContain(dir)
  })

  test("passes configured dimension to Ollama embed requests", async () => {
    const fn = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ embeddings: [[0.1, 0.2]] }),
      } as Response),
    ) as unknown as typeof fetch
    const prev = global.fetch
    global.fetch = fn

    try {
      const factory = createFactory({
        embedderProvider: "ollama",
        openAiKey: undefined,
        ollamaBaseUrl: "http://localhost:11434",
        modelId: "mxbai-embed-large",
        modelDimension: 1024,
      })

      const embedder = factory.createEmbedder()
      await embedder.createEmbeddings(["hello"])

      const calls = (fn as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
      const req = calls[0]?.[1]
      if (!req || typeof req.body !== "string") throw new Error("Missing Ollama embed request body")
      const body = JSON.parse(req.body)

      expect(body.model).toBe("mxbai-embed-large")
      expect(body.input).toEqual(["hello"])
      expect(body.dimensions).toBe(1024)
    } finally {
      global.fetch = prev
    }
  })

  test("leaves Ollama dimensions unset when no override is configured", async () => {
    const fn = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ embeddings: [[0.1, 0.2]] }),
      } as Response),
    ) as unknown as typeof fetch
    const prev = global.fetch
    global.fetch = fn

    try {
      const factory = createFactory({
        embedderProvider: "ollama",
        openAiKey: undefined,
        ollamaBaseUrl: "http://localhost:11434",
        modelId: "mxbai-embed-large",
      })

      const embedder = factory.createEmbedder()
      await embedder.createEmbeddings(["hello"])

      const calls = (fn as unknown as { mock: { calls: Array<[string, RequestInit | undefined]> } }).mock.calls
      const req = calls[0]?.[1]
      if (!req || typeof req.body !== "string") throw new Error("Missing Ollama embed request body")
      const body = JSON.parse(req.body)

      expect(body.model).toBe("mxbai-embed-large")
      expect(body.input).toEqual(["hello"])
      expect("dimensions" in body).toBe(false)
    } finally {
      global.fetch = prev
    }
  })
})
