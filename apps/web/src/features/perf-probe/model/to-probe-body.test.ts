import { describe, expect, it } from 'vitest';

import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';

import { toProbeBody } from './to-probe-body';

const CONTEXT: RunContext = {
  scenarioId: 'revision-diff',
  scenarioVersion: 3,
  scenarioLabel: 'Revision compare overlay',
  preset: 'week',
  size: 'full',
  frames: 180,
  repeats: 3,
  viewport: { width: 1646, height: 900 },
  idleInterval: 8.33,
  device: {
    viewportWidth: 1646,
    viewportHeight: 900,
    devicePixelRatio: 2,
    gpu: null,
    gpuMasked: true,
    userAgent: 'test-agent',
    hardwareConcurrency: null,
    deviceMemoryGb: null,
    prefersReducedMotion: false,
  },
  startedAt: '2026-09-07T12:00:00.000Z',
  appVersion: '0.121.0',
  lostFocusDuringRun: true,
};

const PAIR = {
  baseline: { droppedPct: 0.5, intervalP50: 16.6, intervalP95: 17, fps: 60 },
  treatment: { droppedPct: 1.2, intervalP50: 16.7, intervalP95: 18, fps: 59 },
};

const differenceLimb: LimbOutcome = {
  limbId: 'scale-2000',
  limbLabel: '2000 activities',
  sceneSummary: '2160 bars, 3200 links',
  pxPerDay: 12,
  visibleBars: 222,
  minFps: 30,
  source: 'ADR-0026 §9',
  recording: {
    limbKind: 'difference',
    activityCount: 2160,
    edgeCount: 3200,
    counts: {
      visibleBars: 222,
      visibleChangedBars: 40,
      visibleLinks: 300,
      visibleChangedLinks: 55,
    },
    thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9', barPp: 2 },
    pairs: [PAIR],
  },
  result: { kind: 'unjudgeable', message: 'NOTHING TO JUDGE' },
};

describe('toProbeBody', () => {
  it('returns null for a refused run, because nothing was measured', () => {
    const outcome: ProbeOutcome = {
      kind: 'refused',
      refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden.' },
      context: CONTEXT,
    };

    expect(toProbeBody(outcome, 'the Dell')).toBeNull();
  });

  it('sends `pairs` and NOT `runs` for a difference limb', () => {
    // The rule the server states as a validator: exactly one array, and it is the one the kind
    // names. Sending both is a 422; sending neither trips the database's non-empty CHECK, which
    // would arrive as a 500 for what is a producer bug.
    const body = toProbeBody({ kind: 'measured', context: CONTEXT, limbs: [differenceLimb] }, null);

    const limb = body?.limbs[0];
    expect(limb?.limbKind).toBe('difference');
    expect(limb?.pairs).toEqual([PAIR]);
    expect(limb).not.toHaveProperty('runs');
  });

  it('records an unreported device fact as null rather than omitting or guessing it', () => {
    // NULL means "not captured" and the column exists to keep that distinguishable from a value.
    // A masked adapter in particular must not become "unknown GPU": that would put a fiction in
    // the one field a reader trusts to explain an outlier.
    const body = toProbeBody({ kind: 'measured', context: CONTEXT, limbs: [differenceLimb] }, null);

    expect(body?.gpuRenderer).toBeNull();
    expect(body?.hardwareConcurrency).toBeNull();
    expect(body?.deviceMemoryGb).toBeNull();
    // And a fact that WAS captured travels, including the unflattering one.
    expect(body?.lostFocusDuringRun).toBe(true);
    expect(body?.devicePixelRatio).toBe(2);
    expect(body?.scenarioVersion).toBe(3);
  });

  it('stores an unjudgeable limb, because the judge refusing is not the machine refusing', () => {
    const body = toProbeBody({ kind: 'measured', context: CONTEXT, limbs: [differenceLimb] }, null);

    expect(body?.limbs).toHaveLength(1);
    expect(body?.limbs[0]?.thresholds).toMatchObject({ minFps: 30, gated: true });
  });
});
