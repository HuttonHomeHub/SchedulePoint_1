import {
  AccrualType,
  ActivityStatus,
  ActivityType,
  CalendarScope,
  ConstraintType,
  CriticalPathDefinition,
  DependencyType,
  DurationType,
  EacMethod,
  LagCalendarSource,
  PercentCompleteType,
  ProgressRecalcMode,
  ResourceCurveType,
  ResourceKind,
  SchedulingMode,
  TotalFloatMode,
} from '@prisma/client';
import {
  SEED_ACCRUAL_TYPES,
  SEED_ACTIVITY_STATUSES,
  SEED_ACTIVITY_TYPES,
  SEED_CALENDAR_SCOPES,
  SEED_CONSTRAINT_TYPES,
  SEED_CRITICAL_PATH_DEFINITIONS,
  SEED_DEPENDENCY_TYPES,
  SEED_DURATION_TYPES,
  SEED_EAC_METHODS,
  SEED_LAG_CALENDAR_SOURCES,
  SEED_PERCENT_COMPLETE_TYPES,
  SEED_PROGRESS_RECALC_MODES,
  SEED_RESOURCE_CURVE_TYPES,
  SEED_RESOURCE_KINDS,
  SEED_SCHEDULING_MODES,
  SEED_TOTAL_FLOAT_MODES,
} from '@repo/seed';
import { describe, expect, it } from 'vitest';

/**
 * **The seed catalogue's anti-rot gate** (ADR-0066), on the `dependency-type.spec.ts` precedent.
 *
 * `@repo/seed` is pure and browser-safe, so it cannot import `@prisma/client`; its vocabulary is a
 * hand-maintained copy of these enums. The copy's failure mode is silent and expensive: a new enum
 * member lands in the schema, no `SeedSpec` can express it, and that capability quietly falls out of
 * the catalogue — with every other test still green, because a catalogue that cannot describe a
 * feature simply has no plan for it, which is indistinguishable from a feature nobody has reached yet.
 *
 * This is the only place both halves are visible at once, so it is the only place the drift can be
 * caught. It runs in the standard unit suite — no database.
 *
 * A member is expected here even when the application cannot act on it (`HAMMOCK` has no engine code;
 * `GROUP` can never be an assignment endpoint). Revealing that the app accepts something it cannot
 * schedule is part of what the catalogue is for; excluding the member would hide the gap.
 */
describe('the @repo/seed vocabulary is in lock-step with the Prisma schema', () => {
  const cases: ReadonlyArray<[string, readonly string[], Record<string, string>]> = [
    ['ActivityType', SEED_ACTIVITY_TYPES, ActivityType],
    ['ConstraintType', SEED_CONSTRAINT_TYPES, ConstraintType],
    ['DependencyType', SEED_DEPENDENCY_TYPES, DependencyType],
    ['LagCalendarSource', SEED_LAG_CALENDAR_SOURCES, LagCalendarSource],
    ['ResourceKind', SEED_RESOURCE_KINDS, ResourceKind],
    ['ResourceCurveType', SEED_RESOURCE_CURVE_TYPES, ResourceCurveType],
    ['DurationType', SEED_DURATION_TYPES, DurationType],
    ['ActivityStatus', SEED_ACTIVITY_STATUSES, ActivityStatus],
    ['PercentCompleteType', SEED_PERCENT_COMPLETE_TYPES, PercentCompleteType],
    ['AccrualType', SEED_ACCRUAL_TYPES, AccrualType],
    ['CalendarScope', SEED_CALENDAR_SCOPES, CalendarScope],
    ['SchedulingMode', SEED_SCHEDULING_MODES, SchedulingMode],
    ['ProgressRecalcMode', SEED_PROGRESS_RECALC_MODES, ProgressRecalcMode],
    ['CriticalPathDefinition', SEED_CRITICAL_PATH_DEFINITIONS, CriticalPathDefinition],
    ['TotalFloatMode', SEED_TOTAL_FLOAT_MODES, TotalFloatMode],
    ['EacMethod', SEED_EAC_METHODS, EacMethod],
  ];

  it.each(cases)('%s', (_name, seedMembers, prismaEnum) => {
    expect([...seedMembers].sort()).toEqual(Object.values(prismaEnum).sort());
  });
});
