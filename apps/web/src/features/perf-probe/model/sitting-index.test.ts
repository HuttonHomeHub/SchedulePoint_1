import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';

import { sittingsFromRows } from './sitting';
import {
  describeReadings,
  describeVerdicts,
  sittingIndexRow,
  type SittingIndexRow,
} from './sitting-index';

/**
 * The index row's rules, each verified against the wrong implementation it would be easy to write.
 *
 * The index exists because the expanded blocks were 8,487 px of a 12,842 px page
 * (`docs/specs/staff-console-design/m7-probe-history.md`). Its rows carry the facts the blocks
 * carried, so every assertion here is about **not losing one in the compression**.
 */

const PHASE = { droppedPct: 0, intervalP50: 16.7, intervalP95: 17.2, fps: 59.9 };

const row = (over: Partial<ProbeResultRow> = {}): ProbeResultRow => ({
  id: 'r1',
  runId: 'run-1',
  sweepId: null,
  framesPerPhase: 180,
  recordedAt: '2026-09-08T18:00:00.000Z',
  recordedByLabel: 'owner',
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'absolute',
  preset: 'week',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars',
  samples: [PHASE, PHASE, PHASE],
  counts: { visibleBars: 243 },
  thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  idleIntervalMs: 16.7,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel Arc Pro',
  userAgent: 'test-agent',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.125.0',
  apiVersion: '0.61.0',
  ...over,
});

const indexOf = (rows: ProbeResultRow[], expected = 6): SittingIndexRow => {
  const sitting = sittingsFromRows(rows)[0];
  if (sitting === undefined) throw new Error('fixture produced no sitting');
  return sittingIndexRow(sitting, expected);
};

describe('the canvas is on the index row', () => {
  /**
   * **FC-C, and the reason it is a condition rather than a preference.**
   *
   * `docs/TECH_DEBT.md` #261/#283 establish that two readings are comparable only at the same
   * canvas — #261's own exhibit is a pair that was NOT a clean size comparison. A reader told to
   * compare sittings cannot do it from a list that omits the one fact deciding which are
   * comparable, so an index without this column would have made the panel worse at its own job
   * while looking tidier.
   */
  it('states the shared canvas', () => {
    expect(indexOf([row()]).canvas).toBe('1912×1068 @1x');
  });

  /**
   * **`varies between readings` rather than the first row's value.** The expanded block's facts
   * already refuse to print one figure over a sitting that holds two; an index that quietly took
   * the first would settle the register's most decision-relevant confound by accident, on the
   * surface built to expose it.
   */
  it('says the readings differ rather than picking one', () => {
    const r = indexOf([
      row({ id: 'a', sweepId: 's1' }),
      row({ id: 'b', sweepId: 's1', viewportWidth: 1920, viewportHeight: 1080 }),
    ]);
    expect(r.canvas).toBe('varies between readings');
  });
});

describe('the verdict tally states what is there', () => {
  it('counts each verdict rather than reporting a worst one', () => {
    const r = indexOf([
      row({ id: 'a', sweepId: 's1' }),
      row({ id: 'b', sweepId: 's1', thresholds: { minFps: 30, gated: false } }),
    ]);
    // A ranking would have collapsed these to one word. Both are stated.
    expect(describeVerdicts(r)).toBe('1 ungraded · 1 passed');
  });

  it('puts a failure first, and says so on the row', () => {
    const failing = row({
      id: 'f',
      sweepId: 's1',
      samples: [
        { ...PHASE, fps: 12 },
        { ...PHASE, fps: 12 },
        { ...PHASE, fps: 12 },
      ],
    });
    const r = indexOf([row({ id: 'a', sweepId: 's1' }), failing]);
    expect(r.hasFailure).toBe(true);
    expect(describeVerdicts(r).startsWith('1 failed')).toBe(true);
  });

  /**
   * A zero is a claim (the `budgetedExpense` rule, ADR-0126). "0 failed" on a clean sitting reads
   * as a failure count that happens to be empty rather than as a sitting with nothing to report.
   */
  it('drops empty entries rather than rendering zeroes', () => {
    const r = indexOf([row()]);
    expect(describeVerdicts(r)).toBe('1 passed');
    expect(describeVerdicts(r)).not.toContain('0 ');
  });
});

describe('a sitting says how complete it is', () => {
  /**
   * "2" and "2 of 6" are different facts and a row count cannot distinguish them — the same reason
   * the expanded block carries a `partial` alert rather than letting a short table imply a short
   * sitting.
   */
  it('states a sweep against the expected count', () => {
    const r = indexOf([row({ id: 'a', sweepId: 's1' }), row({ id: 'b', sweepId: 's1' })]);
    expect(r.kind).toBe('Sweep');
    expect(describeReadings(r)).toBe('2 of 6');
  });

  /** A single press is not a sweep that fell short, so it has no expected count to fall short of. */
  it('states a single press without inventing an expected count', () => {
    const r = indexOf([row()]);
    expect(r.kind).toBe('One reading');
    expect(r.expectedReadings).toBeNull();
    // **`null`, because the kind beside it already says "One reading".** Returning a count here
    // produced "One reading — 1 reading", and for the commoner two-limb single press the outright
    // contradiction "One reading — 2 readings" — `canvas-draw` is the panel's default scenario and
    // measures two scales in one press, so that is the likeliest single press there is. Found by
    // the M7 ux review; the expanded block's own caption never had the defect.
    expect(describeReadings(r)).toBeNull();
  });

  it('still counts a single press that holds several readings', () => {
    const r = indexOf([row({ id: 'a', runId: 'shared' }), row({ id: 'b', runId: 'shared' })]);
    expect(r.kind).toBe('One reading');
    // The number is a fact the kind does not carry, so it survives. Only the tautology is dropped.
    expect(describeReadings(r)).toBe('2 readings');
  });
});

describe('the machine falls back exactly as the expanded block does', () => {
  it('prefers the label, then the adapter, then the neutral marker', () => {
    expect(indexOf([row({ machineLabel: 'CI container' })]).machine).toBe('CI container');
    expect(indexOf([row({ machineLabel: null })]).machine).toBe('Intel Arc Pro');
    expect(indexOf([row({ machineLabel: null, gpuRenderer: null })]).machine).toBe(
      '(masked or not recorded)',
    );
  });
});
