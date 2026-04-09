import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { Shell } from "../../src/shell/shell"

describe("Shell.isUnixLike", () => {
  test("recognizes bash", () => {
    expect(Shell.isUnixLike("/bin/bash")).toBe(true)
  })

  test("recognizes bash.exe (Windows path)", () => {
    expect(Shell.isUnixLike("C:\\Program Files\\Git\\bin\\bash.exe")).toBe(true)
  })

  test("recognizes sh", () => {
    expect(Shell.isUnixLike("/bin/sh")).toBe(true)
  })

  test("recognizes zsh", () => {
    expect(Shell.isUnixLike("/bin/zsh")).toBe(true)
  })

  test("rejects cmd.exe", () => {
    expect(Shell.isUnixLike("C:\\Windows\\System32\\cmd.exe")).toBe(false)
  })

  test("rejects powershell", () => {
    expect(Shell.isUnixLike("powershell.exe")).toBe(false)
  })

  test("rejects pwsh", () => {
    expect(Shell.isUnixLike("pwsh")).toBe(false)
  })
})

describe("Shell.sanitizeNullRedirect", () => {
  const realPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: realPlatform })
  })

  describe("on non-Windows", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "linux" })
    })

    test("returns command unchanged", () => {
      expect(Shell.sanitizeNullRedirect("echo test >nul", "/bin/bash")).toBe("echo test >nul")
    })
  })

  describe("on Windows with POSIX shell (Git Bash)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" })
    })

    test("rewrites >nul to >/dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test >nul", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo test >/dev/null",
      )
    })

    test("rewrites 2>nul to 2>/dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test 2>nul", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo test 2>/dev/null",
      )
    })

    test("rewrites >NUL (uppercase) to >/dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test >NUL", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo test >/dev/null",
      )
    })

    test("rewrites 2>NUL to 2>/dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test 2>NUL", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo test 2>/dev/null",
      )
    })

    test("rewrites > nul (with space) to >/dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test > nul", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo test >/dev/null",
      )
    })

    test("rewrites combined stdout and stderr redirects", () => {
      expect(
        Shell.sanitizeNullRedirect("ping -n 5 127.0.0.1 > nul 2>&1", "C:\\Program Files\\Git\\bin\\bash.exe"),
      ).toBe("ping -n 5 127.0.0.1 >/dev/null 2>&1")
    })

    test("rewrites both redirects in >nul 2>nul", () => {
      expect(Shell.sanitizeNullRedirect("cmd /c test >nul 2>nul", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "cmd /c test >/dev/null 2>/dev/null",
      )
    })

    test("does not modify commands without nul redirect", () => {
      expect(Shell.sanitizeNullRedirect("echo hello world", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
        "echo hello world",
      )
    })

    test("does not modify nul inside a word", () => {
      // \b word boundary ensures "nullable" is not affected
      expect(Shell.sanitizeNullRedirect("echo nullable", "C:\\Program Files\\Git\\bin\\bash.exe")).toBe("echo nullable")
    })
  })

  describe("on Windows with cmd.exe", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" })
    })

    test("rewrites >/dev/null to >NUL", () => {
      expect(Shell.sanitizeNullRedirect("echo test >/dev/null", "cmd.exe")).toBe("echo test >NUL")
    })

    test("rewrites 2>/dev/null to 2>NUL", () => {
      expect(Shell.sanitizeNullRedirect("echo test 2>/dev/null", "cmd.exe")).toBe("echo test 2>NUL")
    })

    test("does not modify commands without /dev/null", () => {
      expect(Shell.sanitizeNullRedirect("echo test >nul", "cmd.exe")).toBe("echo test >nul")
    })
  })

  describe("on Windows with PowerShell", () => {
    beforeEach(() => {
      Object.defineProperty(process, "platform", { value: "win32" })
    })

    test("rewrites >/dev/null to >NUL", () => {
      expect(Shell.sanitizeNullRedirect("echo test >/dev/null", "powershell.exe")).toBe("echo test >NUL")
    })
  })
})
