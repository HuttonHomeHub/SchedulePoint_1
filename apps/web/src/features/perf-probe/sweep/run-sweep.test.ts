import { describe, expect, it, vi } from 'vitest';

import type { ProbeResultBody } from '../api/probe-results';
import type { DeviceFacts } from '../model/device';
import type { ScenarioDefinition } from '../model/scenarios';
import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';

import { mergeResumed, missingSteps, runSweep } from './run-sweep';
import type { SweepStep } from './sweep-plan';

/**
 * The sweep's branches, driven from literals.
 *
 * **Every case here is one a real run reaches once in fifty** — a refusal on step two, a POST that
 * fails on step three, a Stop between steps — which is exactly why they are unit cases rather than
 * something the journey is expected to stumble into. The journey proves the door opens; this proves
 * what happens behind it when the machine says no.
 */

const device: DeviceFacts = {
  viewportWidth: 1646,
  viewportHeight: 900,
  devicePixelRatio: 1,
  gpu: 'test',
  gpuMasked: false,
  userAgent: 'test',
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  prefersReducedMotion: false,
};

const context = (scenarioId: string): RunContext => ({
  scenarioId,
  scenarioLabel: scenarioId,
  scenarioVersion: 1,
  preset: 'week',
  size: 'full',
  frames: 180,
  repeats: 3,
  viewport: { width: 1646, height: 900 },
  idleInterval: 16.7,
  device,
  startedAt: '2026-09-09T12:00:00.000Z',
  appVersion: '0.125.0',
  lostFocusDuringRun: false,
});

const limb: LimbOutcome = {
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
    thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
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
};

const measured = (scenarioId: string): ProbeOutcome => ({
  kind: 'measured',
  context: context(scenarioId),
  limbs: [limb],
});

const refused = (scenarioId: string): ProbeOutcome => ({
  kind: 'refused',
  refusal: { reason: 'TAB_HIDDEN', sentence: 'The tab was hidden.' },
  context: context(scenarioId),
});

const stub = (id: string): ScenarioDefinition =>
  ({
    id,
    label: id,
    question: 'q',
    version: 1,
    limbs: [],
    gated: true,
    decision: 'd',
  }) as unknown as ScenarioDefinition;

const PLAN: SweepStep[] = [
  { scenario: stub('a'), preset: 'week' },
  { scenario: stub('a'), preset: 'fit' },
  { scenario: stub('b'), preset: 'week' },
  { scenario: stub('b'), preset: 'fit' },
];

const sweep = (over: Partial<Parameters<typeof runSweep>[0]> = {}) =>
  runSweep({
    size: 'full',
    machineLabel: 'the bench',
    newSweepId: () => 'sweep-1',
    runStep: (step) => Promise.resolve(measured(step.scenario.id)),
    store: () => Promise.resolve(undefined),
    onProgress: () => undefined,
    shouldStop: () => false,
    plan: PLAN,
    ...over,
  });

describe('runSweep', () => {
  it('records every step under ONE sweep id', async () => {
    const bodies: ProbeResultBody[] = [];
    const outcome = await sweep({
      store: (body) => {
        bodies.push(body);
        return Promise.resolve(undefined);
      },
    });

    expect(outcome.steps.map((s) => s.status)).toEqual([
      'recorded',
      'recorded',
      'recorded',
      'recorded',
    ]);
    // The point of the column: four presses, one sitting.
    expect(bodies).toHaveLength(4);
    expect(new Set(bodies.map((b) => b.sweepId))).toEqual(new Set(['sweep-1']));
    // And the protocol rides with each, from the run's own context rather than inferred.
    expect(new Set(bodies.map((b) => b.framesPerPhase))).toEqual(new Set([180]));
  });

  it('CONTINUES past a refusal rather than ending the sweep', async () => {
    // The machine declined THIS step — a tab hidden for a moment. Ending here would spend the
    // operator's two minutes and hand back one sentence.
    const outcome = await sweep({
      runStep: (step) =>
        Promise.resolve(
          step.preset === 'fit' && String(step.scenario.id) === 'a'
            ? refused('a')
            : measured(step.scenario.id),
        ),
    });

    expect(outcome.steps.map((s) => s.status)).toEqual([
      'recorded',
      'refused',
      'recorded',
      'recorded',
    ]);
    expect(outcome.stopped).toBe(false);
  });

  it('stores NOTHING for a refused step', async () => {
    const store = vi.fn(() => Promise.resolve(undefined));
    await sweep({ runStep: () => Promise.resolve(refused('a')), store });

    // A stored row for a refusal would put a reading in the installation's history that no machine
    // ever produced. Asserted with a spy rather than by reading the code.
    expect(store).not.toHaveBeenCalled();
  });

  it('CONTINUES past a failed POST, and keeps the body so a retry can send it', async () => {
    let calls = 0;
    const outcome = await sweep({
      store: () => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error('network')) : Promise.resolve(undefined);
      },
    });

    expect(outcome.steps.map((s) => s.status)).toEqual([
      'recorded',
      'not recorded',
      'recorded',
      'recorded',
    ]);
    // The figures exist and the row does not — the state is retryable, so the body survives.
    expect(outcome.steps[1]?.body?.sweepId).toBe('sweep-1');
  });

  it('never throws out of the sweep when every store fails', async () => {
    const outcome = await sweep({ store: () => Promise.reject(new Error('down')) });

    expect(outcome.steps.every((s) => s.status === 'not recorded')).toBe(true);
    expect(outcome.stopped).toBe(false);
  });

  it('marks the steps after a Stop as NOT TAKEN, never refused', async () => {
    // Two vocabularies: a reading not taken is one nobody tried, a refusal is one the machine
    // declined. Collapsing them loses the difference between "you stopped early" and "your tab was
    // in the background", which is what a reader meeting less than they expected needs to tell apart.
    let ran = 0;
    const outcome = await sweep({
      runStep: (step) => {
        ran += 1;
        return Promise.resolve(measured(step.scenario.id));
      },
      shouldStop: () => ran >= 2,
    });

    expect(outcome.steps.map((s) => s.status)).toEqual([
      'recorded',
      'recorded',
      'not taken',
      'not taken',
    ]);
    expect(outcome.stopped).toBe(true);
    expect(ran, 'no step runs after the stop').toBe(2);
  });

  it('announces each step as it starts and as it settles', async () => {
    const seen: string[] = [];
    await sweep({
      onProgress: (p) => seen.push(`${String(p.stepIndex)}:${p.status}`),
    });

    // Per step, not once for the whole sweep — `docs/TECH_DEBT.md` #259 item 11 records
    // `revision-diff` narrating once for a multi-pair run, so a reader hears nothing for 25 seconds.
    expect(seen).toEqual([
      '0:running',
      '0:recorded',
      '1:running',
      '1:recorded',
      '2:running',
      '2:recorded',
      '3:running',
      '3:recorded',
    ]);
  });

  it('mints the sitting id exactly once, however many steps run', async () => {
    const newSweepId = vi.fn(() => 'sweep-1');
    await sweep({ newSweepId });
    expect(newSweepId).toHaveBeenCalledTimes(1);
  });
});

/**
 * Taking again the readings a sitting never got.
 *
 * **The whole risk is in what is offered and what is kept**, not in the running: a resume is an
 * ordinary sweep over a shorter plan. So these cases ask two questions — which steps a resume is
 * allowed to touch, and whether folding it back loses anything.
 */
describe('missingSteps', () => {
  it('offers the steps that produced nothing, and NOT the one whose figures exist', async () => {
    // The discriminator is what a re-run would buy. A refused or never-taken step has no figures,
    // so measuring again is the only way to get them; a `not recorded` step has its figures on
    // screen and needs a POST, which `Retry recording` does in a fraction of a second. Re-measuring
    // it would spend twenty-five seconds obtaining DIFFERENT numbers under the impression of
    // re-sending the ones in front of the operator.
    //
    // Verified red against `status !== 'recorded'`, the obvious spelling, which offers the
    // `not recorded` step too.
    let call = 0;
    const outcome = await sweep({
      runStep: (step) => {
        call += 1;
        return Promise.resolve(call === 2 ? refused(step.scenario.id) : measured(step.scenario.id));
      },
      // Step 3's write fails: measured, not recorded.
      store: (body) =>
        body.scenarioId === 'b' ? Promise.reject(new Error('offline')) : Promise.resolve(undefined),
    });

    expect(outcome.steps.map((s) => s.status)).toEqual([
      'recorded',
      'refused',
      'not recorded',
      'not recorded',
    ]);
    expect(missingSteps(outcome).map((step) => `${step.scenario.id}:${step.preset}`)).toEqual([
      'a:fit',
    ]);
  });

  it('offers a stopped sweep the steps nobody asked the machine about', async () => {
    let seen = 0;
    const outcome = await sweep({
      shouldStop: () => {
        seen += 1;
        return seen > 2;
      },
    });

    // Two recorded, two never attempted — and "not taken" is offered for the same reason "refused"
    // is: nothing was measured. That the operator caused one and the machine the other does not
    // change what taking it again would produce.
    expect(missingSteps(outcome).map((step) => `${step.scenario.id}:${step.preset}`)).toEqual([
      'b:week',
      'b:fit',
    ]);
  });

  it('offers nothing when every step landed', async () => {
    expect(missingSteps(await sweep())).toEqual([]);
  });
});

describe('mergeResumed', () => {
  it('replaces the resumed steps and keeps every other reading', async () => {
    let seen = 0;
    const first = await sweep({
      shouldStop: () => {
        seen += 1;
        return seen > 2;
      },
    });
    expect(first.steps.map((s) => s.status)).toEqual([
      'recorded',
      'recorded',
      'not taken',
      'not taken',
    ]);

    const second = await sweep({ plan: missingSteps(first), newSweepId: () => first.sweepId });
    const merged = mergeResumed(first, second);

    // **The sitting is four steps, not two.** Setting the resume as the panel's state would show a
    // two-step sitting and let an operator conclude the first two readings had been lost — they are
    // in the database, and only the screen would have forgotten them. Verified red by returning
    // `second` unchanged.
    expect(merged.steps).toHaveLength(4);
    expect(merged.steps.map((s) => s.status)).toEqual([
      'recorded',
      'recorded',
      'recorded',
      'recorded',
    ]);
    expect(merged.steps.map((s) => `${s.step.scenario.id}:${s.step.preset}`)).toEqual([
      'a:week',
      'a:fit',
      'b:week',
      'b:fit',
    ]);
  });

  it('keeps the sitting id and protocol, and takes the latest press for whether it was stopped', async () => {
    let seen = 0;
    const first = await sweep({
      newSweepId: () => 'sitting-1',
      shouldStop: () => {
        seen += 1;
        return seen > 2;
      },
    });
    expect(first.stopped).toBe(true);

    const second = await sweep({
      plan: missingSteps(first),
      newSweepId: () => 'sitting-1',
      size: 'quick',
    });
    const merged = mergeResumed(first, second);

    expect(merged.sweepId).toBe('sitting-1');
    // The PRIOR's size defines the sitting. The panel passes `outcome.size` so a resume cannot pick
    // a different one; this pins the merge's own answer for the case where something does, because
    // a sitting whose rows were taken under two protocols is legible only in the Protocol column.
    expect(merged.size).toBe('full');
    // `stopped` is a fact about the MOST RECENT press. A sitting stopped and then completed is not
    // a stopped sitting, and the steps say so themselves.
    expect(merged.stopped).toBe(false);
  });

  it('identifies a step by scenario and framing, not by object identity', async () => {
    const first = await sweep({ runStep: (step) => Promise.resolve(refused(step.scenario.id)) });
    // A plan rebuilt from scratch — same scenarios and framings, different objects, as a resume
    // reconstructed from stored state would be. Identity matching would silently merge nothing and
    // leave every step refused, which looks exactly like a resume that did not help.
    const rebuilt: SweepStep[] = PLAN.map((step) => ({
      scenario: stub(step.scenario.id),
      preset: step.preset,
    }));
    const second = await sweep({ plan: rebuilt, newSweepId: () => first.sweepId });

    expect(mergeResumed(first, second).steps.map((s) => s.status)).toEqual([
      'recorded',
      'recorded',
      'recorded',
      'recorded',
    ]);
  });
});

/**
 * A single press is not a sitting of one.
 *
 * Found by reading rather than by anything failing: `newSweepId` was called unconditionally, so a
 * **Measure one thing** press stored a `sweep_id`. The stored adapter derives `kind` from which id
 * space grouped the rows — deliberately, because only `sweep_id` records the operator's intent —
 * so that press then rendered as `Sweep of 1 reading` above an alert reading "This sitting has 1 of
 * 4 readings. 3 were refused or never taken — nothing is stored for those". Every clause false, on
 * the commonest press there is, and no test could see it: the model's fixtures all set
 * `sweepId: null` for a single press, which is what the producer was supposed to send.
 *
 * The approved schema had said so all along — `feature-spec.md:644`, "a default would claim
 * membership of a sitting that does not exist".
 */
describe('a press that is not a sitting', () => {
  it('stores no sitting id when the caller says there is none', async () => {
    const bodies: ProbeResultBody[] = [];
    const outcome = await sweep({
      plan: [PLAN[0] as SweepStep],
      newSweepId: () => null,
      store: (body) => {
        bodies.push(body);
        return Promise.resolve(undefined);
      },
    });

    expect(outcome.sweepId).toBeNull();
    expect(bodies.map((b) => b.sweepId)).toEqual([null]);
  });
});
