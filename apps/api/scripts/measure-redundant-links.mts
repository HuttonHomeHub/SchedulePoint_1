/**
 * **#518 M0-T4: what the redundant-link rule costs and how common it is, measured not guessed.**
 *
 *   RL_OUT=/tmp/rl.json pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-redundant-links.mts
 *
 * The `measure-zero-duration.mts` pattern: **pure, no database, no HTTP** (ADR-0066). Every figure
 * comes from a `SeedSpec` the catalogue builds, through the same mapper the pairwise differential
 * uses, so the numbers describe the plans the rule will actually meet.
 *
 * **The candidate arrives later.** `docs/specs/redundant-link-advisory/` M0 commits this harness and
 * the falsification conditions; the rule itself is M2-T1's `health/redundant-links.ts`. The module is
 * loaded dynamically and the harness stops with a message, rather than reporting a number, when it is
 * not there yet: a cost reported for a rule that does not exist would be the unmeasured claim this
 * harness is here to prevent (CLAUDE.md §19.11).
 *
 * **Falsification conditions, committed before any number** (`m0-measurement.md`):
 * - FC-5a: at most 50 ms p95 at `scale-2000`.
 * - FC-5b: the dense case (2,000 activities by 10 links each) is bounded by the relaxation budget, not
 *   by the plan; the budget is set from these numbers.
 *
 * **Also measured (spec §2.6, R5):** whether the levelling preview changes when the flagged links are
 * deleted, on `capability-levelling` and `capability-levelling-placed`, stated either way.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { fixtureSpec, scaleSpec, type SeedSpec } from '@repo/seed';
import { expect, it } from 'vitest';

import { capabilitySpecs } from '../../seed-cli/src/capabilities/index.js';
import {
  computeSchedule,
  levelSchedule,
  type EngineAssignment,
} from '../src/modules/schedule/engine/index.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

const RUNS = 50;
const FC_5A_P95_MS = 50;

/** What the rule reads (`redundant-links.oracle` §4.8), built straight from a `SeedSpec`. */
interface RuleActivity {
  id: string;
  type: string;
  status: string;
  actualStart: string | null;
  actualFinish: string | null;
  constraintType: string | null;
  secondaryConstraintType: string | null;
  schedulingCalendarId: string;
}
interface RuleDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes: number;
  lagCalendarKey: string;
}
interface RuleOutput {
  offenders: Array<{ id: string }>;
  unjudged: number;
  searchCapped: boolean;
}
type FindRedundantLinks = (
  activities: RuleActivity[],
  dependencies: RuleDependency[],
  options: { relaxationBudget: number },
) => RuleOutput;

async function loadCandidate(): Promise<FindRedundantLinks> {
  const path = '../src/modules/schedule/health/redundant-links.js';
  try {
    const mod = (await import(path)) as { findRedundantLinks?: FindRedundantLinks };
    if (typeof mod.findRedundantLinks === 'function') return mod.findRedundantLinks;
  } catch {
    // Fall through to the message: the module is M2-T1's and may not exist yet.
  }
  throw new Error(
    'health/redundant-links.ts (M2-T1) is not present: there is no rule to measure yet. ' +
      'This harness reports nothing until there is.',
  );
}

function toRuleInput(spec: SeedSpec): {
  activities: RuleActivity[];
  dependencies: RuleDependency[];
} {
  const plan = spec.plan.defaultCalendarKey ?? 'PLAN';
  const calendarOf = new Map(spec.activities.map((a) => [a.key, a.calendarKey ?? plan] as const));
  const activities = spec.activities.map((a) => ({
    id: a.key,
    type: a.type,
    status:
      a.progress === null || a.progress === undefined
        ? 'NOT_STARTED'
        : a.progress.actualFinish != null
          ? 'COMPLETE'
          : a.progress.actualStart != null
            ? 'IN_PROGRESS'
            : 'NOT_STARTED',
    actualStart: a.progress?.actualStart ?? null,
    actualFinish: a.progress?.actualFinish ?? null,
    constraintType: a.constraintType,
    secondaryConstraintType: a.secondaryConstraintType,
    schedulingCalendarId: a.calendarKey ?? plan,
  }));
  const dependencies = spec.dependencies.map((d, i) => ({
    id: `edge-${String(i)}`,
    predecessorId: d.predecessorKey,
    successorId: d.successorKey,
    type: d.type,
    lagMinutes: d.lagMinutes,
    lagCalendarKey:
      d.lagCalendarSource === 'TWENTY_FOUR_HOUR'
        ? '24H'
        : d.lagCalendarSource === 'PREDECESSOR'
          ? (calendarOf.get(d.predecessorKey) ?? plan)
          : d.lagCalendarSource === 'SUCCESSOR'
            ? (calendarOf.get(d.successorKey) ?? plan)
            : plan,
  }));
  return { activities, dependencies };
}

/** 2,000 activities by about 10 links each, all forward: the worst realistic density (FC-5b). */
function denseInput(): { activities: RuleActivity[]; dependencies: RuleDependency[] } {
  const n = 2000;
  const activities: RuleActivity[] = Array.from({ length: n }, (_, i) => ({
    id: `D${String(i)}`,
    type: 'TASK',
    status: 'NOT_STARTED',
    actualStart: null,
    actualFinish: null,
    constraintType: null,
    secondaryConstraintType: null,
    schedulingCalendarId: 'PLAN',
  }));
  const dependencies: RuleDependency[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let k = 1; k <= 10 && i + k < n; k += 1) {
      dependencies.push({
        id: `d${String(i)}-${String(k)}`,
        predecessorId: `D${String(i)}`,
        successorId: `D${String(i + k)}`,
        type: 'FS',
        lagMinutes: 0,
        lagCalendarKey: 'PLAN',
      });
    }
  }
  return { activities, dependencies };
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

function time(label: string, run: () => RuleOutput): Record<string, unknown> {
  run(); // one warm-up, not counted
  const ms: number[] = [];
  let out: RuleOutput | undefined;
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    out = run();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  return {
    label,
    runs: RUNS,
    p50Ms: Number(percentile(ms, 0.5).toFixed(3)),
    p95Ms: Number(percentile(ms, 0.95).toFixed(3)),
    flagged: out?.offenders.length ?? null,
    unjudged: out?.unjudged ?? null,
    searchCapped: out?.searchCapped ?? null,
  };
}

/** The levelling preview's output, as one comparable string (every field of every result). */
function levelled(spec: SeedSpec, drop: ReadonlySet<string>): string {
  const input = specToEngineInput(spec);
  const edges = input.edges.filter((e) => !drop.has(e.id));
  const network = computeSchedule(input.activities, edges, input.options);
  const assignments: EngineAssignment[] = spec.assignments.map((a) => ({
    activityId: a.activityKey,
    resourceId: a.resourceKey,
    unitsPerHour: a.unitsPerHour ?? 0,
  }));
  const resources = spec.resources.map((r) => ({
    id: r.key,
    capacity: r.maxUnitsPerHour,
  }));
  return JSON.stringify(
    levelSchedule(input.activities, network, edges, assignments, resources, {
      levelWithinFloatOnly: false,
      dataDate: input.options.dataDate,
      planCalendar: input.options.calendar,
      anchor: 'PLACED',
    }),
  );
}

it('measures the redundant-link rule: cost, prevalence, and the levelling preview', async () => {
  const find = await loadCandidate();
  const budget = Number(process.env['RL_BUDGET'] ?? '5000000');
  const run = (input: ReturnType<typeof toRuleInput>) => () =>
    find(input.activities, input.dependencies, { relaxationBudget: budget });

  const timed = [
    time('fixture', run(toRuleInput(fixtureSpec()))),
    time('scale-500', run(toRuleInput(scaleSpec({ activities: 500 })))),
    time('scale-2000', run(toRuleInput(scaleSpec({ activities: 2000 })))),
    time('dense 2000 x 10', run(denseInput())),
  ];

  const prevalence = capabilitySpecs().map((spec) => {
    const out = run(toRuleInput(spec))();
    return {
      plan: spec.seedName,
      links: spec.dependencies.length,
      flagged: out.offenders.length,
      unjudged: out.unjudged,
    };
  });

  const levelling = ['capability-levelling', 'capability-levelling-placed'].map((name) => {
    const spec = capabilitySpecs().find((s) => s.seedName === name);
    if (spec === undefined) throw new Error(`${name} is not in the catalogue`);
    const flagged = new Set(run(toRuleInput(spec))().offenders.map((o) => o.id));
    return {
      plan: name,
      flagged: flagged.size,
      previewUnchanged: levelled(spec, new Set()) === levelled(spec, flagged),
    };
  });

  const scale2000 = timed.find((t) => t['label'] === 'scale-2000');
  const result = { runs: RUNS, budget, timed, prevalence, levelling, fc5aP95Ms: FC_5A_P95_MS };
  const out = process.env['RL_OUT'];
  if (out !== undefined) writeFileSync(out, JSON.stringify(result, null, 2));
  expect(Number(scale2000?.['p95Ms'])).toBeLessThanOrEqual(FC_5A_P95_MS);
});
