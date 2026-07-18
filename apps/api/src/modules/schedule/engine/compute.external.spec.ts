import type { ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * External / inter-project dates (ADR-0043, ADR-0035 §30). An imported `externalEarlyStart` is an
 * SNET-shaped forward lower bound (floored at the data date, N25); an `externalLateFinish` is an
 * FNLT-shaped backward upper bound. Both are **soft** — the later/tighter of logic and the external
 * bound drives, a hard pin still overrides them (§30.3), and the plan-level `ignoreExternalRelationships`
 * option drops both (§30.4). Absent inputs ⇒ byte-identical to the pre-ADR-0043 engine (the parity gate).
 * All on a continuous 24/7 calendar so a day is a clean 1,440-minute offset.
 */

const DATA_DATE = '2026-01-01';
const DAY = 1440;

const task = (
  id: string,
  durationDays: number,
  external?: { earlyStart?: string; lateFinish?: string; type?: ConstraintType; date?: string },
): EngineActivity => ({
  id,
  durationMinutes: durationDays * DAY,
  type: 'TASK',
  constraintType: external?.type ?? null,
  constraintDate: external?.date ?? null,
  externalEarlyStart: external?.earlyStart ?? null,
  externalLateFinish: external?.lateFinish ?? null,
});

const fs = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}-FS`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[] = [],
  ignoreExternalRelationships = false,
) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
    ignoreExternalRelationships,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('external early start — SNET-shaped forward bound (§30.1)', () => {
  it('drives the early start forward when later than logic', () => {
    // A alone would start at the data date; an external early start of 01-04 pushes it to offset 3 days.
    const { byId, summary } = run([task('A', 2, { earlyStart: '2026-01-04' })]);
    const a = byId.get('A')!;
    expect(a.earlyStartOffset).toBe(3 * DAY);
    expect(a.earlyFinishOffset).toBe(5 * DAY);
    expect(a.externalDriven).toBe(true);
    expect(summary.externalDrivenCount).toBe(1);
  });

  it('the LATER of an internal predecessor and the external date drives (A2120 shape)', () => {
    // P(3) → A(2). A's logic-earliest is offset 3 (P's finish). An external 01-06 (offset 5) is later,
    // so it drives; an external 01-02 (offset 1) is earlier, so logic drives and external is inert.
    const external = run(
      [task('P', 3), task('A', 2, { earlyStart: '2026-01-06' })],
      [fs('P', 'A')],
    );
    expect(external.byId.get('A')!.earlyStartOffset).toBe(5 * DAY);
    expect(external.byId.get('A')!.externalDriven).toBe(true);

    const logic = run([task('P', 3), task('A', 2, { earlyStart: '2026-01-02' })], [fs('P', 'A')]);
    expect(logic.byId.get('A')!.earlyStartOffset).toBe(3 * DAY); // predecessor wins
    expect(logic.byId.get('A')!.externalDriven).toBeUndefined(); // not external-driven
    expect(logic.summary.externalDrivenCount).toBeUndefined();
  });

  it('N25 — an external early start before the data date is clamped to it and warned', () => {
    // 2025-12-20 is before the 2026-01-01 data date: honoured but floored at the data date (offset 0).
    const { byId, summary } = run([task('A', 2, { earlyStart: '2025-12-20' })]);
    expect(byId.get('A')!.earlyStartOffset).toBe(0);
    expect(summary.constraintWarningCount).toBe(1); // the N15/N25 warning class
    // Clamped to the data date, it never rose above pure logic, so it is not flagged external-driven.
    expect(byId.get('A')!.externalDriven).toBeUndefined();
  });
});

describe('external late finish — FNLT-shaped backward bound (§30.2)', () => {
  it('tightens the late finish and cuts float', () => {
    // A(2) ∥ B(5): A floats 3 days against the long path. An external late finish of 01-03 clamps A's
    // late finish to offset 3 days, collapsing the float to 1 day — the backward pass moved.
    const { byId } = run([task('A', 2, { lateFinish: '2026-01-03' }), task('B', 5)]);
    const a = byId.get('A')!;
    expect(a.earlyFinishOffset).toBe(2 * DAY); // forward untouched
    expect(a.lateFinishOffset).toBe(3 * DAY);
    expect(a.totalFloat).toBe(1 * DAY);
    expect(a.externalDriven).toBe(true);
  });

  it('goes negative when it is earlier than logic can achieve', () => {
    // A(3) alone finishes at offset 3; an external late finish of 01-02 demands finishing by offset 2,
    // which logic cannot meet — surfaced as negative float, never an error.
    const { byId, summary } = run([task('A', 3, { lateFinish: '2026-01-02' })]);
    const a = byId.get('A')!;
    expect(a.earlyFinishOffset).toBe(3 * DAY);
    expect(a.lateFinishOffset).toBe(2 * DAY);
    expect(a.totalFloat).toBe(-1 * DAY);
    expect(a.isCritical).toBe(true);
    expect(summary.externalDrivenCount).toBe(1);
  });
});

describe('soft — a hard pin overrides an external bound (§30.3)', () => {
  it('a Must-Finish-On pin wins over an external late finish; external is inert', () => {
    // A(2) with MFO 01-05 pins its finish to offset 5; an external late finish of 01-03 is softer and
    // is discarded (the pin governs), so A is not flagged external-driven.
    const { byId } = run([
      task('A', 2, { type: 'MFO', date: '2026-01-05', lateFinish: '2026-01-03' }),
    ]);
    const a = byId.get('A')!;
    expect(a.lateFinishOffset).toBe(5 * DAY); // the MFO pin, not the external 01-03
    expect(a.externalDriven).toBeUndefined();
  });
});

describe('ignore-external drops both directions (§30.4, scenario S09)', () => {
  it('drops external early starts (the chain pulls left) and late finishes', () => {
    // P(3) → A(2), A carries an external early start of 01-06 (drives it to offset 5) and B(2) carries an
    // external late finish of 01-02 (cuts its float). With ignore-external on, both bounds drop.
    const activities = [
      task('P', 3),
      task('A', 2, { earlyStart: '2026-01-06' }),
      task('B', 2, { lateFinish: '2026-01-02' }),
    ];
    const edges = [fs('P', 'A')];

    const honoured = run(activities, edges, false);
    expect(honoured.byId.get('A')!.earlyStartOffset).toBe(5 * DAY); // external drives
    expect(honoured.byId.get('B')!.lateFinishOffset).toBe(2 * DAY); // external cuts

    const ignored = run(activities, edges, true);
    expect(ignored.byId.get('A')!.earlyStartOffset).toBe(3 * DAY); // pulled back to logic (P's finish)
    expect(ignored.byId.get('A')!.externalDriven).toBeUndefined();
    expect(ignored.byId.get('B')!.externalDriven).toBeUndefined();
    expect(ignored.summary.externalDrivenCount).toBeUndefined();
    expect(ignored.summary.constraintWarningCount).toBe(0); // no N25 warning when ignored
  });
});

describe('parity — the no-external path is byte-identical', () => {
  it('a plan with no external data is identical with the option on or off, and carries no external keys', () => {
    const activities = [task('P', 3), task('A', 2)];
    const edges = [fs('P', 'A')];
    const off = run(activities, edges, false);
    const on = run(activities, edges, true);
    expect(on.results).toEqual(off.results);
    expect(off.summary).toEqual(on.summary);
    // The optional external fields are ABSENT (not `false`/`0`) on the no-external path — the parity
    // guarantee that keeps existing golden snapshots unchanged.
    for (const result of off.results) expect(result.externalDriven).toBeUndefined();
    expect(off.summary.externalDrivenCount).toBeUndefined();
  });
});
