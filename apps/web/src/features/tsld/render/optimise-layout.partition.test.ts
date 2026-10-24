import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { evaluateLayout } from './layout-objective';
import { displayLanesOf, stackOf, type LayoutPartition } from './layout-partition';
import { optimiseLayout } from './optimise-layout';
import type { RenderActivity, RenderEdge } from './render-model';
import { FIXED_WIDTH_TEXT } from './test-support/fixed-width-text';
import {
  PARITY_DATA_DATE,
  parityPlans,
  runOptimiseParity,
  runPartitionedParity,
} from './test-support/optimise-parity.fixtures';

/**
 * **Tidy and Re-layout's swimlane partition** (swimlanes M2-T6, feature-spec §4.5).
 *
 * Two halves. The first is the parity half (SC-6, ADR-0203 FC-R8): with the partition absent the
 * search answers exactly what it answered before the parameter existed, compared with a record taken
 * on that code and not with itself (ADR-0110). The second is what the partition adds: no bar leaves
 * its swimlane, links between swimlanes are scored, and the answer is deterministic.
 */
const golden: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'test-support/optimise-parity.golden.json'),
    'utf8',
  ),
);

const partitionedGolden: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'test-support/optimise-partitioned.golden.json'),
    'utf8',
  ),
);

describe('optimiseLayout without a partition (FC-R8, SC-6)', () => {
  it('has a corpus worth the name', () => {
    expect(parityPlans().length).toBeGreaterThanOrEqual(40);
  });

  it('answers byte-for-byte as before the partition existed', () => {
    expect(JSON.stringify(runOptimiseParity())).toBe(JSON.stringify(golden));
  }, 120_000);

  it('treats an explicit undefined partition as absent', () => {
    const plan = parityPlans()[3]!;
    const scene = {
      activities: plan.activities,
      edges: plan.edges,
      dataDate: PARITY_DATA_DATE,
      text: FIXED_WIDTH_TEXT,
    };
    expect(optimiseLayout(scene, { passes: 3, partition: undefined })).toEqual(
      optimiseLayout(scene, { passes: 3 }),
    );
  });
});

const day = (offset: number): string =>
  new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);

function task(id: string, lane: number, start: number, length: number): RenderActivity {
  return {
    id,
    type: 'TASK',
    laneIndex: lane,
    label: id,
    drawnStart: day(start),
    drawnFinish: day(start + length - 1),
    isCritical: false,
    isNearCritical: false,
  };
}

function link(pred: string, succ: string): RenderEdge {
  return {
    id: `${pred}-${succ}`,
    predecessorId: pred,
    successorId: succ,
    type: 'FS',
    isDriving: false,
  };
}

/** Three swimlanes of overlapping bars, in lanes local to each, with links inside and across. */
function plan(): {
  activities: RenderActivity[];
  edges: RenderEdge[];
  partition: LayoutPartition;
} {
  const activities: RenderActivity[] = [];
  const swimlaneOf = new Map<string, string>();
  const add = (key: string, id: string, lane: number, start: number, length: number): void => {
    activities.push(task(id, lane, start, length));
    swimlaneOf.set(id, key);
  };
  // Every swimlane starts with its bars piled in lane 0 and 1, so repair and the search have work.
  add('civil', 'c1', 0, 0, 6);
  add('civil', 'c2', 0, 2, 6);
  add('civil', 'c3', 1, 9, 4);
  add('civil', 'c4', 0, 14, 4);
  add('steel', 's1', 0, 6, 5);
  add('steel', 's2', 0, 8, 5);
  add('steel', 's3', 1, 15, 3);
  add('mep', 'm1', 0, 12, 5);
  add('mep', 'm2', 0, 13, 5);
  add('mep', 'm3', 0, 20, 2);
  const edges = [
    link('c1', 'c3'),
    link('c2', 's1'),
    link('s1', 's3'),
    link('s2', 'm1'),
    link('c3', 'm2'),
    link('m1', 'm3'),
    link('c4', 'm3'),
  ];
  return { activities, edges, partition: { swimlaneOf, order: ['civil', 'steel', 'mep'] } };
}

const scene = (p: ReturnType<typeof plan>, activities = p.activities) => ({
  activities,
  edges: p.edges,
  dataDate: PARITY_DATA_DATE,
  text: FIXED_WIDTH_TEXT,
});

describe('optimiseLayout inside swimlanes', () => {
  it('answers what the recorded partitioned search answered, plan for plan', () => {
    expect(JSON.stringify(runPartitionedParity())).toBe(JSON.stringify(partitionedGolden));
  }, 120_000);

  it("returns the unpartitioned search's answer when one swimlane holds every bar", () => {
    for (const p of parityPlans().slice(0, 12)) {
      const everything: LayoutPartition = {
        swimlaneOf: new Map(p.activities.map((a) => [a.id, 'all'])),
        order: ['all'],
      };
      const s = {
        activities: p.activities,
        edges: p.edges,
        dataDate: PARITY_DATA_DATE,
        text: FIXED_WIDTH_TEXT,
      };
      const plain = optimiseLayout(s, { passes: 3, maxEvaluations: 400 });
      const one = optimiseLayout(s, { passes: 3, maxEvaluations: 400, partition: everything });
      expect(one.evaluations, p.name).toBe(plain.evaluations);
      // The drawn bars only: the unpartitioned search also renumbers an undrawn activity's stored lane
      // when it compacts, which is not a row and which the partitioned search leaves alone.
      const drawn = (r: typeof one): [string, number][] =>
        [...r.lanes].filter(([id]) => id !== 'zz-undrawn').sort();
      expect(drawn(one), p.name).toEqual(drawn(plain));
      expect(one.final, p.name).toEqual(plain.final);
    }
  });

  it('leaves no bar outside its swimlane, and no two bars of a swimlane overlapping in a lane', () => {
    const p = plan();
    const r = optimiseLayout(scene(p), { partition: p.partition, budget: 12 });
    const stack = stackOf(
      p.partition,
      p.activities.map((a) => a.id),
    );
    const display = displayLanesOf(
      p.partition,
      stack,
      r.lanes,
      p.activities.map((a) => a.id),
    );

    // The bands the result occupies, top to bottom.
    const bands = new Map<string, { first: number; last: number }>();
    for (const a of p.activities) {
      const key = p.partition.swimlaneOf.get(a.id)!;
      const lane = display.get(a.id)!;
      const band = bands.get(key);
      bands.set(key, {
        first: Math.min(band?.first ?? lane, lane),
        last: Math.max(band?.last ?? lane, lane),
      });
    }
    const ordered = stack.map((key) => bands.get(key)!);
    for (let i = 1; i < ordered.length; i += 1) {
      // Swimlanes cannot share a row: each band starts below the one above it.
      expect(ordered[i]!.first).toBeGreaterThan(ordered[i - 1]!.last);
    }
    expect(r.final.overlaps).toBe(0);
    // Every swimlane's lanes are 0-based and gap-free (compaction keeps what is used).
    for (const key of stack) {
      const lanes = p.activities
        .filter((a) => p.partition.swimlaneOf.get(a.id) === key)
        .map((a) => r.lanes.get(a.id)!);
      const used = [...new Set(lanes)].sort((a, b) => a - b);
      expect(used).toEqual(used.map((_, i) => i));
    }
  });

  it('scores the objective on display lanes, so a link between swimlanes counts', () => {
    const p = plan();
    const r = optimiseLayout(scene(p), { partition: p.partition, budget: 12 });
    const ids = p.activities.map((a) => a.id);
    const stack = stackOf(p.partition, ids);
    const display = displayLanesOf(p.partition, stack, r.lanes, ids);
    const rescored = evaluateLayout({
      ...scene(
        p,
        p.activities.map((a) => ({ ...a, laneIndex: display.get(a.id)! })),
      ),
    });
    expect(rescored).toEqual(r.final);
    // The same bars scored with every swimlane's lanes read as display lanes (the mistake the
    // partition exists to prevent) is a different picture.
    const naive = evaluateLayout(
      scene(
        p,
        p.activities.map((a) => ({ ...a, laneIndex: r.lanes.get(a.id)! })),
      ),
    );
    expect(naive).not.toEqual(r.final);
  });

  it('is never worse than its repaired seed and is deterministic, whatever the input order', () => {
    const p = plan();
    const first = optimiseLayout(scene(p), { partition: p.partition });
    const second = optimiseLayout(scene(p), { partition: p.partition });
    const shuffled = optimiseLayout(
      { ...scene(p, [...p.activities].reverse()), edges: [...p.edges].reverse() },
      { partition: p.partition },
    );
    expect([...second.lanes]).toEqual([...first.lanes]);
    expect([...shuffled.lanes].sort()).toEqual([...first.lanes].sort());
    expect(shuffled.evaluations).toBe(first.evaluations);
    expect(first.final.overlaps).toBe(0);
  });

  it("keeps a row for a swimlane with no bars, and counts it in the diagram's height", () => {
    const p = plan();
    const withEmpty: LayoutPartition = {
      ...p.partition,
      order: ['civil', 'empty', 'steel', 'mep'],
    };
    const r = optimiseLayout(scene(p), { partition: withEmpty });
    const ids = p.activities.map((a) => a.id);
    const stack = stackOf(withEmpty, ids);
    const display = displayLanesOf(withEmpty, stack, r.lanes, ids);
    const steelTop = Math.min(
      ...p.activities
        .filter((a) => withEmpty.swimlaneOf.get(a.id) === 'steel')
        .map((a) => display.get(a.id)!),
    );
    const civilBottom = Math.max(
      ...p.activities
        .filter((a) => withEmpty.swimlaneOf.get(a.id) === 'civil')
        .map((a) => display.get(a.id)!),
    );
    expect(steelTop - civilBottom).toBeGreaterThanOrEqual(2);
  });

  it('reports a budget below the repaired height, and spends no row beyond one that is given', () => {
    const p = plan();
    const heightOf = (lanes: ReadonlyMap<string, number>): number =>
      p.partition.order.reduce(
        (total, key) =>
          total +
          Math.max(
            1,
            ...p.activities
              .filter((a) => p.partition.swimlaneOf.get(a.id) === key)
              .map((a) => lanes.get(a.id)! + 1),
          ),
        0,
      );
    const tight = optimiseLayout(scene(p), { partition: p.partition, budget: 1 });
    expect(tight.overBudget).toBe(true);
    // The repaired layout is the least the swimlanes can occupy; the search adds nothing to it.
    expect(heightOf(tight.lanes)).toBe(
      heightOf(optimiseLayout(scene(p), { partition: p.partition, passes: 0 }).lanes),
    );
    const roomy = optimiseLayout(scene(p), { partition: p.partition, budget: 30 });
    expect(roomy.overBudget).toBe(false);
    expect(heightOf(roomy.lanes)).toBeLessThanOrEqual(30);
  });
});

/**
 * **The cost the owner was shown** (`docs/specs/swimlanes/m0-reading.md`): the partitioned Tidy on the
 * two corpus plans took 359 evaluations (power plant) and 356 (torture) in the M0-T4 harness. The
 * product's search must make the same number of them, because the count is what the machine cannot
 * move; it is the one figure here that ties the product to that reading. The splits are the harness's
 * (`scripts/netpoint-swimlane-run.ts`: the code prefix, and the thousands digit of the code), the text
 * width is the harness's 6 px a character (which `FIXED_WIDTH_TEXT` is), and the starting lanes are
 * the diagram read per swimlane. Node only; no browser.
 */
interface CorpusPlan {
  seedName: string;
  dataDate: string;
  activities: (RenderActivity & { code?: string })[];
  edges: RenderEdge[];
}

function corpusPlan(name: string): CorpusPlan {
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../scripts/fixtures/relayout-corpus.json',
  );
  const plans = (JSON.parse(readFileSync(file, 'utf8')) as { plans: CorpusPlan[] }).plans;
  const plan = plans.find((p) => p.seedName === name);
  if (!plan) throw new Error(`the committed corpus has no ${name}`);
  return plan;
}

/** The harness's `localise`: each swimlane's distinct rows, in order, from 0. */
function localLanes(plan: CorpusPlan, swimlaneOf: ReadonlyMap<string, string>): CorpusPlan {
  const out = plan.activities.map((a) => ({ ...a }));
  for (const key of new Set(swimlaneOf.values())) {
    const members = out.filter((a) => swimlaneOf.get(a.id) === key);
    const rows = [...new Set(members.map((a) => a.laneIndex))].sort((a, b) => a - b);
    for (const a of members) a.laneIndex = rows.indexOf(a.laneIndex);
  }
  return { ...plan, activities: out };
}

describe('the partitioned Tidy costs what M0-T4 measured', () => {
  it('makes 359 evaluations on the power plant, split by system', () => {
    const plan = corpusPlan('reference-netpoint-power-plant');
    const prefix = (code: string): string => code.split('_')[0]!;
    const counts = new Map<string, number>();
    for (const a of plan.activities)
      counts.set(prefix(a.code!), (counts.get(prefix(a.code!)) ?? 0) + 1);
    const swimlaneOf = new Map(
      plan.activities.map((a) => [
        a.id,
        counts.get(prefix(a.code!))! >= 2 && prefix(a.code!) !== 'M' ? prefix(a.code!) : 'Common',
      ]),
    );
    const local = localLanes(plan, swimlaneOf);
    const r = optimiseLayout(
      {
        activities: local.activities,
        edges: plan.edges,
        dataDate: plan.dataDate,
        text: FIXED_WIDTH_TEXT,
      },
      { partition: { swimlaneOf, order: [...new Set(swimlaneOf.values())] } },
    );
    expect(r.evaluations).toBe(359);
  }, 120_000);

  it('makes 356 evaluations on the torture plan, split by work package', () => {
    const plan = corpusPlan('fixture-p6-torture-v1');
    const swimlaneOf = new Map(
      plan.activities.map((a) => [
        a.id,
        /^A\d/.test(a.code ?? '') ? `A${a.code!.slice(1, 2)}` : 'Summaries',
      ]),
    );
    const local = localLanes(plan, swimlaneOf);
    const r = optimiseLayout(
      {
        activities: local.activities,
        edges: plan.edges,
        dataDate: plan.dataDate,
        text: FIXED_WIDTH_TEXT,
      },
      { partition: { swimlaneOf, order: [...new Set(swimlaneOf.values())].sort() } },
    );
    expect(r.evaluations).toBe(356);
  }, 120_000);
});
