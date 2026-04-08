/**
 * Word-boundary model search.
 *
 * Tokenises both the query and each candidate on common separators so that
 * punctuation and separator differences are normalised:
 *   "gpt 5.4"  →  ["gpt", "5", "4"]
 *   "GPT-5.4"  →  ["gpt", "5", "4"]
 *
 * Every query token must match the *start* of at least one candidate token,
 * consumed in order (greedy forward match).  This gives users tolerant
 * search behaviour (issue #8404) while still being precise enough to avoid
 * excessive noise.
 *
 * The search string for each model is built from:
 *   model.name  +  model.providerName  +  model.providerID  +  model.id
 * so typing a provider name (e.g. "openai") narrows results to that provider.
 */

/**
 * Split a string into lowercase tokens at separator boundaries.
 * Separators: dots, hyphens, underscores, colons, slashes, whitespace,
 * brackets, and parentheses.
 */
const BOUNDARY = /[[\]_.:\s/\\(){}-]+/

export function tokenize(str: string): string[] {
  const parts: string[] = []
  for (const part of str.split(BOUNDARY)) {
    if (part) parts.push(part.toLowerCase())
  }
  return parts
}

/**
 * Returns true when every query token matches the start of a candidate token
 * in forward order.  Tokens are consumed greedily — once a candidate token is
 * matched it cannot be reused by a later query token.
 */
export function matchTokens(query: string[], candidate: string[]): boolean {
  let ci = 0
  for (const qt of query) {
    let found = false
    while (ci < candidate.length) {
      if (candidate[ci]!.startsWith(qt)) {
        ci++
        found = true
        break
      }
      ci++
    }
    if (!found) return false
  }
  return true
}

/**
 * Test whether `query` matches the given model search fields.
 * Returns true if every query token is a prefix of a word in the combined
 * search string (name + providerName + providerID + id).
 */
export function matchModel(query: string, name: string, provider: string, pid: string, id: string): boolean {
  const qtokens = tokenize(query)
  if (qtokens.length === 0) return true
  const candidate = tokenize(`${name} ${provider} ${pid} ${id}`)
  return matchTokens(qtokens, candidate)
}
