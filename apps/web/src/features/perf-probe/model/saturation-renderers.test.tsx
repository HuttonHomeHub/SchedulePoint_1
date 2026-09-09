import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ProbeResultRow } from '../api/probe-results';
import type { LimbOutcome, ProbeOutcome, RunContext } from '../runner/run-probe';
import { formatProbeReport } from '../ui/probe-report';
import { ProbeSittings } from '../ui/probe-sittings';

import type { DeviceFacts } from './device';
import { SATURATED_CAVEAT, verdictNote } from './verdict-copy';

/**
 * One saturated reading, put through every surface that prints a delta.
 *
 * **The risk this file exists for is named in the plan and is this repository's most-repeated
 * shape**: one renderer updated and not its neighbour (ADR-0064 §7, ADR-0067, ADR-0092 M4,
 * ADR-0121 — six recorded instances). So the fixture is shared rather than written per file, and
 * the surfaces are enumerated rather than covered one at a time as each was remembered.
 *
 * The numbers are the product owner's first real-hardware reading, 2026-09-08 — `revision-diff` /
 * Fit / 2,160 bars, baseline 98.33 pp, delta -0.19 pp — which is the exhibit in
 * `docs/TECH_DEBT.md` #260 and is **ungated**, the branch that needed the sentence.
 */

const SATURATED_PAIRS = [
  {
    baseline: { droppedPct: 98.23, intervalP50: 40, intervalP95: 60, fps: 23.3 },
    treatment: { droppedPct: 98.14, intervalP50: 40, intervalP95: 60, fps: 23.3 },
  },
  {
    baseline: { droppedPct: 98.43, intervalP50: 40, intervalP95: 60, fps: 23.3 },
    treatment: { droppedPct: 98.14, intervalP50: 40, intervalP95: 60, fps: 23.3 },
  },
];

const COUNTS = {
  visibleChangedBars: 37,
  visibleBars: 264,
  visibleChangedLinks: 49,
  visibleLinks: 372,
};

/** The stored row the history reads. Ungated, because Fit is. */
const storedRow = (): ProbeResultRow => ({
  id: 'r1',
  runId: 'run-1',
  sweepId: null,
  framesPerPhase: 180,
  recordedAt: '2026-09-08T18:00:00.000Z',
  recordedByLabel: 'owner',
  scenarioId: 'revision-diff',
  scenarioVersion: 1,
  limbId: 'scale-2000',
  limbKind: 'difference',
  preset: 'fit',
  pxPerDay: 0.4,
  activityCount: 2000,
  edgeCount: 3200,
  sceneSummary: '2160 bars, 3200 links',
  samples: SATURATED_PAIRS,
  counts: COUNTS,
  thresholds: { barPp: 2.0, minFps: 30, gated: false, source: 'ADR-0100' },
  viewportWidth: 1912,
  viewportHeight: 1068,
  devicePixelRatio: 1,
  idleIntervalMs: 16.7,
  hardwareConcurrency: 8,
  deviceMemoryGb: 8,
  gpuRenderer: 'Intel Arc Pro',
  userAgent: 'test',
  reducedMotion: false,
  lostFocusDuringRun: false,
  machineLabel: null,
  appVersion: '0.125.0',
  apiVersion: '0.60.0',
});

/**
 * The live outcome the panel and the paste-ready block both render.
 *
 * Built from the real exported types with **no cast**, deliberately. The first draft of this file
 * used `as unknown as LimbOutcome` and the compiler therefore accepted a `result.kind` of
 * `'judged'`, which is not one of the three the union permits — a fixture that was wrong about the
 * shape it was pinning, in the test written to stop exactly that class of mistake.
 */
const outcome = (): ProbeOutcome => {
  const limb: LimbOutcome = {
    limbId: 'scale-2000',
    limbLabel: '2000 activities',
    sceneSummary: '2160 bars, 3200 links',
    pxPerDay: 0.4,
    visibleBars: 264,
    minFps: 30,
    source: 'ADR-0100 — the 2.00 pp difference bar.',
    recording: {
      limbKind: 'difference',
      activityCount: 2000,
      edgeCount: 3200,
      counts: COUNTS,
      thresholds: { barPp: 2.0, minFps: 30, gated: false, source: 'ADR-0100' },
      pairs: SATURATED_PAIRS,
    },
    result: {
      kind: 'difference',
      judged: {
        verdict: 'REPORTED_ONLY',
        baselineMeanPp: 98.33,
        treatmentMeanPp: 98.14,
        deltaPp: -0.19,
        baselineSpreadPp: 0.2,
        headroomPp: 1.67,
        saturated: true,
        treatmentFps: 23.3,
        p1: true,
        p2: false,
      },
    },
  };

  const device: DeviceFacts = {
    viewportWidth: 1912,
    viewportHeight: 1068,
    devicePixelRatio: 1,
    gpu: 'Intel Arc Pro',
    gpuMasked: false,
    userAgent: 'test',
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
    prefersReducedMotion: false,
  };

  const context: RunContext = {
    scenarioId: 'revision-diff',
    scenarioLabel: 'Revision overlay',
    scenarioVersion: 1,
    preset: 'fit',
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

  return { kind: 'measured', context, limbs: [limb] };
};

describe('a saturated delta carries its caveat on every surface that prints one', () => {
  it('the shared sentence — the ungated note', () => {
    const note = verdictNote('REPORTED_ONLY', { gated: false, repeats: 3, saturated: true });
    expect(note).toContain(SATURATED_CAVEAT);
    // And it leads, because it is the strongest thing that can be said about the run: the framing
    // sentence withholds a verdict, this one says the figure above cannot mean what it looks like.
    expect(note?.startsWith(SATURATED_CAVEAT)).toBe(true);
  });

  it('the shared sentence — a quick check that also saturated says both facts', () => {
    const note = verdictNote('REPORTED_ONLY', { gated: false, repeats: 1, saturated: true });
    expect(note).toContain(SATURATED_CAVEAT);
    expect(note).toContain('a quick check runs once');
  });

  it('the paste-ready block — beside the figure, not only after the verdict', () => {
    const text = formatProbeReport(outcome());
    const deltaLine = text.split('\n').find((l) => l.includes('delta'));

    expect(deltaLine).toBeDefined();
    expect(deltaLine).toContain('-0.19 pp');
    // #260's defect is a number a reader takes and stops at. The caveat has to be ON that line.
    expect(deltaLine).toContain('CEILING');
    expect(deltaLine).toContain('1.67 pp of headroom');
    expect(text).toContain(SATURATED_CAVEAT);
  });

  it('the history — a stored row derives the same sentence on read', () => {
    // **Asserted against what a reader SEES, not against a helper.** This case used to call
    // `judgeStoredRow`, a flattened derivation whose only caller was this file after M6 replaced
    // the flat history table — so it was green about a surface nobody could reach, which is the
    // ADR-0093 shape inside the gate written to prevent it (M7 component review). The helper is
    // deleted; the property it claimed is now asserted on the rendered sittings table, which is
    // where the sentence actually has to appear.
    renderStored(storedRow());

    expect(screen.getByText('REPORTED, NOT GRADED')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(SATURATED_CAVEAT.slice(0, 40)))).toBeInTheDocument();
  });

  it('an unsaturated reading says none of it, on any surface', () => {
    expect(
      verdictNote('REPORTED_ONLY', { gated: false, repeats: 3, saturated: false }),
    ).not.toContain(SATURATED_CAVEAT);

    const clean = storedRow();
    clean.samples = [
      {
        baseline: { droppedPct: 0.5, intervalP50: 16, intervalP95: 17, fps: 60 },
        treatment: { droppedPct: 0.6, intervalP50: 16, intervalP95: 17, fps: 60 },
      },
      {
        baseline: { droppedPct: 0.6, intervalP50: 16, intervalP95: 17, fps: 60 },
        treatment: { droppedPct: 0.6, intervalP50: 16, intervalP95: 17, fps: 60 },
      },
    ];
    renderStored(clean);
    expect(screen.queryByText(new RegExp(SATURATED_CAVEAT.slice(0, 40)))).not.toBeInTheDocument();
  });
});

/**
 * The stored row, rendered by the surface that shows it.
 *
 * `ProbeSittings` takes the query rather than the rows, so the harness supplies a settled one — the
 * same shape `DataTable`'s structurally-typed `query` prop accepts, and the same thing the sittings
 * view builds per block.
 */
function renderStored(row: ProbeResultRow): void {
  render(
    <ProbeSittings
      query={{ isPending: false, isError: false, data: [row], refetch: () => undefined } as never}
    />,
  );
}

/**
 * Every surface that prints a delta says so when the delta is a ceiling.
 *
 * Behavioural cases above cover two of the browser surfaces directly; the panel's `LimbVerdict` is
 * module-private and reaching it means mounting the whole panel, which tests the mount rather than
 * this rule. So the enumeration is structural — and it is the assertion that actually answers the
 * risk, because it fails when a **further** renderer is added and forgets, which no fixture can.
 *
 * **It found one while it was being written.** The plan named three renderers of a delta; there are
 * four. `scripts/measure-revision-diff.mjs` prints `delta` and then, on the ungated path, "No
 * verdict at this preset" — which is #260's exhibit exactly, in a file the first version of this
 * sweep could not see because it walked `src/` and the driver is a `.mjs` beside it. The sweep now
 * covers both trees, and the driver is asserted on its own terms: it does not call `verdictNote`
 * (it is not TypeScript and cannot import the panel's rendering), so what is pinned there is that
 * it reads `saturated` and prints the **imported** sentence rather than a fourth wording.
 *
 * Its blind spot, stated rather than left to be discovered: it proves the fact is passed or read,
 * not that what is done with it is right. The behavioural cases are what prove that, and a new
 * surface needs one of its own.
 */
describe('the enumeration', () => {
  const CALLERS = [
    // `model/judge-stored.ts` was here until M7 and is deliberately gone. It held `judgeStoredRow`,
    // a flattened derivation for the flat history table M6 deleted — so it was an enumerated
    // "renderer" that rendered nothing, and this gate's own `calls.length > 0` assertion is what
    // makes removing the function and leaving the entry impossible. The file still derives the
    // judgement (`storedJudgedResult`); it no longer renders a sentence, and `probe-sittings.tsx`
    // below is the surface that does.
    'ui/probe-report.ts',
    'ui/performance-probe-panel.tsx',
    // M6: the sittings table renders a verdict per reading, so it is a fourth renderer of a delta
    // and joins the enumeration rather than being an exception to it. It was added here BECAUSE
    // this gate went red — which is the enumeration doing its job on the first new renderer since
    // it was written.
    'ui/probe-sittings.tsx',
  ];

  const CLI = join(import.meta.dirname, '../../../../scripts/measure-revision-diff.mjs');

  it('the CLI driver reads the fact and prints the shared sentence', () => {
    const source = readFileSync(CLI, 'utf8');

    expect(source, 'the driver still prints a delta').toMatch(/delta\s+\$\{/);
    expect(source, 'and reads whether that delta is a ceiling').toContain('judged.saturated');
    // Imported, never restated. Two wordings of one caveat is the drift this whole module exists
    // to prevent (ADR-0065's `routeOrthogonal`, ADR-0121's `stackSeries`).
    expect(source).toContain('SATURATED_CAVEAT');
  });

  it('the CLI barrel exports the sentence, which is the only route into that file', () => {
    const barrel = readFileSync(join(import.meta.dirname, 'probe-cli-exports.ts'), 'utf8');
    expect(barrel).toContain("export { SATURATED_CAVEAT } from './verdict-copy';");
  });

  it('every verdictNote call site passes `saturated`', () => {
    const root = join(import.meta.dirname, '..');
    const found: string[] = [];

    for (const rel of CALLERS) {
      const source = readFileSync(join(root, rel), 'utf8');
      // The call and its object literal, up to the closing `})`.
      const calls = source.match(/verdictNote\([\s\S]*?\n\s*\}\)/g) ?? [];
      expect(calls.length, `${rel} still calls verdictNote`).toBeGreaterThan(0);
      for (const call of calls) {
        if (!call.includes('saturated')) found.push(rel);
      }
    }

    expect(found, 'these renderers print a verdict without the saturation fact').toEqual([]);
  });

  it('finds no verdictNote caller outside the enumerated three', () => {
    // A green enumeration must not be satisfiable by there being nothing to enumerate, and it must
    // notice a fourth surface arriving (ADR-0093's rule: a suite that cannot tell "all classified"
    // from "found nothing" proves neither).
    const root = join(import.meta.dirname, '..');
    const all = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
          if (readFileSync(path, 'utf8').includes('verdictNote(')) {
            all.add(relative(root, path).split(sep).join('/'));
          }
        }
      }
    };
    walk(root);

    expect([...all].sort()).toEqual([...CALLERS, 'model/verdict-copy.ts'].sort());
  });
});
