/**
 * Exponential backoff utility for rate-limited (HTTP 429) responses.
 *
 * Provides two mechanisms:
 * 1. `RateLimitBackoff` — stateful tracker for SSE reconnection delays.
 *    Increases delay on consecutive 429 errors, resets on success.
 * 2. `withBackoff` — wraps an async function with automatic retry on
 *    retriable errors (429, 5xx, network failures).
 *
 * Backoff formula: `base * 2^(attempt - 1)`, capped at `maxDelay`.
 * Default: 1s → 2s → 4s → 8s → … → 30s max, up to 5 attempts.
 */

/** Base delay in ms */
const BASE_DELAY_MS = 1_000

/** Maximum delay in ms (30 seconds) */
const MAX_DELAY_MS = 30_000

/** Default maximum retry attempts for `withBackoff` */
const MAX_ATTEMPTS = 5

/**
 * Extract an HTTP status code from an error message.
 * Matches patterns like "SSE failed: 429 Too Many Requests" or
 * "HTTP error 503 Service Unavailable".
 */
export function extractStatus(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error)
  const match = msg.match(/\b([45]\d{2})\b/)
  return match ? Number(match[1]) : null
}

/**
 * Whether an error represents a rate limit (429) response.
 */
export function isRateLimited(error: unknown): boolean {
  return extractStatus(error) === 429
}

/**
 * Whether an error is retriable (429 or 5xx).
 */
export function isRetriable(error: unknown): boolean {
  const status = extractStatus(error)
  if (status === null) return false
  return status === 429 || status >= 500
}

/**
 * Compute exponential backoff delay for a given attempt number (1-indexed).
 */
export function backoff(attempt: number, base = BASE_DELAY_MS, max = MAX_DELAY_MS): number {
  return Math.min(base * 2 ** (attempt - 1), max)
}

/**
 * Stateful rate-limit backoff tracker for SSE reconnection.
 *
 * Usage:
 *   const tracker = new RateLimitBackoff()
 *   // On error:
 *   const delay = tracker.failure(error)  // returns delay if rate-limited, or 0
 *   // On successful connection:
 *   tracker.reset()
 */
export class RateLimitBackoff {
  private attempts = 0

  /**
   * Record a failure. Returns the recommended delay in ms.
   * For rate-limited errors (429), returns an exponentially increasing delay.
   * For other errors, returns 0 (caller should use its default reconnect delay).
   */
  failure(error: unknown): number {
    if (!isRateLimited(error)) {
      return 0
    }
    this.attempts++
    return backoff(this.attempts)
  }

  /**
   * Reset after a successful connection.
   */
  reset(): void {
    this.attempts = 0
  }

  /**
   * Current attempt count (for logging/telemetry).
   */
  get count(): number {
    return this.attempts
  }
}

export interface BackoffOptions {
  /** Maximum retry attempts (default: 5) */
  attempts?: number
  /** Base delay in ms (default: 1000) */
  base?: number
  /** Maximum delay in ms (default: 30000) */
  max?: number
  /** Custom predicate for retriable errors (default: 429 + 5xx) */
  retriable?: (error: unknown) => boolean
  /** Callback invoked before each retry with attempt number and delay */
  onRetry?: (attempt: number, delay: number, error: unknown) => void
}

/**
 * Wrap an async function with exponential backoff retry on retriable errors.
 *
 * @example
 *   const result = await withBackoff(() => client.session.list({ directory }))
 */
export async function withBackoff<T>(fn: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
  const {
    attempts = MAX_ATTEMPTS,
    base = BASE_DELAY_MS,
    max = MAX_DELAY_MS,
    retriable = isRetriable,
    onRetry,
  } = options

  let last: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      last = error
      if (attempt >= attempts || !retriable(error)) throw error
      const delay = backoff(attempt, base, max)
      onRetry?.(attempt, delay, error)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw last
}
