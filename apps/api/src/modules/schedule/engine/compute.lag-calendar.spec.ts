import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * Per-relationship lag-calendar tests (M3, ADR-0036 §6). The lag term of a relationship can
 * be measured on a calendar other than the plan calendar; the canonical case is a **24-Hour
 * (elapsed)** lag — concrete cure — where `168h` is 7 elapsed days, not "7 working days".
 *
 * The plan calendar here is a deliberately non-24/7 **6-day / 10-hour** week (Mon–Sat
 * 08:00–18:00, Sunday off) so that an elapsed lag and a working-day lag give visibly
 * different answers. `2026-01-05` is a Monday.
 */
const DATA_DATE = '2026-01-05';
const MIN = 600; // one working day on the 6-day/10h calendar
const H = 60;

/** Mon–Sat 08:00–18:00 (10h), Sunday off — the plan calendar under test. */
const SIX_DAY_10H: WorkingTimeCalendar = buildWorkingTimeCalendar(
  [
    [{ startMinute: 480, endMinute: 1080 }],
    [{ startMinute: 480, endMinute: 1080 }],
    [{ startMinute: 480, endMinute: 1080 }],
    [{ startMinute: 480, endMinute: 1080 }],
    [{ startMinute: 480, endMinute: 1080 }],
    [{ startMinute: 480, endMinute: 1080 }],
    [],
  ],
  [],
);

const task = (id: string, durationMinutes: number): EngineActivity => ({
  id,
  durationMinutes,
  type: 'TASK',
});
const milestone = (id: string): EngineActivity => ({
  id,
  durationMinutes: 0,
  type: 'START_MILESTONE',
});

function edge(
  predecessorId: string,
  successorId: string,
  type: DependencyType,
  lagMinutes: number,
  lagCalendar?: WorkingTimeCalendar,
): EngineEdge {
  return {
    id: `${predecessorId}-${successorId}-${type}-${lagMinutes}`,
    predecessorId,
    successorId,
    type,
    lagMinutes,
    ...(lagCalendar ? { lagCalendar } : {}),
  };
}

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  calendar: WorkingTimeCalendar = SIX_DAY_10H,
) {
  const output = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('per-relationship lag calendar — 24-Hour (elapsed) lag', () => {
  // M (start milestone at the data date) → B, FS + 168h.
  const activities = [milestone('M'), task('B', MIN)];
  const elapsed = run(activities, [edge('M', 'B', 'FS', 168 * H, allMinutesWorkCalendar)]);
  const working = run(activities, [edge('M', 'B', 'FS', 168 * H)]); // default: plan-calendar lag

  it('walks the lag as elapsed time: 168h after a Monday milestone lands the next Monday', () => {
    // 168h = 7 elapsed days from Mon 05-Jan → Mon 12-Jan; the first working minute is Mon 08:00.
    const b = elapsed.byId.get('B')!;
    expect(b.earlyStart).toBe('2026-01-12');
    // 6 working days (Mon–Sat, Sunday skipped) precede that landing on this calendar.
    expect(b.earlyStartOffset).toBe(6 * MIN);
  });

  it('differs from — and is earlier than — the same lag measured on the plan calendar', () => {
    const elapsedB = elapsed.byId.get('B')!;
    const workingB = working.byId.get('B')!;
    // The default measures 168h as 10 080 working minutes on the 6-day/10h calendar (≈ 16.8
    // working days), pushing B far later; the elapsed lag is only ~7 calendar days out.
    expect(workingB.earlyStartOffset).toBe(168 * H); // literal anchor + lag (fast path)
    expect(elapsedB.earlyStartOffset).toBeLessThan(workingB.earlyStartOffset);
    expect(elapsedB.earlyStart).not.toBe(workingB.earlyStart);
  });

  it('keeps float symmetric on the single chain (forward/backward applyLag invert)', () => {
    // Both nodes are on the only path → every total float is exactly 0 (=== treats -0 as 0).
    for (const id of ['M', 'B']) expect(elapsed.byId.get(id)!.totalFloat === 0).toBe(true);
  });
});

describe('per-relationship lag calendar — forward/backward stay symmetric', () => {
  // A single chain of positive 24-Hour lags anchored at the data date (no floor clamp): if
  // forward (+lag) and backward (−lag) route through the same applyLag, the backward bounds
  // exactly invert the forward ones, so every activity has zero float.
  const activities = [task('A', 3 * MIN), task('B', 2 * MIN), task('C', MIN)];
  const edges = [
    edge('A', 'B', 'FS', 7 * 24 * H, allMinutesWorkCalendar), // +7 elapsed days
    edge('B', 'C', 'FS', 2 * 24 * H, allMinutesWorkCalendar), // +2 elapsed days
  ];
  const out = run(activities, edges);

  it('every activity on the positive-lag chain is critical with zero float', () => {
    for (const id of ['A', 'B', 'C']) {
      expect(out.byId.get(id)!.totalFloat).toBe(0);
      expect(out.byId.get(id)!.isCritical).toBe(true);
    }
  });
});

describe('per-relationship lag calendar — a negative lead walks back on the lag calendar', () => {
  // A(20d) → B FS − 7 elapsed days. The lead is measured on the lag calendar, so it differs
  // from the same lead measured on the plan calendar, and B starts before A finishes.
  const activities = [task('A', 20 * MIN), task('B', MIN)];
  const elapsed = run(activities, [edge('A', 'B', 'FS', -7 * 24 * H, allMinutesWorkCalendar)]);
  const working = run(activities, [edge('A', 'B', 'FS', -7 * 24 * H)]);

  it('is honoured on the lag calendar (differs from a plan-calendar lead) and leads the finish', () => {
    const b = elapsed.byId.get('B')!;
    const aFinish = elapsed.byId.get('A')!.earlyFinishOffset;
    expect(b.earlyStartOffset).toBeGreaterThan(0); // no floor clamp at this anchor
    expect(b.earlyStartOffset).toBeLessThan(aFinish); // a genuine lead
    expect(b.earlyStartOffset).not.toBe(working.byId.get('B')!.earlyStartOffset);
  });
});

describe('per-relationship lag calendar — honoured on SS/FF/SF (lag term only)', () => {
  const activities = [task('A', 3 * MIN), task('B', 2 * MIN)];
  for (const type of ['SS', 'FF', 'SF'] as const) {
    it(`${type}: the 24-Hour lag moves the successor vs the plan-calendar lag`, () => {
      const elapsed = run(activities, [edge('A', 'B', type, 168 * H, allMinutesWorkCalendar)]);
      const working = run(activities, [edge('A', 'B', type, 168 * H)]);
      // The lag term runs on the lag calendar for every anchor type, so the two disagree.
      expect(elapsed.byId.get('B')!.earlyStartOffset).not.toBe(
        working.byId.get('B')!.earlyStartOffset,
      );
    });
  }
});

describe('per-relationship lag calendar — default path is exact', () => {
  const activities = [task('A', 2 * MIN), task('B', MIN)];

  it('an undefined lag calendar is the literal anchor + lag (no calendar round-trip)', () => {
    const out = run(activities, [edge('A', 'B', 'FS', 5 * MIN)]);
    // A finishes at offset 2*MIN; FS + 5 working days → B starts at 7*MIN, exactly.
    expect(out.byId.get('B')!.earlyStartOffset).toBe(7 * MIN);
  });

  it('a 24-Hour lag equals the default when the PLAN calendar is itself 24/7', () => {
    // On an all-minutes-work plan calendar, an elapsed lag and a working lag coincide.
    const elapsed = run(
      activities,
      [edge('A', 'B', 'FS', 3 * MIN, allMinutesWorkCalendar)],
      allMinutesWorkCalendar,
    );
    const working = run(activities, [edge('A', 'B', 'FS', 3 * MIN)], allMinutesWorkCalendar);
    expect(elapsed.byId.get('B')!.earlyStartOffset).toBe(working.byId.get('B')!.earlyStartOffset);
  });
});

describe('per-relationship lag calendar — a huge elapsed lag terminates finitely (N16)', () => {
  it('a 100,000h 24-Hour lag computes without hanging', () => {
    const activities = [milestone('M'), task('B', MIN)];
    const out = run(activities, [edge('M', 'B', 'FS', 100_000 * H, allMinutesWorkCalendar)]);
    const b = out.byId.get('B')!;
    expect(b.earlyStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 100,000h ≈ 11.4 elapsed years → a far-future but finite offset.
    expect(b.earlyStartOffset).toBeGreaterThan(1000 * MIN);
  });
});
