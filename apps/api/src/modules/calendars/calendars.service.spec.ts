import { Prisma, type Calendar, type CalendarException } from '@prisma/client';
import { STANDARD_WEEKDAYS_MASK } from '@repo/types';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { ProjectRepository } from '../projects/project.repository';
import type { ResourceRepository } from '../resources/resource.repository';

import type { CalendarRepository } from './calendar.repository';
import { CalendarsService } from './calendars.service';

const ORG_ID = 'org-1';
const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'user-1';

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    organizationId: ORG_ID,
    name: 'Standard',
    description: null,
    // Every pre-ADR-0053 row is the shared-library tier; the tests opt into PROJECT explicitly.
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    hoursPerDayMinutes: 1440,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

function exception(overrides: Partial<CalendarException> = {}): CalendarException {
  return {
    id: 'exc-1',
    organizationId: ORG_ID,
    calendarId: 'cal-1',
    // A whole-day exception is a single-day inclusive range (ADR-0036 §2).
    startDate: new Date('2026-12-25T00:00:00Z'),
    endDate: new Date('2026-12-25T00:00:00Z'),
    label: 'Christmas Day',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: USER_ID,
    updatedBy: USER_ID,
    deletedAt: null,
    deleteBatchId: null,
    ...overrides,
  };
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6' });
}

/**
 * The exclusion-constraint violation Postgres raises when an exception overlaps an existing one
 * (ADR-0036 replaced the unique index with a GiST EXCLUDE). Prisma surfaces `23P01` as an
 * unknown-request error carrying the raw message (with the constraint name), not a `P2002`.
 */
function exceptionOverlapViolation(): Prisma.PrismaClientUnknownRequestError {
  return new Prisma.PrismaClientUnknownRequestError(
    'conflicting key value violates exclusion constraint "ex_calendar_exceptions_no_overlap"',
    { clientVersion: '6' },
  );
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

const ALL: Permission[] = [
  'calendar:read',
  'calendar:create',
  'calendar:update',
  'calendar:delete',
  'calendar:restore',
  // Writing to the SHARED (ORG-tier) library needs this on top since ADR-0053 §2; Planner and
  // Org Admin both hold it, so the "fully authorised" principal these tests model still does.
  'calendar:manage_org',
];

describe('CalendarsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let calendars: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findArchivedByNameInTier: ReturnType<typeof vi.fn>;
    setArchivedIfVersionMatches: ReturnType<typeof vi.fn>;
    findActiveDetailByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDeleteWithExceptions: ReturnType<typeof vi.fn>;
    countActiveReferencers: ReturnType<typeof vi.fn>;
    countActivePlansUsing: ReturnType<typeof vi.fn>;
    countActiveActivitiesUsing: ReturnType<typeof vi.fn>;
    countPlansUsingOutsideProject: ReturnType<typeof vi.fn>;
    countActivitiesUsingOutsideProject: ReturnType<typeof vi.fn>;
    findManyActiveForProject: ReturnType<typeof vi.fn>;
    createException: ReturnType<typeof vi.fn>;
    findActiveExceptionByIdInCalendar: ReturnType<typeof vi.fn>;
    softDeleteException: ReturnType<typeof vi.fn>;
    touchVersion: ReturnType<typeof vi.fn>;
    findActivePlanIdsUsing: ReturnType<typeof vi.fn>;
    findAnyStateByIdInOrg: ReturnType<typeof vi.fn>;
    findActiveHoldingNameInTier: ReturnType<typeof vi.fn>;
    restoreWithExceptions: ReturnType<typeof vi.fn>;
  };
  let audit: { record: ReturnType<typeof vi.fn> };
  let resources: {
    countActiveResourcesUsingCalendar: ReturnType<typeof vi.fn>;
    countResourcesUsingCalendarAnyState: ReturnType<typeof vi.fn>;
  };
  let projects: {
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findByIdInOrg: ReturnType<typeof vi.fn>;
  };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: CalendarsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    calendars = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findArchivedByNameInTier: vi.fn().mockResolvedValue(null),
      setArchivedIfVersionMatches: vi.fn().mockResolvedValue(1),
      findActiveDetailByIdInOrg: vi.fn(),
      findManyActiveByOrg: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      softDeleteWithExceptions: vi.fn(),
      countActiveReferencers: vi.fn().mockResolvedValue(new Map()),
      countActivePlansUsing: vi.fn().mockResolvedValue(0),
      countActiveActivitiesUsing: vi.fn().mockResolvedValue(0),
      countPlansUsingOutsideProject: vi.fn().mockResolvedValue(0),
      countActivitiesUsingOutsideProject: vi.fn().mockResolvedValue(0),
      findManyActiveForProject: vi.fn(),
      createException: vi.fn(),
      findActiveExceptionByIdInCalendar: vi.fn(),
      softDeleteException: vi.fn(),
      touchVersion: vi.fn(),
      // The plan-set query is proven against a real table in calendars-edited-since.e2e-spec.ts.
      findActivePlanIdsUsing: vi.fn().mockResolvedValue([]),
      findAnyStateByIdInOrg: vi.fn(),
      findActiveHoldingNameInTier: vi.fn().mockResolvedValue(null),
      restoreWithExceptions: vi.fn().mockResolvedValue({ calendars: 1, exceptions: 2 }),
    };
    resources = {
      countActiveResourcesUsingCalendar: vi.fn().mockResolvedValue(0),
      countResourcesUsingCalendarAnyState: vi.fn().mockResolvedValue(0),
    };
    projects = {
      findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
      findByIdInOrg: vi.fn().mockResolvedValue({
        id: PROJECT_ID,
        clientId: 'client-1',
        name: 'Riverside',
        deletedAt: null,
      }),
    };
    // The tx handle exposes $executeRaw (the calendar advisory lock used by remove).
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    // The working-time producers (ADR-0073 C3.2) are proven against a real table in the e2e
    // suite; a fake here could only assert that a fake was called.
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new CalendarsService(
      organizations as unknown as OrganizationsService,
      calendars as unknown as CalendarRepository,
      projects as unknown as ProjectRepository,
      resources as unknown as ResourceRepository,
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      logger,
    );
  });

  describe('create', () => {
    it('creates a calendar for an authorised caller (empty exceptions)', async () => {
      calendars.create.mockResolvedValue(calendar());
      const result = await service.create(principalWith(ALL), 'acme', {
        name: 'Standard',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
      });
      expect(result.id).toBe('cal-1');
      expect(result.exceptions).toEqual([]);
      expect(calendars.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          name: 'Standard',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          description: null,
        }),
      );
    });

    it('forbids a caller without calendar:create', async () => {
      await expect(
        service.create(principalWith(['calendar:read']), 'acme', {
          name: 'X',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate name to a 409', async () => {
      calendars.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.create(principalWith(ALL), 'acme', {
          name: 'Standard',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('get', () => {
    it('404s when the calendar is missing', async () => {
      calendars.findActiveDetailByIdInOrg.mockResolvedValue(null);
      await expect(service.get(principalWith(ALL), 'acme', 'cal-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('returns the calendar with its exceptions', async () => {
      calendars.findActiveDetailByIdInOrg.mockResolvedValue({
        ...calendar(),
        exceptions: [exception()],
      });
      const result = await service.get(principalWith(ALL), 'acme', 'cal-1');
      expect(result.exceptions).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('409s on a stale version', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.updateIfVersionMatches.mockResolvedValue(0);
      await expect(
        service.update(principalWith(ALL), 'acme', 'cal-1', { version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('404s when the calendar is missing', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.update(principalWith(ALL), 'acme', 'cal-1', { name: 'New', version: 1 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('maps a duplicate name to a 409', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.updateIfVersionMatches.mockRejectedValue(uniqueViolation());
      await expect(
        service.update(principalWith(ALL), 'acme', 'cal-1', { name: 'Taken', version: 1 }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('remove', () => {
    it('soft-deletes an existing calendar (with its exceptions)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await service.remove(principalWith(ALL), 'acme', 'cal-1');
      expect(calendars.softDeleteWithExceptions).toHaveBeenCalledWith(
        'cal-1',
        USER_ID,
        expect.anything(),
      );
    });

    it('404s (and does not delete) when the calendar is missing', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(service.remove(principalWith(ALL), 'acme', 'cal-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('409s (CALENDAR_IN_USE) when an active plan references the calendar', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.countActivePlansUsing.mockResolvedValue(2);
      await expect(service.remove(principalWith(ALL), 'acme', 'cal-1')).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('409s (CALENDAR_IN_USE) when an active ACTIVITY references the calendar (M5, ADR-0037)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.countActivePlansUsing.mockResolvedValue(0);
      calendars.countActiveActivitiesUsing.mockResolvedValue(3);
      await expect(service.remove(principalWith(ALL), 'acme', 'cal-1')).rejects.toMatchObject({
        details: { count: 3, plans: 0, activities: 3 },
      });
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('409s (CALENDAR_IN_USE) when an active RESOURCE references the calendar (M7, ADR-0039)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.countActivePlansUsing.mockResolvedValue(0);
      calendars.countActiveActivitiesUsing.mockResolvedValue(0);
      resources.countActiveResourcesUsingCalendar.mockResolvedValue(2);
      await expect(service.remove(principalWith(ALL), 'acme', 'cal-1')).rejects.toMatchObject({
        details: { count: 2, plans: 0, activities: 0, resources: 2 },
      });
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('forbids a Viewer/Contributor from deleting', async () => {
      await expect(
        service.remove(principalWith(['calendar:read']), 'acme', 'cal-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('restore (ADR-0195)', () => {
    const deleted = (overrides: Partial<Calendar> = {}): Calendar =>
      calendar({
        deletedAt: new Date('2026-10-01T00:00:00Z'),
        deleteBatchId: 'batch-1',
        ...overrides,
      });
    let executeRaw: ReturnType<typeof vi.fn>;
    /** The `FOR SHARE` ancestor locks: a row back means the ancestor is active. */
    let queryRaw: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      executeRaw = vi.fn().mockResolvedValue(1);
      queryRaw = vi.fn().mockResolvedValue([{ id: 'x' }]);
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb({ $executeRaw: executeRaw, $queryRaw: queryRaw }),
      );
      calendars.findAnyStateByIdInOrg.mockResolvedValue(deleted());
      calendars.findActiveDetailByIdInOrg.mockResolvedValue({
        ...calendar(),
        shifts: [],
        exceptions: [],
      });
    });

    it('refuses a caller without calendar:restore before reading anything', async () => {
      await expect(
        service.restore(principalWith(['calendar:read', 'calendar:manage_org']), 'acme', 'cal-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.findAnyStateByIdInOrg).not.toHaveBeenCalled();
    });

    it('is a 404 for an unknown or foreign id, before the manage_org gate', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(null);
      await expect(
        service.restore(principalWith(['calendar:restore']), 'acme', 'cal-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('needs calendar:manage_org for an ORG calendar, after the load (403 then, never a 404 oracle)', async () => {
      await expect(
        service.restore(principalWith(['calendar:restore']), 'acme', 'cal-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.findAnyStateByIdInOrg).toHaveBeenCalled();
      expect(calendars.restoreWithExceptions).not.toHaveBeenCalled();
    });

    it('does not need manage_org for a PROJECT calendar', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(
        deleted({ scope: 'PROJECT', projectId: PROJECT_ID }),
      );
      await service.restore(principalWith(['calendar:restore']), 'acme', 'cal-1');
      expect(calendars.restoreWithExceptions).toHaveBeenCalled();
    });

    it('is a no-op 200 for an already-active calendar: nothing written, nothing recorded', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(calendar());
      const result = await service.restore(principalWith(ALL), 'acme', 'cal-1');
      expect(result.id).toBe('cal-1');
      expect(calendars.restoreWithExceptions).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses a PROJECT calendar whose project is still deleted, naming the project', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(
        deleted({ scope: 'PROJECT', projectId: PROJECT_ID }),
      );
      projects.findByIdInOrg.mockResolvedValue({
        id: PROJECT_ID,
        clientId: 'client-1',
        name: 'Riverside',
        deletedAt: new Date(),
        deleteBatchId: 'proj-batch',
      });
      // The locking read matches nothing for a deleted project.
      queryRaw.mockResolvedValue([]);
      const error = await service
        .restore(principalWith(ALL), 'acme', 'cal-1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toMatchObject({
        reason: 'PARENT_DELETED',
        blockedBy: { kind: 'project', relation: 'parent', id: PROJECT_ID, name: 'Riverside' },
      });
      expect(calendars.restoreWithExceptions).not.toHaveBeenCalled();
    });

    it('locks the project’s client, then the project, FOR SHARE, after the calendar lock (#520)', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(
        deleted({ scope: 'PROJECT', projectId: PROJECT_ID }),
      );

      await service.restore(principalWith(ALL), 'acme', 'cal-1');

      const reads = queryRaw.mock.calls.map((call) => {
        const [strings, ...values] = call as unknown as [string[], ...unknown[]];
        return { sql: strings.join('?'), values };
      });
      expect(reads).toHaveLength(2);
      expect(reads[0]).toMatchObject({ values: ['client-1'] });
      expect(reads[0]?.sql).toContain('FROM clients');
      expect(reads[1]).toMatchObject({ values: [PROJECT_ID] });
      expect(reads[1]?.sql).toContain('FROM projects');
      expect(reads.every((r) => r.sql.includes('FOR SHARE'))).toBe(true);
      // The calendar advisory lock came first: the order every restore path takes.
      expect(executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        queryRaw.mock.invocationCallOrder[0] ?? Infinity,
      );
      expect(calendars.restoreWithExceptions).toHaveBeenCalled();
    });

    it('names the project as it is NOW when the lock finds it deleted since the first read', async () => {
      // The race #520 closes: the project was active at the unlocked read and a delete committed
      // before the lock was granted. The answer must come from a fresh read, not the stale one.
      calendars.findAnyStateByIdInOrg.mockResolvedValue(
        deleted({ scope: 'PROJECT', projectId: PROJECT_ID }),
      );
      projects.findByIdInOrg
        .mockResolvedValueOnce({
          id: PROJECT_ID,
          clientId: 'client-1',
          name: 'Riverside',
          deletedAt: null,
        })
        .mockResolvedValueOnce({
          id: PROJECT_ID,
          clientId: 'client-1',
          name: 'Riverside',
          deletedAt: new Date(),
          deleteBatchId: 'proj-batch',
        });
      queryRaw.mockResolvedValue([]);

      const error = await service
        .restore(principalWith(ALL), 'acme', 'cal-1')
        .catch((e: unknown) => e);

      expect((error as ConflictError).details).toMatchObject({
        reason: 'PARENT_DELETED',
        blockedBy: { id: PROJECT_ID, deleteBatchId: 'proj-batch' },
      });
      expect(calendars.restoreWithExceptions).not.toHaveBeenCalled();
    });

    it('takes no ancestor lock for an ORG calendar', async () => {
      await service.restore(principalWith(ALL), 'acme', 'cal-1');
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('refuses when a live calendar holds the name, saying whether it is archived', async () => {
      calendars.findActiveHoldingNameInTier.mockResolvedValue({
        id: 'other',
        name: 'Standard',
        archivedAt: new Date(),
      });
      const error = await service
        .restore(principalWith(ALL), 'acme', 'cal-1')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toContain('An archived calendar named “Standard”');
      expect((error as ConflictError).details).toMatchObject({
        reason: 'NAME_TAKEN',
        conflicts: [{ field: 'name', value: 'Standard', id: 'other', archived: true }],
      });
      expect(calendars.restoreWithExceptions).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('maps the unique index backstop to the same name-taken refusal', async () => {
      calendars.restoreWithExceptions.mockRejectedValue(uniqueViolation());
      const error = await service
        .restore(principalWith(ALL), 'acme', 'cal-1')
        .catch((e: unknown) => e);
      expect((error as ConflictError).details).toMatchObject({ reason: 'NAME_TAKEN' });
    });

    it('restores by the calendar’s own batch, stamps the plans using it, and records one event', async () => {
      calendars.findActivePlanIdsUsing.mockResolvedValue(['plan-1']);
      await service.restore(principalWith(ALL), 'acme', 'cal-1');
      expect(calendars.restoreWithExceptions).toHaveBeenCalledWith(
        { id: 'cal-1', batchId: 'batch-1', organizationId: ORG_ID },
        USER_ID,
        expect.anything(),
      );
      // The advisory lock, then the stamp: two statements, the stamp last.
      expect(executeRaw).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'calendar.restored',
          subjectId: 'cal-1',
          after: { name: 'Standard', scope: 'ORG', deleteBatchId: 'batch-1', exceptionCount: 2 },
        }),
        expect.anything(),
      );
    });

    it('restores a calendar with no batch id on its own rather than answering 404', async () => {
      calendars.findAnyStateByIdInOrg.mockResolvedValue(deleted({ deleteBatchId: null }));
      await service.restore(principalWith(ALL), 'acme', 'cal-1');
      expect(calendars.restoreWithExceptions).toHaveBeenCalledWith(
        { id: 'cal-1', batchId: null, organizationId: ORG_ID },
        USER_ID,
        expect.anything(),
      );
    });

    it('stamps nothing when no plan uses the calendar', async () => {
      await service.restore(principalWith(ALL), 'acme', 'cal-1');
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it('fails loudly when the row is gone by the time it is written (retention beat the restore)', async () => {
      calendars.restoreWithExceptions.mockResolvedValue({ calendars: 0, exceptions: 0 });
      await expect(service.restore(principalWith(ALL), 'acme', 'cal-1')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('addException', () => {
    it('adds an exception and bumps the calendar version', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.createException.mockResolvedValue(exception());
      const result = await service.addException(principalWith(ALL), 'acme', 'cal-1', {
        date: '2026-12-25',
        isWorking: false,
        label: 'Christmas Day',
      });
      expect(result.id).toBe('exc-1');
      expect(calendars.createException).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          calendarId: 'cal-1',
          isWorking: false,
          label: 'Christmas Day',
        }),
        expect.anything(),
      );
      expect(calendars.touchVersion).toHaveBeenCalledWith('cal-1', USER_ID, expect.anything());
    });

    it('defaults isWorking to false (a holiday)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.createException.mockResolvedValue(exception());
      await service.addException(principalWith(ALL), 'acme', 'cal-1', { date: '2026-12-25' });
      expect(calendars.createException).toHaveBeenCalledWith(
        expect.objectContaining({ isWorking: false, label: null }),
        expect.anything(),
      );
    });

    it('404s when the calendar is missing', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.addException(principalWith(ALL), 'acme', 'cal-1', { date: '2026-12-25' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calendars.createException).not.toHaveBeenCalled();
    });

    it('maps a duplicate/overlapping exception date to a 409', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.createException.mockRejectedValue(exceptionOverlapViolation());
      await expect(
        service.addException(principalWith(ALL), 'acme', 'cal-1', { date: '2026-12-25' }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('forbids a caller without calendar:update', async () => {
      await expect(
        service.addException(principalWith(['calendar:read']), 'acme', 'cal-1', {
          date: '2026-12-25',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('removeException', () => {
    it('soft-deletes an exception and bumps the calendar version', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.findActiveExceptionByIdInCalendar.mockResolvedValue(exception());
      await service.removeException(principalWith(ALL), 'acme', 'cal-1', 'exc-1');
      expect(calendars.softDeleteException).toHaveBeenCalledWith(
        'exc-1',
        USER_ID,
        expect.anything(),
      );
      expect(calendars.touchVersion).toHaveBeenCalledWith('cal-1', USER_ID, expect.anything());
    });

    it('404s when the calendar is missing', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.removeException(principalWith(ALL), 'acme', 'cal-1', 'exc-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calendars.softDeleteException).not.toHaveBeenCalled();
    });

    it('404s when the exception is missing on this calendar', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.findActiveExceptionByIdInCalendar.mockResolvedValue(null);
      await expect(
        service.removeException(principalWith(ALL), 'acme', 'cal-1', 'exc-1'),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calendars.softDeleteException).not.toHaveBeenCalled();
    });
  });
  // ---------------------------------------------------------------------------
  // Calendar scope tiers (ADR-0053 §1/§2). Every existing test above exercises the
  // ORG tier, which is what every pre-ADR-0053 row is — the M1 acceptance bar.
  // ---------------------------------------------------------------------------
  describe('scope: create', () => {
    it('defaults to the ORG tier when the client sends no scope (today’s behaviour)', async () => {
      calendars.create.mockResolvedValue(calendar());
      await service.create(principalWith(ALL), 'acme', {
        name: 'Standard',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
      });
      expect(calendars.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'ORG', projectId: null }),
      );
    });

    it('creates at PROJECT scope after verifying the project is active + in-org', async () => {
      calendars.create.mockResolvedValue(calendar({ scope: 'PROJECT', projectId: PROJECT_ID }));
      await service.create(principalWith(ALL), 'acme', {
        name: 'Winter shutdown',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'PROJECT',
        projectId: PROJECT_ID,
      });
      expect(projects.findActiveByIdInOrg).toHaveBeenCalledWith(PROJECT_ID, ORG_ID);
      expect(calendars.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'PROJECT', projectId: PROJECT_ID }),
      );
    });

    it('404s a foreign / deleted / unknown owning project (no existence oracle)', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.create(principalWith(ALL), 'acme', {
          name: 'X',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          scope: 'PROJECT',
          projectId: PROJECT_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calendars.create).not.toHaveBeenCalled();
    });

    it('forbids an ORG-tier create without calendar:manage_org, but allows a PROJECT one', async () => {
      const withoutManageOrg = principalWith([
        'calendar:read',
        'calendar:create',
        'calendar:update',
        'calendar:delete',
      ]);
      await expect(
        service.create(withoutManageOrg, 'acme', {
          name: 'Shared',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          scope: 'ORG',
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.create).not.toHaveBeenCalled();

      calendars.create.mockResolvedValue(calendar({ scope: 'PROJECT', projectId: PROJECT_ID }));
      await expect(
        service.create(withoutManageOrg, 'acme', {
          name: 'Local',
          workingWeekdays: STANDARD_WEEKDAYS_MASK,
          scope: 'PROJECT',
          projectId: PROJECT_ID,
        }),
      ).resolves.toMatchObject({ scope: 'PROJECT' });
    });
  });

  describe('scope: change (promote / narrow)', () => {
    const project = calendar({ scope: 'PROJECT', projectId: PROJECT_ID });

    it('promotes PROJECT → ORG without counting anything (widening is always safe)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(project);
      calendars.updateIfVersionMatches.mockResolvedValue(1);
      calendars.findActiveDetailByIdInOrg.mockResolvedValue({ ...calendar(), exceptions: [] });

      await service.update(principalWith(ALL), 'acme', 'cal-1', { scope: 'ORG', version: 1 });

      expect(calendars.updateIfVersionMatches).toHaveBeenCalledWith(
        'cal-1',
        1,
        expect.objectContaining({ scope: 'ORG', projectId: null }),
        USER_ID,
        expect.anything(),
      );
      expect(calendars.countPlansUsingOutsideProject).not.toHaveBeenCalled();
      expect(resources.countResourcesUsingCalendarAnyState).not.toHaveBeenCalled();
    });

    it('narrows ORG → PROJECT when nothing outside the target project uses it', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      calendars.updateIfVersionMatches.mockResolvedValue(1);
      calendars.findActiveDetailByIdInOrg.mockResolvedValue({ ...project, exceptions: [] });

      await service.update(principalWith(ALL), 'acme', 'cal-1', {
        scope: 'PROJECT',
        projectId: PROJECT_ID,
        version: 1,
      });

      // Both columns move in ONE update — ck_calendars_scope_parent is a row constraint.
      expect(calendars.updateIfVersionMatches).toHaveBeenCalledWith(
        'cal-1',
        1,
        expect.objectContaining({ scope: 'PROJECT', projectId: PROJECT_ID }),
        USER_ID,
        expect.anything(),
      );
    });

    it.each([
      ['a plan outside the target project', 'countPlansUsingOutsideProject'],
      ['an activity outside the target project', 'countActivitiesUsingOutsideProject'],
    ])('409s the narrow when %s still uses the calendar', async (_label, method) => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      (calendars as Record<string, ReturnType<typeof vi.fn>>)[method]?.mockResolvedValue(2);

      await expect(
        service.update(principalWith(ALL), 'acme', 'cal-1', {
          scope: 'PROJECT',
          projectId: PROJECT_ID,
          version: 1,
        }),
      ).rejects.toMatchObject({
        details: { reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED', count: 2 },
      });
      expect(calendars.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('409s the narrow when ANY resource, deleted or not, uses it (the pool is org-global)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      resources.countResourcesUsingCalendarAnyState.mockResolvedValue(1);

      await expect(
        service.update(principalWith(ALL), 'acme', 'cal-1', {
          scope: 'PROJECT',
          projectId: PROJECT_ID,
          version: 1,
        }),
      ).rejects.toMatchObject({
        details: { reason: 'CALENDAR_SCOPE_NARROWING_BLOCKED', resources: 1 },
      });
      expect(calendars.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('forbids a scope change without calendar:manage_org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(project);
      await expect(
        service.update(principalWith(['calendar:read', 'calendar:update']), 'acme', 'cal-1', {
          scope: 'ORG',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.updateIfVersionMatches).not.toHaveBeenCalled();
    });

    it('forbids editing an ORG-tier calendar without calendar:manage_org (shared state)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.update(principalWith(['calendar:read', 'calendar:update']), 'acme', 'cal-1', {
          name: 'Renamed',
          version: 1,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('lets a plain calendar:update rename a PROJECT-tier calendar (no shared-state write)', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(project);
      calendars.updateIfVersionMatches.mockResolvedValue(1);
      calendars.findActiveDetailByIdInOrg.mockResolvedValue({ ...project, exceptions: [] });
      await expect(
        service.update(principalWith(['calendar:read', 'calendar:update']), 'acme', 'cal-1', {
          name: 'Renamed',
          version: 1,
        }),
      ).resolves.toBeDefined();
      // An ordinary rename must NEVER take the narrowing path.
      expect(calendars.countPlansUsingOutsideProject).not.toHaveBeenCalled();
    });

    it('forbids deleting an ORG-tier calendar without calendar:manage_org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.remove(principalWith(['calendar:read', 'calendar:delete']), 'acme', 'cal-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });
  });

  describe('bulkRemove (ADR-0208 D5)', () => {
    const IDS = ['cal-2', 'cal-1'];

    it('forbids a caller without calendar:delete before reading anything', async () => {
      await expect(
        service.bulkRemove(principalWith(['calendar:read']), 'acme', IDS),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.findActiveByIdInOrg).not.toHaveBeenCalled();
    });

    it('forbids an ORG calendar without calendar:manage_org and deletes none of the set', async () => {
      calendars.findActiveByIdInOrg
        .mockResolvedValueOnce(calendar({ id: 'cal-1', scope: 'PROJECT', projectId: PROJECT_ID }))
        .mockResolvedValueOnce(calendar({ id: 'cal-2', scope: 'ORG', projectId: null }));
      await expect(
        service.bulkRemove(principalWith(['calendar:read', 'calendar:delete']), 'acme', IDS),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('is a 404 for the whole set when any id is missing, and writes nothing', async () => {
      calendars.findActiveByIdInOrg
        .mockResolvedValueOnce(calendar({ id: 'cal-1' }))
        .mockResolvedValueOnce(null);
      await expect(service.bulkRemove(principalWith(ALL), 'acme', IDS)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('counts the referencers of the whole set in one call, and refuses all if any is used', async () => {
      calendars.findActiveByIdInOrg
        .mockResolvedValueOnce(calendar({ id: 'cal-1' }))
        .mockResolvedValueOnce(calendar({ id: 'cal-2' }));
      calendars.countActiveReferencers.mockResolvedValue(
        new Map([['cal-2', { plans: 1, activities: 0, resources: 0 }]]),
      );
      await expect(service.bulkRemove(principalWith(ALL), 'acme', IDS)).rejects.toMatchObject({
        details: {
          reason: 'CALENDAR_IN_USE',
          calendars: [{ id: 'cal-2', plans: 1, activities: 0, resources: 0 }],
        },
      });
      expect(calendars.countActiveReferencers).toHaveBeenCalledTimes(1);
      expect(calendars.softDeleteWithExceptions).not.toHaveBeenCalled();
    });

    it('deletes each calendar in its own batch, in id order, with one audit row each', async () => {
      calendars.findActiveByIdInOrg
        .mockResolvedValueOnce(calendar({ id: 'cal-1' }))
        .mockResolvedValueOnce(calendar({ id: 'cal-2' }));
      calendars.softDeleteWithExceptions
        .mockResolvedValueOnce('batch-1')
        .mockResolvedValueOnce('batch-2');
      const result = await service.bulkRemove(principalWith(ALL), 'acme', IDS);
      expect(calendars.softDeleteWithExceptions.mock.calls.map((c) => c[0])).toEqual([
        'cal-1',
        'cal-2',
      ]);
      expect(result.deleted.map((d) => d.deleteBatchId)).toEqual(['batch-1', 'batch-2']);
      expect(audit.record).toHaveBeenCalledTimes(2);
    });
  });

  /**
   * A holiday on an ORG calendar is shared tenant state exactly as its weekly pattern is, so all
   * three exception verbs take `calendar:manage_org`. Only `updateException` did, which made the
   * rule a property of one verb rather than of the object — inert today (every role holding
   * `calendar:update` holds `calendar:manage_org`), and these pin it against the day they split.
   */
  describe('scope: exception writes on an ORG calendar', () => {
    const writer = () => principalWith(['calendar:read', 'calendar:update']);

    it('forbids ADDING an exception without calendar:manage_org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.addException(writer(), 'acme', 'cal-1', { date: '2026-12-25' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.createException).not.toHaveBeenCalled();
    });

    it('forbids REMOVING an exception without calendar:manage_org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.removeException(writer(), 'acme', 'cal-1', 'exc-1'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.softDeleteException).not.toHaveBeenCalled();
    });

    it('forbids UPDATING an exception without calendar:manage_org', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.updateException(writer(), 'acme', 'cal-1', 'exc-1', { version: 1, label: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('refuses BEFORE looking the exception up, so the tier is not an existence oracle', async () => {
      calendars.findActiveByIdInOrg.mockResolvedValue(calendar());
      await expect(
        service.removeException(writer(), 'acme', 'cal-1', 'no-such-exception'),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(calendars.findActiveExceptionByIdInCalendar).not.toHaveBeenCalled();
    });
  });

  describe('scope: list', () => {
    it('defaults the org list to the ORG tier (today’s result set)', async () => {
      calendars.findManyActiveByOrg.mockResolvedValue([]);
      await service.list(principalWith(ALL), 'acme', { limit: 20 });
      expect(calendars.findManyActiveByOrg).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'org' }),
      );
    });

    it('lists a project’s usable set (its own + all org) after checking the project', async () => {
      calendars.findManyActiveForProject.mockResolvedValue([]);
      await service.listForProject(principalWith(ALL), 'acme', PROJECT_ID, { limit: 20 });
      expect(projects.findActiveByIdInOrg).toHaveBeenCalledWith(PROJECT_ID, ORG_ID);
      expect(calendars.findManyActiveForProject).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      );
    });

    it('404s the project list for a foreign / unknown project', async () => {
      projects.findActiveByIdInOrg.mockResolvedValue(null);
      await expect(
        service.listForProject(principalWith(ALL), 'acme', PROJECT_ID, { limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(calendars.findManyActiveForProject).not.toHaveBeenCalled();
    });
  });
});
