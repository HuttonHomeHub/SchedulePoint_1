import { describe, expect, it } from 'vitest';

import {
  crossPlanLagCalendarId,
  crossPlanLagDayFactorMinutes,
  type CrossPlanEndpointCalendarFacts,
  type CrossPlanLagCalendarContext,
} from './cross-plan-lag-calendar';

/**
 * **The one cross-plan lag-calendar rule** (#385 M2-T3, spec D5 and CQ-2), per source, with the two
 * plans on DIFFERENT calendars so a lag resolved against the wrong plan lands on a different id.
 *
 * | Calendar     | Factor | Bound to                          |
 * | ------------ | ------ | --------------------------------- |
 * | `up-plan`    | 600    | the predecessor's plan            |
 * | `down-plan`  | 480    | the successor's plan              |
 * | `own`        | 360    | an endpoint's own calendar        |
 * | `driver`     | 420    | a driving resource's calendar     |
 */
const FACTORS = new Map([
  ['up-plan', 600],
  ['down-plan', 480],
  ['own', 360],
  ['driver', 420],
]);

const inheriting = (planCalendarId: string | null): CrossPlanEndpointCalendarFacts => ({
  type: 'TASK',
  calendarId: null,
  drivingCalendarId: null,
  planCalendarId,
});

const context = (over: Partial<CrossPlanLagCalendarContext> = {}): CrossPlanLagCalendarContext => ({
  lagCalendar: 'PROJECT_DEFAULT',
  predecessor: inheriting('up-plan'),
  successor: inheriting('down-plan'),
  ...over,
});

const both = (c: CrossPlanLagCalendarContext) => ({
  id: crossPlanLagCalendarId(c),
  factor: crossPlanLagDayFactorMinutes(c, FACTORS),
});

describe('crossPlanLagCalendarId / crossPlanLagDayFactorMinutes', () => {
  it('PROJECT_DEFAULT is the SUCCESSOR plan’s calendar (CQ-2), never the predecessor’s', () => {
    // Red against `context.predecessor.planCalendarId` (600).
    expect(both(context())).toEqual({ id: 'down-plan', factor: 480 });
  });

  it('PREDECESSOR on an inheriting endpoint is ITS OWN plan’s calendar', () => {
    // Red against resolving the inherit sentinel to the successor's plan (the ADR-0139 shape).
    expect(both(context({ lagCalendar: 'PREDECESSOR' }))).toEqual({ id: 'up-plan', factor: 600 });
  });

  it('SUCCESSOR on an inheriting endpoint is its own plan’s calendar', () => {
    expect(both(context({ lagCalendar: 'SUCCESSOR' }))).toEqual({ id: 'down-plan', factor: 480 });
  });

  it('PREDECESSOR with its own calendar reads that calendar', () => {
    const c = context({
      lagCalendar: 'PREDECESSOR',
      predecessor: { ...inheriting('up-plan'), calendarId: 'own' },
    });
    expect(both(c)).toEqual({ id: 'own', factor: 360 });
  });

  it('a RESOURCE_DEPENDENT endpoint with a driver reads its driver’s calendar', () => {
    const c = context({
      lagCalendar: 'SUCCESSOR',
      successor: {
        type: 'RESOURCE_DEPENDENT',
        calendarId: 'own',
        drivingCalendarId: 'driver',
        planCalendarId: 'down-plan',
      },
    });
    expect(both(c)).toEqual({ id: 'driver', factor: 420 });
  });

  it('a TASK ignores an assigned driver (only RESOURCE_DEPENDENT consults it)', () => {
    const c = context({
      lagCalendar: 'SUCCESSOR',
      successor: { ...inheriting('down-plan'), drivingCalendarId: 'driver' },
    });
    expect(both(c)).toEqual({ id: 'down-plan', factor: 480 });
  });

  it('TWENTY_FOUR_HOUR has no calendar and is pinned at 1440', () => {
    expect(both(context({ lagCalendar: 'TWENTY_FOUR_HOUR' }))).toEqual({ id: null, factor: 1440 });
  });

  it('a plan with no calendar at all falls back to 1440', () => {
    expect(both(context({ successor: inheriting(null) }))).toEqual({ id: null, factor: 1440 });
  });

  it('an id that does not resolve falls back to 1440 (the migration’s COALESCE)', () => {
    expect(both(context({ successor: inheriting('gone') }))).toEqual({ id: 'gone', factor: 1440 });
  });
});
