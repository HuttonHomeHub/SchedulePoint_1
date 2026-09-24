/**
 * NetPoint grammar M0-T6: the FC-G1 baseline. Each later milestone must reproduce these routes and
 * lanes exactly.
 *
 * Run: `pnpm exec tsx scripts/netpoint-grammar-baseline.ts` from `apps/web`, before and after a
 * milestone. Diff the two outputs.
 *
 * - **FC-G1** says the grammar changes how things look and never where anything sits. So every
 *   routed link polyline must be byte-identical before and after each milestone, on every yardstick
 *   plan at every yardstick zoom. The fingerprint is `crossing-probe.ts`'s own digest of every link
 *   polyline (`read()`), not a copy of it (ADR-0124).
 * - **FC-G1b** (spec §4.13 A2) says Tidy and Re-layout pick the same lanes. `NODE_RADIUS` feeds the
 *   layout search's contact score, so a larger node could quietly change which lanes Tidy picks, and
 *   no route fingerprint would see it, because routes are measured with the lanes held fixed. So the
 *   optimiser's output is fingerprinted too. It is the product's `optimiseLayout`, never a copy.
 *
 * **The viewport holds the whole plan**, so nothing is culled and `read()`'s link count must equal
 * the plan's edge count. A reading that culled would fingerprint a subset, and two subsets can agree
 * while the plans differ.
 */
import { createHash } from 'node:crypto';

import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant';
import { LANE_HEIGHT } from '../src/features/tsld/render/geometry';
import { optimiseLayout } from '../src/features/tsld/render/optimise-layout';

import {
  chainPlacedLayouts,
  packedOnDrawn,
  read,
  scalePlan,
  sceneFor,
  smallPlanLayouts,
  unit300Layouts,
  type Layout,
} from './crossing-probe';

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';
const ZOOMS = [1, 4, 12, 40] as const;

type Asap = Parameters<typeof sceneFor>[0];

/** The reference plan as the probes want it: keys, drawn day spans and the picture's rows. */
function referenceCase(): { asap: Asap; layout: Layout } {
  const spec = netpointReferencePlan();
  const origin = Math.min(...spec.activities.map((a) => Date.parse(`${a.visualStart}T00:00:00Z`)));
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  for (const a of spec.activities) {
    const s = (Date.parse(`${a.visualStart}T00:00:00Z`) - origin) / 86_400_000;
    const days = Math.round(a.durationMinutes / 1440);
    start.set(a.key, s);
    finish.set(a.key, days === 0 ? s : s + days - 1);
  }
  const asap = {
    activities: spec.activities.map((a) => ({ key: a.key, type: a.type })),
    dependencies: spec.dependencies.map((d) => ({
      predecessorKey: d.predecessorKey,
      successorKey: d.successorKey,
      type: d.type,
      lagMinutes: d.lagMinutes,
    })),
    start,
    finish,
  } as unknown as Asap;
  const laneOf = new Map(spec.activities.map((a) => [a.key, a.laneIndex ?? 0]));
  return {
    asap,
    layout: { name: 'as drawn', laneOf, lanes: Math.max(...laneOf.values()) + 1 },
  };
}

function lanesDigest(lanes: ReadonlyMap<string, number>): string {
  const digest = createHash('sha256');
  for (const [id, lane] of [...lanes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    digest.update(`${id}=${lane};`);
  }
  return digest.digest('hex').slice(0, 12);
}

const small = smallPlanLayouts();
const chain = chainPlacedLayouts();
const unit = unit300Layouts(FIXTURE);
const scale = scalePlan(2000);
const cases: { name: string; asap: Asap; layout: Layout; optimise: boolean }[] = [
  { name: 'reference-netpoint', ...referenceCase(), optimise: true },
  {
    name: 'chain-3-placed',
    // The small fixtures carry only what the probes read; the cast is to the probes' input shape.
    asap: chain.asap as unknown as Asap,
    layout: chain.shipped,
    optimise: true,
  },
  { name: 'small-17', asap: small.asap as unknown as Asap, layout: small.shipped, optimise: true },
  { name: 'Unit 300', asap: unit.asap, layout: unit.shipped, optimise: true },
  // scale-2000 is past OPTIMISE_MAX_ACTIVITIES (300), where Tidy is not offered, so its lanes are
  // not a product output to fingerprint.
  {
    name: 'scale-2000',
    asap: scale.asap,
    layout: packedOnDrawn(scale.asap, 'scale-2000'),
    optimise: false,
  },
];

out('## FC-G1 — route fingerprints (every link polyline, whole-plan viewport)\n');
out('| Plan | px/day | links | edges | crossings/link | fingerprint |');
out('| --- | --- | --- | --- | --- | --- |');
for (const c of cases) {
  const { scene, edges } = sceneFor(c.asap, c.layout);
  const acts = (c.asap as unknown as { activities: { key: string }[] }).activities;
  const maxDay = Math.max(
    ...acts.map(
      (a) => (c.asap as unknown as { finish: Map<string, number> }).finish.get(a.key) ?? 0,
    ),
  );
  for (const z of ZOOMS) {
    const vp = {
      label: 'whole-plan',
      width: (maxDay + 4) * z + 400,
      height: c.layout.lanes * LANE_HEIGHT + 200,
    };
    const r = read(scene, c.layout, vp, z, 32);
    // The control: nothing culled, so every edge is a drawn polyline. Anything else fingerprints a
    // subset of the plan.
    if (r.visibleLinks !== edges) {
      throw new Error(
        `${c.name} at ${z} px/day: ${r.visibleLinks} links drawn against ${edges} edges. The ` +
          'viewport is culling, so the fingerprint would describe part of the plan. Refusing.',
      );
    }
    out(
      `| ${c.name} | ${z} | ${r.visibleLinks} | ${edges} | ${r.perLink.toFixed(3)} | \`${r.fingerprint}\` |`,
    );
  }
}

out('\n## FC-G1b — Tidy and Re-layout lane assignments\n');
out('| Plan | Tidy (seed: current rows) | Re-layout (seed: packed) |');
out('| --- | --- | --- |');
for (const c of cases.filter((x) => x.optimise)) {
  const tidy = optimiseLayout(sceneFor(c.asap, c.layout).scene);
  const packed = packedOnDrawn(c.asap, `${c.name} packed`);
  const relayout = optimiseLayout(sceneFor(c.asap, packed).scene);
  out(`| ${c.name} | \`${lanesDigest(tidy.lanes)}\` | \`${lanesDigest(relayout.lanes)}\` |`);
}
