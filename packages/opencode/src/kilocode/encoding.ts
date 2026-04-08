// kilocode_change - new file
import { readFileSync } from "fs"
import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname } from "path"
import { existsSync } from "fs"
import jschardet from "jschardet"
import iconv from "iconv-lite"

/**
 * Text encoding detection and preservation.
 * Uses jschardet for statistical encoding detection and iconv-lite for
 * encode/decode, supporting CJK and other non-Latin encodings.
 * BOM detection is handled explicitly to ensure round-trip fidelity.
 */
export namespace Encoding {
  export interface Info {
    /** The iconv-lite compatible encoding name. */
    encoding: string
    bom: boolean
  }

  const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
  const UTF16_LE_BOM = Buffer.from([0xff, 0xfe])
  const UTF16_BE_BOM = Buffer.from([0xfe, 0xff])

  export const DEFAULT: Info = { encoding: "utf-8", bom: false }

  /** Map jschardet names to iconv-lite compatible names. */
  function normalize(name: string): string {
    const lower = name.toLowerCase().replace(/[^a-z0-9]/g, "")
    const map: Record<string, string> = {
      utf8: "utf-8",
      utf16le: "utf-16le",
      utf16be: "utf-16be",
      utf32le: "utf-32le",
      utf32be: "utf-32be",
      ascii: "ascii",
      iso88591: "iso-8859-1",
      iso88592: "iso-8859-2",
      iso88595: "iso-8859-5",
      iso88597: "iso-8859-7",
      iso88598: "iso-8859-8",
      iso88599: "iso-8859-9",
      windows1250: "windows-1250",
      windows1251: "windows-1251",
      windows1252: "windows-1252",
      windows1253: "windows-1253",
      windows1255: "windows-1255",
      shiftjis: "Shift_JIS",
      eucjp: "euc-jp",
      iso2022jp: "iso-2022-jp",
      euckr: "euc-kr",
      iso2022kr: "iso-2022-kr",
      big5: "big5",
      gb2312: "gb2312",
      gb18030: "gb18030",
      hzgb2312: "hz-gb-2312",
      euctw: "euc-tw",
      iso2022cn: "iso-2022-cn",
      koi8r: "koi8-r",
      maccyrillic: "x-mac-cyrillic",
      ibm855: "cp855",
      ibm866: "cp866",
      tis620: "tis-620",
    }
    return map[lower] ?? name
  }

  export function detect(bytes: Buffer): Info {
    if (bytes.length === 0) return DEFAULT

    // BOM detection (highest priority — never delegate to heuristics)
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return { encoding: "utf-8", bom: true }
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return { encoding: "utf-16be", bom: true }
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      // Disambiguate UTF-32 LE (FF FE 00 00) from UTF-16 LE (FF FE)
      if (bytes.length >= 4 && bytes[2] === 0x00 && bytes[3] === 0x00) {
        return { encoding: "utf-32le", bom: true }
      }
      return { encoding: "utf-16le", bom: true }
    }
    if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff) {
      return { encoding: "utf-32be", bom: true }
    }

    // Statistical detection via jschardet
    const result = jschardet.detect(bytes)
    if (result.encoding && result.confidence > 0.5) {
      const enc = normalize(result.encoding)
      // Treat ascii as utf-8 — ASCII is a strict subset
      if (enc === "ascii") return DEFAULT
      if (iconv.encodingExists(enc)) {
        return { encoding: enc, bom: false }
      }
    }

    // Fallback: check UTF-8 validity, then latin1
    if (isUtf8(bytes)) return DEFAULT
    return { encoding: "iso-8859-1", bom: false }
  }

  export function decode(bytes: Buffer, info: Info): string {
    const start = info.bom ? bomSize(info.encoding) : 0
    const data = start > 0 ? bytes.subarray(start) : bytes
    return iconv.decode(data, info.encoding)
  }

  export function encode(text: string, info: Info): Buffer {
    const body = iconv.encode(text, info.encoding)
    if (!info.bom) return body

    const bom = bomBytes(info.encoding)
    if (bom.length === 0) return body
    return Buffer.concat([bom, body])
  }

  /** Read a file preserving its encoding info. */
  export async function read(path: string): Promise<{ text: string; info: Info }> {
    const bytes = Buffer.from(await readFile(path))
    const info = detect(bytes)
    return { text: decode(bytes, info), info }
  }

  /** Read a file synchronously, preserving its encoding info. */
  export function readSync(path: string): { text: string; info: Info } {
    const bytes = readFileSync(path)
    const info = detect(bytes)
    return { text: decode(bytes, info), info }
  }

  /** Write text back to a file using the given encoding info. */
  export async function write(path: string, text: string, info: Info): Promise<void> {
    const bytes = encode(text, info)
    const dir = dirname(path)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(path, bytes)
  }

  function bomSize(encoding: string): number {
    const lower = encoding.toLowerCase()
    if (lower === "utf-8") return 3
    if (lower === "utf-16le" || lower === "utf-16be") return 2
    if (lower === "utf-32le" || lower === "utf-32be") return 4
    return 0
  }

  function bomBytes(encoding: string): Buffer {
    const lower = encoding.toLowerCase()
    if (lower === "utf-8") return UTF8_BOM
    if (lower === "utf-16le") return UTF16_LE_BOM
    if (lower === "utf-16be") return UTF16_BE_BOM
    if (lower === "utf-32le") return Buffer.from([0xff, 0xfe, 0x00, 0x00])
    if (lower === "utf-32be") return Buffer.from([0x00, 0x00, 0xfe, 0xff])
    return Buffer.alloc(0)
  }

  function isUtf8(bytes: Buffer): boolean {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      return true
    } catch {
      return false
    }
  }
}
