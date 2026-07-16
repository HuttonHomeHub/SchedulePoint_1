import type { ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge, EngineResult } from './types';
import { allMinutesWorkCalendar } from './working-time-calendar';

/**
 * Mandatory produce-and-flag (ADR-0035 §7, M4-F2). A `MANDATORY_START`/`MANDATORY_FINISH` pins its
 * date with the same MSO/MFO arithmetic as before, but — unlike a plain moderate constraint — is
 * allowed to override a stronger logic bound. When it does, the engine **produces** the (impossible)
 * schedule as pinned and **flags** it (`constraintViolated`), surfacing the broken relationship as
 * negative float on the predecessor; it never repairs it. A pin the network can satisfy is not
 * flagged. The whole feature is date-neutral for a plan with no mandatory constraints (byte-parity).
 */

const DATA_DATE = '2026-01-01';

const task = (
  id: string,
  durationDays: number,
  constraint?: { type: ConstraintType; date: string },
): EngineActivity => ({
  id,
  durationMinutes: durationDays * 1440,
  type: 'TASK',
  constraintType: constraint?.type ?? null,
  constraintDate: constraint?.date ?? null,
});

const edge = (predecessorId: string, successorId: string): EngineEdge => ({
  id: `${predecessorId}-${successorId}-FS`,
  predecessorId,
  successorId,
  type: 'FS',
  lagMinutes: 0,
});

function run(activities: readonly EngineActivity[], edges: readonly EngineEdge[] = []) {
  const output = computeSchedule(activities, edges, {
    dataDate: DATA_DATE,
    calendar: allMinutesWorkCalendar,
  });
  const byId = new Map<string, EngineResult>(output.results.map((r) => [r.activityId, r]));
  return { ...output, byId };
}

describe('mandatory produce-and-flag (ADR-0035 §7)', () => {
  it('flags a MANDATORY_START driven earlier than a predecessor requires, and holds the pin', () => {
    // A(3) → B; B is pinned to start on 2026-01-02, but A does not finish until 2026-01-03.
    const { byId, summary } = run(
      [task('A', 3), task('B', 2, { type: 'MANDATORY_START', date: '2026-01-02' })],
      [edge('A', 'B')],
    );
    // Produce: the pin holds regardless of logic.
    expect(byId.get('B')!.earlyStart).toBe('2026-01-02');
    // Flag: B broke the A→B relationship.
    expect(byId.get('B')!.constraintViolated).toBe(true);
    // Surface: the impossibility shows as negative float on the predecessor, never a dropped edge.
    expect(byId.get('A')!.totalFloat).toBeLessThan(0);
    expect(byId.get('A')!.isCritical).toBe(true);
    expect(byId.get('A')!.constraintViolated).toBe(false);
    expect(summary.constraintViolationCount).toBe(1);
  });

  it('flags a MANDATORY_FINISH pinned before the network-earliest finish (N10)', () => {
    // A(5) → B(2, MANDATORY_FINISH 2026-01-03): B cannot start until A finishes (offset 5), so a
    // finish pinned on the 3rd is impossible. Pin holds; B is flagged.
    const { byId, summary } = run(
      [task('A', 5), task('B', 2, { type: 'MANDATORY_FINISH', date: '2026-01-03' })],
      [edge('A', 'B')],
    );
    expect(byId.get('B')!.earlyFinish).toBe('2026-01-03'); // the finish pin holds
    expect(byId.get('B')!.constraintViolated).toBe(true);
    expect(summary.constraintViolationCount).toBe(1);
  });

  it('N10 impossible pair — both mandatory pins are produced and flagged, neither repaired', () => {
    // Q(2) → P(MANDATORY_START 2026-01-01) → A(1, MANDATORY_FINISH 2026-01-01).
    // Q pushes P past its pin (P flagged); A's finish pin precedes P (A flagged). Two flags, no repair.
    const { byId, summary } = run(
      [
        task('Q', 2),
        task('P', 2, { type: 'MANDATORY_START', date: '2026-01-01' }),
        task('A', 1, { type: 'MANDATORY_FINISH', date: '2026-01-01' }),
      ],
      [edge('Q', 'P'), edge('P', 'A')],
    );
    expect(byId.get('P')!.earlyStart).toBe('2026-01-01'); // pins held, not repaired
    expect(byId.get('A')!.earlyFinish).toBe('2026-01-01');
    expect(byId.get('P')!.constraintViolated).toBe(true);
    expect(byId.get('A')!.constraintViolated).toBe(true);
    expect(summary.constraintViolationCount).toBe(2);
  });

  it('does NOT flag a mandatory pin the network can satisfy (satisfiable ⇒ not flagged)', () => {
    // A(2) → B; B pinned MANDATORY_START on 2026-01-05, later than A's finish — a delay, not a break.
    const { byId, summary } = run(
      [task('A', 2), task('B', 1, { type: 'MANDATORY_START', date: '2026-01-05' })],
      [edge('A', 'B')],
    );
    expect(byId.get('B')!.earlyStart).toBe('2026-01-05');
    expect(byId.get('B')!.constraintViolated).toBe(false);
    expect(byId.get('A')!.constraintViolated).toBe(false);
    expect(summary.constraintViolationCount).toBe(0);
  });

  it('a standalone mandatory pin (no predecessor) is never a violation', () => {
    const { byId, summary } = run([
      task('A', 2, { type: 'MANDATORY_START', date: '2026-01-03' }),
      task('B', 2, { type: 'MANDATORY_FINISH', date: '2026-01-06' }),
    ]);
    expect(byId.get('A')!.constraintViolated).toBe(false);
    expect(byId.get('B')!.constraintViolated).toBe(false);
    expect(summary.constraintViolationCount).toBe(0);
  });

  it('counts an N15 warning — a SNET dated before the data date (honoured, cannot pull work back)', () => {
    // The SNET is honoured but the data-date floor governs, so the start stays at the data date.
    const { byId, summary } = run([task('A', 2, { type: 'SNET', date: '2025-12-20' })]);
    expect(byId.get('A')!.earlyStart).toBe('2026-01-01');
    expect(summary.constraintWarningCount).toBe(1);
    expect(summary.constraintViolationCount).toBe(0);
    expect(byId.get('A')!.constraintViolated).toBe(false);
  });

  it('no-mandatory plan is byte-identical and reports zero violations/warnings', () => {
    const { byId, summary } = run([task('A', 3), task('B', 2)], [edge('A', 'B')]);
    expect(byId.get('B')!.earlyStart).toBe('2026-01-04');
    expect(byId.get('A')!.constraintViolated).toBe(false);
    expect(byId.get('B')!.constraintViolated).toBe(false);
    expect(summary.constraintViolationCount).toBe(0);
    expect(summary.constraintWarningCount).toBe(0);
  });
});
