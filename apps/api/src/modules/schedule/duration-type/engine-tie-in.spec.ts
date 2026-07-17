import { describe, expect, it } from 'vitest';

import { computeSchedule } from '../engine/compute';
import type { EngineActivity } from '../engine/types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from '../engine/working-time-calendar';

import { resolveTriad } from './resolve-triad';

/**
 * F3.T3 — the engine tie-in golden (M7 rung 4, ADR-0040 §3/§6). The CPM engine is **untouched**: it
 * reads `durationMinutes` exactly as before. This proves the *whole* chain — a driving assignment's
 * units + rate → the pure `resolveTriad` → a persisted `durationMinutes` → the engine's placement —
 * for a `FIXED_UNITS` + `RESOURCE_DEPENDENT` activity scheduled on its driving-resource calendar
 * (the ADR-0039 seam). It also pins the parity no-op: with no rate the entered duration is unchanged.
 *
 * The plan calendar is Mon–Fri; the driving resource works 24/7. `2026-01-05` is a Monday.
 */
const DATA_DATE = '2026-01-05';
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
const TWENTY_FOUR_SEVEN = allMinutesWorkCalendar;

function run(activity: EngineActivity) {
  return computeSchedule([activity], [], { dataDate: DATA_DATE, calendar: FIVE_DAY }).results[0]!;
}

describe('duration-type engine tie-in (F3.T3, ADR-0040)', () => {
  it('schedules a FIXED_UNITS + RESOURCE_DEPENDENT activity on the DERIVED durationMinutes (driving-calendar seam)', () => {
    // A driving assignment carries U = 4 320 units at R = 60 units/working-hour. Editing the rate
    // derives the duration: D := U / R = 72 working hours ⇒ 4 320 working-minutes (= 3 days on 24/7).
    const resolved = resolveTriad('FIXED_UNITS', 'UNITS_PER_HOUR', {
      durationMinutes: 10 * 1440, // whatever was entered — held field is Units, so this is recomputed
      budgetedUnits: 4320,
      unitsPerHour: 60,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.durationMinutes).toBe(4320);

    // The engine reads that resolved durationMinutes unchanged and places it on the 24/7 driving port.
    const result = run({
      id: 'excavate',
      type: 'RESOURCE_DEPENDENT',
      durationMinutes: resolved.durationMinutes,
      calendar: TWENTY_FOUR_SEVEN,
    });
    // 3 elapsed days worked through the weekend-free 24/7 calendar: Mon 01-05 → Wed 01-07 inclusive.
    expect(result.earlyStart).toBe('2026-01-05');
    expect(result.earlyFinish).toBe('2026-01-07');
  });

  it('leaves the entered duration byte-identical when the driving assignment has no rate (parity)', () => {
    // No rate ⇒ resolveTriad is inert ⇒ durationMinutes is exactly what the planner entered.
    const resolved = resolveTriad('FIXED_UNITS', 'DURATION', {
      durationMinutes: 3 * 1440,
      budgetedUnits: 0,
      unitsPerHour: null,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.durationMinutes).toBe(3 * 1440);

    const derived = run({
      id: 'plain',
      type: 'RESOURCE_DEPENDENT',
      durationMinutes: resolved.durationMinutes,
      calendar: TWENTY_FOUR_SEVEN,
    });
    const asEntered = run({
      id: 'plain',
      type: 'RESOURCE_DEPENDENT',
      durationMinutes: 3 * 1440,
      calendar: TWENTY_FOUR_SEVEN,
    });
    expect(derived.earlyStart).toBe(asEntered.earlyStart);
    expect(derived.earlyFinish).toBe(asEntered.earlyFinish);
  });
});
