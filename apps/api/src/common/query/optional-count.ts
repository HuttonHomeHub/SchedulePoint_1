import type { PinoLogger } from 'nestjs-pino';

/**
 * Take a child count, or report that it could not be taken.
 *
 * **The return is `number | undefined`, never `number` with a zero fallback**, and that is the whole
 * point of the helper existing rather than a `.catch(() => 0)` at each call site. `0` is a claim
 * that there are none (ADR-0126, ADR-0098's "omitted, never zeroed"), and nothing downstream — not
 * a DTO, not a screen, not a reader — can tell a fabricated zero from a real one. An absent count
 * renders as nothing; a wrong one renders as a fact.
 *
 * **What can realistically fail here is narrow, and saying so is what stops this growing.** By the
 * time a count is issued the subject row has already been resolved (404 otherwise), so the
 * connection is up; each count is a `COUNT(*)` on a matched btree. That leaves a **statement
 * timeout**, which is a real state for exactly one of this epic's four counts — a project's
 * activities, the only unbounded one. The other three are bounded by structures a human made. This
 * helper exists so that one case does not take a whole detail read down with it, and so the other
 * three cost nothing to protect.
 *
 * The failure is **logged with its subject**, because a count silently vanishing from a screen is
 * indistinguishable from a count nobody asked for.
 */
export async function optionalCount(
  take: () => Promise<number>,
  onFailure: { logger: PinoLogger; count: string; subjectId: string },
): Promise<number | undefined> {
  try {
    return await take();
  } catch (error) {
    onFailure.logger.warn(
      { err: error, count: onFailure.count, subjectId: onFailure.subjectId },
      'child count could not be taken; it is omitted from the response rather than reported as zero',
    );
    return undefined;
  }
}
