/**
 * **Node-to-node links M0-T1 — does a link leave and enter at its node?**
 *
 * `docs/specs/node-to-node-links/feature-spec.md` §4.9. The product owner reported that links do not
 * "come directly to the nodes"; the main session rendered three shapes of it (a bend hidden inside
 * the node, an arrival over the successor's own bar, a landing mid-bar). Nothing here counted any of
 * them, because every existing instrument measures a pair (crossings) or a leg against a bar
 * (occlusion), and a detached end is a property of **one end of one line against its own node**.
 *
 * ## What it reads
 *
 * The lines come from `routeFrame` — the painter's own route seam, which `paintScene` calls and
 * strokes (`route-frame.ts`, NetPoint-layout M4-T1). Nothing here rebuilds the routing pipeline, so
 * after M2 rewires it this probe measures the new router with no edit (the ADR-0124 lesson: a
 * measurement taken with a copy of an instrument measures the copy). The same frame is also painted
 * into `crossing-probe.ts`'s recorder, for three reasons: the text boxes (names, dates, labels) exist
 * only in the painter; crossings and occlusion are that probe's committed counters, reused rather
 * than restated; and the **control** — the painter stroked exactly as many link polylines as
 * `routeFrame` returned — would fail if the two ever disagreed about which links were drawn.
 *
 * ## The metrics (spec §4.9)
 *
 * - **Unattached end.** For each end whose anchor is a node or an embed, the end is unattached if
 *   (a) its end segment travels in a direction its kind forbids (§4.1), or (b) its end segment is
 *   followed by a bend and is shorter than the stub rule (predecessor `reach + LINK_ELBOW_RADIUS`,
 *   successor `reach + ARROWHEAD_ROUTED_PX`). (a) catches "enters over its own bar" and "lands
 *   mid-bar"; (b) catches "floats beside the node". A line with no bend is never unattached.
 * - **False junction.** A segment passing within `NODE_REACH_PX` of a node centre that is not one of
 *   the link's own two anchors **and does not belong to a sibling**: another successor of the link's
 *   predecessor, or another predecessor of its successor. That exemption is spec D-4's bus (product
 *   owner, 2026-09-25): a stem from one node passing its own successors' nodes on one x is the
 *   reference picture, and reads as linking to them because it does. The M0 metric counted it; the
 *   baseline was re-measured with this definition so the comparison stays like for like.
 * - **Overlap.** Collinear shared length above 0.5 px between two links that share no anchor, on a
 *   lane centre-line or a vertical (gutter runs are separated by `packGutterChannels` and skipped).
 * - **Text crossing.** A link segment meeting the box of a painted name or date.
 * - **Labels placed.** Gap labels and lag plates the painter actually drew.
 */
import { createHash } from 'node:crypto';

import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant';
import { rowSlots, screenYOfLane, wrappedNameYs } from '../src/features/tsld/render/geometry';
import {
  DEFAULT_VIEW_TOGGLES,
  paintScene,
  type TsldScene,
} from '../src/features/tsld/render/paint';
import {
  activityRect,
  ARROWHEAD_ROUTED_PX,
  barGlyphKind,
  isMilestone,
  LANE_HEIGHT,
  LINK_ELBOW_RADIUS,
  NODE_REACH_PX,
  type Point,
  type RectCache,
  type RenderActivity,
  type RenderEdge,
  type Viewport,
} from '../src/features/tsld/render/render-model';
import { routeFrame } from '../src/features/tsld/render/route-frame';

import {
  countCrossings,
  countOcclusions,
  linkPaths,
  PALETTE,
  recordingCtx,
  sceneFor,
  smallPlanLayouts,
  unit300Layouts,
  type Layout,
  type RecordedText,
} from './crossing-probe';

export type Dir = 'E' | 'W' | 'N' | 'S';

/** What an end is attached to, which decides the directions it allows and its reach (spec §4.1). */
export type EndKind =
  | 'start-node'
  | 'finish-node'
  | 'embed'
  | 'milestone-left'
  | 'milestone-right'
  | 'milestone-centre'
  | 'span-start'
  | 'span-finish';

export interface EndSpec {
  kind: EndKind;
  /** How far the end's glyph covers the line, in px. */
  reach: number;
  /**
   * For a predecessor end, the directions the first segment may TRAVEL. For a successor end, the
   * SIDES the last segment may arrive from. The two tables are the same (a start node is left or
   * entered on its W, N or S side), so one set serves both readings.
   */
  allowed: ReadonlySet<Dir>;
}

const WNS: ReadonlySet<Dir> = new Set(['W', 'N', 'S']);
const ENS: ReadonlySet<Dir> = new Set(['E', 'N', 'S']);
const NS: ReadonlySet<Dir> = new Set(['N', 'S']);

/**
 * Classify an anchor against its activity (spec §4.1). An anchor within half a pixel of a bar's edge
 * is that edge's node; strictly inside is an embed (a lag or lead). A milestone is classified by which
 * part of its glyph box the anchor sits on. An LOE or summary end behaves as a node with no disc.
 */
export function endSpecOf(
  activity: RenderActivity,
  anchor: Point,
  rect: { x: number; w: number },
): EndSpec {
  const left = Math.abs(anchor.x - rect.x) <= 0.5;
  const right = Math.abs(anchor.x - (rect.x + rect.w)) <= 0.5;
  if (isMilestone(activity.type)) {
    if (left) return { kind: 'milestone-left', reach: 0, allowed: new Set(['W']) };
    if (right) return { kind: 'milestone-right', reach: 0, allowed: new Set(['E']) };
    return { kind: 'milestone-centre', reach: 0, allowed: NS };
  }
  const glyph = barGlyphKind(activity.type);
  if (glyph !== 'bar') {
    return left || !right
      ? { kind: 'span-start', reach: 0, allowed: WNS }
      : { kind: 'span-finish', reach: 0, allowed: ENS };
  }
  if (left) return { kind: 'start-node', reach: NODE_REACH_PX, allowed: WNS };
  if (right) return { kind: 'finish-node', reach: NODE_REACH_PX, allowed: ENS };
  // `ATTACH_DOT_R` (paint.ts) is the dot's radius; an embed covers that much of the line.
  return { kind: 'embed', reach: 2, allowed: NS };
}

interface Run {
  dir: Dir;
  len: number;
}

/**
 * The line as maximal straight runs: zero-length segments dropped, consecutive segments in one
 * direction merged. A diagonal run is reported as `null` direction and counted separately.
 */
export function runsOf(line: readonly Point[]): { runs: Run[]; diagonal: number } {
  const runs: Run[] = [];
  let diagonal = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) continue;
    let dir: Dir;
    if (Math.abs(dy) < 1e-6) dir = dx > 0 ? 'E' : 'W';
    else if (Math.abs(dx) < 1e-6) dir = dy > 0 ? 'S' : 'N';
    else {
      diagonal += 1;
      continue;
    }
    const len = Math.abs(dx) + Math.abs(dy);
    const last = runs.at(-1);
    if (last && last.dir === dir) last.len += len;
    else runs.push({ dir, len });
  }
  return { runs, diagonal };
}

const OPPOSITE: Record<Dir, Dir> = { E: 'W', W: 'E', N: 'S', S: 'N' };

export type Unattached = 'direction' | 'stub';

/**
 * Judge one link's two ends (spec §4.9). Returns the reason each end is unattached, or null.
 *
 * The successor end's direction is converted to the SIDE it arrives from: a last run travelling east
 * arrives from the west.
 */
export function judgeEnds(
  line: readonly Point[],
  pred: EndSpec,
  succ: EndSpec,
): { pred: Unattached | null; succ: Unattached | null } {
  const { runs } = runsOf(line);
  // A straight line runs through both centres; nothing is hidden and no side is wrong in a way a
  // reader can see (spec §4.1: "A line with no bend is exempt").
  if (runs.length <= 1) return { pred: null, succ: null };
  const first = runs[0]!;
  const last = runs.at(-1)!;
  const predVerdict: Unattached | null = !pred.allowed.has(first.dir)
    ? 'direction'
    : first.len < pred.reach + LINK_ELBOW_RADIUS
      ? 'stub'
      : null;
  const side = OPPOSITE[last.dir];
  const succVerdict: Unattached | null = !succ.allowed.has(side)
    ? 'direction'
    : last.len < succ.reach + ARROWHEAD_ROUTED_PX
      ? 'stub'
      : null;
  return { pred: predVerdict, succ: succVerdict };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A painted text's box, from its anchor, alignment and baseline. */
function textBox(t: RecordedText): { x0: number; x1: number; y0: number; y1: number } {
  const w = t.width;
  const h = t.fontPx;
  const x0 =
    t.align === 'center' ? t.x - w / 2 : t.align === 'right' || t.align === 'end' ? t.x - w : t.x;
  const y0 =
    t.baseline === 'middle'
      ? t.y - h / 2
      : t.baseline === 'top' || t.baseline === 'hanging'
        ? t.y
        : t.baseline === 'bottom'
          ? t.y - h
          : t.y - h * 0.8; // alphabetic
  return { x0, x1: x0 + w, y0, y1: y0 + h };
}

/** Does an axis-aligned segment meet an axis-aligned box's interior? */
function segmentMeetsBox(a: Point, b: Point, box: ReturnType<typeof textBox>): boolean {
  const sx0 = Math.min(a.x, b.x);
  const sx1 = Math.max(a.x, b.x);
  const sy0 = Math.min(a.y, b.y);
  const sy1 = Math.max(a.y, b.y);
  return sx0 < box.x1 && sx1 > box.x0 && sy0 < box.y1 && sy1 > box.y0;
}

export type TextKind = 'name' | 'name-wrapped' | 'date' | 'milestone-date' | 'centre';

const DATE_TEXT = /^\d{1,2} [A-Z][a-z]{2}$/;

/**
 * Which row band a painted text sits on, and so what it is. Throws on a text in no band: the probe
 * would otherwise count a crossing of something it cannot name.
 */
export function textKindOf(t: RecordedText, view: Viewport): TextKind {
  const lane0 = screenYOfLane(0, view);
  const lane = Math.floor((t.y - lane0) / LANE_HEIGHT);
  const slots = rowSlots(screenYOfLane(lane, view));
  const at = (y: number): boolean => Math.abs(t.y - y) < 0.5;
  if (at(slots.nameY)) return 'name';
  const wrapped = wrappedNameYs(slots);
  if (at(wrapped.upper) || at(wrapped.lower)) return 'name-wrapped';
  if (at(slots.belowY)) {
    if (t.align === 'center') return DATE_TEXT.test(t.text) ? 'milestone-date' : 'centre';
    return 'date';
  }
  throw new Error(
    `text "${t.text}" at y=${t.y.toFixed(2)} is on no row band (lane ${lane}); refusing to classify it`,
  );
}

const GAP_LABEL = /^\d+d$|^\d+ cal d$/;
const LAG_PLATE = /^[+−]\d/;

export interface AttachmentReading {
  edges: number;
  /** Lines `routeFrame` returned — the denominator. */
  links: number;
  /** Link polylines the painter stroked. Must equal `links` (the control). */
  painted: number;
  unattachedEnds: number;
  unattachedLinks: number;
  byReason: Record<string, number>;
  /** Up to five examples, for the record: `pred->succ (type) end:reason`. */
  examples: string[];
  falseJunctions: number;
  falseJunctionLinks: number;
  overlaps: number;
  /** Link pairs running opposite ways along one track, shared end or not. */
  opposed: number;
  /** The opposed pairs by how the two links meet: at one node (arrive-leave), or not at all. */
  opposedByRole: Record<string, number>;
  textCrossings: number;
  /**
   * `textCrossings` split by what the text is (links-and-labels M0-T2). Classified by the text's row
   * band from `rowSlots`, not by the painter's own kinds: a name sits on the name row, a wrapped name
   * on one of `wrappedNameYs`' two lines, and everything on the row below the bar is a date (left or
   * right aligned), a milestone's single date (centred, a date) or the centre item (centred, not a
   * date). M1 replaces this with the layout module's own kinds; until then a text outside every band
   * throws rather than being counted as something it is not.
   */
  textCrossingsByKind: Record<TextKind, number>;
  /** `textCrossings` by the orientation of the first segment that met the text: `h` or `v`. */
  textCrossingsByOrientation: { h: number; v: number };
  /** Lag plates whose text meets a name or date. */
  platesOnText: number;
  gapLabels: number;
  lagPlates: number;
  crossings: number;
  crossingsPerLink: number;
  foreignOccludedLinks: number;
  diagonal: number;
  bends: number;
  fingerprint: string;
}

/**
 * Read one scene at one framing. The size must hold the whole plan, so nothing is culled and the
 * painted link count can be held to the routed count exactly.
 */
export function readAttachment(
  scene: TsldScene,
  view: Viewport,
  size: { width: number; height: number },
): AttachmentReading {
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const visible = new Set(byId.keys());
  const rectCache: RectCache = new Map();
  const frame = routeFrame(scene, view, visible, byId, rectCache);

  const { ctx, paths, texts } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  // A lag run (ADR-0052 M5) is stroked in the link ink too, dashed and on its bar. It is not a
  // link, so it is set aside by its dash and held to `routeFrame`'s own count of lag runs; a dashed
  // path that is NOT a lag run would break that equality and throw rather than be dropped quietly.
  const strokedInLinkInk = linkPaths(paths);
  const painted = strokedInLinkInk.filter((p) => !p.dashed);
  const lagRunsPainted = strokedInLinkInk.length - painted.length;
  if (lagRunsPainted !== (frame.lagRuns?.length ?? 0)) {
    throw new Error(
      `${lagRunsPainted} dashed paths in a link ink against ${frame.lagRuns?.length ?? 0} lag runs. ` +
        'Something other than a lag run is dashed in a link ink; refusing to set it aside.',
    );
  }
  // **The point-by-point control** (links-and-labels M0-T2). Equal counts are not equal lines: a probe
  // that routed differently from the painter (after M2, without the painter's text index) would still
  // pass a count. So the routed lines and the stroked link polylines must be the same multiset of
  // point sequences, to 0.01 px.
  const keyOf = (pts: readonly Point[]): string =>
    pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const routedKeys = [...frame.lines.values()].map(keyOf).sort();
  const paintedKeys = painted.map((p) => keyOf(p.pts)).sort();
  const firstDiff = routedKeys.findIndex((k, i) => k !== paintedKeys[i]);
  if (routedKeys.length !== paintedKeys.length || firstDiff >= 0) {
    throw new Error(
      `the probe's routes are not the painter's lines (${routedKeys.length} routed, ` +
        `${paintedKeys.length} painted; first difference at sorted index ${firstDiff}). Refusing ` +
        'to measure a copy of the router.',
    );
  }
  const { crossings, diagonal } = countCrossings(painted);
  const occlusion = countOcclusions(painted, scene, view);

  // Node centres, for false junctions: both ends of every bar-glyph activity.
  const nodeCentres: { id: string; point: Point }[] = [];
  for (const a of scene.activities) {
    if (barGlyphKind(a.type) !== 'bar') continue;
    const r = activityRect(a, view, scene.dataDate, rectCache);
    if (!r) continue;
    const cy = r.y + r.h / 2;
    nodeCentres.push(
      { id: a.id, point: { x: r.x, y: cy } },
      { id: a.id, point: { x: r.x + r.w, y: cy } },
    );
  }

  const byReason: Record<string, number> = {};
  const examples: string[] = [];
  let unattachedEnds = 0;
  let unattachedLinks = 0;
  let falseJunctions = 0;
  let falseJunctionLinks = 0;
  let bends = 0;
  const entries: { edge: RenderEdge; line: Point[]; ends: [Point, Point] }[] = [];
  const digest = createHash('sha256');
  const succsOf = new Map<string, Set<string>>();
  const predsOf = new Map<string, Set<string>>();
  for (const e of scene.edges) {
    if (!succsOf.has(e.predecessorId)) succsOf.set(e.predecessorId, new Set());
    succsOf.get(e.predecessorId)!.add(e.successorId);
    if (!predsOf.has(e.successorId)) predsOf.set(e.successorId, new Set());
    predsOf.get(e.successorId)!.add(e.predecessorId);
  }
  for (const [edge, line] of frame.lines) {
    for (const pt of line) digest.update(`${pt.x.toFixed(2)},${pt.y.toFixed(2)};`);
    digest.update('|');
    const pred = byId.get(edge.predecessorId)!;
    const succ = byId.get(edge.successorId)!;
    const predRect = activityRect(pred, view, scene.dataDate, rectCache);
    const succRect = activityRect(succ, view, scene.dataDate, rectCache);
    const from = line[0]!;
    const to = line.at(-1)!;
    entries.push({ edge, line, ends: [from, to] });
    const { runs } = runsOf(line);
    bends += Math.max(0, runs.length - 1);
    if (predRect && succRect) {
      const verdict = judgeEnds(
        line,
        endSpecOf(pred, from, predRect),
        endSpecOf(succ, to, succRect),
      );
      const bad = [
        verdict.pred ? `pred:${verdict.pred}` : null,
        verdict.succ ? `succ:${verdict.succ}` : null,
      ].filter((v): v is string => v !== null);
      if (bad.length > 0) {
        unattachedLinks += 1;
        unattachedEnds += bad.length;
        for (const b of bad) byReason[b] = (byReason[b] ?? 0) + 1;
        if (examples.length < 5) {
          examples.push(
            `${edge.predecessorId}->${edge.successorId} (${edge.type}) ${bad.join(', ')}`,
          );
        }
      }
    }
    let hit = 0;
    const siblings = new Set([
      ...(succsOf.get(edge.predecessorId) ?? []),
      ...(predsOf.get(edge.successorId) ?? []),
    ]);
    for (const { id, point: c } of nodeCentres) {
      if (siblings.has(id)) continue;
      if (
        Math.hypot(c.x - from.x, c.y - from.y) < 0.5 ||
        Math.hypot(c.x - to.x, c.y - to.y) < 0.5
      ) {
        continue;
      }
      for (let i = 1; i < line.length; i += 1) {
        if (distToSegment(c, line[i - 1]!, line[i]!) < NODE_REACH_PX) {
          hit += 1;
          break;
        }
      }
    }
    falseJunctions += hit;
    if (hit > 0) falseJunctionLinks += 1;
  }

  // Overlaps: collinear shared length between links that share no anchor.
  const near = (p: Point, q: Point): boolean => Math.hypot(p.x - q.x, p.y - q.y) < 0.5;
  const shareEnd = (a: (typeof entries)[number], b: (typeof entries)[number]): boolean =>
    a.ends.some((p) => b.ends.some((q) => near(p, q)));
  const laneCentre = (y: number): boolean => {
    const off = (((y - view.originY - LANE_HEIGHT / 2) % LANE_HEIGHT) + LANE_HEIGHT) % LANE_HEIGHT;
    return off < 0.5 || off > LANE_HEIGHT - 0.5;
  };
  type Span = { link: number; at: number; lo: number; hi: number; dir: 1 | -1 };
  const horizontal = new Map<string, Span[]>();
  const vertical = new Map<string, Span[]>();
  entries.forEach((e, link) => {
    for (let i = 1; i < e.line.length; i += 1) {
      const a = e.line[i - 1]!;
      const b = e.line[i]!;
      if (Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6) {
        if (!laneCentre(a.y)) continue;
        const key = a.y.toFixed(2);
        const list = horizontal.get(key) ?? [];
        list.push({
          link,
          at: a.y,
          lo: Math.min(a.x, b.x),
          hi: Math.max(a.x, b.x),
          dir: b.x > a.x ? 1 : -1,
        });
        horizontal.set(key, list);
      } else if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6) {
        const key = a.x.toFixed(2);
        const list = vertical.get(key) ?? [];
        list.push({
          link,
          at: a.x,
          lo: Math.min(a.y, b.y),
          hi: Math.max(a.y, b.y),
          dir: b.y > a.y ? 1 : -1,
        });
        vertical.set(key, list);
      }
    }
  });
  const overlapping = new Set<string>();
  // Opposed: two links on one track running opposite ways, SHARED END OR NOT — the product owner's
  // report on web-v0.150.0 was exactly a shared end (links rising into a finish node up the vertical
  // its successor link came down), which the overlap count above exempts as a bus.
  const opposing = new Set<string>();
  const opposedByRole: Record<string, number> = {};
  for (const bucket of [...horizontal.values(), ...vertical.values()]) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const s = bucket[i]!;
        const t = bucket[j]!;
        if (s.link === t.link) continue;
        if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) <= 0.5) continue;
        if (s.dir !== t.dir) {
          const key = s.link < t.link ? `${s.link}:${t.link}` : `${t.link}:${s.link}`;
          if (!opposing.has(key)) {
            opposing.add(key);
            const [a, b] = [entries[s.link]!, entries[t.link]!];
            const role =
              near(a.ends[1], b.ends[0]) || near(b.ends[1], a.ends[0])
                ? 'arrive-leave'
                : near(a.ends[0], b.ends[0])
                  ? 'same-source'
                  : near(a.ends[1], b.ends[1])
                    ? 'same-target'
                    : 'unrelated';
            opposedByRole[role] = (opposedByRole[role] ?? 0) + 1;
          }
        }
        if (shareEnd(entries[s.link]!, entries[t.link]!)) continue;
        overlapping.add(s.link < t.link ? `${s.link}:${t.link}` : `${t.link}:${s.link}`);
      }
    }
  }

  let gapLabels = 0;
  let lagPlates = 0;
  const boxes: ReturnType<typeof textBox>[] = [];
  const kinds: TextKind[] = [];
  const plateBoxes: ReturnType<typeof textBox>[] = [];
  for (const t of texts) {
    if (LAG_PLATE.test(t.text)) {
      lagPlates += 1;
      plateBoxes.push(textBox(t));
    } else if (GAP_LABEL.test(t.text)) gapLabels += 1;
    else {
      boxes.push(textBox(t));
      kinds.push(textKindOf(t, view));
    }
  }
  // A plate's TEXT meeting a name or date (node-to-node links M3, the UX gate's finding): the one
  // text-on-text case the line-segment count above cannot see, because a plate is not a segment.
  // Text boxes are the ink's, one font size high, so a graze into a row's leading does not count.
  let platesOnText = 0;
  for (const p of plateBoxes) {
    if (boxes.some((b) => p.x0 < b.x1 && b.x0 < p.x1 && p.y0 < b.y1 && b.y0 < p.y1)) {
      platesOnText += 1;
    }
  }
  let textCrossings = 0;
  const textCrossingsByKind: Record<TextKind, number> = {
    name: 0,
    'name-wrapped': 0,
    date: 0,
    'milestone-date': 0,
    centre: 0,
  };
  const textCrossingsByOrientation = { h: 0, v: 0 };
  for (const e of entries) {
    boxes.forEach((box, b) => {
      for (let i = 1; i < e.line.length; i += 1) {
        const a = e.line[i - 1]!;
        const c = e.line[i]!;
        if (segmentMeetsBox(a, c, box)) {
          textCrossings += 1;
          textCrossingsByKind[kinds[b]!] += 1;
          textCrossingsByOrientation[Math.abs(a.y - c.y) < 1e-6 ? 'h' : 'v'] += 1;
          break;
        }
      }
    });
  }

  return {
    edges: scene.edges.length,
    links: frame.lines.size,
    painted: painted.length,
    unattachedEnds,
    unattachedLinks,
    byReason,
    examples,
    falseJunctions,
    falseJunctionLinks,
    overlaps: overlapping.size,
    opposed: opposing.size,
    opposedByRole,
    textCrossings,
    textCrossingsByKind,
    textCrossingsByOrientation,
    platesOnText,
    gapLabels,
    lagPlates,
    crossings,
    crossingsPerLink: painted.length === 0 ? 0 : crossings / painted.length,
    foreignOccludedLinks: occlusion.foreignLinks,
    diagonal,
    bends,
    fingerprint: digest.digest('hex').slice(0, 12),
  };
}

/**
 * **FC-T5 on the fixtures**: route the frame with `scene.edges` in `runs` seeded shuffles and
 * return how many orders gave any link a different line. Lines are keyed by the link, never by
 * position, so a shuffle that changes only the order of the map is not a difference.
 */
export function shuffleDifferences(scene: TsldScene, view: Viewport, runs: number): number {
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const visible = new Set(byId.keys());
  const keyOf = (e: RenderEdge): string => `${e.predecessorId}>${e.successorId}:${e.type}`;
  const linesOf = (edges: readonly RenderEdge[]): Map<string, string> => {
    const frame = routeFrame({ ...scene, edges: [...edges] }, view, visible, byId, new Map());
    const out = new Map<string, string>();
    for (const [edge, line] of frame.lines) {
      out.set(keyOf(edge), line.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';'));
    }
    return out;
  };
  const reference = linesOf(scene.edges);
  let seed = 2026;
  let differing = 0;
  for (let run = 0; run < runs; run += 1) {
    const order = [...scene.edges];
    for (let i = order.length - 1; i > 0; i -= 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    const got = linesOf(order);
    if ([...reference].some(([k, v]) => got.get(k) !== v)) differing += 1;
  }
  return differing;
}

// ── The brief's fixture ──────────────────────────────────────────────────────────────────────────

const act = (
  id: string,
  lane: number,
  start: string,
  finish: string,
  over: Partial<RenderActivity> = {},
): RenderActivity => ({
  id,
  type: 'TASK',
  label: id,
  earlyStart: start,
  earlyFinish: finish,
  isCritical: false,
  isNearCritical: false,
  laneIndex: lane,
  ...over,
});

/**
 * **The two cases the brief rendered, plus the shapes around them** (spec §4.9 "a new committed
 * fixture"). Every date is chosen, so the picture is the same on every run:
 *
 * - `Excavate → Foundations`: FS across lanes with a three-day wait (the product owner's screenshot,
 *   `gfdsa → ccfcc`): today's elbow sits a gap beside the node, the bend hidden in the disc.
 * - `Foundations → Frame`: FS across lanes where the successor starts the moment the predecessor
 *   finishes. Today the last leg arrives at Frame's start node **from the east**, over its own bar.
 * - `Frame → Roof`: FS with a bar ("In the way") in the lane between. Today the corridor moves right
 *   and the last leg runs along Roof's bar, landing mid-bar.
 * - `Services → Fit-out`: SS+5 and FF+5, the embed cases the spec keeps (D-8).
 * - `Clean → Commission`: FS in one lane with a gap, the straight H that must stay straight.
 */
export function briefScene(): TsldScene {
  const edge = (
    p: string,
    s: string,
    type: RenderEdge['type'] = 'FS',
    lagDays = 0,
    isDriving = true,
  ): RenderEdge => ({
    id: `${p}>${s}>${type}`,
    predecessorId: p,
    successorId: s,
    type,
    lagDays,
    isDriving,
  });
  return {
    activities: [
      act('Excavate', 0, '2026-01-05', '2026-01-16', { isCritical: true }),
      act('Foundations', 1, '2026-01-20', '2026-01-30', { isCritical: true }),
      act('Frame', 2, '2026-01-31', '2026-02-13', { isCritical: true }),
      act('In the way', 3, '2026-02-09', '2026-02-20'),
      act('Roof', 4, '2026-02-25', '2026-03-10', { isCritical: true }),
      act('Services', 5, '2026-01-05', '2026-01-25'),
      act('Fit-out', 6, '2026-01-12', '2026-01-30'),
      act('Clean', 7, '2026-01-05', '2026-01-15'),
      act('Commission', 7, '2026-01-22', '2026-02-05'),
    ],
    edges: [
      edge('Excavate', 'Foundations'),
      edge('Foundations', 'Frame'),
      edge('Frame', 'Roof'),
      edge('Services', 'Fit-out', 'SS', 5, false),
      edge('Services', 'Fit-out', 'FF', 5, true),
      edge('Clean', 'Commission', 'FS', 0, false),
    ],
    dataDate: '2026-01-01',
    view: { ...DEFAULT_VIEW_TOGGLES },
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
    isWorkingDay: () => true,
  };
}

// ── The four fixtures (spec §4.9) ────────────────────────────────────────────────────────────────

type Asap = Parameters<typeof sceneFor>[0];

/**
 * `sceneFor` drops each dependency's lag, which every existing baseline depends on (FC-G1's
 * fingerprints), so it is not changed. The lag is put back here, by index, because an embed exists
 * only where there is a lag and the attachment metric has to see embeds.
 */
function withLags(asap: Asap, layout: Layout, minutesPerDay: number): TsldScene {
  const { scene } = sceneFor(asap, layout);
  const deps = (asap as unknown as { dependencies: { lagMinutes?: number; lagDays?: number }[] })
    .dependencies;
  return {
    ...scene,
    view: { ...DEFAULT_VIEW_TOGGLES },
    edges: scene.edges.map((e, i) => {
      const d = deps[i];
      const lag =
        d?.lagDays ?? (d?.lagMinutes !== undefined ? Math.round(d.lagMinutes / minutesPerDay) : 0);
      return { ...e, id: `e${i}`, lagDays: lag };
    }),
  };
}

/** The reference plan as the probes want it (`netpoint-grammar-baseline.ts`'s `referenceCase`). */
function referenceAsap(): { asap: Asap; layout: Layout } {
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
  return { asap, layout: { name: 'as drawn', laneOf, lanes: Math.max(...laneOf.values()) + 1 } };
}

export interface Fixture {
  name: string;
  scene: TsldScene;
  /** A size that holds the whole plan at `pxPerDay`, so nothing is culled. */
  sizeAt(pxPerDay: number, originY: number): { width: number; height: number };
}

function sizeFor(scene: TsldScene): Fixture['sizeAt'] {
  const lanes = Math.max(...scene.activities.map((a) => a.laneIndex)) + 1;
  const days = Math.max(
    ...scene.activities.map(
      (a) =>
        (Date.parse(`${a.earlyFinish ?? a.earlyStart}T00:00:00Z`) -
          Date.parse(`${scene.dataDate}T00:00:00Z`)) /
        86_400_000,
    ),
  );
  return (pxPerDay, originY) => ({
    width: (days + 8) * pxPerDay + 400,
    height: lanes * LANE_HEIGHT + originY + 200,
  });
}

export function fixtures(unit300Path: string): Fixture[] {
  const unit = unit300Layouts(unit300Path);
  const small = smallPlanLayouts();
  const ref = referenceAsap();
  const scenes: [string, TsldScene][] = [
    ['brief', briefScene()],
    ['small-17', withLags(small.asap as unknown as Asap, small.shipped, 1440)],
    ['reference-netpoint', withLags(ref.asap, ref.layout, 1440)],
    ['Unit 300', withLags(unit.asap, unit.shipped, 480)],
  ];
  return scenes.map(([name, scene]) => ({ name, scene, sizeAt: sizeFor(scene) }));
}

// ── Self-test: the judge on hand-built lines (M0-T1 "unit cases for each metric") ─────────────────

/**
 * Run before every measurement and thrown on. Scripts are outside vitest, and the metric is the one
 * thing whose error would make every later verdict worthless, so it proves itself each run on lines
 * whose answer is known by construction. Each case would fail against the obvious mistake named
 * beside it.
 */
export function selfTest(): void {
  const node = NODE_REACH_PX;
  const finish: EndSpec = { kind: 'finish-node', reach: node, allowed: ENS };
  const start: EndSpec = { kind: 'start-node', reach: node, allowed: WNS };
  const embed: EndSpec = { kind: 'embed', reach: 2, allowed: NS };
  const cases: {
    name: string;
    line: Point[];
    pred: EndSpec;
    succ: EndSpec;
    want: [Unattached | null, Unattached | null];
  }[] = [
    {
      // Today's FS elbow: a 6 px stub hidden in the disc. Fails if the stub rule is not applied.
      name: 'hidden first bend',
      line: [
        { x: 100, y: 50 },
        { x: 106, y: 50 },
        { x: 106, y: 110 },
        { x: 200, y: 110 },
      ],
      pred: finish,
      succ: start,
      want: ['stub', null],
    },
    {
      // Abutting FS: the last leg runs west into a start node, over its own bar. Fails if the side
      // is read from the travel direction rather than its opposite.
      name: 'arrives from the east',
      line: [
        { x: 100, y: 50 },
        { x: 106, y: 50 },
        { x: 106, y: 110 },
        { x: 100, y: 110 },
      ],
      pred: finish,
      succ: start,
      want: ['stub', 'direction'],
    },
    {
      // A straight vertical through both centres: nothing hidden. Fails if the exemption is missing.
      name: 'straight V',
      line: [
        { x: 100, y: 50 },
        { x: 100, y: 110 },
      ],
      pred: finish,
      succ: start,
      want: [null, null],
    },
    {
      // The attached VH: leave down, arrive from the west. Fails if either rule is inverted.
      name: 'attached VH',
      line: [
        { x: 100, y: 50 },
        { x: 100, y: 110 },
        { x: 200, y: 110 },
      ],
      pred: finish,
      succ: start,
      want: [null, null],
    },
    {
      // An embed left sideways. Fails if an embed is treated as a node.
      name: 'embed left sideways',
      line: [
        { x: 100, y: 50 },
        { x: 130, y: 50 },
        { x: 130, y: 110 },
        { x: 200, y: 110 },
      ],
      pred: embed,
      succ: start,
      want: ['direction', null],
    },
    {
      // Arrowhead room: a 12 px last leg into a node is shorter than 9 + 8. Fails if the successor
      // end is judged with the elbow radius instead of the arrowhead.
      name: 'arrowhead not on one segment',
      line: [
        { x: 100, y: 50 },
        { x: 100, y: 110 },
        { x: 188, y: 110 },
        { x: 188, y: 98 },
      ],
      pred: finish,
      succ: { kind: 'start-node', reach: node, allowed: WNS },
      want: [null, 'stub'],
    },
  ];
  for (const c of cases) {
    const got = judgeEnds(c.line, c.pred, c.succ);
    if (got.pred !== c.want[0] || got.succ !== c.want[1]) {
      throw new Error(
        `attachment-probe self-test "${c.name}": got ${JSON.stringify(got)}, want ${JSON.stringify(c.want)}`,
      );
    }
  }
  selfTestTextKinds();
}

/**
 * The text classifier's own cases (links-and-labels M0-T2). Each names the mistake it fails on.
 * Built on lane 2 of a panned view, so a classifier that forgot the pan or the lane fails too.
 */
function selfTestTextKinds(): void {
  const view: Viewport = { pxPerDay: 4, originX: 40, originY: 32 };
  const slots = rowSlots(screenYOfLane(2, view));
  const wrapped = wrappedNameYs(slots);
  const text = (t: string, y: number, align: CanvasTextAlign): RecordedText => ({
    text: t,
    x: 100,
    y,
    width: 30,
    fontPx: 11,
    align,
    baseline: 'middle',
  });
  const cases: { name: string; t: RecordedText; want: TextKind | 'throws' }[] = [
    // Fails if names are read from the below row or the pan is ignored.
    { name: 'name', t: text('A1010', slots.nameY, 'center'), want: 'name' },
    // Fails if a wrapped line is folded into the single-line name row.
    { name: 'wrapped upper', t: text('Install', wrapped.upper, 'center'), want: 'name-wrapped' },
    // Fails if an aligned date is taken for a milestone's centred one.
    { name: 'flanking date', t: text('20 Jan', slots.belowY, 'left'), want: 'date' },
    // Fails if every centred below-row text is called a date.
    { name: 'milestone date', t: text('3 Sep', slots.belowY, 'center'), want: 'milestone-date' },
    { name: 'centre item', t: text('5d · 3d float', slots.belowY, 'center'), want: 'centre' },
    // Fails if an unknown text is quietly given a kind.
    { name: 'no band', t: text('?', slots.barY + 1, 'left'), want: 'throws' },
  ];
  for (const c of cases) {
    let got: TextKind | 'throws';
    try {
      got = textKindOf(c.t, view);
    } catch {
      got = 'throws';
    }
    if (got !== c.want) {
      throw new Error(`attachment-probe self-test text "${c.name}": got ${got}, want ${c.want}`);
    }
  }
}
