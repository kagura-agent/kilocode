import { describe, it, expect, beforeEach } from "bun:test"
import {
  ErrorBackoff,
  HttpError,
  extractStatus,
  classify,
  isAbortError,
} from "../../src/services/autocomplete/classic-auto-complete/ErrorBackoff"

describe("extractStatus", () => {
  it("extracts 402 from SSE error message", () => {
    expect(extractStatus(new Error("SSE failed: 402 Payment Required"))).toBe(402)
  })

  it("extracts 429 from FIM error message", () => {
    expect(extractStatus(new Error("FIM request failed: 429 Too Many Requests"))).toBe(429)
  })

  it("extracts 500 from SSE error message", () => {
    expect(extractStatus(new Error("SSE failed: 500 Internal Server Error"))).toBe(500)
  })

  it("returns null for message without status code", () => {
    expect(extractStatus(new Error("Connection timed out"))).toBeNull()
  })

  it("handles string errors", () => {
    expect(extractStatus("SSE failed: 401 Unauthorized")).toBe(401)
  })

  it("returns null for empty error", () => {
    expect(extractStatus(new Error(""))).toBeNull()
  })

  it("extracts 429 when message contains other numbers before the status", () => {
    expect(extractStatus(new Error("after 128 retries: 429 Too Many Requests"))).toBe(429)
  })

  it("extracts status from HttpError via structured property", () => {
    expect(extractStatus(new HttpError(402, "Payment Required"))).toBe(402)
  })

  it("prefers HttpError.status over message regex", () => {
    // HttpError with status 402 but message mentioning 500 — structured wins
    expect(extractStatus(new HttpError(402, "SSE failed: 500 Internal Server Error"))).toBe(402)
  })
})

describe("HttpError", () => {
  it("has name HttpError", () => {
    const err = new HttpError(402, "Payment Required")
    expect(err.name).toBe("HttpError")
  })

  it("is an instance of Error", () => {
    const err = new HttpError(402, "Payment Required")
    expect(err instanceof Error).toBe(true)
  })

  it("preserves status and message", () => {
    const err = new HttpError(429, "Too Many Requests")
    expect(err.status).toBe(429)
    expect(err.message).toBe("Too Many Requests")
  })
})

describe("isAbortError", () => {
  it("detects DOMException AbortError", () => {
    const err = new DOMException("The operation was aborted", "AbortError")
    expect(isAbortError(err)).toBe(true)
  })

  it("detects Error with name AbortError", () => {
    const err = new Error("aborted")
    err.name = "AbortError"
    expect(isAbortError(err)).toBe(true)
  })

  it("detects error message containing abort", () => {
    expect(isAbortError(new Error("The user aborted the request"))).toBe(true)
  })

  it("returns false for regular errors", () => {
    expect(isAbortError(new Error("Connection timed out"))).toBe(false)
  })

  it("returns false for HttpError", () => {
    expect(isAbortError(new HttpError(402, "Payment Required"))).toBe(false)
  })
})

describe("classify", () => {
  it("classifies 402 as fatal", () => {
    expect(classify(new Error("SSE failed: 402 Payment Required"))).toBe("fatal")
  })

  it("classifies 401 as fatal", () => {
    expect(classify(new Error("SSE failed: 401 Unauthorized"))).toBe("fatal")
  })

  it("classifies 403 as fatal", () => {
    expect(classify(new Error("SSE failed: 403 Forbidden"))).toBe("fatal")
  })

  it("classifies 429 as retriable", () => {
    expect(classify(new Error("SSE failed: 429 Too Many Requests"))).toBe("retriable")
  })

  it("classifies 500 as retriable", () => {
    expect(classify(new Error("SSE failed: 500 Internal Server Error"))).toBe("retriable")
  })

  it("classifies 503 as retriable", () => {
    expect(classify(new Error("SSE failed: 503 Service Unavailable"))).toBe("retriable")
  })

  it("classifies no-status errors as retriable (fail-safe)", () => {
    expect(classify(new Error("Connection timed out"))).toBe("retriable")
  })

  it("classifies 404 as retriable", () => {
    expect(classify(new Error("SSE failed: 404 Not Found"))).toBe("retriable")
  })

  it("classifies abort errors as transient", () => {
    const err = new DOMException("The operation was aborted", "AbortError")
    expect(classify(err)).toBe("transient")
  })

  it("classifies abort-named errors as transient", () => {
    const err = new Error("aborted")
    err.name = "AbortError"
    expect(classify(err)).toBe("transient")
  })

  it("classifies HttpError 402 as fatal", () => {
    expect(classify(new HttpError(402, "Payment Required"))).toBe("fatal")
  })

  it("classifies HttpError 429 as retriable", () => {
    expect(classify(new HttpError(429, "Too Many Requests"))).toBe("retriable")
  })

  it("classifies HttpError 500 as retriable", () => {
    expect(classify(new HttpError(500, "Internal Server Error"))).toBe("retriable")
  })
})

describe("ErrorBackoff", () => {
  let backoff: ErrorBackoff

  beforeEach(() => {
    backoff = new ErrorBackoff()
  })

  it("is not blocked initially", () => {
    expect(backoff.blocked()).toBe(false)
  })

  it("is not fatal initially", () => {
    expect(backoff.isFatal()).toBe(false)
    expect(backoff.getFatalStatus()).toBeNull()
  })

  describe("fatal errors (402/401/403)", () => {
    it("blocks after a 402 error", () => {
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.blocked()).toBe(true)
      expect(backoff.isFatal()).toBe(true)
      expect(backoff.getFatalStatus()).toBe(402)
    })

    it("blocks after a 401 error", () => {
      backoff.failure(new Error("SSE failed: 401 Unauthorized"))
      expect(backoff.blocked()).toBe(true)
      expect(backoff.isFatal()).toBe(true)
      expect(backoff.getFatalStatus()).toBe(401)
    })

    it("blocks after a 403 error", () => {
      backoff.failure(new Error("SSE failed: 403 Forbidden"))
      expect(backoff.blocked()).toBe(true)
      expect(backoff.isFatal()).toBe(true)
      expect(backoff.getFatalStatus()).toBe(403)
    })

    it("remains blocked permanently until reset", () => {
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.blocked()).toBe(true)

      // Still blocked on subsequent checks
      expect(backoff.blocked()).toBe(true)
      expect(backoff.blocked()).toBe(true)
    })

    it("shouldProbe returns false within probe interval", () => {
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.shouldProbe()).toBe(false)
    })

    it("shouldProbe returns true after probe interval expires", () => {
      const now = Date.now()
      const original = Date.now
      try {
        Date.now = () => now
        backoff.failure(new Error("SSE failed: 402 Payment Required"))
        expect(backoff.shouldProbe()).toBe(false)

        // Advance past 5 minute probe interval
        Date.now = () => now + 300_001
        expect(backoff.shouldProbe()).toBe(true)

        // One-shot: immediately returns false again
        expect(backoff.shouldProbe()).toBe(false)
      } finally {
        Date.now = original
      }
    })

    it("shouldProbe returns false when not fatal", () => {
      expect(backoff.shouldProbe()).toBe(false)
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      expect(backoff.shouldProbe()).toBe(false)
    })

    it("stays blocked even after shouldProbe fires", () => {
      const now = Date.now()
      const original = Date.now
      try {
        Date.now = () => now
        backoff.failure(new Error("SSE failed: 402 Payment Required"))

        Date.now = () => now + 300_001
        expect(backoff.shouldProbe()).toBe(true)
        // blocked() is still true — caller must explicitly reset()
        expect(backoff.blocked()).toBe(true)
      } finally {
        Date.now = original
      }
    })

    it("unblocks after reset()", () => {
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.blocked()).toBe(true)

      backoff.reset()
      expect(backoff.blocked()).toBe(false)
      expect(backoff.isFatal()).toBe(false)
      expect(backoff.getFatalStatus()).toBeNull()
    })

    it("unblocks after success()", () => {
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.blocked()).toBe(true)

      backoff.success()
      expect(backoff.blocked()).toBe(false)
      expect(backoff.isFatal()).toBe(false)
    })
  })

  describe("retriable errors (429/5xx)", () => {
    it("blocks after a retriable error with backoff", () => {
      backoff.failure(new Error("SSE failed: 429 Too Many Requests"))
      expect(backoff.blocked()).toBe(true)
    })

    it("returns correct error kind", () => {
      const kind = backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      expect(kind).toBe("retriable")
    })

    it("resets on success", () => {
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      expect(backoff.blocked()).toBe(true)

      backoff.success()
      expect(backoff.blocked()).toBe(false)
    })
  })

  describe("transient errors (abort only)", () => {
    it("does not block after an abort error", () => {
      const err = new DOMException("The operation was aborted", "AbortError")
      backoff.failure(err)
      expect(backoff.blocked()).toBe(false)
    })

    it("returns transient kind for abort errors", () => {
      const err = new DOMException("The operation was aborted", "AbortError")
      const kind = backoff.failure(err)
      expect(kind).toBe("transient")
    })
  })

  describe("unrecognized errors (fail-safe)", () => {
    it("blocks after an unrecognized error (fail-safe)", () => {
      backoff.failure(new Error("Connection timed out"))
      expect(backoff.blocked()).toBe(true)
    })

    it("returns retriable kind for unrecognized errors", () => {
      const kind = backoff.failure(new Error("Connection timed out"))
      expect(kind).toBe("retriable")
    })

    it("applies exponential backoff for unrecognized errors", () => {
      const now = Date.now()
      const original = Date.now
      try {
        Date.now = () => now
        backoff.failure(new Error("DNS resolution failed"))
        expect(backoff.blocked()).toBe(true)

        // After 2s (base delay) backoff should expire
        Date.now = () => now + 2001
        expect(backoff.blocked()).toBe(false)
      } finally {
        Date.now = original
      }
    })
  })

  describe("failure() return value", () => {
    it("returns 'fatal' for 402", () => {
      expect(backoff.failure(new Error("SSE failed: 402 Payment Required"))).toBe("fatal")
    })

    it("returns 'retriable' for 429", () => {
      expect(backoff.failure(new Error("SSE failed: 429 Too Many Requests"))).toBe("retriable")
    })

    it("returns 'retriable' for unknown errors (fail-safe)", () => {
      expect(backoff.failure(new Error("Unknown error"))).toBe("retriable")
    })

    it("returns 'transient' for abort errors", () => {
      expect(backoff.failure(new DOMException("aborted", "AbortError"))).toBe("transient")
    })

    it("returns 'fatal' for HttpError 402", () => {
      expect(backoff.failure(new HttpError(402, "Payment Required"))).toBe("fatal")
    })
  })

  describe("mixed scenarios", () => {
    it("fatal error overrides retriable backoff", () => {
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      backoff.failure(new Error("SSE failed: 402 Payment Required"))
      expect(backoff.isFatal()).toBe(true)
      expect(backoff.blocked()).toBe(true)
    })

    it("success resets everything", () => {
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      backoff.failure(new Error("SSE failed: 500 Internal Server Error"))
      expect(backoff.blocked()).toBe(true)

      backoff.success()
      expect(backoff.blocked()).toBe(false)
      expect(backoff.isFatal()).toBe(false)
    })
  })
})
