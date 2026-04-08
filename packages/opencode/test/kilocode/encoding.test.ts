import { test, expect, describe } from "bun:test"
import { Encoding } from "../../src/kilocode/encoding"
import { tmpdir } from "../fixture/fixture"
import path from "path"
import fs from "fs/promises"
import iconv from "iconv-lite"

describe("Encoding", () => {
  describe("detect", () => {
    test("detects UTF-8 BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hello", "utf-8")])
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-8")
      expect(info.bom).toBe(true)
    })

    test("detects UTF-16 LE BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hello", "utf16le")])
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-16le")
      expect(info.bom).toBe(true)
    })

    test("detects UTF-16 BE BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode("hello", "utf-16be")])
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-16be")
      expect(info.bom).toBe(true)
    })

    test("detects plain UTF-8 (no BOM)", () => {
      const bytes = Buffer.from("hello world", "utf-8")
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-8")
      expect(info.bom).toBe(false)
    })

    test("returns utf-8 for empty buffer", () => {
      const info = Encoding.detect(Buffer.alloc(0))
      expect(info.encoding).toBe("utf-8")
      expect(info.bom).toBe(false)
    })

    test("detects UTF-32 LE BOM", () => {
      const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x41, 0x00, 0x00, 0x00])
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-32le")
      expect(info.bom).toBe(true)
    })

    test("detects UTF-32 BE BOM", () => {
      const bytes = Buffer.from([0x00, 0x00, 0xfe, 0xff, 0x00, 0x00, 0x00, 0x41])
      const info = Encoding.detect(bytes)
      expect(info.encoding).toBe("utf-32be")
      expect(info.bom).toBe(true)
    })
  })

  describe("decode", () => {
    test("decodes UTF-8 with BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hello", "utf-8")])
      const text = Encoding.decode(bytes, { encoding: "utf-8", bom: true })
      expect(text).toBe("hello")
    })

    test("decodes UTF-8 without BOM", () => {
      const bytes = Buffer.from("hello", "utf-8")
      const text = Encoding.decode(bytes, { encoding: "utf-8", bom: false })
      expect(text).toBe("hello")
    })

    test("decodes UTF-16 LE with BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hello", "utf16le")])
      const text = Encoding.decode(bytes, { encoding: "utf-16le", bom: true })
      expect(text).toBe("hello")
    })

    test("decodes UTF-16 BE with BOM", () => {
      const bytes = Buffer.concat([Buffer.from([0xfe, 0xff]), iconv.encode("hello", "utf-16be")])
      const text = Encoding.decode(bytes, { encoding: "utf-16be", bom: true })
      expect(text).toBe("hello")
    })

    test("decodes Shift-JIS", () => {
      const original = "こんにちは"
      const bytes = iconv.encode(original, "Shift_JIS")
      const text = Encoding.decode(bytes, { encoding: "Shift_JIS", bom: false })
      expect(text).toBe(original)
    })

    test("decodes GB2312", () => {
      const original = "你好世界"
      const bytes = iconv.encode(original, "gb2312")
      const text = Encoding.decode(bytes, { encoding: "gb2312", bom: false })
      expect(text).toBe(original)
    })

    test("decodes EUC-KR", () => {
      const original = "안녕하세요"
      const bytes = iconv.encode(original, "euc-kr")
      const text = Encoding.decode(bytes, { encoding: "euc-kr", bom: false })
      expect(text).toBe(original)
    })
  })

  describe("encode", () => {
    test("encodes UTF-8 without BOM", () => {
      const bytes = Encoding.encode("hello", { encoding: "utf-8", bom: false })
      expect(bytes).toEqual(Buffer.from("hello", "utf-8"))
    })

    test("encodes UTF-8 with BOM", () => {
      const bytes = Encoding.encode("hello", { encoding: "utf-8", bom: true })
      expect(bytes[0]).toBe(0xef)
      expect(bytes[1]).toBe(0xbb)
      expect(bytes[2]).toBe(0xbf)
      expect(bytes.subarray(3).toString("utf-8")).toBe("hello")
    })

    test("encodes UTF-16 LE with BOM", () => {
      const bytes = Encoding.encode("hi", { encoding: "utf-16le", bom: true })
      expect(bytes[0]).toBe(0xff)
      expect(bytes[1]).toBe(0xfe)
      expect(bytes.subarray(2).toString("utf16le")).toBe("hi")
    })

    test("encodes Shift-JIS", () => {
      const text = "こんにちは"
      const bytes = Encoding.encode(text, { encoding: "Shift_JIS", bom: false })
      const expected = iconv.encode(text, "Shift_JIS")
      expect(bytes).toEqual(expected)
    })
  })

  describe("round-trip", () => {
    test("UTF-8 with BOM round-trips", () => {
      const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("hello world\n", "utf-8")])
      const info = Encoding.detect(original)
      const text = Encoding.decode(original, info)
      const result = Encoding.encode(text, info)
      expect(result).toEqual(original)
    })

    test("UTF-16 LE with BOM round-trips", () => {
      const original = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hello world\n", "utf16le")])
      const info = Encoding.detect(original)
      const text = Encoding.decode(original, info)
      const result = Encoding.encode(text, info)
      expect(result).toEqual(original)
    })

    test("plain UTF-8 round-trips", () => {
      const original = Buffer.from("hello world\n", "utf-8")
      const info = Encoding.detect(original)
      const text = Encoding.decode(original, info)
      const result = Encoding.encode(text, info)
      expect(result).toEqual(original)
    })

    test("Shift-JIS round-trips", () => {
      const text = "日本語テスト\n"
      const original = iconv.encode(text, "Shift_JIS")
      const info = Encoding.detect(original)
      expect(info.encoding).toBe("Shift_JIS")
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("EUC-JP round-trips", () => {
      const text = "日本語テスト\n"
      const original = iconv.encode(text, "euc-jp")
      const info = Encoding.detect(original)
      expect(info.encoding).toBe("euc-jp")
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("Big5 round-trips", () => {
      // Longer sample required for reliable statistical detection
      const text = "次常用國字標準字體表建議使用正體中文排版系統進行文件處理以維護傳統漢字文化\n"
      const original = iconv.encode(text, "big5")
      const info = Encoding.detect(original)
      expect(info.encoding).toBe("big5")
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("GB2312 round-trips", () => {
      // Longer sample required for reliable statistical detection
      const text = "你好世界测试文件内容这是一个很长的中文文本用于测试编码检测功能\n第二行也有中文内容\n"
      const original = iconv.encode(text, "gb2312")
      const info = Encoding.detect(original)
      // jschardet detects as GB2312 which normalizes the same
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("EUC-KR round-trips", () => {
      // Longer sample for reliable detection
      const text = "안녕하세요 세계 프로그래밍 테스트 문자열입니다\n두번째 줄도 있습니다\n"
      const original = iconv.encode(text, "euc-kr")
      const info = Encoding.detect(original)
      expect(info.encoding).toBe("euc-kr")
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("Windows-1251 (Cyrillic) round-trips", () => {
      const text = "Привет мир\n"
      const original = iconv.encode(text, "windows-1251")
      const info = Encoding.detect(original)
      expect(info.encoding).toBe("windows-1251")
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })

    test("KOI8-R (Russian) round-trips", () => {
      const text = "Привет мир\n"
      const original = iconv.encode(text, "koi8-r")
      const info = Encoding.detect(original)
      // jschardet detects KOI8-R for this content
      const decoded = Encoding.decode(original, info)
      expect(decoded).toBe(text)
      const result = Encoding.encode(decoded, info)
      expect(result).toEqual(original)
    })
  })

  describe("file read/write", () => {
    test("preserves UTF-8 BOM through file write/read cycle", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "bom.txt")
      const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("line one\nline two\n", "utf-8")])
      await fs.writeFile(file, original)

      const { text, info } = await Encoding.read(file)
      expect(info.encoding).toBe("utf-8")
      expect(info.bom).toBe(true)
      expect(text).toBe("line one\nline two\n")

      const modified = text.replace("one", "1")
      await Encoding.write(file, modified, info)

      const raw = await fs.readFile(file)
      expect(raw[0]).toBe(0xef)
      expect(raw[1]).toBe(0xbb)
      expect(raw[2]).toBe(0xbf)
      expect(raw.subarray(3).toString("utf-8")).toBe("line 1\nline two\n")
    })

    test("preserves UTF-16 LE BOM through file write/read cycle", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "utf16le.txt")
      const content = "hello world\n"
      const original = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, "utf16le")])
      await fs.writeFile(file, original)

      const { text, info } = await Encoding.read(file)
      expect(info.encoding).toBe("utf-16le")
      expect(info.bom).toBe(true)
      expect(text).toBe("hello world\n")

      await Encoding.write(file, text, info)

      const raw = await fs.readFile(file)
      expect(raw).toEqual(original)
    })

    test("preserves Shift-JIS through file write/read cycle", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "shiftjis.txt")
      const text = "日本語テスト\nconst x = 1;\n"
      const original = iconv.encode(text, "Shift_JIS")
      await fs.writeFile(file, original)

      const { text: decoded, info } = await Encoding.read(file)
      expect(info.encoding).toBe("Shift_JIS")
      expect(decoded).toBe(text)

      // Modify ASCII part and write back
      const modified = decoded.replace("const x = 1", "const x = 2")
      await Encoding.write(file, modified, info)

      const raw = await fs.readFile(file)
      const expected = iconv.encode(modified, "Shift_JIS")
      expect(raw).toEqual(expected)
    })

    test("preserves Big5 through file write/read cycle", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "big5.txt")
      const text = "次常用國字標準字體表建議使用正體中文排版系統進行文件處理\n第二行正體中文\n"
      const original = iconv.encode(text, "big5")
      await fs.writeFile(file, original)

      const { text: decoded, info } = await Encoding.read(file)
      expect(info.encoding).toBe("big5")
      expect(decoded).toBe(text)

      await Encoding.write(file, decoded, info)

      const raw = await fs.readFile(file)
      expect(raw).toEqual(original)
    })

    test("readSync works for UTF-8 BOM files", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "sync.txt")
      const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("sync test", "utf-8")])
      await fs.writeFile(file, original)

      const { text, info } = Encoding.readSync(file)
      expect(info.encoding).toBe("utf-8")
      expect(info.bom).toBe(true)
      expect(text).toBe("sync test")
    })

    test("creates parent directories when writing", async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "nested", "dir", "file.txt")

      await Encoding.write(file, "content", Encoding.DEFAULT)

      const raw = await fs.readFile(file, "utf-8")
      expect(raw).toBe("content")
    })
  })
})
