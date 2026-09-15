import type { Prisma } from '@prisma/client';

/**
 * What "pending" means for an invitation, in ONE place.
 *
 * **It had two meanings and they disagreed.** `InvitationRepository.findManyPendingByOrg` filtered
 * on `status: 'PENDING'` **and** `deletedAt: null` (through its `active()` helper);
 * `OverviewRepository.countPendingInvitations` filtered on `status` alone. So a soft-deleted
 * invitation was counted by the landing and absent from the list the landing sends you to — the
 * ADR-0065/ADR-0121 shape, where two implementations of one rule drift and the drift is invisible
 * because each file reads correctly on its own.
 *
 * Neither read `expiresAt` at all, which is the second half. An invitation whose lease has lapsed
 * keeps `status = 'PENDING'` for ever — nothing reaps it, and ADR-0085 D1's reasoning is why
 * nothing should start now on a landing page's account — so it is listed, counted, and refused by
 * `accept()` with "This invitation has expired." (`invitations.service.ts:217-219`). A count that
 * calls that "pending" is telling the reader to chase something that cannot be accepted.
 *
 * **Expiry is compared against ONE instant the caller passes in, and that is the load-bearing
 * property.** It is not that the instant comes from a particular clock; it is that `live` and
 * `expired` are computed against the *same* one. Given two instants, an invitation expiring between
 * them lands in neither count or in both, and the landing prints a total that does not match the
 * list it links to — which is the defect this helper exists to remove, reintroduced one layer down.
 * Taking a `Date` parameter makes that impossible by construction; deriving `now()` inside each
 * query would make it a race.
 *
 * > The approved plan's risk line said to compute the split "in one SQL expression against
 * > `now()`, matching how `findHeldLocks` already evaluates lease expiry server-side".
 * > `findHeldLocks` does **not**: `overview.repository.ts:156` writes
 * > `expiresAt: { gt: new Date() }` — Node's clock, sent as a bind parameter. A claim about
 * > existing code, used as the model for a new decision, and wrong (ADR-0076 Class 2). Following
 * > it would also have split one instant into two separate `now()` evaluations in two separate
 * > statements, which is the race above. The precedent is kept; only the reason changes, and the
 * > plan is corrected rather than quietly departed from.
 *
 * On a single-host deployment the two clocks are the same clock, so nothing is lost by the
 * choice; what is gained is that the two counts cannot disagree with each other.
 */
export function pendingInvitationWhere(organizationId: string): Prisma.InvitationWhereInput {
  return { organizationId, status: 'PENDING', deletedAt: null };
}

/**
 * A pending invitation somebody can still accept.
 *
 * `expiresAt > now` is strict, so an invitation expiring at this exact instant is not live.
 *
 * **That is STRICTER than `accept()`, not the same as it**, and the docblock said "matching" until
 * the M6 UX review read both: `invitations.service.ts:217` refuses on
 * `expiresAt.getTime() < Date.now()`, so at the one instant where `expiresAt === now` it still
 * accepts while this predicate already calls the invitation expired. The window is a single
 * millisecond that two separate HTTP requests would have to land in, so nothing is chased — but a
 * file this careful about boundaries should not carry a false "matching" (ADR-0076 Class 3), and
 * the direction is the safe one: the landing under-counts what is live rather than offering a
 * reader an invitation the API would refuse.
 */
export function liveInvitationWhere(
  organizationId: string,
  now: Date,
): Prisma.InvitationWhereInput {
  return { ...pendingInvitationWhere(organizationId), expiresAt: { gt: now } };
}

/**
 * A pending invitation whose lease has lapsed — still `PENDING`, and no longer acceptable.
 *
 * This is deliberately a SEPARATE count rather than a subtraction. "Live minus pending" would be
 * arithmetic the reader has to do, and the two numbers are read at different moments by different
 * queries, so a subtraction can go negative under concurrency and print a nonsense.
 */
export function expiredInvitationWhere(
  organizationId: string,
  now: Date,
): Prisma.InvitationWhereInput {
  return { ...pendingInvitationWhere(organizationId), expiresAt: { lte: now } };
}
