import { describe, expect, it } from 'vitest';

import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  computeSchedule,
  fullDayWeek,
  ScheduleGraphNotADagError,
  UnknownActivityError,
} from '../engine';
import type { EngineActivity, EngineEdge } from '../engine';

/**
 * Negative-case contract (ADR-0034 §4): a hostile input must **reject, repair, or
 * report — never hang, crash, or silently produce nonsense**. These assert the
 * behaviour of *today's* pure engine for the cases it owns (topology + calendar
 * walkers); the input-validity cases (negative duration, milestone-with-duration,
 * LOE-with-no-span) are **API-boundary** concerns (ADR-0035 §25) validated at the
 * DTO/service layer, not the pure engine — they are marked `todo` here so the
 * engine-level gap is visible, and are covered by API e2e as those land.
 *
 * Fixture references: `fixtures/negative_cases.json` (N01–N18).
 */

const task = (id: string): EngineActivity => ({ id, durationMinutes: 1440, type: 'TASK' });
const dataDate = '2026-06-01';

/** Capture a thrown error for property inspection (vitest's toThrow can't assert fields). */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw, but it did not');
}

describe('negative-case contract (engine-owned cases)', () => {
  it('N01: a three-activity FS cycle is rejected, naming the cycle members', () => {
    const activities = [task('A'), task('B'), task('C')];
    const edges: EngineEdge[] = [
      { id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 0 },
      { id: 'e2', predecessorId: 'B', successorId: 'C', type: 'FS', lagMinutes: 0 },
      { id: 'e3', predecessorId: 'C', successorId: 'A', type: 'FS', lagMinutes: 0 },
    ];
    const error = caught(() =>
      computeSchedule(activities, edges, { dataDate, calendar: allMinutesWorkCalendar }),
    );
    expect(error).toBeInstanceOf(ScheduleGraphNotADagError);
    expect([...(error as ScheduleGraphNotADagError).unresolvedActivityIds].sort()).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('N02: a self-loop is rejected, naming the activity', () => {
    const error = caught(() =>
      computeSchedule(
        [task('A')],
        [{ id: 'e1', predecessorId: 'A', successorId: 'A', type: 'FS', lagMinutes: 0 }],
        { dataDate, calendar: allMinutesWorkCalendar },
      ),
    );
    expect(error).toBeInstanceOf(ScheduleGraphNotADagError);
    expect((error as ScheduleGraphNotADagError).unresolvedActivityIds).toEqual(['A']);
  });

  it('N03: a cycle that exists only through SS/FF edges is still caught (not FS-only detection)', () => {
    const edges: EngineEdge[] = [
      { id: 'e1', predecessorId: 'A', successorId: 'B', type: 'SS', lagMinutes: 0 },
      { id: 'e2', predecessorId: 'B', successorId: 'A', type: 'FF', lagMinutes: 0 },
    ];
    const error = caught(() =>
      computeSchedule([task('A'), task('B')], edges, {
        dataDate,
        calendar: allMinutesWorkCalendar,
      }),
    );
    expect(error).toBeInstanceOf(ScheduleGraphNotADagError);
    expect([...(error as ScheduleGraphNotADagError).unresolvedActivityIds].sort()).toEqual([
      'A',
      'B',
    ]);
  });

  it('N05: a relationship to a non-existent activity is rejected, naming it', () => {
    const error = caught(() =>
      computeSchedule(
        [task('A')],
        [{ id: 'e1', predecessorId: 'A', successorId: 'GHOST', type: 'FS', lagMinutes: 0 }],
        { dataDate, calendar: allMinutesWorkCalendar },
      ),
    );
    expect(error).toBeInstanceOf(UnknownActivityError);
    expect((error as UnknownActivityError).activityId).toBe('GHOST');
  });

  it('N11: a calendar with no working time is rejected at construction (the hang-test analogue)', () => {
    // A calendar with no working minutes at all would make addWorkingTime non-terminating,
    // so the factory refuses it — report, never hang. ADR-0036 restores this as a
    // "no working time in horizon" check.
    expect(() => buildWorkingTimeCalendar(fullDayWeek([]), [])).toThrow(
      /at least one working minute/,
    );
  });

  it('N16: an enormous lag terminates quickly with a finite date (no walker hang)', () => {
    // 100,000 h ≈ 12,500 working days. The O(log n) week-arithmetic walker must not
    // spin — it returns a far-future but finite date. (If this ever hangs, the test
    // times out, which is the failure ADR-0036 §5 guards against.)
    const monFri = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
    const output = computeSchedule(
      [task('A'), task('B')],
      [{ id: 'e1', predecessorId: 'A', successorId: 'B', type: 'FS', lagMinutes: 12_500 * 1440 }],
      { dataDate: '2026-01-05', calendar: monFri },
    );
    const b = output.results.find((r) => r.activityId === 'B');
    expect(b?.earlyStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // ~12,500 working days out — comfortably finite and far future.
    expect(Number(b!.earlyStart.slice(0, 4))).toBeGreaterThan(2030);
  });

  // Input-validity cases owned by the API boundary (DTO/service), not the pure engine
  // (ADR-0035 §25). The engine intentionally does not re-validate these; they are
  // asserted at the API e2e layer as boundary rejection/coercion lands.
  it.todo('N09: negative duration is rejected at the API boundary (ADR-0035 §25)');
  it.todo('N12: a level-of-effort with no span is rejected/warned (ADR-0035 §21, M5)');
  it.todo('N17: a milestone with a non-zero duration is coerced to zero (ADR-0035 §25)');
});
