import type { DependencyType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Make-open-ends-critical goldens (M6-F4, ADR-0035 §20). When the option is on, every **open end** — an
 * activity with no predecessors OR no successors — is flagged critical, OR-ed with the active
 * definition. An **interior** floating activity (both a predecessor and a successor) is NOT flagged, so
 * the option can only ADD open ends, never a mid-chain member. Off is the byte-identical P6 default.
 * 24/7 calendar, 1 day = 1440 minutes.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (id: string, durationDays: number): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
});
const edge = (
  predecessorId: string,
  successorId: string,
  type: DependencyType = 'FS',
): EngineEdge => ({
  id: `${predecessorId}-${successorId}-${type}`,
  predecessorId,
  successorId,
  type,
  lagMinutes: 0,
});

// A(2)→B(2)→D(1); C(6)→D. C drives D. A is an open START (no predecessors), D an open END (no
// successors), B is INTERIOR (pred A, succ D) — and both A and B carry 2 days of float.
const ACTIVITIES = [task('A', 2), task('B', 2), task('C', 6), task('D', 1)];
const EDGES = [edge('A', 'B'), edge('B', 'D'), edge('C', 'D')];

function run(makeOpenEndsCritical: boolean) {
  const output = computeSchedule(ACTIVITIES, EDGES, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
    makeOpenEndsCritical,
  });
  return new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
}

describe('computeSchedule — make open ends critical (M6-F4)', () => {
  it('off (default): only the zero-float driving chain is critical', () => {
    const byId = run(false);
    expect(byId.get('A')!.isCritical).toBe(false); // open start, but 2 days float
    expect(byId.get('B')!.isCritical).toBe(false);
    expect(byId.get('C')!.isCritical).toBe(true);
    expect(byId.get('D')!.isCritical).toBe(true);
  });

  it('on: floating open ends flip critical, but an interior floating activity does not', () => {
    const byId = run(true);
    expect(byId.get('A')!.isCritical).toBe(true); // open start → now critical
    expect(byId.get('D')!.isCritical).toBe(true); // open end → still critical
    expect(byId.get('C')!.isCritical).toBe(true); // open start (and already critical)
    // B has both a predecessor and a successor, so the option can never flag it — the key discriminator.
    expect(byId.get('B')!.isCritical).toBe(false);
    // The dates and float are untouched — only the flag changes.
    expect(byId.get('A')!.totalFloat).toBe(2 * DAY);
  });
});
