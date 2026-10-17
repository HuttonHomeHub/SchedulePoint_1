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
 * - FC-5b: the dense case (2,000 activities by 10 links each) is bounded by the relaxation limit, not
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
import { ruleInputOfSpec } from '../test/support/redundant-links-oracle.js';

const RUNS = 50;
/** Cold calls are not what a steady server pays: the JIT needs a few dozen before timings settle. */
const WARM_UP = 20;
const FC_5A_P95_MS = 50;

/** What the rule reads (spec §4.8). Structural: the oracle's own builders produce these. */
interface RuleActivity {
  id: string;
  code: string | null;
  name: string;
  type: string;
  status: string;
  constraintType: string | null;
  secondaryConstraintType: string | null;
  actualStart: string | null;
  actualFinish: string | null;
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
  offenders: Array<{ linkId: string }>;
  unjudged: number;
  searchCapped: boolean;
}
type FindRedundantLinks = (
  activities: RuleActivity[],
  dependencies: RuleDependency[],
  options: { relaxationLimit: number },
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

/** The oracle's builder, not a private copy: the rule is measured on the input it is proven on. */
const toRuleInput = ruleInputOfSpec;

/** 2,000 activities by about 10 links each, all forward: the worst realistic density (FC-5b). */
function denseInput(perActivity: number): {
  activities: RuleActivity[];
  dependencies: RuleDependency[];
} {
  const n = 2000;
  const activities: RuleActivity[] = Array.from({ length: n }, (_, i) => ({
    id: `D${String(i)}`,
    code: null,
    name: `D${String(i)}`,
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
    for (let k = 1; k <= perActivity && i + k < n; k += 1) {
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
  for (let i = 0; i < WARM_UP; i += 1) run(); // not counted; the first calls are 5 to 10 times slower
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
    maxMs: Number((ms[ms.length - 1] ?? 0).toFixed(3)),
    slowestFiveMs: ms.slice(-5).map((v) => Number(v.toFixed(2))),
    flagged: out?.offenders.length ?? null,
    unjudged: out?.unjudged ?? null,
    searchCapped: out?.searchCapped ?? null,
  };
}

/**
 * The levelling preview's output, as one comparable string (every field of every result). `capacity`
 * overrides every resource's ceiling: the seeded scale plan's resources are uncapped, and an uncapped
 * resource never constrains, which would make "the preview did not change" vacuously true.
 */
function levelled(spec: SeedSpec, drop: ReadonlySet<string>, capacity?: number): string {
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
    capacity: capacity ?? r.maxUnitsPerHour,
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
  const limit = Number(process.env['RL_LIMIT'] ?? '1000000');
  const run =
    (input: ReturnType<typeof toRuleInput>, at = limit) =>
    () =>
      find(input.activities, input.dependencies, { relaxationLimit: at });

  const inputs: Array<[string, ReturnType<typeof toRuleInput>]> = [
    ['fixture', toRuleInput(fixtureSpec())],
    ['scale-500', toRuleInput(scaleSpec({ activities: 500 }))],
    ['scale-2000', toRuleInput(scaleSpec({ activities: 2000 }))],
    ['dense 2000 x 10', denseInput(10)],
    ['dense 2000 x 40', denseInput(40)],
  ];
  const timed = inputs.map(([label, input]) => time(label, run(input)));

  // How many relaxations a plan really needs: the smallest limit at which the search is not capped,
  // found by bisection on the rule's own `searchCapped`, so the number is measured and not estimated.
  const relaxationsUsed = Object.fromEntries(
    inputs.map(([label, input]) => {
      let lo = 1;
      let hi = 2_000_000_000;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (run(input, mid)().searchCapped) lo = mid + 1;
        else hi = mid;
      }
      return [label, lo];
    }),
  );

  const prevalence = capabilitySpecs().map((spec) => {
    const out = run(toRuleInput(spec))();
    return {
      plan: spec.seedName,
      links: spec.dependencies.length,
      flagged: out.offenders.length,
      unjudged: out.unjudged,
    };
  });

  const levellingCases: Array<[string, SeedSpec, number | undefined]> = [
    ...['capability-levelling', 'capability-levelling-placed'].map(
      (name): [string, SeedSpec, undefined] => {
        const spec = capabilitySpecs().find((s) => s.seedName === name);
        if (spec === undefined) throw new Error(`${name} is not in the catalogue`);
        return [name, spec, undefined];
      },
    ),
    ['scale-500 at capacity 2', scaleSpec({ activities: 500 }), 2],
  ];
  const levelling = levellingCases.map(([name, spec, capacity]) => {
    const flagged = new Set(run(toRuleInput(spec))().offenders.map((o) => o.linkId));
    return {
      plan: name,
      flagged: flagged.size,
      previewUnchanged: levelled(spec, new Set(), capacity) === levelled(spec, flagged, capacity),
    };
  });

  const scale2000 = timed.find((t) => t['label'] === 'scale-2000');
  const result = {
    runs: RUNS,
    warmUp: WARM_UP,
    limit,
    relaxationsUsed,
    timed,
    prevalence,
    levelling,
    fc5aP95Ms: FC_5A_P95_MS,
  };
  const out = process.env['RL_OUT'];
  if (out !== undefined) writeFileSync(out, JSON.stringify(result, null, 2));
  expect(Number(scale2000?.['p95Ms'])).toBeLessThanOrEqual(FC_5A_P95_MS);
});
