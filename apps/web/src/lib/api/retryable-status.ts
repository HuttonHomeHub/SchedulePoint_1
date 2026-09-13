/**
 * Which HTTP statuses are worth sending the same request again for — the app's ONE answer.
 *
 * **This lived in `features/perf-probe/model/store-failure.ts` and was right there and wrong
 * everywhere else** (`docs/TECH_DEBT.md` #314). That file was written for ledgered `#269` and named
 * the trap in as many words; meanwhile `lib/query/query-client.ts` shipped the exact rule #269
 * warns about — `status >= 400 && status < 500 → false` — under a docblock asserting that "client
 * errors are not transient". One decision, two files, opposite answers, which is this register's
 * commonest shape.
 *
 * It is here rather than in either consumer because a feature model cannot be the app's default:
 * importing `features/perf-probe/` from `lib/query/` points the dependency the wrong way, and
 * restating the set in the query client is the second copy #269 deliberately put in one file.
 *
 * **The statuses, and why each** — the decision, moved verbatim from its first home:
 *
 * - **No status at all** — the request never reached an answer. Retryable: a dropped socket, a
 *   sleeping laptop, an offline moment.
 * - **5xx** — the server failed on a body whose shape it accepted. Retryable.
 * - **429** — a 4xx, and the one 4xx that exists precisely to say _this would have worked, come
 *   back in a moment_. Named explicitly because a blanket "4xx cannot be retried" rule gets this
 *   one wrong, which is the whole of #314.
 * - **408 / 425** — the request timed out, or arrived too early. Both are about timing rather than
 *   content, so the same body can succeed.
 * - **Every other 4xx** — the server refuses THIS body, and a retry sends exactly the same body.
 *
 * A status outside 4xx and 5xx cannot normally reach here (a 2xx does not throw, a 3xx is
 * followed) and is treated as retryable rather than asserted away: an unrecognised failure is one
 * nobody has reasoned about, and taking the cheap action beats withholding it on a guess.
 *
 * **What a retry does NOT fix, stated so nobody reads more into this than it does.** A 429 from the
 * API's `ThrottlerGuard` is a fixed-window counter, default 100 per 60 s, so TanStack Query's
 * default backoff (~1 s then ~2 s) will not outlast a bucket a caller has genuinely exhausted. This
 * rule clears a burst, a timeout and a race; a sustained 429 is cleared by the error screen's
 * **Try again**, which is why #314's two halves shipped together rather than the retry alone.
 */
export const RETRYABLE_4XX: ReadonlySet<number> = new Set([408, 425, 429]);

/**
 * The numeric HTTP status carried by a thrown error, or `null` when it carries none.
 *
 * Structural rather than `instanceof ApiFetchError`: this must also survive whatever a raw fetch
 * rejection or a future client wrapper throws, and the only thing it needs is a numeric `status`.
 * `'status' in error` narrows, so no assertion is required to read it.
 */
export function readErrorStatus(error: unknown): number | null {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null;
}

/**
 * Whether re-sending the identical request could plausibly succeed.
 *
 * Takes the status rather than the error so a caller that already has one (the perf-probe panel,
 * which needs the number for its copy as well) cannot read it twice and get two answers.
 */
export function isRetryableStatus(status: number | null): boolean {
  if (status === null) return true;
  if (status >= 500) return true;
  if (RETRYABLE_4XX.has(status)) return true;
  return status < 400;
}
