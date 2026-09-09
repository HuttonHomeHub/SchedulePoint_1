import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';
import { formatProbeReport, formatSitting } from '../ui/probe-report';

import type { DeviceFacts } from './device';
import { NOT_RECORDED, sittingFromOutcome, sittingsFromRows } from './sitting';

/**
 * One presentation model, two adapters, and the block a reader can still get a week later.
 *
 * `formatProbeReport` took a live `ProbeOutcome`, so the paste-ready block — the artefact
 * `docs/TECH_DEBT.md` #75 actually consumes — existed only in the seconds after a run. That is
 * #75's founding failure in miniature: a measurement unreachable by the person who needs it.
 */

const device: DeviceFacts = {
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  gpu: 'Intel Arc Pro',
  gpuMasked: false,
  userAgent: 'test-agent',
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  prefersReducedMotion: false,
};

const context: RunContext = {
  scenarioId: 'canvas-draw',
  scenarioLabel: 'Canvas draw',
  scenarioVersion: 1,
  preset: 'week',
  size: 'full',
  frames: 180,
  repeats: 3,
  viewport: { width: 1912, height: 1068 },
  idleInterval: 16.7,
  device,
  startedAt: '2026-09-08T18:00:00.000Z',
  appVersion: '0.125.0',
  lostFocusDuringRun: false,
};

const RUNS = [
  { droppedPct: 0.2, intervalP50: 16.7, intervalP95: 17.2, fps: 59.8 },
  { droppedPct: 0.1, intervalP50: 16.7, intervalP95: 17.1, fps: 59.9 },
];

const limb: LimbOutcome = {
  limbId: 'scale-2000',
  limbLabel: '2000 activities',
  sceneSummary: '2160 bars',
  pxPerDay: 12,
  visibleBars: 243,
  minFps: 30,
  source: 'ADR-0026 §9 — ≥ 30 fps at the 2,000-activity ceiling.',
  recording: {
    limbKind: 'absolute',
    activityCount: 2000,
    edgeCount: 3200,
    counts: { visibleBars: 243 },
    thresholds: { minFps: 30, minVisibleBars: 100, gated: true, source: 'ADR-0026 §9' },
    runs: RUNS,
  },
  result: {
    kind: 'absolute',
    judged: {
      verdict: 'PASS',
      meanFps: 59.85,
      slowestRunFps: 59.8,
      fastestRunFps: 59.9,
      meanDroppedPct: 0.15,
      worstIntervalP95: 17.2,
      visibleBars: 243,
      p2: true,
    },
  },
};

const outcome: ProbeOutcome = { kind: 'measured', context, limbs: [limb] };

/** The same reading, as the server stored it. */
const storedRow = (over: Partial<ProbeResultRow> = {}): ProbeResultRow => ({
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
  samples: RUNS,
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

describe('S2 — a sitting read from history carries every field the live report carries', () => {
  it('the two adapters produce the SAME field set', () => {
    // The structural half, and the one that matters: a behavioural test proves the fields it was
    // written to check, and this fails when a field is added to one adapter and not the other —
    // which is the shape this repository records six times over.
    const live = sittingFromOutcome(outcome);
    const stored = sittingsFromRows([storedRow()])[0];

    expect(live).not.toBeNull();
    expect(stored).toBeDefined();
    expect(Object.keys(stored?.context ?? {}).sort()).toEqual(
      Object.keys(live?.context ?? {}).sort(),
    );
    expect(Object.keys(stored?.limbs[0] ?? {}).sort()).toEqual(
      Object.keys(live?.limbs[0] ?? {}).sort(),
    );
  });

  it('a stored reading produces the same block, line label for line label', () => {
    const liveBlock = formatProbeReport(outcome);
    const storedSitting = sittingsFromRows([storedRow()])[0];
    const storedBlock = storedSitting === undefined ? '' : formatSitting(storedSitting);

    // Compare the LABELS rather than the values: a stored block legitimately differs in two places
    // (it knows the API release and the live one cannot; it does not know the frame budget), and
    // asserting whole equality would force one of those two honest differences to be faked.
    const labels = (block: string): string[] =>
      block
        .split('\n')
        .map((line) => /^ {2}(\w[\w ]*?) {2,}/.exec(line)?.[1]?.trim())
        .filter((label): label is string => label !== undefined);

    for (const label of labels(liveBlock)) {
      expect(labels(storedBlock), `the stored block still carries "${label}"`).toContain(label);
    }
    expect(storedBlock).toContain('── 2000 activities ──');
    expect(storedBlock).toContain('VERDICT: PASS');
  });

  it('says "(not recorded)" for what a stored row cannot supply, never a default', () => {
    const stored = sittingsFromRows([storedRow()])[0];
    const block = stored === undefined ? '' : formatSitting(stored);

    // Neither the size nor the frame count is a column on `perf_probe_results`. The default is
    // exactly what a reader would assume and exactly what a non-default run would contradict, so
    // the block says it does not know. M4's `frames_per_phase` closes half of this.
    expect(stored?.context.size).toBeNull();
    expect(stored?.context.frames).toBeNull();
    expect(block).toContain(`run size   ${NOT_RECORDED}`);
    // And it keeps what it DOES know on the same line — the repeats survive as `samples.length`.
    expect(block).toMatch(/run size .* x 2/);
  });

  it('does not claim a stored masked GPU was withheld, because the row cannot tell', () => {
    // The live path splits `null` two ways — the browser refused `WEBGL_debug_renderer_info`, or
    // the extension was unavailable. One nullable column cannot, so the block says neither rather
    // than picking one. Putting a fiction in the field a reader trusts to explain an outlier is
    // exactly what the masked-GPU rule exists to prevent.
    const stored = sittingsFromRows([storedRow({ gpuRenderer: null })])[0];
    const block = stored === undefined ? '' : formatSitting(stored);

    expect(stored?.context.gpuMasked).toBeNull();
    expect(block).toContain(`gpu        ${NOT_RECORDED}`);
    expect(block).not.toContain('withheld by the browser');
    expect(block).not.toContain('(not available)');
  });

  it('carries the API release on a stored sitting and omits it on a live one', () => {
    expect(formatProbeReport(outcome)).not.toContain('  api        ');
    const stored = sittingsFromRows([storedRow()])[0];
    expect(stored === undefined ? '' : formatSitting(stored)).toContain('api        0.61.0');
  });

  it('groups the limbs of one press into one sitting', () => {
    const sittings = sittingsFromRows([
      storedRow({ id: 'a', runId: 'run-1', limbId: 'scale-500' }),
      storedRow({ id: 'b', runId: 'run-1', limbId: 'scale-2000' }),
      storedRow({ id: 'c', runId: 'run-2' }),
    ]);

    expect(sittings).toHaveLength(2);
    expect(sittings[0]?.limbs).toHaveLength(2);
    expect(sittings[1]?.limbs).toHaveLength(1);
  });

  it('groups the readings of one SWEEP into one sitting, across presses', () => {
    // The point of the column: four POSTs, four `runId`s minted by the server, one act by the
    // operator. Nothing but `sweepId` records that they were one sitting.
    const sittings = sittingsFromRows([
      storedRow({ id: 'a', runId: 'run-1', sweepId: 'sweep-1', scenarioId: 'canvas-draw' }),
      storedRow({ id: 'b', runId: 'run-2', sweepId: 'sweep-1', scenarioId: 'canvas-draw' }),
      storedRow({ id: 'c', runId: 'run-3', sweepId: 'sweep-1', scenarioId: 'revision-diff' }),
    ]);

    expect(sittings).toHaveLength(1);
    expect(sittings[0]?.limbs).toHaveLength(3);
  });

  it('never lets a run id and a sweep id with the same value become one sitting', () => {
    // **Verified red against `sweepId ?? runId`**, which is what this looked like it should be.
    // The two columns are separate id spaces — `run_id` minted per POST by the server, `sweep_id`
    // per press by the client — so a bare coalesce puts both generators' values in one keyspace
    // and asks a `Map` to tell them apart. The prefix makes that unrepresentable rather than
    // improbable, and this case is the only thing that says so.
    const shared = '11111111-1111-4111-8111-111111111111';
    const sittings = sittingsFromRows([
      storedRow({ id: 'a', runId: shared, sweepId: null }),
      storedRow({ id: 'b', runId: 'run-other', sweepId: shared }),
    ]);

    expect(sittings).toHaveLength(2);
  });

  it('keeps a row it cannot judge rather than hiding the reading', () => {
    // A newer release can store a scenario an older one does not know. The figures are still on
    // the row, so dropping the limb would hide a measurement to avoid admitting an unknown.
    const stored = sittingsFromRows([storedRow({ thresholds: { gated: true } })])[0];
    expect(stored?.limbs).toHaveLength(1);
    expect(stored?.limbs[0]?.result.kind).toBe('unjudgeable');
  });
});
