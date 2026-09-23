/**
 * **NetPoint-layout M4-T3 — the product optimiser on the M0 fixtures (FC-N2, FC-N3, FC-N4).**
 *
 * Runs `render/optimise-layout.ts` itself, never a copy, on the plans M0 measured, and reports what
 * it buys, what it costs in node, and whether it is deterministic under permuted input. Node figures
 * bound the algorithm; they say nothing about the product owner's hardware (#75).
 */
import { optimiseLayout } from '../src/features/tsld/render/optimise-layout';

import {
  chainPlacedLayouts,
  packedOnDrawn,
  scalePlan,
  sceneFor,
  smallPlanLayouts,
  unit300Layouts,
} from './crossing-probe';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

export function run(which: string): unknown[] {
  const cases: { name: string; asap: unknown; layout: unknown }[] = [];
  if (which.includes('small')) {
    const small = smallPlanLayouts();
    const chain = chainPlacedLayouts();
    cases.push({ name: 'chain-3 prefix (overlap)', asap: chain.asap, layout: chain.prefix });
    cases.push({ name: 'small-17 shipped', asap: small.asap, layout: small.shipped });
  }
  if (which.includes('unit')) {
    const unit = unit300Layouts(FIXTURE, { rollUpSummaries: true });
    cases.push({ name: 'Unit 300 shipped', asap: unit.asap, layout: unit.shipped });
  }
  for (const m of which.matchAll(/scale(\d+)/g)) {
    const n = Number(m[1]);
    const s = scalePlan(n);
    cases.push({
      name: `scale-${String(n)} packed`,
      asap: s.asap,
      layout: packedOnDrawn(s.asap, `scale-${String(n)}`),
    });
  }
  return cases.map(({ name, asap, layout }) => {
    const { scene } = sceneFor(asap as never, layout as never);
    const t0 = performance.now();
    const r = optimiseLayout(scene);
    const ms = performance.now() - t0;
    const rev = optimiseLayout({
      ...scene,
      activities: [...scene.activities].reverse(),
      edges: [...scene.edges].reverse(),
    });
    const same = [...r.lanes].every(([id, lane]) => rev.lanes.get(id) === lane);
    return {
      name,
      seed: r.seed,
      repaired: r.repaired,
      final: r.final,
      moved: r.moved.length,
      passes: r.passes,
      evaluations: r.evaluations,
      capped: r.capped,
      overBudget: r.overBudget,
      ms: Math.round(ms),
      msPerEval: +(ms / r.evaluations).toFixed(2),
      deterministic: same,
    };
  });
}
