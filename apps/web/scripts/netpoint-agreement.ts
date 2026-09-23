/**
 * **NetPoint-layout M4-T2 — FC-N0: the product objective agrees with the harness, exactly.**
 *
 * Two instruments that share no counting code score the same layouts. The harness evaluator
 * (`netpoint-evaluate.ts`, identity attribution, fast counters) and the glyph-contact reading
 * (`netpoint-row-probe.ts`) on one side; the product module `render/layout-objective.ts` on the
 * other. They share the routed lines, because both route through the painter's pipeline, and that
 * is the point: they are allowed to agree about the picture and must agree about the counts.
 *
 * The harness counts `sameRow` and `travel` over the fixture's dependency list, and the product over
 * the scene's edges; a mismatch there means the two are not scoring the same links.
 */
import { evaluateLayout } from '../src/features/tsld/render/layout-objective';

import { sceneFor, smallPlanLayouts, chainPlacedLayouts, unit300Layouts } from './crossing-probe';
import { evaluateFull, setAttribution, setCounters } from './netpoint-evaluate';
import { rowReading } from './netpoint-row-probe';

const FIXTURE = '../../packages/engine-conformance/fixtures/p6_torture_test_v1.xer';

export function agreement(): { name: string; ok: boolean; harness: string; product: string }[] {
  setCounters('fast');
  setAttribution('identity');
  const unit = unit300Layouts(FIXTURE, { rollUpSummaries: true });
  const small = smallPlanLayouts();
  const chain = chainPlacedLayouts();
  const cases = [
    { name: 'Unit 300 shipped', asap: unit.asap, layout: unit.shipped },
    { name: 'Unit 300 source order', asap: unit.asap, layout: unit.sourceOrder },
    { name: 'Unit 300 scrambled', asap: unit.asap, layout: unit.scrambled },
    { name: 'small-17 shipped', asap: small.asap, layout: small.shipped },
    { name: 'small-17 source order', asap: small.asap, layout: small.sourceOrder },
    { name: 'chain-3 prefix', asap: chain.asap, layout: chain.prefix },
    { name: 'chain-3 shipped', asap: chain.asap, layout: chain.shipped },
  ];
  return cases.map(({ name, asap, layout }) => {
    const h = evaluateFull(asap as never, layout, 4).objective;
    const row = rowReading(asap as never, layout, 4)[0]!;
    const harness = {
      overlaps: h.overlaps,
      occluded: h.occluded,
      crossings: h.crossings,
      contacts: row.glyphContacts - row.linkedContacts,
      sameRow: h.sameRow,
      travel: h.travel,
      rows: h.rows,
    };
    const { scene } = sceneFor(asap as never, layout);
    const product = evaluateLayout(scene, 4);
    const a = JSON.stringify(harness);
    const b = JSON.stringify(product);
    return { name, ok: a === b, harness: a, product: b };
  });
}
