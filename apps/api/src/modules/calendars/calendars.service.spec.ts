import { Prisma, type Calendar, type CalendarException } from '@prisma/client';
import { STANDARD_WEEKDAYS_MASK } from '@repo/types';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { ResourceRepository } from '../resources/resource.repository';

import type { CalendarRepository } from './calendar.repository';
import { CalendarsService } from './calendars.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: 'cal-1',
    organizationId: ORG_ID,
    name: 'Standard',
    description: null,
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
];

describe('CalendarsService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let calendars: {
    create: ReturnType<typeof vi.fn>;
    findActiveByIdInOrg: ReturnType<typeof vi.fn>;
    findActiveDetailByIdInOrg: ReturnType<typeof vi.fn>;
    findManyActiveByOrg: ReturnType<typeof vi.fn>;
    updateIfVersionMatches: ReturnType<typeof vi.fn>;
    softDeleteWithExceptions: ReturnType<typeof vi.fn>;
    countActivePlansUsing: ReturnType<typeof vi.fn>;
    countActiveActivitiesUsing: ReturnType<typeof vi.fn>;
    createException: ReturnType<typeof vi.fn>;
    findActiveExceptionByIdInCalendar: ReturnType<typeof vi.fn>;
    softDeleteException: ReturnType<typeof vi.fn>;
    touchVersion: ReturnType<typeof vi.fn>;
  };
  let resources: { countActiveResourcesUsingCalendar: ReturnType<typeof vi.fn> };
  let prisma: { $transaction: ReturnType<typeof vi.fn> };
  let service: CalendarsService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    calendars = {
      create: vi.fn(),
      findActiveByIdInOrg: vi.fn(),
      findActiveDetailByIdInOrg: vi.fn(),
      findManyActiveByOrg: vi.fn(),
      updateIfVersionMatches: vi.fn(),
      softDeleteWithExceptions: vi.fn(),
      countActivePlansUsing: vi.fn().mockResolvedValue(0),
      countActiveActivitiesUsing: vi.fn().mockResolvedValue(0),
      createException: vi.fn(),
      findActiveExceptionByIdInCalendar: vi.fn(),
      softDeleteException: vi.fn(),
      touchVersion: vi.fn(),
    };
    resources = { countActiveResourcesUsingCalendar: vi.fn().mockResolvedValue(0) };
    // The tx handle exposes $executeRaw (the calendar advisory lock used by remove).
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: vi.fn() })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
    service = new CalendarsService(
      organizations as unknown as OrganizationsService,
      calendars as unknown as CalendarRepository,
      resources as unknown as ResourceRepository,
      prisma as unknown as PrismaService,
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
});
