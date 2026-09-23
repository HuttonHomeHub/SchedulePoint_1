import { laneOverlapPairs } from './lane-overlap';
import {
  activityRect,
  barGlyphKind,
  NODE_RADIUS,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from './render-model';
import { routeFrame, type RouteFrameScene } from './route-frame';

/**
 * **What a lane layout costs a reader** (NetPoint-layout M4-T2, spec §4.5).
 *
 * `x` is fixed by time, so a layout is the vector of `laneIndex`. It is scored on a lexicographic
 * vector in the product owner's order, lower is better on every term:
 *
 * 1. `overlaps` — same-row drawn-span overlap pairs, from {@link laneOverlapPairs}: the one sweep the
 *    overlap cue and the auto-resolve already share.
 * 2. `occluded` — links with a horizontal leg running behind a bar that is **not** one of their two
 *    endpoints. Attributed by the endpoints' **ids**, never by position: a position test is
 *    order-dependent where bars touch end to end (M0-T4, `docs/TECH_DEBT.md` #373).
 * 3. `crossings` — a horizontal meeting a vertical strictly inside both, on distinct links.
 * 4. `contacts` — **unlinked** horizontally adjacent bars in one row whose end glyphs touch, which
 *    reads as a link that is not there. Added on CQ-1's answer, 2026-09-23.
 * 5. `−sameRow` — links whose two ends share a row (a chain read along one row).
 * 6. `travel` — Σ |Δlane| over links.
 * 7. `rows` — the highest lane in use, plus one.
 *
 * **Scored on the router the painter uses**: the lines come from {@link routeFrame}, so a layout is
 * judged on the picture it produces rather than on a proxy of it (ADR-0149's lesson).
 */
export interface LayoutObjective {
  overlaps: number;
  occluded: number;
  crossings: number;
  contacts: number;
  sameRow: number;
  travel: number;
  rows: number;
}

/** The zoom a layout is judged at: the M0 reference, where a bar's length is its days × 4 px. */
export const LAYOUT_REFERENCE_PX_PER_DAY = 4;

/** The scene fields the objective reads. The lanes come from `activities[].laneIndex`. */
export type LayoutScene = Pick<
  RouteFrameScene,
  'activities' | 'edges' | 'dataDate' | 'isWorkingDay'
>;

/** Crossing tolerance, the harness's (`netpoint-evaluate.ts`), so FC-N0 can hold exactly. */
const EPS = 0.001;
/** Two glyphs closer than half a pixel touch (`netpoint-row-probe.ts`). */
const CONTACT_EPS = 0.5;
const EPS_Y = 0.01;
const EPS_X = 0.5;

/**
 * Compare two objectives in the product owner's order. Negative when `a` is better. `sameRow` is
 * the one term where more is better.
 */
export function compareObjectives(a: LayoutObjective, b: LayoutObjective): number {
  return (
    a.overlaps - b.overlaps ||
    a.occluded - b.occluded ||
    a.crossings - b.crossings ||
    a.contacts - b.contacts ||
    b.sameRow - a.sameRow ||
    a.travel - b.travel ||
    a.rows - b.rows
  );
}

/** The whole plan's routed lines at the reference zoom, each with the ids it connects. */
export function layoutLines(
  scene: LayoutScene,
  pxPerDay = LAYOUT_REFERENCE_PX_PER_DAY,
): { line: Point[]; pred: string; succ: string }[] {
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const all = new Set(byId.keys());
  const { lines } = routeFrame(
    { ...scene, timeTrueLinks: true, visualRefresh: true, linkRouting: true },
    view,
    all,
    byId,
    new Map(),
  );
  return [...lines].map(([edge, line]) => ({
    line,
    pred: edge.predecessorId,
    succ: edge.successorId,
  }));
}

/** Score a layout. Pure and deterministic: no clock, no randomness, no engine. */
export function evaluateLayout(
  scene: LayoutScene,
  pxPerDay = LAYOUT_REFERENCE_PX_PER_DAY,
): LayoutObjective {
  const view: Viewport = { pxPerDay, originX: 40, originY: 32 };
  const rectCache: RectCache = new Map();
  const routed = layoutLines(scene, pxPerDay);

  const bars = barsByLane(scene.activities, view, scene.dataDate, rectCache, 0);
  let occluded = 0;
  for (const { line, pred, succ } of routed)
    if (legBehindForeignBar(line, pred, succ, bars)) occluded += 1;

  return {
    overlaps: laneOverlapPairs(
      scene.activities.map((a) => ({
        id: a.id,
        laneIndex: a.laneIndex,
        start: a.earlyStart,
        finish: a.earlyFinish,
      })),
    ).length,
    occluded,
    crossings: countCrossings(routed.map((r) => r.line)),
    contacts: unlinkedContacts(scene.activities, scene.edges, view, scene.dataDate, rectCache),
    ...chainTerms(scene.activities, scene.edges),
  };
}

interface LaneBars {
  byLane: Map<number, { id: string; x0: number; x1: number }[]>;
  extent: Map<number, { top: number; bottom: number }>;
}

/** Every drawn bar, bucketed by lane, with `reach` added to each end. */
function barsByLane(
  activities: readonly RenderActivity[],
  view: Viewport,
  dataDate: string,
  rectCache: RectCache,
  reach: number | ((a: RenderActivity) => number),
): LaneBars {
  const byLane: LaneBars['byLane'] = new Map();
  const extent: LaneBars['extent'] = new Map();
  for (const a of activities) {
    const rect = activityRect(a, view, dataDate, rectCache);
    if (rect === null) continue;
    const r = typeof reach === 'number' ? reach : reach(a);
    const bar = { id: a.id, x0: rect.x - r, x1: rect.x + rect.w + r };
    const list = byLane.get(a.laneIndex);
    if (list) list.push(bar);
    else byLane.set(a.laneIndex, [bar]);
    if (!extent.has(a.laneIndex)) extent.set(a.laneIndex, { top: rect.y, bottom: rect.y + rect.h });
  }
  return { byLane, extent };
}

/** Does any horizontal leg of `line` run behind a bar that is neither of its endpoints? */
function legBehindForeignBar(
  line: readonly Point[],
  pred: string,
  succ: string,
  bars: LaneBars,
): boolean {
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    if (Math.abs(a.y - b.y) > EPS_Y) continue;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    for (const [lane, ext] of bars.extent) {
      if (a.y < ext.top - EPS_Y || a.y > ext.bottom + EPS_Y) continue;
      for (const bar of bars.byLane.get(lane) ?? []) {
        if (bar.id === pred || bar.id === succ) continue;
        if (Math.min(hi, bar.x1) - Math.max(lo, bar.x0) > EPS_X) return true;
      }
    }
  }
  return false;
}

interface Seg {
  link: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Crossings over a whole line set by sweep: each horizontal against the x-sorted verticals. A
 * crossing is the vertical's x strictly inside the horizontal and the horizontal's y strictly inside
 * the vertical, on distinct links. A zero-length segment is classified as both, as the harness does.
 */
export function countCrossings(lines: readonly (readonly Point[])[]): number {
  const h: Seg[] = [];
  const v: Seg[] = [];
  lines.forEach((pts, link) => {
    for (let k = 1; k < pts.length; k += 1) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const seg = { link, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      if (Math.abs(a.y - b.y) < EPS) h.push(seg);
      if (Math.abs(a.x - b.x) < EPS) v.push(seg);
    }
  });
  v.sort((a, b) => a.x0 - b.x0);
  const vx = Float64Array.from(v.map((s) => s.x0));
  let n = 0;
  for (const s of h) {
    const lo = Math.min(s.x0, s.x1) + EPS;
    const hi = Math.max(s.x0, s.x1) - EPS;
    for (let i = firstAbove(vx, lo); i < v.length && vx[i]! < hi; i += 1) {
      const t = v[i]!;
      if (t.link === s.link) continue;
      if (s.y0 > Math.min(t.y0, t.y1) + EPS && s.y0 < Math.max(t.y0, t.y1) - EPS) n += 1;
    }
  }
  return n;
}

/** The first index whose value is strictly greater than `value`. */
function firstAbove(sorted: Float64Array, value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Adjacent bars in one row whose end glyphs touch and which no link joins. A task's glyph is its
 * two node discs, which reach {@link NODE_RADIUS} past its ends; a milestone's diamond and an LOE or
 * summary span carry no node, so their glyph is their own rect.
 */
function unlinkedContacts(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
  view: Viewport,
  dataDate: string,
  rectCache: RectCache,
): number {
  const linked = new Set<string>();
  for (const e of edges) {
    linked.add(`${e.predecessorId}|${e.successorId}`);
    linked.add(`${e.successorId}|${e.predecessorId}`);
  }
  const { byLane } = barsByLane(activities, view, dataDate, rectCache, (a) =>
    barGlyphKind(a.type) === 'bar' ? NODE_RADIUS : 0,
  );
  let n = 0;
  for (const list of byLane.values()) {
    list.sort((a, b) => a.x0 - b.x0 || (a.id < b.id ? -1 : 1));
    for (let i = 0; i + 1 < list.length; i += 1) {
      const left = list[i]!;
      const right = list[i + 1]!;
      if (right.x0 - left.x1 < CONTACT_EPS && !linked.has(`${left.id}|${right.id}`)) n += 1;
    }
  }
  return n;
}

function chainTerms(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
): Pick<LayoutObjective, 'sameRow' | 'travel' | 'rows'> {
  const laneOf = new Map(activities.map((a) => [a.id, a.laneIndex]));
  let sameRow = 0;
  let travel = 0;
  for (const e of edges) {
    const a = laneOf.get(e.predecessorId);
    const b = laneOf.get(e.successorId);
    if (a === undefined || b === undefined) continue;
    if (a === b) sameRow += 1;
    travel += Math.abs(a - b);
  }
  let rows = 0;
  for (const lane of laneOf.values()) rows = Math.max(rows, lane + 1);
  return { sameRow, travel, rows };
}
