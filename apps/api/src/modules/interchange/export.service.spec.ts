import { Prisma } from '@prisma/client';
import { importSchedule } from '@repo/interchange';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import type { ActivityRepository } from '../activities/activity.repository';
import type { CalendarRepository } from '../calendars/calendar.repository';
import type { DependencyRepository } from '../dependencies/dependency.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';
import type { ResourceAssignmentRepository } from '../resources/resource-assignment.repository';
import type { ResourceRepository } from '../resources/resource.repository';

import { EXPORT_ERROR, ExportService, slugify } from './export.service';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ORG_SLUG = 'acme';
const PLAN_ID = '00000000-0000-7000-8000-000000000001';

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'VIEWER', permissions }]);
}

/** A stored plan row (only the fields the export read touches). */
function planRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: PLAN_ID,
    organizationId: ORG_ID,
    name: 'Riverside Phase 1!!',
    plannedStart: new Date(Date.UTC(2026, 0, 4)),
    calendarId: 'cal-1',
    ...overrides,
  };
}

/** A stored activity row with every column the export read projects, defaulted to an un-progressed task. */
function activityRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'act-1',
    code: 'A1000',
    name: 'Mobilise',
    type: 'TASK',
    durationMinutes: 2400,
    calendarId: 'cal-1',
    parentId: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    status: 'NOT_STARTED',
    percentComplete: 0,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    actualStart: null,
    actualFinish: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
    ...overrides,
  };
}

/** A stored calendar-with-exceptions row (Mon–Fri, one dated holiday exception). */
function calendarRow(): Record<string, unknown> {
  return {
    id: 'cal-1',
    name: 'Site 5-Day',
    shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
    exceptions: [
      {
        startDate: new Date(Date.UTC(2026, 0, 1)),
        endDate: new Date(Date.UTC(2026, 0, 1)),
        label: 'New Year',
        windows: [],
      },
    ],
  };
}

describe('ExportService.exportPlan', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let plans: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let calendars: { findActiveDetailByIdsInOrg: ReturnType<typeof vi.fn> };
  let activities: { findAllActiveByPlan: ReturnType<typeof vi.fn> };
  let dependencies: { findAllActiveByPlan: ReturnType<typeof vi.fn> };
  let resources: { findActiveByIdsInOrg: ReturnType<typeof vi.fn> };
  let assignments: { findManyActiveByPlan: ReturnType<typeof vi.fn> };
  let logger: Pick<PinoLogger, 'info' | 'warn' | 'error'>;
  let service: ExportService;
  const member = principalWith(['interchange:export']);

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'VIEWER' }),
    };
    plans = { findActiveByIdInOrg: vi.fn().mockResolvedValue(planRow()) };
    calendars = { findActiveDetailByIdsInOrg: vi.fn().mockResolvedValue([calendarRow()]) };
    activities = {
      findAllActiveByPlan: vi
        .fn()
        .mockResolvedValue([
          activityRow(),
          activityRow({ id: 'act-2', code: 'A1010', name: 'Design', durationMinutes: 4800 }),
        ]),
    };
    dependencies = {
      findAllActiveByPlan: vi
        .fn()
        .mockResolvedValue([
          { id: 'dep-1', predecessorId: 'act-1', successorId: 'act-2', type: 'FS', lagMinutes: 0 },
        ]),
    };
    resources = { findActiveByIdsInOrg: vi.fn().mockResolvedValue([]) };
    assignments = { findManyActiveByPlan: vi.fn().mockResolvedValue([]) };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    service = new ExportService(
      organizations as unknown as OrganizationsService,
      plans as unknown as PlanRepository,
      calendars as unknown as CalendarRepository,
      activities as unknown as ActivityRepository,
      dependencies as unknown as DependencyRepository,
      resources as unknown as ResourceRepository,
      assignments as unknown as ResourceAssignmentRepository,
      logger as unknown as PinoLogger,
    );
  });

  it('assembles a plan into re-importable XER bytes with the report counts (happy path)', async () => {
    const { bytes, filename, report } = await service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer');

    expect(report.detectedFormat).toBe('XER');
    expect(report.mapped).toMatchObject({ activities: 2, relationships: 1, calendars: 1 });
    // The bytes round-trip: re-importing the exported file recovers the activity codes + the FS edge.
    const reimport = importSchedule({ content: bytes, filename });
    expect(reimport.ok).toBe(true);
    if (reimport.ok) {
      expect(reimport.graph.activities.map((a) => a.code).sort()).toEqual(['A1000', 'A1010']);
      expect(reimport.graph.dependencies).toHaveLength(1);
      expect(reimport.graph.dependencies[0]?.type).toBe('FS');
    }
  });

  it('derives a safe download filename from the plan name (slugified)', async () => {
    const { filename } = await service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer');
    expect(filename).toBe('riverside-phase-1.xer');
  });

  it('exports an empty plan (no activities/dependencies/calendars) as a valid file (CQ-5)', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(planRow({ calendarId: null }));
    activities.findAllActiveByPlan.mockResolvedValue([]);
    dependencies.findAllActiveByPlan.mockResolvedValue([]);
    calendars.findActiveDetailByIdsInOrg.mockResolvedValue([]);

    const { bytes, report } = await service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer');
    expect(report.mapped).toMatchObject({ activities: 0, relationships: 0, calendars: 0 });
    const reimport = importSchedule({ content: bytes, filename: 'empty.xer' });
    expect(reimport.ok).toBe(true);
    if (reimport.ok) expect(reimport.graph.activities).toHaveLength(0);
  });

  it('reports out-of-M4a-scope data (constraints, progress, resources) as drops — never silently', async () => {
    activities.findAllActiveByPlan.mockResolvedValue([
      activityRow({ constraintType: 'SNET', constraintDate: new Date(Date.UTC(2026, 1, 1)) }),
      activityRow({ id: 'act-2', code: 'A1010', status: 'IN_PROGRESS', percentComplete: 50 }),
    ]);
    resources.findActiveByIdsInOrg.mockResolvedValue([
      {
        id: 'res-1',
        name: 'Crew',
        code: 'CREW-A',
        kind: 'LABOUR',
        calendarId: null,
        costPerUnit: null,
        maxUnitsPerHour: null,
      },
    ]);
    assignments.findManyActiveByPlan.mockResolvedValue([
      {
        id: 'asg-1',
        activityId: 'act-1',
        resourceId: 'res-1',
        budgetedUnits: new Prisma.Decimal(40),
        unitsPerHour: null,
        isDriving: true,
        actualUnits: new Prisma.Decimal(0),
      },
    ]);

    const { report } = await service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer');
    const dropEntities = report.drops.map((d) => d.entity);
    expect(dropEntities).toContain('constraint');
    expect(dropEntities).toContain('activity'); // progress drop
    expect(dropEntities).toContain('resource');
    expect(dropEntities).toContain('assignment');
  });

  it('422s an unsupported format before any read (EXPORT_UNSUPPORTED_FORMAT)', async () => {
    const error = await service
      .exportPlan(member, ORG_SLUG, PLAN_ID, 'mspdi')
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toMatchObject({
      reason: EXPORT_ERROR.UNSUPPORTED_FORMAT,
    });
    expect(organizations.resolveScope).not.toHaveBeenCalled();
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
  });

  it('404s when the plan is not in the caller’s org (anti-IDOR)', async () => {
    plans.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('propagates the 404 when the caller is not a member of the org (anti-IDOR)', async () => {
    organizations.resolveScope.mockRejectedValue(new NotFoundError('Organisation not found.'));
    await expect(service.exportPlan(member, ORG_SLUG, PLAN_ID, 'xer')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
  });

  it('403s a principal lacking interchange:export (defence in depth, before the plan read)', async () => {
    const noCap = principalWith([]);
    await expect(service.exportPlan(noCap, ORG_SLUG, PLAN_ID, 'xer')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(plans.findActiveByIdInOrg).not.toHaveBeenCalled();
  });
});

describe('slugify', () => {
  it('lowercases, collapses non-alphanumerics to single dashes, and trims', () => {
    expect(slugify('Riverside Phase 1!!')).toBe('riverside-phase-1');
    expect(slugify('  --Weird__Name--  ')).toBe('weird-name');
  });

  it('falls back to "plan" for an empty/symbol-only name', () => {
    expect(slugify('!!!')).toBe('plan');
    expect(slugify('')).toBe('plan');
  });
});
