/**
 * Circuit breaker and exponential backoff for autocomplete request errors.
 *
 * Classifies errors into:
 * - **fatal**: 401, 402, 403 — stops all requests until explicitly reset
 * - **retriable**: 429, 5xx, network errors, unknown — exponential backoff with cap
 * - **transient**: abort only — no special handling
 *
 * The default for unrecognized errors is "retriable" (fail-safe). Only aborted
 * requests are classified as "transient", since they are expected during normal
 * typing and should not trigger backoff.
 *
 * When a fatal error (like 402 Payment Required) is detected, autocomplete
 * requests are blocked to prevent thousands of wasted API calls. The caller
 * can periodically check `shouldProbe()` to run a lightweight balance check
 * and call `reset()` if the user has added credits.
 */

/** Base backoff delay in ms for retriable errors */
const BASE_DELAY_MS = 2_000

/** Maximum backoff delay in ms (2 minutes) */
const MAX_DELAY_MS = 120_000

/** Number of consecutive retriable failures before circuit opens */
const CIRCUIT_THRESHOLD = 5

/** Duration in ms the circuit stays open before allowing a probe (5 minutes) */
const CIRCUIT_COOLDOWN_MS = 300_000

/** Interval between balance/auth probe checks for fatal errors (5 minutes) */
const FATAL_PROBE_INTERVAL_MS = 300_000

export type ErrorKind = "fatal" | "retriable" | "transient"

/**
 * Custom error class that carries a structured HTTP status code.
 * Used by AutocompleteModel to propagate SSE error status without
 * relying on regex parsing of error messages.
 */
export class HttpError extends Error {
  public readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
  }
}

/**
 * Extract an HTTP status code from an error.
 *
 * Checks for structured `HttpError.status` first, then falls back to
 * regex parsing of the message string for SDK errors formatted like
 * "SSE failed: 402 Payment Required".
 */
export function extractStatus(error: unknown): number | null {
  // Prefer structured status from HttpError
  if (error instanceof HttpError) return error.status

  const msg = error instanceof Error ? error.message : String(error)
  const match = msg.match(/:\s*([45]\d{2})\b/)
  return match ? Number(match[1]) : null
}

/**
 * Check whether an error represents an intentional abort (e.g. user typed
 * again, cancelling the previous request). Aborted requests are expected
 * during normal usage and should not trigger any backoff.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (error instanceof Error && error.name === "AbortError") return true
  if (error instanceof Error && error.message.includes("abort")) return true
  return false
}

/**
 * Classify an error into one of three categories based on its HTTP status code.
 *
 * Fail-safe: unrecognized errors default to "retriable" so backoff is always
 * applied. Only abort errors are classified as "transient" (no backoff).
 */
export function classify(error: unknown): ErrorKind {
  // Aborted requests are expected (user typed again) — never penalize
  if (isAbortError(error)) return "transient"

  const status = extractStatus(error)
  if (status === 401 || status === 402 || status === 403) return "fatal"
  if (status === 429 || (status !== null && status >= 500)) return "retriable"

  // No recognized status code — fail-safe: treat as retriable so backoff
  // is applied. This prevents request storms from unrecognized errors.
  if (status === null) return "retriable"

  // Known 4xx status codes other than 401/402/403/429 (e.g., 404, 400)
  return "retriable"
}

export class ErrorBackoff {
  /** The kind of the most recent fatal error, if any */
  private fatal: ErrorKind | null = null
  /** HTTP status of the fatal error (for notification messages) */
  private fatalStatus: number | null = null
  /** Timestamp when the fatal error was recorded (for probe interval) */
  private fatalAt = 0
  /** Timestamp when the circuit was opened (for retriable circuit breaker) */
  private opened = 0
  /** Consecutive retriable failure count */
  private failures = 0
  /** Timestamp until which requests should be delayed (retriable backoff) */
  private blockedUntil = 0

  /**
   * Record a successful request. Resets all backoff/circuit state.
   */
  success(): void {
    this.fatal = null
    this.fatalStatus = null
    this.fatalAt = 0
    this.failures = 0
    this.blockedUntil = 0
    this.opened = 0
  }

  /**
   * Record an error and update backoff state.
   * Returns the error kind for the caller to act on.
   */
  failure(error: unknown): ErrorKind {
    const kind = classify(error)

    if (kind === "fatal") {
      this.fatal = kind
      this.fatalStatus = extractStatus(error)
      this.fatalAt = Date.now()
      return kind
    }

    if (kind === "retriable") {
      this.failures++
      // Exponential backoff: 2s, 4s, 8s, 16s, … capped at MAX_DELAY_MS
      const delay = Math.min(BASE_DELAY_MS * 2 ** (this.failures - 1), MAX_DELAY_MS)
      this.blockedUntil = Date.now() + delay

      // Open circuit after threshold consecutive failures
      if (this.failures >= CIRCUIT_THRESHOLD && this.opened === 0) {
        this.opened = Date.now()
      }
      return kind
    }

    // transient — no state change
    return kind
  }

  /**
   * Whether autocomplete requests should be blocked right now.
   */
  blocked(): boolean {
    // Fatal errors block until explicitly reset
    if (this.fatal) return true

    // Circuit breaker is open
    if (this.opened > 0) {
      const elapsed = Date.now() - this.opened
      if (elapsed < CIRCUIT_COOLDOWN_MS) return true
      // Cooldown expired — allow one probe, reset circuit
      this.opened = 0
      this.failures = 0
      this.blockedUntil = 0
      return false
    }

    // Exponential backoff still active
    if (this.blockedUntil > 0 && Date.now() < this.blockedUntil) return true

    return false
  }

  /**
   * Whether a fatal (non-retriable) error is active — credits depleted, auth invalid, etc.
   */
  isFatal(): boolean {
    return this.fatal !== null
  }

  /**
   * The HTTP status code of the fatal error, or null.
   */
  getFatalStatus(): number | null {
    return this.fatalStatus
  }

  /**
   * Whether it's time for a lightweight probe (e.g. balance check) to see if
   * the fatal condition has been resolved. Returns true at most once per
   * FATAL_PROBE_INTERVAL_MS. The caller should check balance/auth and call
   * reset() if the condition is cleared.
   */
  shouldProbe(): boolean {
    if (!this.fatal) return false
    const elapsed = Date.now() - this.fatalAt
    if (elapsed < FATAL_PROBE_INTERVAL_MS) return false
    this.fatalAt = Date.now()
    return true
  }

  /**
   * Manually reset all state (e.g. when user adds credits or re-authenticates).
   */
  reset(): void {
    this.success()
  }
}
