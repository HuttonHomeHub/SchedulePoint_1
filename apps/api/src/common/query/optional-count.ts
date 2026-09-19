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
 * connection is up; each count is a `COUNT(*)` on a matched btree. What is left is a **thrown**
 * error — a dropped connection, a Prisma failure — on a read that is not load-bearing for the page
 * it serves. This helper exists so that such a case does not take a whole detail read down with it,
 * and so the bounded counts cost nothing to protect.
 *
 * **It is NOT a circuit-breaker against slowness, and this docblock claimed it was.** The first
 * version named a statement timeout as the realistic failure for the one unbounded count (a
 * project's activities) — and there is **no `statement_timeout` configured anywhere in this
 * application** (`docs/TECH_DEBT.md`, the ADR-0140 D6 row, which records that giving every raw
 * query one is a shared-mechanism decision of its own). So a pathologically slow count does not
 * reach this `catch` at all: it runs to completion holding the request and a connection open. At
 * the measured scale that is not a live risk — 21.96 ms at 120,000 activities, index-only and
 * linear (`docs/specs/page-composition/m5/fc9-run-2.md`) — but a docblock implying a protection
 * that does not exist is worse than one admitting the gap, so this count is a named trigger for
 * that pending cross-cutting work. Found by the M8 backend-performance review, which checked the
 * claim against the tree rather than reading it.
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
