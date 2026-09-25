/**
 * **The node-to-node shapes a link may take** (node-to-node links M1-T2, spec §4.2).
 *
 * Every candidate starts on a port of the predecessor's end and finishes on a port of the
 * successor's end ({@link LinkEnd}). No candidate bends inside a glyph: each is built, then dropped
 * if an end segment travels in a direction its port forbids, or if a bend next to a port is closer
 * than the stub rule allows. That is the whole of the fix for the three defects the spec records —
 * today's elbow is an HVH whose first leg is 4–12 px (under the 14 px stub), and today's arrival from
 * the wrong side is a forbidden direction.
 *
 * | Shape   | Points                    | Made when                                              |
 * | ------- | ------------------------- | ------------------------------------------------------ |
 * | **V**   | P → S                     | different lanes, same x (within half a pixel)          |
 * | **H**   | P → S                     | same lane                                              |
 * | **VH**  | P → (Px, Sy) → S          | different lanes                                        |
 * | **HV**  | P → (Sx, Py) → S          | different lanes                                        |
 * | **HVH** | P → (c, Py) → (c, Sy) → S | different lanes; up to five `c` between the stubs, and |
 * |         |                           | the two outside them                                   |
 * | **VHV** | P → (Px, g) → (Sx, g) → S | always; `g` a lane boundary (the gutter), up to four   |
 *
 * The order above is the tie-break (spec D-2's last term), with VH before HV (D-3), so among equal
 * scores a hub's links share a vertical stem from its node: the reference picture's bus.
 *
 * **At most fifteen per link** ({@link MAX_ROUTE_CANDIDATES}), and a milestone does not raise that:
 * each shape takes the port its first and last segments need (horizontal at the side anchor,
 * vertical at the centre), so a shape is built once, not once per port pair.
 */
import {
  OPPOSITE_DIR,
  portFor,
  predecessorStub,
  successorStub,
  type LinkDir,
  type LinkEnd,
  type LinkPort,
} from './link-ports';
import { LANE_HEIGHT, type Point, type Viewport } from './render-model';

/**
 * `fallback` is not a candidate: it is what `routeNodeToNode` returns when no shape obeys both ports,
 * which happens only when the two anchors coincide (two abutting bars sharing one node, ADR-0157).
 * It is named so a reader of the route can tell it apart rather than mistaking it for a choice.
 */
export type RouteShape = 'V' | 'H' | 'VH' | 'HV' | 'HVH' | 'VHV' | 'fallback';

export interface RouteCandidate {
  shape: RouteShape;
  line: Point[];
  /** Position in the fixed candidate order: the last tie-break. */
  order: number;
}

/** V, H, VH, HV, seven HVH, four VHV. Pinned by `link-candidates.test.ts`. */
export const MAX_ROUTE_CANDIDATES = 15;

const EPS = 0.5;

function dirOf(a: Point, b: Point): LinkDir | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) <= 1e-6 && Math.abs(dy) <= 1e-6) return null;
  if (Math.abs(dy) <= 1e-6) return dx > 0 ? 'E' : 'W';
  if (Math.abs(dx) <= 1e-6) return dy > 0 ? 'S' : 'N';
  return null;
}

/**
 * Whether `line` obeys both ports: its first segment travels a direction the predecessor port
 * allows and its last arrives from a side the successor port allows, and — if the line bends — its
 * end segments clear the stub rule. Exported so the property test and the scorer can reuse the one
 * definition of a valid route.
 */
export function obeysPorts(line: readonly Point[], pred: LinkPort, succ: LinkPort): boolean {
  if (line.length < 2) return false;
  const first = dirOf(line[0]!, line[1]!);
  const last = dirOf(line[line.length - 2]!, line[line.length - 1]!);
  if (first === null || last === null) return false;
  if (!pred.allowed.has(first)) return false;
  if (!succ.allowed.has(OPPOSITE_DIR[last])) return false;
  if (line.length === 2) return true; // a straight line runs through both centres; nothing is hidden
  const firstLen = Math.abs(line[1]!.x - line[0]!.x) + Math.abs(line[1]!.y - line[0]!.y);
  const n = line.length;
  const lastLen =
    Math.abs(line[n - 1]!.x - line[n - 2]!.x) + Math.abs(line[n - 1]!.y - line[n - 2]!.y);
  return (
    firstLen >= predecessorStub(pred.reach) - 1e-6 && lastLen >= successorStub(succ.reach) - 1e-6
  );
}

/** The y of the boundary below lane `lane`, in screen space (ADR-0150's gutter datum). */
export function gutterBelow(lane: number, view: Viewport): number {
  return view.originY + (lane + 1) * LANE_HEIGHT;
}

/**
 * Whether screen-y `y` is a lane boundary: {@link gutterBelow}'s inverse, and the test
 * `packGutterChannels` uses to find a gutter run by geometry.
 */
export function isLaneBoundary(y: number, view: Viewport): boolean {
  const r = (((y - view.originY) % LANE_HEIGHT) + LANE_HEIGHT) % LANE_HEIGHT;
  return r <= 0.5 || r >= LANE_HEIGHT - 0.5;
}

/**
 * Every valid candidate for one link, in the fixed order. `fromLane`/`toLane` are the two
 * activities' lanes, which decide same-lane shapes and which gutters exist.
 */
export function routeCandidates(
  pred: LinkEnd,
  succ: LinkEnd,
  fromLane: number,
  toLane: number,
  view: Viewport,
): RouteCandidate[] {
  const out: RouteCandidate[] = [];
  let order = 0;
  const offer = (
    shape: RouteShape,
    p: LinkPort | null,
    s: LinkPort | null,
    build: (P: Point, S: Point) => Point[] | null,
  ): void => {
    const at = order;
    order += 1;
    if (!p || !s) return;
    const line = build(p.point, s.point);
    if (!line || !obeysPorts(line, p, s)) return;
    out.push({ shape, line, order: at });
  };
  const pV = portFor(pred, 'V');
  const pH = portFor(pred, 'H');
  const sV = portFor(succ, 'V');
  const sH = portFor(succ, 'H');
  const sameLane = fromLane === toLane;

  // V: one vertical, node to node.
  offer('V', pV, sV, (P, S) =>
    !sameLane && Math.abs(P.x - S.x) <= EPS ? [P, { x: P.x, y: S.y }] : null,
  );
  // H: one horizontal in a shared lane.
  offer('H', pH, sH, (P, S) =>
    sameLane && Math.abs(P.x - S.x) > EPS ? [P, { x: S.x, y: P.y }] : null,
  );
  // VH: down (or up) from the predecessor, then along the successor's lane into its port.
  offer('VH', pV, sH, (P, S) =>
    !sameLane && Math.abs(P.x - S.x) > EPS ? [P, { x: P.x, y: S.y }, S] : null,
  );
  // HV: along the predecessor's lane, then down (or up) into the successor's port.
  offer('HV', pH, sV, (P, S) =>
    !sameLane && Math.abs(P.x - S.x) > EPS ? [P, { x: S.x, y: P.y }, S] : null,
  );
  // HVH: a vertical between the two stubs. Forward (the successor later in time) gives a range and
  // five positions in it; then, always, one position outside both ends on each side, for an SS or
  // FF that goes round. A backward run (east then west) is never built: its first leg would turn
  // back on itself.
  //
  // **The outside positions are offered on a forward link too** (product owner, 2026-09-25). An FF
  // into a finish node can only arrive from the east, the north or the south — never from the west,
  // over its own bar — so every between position is illegal for it and, before this, its only way
  // in was up or down the node's vertical. When the link leaving that node needs the same vertical,
  // the two run opposite ways on one stroke; going round and coming back in from the east is the
  // route that shares nothing with it.
  const hvhAt = (P: Point, S: Point): number[] => {
    if (!pH || !sH) return [];
    const lo = P.x + predecessorStub(pH.reach);
    const hi = S.x - successorStub(sH.reach);
    const outside = [
      Math.min(P.x - predecessorStub(pH.reach), S.x - successorStub(sH.reach)),
      Math.max(P.x + predecessorStub(pH.reach), S.x + successorStub(sH.reach)),
    ];
    if (S.x > P.x && hi >= lo) {
      const span = hi - lo;
      const between = [lo, lo + span / 4, lo + span / 2, lo + (3 * span) / 4, hi].filter(
        (c, i, all) => all.findIndex((d) => Math.abs(d - c) <= EPS) === i,
      );
      // Five slots each, so an outside position never shifts a between one's place in the order.
      return [...between, ...Array<undefined>(5 - between.length), ...outside] as number[];
    }
    return outside;
  };
  const hvh = pH && sH && !sameLane ? hvhAt(pH.point, sH.point) : [];
  for (let k = 0; k < 7; k += 1) {
    const c = hvh[k];
    offer('HVH', pH, sH, (P, S) =>
      c === undefined ? null : [P, { x: c, y: P.y }, { x: c, y: S.y }, S],
    );
  }
  // VHV: down to a gutter, along it, up (or down) into the successor. For two lanes the gutter
  // below the upper lane and the one above the lower lane (one boundary when they are adjacent),
  // then the two OUTSIDE them — above the upper lane and below the lower; for one lane, below and
  // above it.
  //
  // **The outer two exist so a link can arrive at a node from the side its neighbours do not use**
  // (product owner, 2026-09-25). A finish node whose successor is two days later has only one way
  // out at a whole-plan zoom — down, because the gap is under the stub rule — and a link into that
  // node from a lane below could only arrive from below, up the same vertical: two arrowheads on one
  // stroke pointing at each other. With a gutter above the node's lane it can come in over the top,
  // which `chooseRoutesByCrossing` now prefers (opposed overlaps rank above crossings). The between
  // gutters stay first, so an outer one wins only on a score, never on the tie-break.
  const upper = Math.min(fromLane, toLane);
  const lower = Math.max(fromLane, toLane);
  const between =
    lower - upper === 1
      ? [gutterBelow(upper, view)]
      : [gutterBelow(upper, view), gutterBelow(lower - 1, view)];
  const gutters = sameLane
    ? [gutterBelow(fromLane, view), gutterBelow(fromLane - 1, view)]
    : [...between, gutterBelow(upper - 1, view), gutterBelow(lower, view)];
  for (let k = 0; k < 4; k += 1) {
    const g = gutters[k];
    offer('VHV', pV, sV, (P, S) =>
      g === undefined || Math.abs(P.x - S.x) <= EPS
        ? null
        : [P, { x: P.x, y: g }, { x: S.x, y: g }, S],
    );
  }
  return out;
}
