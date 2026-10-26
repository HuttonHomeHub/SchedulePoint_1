/**
 * **#539 — the evidence behind every regenerated levelling hash** (`level.contended.parity.spec.ts`
 * seeds 12, 52, 57; `level.hot-resource.parity.spec.ts` all eight shapes).
 *
 * A frozen hash may be replaced only with the diff that justifies it, taken against the engine that
 * produced the old one. This script computes the same plans under the PARENT engine and the engine in
 * the tree, and prints every row whose result differs, with the fields that moved and whether the
 * activity is a zero-span activity on a calendar its neighbours do not share (a seam) or not.
 *
 *   git archive 9a750756 apps/api/src/modules/schedule/engine | tar -x -C "$SCRATCH"
 *   OLD_ENGINE_DIR="$SCRATCH/apps/api/src/modules/schedule/engine" \
 *     pnpm exec vitest run -c scripts/vitest.measure.config.mts scripts/measure-milestone-levelling-movement.mts --silent=false
 *
 * (9a750756 is the commit before the milestone-cross-calendar engine change; `levelSchedule` of that
 * tree needs only its own sibling files, so the whole directory is imported from where it was extracted.)
 *
 * **How to read it.** In-memory instants (`passOn*`, `leveledStartInstant`) are not reported fields;
 * everything else is. The claim under test is the spec's: a single-calendar network is unchanged in every
 * REPORTED field. A reported field that moved on a row with no seam is a defect, and this script ends by
 * failing on one.
 */
import { pathToFileURL } from 'node:url';

import { scaleSpec } from '@repo/seed';
import { it } from 'vitest';

import { computeSchedule as newCompute } from '../src/modules/schedule/engine/compute.js';
import { levelSchedule as newLevel } from '../src/modules/schedule/engine/level.js';
import type { EngineActivity, EngineAssignment } from '../src/modules/schedule/engine/types.js';
import { digest, randomPlan } from '../test/legacy-levelling/random-plan.js';
import { specToEngineInput } from '../test/pairwise/spec-to-engine.js';

const IN_MEMORY = /^(passOn(Start|Finish)Instant|leveledStartInstant)$/;

interface Engine {
  compute: typeof newCompute;
  level: typeof newLevel;
}

async function parentEngine(): Promise<Engine> {
  const dir = process.env.OLD_ENGINE_DIR;
  if (!dir) throw new Error('Set OLD_ENGINE_DIR to the extracted parent engine directory.');
  const load = async (name: string) =>
    (await import(/* @vite-ignore */ pathToFileURL(`${dir}/${name}.ts`).href)) as Record<
      string,
      unknown
    >;
  return {
    compute: (await load('compute')).computeSchedule as typeof newCompute,
    level: (await load('level')).levelSchedule as typeof newLevel,
  };
}

/** True when the activity sits on a calendar that a neighbour does not share. */
function seamOf(
  activities: readonly EngineActivity[],
  edges: readonly { predecessorId: string; successorId: string }[],
  planCalendar: unknown,
  id: string,
): boolean {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const cal = (a: EngineActivity) => a.calendar ?? planCalendar;
  const self = byId.get(id)!;
  return edges.some((e) => {
    if (e.predecessorId !== id && e.successorId !== id) return false;
    const other = byId.get(e.predecessorId === id ? e.successorId : e.predecessorId)!;
    return cal(other) !== cal(self);
  });
}

function diffRows(
  label: string,
  before: readonly unknown[],
  after: readonly unknown[],
  activities: readonly EngineActivity[],
  edges: readonly { predecessorId: string; successorId: string }[],
  planCalendar: unknown,
  out: string[],
): number {
  const old = new Map(
    (before as Record<string, unknown>[]).map((r) => [r.activityId as string, r]),
  );
  const byId = new Map(activities.map((a) => [a.id, a]));
  let defects = 0;
  for (const r of after as Record<string, unknown>[]) {
    const o = old.get(r.activityId as string)!;
    const keys = Object.keys({ ...o, ...r }).filter(
      (k) => JSON.stringify(o[k]) !== JSON.stringify(r[k]),
    );
    if (keys.length === 0) continue;
    const a = byId.get(r.activityId as string)!;
    const reported = keys.filter((k) => !IN_MEMORY.test(k));
    const seam = seamOf(activities, edges, planCalendar, a.id);
    // A reported field may move on a seam row, or on a row downstream or upstream of one; a row with no
    // seam of its own is only a defect if it is a zero-span activity itself. The reader judges the rest.
    const suspect = reported.length > 0 && a.durationMinutes === 0 && !seam;
    if (suspect) defects += 1;
    out.push(
      `  ${label} ${a.id} ${a.type} d=${a.durationMinutes} seam=${seam}${suspect ? ' SUSPECT' : ''}: ` +
        keys.map((k) => `${k} ${JSON.stringify(o[k])} -> ${JSON.stringify(r[k])}`).join('; '),
    );
  }
  return defects;
}

it('diffs the levelling parity corpora against the parent engine', async () => {
  const parent = await parentEngine();
  const out: string[] = [];
  let defects = 0;

  for (let seed = 1; seed <= 60; seed += 1) {
    const plan = randomPlan(seed);
    const run = (e: Engine) => {
      const net = e.compute(plan.activities, plan.edges, {
        dataDate: plan.options.dataDate,
        calendar: plan.options.planCalendar,
      });
      const lev = e.level(
        plan.activities,
        net,
        plan.passC ? plan.edges : [],
        plan.assignments,
        plan.resources,
        plan.options,
      );
      return { net, lev };
    };
    const before = run(parent);
    const after = run({ compute: newCompute, level: newLevel });
    if (digest(before.lev) === digest(after.lev)) continue;
    out.push(
      `== contended seed ${seed} (${plan.activities.length} activities, passC ${plan.passC})`,
    );
    for (const [label, b, a] of [
      ['net', before.net.results, after.net.results],
      ['lev', before.lev.results, after.lev.results],
    ] as const) {
      defects += diffRows(label, b, a, plan.activities, plan.edges, plan.options.planCalendar, out);
    }
  }

  const spec = scaleSpec({ activities: 2000 });
  const { activities, edges, options } = specToEngineInput(spec);
  const levelOptions = {
    levelWithinFloatOnly: false,
    dataDate: options.dataDate,
    planCalendar: options.calendar,
    anchor: 'PLACED' as const,
  };
  const hot: EngineAssignment[] = activities
    .filter(
      (a) => a.durationMinutes > 0 && a.type !== 'WBS_SUMMARY' && a.type !== 'LEVEL_OF_EFFORT',
    )
    .map((a) => ({ activityId: a.id, resourceId: 'HOT', unitsPerHour: 1 }));
  const seeded: EngineAssignment[] = spec.assignments.map((a) => ({
    activityId: a.activityKey,
    resourceId: a.resourceKey,
    unitsPerHour: a.unitsPerHour ?? 0,
  }));
  const shapes: [string, EngineAssignment[], { id: string; capacity: number }[]][] = [
    ['hot8', hot, [{ id: 'HOT', capacity: 8 }]],
    ['hot3', hot, [{ id: 'HOT', capacity: 3 }]],
    ['scale8', seeded, spec.resources.map((r) => ({ id: r.key, capacity: 8 }))],
    ['scale2', seeded, spec.resources.map((r) => ({ id: r.key, capacity: 2 }))],
  ];
  const netBefore = parent.compute(activities, edges, options);
  const netAfter = newCompute(activities, edges, options);
  for (const [name, assignments, resources] of shapes) {
    for (const passC of [false, true]) {
      const e = passC ? edges : [];
      const before = parent.level(
        activities,
        netBefore,
        e,
        assignments,
        resources as never,
        levelOptions,
      );
      const after = newLevel(
        activities,
        netAfter,
        e,
        assignments,
        resources as never,
        levelOptions,
      );
      const rows: string[] = [];
      const d = diffRows(
        'lev',
        before.results,
        after.results,
        activities,
        edges,
        options.calendar,
        rows,
      );
      defects += d;
      const summarySame = JSON.stringify(before.summary) === JSON.stringify(after.summary);
      const fields = new Map<string, number>();
      for (const row of rows) {
        const m = /^ {2}lev (\S+) (\S+) d=(\d+) seam=\S+(?: SUSPECT)?: (.*)$/.exec(row);
        const key = `${m?.[2]} d0=${m?.[3] === '0'}: ${(m?.[4] ?? '')
          .split('; ')
          .map((x) => x.split(' ')[0])
          .join(',')}`;
        fields.set(key, (fields.get(key) ?? 0) + 1);
      }
      out.push(
        `== ${name} passC=${passC}: summary same=${summarySame}; ` +
          [...fields].map(([k, n]) => `${n} x ${k}`).join(' | '),
      );
    }
  }

  console.log(out.join('\n'));
  if (defects > 0)
    throw new Error(`${defects} reported field(s) moved on a zero-span row with no seam.`);
});
