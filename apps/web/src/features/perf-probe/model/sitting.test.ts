import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';
import { formatProbeReport, formatSitting } from '../ui/probe-report';

import type { DeviceFacts } from './device';
import {
  NOT_RECORDED,
  SITTING_SPREAD_LIMIT_MS,
  describeSpread,
  sittingFromOutcome,
  sittingSpreadMs,
  sittingsFromRows,
} from './sitting';

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
    // **A row stored BEFORE M4**, which is the only row that cannot supply the frame count now
    // that `frames_per_phase` is a column. Asserting it against a post-M4 row would have been
    // asserting that a fact the table records is missing.
    const stored = sittingsFromRows([storedRow({ framesPerPhase: null })])[0];
    const block = stored === undefined ? '' : formatSitting(stored);

    // The size is still not a column and `frames_per_phase` is null on a row stored before M4. The
    // default is exactly what a reader would assume and exactly what a non-default run would
    // contradict, so the block says it does not know — and it says so PER READING, because a
    // sitting can hold four readings taken at different protocols.
    expect(stored?.limbs[0]?.size).toBeNull();
    expect(stored?.limbs[0]?.frames).toBeNull();
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

  it("reports each reading's own measurement and framing, never the first row's", () => {
    // **The case the `group[0]` shortcut would have passed.** A sweep is four presses under one
    // sitting, so the measurement and the framing differ across it; taking them from whichever row
    // sorted first labels three readings with a fourth one's identity and nothing on screen looks
    // wrong. Spec §4.6 states it as a rule — the facts list is what is CONSTANT across the sitting
    // — and this is that rule as an assertion.
    const sittings = sittingsFromRows([
      storedRow({ id: 'a', runId: 'r1', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'week' }),
      storedRow({ id: 'b', runId: 'r2', sweepId: 's1', scenarioId: 'canvas-draw', preset: 'fit' }),
      storedRow({
        id: 'c',
        runId: 'r3',
        sweepId: 's1',
        scenarioId: 'revision-diff',
        preset: 'week',
      }),
    ]);

    const sitting = sittings[0];
    expect(sittings).toHaveLength(1);
    expect(sitting?.limbs.map((l) => `${l.scenarioId}/${l.preset}`)).toEqual([
      'canvas-draw/week',
      'canvas-draw/fit',
      'revision-diff/week',
    ]);
    // And the block names them per reading rather than once at the top.
    const block = sitting === undefined ? '' : formatSitting(sitting);
    expect(block).toContain('framing    fit');
    expect(block).toContain('framing    week');
  });

  it('calls a sitting suspect when ANY of its readings lost focus, not just the first', () => {
    // Focus is lost per reading. A sweep can hold three clean readings and one suspect, and the
    // first row's value would call the whole sitting clean on the strength of whichever sorted
    // first — the one sitting fact that is a disjunction rather than a shared value.
    const sitting = sittingsFromRows([
      storedRow({ id: 'a', runId: 'r1', sweepId: 's1', lostFocusDuringRun: false }),
      storedRow({ id: 'b', runId: 'r2', sweepId: 's1', lostFocusDuringRun: true }),
    ])[0];

    expect(sitting?.context.anyReadingLostFocus).toBe(true);
    expect(sitting?.limbs.map((l) => l.lostFocusDuringRun)).toEqual([false, true]);
  });

  it('dates a sitting by its EARLIEST reading, not by whichever row arrived first', () => {
    // The API returns newest-first, so `group[0]` is the LAST reading of a sweep. A sitting dated
    // by its last reading reads as having happened later than it did.
    const sitting = sittingsFromRows([
      storedRow({ id: 'b', runId: 'r2', sweepId: 's1', recordedAt: '2026-09-09T12:05:00.000Z' }),
      storedRow({ id: 'a', runId: 'r1', sweepId: 's1', recordedAt: '2026-09-09T12:00:00.000Z' }),
    ])[0];

    expect(sitting?.context.startedAt).toBe('2026-09-09T12:00:00.000Z');
  });

  it('refuses to state one canvas for a sitting whose readings were taken at two', () => {
    // #261 records the same plan on the same machine measuring 23.3 fps at 1912x1068 and 39.5 fps
    // at 1016x636 — the most decision-relevant confound in the register. A sitting can hold two
    // canvases now that M6-T4 re-runs a missing reading under the same `sweep_id`, and stating the
    // first row's figure would settle that confound by accident. `null` means "more than one",
    // which is a different fact from "unknown", and every reading carries its own.
    const mixed = sittingsFromRows([
      storedRow({ id: 'a', runId: 'r1', sweepId: 's1', viewportWidth: 1912, viewportHeight: 1068 }),
      storedRow({ id: 'b', runId: 'r2', sweepId: 's1', viewportWidth: 1016, viewportHeight: 636 }),
    ])[0];

    expect(mixed?.context.viewport).toBeNull();
    expect(mixed?.limbs.map((l) => l.viewport.width)).toEqual([1912, 1016]);
    const block = mixed === undefined ? '' : formatSitting(mixed);
    expect(block).toContain('varies between readings');

    // And a sitting whose readings agree still states it once, prominently (CQ-6).
    const agreed = sittingsFromRows([
      storedRow({ id: 'a', runId: 'r1', sweepId: 's2' }),
      storedRow({ id: 'b', runId: 'r2', sweepId: 's2' }),
    ])[0];
    expect(agreed?.context.viewport).not.toBeNull();
  });

  it('keeps a row it cannot judge rather than hiding the reading', () => {
    // A newer release can store a scenario an older one does not know. The figures are still on
    // the row, so dropping the limb would hide a measurement to avoid admitting an unknown.
    const stored = sittingsFromRows([storedRow({ thresholds: { gated: true } })])[0];
    expect(stored?.limbs).toHaveLength(1);
    expect(stored?.limbs[0]?.result.kind).toBe('unjudgeable');
  });
});

/**
 * How far apart a sitting's readings were taken.
 *
 * **This exists because M6-T4 makes a sitting able to span time.** A resumed reading is stored
 * under the same `sweep_id` — correctly, the operator meant them as one act — and that makes the
 * machine facts stated once above them true of the earliest reading and merely probable of the
 * rest. The number is what lets the block say so instead of implying one instant.
 */
describe('sittingSpreadMs', () => {
  const at = (id: string, recordedAt: string) =>
    storedRow({ id, runId: id, sweepId: 'sweep-1', recordedAt });

  it('is null for a single reading, which is not the same as zero', () => {
    // A spread of zero is a claim — "these were taken together" — and one reading supports no such
    // claim. `null` renders as nothing; `0` would render as "taken 0 minutes apart", which is the
    // shape of confident-and-unfounded sentence this whole epic removes.
    const sitting = sittingsFromRows([at('a', '2026-09-09T12:00:00.000Z')])[0];
    if (sitting === undefined) throw new Error('no sitting');
    expect(sittingSpreadMs(sitting)).toBeNull();
  });

  it('is the span between the earliest and the latest, not between adjacent rows', () => {
    // The API hands rows back newest-first, so a pairwise walk would give a negative number and a
    // "first minus second" would give the wrong pair the moment a sitting held three.
    const sitting = sittingsFromRows([
      at('c', '2026-09-09T15:00:00.000Z'),
      at('a', '2026-09-09T12:00:00.000Z'),
      at('b', '2026-09-09T12:30:00.000Z'),
    ])[0];
    if (sitting === undefined) throw new Error('no sitting');
    expect(sittingSpreadMs(sitting)).toBe(3 * 60 * 60 * 1000);
  });

  it('does not fire for an ordinary sweep', () => {
    // The threshold is chosen for what it EXCLUDES: a full sweep is about two minutes and a
    // stopped-and-resumed one perhaps ten, so a sitting taken in one go must stay silent or the
    // sentence is read past on the day it matters.
    const sitting = sittingsFromRows([
      at('a', '2026-09-09T12:00:00.000Z'),
      at('b', '2026-09-09T12:02:00.000Z'),
    ])[0];
    if (sitting === undefined) throw new Error('no sitting');
    const spread = sittingSpreadMs(sitting);
    expect(spread).not.toBeNull();
    expect(spread ?? 0).toBeLessThan(SITTING_SPREAD_LIMIT_MS);
  });
});

describe('the copied block carries the spread', () => {
  const at = (id: string, recordedAt: string) =>
    storedRow({ id, runId: id, sweepId: 'sweep-1', recordedAt });

  it('says the readings were not one sitting in time, in the artefact somebody pastes', () => {
    // **The block is the deliverable** (`docs/TECH_DEBT.md` #75), so a caveat that lives only on
    // screen is a caveat that does not reach the person the reading is sent to. Verified red by
    // dropping the line from `contextLines`.
    const sitting = sittingsFromRows([
      at('a', '2026-09-08T09:00:00.000Z'),
      at('b', '2026-09-09T09:00:00.000Z'),
    ])[0];
    if (sitting === undefined) throw new Error('no sitting');
    expect(formatSitting(sitting)).toContain('readings taken 24 hours apart');
    expect(formatSitting(sitting)).toContain('NOT one sitting in time');
  });

  it('is silent for an ordinary sitting, so the line means something when it appears', () => {
    const sitting = sittingsFromRows([
      at('a', '2026-09-09T09:00:00.000Z'),
      at('b', '2026-09-09T09:02:00.000Z'),
    ])[0];
    if (sitting === undefined) throw new Error('no sitting');
    expect(formatSitting(sitting)).not.toContain('spread');
  });
});

describe('describeSpread', () => {
  it('says minutes, hours and days — never "about 2880 minutes"', () => {
    // Deliberately not `describeDuration`, which forecasts a press and tops out in minutes by
    // design. A spread is elapsed fact and is unbounded above, which is one of the two things the
    // sentence exists to make visible.
    expect(describeSpread(90 * 60 * 1000)).toBe('2 hours');
    expect(describeSpread(3 * 24 * 60 * 60 * 1000)).toBe('3 days');
    expect(describeSpread(61 * 60 * 1000)).toBe('1 hour');
  });
});
