import { describe, expect, it } from 'vitest';

import {
  computeRevisionDelta,
  daysBetweenIso,
  selectCarrierFromRows,
  type RevisionRow,
} from './revision-delta';

/**
 * The delta is a pure function over two arrays, so there is no excuse for a branch without a case.
 * The load-bearing one is the TOTALITY test: the four criticality outcomes plus ADDED and REMOVED
 * must partition the union of both sides, asserted on counts AND on ids (the ADR-0116 D3 pattern —
 * four independent evaluators that happen to agree today is not a partition).
 */

const row = (o: Partial<RevisionRow> & { activityId: string }): RevisionRow => ({
  code: null,
  name: o.activityId,
  type: 'TASK',
  isCritical: false,
  totalFloatDays: 0,
  earlyStart: '2026-01-01',
  earlyFinish: '2026-01-05',
  ...o,
});

const CAP = 200;

describe('computeRevisionDelta', () => {
  it('partitions the union of both sides — counts AND ids', () => {
    const from = [
      row({ activityId: 'stays-critical', isCritical: true }),
      row({ activityId: 'stays-slack' }),
      row({ activityId: 'leaves', isCritical: true }),
      row({ activityId: 'enters' }),
      row({ activityId: 'removed' }),
    ];
    const to = [
      row({ activityId: 'stays-critical', isCritical: true }),
      row({ activityId: 'stays-slack' }),
      row({ activityId: 'leaves' }),
      row({ activityId: 'enters', isCritical: true }),
      row({ activityId: 'added' }),
    ];
    const d = computeRevisionDelta(from, to, CAP);

    const union = new Set([...from, ...to].map((r) => r.activityId));
    const accounted = [
      ...d.entered.map((r) => r.activityId),
      ...d.left.map((r) => r.activityId),
      ...d.added.map((r) => r.activityId),
      ...d.removed.map((r) => r.activityId),
    ];
    // Ids first: a count equality can be satisfied by two mistakes cancelling.
    expect(new Set([...accounted, 'stays-critical', 'stays-slack'])).toEqual(union);
    expect(
      d.entered.length +
        d.left.length +
        d.added.length +
        d.removed.length +
        d.remainedCriticalCount +
        d.remainedNonCriticalCount,
    ).toBe(union.size);
  });

  it('reports an activity added AND critical on arrival as ADDED only — appearing is not entering', () => {
    const d = computeRevisionDelta([], [row({ activityId: 'new', isCritical: true })], CAP);
    expect(d.added.map((r) => r.activityId)).toEqual(['new']);
    // The tempting implementation reports both. It did not enter a path it was never off.
    expect(d.entered).toHaveLength(0);
  });

  it('keeps a null float null rather than coercing it to zero', () => {
    const d = computeRevisionDelta(
      [row({ activityId: 'a', totalFloatDays: null })],
      [row({ activityId: 'a', isCritical: true, totalFloatDays: 0 })],
      CAP,
    );
    // Absence and zero are different facts. `variance.ts:90-93` already takes this line; matched,
    // not re-decided.
    expect(d.entered[0]?.fromTotalFloatDays).toBeNull();
    expect(d.entered[0]?.floatMovementDays).toBeNull();
  });

  it('excludes a WBS_SUMMARY from entered and left without dropping it from the union', () => {
    const from = [row({ activityId: 's', type: 'WBS_SUMMARY' })];
    const to = [row({ activityId: 's', type: 'WBS_SUMMARY', isCritical: true })];
    const d = computeRevisionDelta(from, to, CAP);
    // A summary is never critical, never driving and never defines the finish. Reporting one as
    // having "entered the critical path" would be noise — but it must still be counted, or the
    // totality assertion above becomes satisfiable by silently dropping rows.
    expect(d.entered).toHaveLength(0);
    expect(d.left).toHaveLength(0);
    expect(d.remainedCriticalCount + d.remainedNonCriticalCount).toBe(1);
  });

  it('caps entered and left while reporting the TRUE totals', () => {
    const from = Array.from({ length: 5 }, (_, i) => row({ activityId: `a${String(i)}` }));
    const to = from.map((r) => ({ ...r, isCritical: true }));
    const d = computeRevisionDelta(from, to, 2);
    expect(d.entered).toHaveLength(2);
    // "Showing 2 of 5" is never the client's own number.
    expect(d.enteredTotal).toBe(5);
  });

  it('orders entered by float movement descending, nulls last, then code then id', () => {
    const from = [
      row({ activityId: 'small', code: 'B', totalFloatDays: 1 }),
      row({ activityId: 'big', code: 'A', totalFloatDays: 10 }),
      row({ activityId: 'unknown', code: 'C', totalFloatDays: null }),
    ];
    const to = from.map((r) => ({ ...r, isCritical: true, totalFloatDays: 0 }));
    const d = computeRevisionDelta(from, to, CAP);
    // An unknown movement is not a large one, so it sorts last rather than first.
    expect(d.entered.map((r) => r.activityId)).toEqual(['small', 'big', 'unknown']);
  });

  it('reports NO_CRITICAL_PATH when neither side has a critical non-summary activity', () => {
    const d = computeRevisionDelta([row({ activityId: 'a' })], [row({ activityId: 'a' })], CAP);
    expect(d.noCriticalPath).toBe(true);
  });

  it('does not report NO_CRITICAL_PATH on the strength of a critical SUMMARY alone', () => {
    const rows = [row({ activityId: 's', type: 'WBS_SUMMARY', isCritical: true })];
    // A summary's criticality is a rollup artefact; treating it as a critical path would make the
    // reason silently wrong on exactly the plans that use WBS.
    expect(computeRevisionDelta(rows, rows, CAP).noCriticalPath).toBe(true);
  });
});

describe('the completion carrier', () => {
  it('measures the movement of the OLD side’s carrier, not the max-over-all finish', () => {
    const from = [
      row({ activityId: 'late', earlyFinish: '2026-01-10' }),
      row({ activityId: 'early', earlyFinish: '2026-01-02' }),
    ];
    const to = [
      row({ activityId: 'late', earlyFinish: '2026-01-24' }),
      row({ activityId: 'early', earlyFinish: '2026-01-02' }),
    ];
    const d = computeRevisionDelta(from, to, CAP);
    expect(d.completion.assessable).toBe(true);
    expect(d.completion.carrierActivityId).toBe('late');
    expect(d.completion.movementDays).toBe(14);
  });

  it('reports CARRIER_REMOVED, and still returns the criticality delta', () => {
    const from = [
      row({ activityId: 'gone', earlyFinish: '2026-01-10' }),
      row({ activityId: 'kept', isCritical: true }),
    ];
    const to = [row({ activityId: 'kept' })];
    const d = computeRevisionDelta(from, to, CAP);
    expect(d.completion.assessable).toBe(false);
    expect(d.completion.reason).toBe('CARRIER_REMOVED');
    // The separation is the point: one being unanswerable must not blank the other.
    expect(d.left.map((r) => r.activityId)).toEqual(['kept']);
  });

  it('reports PLAN_NOT_SCHEDULED when a side has no computed finish at all', () => {
    const d = computeRevisionDelta(
      [row({ activityId: 'a', earlyFinish: null })],
      [row({ activityId: 'a', earlyFinish: null })],
      CAP,
    );
    expect(d.completion.reason).toBe('PLAN_NOT_SCHEDULED');
  });

  it('flags carrierChanged with BOTH identities when the new side finishes on someone else', () => {
    const from = [
      row({ activityId: 'was-last', name: 'Handover', earlyFinish: '2026-01-10' }),
      row({ activityId: 'other', name: 'Commissioning', earlyFinish: '2026-01-02' }),
    ];
    const to = [
      row({ activityId: 'was-last', name: 'Handover', earlyFinish: '2026-01-12' }),
      row({ activityId: 'other', name: 'Commissioning', earlyFinish: '2026-02-01' }),
    ];
    const d = computeRevisionDelta(from, to, CAP);
    // Still measured on the OLD carrier — that is what "how much later is the job" means against a
    // fixed reference — while the fact that someone else now finishes last is reported beside it.
    expect(d.completion.movementDays).toBe(2);
    expect(d.completion.carrierChanged).toBe(true);
    expect(d.completion.newSideCarrierActivityId).toBe('other');
    expect(d.completion.newSideCarrierName).toBe('Commissioning');
  });

  it('never chooses a summary as the carrier', () => {
    const rows = [
      row({ activityId: 'summary', type: 'WBS_SUMMARY', earlyFinish: '2026-12-31' }),
      row({ activityId: 'real', earlyFinish: '2026-01-05' }),
    ];
    // A summary's finish is a rollup over its children, so it is always at least as late as the
    // latest of them and would win every time.
    expect(selectCarrierFromRows(rows)?.activityId).toBe('real');
  });

  it('breaks a same-day tie by id ascending, deterministically', () => {
    const rows = [
      row({ activityId: 'zeta', earlyFinish: '2026-01-05' }),
      row({ activityId: 'alpha', earlyFinish: '2026-01-05' }),
    ];
    // THIS IS THE RESIDUAL M0's F2 limb recorded. `selectCompletionCarrier` sorts on minutes and
    // can pick the other one; these rows carry a date, which cannot separate them. The rule is
    // deterministic, and the panel names the carrier and states the tie-break rather than implying
    // the choice was unique. Do not "reconcile" the two by pretending a date carries minutes.
    expect(selectCarrierFromRows(rows)?.activityId).toBe('alpha');
  });

  it('ignores rows with no finish when choosing a carrier', () => {
    const rows = [row({ activityId: 'nofinish', earlyFinish: null }), row({ activityId: 'real' })];
    expect(selectCarrierFromRows(rows)?.activityId).toBe('real');
  });
});

describe('daysBetweenIso', () => {
  it('is positive when the second date is later, and spans a month boundary', () => {
    expect(daysBetweenIso('2026-01-28', '2026-02-04')).toBe(7);
  });

  it('is negative when the job pulled forward', () => {
    expect(daysBetweenIso('2026-02-04', '2026-01-28')).toBe(-7);
  });

  it('is zero for the same day, not null', () => {
    // Zero movement is a real answer and must not read as "not assessable".
    expect(daysBetweenIso('2026-01-05', '2026-01-05')).toBe(0);
  });
});
