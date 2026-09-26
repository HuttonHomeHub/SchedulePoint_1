/**
 * **#384 M0-T1: how common a zero-duration activity is, counted rather than read.**
 *
 *   ZD_OUT=/tmp/zd.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-zero-duration.mts
 *
 * The plan names this `scripts/measure-zero-duration.mts`; it lives in `apps/api/scripts/` beside
 * `measure-finish-milestone.mts` (#381), because a root `.mjs` cannot import the seed CLI's TypeScript
 * capability builders and this directory already has the config that runs such a harness.
 *
 * **Pure: no database, no HTTP.** Every count comes from a `SeedSpec` the catalogue builds or from what
 * the pure `importSchedule` returns for a fixture file (ADR-0066: never from persisted rows, which would
 * reuse the write path this epic changes). The one engine call is `computeSchedule` on a `SeedSpec`,
 * through the pairwise differential's mapper, to answer "does it carry the project finish".
 *
 * **What it reads.**
 * - SeedSpecs: the fixture, every capability family, every reference plan, every pairwise case, and
 *   the scale tier at 500 and 2,000. The negative tier builds no plans (`loadSpecs('negative')` is `[]`).
 * - Import fixtures: every `.xer`/`.xml` FILE under `packages/interchange` and
 *   `packages/engine-conformance/fixtures`. There is no MSPDI fixture FILE: the MSPDI suites build
 *   their XML per test (`mspdi.fixtures.ts`), so there is no catalogue of MSPDI plans to count, and
 *   the harness says so rather than inventing one.
 *
 * **What it cannot answer for an imported graph.** "Carries the project finish" needs a schedule, and
 * an import graph is not scheduled here, so for imports that column reports whether the task is an
 * open end (no successor) and is labelled as that proxy, never as the finish itself.
 *
 * **Control.** The spec (E15) names `A7550` (fixture) and `N6` (`capability-network-shape`). If either
 * is not found as a zero-duration `TASK`, the harness throws: a count that missed a known row is a
 * count of the wrong thing.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { importSchedule } from '@repo/interchange';
import { fixtureSpec, pairwiseSuite, scaleSpec, type SeedSpec } from '@repo/seed';
import { expect, it } from 'vitest';

import { capabilitySpecs } from '../../seed-cli/src/capabilities/index.js';
import { referenceSpecs } from '../../seed-cli/src/references/index.js';
import { computeSchedule } from '../src/modules/schedule/engine/index.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

const REPO = resolve(__dirname, '../../..');

/** The non-`TASK` types the plan asks to count separately. */
const OTHER_TYPES = ['RESOURCE_DEPENDENT', 'LEVEL_OF_EFFORT', 'WBS_SUMMARY', 'HAMMOCK'] as const;

interface TaskRow {
  source: string;
  code: string;
  key: string;
  assigned: boolean;
  placed: boolean;
  constrainedOrExternal: boolean;
  hasPredecessor: boolean;
  /** `true`/`false` for a scheduled SeedSpec; `null` for an import graph (see `openEnd`). */
  carriesProjectFinish: boolean | null;
  /** Import graphs only: no successor. The proxy, labelled as one. */
  openEnd: boolean | null;
  mondayDates: string[];
}

interface SourceCount {
  source: string;
  activities: number;
  zeroTask: number;
  zeroOther: Record<(typeof OTHER_TYPES)[number], number>;
}

function isMonday(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1;
}

interface ActivityLike {
  key: string;
  code: string;
  type: string;
  durationMinutes: number;
  constraintDate: string | null;
  secondaryConstraintDate: string | null;
  visualStart?: string | null;
  externalEarlyStart?: string | null;
  externalLateFinish?: string | null;
}

function datesOf(a: ActivityLike): Record<string, string | null | undefined> {
  return {
    visualStart: a.visualStart,
    constraintDate: a.constraintDate,
    secondaryConstraintDate: a.secondaryConstraintDate,
    externalEarlyStart: a.externalEarlyStart,
    externalLateFinish: a.externalLateFinish,
  };
}

function count(
  source: string,
  activities: readonly ActivityLike[],
): { counts: SourceCount; zeroTasks: ActivityLike[] } {
  const zeroOther = Object.fromEntries(OTHER_TYPES.map((t) => [t, 0])) as SourceCount['zeroOther'];
  const zeroTasks: ActivityLike[] = [];
  for (const a of activities) {
    if (a.durationMinutes !== 0) continue;
    if (a.type === 'TASK') zeroTasks.push(a);
    else if ((OTHER_TYPES as readonly string[]).includes(a.type))
      zeroOther[a.type as (typeof OTHER_TYPES)[number]] += 1;
  }
  return {
    counts: { source, activities: activities.length, zeroTask: zeroTasks.length, zeroOther },
    zeroTasks,
  };
}

function specRows(spec: SeedSpec): { counts: SourceCount; rows: TaskRow[] } {
  const source = `spec:${spec.seedName}`;
  const { counts, zeroTasks } = count(source, spec.activities);
  if (zeroTasks.length === 0) return { counts, rows: [] };
  const input = specToEngineInput(spec);
  const out = computeSchedule(input.activities, input.edges, input.options);
  const finish = out.summary.projectFinishOffset;
  const rows = zeroTasks.map((a) => {
    const result = out.results.find((r) => r.activityId === a.key);
    return {
      source,
      code: a.code,
      key: a.key,
      assigned: spec.assignments.some((x) => x.activityKey === a.key),
      placed: a.visualStart !== null && a.visualStart !== undefined,
      constrainedOrExternal:
        a.constraintDate !== null ||
        a.secondaryConstraintDate !== null ||
        (a.externalEarlyStart ?? null) !== null ||
        (a.externalLateFinish ?? null) !== null,
      hasPredecessor: spec.dependencies.some((d) => d.successorKey === a.key),
      carriesProjectFinish:
        result === undefined || finish === null ? false : result.earlyFinishOffset === finish,
      openEnd: null,
      mondayDates: Object.entries(datesOf(a))
        .filter(([, v]) => isMonday(v))
        .map(([k, v]) => `${k}=${String(v)}`),
    };
  });
  return { counts, rows };
}

function fixtureFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...fixtureFiles(path));
    else if (/\.(xer|xml)$/i.test(name)) out.push(path);
  }
  return out;
}

function importRows(path: string): { counts: SourceCount; rows: TaskRow[] } {
  const source = `import:${relative(REPO, path)}`;
  const result = importSchedule({ content: readFileSync(path), filename: path });
  if (!result.ok)
    throw new Error(`${source} did not import: ${result.error.code} ${result.error.message}`);
  const graph = result.graph;
  const { counts, zeroTasks } = count(source, graph.activities);
  const rows = zeroTasks.map((a) => ({
    source,
    code: a.code,
    key: a.key,
    assigned: graph.assignments.some((x) => x.activityKey === a.key),
    placed: a.visualStart !== null && a.visualStart !== undefined,
    constrainedOrExternal: a.constraintDate !== null || a.secondaryConstraintDate !== null,
    hasPredecessor: graph.dependencies.some((d) => d.successorKey === a.key),
    carriesProjectFinish: null,
    openEnd: !graph.dependencies.some((d) => d.predecessorKey === a.key),
    mondayDates: Object.entries(datesOf(a))
      .filter(([, v]) => isMonday(v))
      .map(([k, v]) => `${k}=${String(v)}`),
  }));
  return { counts, rows };
}

it('counts zero-duration activities across the catalogue and the import fixtures', () => {
  const specs: SeedSpec[] = [
    fixtureSpec(),
    ...capabilitySpecs(),
    ...referenceSpecs(),
    ...pairwiseSuite().cases.map((c) => c.spec),
    scaleSpec({ activities: 500 }),
    scaleSpec({ activities: 2000 }),
  ];
  const files = [
    ...fixtureFiles(join(REPO, 'packages/interchange')),
    ...fixtureFiles(join(REPO, 'packages/engine-conformance/fixtures')),
  ].sort();

  const results = [...specs.map(specRows), ...files.map(importRows)];
  const counts = results.map((r) => r.counts);
  const rows = results.flatMap((r) => r.rows);

  // The control (spec E15): both known rows must be found, or this counted the wrong thing.
  const a7550 = rows.filter((r) => r.code === 'A7550');
  const n6 = rows.filter((r) => r.source.includes('network-shape') && r.key === 'N6');
  if (a7550.length === 0) throw new Error('control: A7550 not found as a zero-duration TASK');
  if (n6.length === 0) throw new Error('control: N6 not found as a zero-duration TASK');
  expect(a7550.length + n6.length).toBeGreaterThanOrEqual(2);

  const totals = {
    sources: counts.length,
    specs: specs.length,
    importFiles: files.map((f) => relative(REPO, f)),
    zeroTask: counts.reduce((s, c) => s + c.zeroTask, 0),
    zeroOther: Object.fromEntries(
      OTHER_TYPES.map((t) => [t, counts.reduce((s, c) => s + c.zeroOther[t], 0)]),
    ),
  };
  const nonZero = counts.filter(
    (c) => c.zeroTask > 0 || OTHER_TYPES.some((t) => c.zeroOther[t] > 0),
  );

  console.log(JSON.stringify({ totals, nonZero, rows }, null, 2));
  if (process.env.ZD_OUT) {
    writeFileSync(process.env.ZD_OUT, JSON.stringify({ totals, counts, rows }, null, 2));
  }
});
