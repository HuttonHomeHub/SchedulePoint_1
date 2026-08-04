/**
 * Normalise an address the way Better Auth does, so a lookup against our own `users` table finds
 * the row Better Auth's own lookup would have found (ADR-0073 C2.2).
 *
 * **`toLowerCase()` and nothing else.** Read from `better-auth@1.6.25`:
 * `internalAdapter.findUserByEmail` looks up `email.toLowerCase()` with no trimming, and
 * `/sign-up/email` stores `email.toLowerCase()`. Verified against the real handler in
 * `test/auth-attribution.e2e-spec.ts` rather than inferred.
 *
 * **Trimming would be a defect, not a courtesy.** `" jane@x.com"` is an address Better Auth would
 * never have matched — it looks up the untrimmed lowercase form, which no stored row can equal — so
 * trimming it into a match would attribute a sign-in attempt to a user whose account was never
 * actually reachable by that input. On the one screen that tells somebody they may be under attack,
 * a false positive is worse than a miss.
 *
 * This exists as one shared function for the `client-ip.ts` reason: two implementations of one
 * external library's rule drift, and the drift is invisible — a lookup that silently stops matching
 * looks exactly like "nobody has been probed".
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase();
}
