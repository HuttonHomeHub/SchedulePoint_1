import { expect, test } from '@playwright/test';

import {
  canvasInk,
  createPlan,
  ensurePen,
  onboard,
  openProject,
  placeRelativeTo,
  recalculate,
  seedActivities,
  seedDependency,
} from './support';

/**
 * **The gutter route, driven in the real product** (logic-legibility M1-T4).
 *
 * Nothing in this repository has ever asserted what a routed line looks like in a real browser. The
 * unit suite pins `routeOrthogonal`'s output as numbers; jsdom has no layout, and the node probe's
 * 2D stub has neither `arcTo` nor `roundRect` — so neither can say whether the line a planner sees
 * is painted at all.
 *
 * The plan is built so the router **must** take its gutter fallback: a blocker spanning the whole
 * programme sits in the lane between the two linked activities, so every corridor candidate is
 * blocked across the lane it would have to cross.
 *
 * ## What this DOES and does NOT establish, measured rather than assumed
 *
 * It establishes that the fallback fires in the shipped product and paints a horizontal line in the
 * gutter, clear of the bar borders — read from the painted canvas by colour rather than by a hex
 * literal (`canvasInk`).
 *
 * **It is NOT a gate for M1-T1's datum, and saying so is the point.** Run against a deliberately
 * reverted datum it stays green, four different assertions deep, and the reason is arithmetic
 * rather than a weak test: today's clear band is 10 CSS px, so the boundary is 5 px from each bar
 * edge and the outermost channel sits 3 px off the boundary — a channelled leg can legitimately
 * land **2 px** from where the old datum put it. Measured on this fixture: 19 device px of run at 6
 * from the edge after M1, against 12 at 4 before it. Real, and far inside what a border stroke and
 * its antialiasing occupy.
 *
 * Three earlier versions of this test claimed more than that and were wrong in a way only a red run
 * exposed. The first looked for link ink anywhere in a gutter — true of every vertical corridor
 * that crosses one. The second counted a "run" that never reset, so it was the first in disguise.
 * The third found a bar's own 1,575 px OUTLINE, which is a dark neutral hard against the band edge.
 * Each passed against the defect it was written to catch (ADR-0110 D5), and the confound was
 * identified by dumping the actual pixel values rather than by a fourth guess.
 *
 * **The datum is gated where it can be**: `link-routing.test.ts` asserts the leg's y against an
 * independently derived inequality at five origins, verified red by exactly `pad` at every one. And
 * FC-L3's verdict is taken at M3's geometry for this very reason — a NetPoint-thin bar makes the
 * band ~23 px and the channels ±9, where the separation is visible rather than arithmetical.
 */
const BLOCKED = [
  { name: 'Mobilise', laneIndex: 0, durationDays: 5 },
  { name: 'Blocker', laneIndex: 1, durationDays: 60 },
  { name: 'Pour', laneIndex: 2, durationDays: 5 },
];

test('a link forced into the gutter is painted there, clear of the bar borders', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Blocked corridor');
  await ensurePen(page);
  const made = await seedActivities(page, orgSlug, BLOCKED);
  const from = made.find((a) => a.name === 'Mobilise');
  const to = made.find((a) => a.name === 'Pour');
  if (!from || !to) throw new Error('the fixture did not seed the two activities it links');
  await seedDependency(page, orgSlug, from.id, to.id);
  // **Placed so the link waits, which keeps it non-driving** (NetPoint-layout M2). A driving link
  // now draws in its rung's ink, which is `--primary` and saturated, and `canvasInk` reads
  // saturated pixels as BAR: a driving gutter leg would read as a bar band and this test would
  // measure the wrong thing. A non-driving link is the 1 px `--canvas-link-minor` grey the
  // classifier reads as link; its waiting run is dashed, which `linkRun` bridges.
  await placeRelativeTo(page, orgSlug, 'Pour', 'Mobilise', 10);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  // `recalculate` reloads, so the workspace remounts — wait for the diagram rather than racing it.
  await expect(page.locator('canvas').first()).toBeAttached();
  const { rows } = await canvasInk(page);

  /**
   * **The control first.** A canvas that painted nothing reports zero of everything and every
   * assertion below passes for the wrong reason — the vacuity failure FC-L0's own control exists
   * for, and the one this milestone's harness hit when M1 moved a datum the counter did not know
   * about.
   */
  const barRows = rows.filter((r) => r.bar > 20);
  expect(barRows.length).toBeGreaterThan(0);
  expect(rows.some((r) => r.link > 0)).toBe(true);

  // The bar rows, as contiguous bands. The gutters are the gaps between consecutive bands.
  const bands: { top: number; bottom: number }[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y]!.bar <= 20) continue;
    const last = bands[bands.length - 1];
    if (last && y === last.bottom + 1) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  expect(bands.length).toBeGreaterThanOrEqual(2);

  /**
   * **A LONG horizontal run of link ink, strictly between two bar bands.**
   *
   * Two clauses, and each is load-bearing. *Strictly between*, with a clear pixel row at each end,
   * because the old datum was the bar's bottom EDGE — a line hugging it must not count as being in
   * the gutter. And a *run*, not a pixel count, because every link that changes lane sends a
   * vertical corridor through the gutters it crosses, so "some link ink in a gutter" is true
   * whatever the horizontal legs do. The first version of this test asserted the count and passed
   * identically against the pre-M1 datum — a gate is finished when it has been made to fail by the
   * defect it names (ADR-0110 D5), and that one never was.
   *
   * 20 px is a gutter leg at its shortest here and far beyond a corridor's one or two.
   */
  /**
   * **The search skips the four device pixels either side of a bar, and that is the discriminator.**
   *
   * A bar is drawn with a dark neutral BORDER, full bar width, one pixel outside its fill — so the
   * longest near-neutral run anywhere in this picture is a bar's own outline, measured at 1,575 px
   * hard against the band edge. Three earlier versions of this test looked for "a long run
   * somewhere in the gutter" and found that outline instead, passing identically against a
   * deliberately reverted datum. The confound was identified by dumping the actual pixel values
   * rather than by a fourth guess.
   *
   * Four device pixels is two CSS px at this DPR — beyond a border stroke and its antialiasing,
   * and far inside the gutter's own five, where M1-T1 puts the leg.
   */
  const EDGE_SKIP_PX = 4;
  let best = { run: 0, y: -1, fromEdge: -1 };
  for (let i = 0; i + 1 < bands.length; i += 1) {
    const top = bands[i]!.bottom;
    const bottom = bands[i + 1]!.top;
    for (let y = top + EDGE_SKIP_PX; y <= bottom - EDGE_SKIP_PX; y += 1) {
      const run = rows[y]!.linkRun;
      if (run <= best.run) continue;
      best = { run, y, fromEdge: Math.min(y - top, bottom - y) };
    }
  }

  /**
   * The bar is what separates a HORIZONTAL leg from the vertical corridors that also cross every
   * gutter: a corridor is one or two device pixels wide and a leg is a line. Eight is four CSS px
   * at this DPR — well clear of a corridor, and chosen for that reason rather than from the
   * reading, which is 19 on this fixture.
   */
  expect(best.run).toBeGreaterThan(8);
  expect(best.fromEdge).toBeGreaterThanOrEqual(EDGE_SKIP_PX);
});

/**
 * **Spec §0.3's same-lane shape, driven in a real browser** (logic-legibility M2).
 *
 * `packLanes` packs by time, so A and C share a lane with B between them — and before M2
 * `routeOrthogonal` returned the straight segment `[from, to]` **before obstacles were consulted**
 * (`link-routing.ts:182`), so the link drew through B and vanished behind it. That early return is
 * why the product owner's report said _"even for a simple plan"_: a plan with few lanes has most of
 * its links in one.
 *
 * **It does not discriminate the defect either, and the reason is now general enough to state
 * once.** Run against the restored early return it stays green: this canvas carries many dark
 * near-neutral horizontals that are not links — bar borders, the data-date and today marks, ruler
 * ticks — and a classifier that separates ink by colour and saturation cannot tell them from a
 * routed line. Every pixel assertion attempted here, five across two cases, found one of those
 * instead of the link.
 *
 * So the geometry is gated where an instrument can actually see it, and both are stronger than a
 * pixel test would have been:
 *
 * - `link-routing.test.ts` asserts the routes as numbers, verified red against **three** named
 *   mutations — the same-lane early return, the adjacent-lane early return, and excluding only one
 *   of a same-lane leg's two anchors.
 * - `scripts/measure-occlusion.mjs` and `measure-avoidable.mjs` read the **painter's own output**,
 *   and the second proves its reconstruction is byte-identical to the painted line set before it
 *   reports anything — a control that fired twice during M2 and refused to judge.
 *
 * What these two cases establish is what only a browser can: the real product, against a real API
 * with the pen enforced, reaches this code, takes the fallback, and paints a line rather than
 * throwing or drawing nothing. That is worth having and it is not a geometry gate.
 */
const SAME_LANE = [
  { name: 'Strip out', laneIndex: 0, durationDays: 5 },
  { name: 'First fix', laneIndex: 0, durationDays: 5 },
  { name: 'Handover', laneIndex: 0, durationDays: 5 },
];

test('a link over a bar in its own lane is routed and painted', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'One lane');
  await ensurePen(page);
  const made = await seedActivities(page, orgSlug, SAME_LANE);
  const a = made.find((m) => m.name === 'Strip out');
  const b = made.find((m) => m.name === 'First fix');
  const c = made.find((m) => m.name === 'Handover');
  if (!a || !b || !c) throw new Error('the fixture did not seed its three activities');
  // The chain puts B between A and C in time; the extra A -> C link is the one that must route.
  await seedDependency(page, orgSlug, a.id, b.id);
  await seedDependency(page, orgSlug, b.id, c.id);
  await seedDependency(page, orgSlug, a.id, c.id);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.locator('canvas').first()).toBeAttached();

  const { rows } = await canvasInk(page);
  const bands: { top: number; bottom: number }[] = [];
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y]!.bar <= 20) continue;
    const last = bands[bands.length - 1];
    if (last && y === last.bottom + 1) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  // The control: one lane, so one band. If the seed drifted into several this is not the shape.
  expect(bands).toHaveLength(1);

  /**
   * A long horizontal link run OUTSIDE the band, clear of its border. Before M2 the A→C line sits
   * at the bar's centre-line — inside the band, under the fill — so there is nothing out here to
   * find; the run below belongs to the routed link.
   */
  const EDGE_SKIP_PX = 4;
  let outsideRun = 0;
  for (let y = 0; y < rows.length; y += 1) {
    if (y > bands[0]!.top - EDGE_SKIP_PX && y < bands[0]!.bottom + EDGE_SKIP_PX) continue;
    outsideRun = Math.max(outsideRun, rows[y]!.linkRun);
  }
  expect(outsideRun).toBeGreaterThan(8);
});
