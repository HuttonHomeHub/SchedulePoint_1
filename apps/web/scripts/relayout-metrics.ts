import type { Point, RenderActivity, RenderEdge } from '../src/features/tsld/render/render-model';

/**
 * The figures `measure-relayout.mjs` REPORTS and the product's objective does not rank (spec
 * `docs/specs/relayout-quality`, §4.5 D1 and CQ-3). Pure, so each counter has a self-test that runs
 * before any reading: an instrument that cannot count a hand-built case is not measuring a layout.
 */

/**
 * Interior vertices across the routed lines: a straight two-point line has none, an L has one. The
 * router already prefers fewer bends inside its own link score (ADR-0158 decision 4), so this is
 * reported, never ranked.
 */
export function bendCount(lines: readonly { line: readonly Point[] }[]): number {
  let n = 0;
  for (const { line } of lines) n += Math.max(0, line.length - 2);
  return n;
}

export interface CriticalSpine {
  /** Distinct rows holding at least one drawn critical activity. */
  rows: number;
  /** Driving links between two critical activities whose ends are NOT in the same row. */
  linksOffRow: number;
  /** Driving links between two critical activities, the denominator for the figure above. */
  links: number;
}

/**
 * How the critical path reads: along one row, or split across several (`TECH_DEBT.md` #382's "split
 * across separate rows"). Reported only (CQ-3): ranking it would change Tidy and the owner's order.
 */
export function criticalSpine(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
): CriticalSpine {
  const laneOf = new Map<string, number>();
  for (const a of activities) {
    if (a.isCritical === true && a.drawnStart !== null) laneOf.set(a.id, a.laneIndex);
  }
  let linksOffRow = 0;
  let links = 0;
  for (const e of edges) {
    if (e.isDriving !== true) continue;
    const from = laneOf.get(e.predecessorId);
    const to = laneOf.get(e.successorId);
    if (from === undefined || to === undefined) continue;
    links += 1;
    if (from !== to) linksOffRow += 1;
  }
  return { rows: new Set(laneOf.values()).size, linksOffRow, links };
}

export interface TravelStats {
  mean: number;
  max: number;
  links: number;
}

/**
 * Mean and maximum |Δlane| per link: the measure of the "links climbing about 25 rows" objection
 * that set Re-layout's budget on 2026-09-23 (FC-R5).
 */
export function travelStats(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
): TravelStats {
  const laneOf = new Map(activities.map((a) => [a.id, a.laneIndex]));
  let sum = 0;
  let max = 0;
  let links = 0;
  for (const e of edges) {
    const a = laneOf.get(e.predecessorId);
    const b = laneOf.get(e.successorId);
    if (a === undefined || b === undefined) continue;
    const d = Math.abs(a - b);
    sum += d;
    max = Math.max(max, d);
    links += 1;
  }
  return { mean: links === 0 ? 0 : sum / links, max, links };
}

/** Throws on the first counter that miscounts a hand-built case. */
export function selfTest(): string[] {
  const done: string[] = [];
  const expect = (name: string, got: unknown, want: unknown): void => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(
        `relayout-metrics self-test FAILED: ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
      );
    }
    done.push(name);
  };

  const straight = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  ];
  const stepped = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 5 },
  ];
  expect('bends: a straight line has none', bendCount([{ line: straight }]), 0);
  expect('bends: a step has two interior vertices', bendCount([{ line: stepped }]), 2);
  expect(
    'bends: summed across lines',
    bendCount([{ line: straight }, { line: stepped }, { line: stepped }]),
    4,
  );

  const act = (id: string, laneIndex: number, isCritical: boolean): RenderActivity => ({
    id,
    type: 'TASK',
    laneIndex,
    drawnStart: '2026-01-05',
    drawnFinish: '2026-01-09',
    isCritical,
    isNearCritical: false,
    label: id,
  });
  const edge = (p: string, s: string, isDriving: boolean): RenderEdge => ({
    predecessorId: p,
    successorId: s,
    type: 'FS',
    isDriving,
  });
  const acts = [act('a', 0, true), act('b', 0, true), act('c', 2, true), act('d', 5, false)];
  const edges = [edge('a', 'b', true), edge('b', 'c', true), edge('c', 'd', true)];
  expect('spine: rows hold the critical activities only', criticalSpine(acts, edges).rows, 2);
  expect('spine: one critical link leaves its row', criticalSpine(acts, edges).linksOffRow, 1);
  expect('spine: a link to a non-critical end is not counted', criticalSpine(acts, edges).links, 2);
  expect(
    'spine: a non-driving link is not counted',
    criticalSpine(acts, [edge('a', 'c', false)]).links,
    0,
  );

  const t = travelStats(acts, [edge('a', 'b', true), edge('a', 'd', true)]);
  expect('travel: mean', t.mean, 2.5);
  expect('travel: max', t.max, 5);
  expect('travel: links', t.links, 2);
  expect('travel: no links is zero, not NaN', travelStats(acts, []).mean, 0);
  return done;
}
