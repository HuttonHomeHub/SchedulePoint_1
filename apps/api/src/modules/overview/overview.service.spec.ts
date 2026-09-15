import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import type { AppConfigService } from '../../config/app-config.service';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { HeldLockRow, PlanStandingRow, RecentlyChangedRow } from './overview.repository';
import { OverviewService } from './overview.service';

const ORG_ID = 'org-1';
const ORG_NAME = 'Acme Construction';
const USER_ID = 'user-1';

function changedRow(overrides: Partial<RecentlyChangedRow> = {}): RecentlyChangedRow {
  return {
    planId: 'plan-1',
    planName: 'Tower B',
    projectId: 'project-1',
    projectName: 'Riverside',
    clientName: 'Riverside Developments',
    status: 'ACTIVE',
    changedAt: new Date('2026-08-18T09:41:07.221Z'),
    scheduleComputedAt: new Date('2026-08-18T09:41:07.221Z'),
    editedSinceCalculated: false,
    changedByUserId: 'user-2',
    ...overrides,
  };
}

function standingRow(overrides: Partial<PlanStandingRow> = {}): PlanStandingRow {
  return {
    planId: 'plan-1',
    planName: 'Tower B',
    projectName: 'Riverside',
    clientName: 'Riverside Developments',
    status: 'ACTIVE',
    scheduleComputedAt: new Date('2026-08-18T09:41:07.221Z'),
    editedSinceCalculated: false,
    projectFinish: '2026-10-09',
    activityCount: 24,
    baselineFinish: '2026-09-25',
    baselineName: 'Contract award',
    // 1440 = an all-day calendar, so a working-day walk over the all-minutes port is whole
    // calendar days and the arithmetic below is checkable by hand.
    baselineHoursPerDayMinutes: 1440,
    planCalendarId: null,
    constraintViolatedCount: 0,
    loeNoSpanCount: 0,
    resourceDriverMissingCount: 0,
    visualConflictCount: 0,
    ...overrides,
  };
}

function lockRow(overrides: Partial<HeldLockRow> = {}): HeldLockRow {
  return { planId: 'plan-1', planName: 'Tower B', requestedByUserId: null, ...overrides };
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

describe('OverviewService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  type Mocked = ReturnType<typeof vi.fn>;
  let repo: {
    findRecentlyChanged: Mocked;
    findHeldLocks: Mocked;
    countInvitations: Mocked;
    countExpiringDeleted: Mocked;
    hasActiveClients: Mocked;
    hasActivePlans: Mocked;
    resolveMemberNames: Mocked;
    resolveRecentPlans: Mocked;
    findPlanStanding: Mocked;
  };
  let baselines: { loadPlanCalendar: ReturnType<typeof vi.fn> };
  let appConfig: { retentionHierarchyDays: number; retentionHierarchyEnabled: boolean };
  let service: OverviewService;

  function build(): OverviewService {
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    return new OverviewService(
      organizations as unknown as OrganizationsService,
      repo as unknown as never,
      baselines as unknown as never,
      appConfig as unknown as AppConfigService,
      logger,
    );
  }

  beforeEach(() => {
    organizations = {
      resolveScope: vi
        .fn()
        .mockResolvedValue({ organization: { id: ORG_ID, name: ORG_NAME }, role: 'PLANNER' }),
    };
    repo = {
      findRecentlyChanged: vi.fn().mockResolvedValue([]),
      findHeldLocks: vi.fn().mockResolvedValue([]),
      countInvitations: vi.fn().mockResolvedValue({ live: 2, expired: 1 }),
      countExpiringDeleted: vi.fn().mockResolvedValue(1),
      hasActiveClients: vi.fn().mockResolvedValue(true),
      hasActivePlans: vi.fn().mockResolvedValue(true),
      resolveMemberNames: vi.fn().mockResolvedValue(new Map()),
      resolveRecentPlans: vi.fn().mockResolvedValue([]),
      findPlanStanding: vi.fn().mockResolvedValue([]),
    };
    // Null = a plan with no calendar of its own, which resolves to all-minutes-work exactly as a
    // recalculation resolves it. Cases that need a real calendar override this.
    baselines = { loadPlanCalendar: vi.fn().mockResolvedValue(null) };
    // A non-default period on purpose: a test written against 90 cannot tell a configured
    // value from a hardcoded one.
    appConfig = { retentionHierarchyDays: 45, retentionHierarchyEnabled: true };
    service = build();
  });

  it('denies a caller without the hierarchy read', async () => {
    await expect(service.get(principalWith([]), 'acme')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('issues no read at all when the caller is denied', async () => {
    await expect(service.get(principalWith([]), 'acme')).rejects.toBeInstanceOf(ForbiddenError);
    // The point of gating before the read rather than filtering after it: a denial costs
    // nothing, and there is no result sitting in memory for a later refactor to leak.
    expect(repo.findRecentlyChanged).not.toHaveBeenCalled();
    expect(repo.findHeldLocks).not.toHaveBeenCalled();
  });

  describe('the section-omission matrix', () => {
    it('omits both counts for a reader who may see neither', async () => {
      const overview = await service.get(principalWith(['client:read']), 'acme');

      // Omitted, NOT zero. A zero is a fact about the organisation; an absence is a fact
      // about the reader, and `0` would tell a Contributor there is an answer they may not
      // have.
      expect(overview.attention).not.toHaveProperty('liveInvitationCount');
      expect(overview.attention).not.toHaveProperty('expiredInvitationCount');
      expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
      expect(repo.countInvitations).not.toHaveBeenCalled();
      expect(repo.countExpiringDeleted).not.toHaveBeenCalled();
    });

    it('sends BOTH invitation counts only to a caller who may read invitations', async () => {
      const overview = await service.get(principalWith(['client:read', 'invitation:read']), 'acme');
      expect(overview.attention.liveInvitationCount).toBe(2);
      expect(overview.attention.expiredInvitationCount).toBe(1);
      expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
    });

    // **The pair appears together or not at all.** They are one permission and one read, so a
    // payload carrying "1 has expired" without saying whether any are live would read as worse
    // news than it is. Asserted as a pair rather than twice, because two separate assertions pass
    // against a payload carrying exactly one of them.
    it('never sends one invitation count without the other', async () => {
      for (const permissions of [['client:read'], ['client:read', 'invitation:read']] as const) {
        const { attention } = await service.get(principalWith([...permissions]), 'acme');
        expect('liveInvitationCount' in attention).toBe('expiredInvitationCount' in attention);
      }
    });

    it('sends the expiring count only to a writer, and only when retention is armed', async () => {
      const overview = await service.get(principalWith(['client:read', 'plan:delete']), 'acme');
      expect(overview.attention.expiringDeletedCount).toBe(1);
    });

    it('omits the expiring count on a host where retention is not armed', async () => {
      appConfig.retentionHierarchyEnabled = false;
      service = build();

      const overview = await service.get(principalWith(['client:read', 'plan:delete']), 'acme');

      // Nothing expires on an unarmed host, so a count here would be a deadline the product
      // does not keep — the ADR-0096 honesty rule, one screen along.
      expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
      expect(repo.countExpiringDeleted).not.toHaveBeenCalled();
    });

    it('warns seven days ahead of the configured period, not a proportion of it', async () => {
      const now = new Date('2026-08-18T00:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        await service.get(principalWith(['client:read', 'plan:delete']), 'acme');
      } finally {
        vi.useRealTimers();
      }

      // 45 - 7 = 38 days ago. A proportion of the period would give a host running a
      // 3,650-day retention a warning window measured in years.
      const call = repo.countExpiringDeleted.mock.calls[0]?.[0] as { before: Date };
      expect(call.before.toISOString()).toBe('2026-07-11T00:00:00.000Z');
    });
  });

  describe('actor resolution', () => {
    it('names a current member', async () => {
      repo.findRecentlyChanged.mockResolvedValue([changedRow({ changedByUserId: 'user-2' })]);
      repo.resolveMemberNames.mockResolvedValue(new Map([['user-2', 'Sarah Okonkwo']]));

      const overview = await service.get(principalWith(['client:read']), 'acme');

      expect(overview.recentlyChanged[0]?.changedBy).toEqual({
        kind: 'MEMBER',
        name: 'Sarah Okonkwo',
      });
    });

    it('reports a non-member id as a former member rather than a name', async () => {
      repo.findRecentlyChanged.mockResolvedValue([changedRow({ changedByUserId: 'outsider' })]);
      repo.resolveMemberNames.mockResolvedValue(new Map());

      const overview = await service.get(principalWith(['client:read']), 'acme');

      // The control this endpoint rests on: an id that is not a member of THIS organisation
      // resolves to nothing, so the endpoint cannot turn an arbitrary user id into a
      // display name.
      expect(overview.recentlyChanged[0]?.changedBy).toEqual({ kind: 'FORMER_MEMBER' });
    });

    it('keeps "we do not know" apart from "they have left"', async () => {
      repo.findRecentlyChanged.mockResolvedValue([changedRow({ changedByUserId: null })]);

      const overview = await service.get(principalWith(['client:read']), 'acme');

      // Three facts, three answers. A nullable name would collapse the last two into an
      // absence the reader cannot tell from a defect.
      expect(overview.recentlyChanged[0]?.changedBy).toEqual({ kind: 'UNKNOWN' });
    });

    it('resolves every actor on the page in one batched call', async () => {
      repo.findRecentlyChanged.mockResolvedValue([
        changedRow({ planId: 'p1', changedByUserId: 'user-2' }),
        changedRow({ planId: 'p2', changedByUserId: 'user-3' }),
      ]);
      repo.findHeldLocks.mockResolvedValue([lockRow({ requestedByUserId: 'user-4' })]);

      await service.get(principalWith(['client:read']), 'acme');

      expect(repo.resolveMemberNames).toHaveBeenCalledTimes(1);
      expect(repo.resolveMemberNames.mock.calls[0]?.[0]).toEqual({
        organizationId: ORG_ID,
        userIds: ['user-2', 'user-3', 'user-4'],
      });
    });
  });

  describe('held pens', () => {
    it('puts a pen somebody is waiting for above one nobody has asked about', async () => {
      repo.findHeldLocks.mockResolvedValue([
        lockRow({ planId: 'quiet', requestedByUserId: null }),
        lockRow({ planId: 'wanted', requestedByUserId: 'user-9' }),
      ]);
      repo.resolveMemberNames.mockResolvedValue(new Map([['user-9', 'Priya Nair']]));

      const overview = await service.get(principalWith(['client:read']), 'acme');

      // The only item on this screen with another person blocked behind it.
      expect(overview.attention.heldLocks.map((lock) => lock.planId)).toEqual(['wanted', 'quiet']);
      expect(overview.attention.heldLocks[0]?.requestedBy).toEqual({
        kind: 'MEMBER',
        name: 'Priya Nair',
      });
      expect(overview.attention.heldLocks[1]?.requestedBy).toBeNull();
    });

    it('asks only for the calling user’s own pens', async () => {
      await service.get(principalWith(['client:read']), 'acme');
      expect(repo.findHeldLocks.mock.calls[0]?.[0]).toMatchObject({
        organizationId: ORG_ID,
        userId: USER_ID,
      });
    });
  });

  describe('the empty states', () => {
    it('calls an organisation with no active clients new', async () => {
      repo.hasActiveClients.mockResolvedValue(false);
      repo.hasActivePlans.mockResolvedValue(false);

      const overview = await service.get(principalWith(['client:read']), 'acme');

      expect(overview.isNewOrganisation).toBe(true);
      expect(overview.hasPlans).toBe(false);
    });

    it('distinguishes "set up but no plans yet" from "brand new"', async () => {
      repo.hasActiveClients.mockResolvedValue(true);
      repo.hasActivePlans.mockResolvedValue(false);

      const overview = await service.get(principalWith(['client:read']), 'acme');

      // Two different situations with two different next steps: create a project, or create
      // a plan. One flag could not tell them apart.
      expect(overview.isNewOrganisation).toBe(false);
      expect(overview.hasPlans).toBe(false);
    });
  });

  it('serves the resolved organisation name', async () => {
    const overview = await service.get(principalWith(['client:read']), 'acme');
    expect(overview.organisationName).toBe(ORG_NAME);
  });

  // **The jump-back-in section had NO service coverage at all**, which is why the M3 slice could
  // add `resolveRecentPlans` to the repository and leave this spec's hand-built repo mock without
  // it: the mock is cast at the boundary, so the compiler cannot see the gap and 14 cases failed
  // at run time on a method that simply was not there. These two cover the section's two decisions.
  describe('jump back in', () => {
    const ROWS = [
      { planId: 'p2', planName: 'Tower B', projectName: 'Riverside', clientName: 'Northgate' },
      { planId: 'p1', planName: 'Tower A', projectName: 'Riverside', clientName: 'Northgate' },
    ];

    it("returns the caller's order, not the database's", async () => {
      repo.resolveRecentPlans.mockResolvedValue(ROWS);
      const overview = await service.get(principalWith(['client:read']), 'acme', ['p1', 'p2']);
      // `findMany` makes no promise about the order of an `IN`, so the mock deliberately answers
      // in the reverse of the request. The browser's recency is the order that means something.
      expect(overview.recentPlans.map((row) => row.planId)).toEqual(['p1', 'p2']);
    });

    it('drops an id the organisation cannot resolve, without saying which or why', async () => {
      repo.resolveRecentPlans.mockResolvedValue([ROWS[1]]);
      const overview = await service.get(principalWith(['client:read']), 'acme', [
        'p1',
        'deleted-or-another-orgs',
      ]);
      // The four failure modes are indistinguishable by design (ADR-0098): deleted, another
      // organisation's, unreadable, never real. A dropped row is silence, not an error.
      expect(overview.recentPlans).toHaveLength(1);
      expect(overview.recentPlans[0]?.planId).toBe('p1');
    });
  });
});

/**
 * **The standing section's gate, and the read it is supposed to prevent.**
 *
 * The plan's own risk for this task is "issuing and filtering" — the shape ADR-0098 refuses,
 * where the payload is right and the cost is paid anyway and the next refactor to touch the
 * projection leaks it. So the assertion is not only that the field is absent: it is that
 * `findPlanStanding` was **never called**. A test asserting absence alone passes perfectly against
 * a service that reads the whole section and then deletes it.
 */
describe('OverviewService — where the work stands', () => {
  type Mocked = ReturnType<typeof vi.fn>;
  let organizations: { resolveScope: Mocked };
  // Named rather than `Record<string, Mocked>`: `noUncheckedIndexedAccess` makes every lookup on an
  // index signature possibly-undefined, and the `?.` that silences it would silence a typo too.
  let repo: {
    findRecentlyChanged: Mocked;
    findHeldLocks: Mocked;
    countInvitations: Mocked;
    countExpiringDeleted: Mocked;
    hasActiveClients: Mocked;
    hasActivePlans: Mocked;
    resolveMemberNames: Mocked;
    resolveRecentPlans: Mocked;
    findPlanStanding: Mocked;
  };
  let baselines: { loadPlanCalendar: Mocked };
  let service: OverviewService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi
        .fn()
        .mockResolvedValue({ organization: { id: ORG_ID, name: ORG_NAME }, role: 'PLANNER' }),
    };
    repo = {
      findRecentlyChanged: vi.fn().mockResolvedValue([changedRow()]),
      findHeldLocks: vi.fn().mockResolvedValue([]),
      countInvitations: vi.fn().mockResolvedValue({ live: 0, expired: 0 }),
      countExpiringDeleted: vi.fn().mockResolvedValue(0),
      hasActiveClients: vi.fn().mockResolvedValue(true),
      hasActivePlans: vi.fn().mockResolvedValue(true),
      resolveMemberNames: vi.fn().mockResolvedValue(new Map()),
      resolveRecentPlans: vi.fn().mockResolvedValue([]),
      findPlanStanding: vi.fn().mockResolvedValue([standingRow()]),
    };
    baselines = { loadPlanCalendar: vi.fn().mockResolvedValue(null) };
    service = new OverviewService(
      organizations as unknown as OrganizationsService,
      repo as unknown as never,
      baselines as unknown as never,
      {
        retentionHierarchyDays: 45,
        retentionHierarchyEnabled: false,
      } as unknown as AppConfigService,
      { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
    );
  });

  it('never issues the read for a caller without schedule:read', async () => {
    const result = await service.get(principalWith(['client:read']), 'acme');

    expect(repo.findPlanStanding).not.toHaveBeenCalled();
    // OMITTED, not empty. "You cannot see this" and "there is nothing to see" are different facts,
    // and `[]` collapses the first into the second.
    expect('planStanding' in result).toBe(false);
  });

  it('is present and EMPTY for a reader with nothing to stand on', async () => {
    repo.findPlanStanding.mockResolvedValue([]);

    const result = await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    // The other half of the pair. Without it the assertion above passes equally against a service
    // that omits the field for everybody, and a green suite could not tell the gate from the
    // section being gone (ADR-0093's pinned positive case).
    expect(result.planStanding).toEqual([]);
  });

  it('reports the movement, and only the flags that are not zero', async () => {
    repo.findPlanStanding.mockResolvedValue([
      standingRow({ constraintViolatedCount: 2, visualConflictCount: 0 }),
    ]);

    const result = await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    expect(result.planStanding?.[0]?.baselineMovement).toEqual({
      kind: 'MOVED',
      // 2026-09-25 → 2026-10-09 on an all-minutes calendar at 1440 min/day: fourteen days later.
      workingDays: 14,
      baselineFinish: '2026-09-25',
      baselineName: 'Contract award',
    });
    expect(result.planStanding?.[0]?.flags).toEqual({ constraintViolated: 2 });
  });

  it('orders the rows as "Recently changed" orders them, not as the database returns them', async () => {
    repo.findRecentlyChanged.mockResolvedValue([
      changedRow({ planId: 'a' }),
      changedRow({ planId: 'b' }),
      changedRow({ planId: 'c' }),
    ]);
    // The read filters on `id = ANY(...)` with no ORDER BY, so Postgres may hand back any order
    // and need not be consistent between two executions. Reversed here to stand for that.
    repo.findPlanStanding.mockResolvedValue([
      standingRow({ planId: 'c' }),
      standingRow({ planId: 'a' }),
      standingRow({ planId: 'b' }),
    ]);

    const result = await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    expect(result.planStanding?.map((row) => row.planId)).toEqual(['a', 'b', 'c']);
  });

  it('drops a plan the standing read did not return, rather than leaving a hole', async () => {
    repo.findRecentlyChanged.mockResolvedValue([
      changedRow({ planId: 'a' }),
      changedRow({ planId: 'b' }),
    ]);
    // The read excludes ARCHIVED and soft-deleted plans independently, so the two lists can
    // legitimately differ by a row. `undefined` must never reach the payload.
    repo.findPlanStanding.mockResolvedValue([standingRow({ planId: 'b' })]);

    const result = await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    expect(result.planStanding?.map((row) => row.planId)).toEqual(['b']);
  });

  it('resolves each distinct calendar ONCE, however many plans share it', async () => {
    // The recently-changed list is what the standing section is ordered and filtered by, so a
    // fixture whose two lists name different plans measures the filter rather than the calendars.
    repo.findRecentlyChanged.mockResolvedValue(
      ['a', 'b', 'c', 'd'].map((planId) => changedRow({ planId })),
    );
    repo.findPlanStanding.mockResolvedValue([
      standingRow({ planId: 'a', planCalendarId: 'cal-1' }),
      standingRow({ planId: 'b', planCalendarId: 'cal-1' }),
      standingRow({ planId: 'c', planCalendarId: 'cal-2' }),
      standingRow({ planId: 'd', planCalendarId: null }),
    ]);

    await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    // Two reads for four plans — the measured shape, where seven calendars serve 4,032 plans. A
    // per-row resolution would read four times and nothing about the payload would differ.
    expect(baselines.loadPlanCalendar).toHaveBeenCalledTimes(2);
    expect(baselines.loadPlanCalendar.mock.calls.map((call) => call[1]).sort()).toEqual([
      'cal-1',
      'cal-2',
    ]);
  });

  it('answers CALENDAR_UNUSABLE for one bad calendar rather than failing the landing', async () => {
    // A window-only base week with no working exception — reachable from ordinary input
    // (`docs/TECH_DEBT.md` #79), and what `buildPlanCalendarOrReject` turns into a 422.
    baselines.loadPlanCalendar.mockResolvedValue({ name: 'Emptied', shifts: [], exceptions: [] });
    repo.findRecentlyChanged.mockResolvedValue(
      ['bad', 'good'].map((planId) => changedRow({ planId })),
    );
    repo.findPlanStanding.mockResolvedValue([
      standingRow({ planId: 'bad', planCalendarId: 'cal-1' }),
      standingRow({ planId: 'good', planCalendarId: null }),
    ]);

    const result = await service.get(principalWith(['client:read', 'schedule:read']), 'acme');

    // The landing came back at all — which is the assertion. One plan of eight on an emptied
    // calendar must not be the reason nobody in the organisation can sign in to anything.
    expect(result.planStanding).toHaveLength(2);
    expect(result.planStanding?.[0]?.baselineMovement).toEqual({
      kind: 'NOT_ASSESSABLE',
      reason: 'CALENDAR_UNUSABLE',
    });
    // Its neighbour is unaffected — the fault is per row, not per request.
    expect(result.planStanding?.[1]?.baselineMovement).toMatchObject({ kind: 'MOVED' });
  });
});
