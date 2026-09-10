import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';
import type { ProbeOutcome } from '../runner/run-probe';

import { sittingFromOutcome, sittingsFromRows } from './sitting';

/**
 * **S2 — a sitting read from history carries every field a live one carries.**
 *
 * The spec's own acceptance criterion. **What it covers is narrower than the first draft of this
 * docblock claimed, and the correction is worth keeping**: that draft said the divergence it
 * guards is invisible to TypeScript, and it is not. Deleting `recordedByLabel` from one adapter
 * was run through `tsc` and produced
 * `TS2741: Property 'recordedByLabel' is missing ... but required in type 'SittingContext'`.
 * For a REQUIRED field the compiler is the gate and this file is a second opinion.
 *
 * What it genuinely covers is the move a developer makes when the compiler stops them: marking the
 * new field **optional** so only the adapter they care about has to fill it. `refusal?` shows the
 * shape is already reachable here. After that the screen reads `sitting.context.x`, the live path
 * fills it, the stored path leaves it `undefined`, and nothing complains — so this compares the
 * KEY SETS the two adapters actually produce, at runtime, from fixtures.
 *
 * The rule it enforces is **`null`, never missing**. A field that is legitimately unknowable on one
 * side (`apiVersion` and `recordedByLabel`: the browser does not learn either until the POST
 * returns) is present there as an explicit `null`, because a reader cannot tell a field the run did
 * not record from a field the renderer dropped — `(not recorded)` prints for one and nothing prints
 * for the other, which is the distinction the whole sitting model exists to preserve.
 */

const LIVE: ProbeOutcome = {
  kind: 'measured',
  context: {
    scenarioId: 'canvas-draw',
    scenarioLabel: 'Canvas draw',
    scenarioVersion: 1,
    preset: 'week',
    size: 'full',
    frames: 180,
    repeats: 3,
    viewport: { width: 1646, height: 900 },
    idleInterval: 8.33,
    device: {
      viewportWidth: 1646,
      viewportHeight: 900,
      devicePixelRatio: 1.75,
      gpu: 'Intel',
      gpuMasked: false,
      userAgent: 'test',
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      prefersReducedMotion: false,
    },
    startedAt: '2026-09-09T12:00:00.000Z',
    appVersion: '0.126.0',
    lostFocusDuringRun: false,
  },
  limbs: [
    {
      limbId: 'scale-2000',
      limbLabel: '2000 activities',
      sceneSummary: '2160 bars',
      pxPerDay: 12,
      visibleBars: 243,
      minFps: 30,
      source: 'ADR-0026 §9',
      recording: {
        limbKind: 'absolute',
        activityCount: 2000,
        edgeCount: 3200,
        counts: { visibleBars: 243 },
        thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9' },
        runs: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }],
      },
      result: {
        kind: 'absolute',
        judged: {
          verdict: 'PASS',
          meanFps: 59.8,
          slowestRunFps: 59.8,
          fastestRunFps: 59.8,
          meanDroppedPct: 0.2,
          worstIntervalP95: 17.2,
          visibleBars: 243,
          p2: true,
        },
      },
    },
  ],
};

const STORED: ProbeResultRow = {
  id: 'row-1',
  runId: '11111111-1111-4111-8111-111111111111',
  sweepId: null,
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  preset: 'week',
  limbId: 'scale-2000',
  limbKind: 'absolute',
  pxPerDay: 12,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars',
  counts: { visibleBars: 243 },
  thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9' },
  samples: [{ droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 }],
  framesPerPhase: 180,
  viewportWidth: 1646,
  viewportHeight: 900,
  devicePixelRatio: 1.75,
  idleIntervalMs: 8.33,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel',
  userAgent: 'test',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: 'the bench',
  appVersion: '0.126.0',
  apiVersion: '0.62.0',
  recordedByLabel: 'ops',
  recordedAt: '2026-09-09T12:00:00.000Z',
};

describe('S2 — the two sitting adapters produce the same shape', () => {
  it('fills the same context keys from a live run and from stored rows', () => {
    const live = sittingFromOutcome(LIVE, 'the bench');
    const stored = sittingsFromRows([STORED])[0];

    expect(live).not.toBeNull();
    expect(stored).toBeDefined();
    expect(Object.keys(live?.context ?? {}).sort()).toEqual(
      Object.keys(stored?.context ?? {}).sort(),
    );
  });

  it('fills the same limb keys from both', () => {
    const live = sittingFromOutcome(LIVE, 'the bench');
    const stored = sittingsFromRows([STORED])[0];

    expect(Object.keys(live?.limbs[0] ?? {}).sort()).toEqual(
      Object.keys(stored?.limbs[0] ?? {}).sort(),
    );
  });

  it('fills the same sitting keys from both', () => {
    const live = sittingFromOutcome(LIVE, 'the bench');
    const stored = sittingsFromRows([STORED])[0];

    // `refusal` is deliberately excluded: it is an optional field present only on a refused run,
    // and a stored sitting is never refused (nothing is stored for a refusal, by design). Comparing
    // it would assert that one adapter can produce a state the other's input cannot reach.
    const shape = (s: object): string[] =>
      Object.keys(s)
        .filter((k) => k !== 'refusal')
        .sort();
    expect(shape(live ?? {})).toEqual(shape(stored ?? {}));
  });

  it('states a field the live path cannot know as null, never by omitting it', () => {
    // The two that are genuinely absent live. A missing key and a null one are the same to
    // TypeScript and different to a reader: `(not recorded)` prints for null and nothing prints
    // for missing, so an omission looks like a renderer that dropped a field it had.
    const live = sittingFromOutcome(LIVE, 'the bench');

    expect(live?.context).toHaveProperty('apiVersion', null);
    expect(live?.context).toHaveProperty('recordedByLabel', null);
  });
});
