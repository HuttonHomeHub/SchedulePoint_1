import type { Activity } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { CalendarWithExceptions } from '../../calendars/calendar.repository';
import type { DependencyWithEndpoints } from '../../dependencies/dependency.repository';
import type { ScheduleAggregate } from '../../schedule/schedule.repository';

import { GuestActivityDto } from './guest-activity.dto';
import { GuestDependencyDto } from './guest-dependency.dto';
import { GuestCalendarDto, GuestPlanViewDto, GuestScheduleSummaryDto } from './guest-plan.dto';

const DAY = new Date(Date.UTC(2026, 6, 1));

/**
 * These tests are the FIELD-EXCLUSION contract for the session-less guest surface (ADR-0051 §4).
 * Each guest DTO is built from a row carrying EVERY sensitive field, then we assert those keys are
 * ABSENT from the serialised output. A regression that widened a guest DTO to leak cost / notes /
 * resources / baselines / audit / user identity / token would fail here.
 */

/** A fully-populated activity row — every sensitive column set, so a leak would be caught. */
function activityRow(): Activity {
  return {
    id: 'act-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    code: 'A100',
    name: 'Excavate',
    description: 'internal note that must not leak',
    type: 'TASK',
    durationMinutes: 2880,
    calendarId: 'cal-1',
    constraintType: 'SNET',
    constraintDate: DAY,
    secondaryConstraintType: 'FNLT',
    secondaryConstraintDate: DAY,
    externalEarlyStart: DAY,
    externalLateFinish: DAY,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    laneIndex: 3,
    scheduleAsLateAsPossible: true,
    levelingPriority: 7,
    status: 'IN_PROGRESS',
    percentComplete: 40,
    actualStart: DAY,
    actualFinish: null,
    remainingDurationMinutes: 1440,
    suspendDate: DAY,
    resumeDate: DAY,
    expectedFinish: DAY,
    percentCompleteType: 'PHYSICAL',
    physicalPercentComplete: 55,
    budgetedExpense: 123456n,
    actualExpense: 7890n,
    accrualType: 'UNIFORM',
    parentId: 'wbs-1',
    earlyStart: DAY,
    earlyFinish: DAY,
    lateStart: DAY,
    lateFinish: DAY,
    totalFloat: 5,
    freeFloat: 2,
    isCritical: true,
    isNearCritical: false,
    constraintViolated: true,
    externalDriven: true,
    loeNoSpan: false,
    resourceDriverMissing: false,
    visualStart: DAY,
    visualEffectiveStart: DAY,
    visualEffectiveFinish: DAY,
    visualConflict: false,
    visualDriftDays: 0,
    leveledStart: DAY,
    leveledFinish: DAY,
    levelingDelayMinutes: 480,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    version: 9,
    createdAt: DAY,
    updatedAt: DAY,
    createdBy: 'user-secret',
    updatedBy: 'user-secret',
    deletedAt: null,
    deleteBatchId: null,
  };
}

/** Keys that must NEVER appear on a guest activity DTO (cost / audit / user / internal). */
const FORBIDDEN_ACTIVITY_KEYS = [
  'organizationId',
  'planId',
  'description',
  'calendarId',
  'parentId',
  'durationType',
  'constraintType',
  'constraintDate',
  'secondaryConstraintType',
  'secondaryConstraintDate',
  'externalEarlyStart',
  'externalLateFinish',
  'expectedFinish',
  'remainingDurationMinutes',
  'remainingDurationDays',
  'suspendDate',
  'resumeDate',
  'percentCompleteType',
  'physicalPercentComplete',
  'budgetedExpense',
  'actualExpense',
  'accrualType',
  'freeFloat',
  'isNearCritical',
  'scheduleAsLateAsPossible',
  'constraintViolated',
  'externalDriven',
  'loeNoSpan',
  'resourceDriverMissing',
  'visualStart',
  'visualEffectiveStart',
  'visualEffectiveFinish',
  'visualConflict',
  'visualDriftDays',
  'levelingPriority',
  'leveledStart',
  'leveledFinish',
  'levelingDelayMinutes',
  'levelingDelayDays',
  'levelingWindowExceeded',
  'selfOverAllocated',
  'version',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'deletedAt',
  'deleteBatchId',
];

describe('GuestActivityDto', () => {
  const dto = GuestActivityDto.from(activityRow());

  it('exposes ONLY the whitelisted schedule + progress fields', () => {
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'code',
        'name',
        'type',
        'durationDays',
        'laneIndex',
        'earlyStart',
        'earlyFinish',
        'lateStart',
        'lateFinish',
        'totalFloat',
        'isCritical',
        'status',
        'percentComplete',
        'actualStart',
        'actualFinish',
      ].sort(),
    );
  });

  it.each(FORBIDDEN_ACTIVITY_KEYS)('never exposes %s', (key) => {
    expect(dto).not.toHaveProperty(key);
  });

  it('maps duration minutes → working days and echoes the CPM/progress values', () => {
    expect(dto).toMatchObject({
      durationDays: 2, // 2880 / 1440
      isCritical: true,
      totalFloat: 5,
      status: 'IN_PROGRESS',
      percentComplete: 40,
      laneIndex: 3,
    });
  });
});

/** A dependency row with endpoints + audit + engine flags set — a leak would be caught. */
function dependencyRow(): DependencyWithEndpoints {
  return {
    id: 'dep-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    predecessorId: 'act-1',
    successorId: 'act-2',
    type: 'FS',
    lagMinutes: 2880,
    lagCalendar: 'PREDECESSOR',
    isDriving: true,
    version: 4,
    createdAt: DAY,
    updatedAt: DAY,
    createdBy: 'user-secret',
    updatedBy: 'user-secret',
    deletedAt: null,
    deleteBatchId: null,
    predecessor: { id: 'act-1', code: 'A100', name: 'Excavate' },
    successor: { id: 'act-2', code: 'A200', name: 'Pour' },
  } as unknown as DependencyWithEndpoints;
}

describe('GuestDependencyDto', () => {
  const dto = GuestDependencyDto.from(dependencyRow());

  it('exposes ONLY id, endpoints (by id), type and lag', () => {
    expect(Object.keys(dto).sort()).toEqual(
      ['id', 'predecessorId', 'successorId', 'type', 'lagDays'].sort(),
    );
  });

  it.each([
    'organizationId',
    'planId',
    'lagMinutes',
    'lagCalendar',
    'isDriving',
    'predecessor',
    'successor',
    'version',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'deletedAt',
  ])('never exposes %s', (key) => {
    expect(dto).not.toHaveProperty(key);
  });

  it('maps lag minutes → signed working days', () => {
    expect(dto.lagDays).toBe(2); // 2880 / 1440
  });
});

/** A calendar-with-exceptions row with audit + id set. */
function calendarRow(): CalendarWithExceptions {
  return {
    id: 'cal-1',
    organizationId: 'org-1',
    name: 'Site 5-day',
    description: 'internal calendar note',
    version: 3,
    createdAt: DAY,
    updatedAt: DAY,
    createdBy: 'user-secret',
    updatedBy: 'user-secret',
    deletedAt: null,
    deleteBatchId: null,
    shifts: [
      { weekday: 0, startMinute: 0, endMinute: 1440 },
      { weekday: 1, startMinute: 0, endMinute: 1440 },
    ],
    exceptions: [
      {
        id: 'exc-1',
        startDate: DAY,
        label: 'Public holiday',
        windows: [],
      },
    ],
  } as unknown as CalendarWithExceptions;
}

describe('GuestCalendarDto', () => {
  const dto = GuestCalendarDto.from(calendarRow());

  it('exposes ONLY name, workingWeekdays and stripped exceptions', () => {
    expect(Object.keys(dto).sort()).toEqual(['name', 'workingWeekdays', 'exceptions'].sort());
    expect(Object.keys(dto.exceptions[0]!).sort()).toEqual(['date', 'isWorking', 'label'].sort());
  });

  it.each(['id', 'organizationId', 'description', 'version', 'createdAt', 'updatedAt', 'shifts'])(
    'never exposes %s',
    (key) => {
      expect(dto).not.toHaveProperty(key);
    },
  );
});

function aggregate(): ScheduleAggregate {
  return {
    activityCount: 10,
    criticalCount: 3,
    nearCriticalCount: 2,
    constraintViolationCount: 1,
    externalDrivenCount: 1,
    constraintWarningCount: 1,
    loeNoSpanCount: 0,
    resourceDriverMissingCount: 0,
    leveledActivityCount: 4,
    levelingWindowExceededCount: 1,
    selfOverAllocatedCount: 1,
    leveledProjectFinish: '2026-09-01',
    projectFinish: '2026-08-15',
  };
}

describe('GuestScheduleSummaryDto', () => {
  const dto = GuestScheduleSummaryDto.from(aggregate(), '2026-07-01');

  it('exposes ONLY the core critical-path roll-up', () => {
    expect(Object.keys(dto).sort()).toEqual(
      ['dataDate', 'projectFinish', 'activityCount', 'criticalCount', 'nearCriticalCount'].sort(),
    );
  });

  it.each([
    'constraintViolationCount',
    'externalDrivenCount',
    'constraintWarningCount',
    'loeNoSpanCount',
    'resourceDriverMissingCount',
    'leveledActivityCount',
    'levelingWindowExceededCount',
    'selfOverAllocatedCount',
    'leveledProjectFinish',
  ])('never exposes the internal engine count %s', (key) => {
    expect(dto).not.toHaveProperty(key);
  });
});

describe('GuestPlanViewDto', () => {
  const dto = GuestPlanViewDto.from({
    plan: {
      id: 'plan-1',
      name: 'Tower A',
      status: 'ACTIVE',
      description: 'client-visible description',
      plannedStart: DAY,
    },
    calendar: calendarRow(),
    aggregate: aggregate(),
  });

  it('exposes ONLY the header + calendar + summary, never token/audit/lock/scope', () => {
    expect(Object.keys(dto).sort()).toEqual(
      ['id', 'name', 'status', 'description', 'dataDate', 'calendar', 'summary'].sort(),
    );
  });

  it.each([
    'token',
    'tokenHash',
    'plannedStart',
    'calendarId',
    'projectId',
    'organizationId',
    'version',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'deletedAt',
    'lockHolder',
    'lockedBy',
  ])('never exposes %s', (key) => {
    expect(dto).not.toHaveProperty(key);
  });

  it('renders the data date as YYYY-MM-DD and nests the stripped calendar + summary', () => {
    expect(dto.dataDate).toBe('2026-07-01');
    expect(dto.calendar).not.toBeNull();
    expect(dto.summary.projectFinish).toBe('2026-08-15');
  });

  it('yields a null calendar when the plan has none', () => {
    const noCal = GuestPlanViewDto.from({
      plan: {
        id: 'plan-1',
        name: 'Tower A',
        status: 'DRAFT',
        description: null,
        plannedStart: null,
      },
      calendar: null,
      aggregate: aggregate(),
    });
    expect(noCal.calendar).toBeNull();
    expect(noCal.dataDate).toBeNull();
  });
});
