import { describe, expect, it } from 'vitest';

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
} from './spec.js';

/**
 * **The anti-rot gate.** `@repo/seed` deliberately does not depend on `@prisma/client` — it is pure
 * and browser-safe — so its vocabulary is a hand-maintained copy of the Prisma enums. The failure
 * mode that copy has is silent and expensive: a new enum member lands in the schema, no spec can
 * express it, and the capability quietly drops out of the catalogue with every test still green.
 * Nothing would announce it, because a catalogue that cannot describe a feature simply has no plan
 * for it — which looks exactly like a feature nobody has got to yet.
 *
 * These assertions pin the **exact expected sets**, so adding `ActivityType.FOO` to Prisma without
 * adding it here fails this suite with a diff naming the member. That is a deliberately annoying
 * test: the annoyance is the mechanism.
 *
 * A member is listed here even when the application cannot schedule it (`HAMMOCK`) or cannot assign
 * it (`GROUP`). The catalogue's job is to reveal that the app accepts something it cannot act on;
 * omitting the member would hide the gap instead of measuring it.
 */
describe('the seed vocabulary matches the application schema', () => {
  it('covers every ActivityType', () => {
    expect([...SEED_ACTIVITY_TYPES].sort()).toEqual([
      'FINISH_MILESTONE',
      'HAMMOCK',
      'LEVEL_OF_EFFORT',
      'RESOURCE_DEPENDENT',
      'START_MILESTONE',
      'TASK',
      'WBS_SUMMARY',
    ]);
  });

  it('covers every ConstraintType, including the two mandatory kinds', () => {
    expect([...SEED_CONSTRAINT_TYPES].sort()).toEqual([
      'FNET',
      'FNLT',
      'MANDATORY_FINISH',
      'MANDATORY_START',
      'MFO',
      'MSO',
      'SNET',
      'SNLT',
    ]);
  });

  it('covers every DependencyType and LagCalendarSource', () => {
    expect([...SEED_DEPENDENCY_TYPES].sort()).toEqual(['FF', 'FS', 'SF', 'SS']);
    expect([...SEED_LAG_CALENDAR_SOURCES].sort()).toEqual([
      'PREDECESSOR',
      'PROJECT_DEFAULT',
      'SUCCESSOR',
      'TWENTY_FOUR_HOUR',
    ]);
  });

  it('covers every ResourceKind and ResourceCurveType', () => {
    expect([...SEED_RESOURCE_KINDS].sort()).toEqual(['EQUIPMENT', 'GROUP', 'LABOUR', 'MATERIAL']);
    expect([...SEED_RESOURCE_CURVE_TYPES].sort()).toEqual([
      'BACK_LOADED',
      'BELL',
      'DOUBLE_PEAK',
      'FRONT_LOADED',
      'UNIFORM',
    ]);
  });

  it('covers every DurationType, ActivityStatus, PercentCompleteType and AccrualType', () => {
    expect([...SEED_DURATION_TYPES].sort()).toEqual([
      'FIXED_DURATION_AND_UNITS',
      'FIXED_DURATION_AND_UNITS_TIME',
      'FIXED_UNITS',
      'FIXED_UNITS_TIME',
    ]);
    expect([...SEED_ACTIVITY_STATUSES].sort()).toEqual(['COMPLETE', 'IN_PROGRESS', 'NOT_STARTED']);
    expect([...SEED_PERCENT_COMPLETE_TYPES].sort()).toEqual(['DURATION', 'PHYSICAL', 'UNITS']);
    expect([...SEED_ACCRUAL_TYPES].sort()).toEqual(['END', 'START', 'UNIFORM']);
  });

  it('covers every plan-level scheduling option enum', () => {
    expect([...SEED_SCHEDULING_MODES].sort()).toEqual(['EARLY', 'VISUAL']);
    expect([...SEED_PROGRESS_RECALC_MODES].sort()).toEqual([
      'ACTUAL_DATES',
      'PROGRESS_OVERRIDE',
      'RETAINED_LOGIC',
    ]);
    expect([...SEED_CRITICAL_PATH_DEFINITIONS].sort()).toEqual(['LONGEST_PATH', 'TOTAL_FLOAT']);
    expect([...SEED_TOTAL_FLOAT_MODES].sort()).toEqual(['FINISH', 'SMALLEST', 'START']);
    expect([...SEED_EAC_METHODS].sort()).toEqual(['CPI', 'CPI_TIMES_SPI', 'REMAINING_AT_BUDGET']);
    expect([...SEED_CALENDAR_SCOPES].sort()).toEqual(['ORG', 'PROJECT']);
  });
});
