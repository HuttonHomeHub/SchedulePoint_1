import { describe, expect, it } from 'vitest';

import type { DeviceFacts } from '../model/device';
import type { AbsoluteJudgeResult, JudgeResult } from '../model/judge';
import type { LimbOutcome, RunContext } from '../runner/run-probe';

import { formatProbeReport } from './probe-report';

/**
 * The pasted block — the epic's actual deliverable.
 *
 * A number that stays on one operator's screen answers nothing. What makes `docs/TECH_DEBT.md`
 * #75's single reading useful a month later is that somebody wrote down the machine beside it, so
 * these assertions are mostly about what the block refuses to leave out.
 */
const DEVICE: DeviceFacts = {
  viewportWidth: 1646,
  viewportHeight: 900,
  devicePixelRatio: 1.75,
  gpu: 'Intel(R) Iris(R) Xe Graphics',
  gpuMasked: false,
  userAgent: 'Mozilla/5.0 Test',
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  prefersReducedMotion: false,
};

const CONTEXT: RunContext = {
  scenarioId: 'canvas-draw',
  scenarioVersion: 1,
  scenarioLabel: 'Canvas draw budget',
  preset: 'week',
  size: 'full',
  frames: 180,
  repeats: 3,
  viewport: { width: 1646, height: 900 },
  idleInterval: 8.33,
  device: DEVICE,
  startedAt: '2026-09-07T12:00:00.000Z',
  appVersion: '0.121.0',
  lostFocusDuringRun: false,
};

const judged = (over: Partial<AbsoluteJudgeResult> = {}): AbsoluteJudgeResult => ({
  verdict: 'PASS',
  meanFps: 58.2,
  slowestRunFps: 57.1,
  fastestRunFps: 59.0,
  meanDroppedPct: 0.4,
  worstIntervalP95: 18.2,
  visibleBars: 222,
  p2: true,
  ...over,
});

const limb = (result: LimbOutcome['result']): LimbOutcome => ({
  limbId: 'scale-2000',
  limbLabel: '2000 activities',
  sceneSummary: '2160 bars, 3200 links',
  pxPerDay: 12,
  visibleBars: 222,
  minFps: 30,
  recording: {
    limbKind: 'absolute',
    activityCount: 2000,
    edgeCount: 3200,
    counts: { visibleBars: 222 },
    thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9' },
    runs: [],
  },
  source: 'ADR-0026 §9 — ≥ 30 fps at the 2,000-activity ceiling.',
  result,
});

const judgedDifference = (over: Partial<JudgeResult> = {}): JudgeResult => ({
  verdict: 'PASS',
  baselineMeanPp: 0.19,
  treatmentMeanPp: 0.0,
  deltaPp: -0.19,
  baselineSpreadPp: 0.56,
  treatmentFps: 60.0,
  p1: true,
  p2: true,
  ...over,
});

const differenceLimb = (result: LimbOutcome['result']): LimbOutcome => ({
  ...limb(result),
  visibleBars: 264,
  recording: {
    limbKind: 'difference',
    activityCount: 2000,
    edgeCount: 3200,
    counts: {
      visibleBars: 264,
      visibleLinks: 400,
      visibleChangedBars: 30,
      visibleChangedLinks: 48,
    },
    thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9', barPp: 2 },
    pairs: [],
  },
});

describe('formatProbeReport', () => {
  it('names the machine, because a timing without its hardware compares to nothing', () => {
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('Intel(R) Iris(R) Xe Graphics');
    expect(out).toContain('1646x900 css px, dpr 1.75');
    expect(out).toContain('idle frame interval 8.33 ms');
  });

  it('records a withheld GPU AS withheld, never as an unknown one', () => {
    // The product owner's Q1, answered 2026-09-07: record it, and mark a masked value as masked.
    // Writing "unknown GPU" would put a fiction in the one field a reader trusts to explain an
    // outlier — and Firefox withholds this by default, so it is the common case rather than an edge.
    const out = formatProbeReport({
      kind: 'measured',
      context: { ...CONTEXT, device: { ...DEVICE, gpu: null, gpuMasked: true } },
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('(withheld by the browser)');
    expect(out).not.toContain('unknown');
  });

  it('distinguishes a withheld adapter from a browser that could not be asked', () => {
    const out = formatProbeReport({
      kind: 'measured',
      context: { ...CONTEXT, device: { ...DEVICE, gpu: null, gpuMasked: false } },
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('(not available)');
  });

  it('always reports what was on screen', () => {
    // ADR-0066's failure was a reading taken with nine bars in ten culled, and it looked like the
    // budget being met. The count goes in every report, not only the ones that fail.
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('on screen  222 bars at 12.00 px/day');
  });

  it('states a REFUSED run as a refusal and uses no pass or fail wording', () => {
    // The one assertion this file exists for. A refusal rendered as a verdict is the defect the
    // fourth verdict value exists to prevent, and a summary line is where it would happen.
    const out = formatProbeReport({
      kind: 'refused',
      refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden part-way through.' },
      context: CONTEXT,
    });
    expect(out).toContain('RUN REFUSED');
    expect(out).toContain('NOT a pass and NOT a failure');
    expect(out).not.toMatch(/\bPASS\b/);
    expect(out).not.toMatch(/\bFAIL\b/);
  });

  it('carries the INDETERMINATE reason, not just the word', () => {
    // Without the reason the verdict reads as a shrug. With it, an operator knows the remedy is a
    // quieter machine rather than a lower floor — which is the actionable half.
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [
        limb({
          kind: 'absolute',
          judged: judged({
            verdict: 'INDETERMINATE',
            indeterminateReason: 'the repeats disagree about the answer',
          }),
        }),
      ],
    });
    expect(out).toContain('VERDICT: INDETERMINATE');
    expect(out).toContain('because the repeats disagree about the answer');
  });

  it('reports an unjudgeable limb without a verdict word anywhere near it', () => {
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [
        limb({
          kind: 'unjudgeable',
          message: 'NON-VACUITY FAILED — the painter did not draw enough.',
        }),
      ],
    });
    expect(out).toContain('RESULT: CANNOT BE JUDGED');
    expect(out).not.toContain('VERDICT:');
  });

  it('reports a lost window focus, because it is recorded and never refused', () => {
    // A blur is a different fact from a hidden tab. Hidden is a REFUSAL — the browser throttles rAF
    // to about 1 Hz and the run measures the throttle. A blur means the window kept painting while
    // something else took the keyboard, and possibly some of the GPU. Refusing on that would reject
    // most real runs; dropping it would throw away the one fact explaining an outlier. So it is on
    // the row, and it has to be PRINTED or it is captured and never read.
    const out = formatProbeReport({
      kind: 'measured',
      context: { ...CONTEXT, lostFocusDuringRun: true },
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('the window lost focus during the run');

    const held = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(held).toContain('held throughout');
  });

  it('names the bundle that produced the numbers', () => {
    // Comparability across releases is the whole reason to store anything. `APP_VERSION` is a
    // compile-time constant (`vite.config.ts:28`), so it cannot drift from the published package —
    // and the granularity is a RELEASE, not a commit: nothing carries a SHA into the bundle
    // (ADR-0088 D1 — `docker-publish.yml` passes no build args).
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [limb({ kind: 'absolute', judged: judged() })],
    });
    expect(out).toContain('web        0.121.0');
  });

  it('says which run length produced the numbers', () => {
    // A quick run is deliberately ungated, so a reader comparing two blocks months apart has to be
    // able to see that one of them was never eligible for a verdict at all.
    const out = formatProbeReport({
      kind: 'measured',
      context: { ...CONTEXT, size: 'quick', frames: 40, repeats: 1 },
      limbs: [limb({ kind: 'absolute', judged: judged({ verdict: 'REPORTED_ONLY' }) })],
    });
    expect(out).toContain('run size   quick — 40 frames x 1');
  });
  it('prints the non-vacuity counts on a PASS, not only when the judge refuses', () => {
    // The product owner's 2026-09-08 Week run came back PASS with no way to audit it from the block.
    // `judgeRun` throws before it judges, so a verdict already implies the floors were met — but the
    // pasted block is the deliverable, and a reader should not have to know the judge's control flow
    // to check that the treatment drew anything. The CLI has printed this since it was written
    // (`measure-revision-diff.mjs:177-180`) and `m0-condition.md`'s N condition requires it; only
    // this rendering dropped it. ADR-0093: a green result must distinguish "cheap" from "nothing there".
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [differenceLimb({ kind: 'difference', judged: judgedDifference() })],
    });
    expect(out).toContain('changed    30/264 bars (11.4%), 48/400 links (12.0%)');
  });

  it('omits the counts line rather than printing zeros when the recording lacks them', () => {
    // A zero is a claim that nothing changed on screen; an absent count is a claim about the
    // recording. Printing 0/0 would state the first while meaning the second.
    //
    // BLIND SPOT, stated rather than left implicit: this case asserts an ABSENCE, so it passes
    // equally against a build that never prints the line at all. Its discriminator is the sibling
    // above, which was verified red against exactly that.
    const out = formatProbeReport({
      kind: 'measured',
      context: CONTEXT,
      limbs: [
        {
          ...differenceLimb({ kind: 'difference', judged: judgedDifference() }),
          recording: {
            limbKind: 'difference',
            activityCount: 2000,
            edgeCount: 3200,
            counts: { visibleBars: 264 },
            thresholds: { minFps: 30, gated: true, source: 'ADR-0026 §9', barPp: 2 },
            pairs: [],
          },
        },
      ],
    });
    expect(out).not.toContain('changed    ');
    expect(out).toContain('baseline   0.19 pp');
  });
});
