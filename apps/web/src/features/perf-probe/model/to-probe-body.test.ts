import { describe, expect, it } from 'vitest';

import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';

import { recordsAnything, toProbeBody } from './to-probe-body';

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

/**
 * M3 — a limb is the unit of durability.
 *
 * Cancelling used to discard the whole press. On the two-scale `canvas-draw` scenario that meant
 * stopping during the second limb threw away a **complete** 500-activity limb: three full repeats,
 * nothing about it wrong, gone because the recording unit was the press. Nobody reported it, which
 * is why it is here rather than in a register row — a discarded measurement leaves no trace to
 * report.
 */
describe('toProbeBody — a stopped run keeps what it finished', () => {
  it('stores a limb that completed before the operator pressed Stop', () => {
    // Verified red against the all-or-nothing discard: before M3 this returned `null`.
    const body = toProbeBody(
      { kind: 'cancelled', context: CONTEXT, limbs: [differenceLimb] },
      'the machine',
    );

    expect(body).not.toBeNull();
    expect(body?.limbs).toHaveLength(1);
    expect(body?.limbs[0]?.limbId).toBe(differenceLimb.limbId);
    // The context is the run's, not a placeholder: the machine, the framing and the clock are the
    // same ones the completed limb was measured under.
    expect(body?.viewportWidth).toBe(CONTEXT.viewport.width);
    expect(body?.machineLabel).toBe('the machine');
  });

  it('stores nothing when the operator stopped before anything finished', () => {
    // Falls out of the same rule rather than needing a branch of its own — and it is the case that
    // keeps "cancelled" from quietly becoming "measured".
    expect(toProbeBody({ kind: 'cancelled', context: CONTEXT, limbs: [] }, null)).toBeNull();
  });

  it('still stores nothing for a REFUSAL, however much was drawn', () => {
    // Unchanged and asserted alongside, because the two now diverge: a refusal means the numbers
    // that exist are placeholders, so there is nothing to keep at any granularity.
    expect(
      toProbeBody(
        {
          kind: 'refused',
          refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden.' },
          context: CONTEXT,
        },
        null,
      ),
    ).toBeNull();
  });
});

/**
 * The rule about whether an outcome produces a row, asked once.
 *
 * **This exists because the journey found the defect and no unit test could have.** The panel asked
 * `kind === 'measured'` in two places to decide whether to say a reading was recorded and whether
 * to offer Retry. That was the same question as `toProbeBody`'s, spelt differently — and the moment
 * a cancellation began producing a row the three disagreed: the store happened, the history grew,
 * and the screen said nothing about it. Each site was correct in isolation; the defect lived only
 * between them (the ADR-0093 shape), which is exactly what a per-file suite cannot see.
 */
describe('recordsAnything — the one place the rule lives', () => {
  it('agrees with toProbeBody on every outcome shape', () => {
    const cases: ProbeOutcome[] = [
      { kind: 'measured', context: CONTEXT, limbs: [differenceLimb] },
      { kind: 'cancelled', context: CONTEXT, limbs: [differenceLimb] },
      { kind: 'cancelled', context: CONTEXT, limbs: [] },
      {
        kind: 'refused',
        refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden.' },
        context: CONTEXT,
      },
    ];

    // The predicate and the body must never disagree: a screen that says "recorded" over a `null`
    // body, or stays silent over a real one, is the defect this pins in both directions.
    for (const outcome of cases) {
      expect(
        recordsAnything(outcome),
        `${outcome.kind} with ${'limbs' in outcome ? String(outcome.limbs.length) : '0'} limb(s)`,
      ).toBe(toProbeBody(outcome, null) !== null);
    }
  });
});
