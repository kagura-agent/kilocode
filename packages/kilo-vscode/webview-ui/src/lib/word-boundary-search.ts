/**
 * Word-boundary search for model names.
 *
 * - Tokenises query and candidate on /(?=[A-Z])|[[\]_.:\s/\\(){}-]+/
 *   so "gpt-5.4" and "gpt 5.4" both become ["gpt","5","4"].
 * - Each query token must match the *start* of one or more consecutive words
 *   in the candidate (enabling acronym-style matching, e.g. "clso" → Claude Sonnet).
 * - Searching also matches against provider name and raw model ID, so typing
 *   "openai" shows only OpenAI models.
 */

// Split at camelCase transitions AND common delimiter characters
const WORD_BOUNDARY = /(?=[A-Z])|[[\]_.:\s/\\(){}-]+/

function words(s: string): string[] {
  return s
    .split(WORD_BOUNDARY)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase())
}

/**
 * Returns true if `query` (a single lowercased token) matches `candidate`
 * using word-boundary prefix / acronym matching.
 */
function matchToken(candidate: string, query: string): boolean {
  const ws = words(candidate)

  const tryMatch = (wordIdx: number, queryIdx: number): boolean => {
    if (queryIdx === query.length) return true
    if (wordIdx >= ws.length) return false

    const w = ws[wordIdx]
    let n = 0
    while (n < w.length && queryIdx + n < query.length && w[n] === query[queryIdx + n]) n++

    if (n > 0 && tryMatch(wordIdx + 1, queryIdx + n)) return true
    return tryMatch(wordIdx + 1, queryIdx)
  }

  return tryMatch(0, 0)
}

/**
 * Returns true when every token of `query` matches somewhere in `text`.
 */
export function wordBoundaryMatch(text: string, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true

  const tokens = q.split(WORD_BOUNDARY).filter((t) => t.length > 0)
  if (tokens.length === 0) return true

  return tokens.every((t) => matchToken(text, t))
}
