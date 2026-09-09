import { describe, expect, it, vi } from 'vitest';

import type { ProbeResultBody } from '../api/probe-results';
import type { DeviceFacts } from '../model/device';
import type { ScenarioDefinition } from '../model/scenarios';
import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';

import { runSweep } from './run-sweep';
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
