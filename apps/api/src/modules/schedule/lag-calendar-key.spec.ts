import { describe, expect, it } from 'vitest';

import {
  buildEngineGraph,
  buildRuleInput,
  generatePlan,
} from '../../../test/support/redundant-links-oracle';

import { lagCalendarKeyOf, PLAN_CALENDAR_KEY } from './lag-calendar-key';

/**
 * **The key is the engine's calendar identity, not a second opinion about it** (redundant-link-advisory
 * M2-T2). Two links share a lag-calendar key if and only if the engine walks their lags on one
 * calendar object (`undefined` meaning the plan's). The oracle's builders call
 * {@link lagCalendarKeyOf} for the rule's side and build the engine's edge calendars from the same plan
 * description, so this is the one place the two are compared head to head.
 */
describe('lagCalendarKeyOf', () => {
  it('names each source', () => {
    expect(lagCalendarKeyOf('TWENTY_FOUR_HOUR', 'CAL-A', 'CAL-B', 'CAL-P')).toBe('24H');
    expect(lagCalendarKeyOf('PROJECT_DEFAULT', 'CAL-A', 'CAL-B', 'CAL-P')).toBe('CAL-P');
    expect(lagCalendarKeyOf('PREDECESSOR', 'CAL-A', 'CAL-B', 'CAL-P')).toBe('CAL-A');
    expect(lagCalendarKeyOf('SUCCESSOR', 'CAL-A', 'CAL-B', 'CAL-P')).toBe('CAL-B');
  });

  it('a plan with no calendar of its own is still one calendar', () => {
    expect(lagCalendarKeyOf('PROJECT_DEFAULT', undefined, undefined, null)).toBe(PLAN_CALENDAR_KEY);
    expect(lagCalendarKeyOf('PREDECESSOR', undefined, undefined, null)).toBe(PLAN_CALENDAR_KEY);
  });

  it('an endpoint that inherits the plan calendar agrees with the plan default', () => {
    expect(lagCalendarKeyOf('PREDECESSOR', 'CAL-P', 'CAL-P', 'CAL-P')).toBe(
      lagCalendarKeyOf('PROJECT_DEFAULT', 'CAL-P', 'CAL-P', 'CAL-P'),
    );
  });
});

describe('key equality is calendar-object identity in the engine (400 random plans)', () => {
  it('holds for every pair of links', () => {
    let pairs = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const plan = generatePlan(seed, { dense: seed % 2 === 0 });
      const { edges, options } = buildEngineGraph(plan);
      const { dependencies } = buildRuleInput(plan);
      // The engine's rule: an edge with no calendar object is on the plan calendar.
      const calendarOf = (i: number) => edges[i]!.lagCalendar ?? options.calendar;
      for (let i = 0; i < edges.length; i += 1) {
        for (let j = i + 1; j < edges.length; j += 1) {
          pairs += 1;
          const sameKey = dependencies[i]!.lagCalendarKey === dependencies[j]!.lagCalendarKey;
          const sameCalendar = calendarOf(i) === calendarOf(j);
          expect(sameKey, `seed ${String(seed)} links ${String(i)} and ${String(j)}`).toBe(
            sameCalendar,
          );
        }
      }
    }
    expect(pairs).toBeGreaterThan(1000);
  });
});
