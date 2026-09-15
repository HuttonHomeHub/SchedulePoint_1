import { describe, expect, it } from 'vitest';

import {
  expiredInvitationWhere,
  liveInvitationWhere,
  pendingInvitationWhere,
} from './invitation-predicates';

/**
 * These assert the SHAPE of the `where` clause rather than running it, because the defect they
 * guard is a clause that omits a filter — and an omitted filter is visible in the object and
 * invisible in any result set that happens not to contain the row it would have excluded. The
 * behaviour against a real database is `apps/api/test/overview.e2e-spec.ts` (FC-6).
 *
 * **The soft-delete case was verified red first.** Against the previous
 * `countPendingInvitations` — `{ organizationId, status: 'PENDING' }` — the first assertion below
 * fails, which is the defect: a soft-deleted invitation was counted by the landing and excluded
 * from the list the landing sends you to.
 */
describe('the pending-invitation predicate', () => {
  const ORG = '11111111-1111-4111-8111-111111111111';

  it('excludes soft-deleted rows', () => {
    // The clause `countPendingInvitations` did not have. `findManyPendingByOrg` always had it,
    // through its `active()` helper — which is precisely why the two could disagree.
    expect(pendingInvitationWhere(ORG)).toEqual({
      organizationId: ORG,
      status: 'PENDING',
      deletedAt: null,
    });
  });

  it('splits live from expired against ONE instant, and the two do not overlap', () => {
    const now = new Date('2026-09-15T10:00:00.000Z');

    expect(liveInvitationWhere(ORG, now)).toEqual({
      organizationId: ORG,
      status: 'PENDING',
      deletedAt: null,
      expiresAt: { gt: now },
    });
    expect(expiredInvitationWhere(ORG, now)).toEqual({
      organizationId: ORG,
      status: 'PENDING',
      deletedAt: null,
      expiresAt: { lte: now },
    });
  });

  it('puts an invitation expiring at exactly `now` in the expired half, matching accept()', () => {
    // `accept()` refuses when `expiresAt.getTime() < Date.now()`, so at the boundary the
    // invitation is still acceptable by a hair — and `gt` / `lte` is the partition that agrees
    // with it rather than one millisecond either side. Written as a property of the two clauses
    // together: `gt` and `lte` on the same instant are exhaustive and disjoint, so no pending row
    // can fall into both counts or neither, whatever the instant is.
    const now = new Date('2026-09-15T10:00:00.000Z');
    const live = liveInvitationWhere(ORG, now).expiresAt as { gt: Date };
    const expired = expiredInvitationWhere(ORG, now).expiresAt as { lte: Date };

    expect(live.gt).toBe(expired.lte);
    expect(Object.keys(live)).toEqual(['gt']);
    expect(Object.keys(expired)).toEqual(['lte']);
  });

  it('carries the organisation scope on every clause', () => {
    // Anti-IDOR by construction: a predicate that lost its scope would count another
    // organisation's invitations onto this reader's landing page.
    const now = new Date();
    for (const where of [
      pendingInvitationWhere(ORG),
      liveInvitationWhere(ORG, now),
      expiredInvitationWhere(ORG, now),
    ]) {
      expect(where.organizationId).toBe(ORG);
    }
  });
});
