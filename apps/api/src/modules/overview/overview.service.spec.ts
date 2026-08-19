import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError } from '../../common/errors/domain-errors';
import type { AppConfigService } from '../../config/app-config.service';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { HeldLockRow, RecentlyChangedRow } from './overview.repository';
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
    changedByUserId: 'user-2',
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
    countPendingInvitations: Mocked;
    countExpiringDeleted: Mocked;
    hasActiveClients: Mocked;
    hasActivePlans: Mocked;
    resolveMemberNames: Mocked;
    resolveRecentPlans: Mocked;
  };
  let appConfig: { retentionHierarchyDays: number; retentionHierarchyEnabled: boolean };
  let service: OverviewService;

  function build(): OverviewService {
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    return new OverviewService(
      organizations as unknown as OrganizationsService,
      repo as unknown as never,
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
      countPendingInvitations: vi.fn().mockResolvedValue(2),
      countExpiringDeleted: vi.fn().mockResolvedValue(1),
      hasActiveClients: vi.fn().mockResolvedValue(true),
      hasActivePlans: vi.fn().mockResolvedValue(true),
      resolveMemberNames: vi.fn().mockResolvedValue(new Map()),
      resolveRecentPlans: vi.fn().mockResolvedValue([]),
    };
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
      expect(overview.attention).not.toHaveProperty('pendingInvitationCount');
      expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
      expect(repo.countPendingInvitations).not.toHaveBeenCalled();
      expect(repo.countExpiringDeleted).not.toHaveBeenCalled();
    });

    it('sends the invitation count only to a caller who may read invitations', async () => {
      const overview = await service.get(principalWith(['client:read', 'invitation:read']), 'acme');
      expect(overview.attention.pendingInvitationCount).toBe(2);
      expect(overview.attention).not.toHaveProperty('expiringDeletedCount');
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
