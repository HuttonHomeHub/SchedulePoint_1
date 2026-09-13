import { describe, expect, it } from 'vitest';

import { lagCalendarIdFor } from './lag-day-factor';

/**
 * Widened (not weakened) when `docs/TECH_DEBT.md` #86 split the one calendar rule in two: an
 * endpoint now contributes its type and its driving calendar as well, because which calendar an
 * activity SCHEDULES on is type-gated. Both ends are plain TASKs here with no driver, which is the
 * shape every one of these assertions was written against — so not one of them changes, and the
 * driver's own behaviour is asserted separately below.
 */
const ENDS = {
  predecessorType: 'TASK',
  predecessorCalendarId: 'cal-pred',
  predecessorDrivingCalendarId: null,
  successorType: 'TASK',
  successorCalendarId: 'cal-succ',
  successorDrivingCalendarId: null,
  planCalendarId: 'cal-plan',
} as const;

describe('lagCalendarIdFor (ADR-0068 §4 / ADR-0037 M3)', () => {
  it('measures on whichever end the relationship names', () => {
    expect(lagCalendarIdFor({ lagCalendar: 'PREDECESSOR', ...ENDS })).toBe('cal-pred');
    expect(lagCalendarIdFor({ lagCalendar: 'SUCCESSOR', ...ENDS })).toBe('cal-succ');
    expect(lagCalendarIdFor({ lagCalendar: 'PROJECT_DEFAULT', ...ENDS })).toBe('cal-plan');
  });

  /**
   * The entire meaning of the option. Routing it through a calendar's hours-per-day would silently
   * destroy the one choice a planner makes precisely to escape working-time arithmetic.
   */
  it('never resolves a calendar for TWENTY_FOUR_HOUR — the caller pins it at 1440', () => {
    expect(lagCalendarIdFor({ lagCalendar: 'TWENTY_FOUR_HOUR', ...ENDS })).toBeNull();
  });

  it('falls back to the plan when the named end inherits', () => {
    expect(
      lagCalendarIdFor({ ...ENDS, lagCalendar: 'PREDECESSOR', predecessorCalendarId: null }),
    ).toBe('cal-plan');
  });

  /**
   * `docs/TECH_DEBT.md` #86. A lag measures the work at the end it names, and a RESOURCE_DEPENDENT
   * activity does that work on its driving resource's calendar (ADR-0039 §4) — so the lag converts
   * there too, not on the activity's own calendar.
   */
  it('measures a driven end on its driving resource calendar, not its own', () => {
    expect(
      lagCalendarIdFor({
        ...ENDS,
        lagCalendar: 'PREDECESSOR',
        predecessorType: 'RESOURCE_DEPENDENT',
        predecessorDrivingCalendarId: 'cal-crane',
      }),
    ).toBe('cal-crane');
  });

  it('ignores a driving calendar on any other type — the A5500 contrast', () => {
    // A TASK with an assigned resource keeps its own calendar. Type-gating this is what stops the
    // driver leaking into every activity that merely HAS a resource.
    expect(
      lagCalendarIdFor({
        ...ENDS,
        lagCalendar: 'PREDECESSOR',
        predecessorDrivingCalendarId: 'cal-crane',
      }),
    ).toBe('cal-pred');
  });

  it('falls back to the driven end own calendar when the driver is missing or inherits', () => {
    // Absence and null collapse here deliberately: the difference between them is
    // `resourceDriverMissing`, which is a flag on a different path, not a day length.
    expect(
      lagCalendarIdFor({
        ...ENDS,
        lagCalendar: 'PREDECESSOR',
        predecessorType: 'RESOURCE_DEPENDENT',
        predecessorDrivingCalendarId: null,
      }),
    ).toBe('cal-pred');
  });
});
