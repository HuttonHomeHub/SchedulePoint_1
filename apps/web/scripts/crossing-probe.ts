/**
 * **M-C0-T2 — how many times does one logic line cross another?** (FC-C1)
 *
 * `docs/specs/diagram-legibility/part-c-conditions.md` FC-C1. Reads the polylines the **real
 * painter** draws, for the reason `vhv-gutter-probe.ts` gives at length: a harness that
 * reconstructs the routing pipeline measures its own reconstruction (ADR-0066's benchmark that
 * measured the cull rather than the painter; ADR-0106's harness that measured the bars instead of
 * the pills; ADR-0124's finding that a measurement taken with a copy of an instrument measures the
 * copy).
 *
 * ## Why this quantity did not exist before
 *
 * Every number this epic has produced is a per-link **magnitude** — `cheap-levers.md`'s mean
 * `|Δlane|` and its `>5-lane` count, and `vhv-gutter-probe`'s excursion, which is a property of one
 * polyline and is **0 by construction** on a picture full of crossings. A crossing is a property of
 * a **pair**, and no function of per-link magnitudes can determine one. So the thing the product
 * owner complained about — "the logic lines cross each other" — has never been measured here.
 *
 * ## Why a second recording context rather than `vhv-gutter-probe`'s
 *
 * That one records vertices and nothing else, deliberately. This needs three things it does not
 * have: which `stroke()` flushed each polyline, the style at flush time, and whether the flush was
 * a stroke or a **fill** — the last because arrowheads are filled triangles built from `moveTo` +
 * `lineTo`, so a recorder that cannot tell a fill from a stroke counts every arrowhead as a line.
 *
 * `vhv-gutter-probe.ts` is **not modified**: its FC-1 has already been judged and recorded, and
 * changing an instrument after its verdict is how a recorded measurement quietly stops describing
 * what produced it. The two share no code today; if a third probe wants this recorder, that is the
 * point to extract it rather than now (ADR-0065's rule is about two *implementations of one rule*
 * drifting, and these are two instruments answering different questions — the same argument
 * `vhv-gutter-probe` itself makes for not reusing `test-support/recording-ctx.ts`).
 *
 * ## What the stub does not establish
 *
 * No `arcTo` and no `roundRect`, so `drawRoundedPolyline` degrades to hard corners and a routed
 * line arrives as exactly `moveTo` + one `lineTo` per point. A real browser has `arcTo`, so the
 * shipped line carries small rounded elbows. Rounding moves the corner arcs; it cannot move a
 * segment's interior, and two segments that cross still cross. Stated rather than left implicit.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { packLanes, type PackItem } from '@repo/layout';

import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import { buildExportViewport } from '../src/features/tsld/export/export-image';
import {
  activityRect,
  BAR_HEIGHT,
  LANE_HEIGHT,
  rectsIntersect,
  rowSlots,
  worldExtent,
} from '../src/features/tsld/render/geometry';
import {
  bundleCorridors,
  chooseCorridorsByCrossing,
  corridorGap,
  gutterChannels,
  isLaneFreeBetween,
  lagAnchorPoints,
  laneIntervalIndex,
  laneOverlapBetween,
  type LaneIntervalIndex,
  packGutterChannels,
  MAX_CORRIDOR_CANDIDATES,
  routeOrthogonal,
} from '../src/features/tsld/render/link-routing';
import { minimapViewport, sceneWindowRect } from '../src/features/tsld/render/minimap';
import { paintScene, type TsldPalette, type TsldScene } from '../src/features/tsld/render/paint';
import type { Point, Viewport } from '../src/features/tsld/render/render-model';
import { ELAPSED_DAY_WALK } from '../src/features/tsld/render/working-time';

import { reorderLanes, statsFor, unit300Asap } from './lane-travel-probe';
export { smallPlanLayouts } from './small-plan-fixture';
export { chainPlacedLayouts, drawnOverlaps } from './chain-placed-fixture';

export interface Pt {
  x: number;
  y: number;
}

/** One recorded path, with everything needed to attribute it to a layer. */
export interface RecordedPath {
  pts: Pt[];
  /** Index of the flush (`stroke()`/`fill()`) that ended this path. */
  batch: number;
  /** How the path was flushed. `none` ⇒ the painter abandoned it without drawing. */
  flush: 'stroke' | 'fill' | 'none';
  /** The style **at flush time**, which is the only moment it describes this path. */
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  /** Whether a dash pattern was in force at flush time. */
  dashed: boolean;
}

/**
 * A context that records path vertices **and how each path was flushed**.
 *
 * The attribution assumption is stated so the control can falsify it: the painter is believed to
 * set a style, build one or more paths, and flush them, so the style at flush time describes every
 * path in that flush. `vhv-gutter-probe.ts`'s docblock records the half of this that is already
 * known — "the painter batches every line of a layer into one path and sets the colour once" —
 * which is exactly why *batch* attribution can work where *per-polyline colour* attribution cannot.
 */
/**
 * One `fillText` call as the painter made it (NetPoint-layout M0-T5). Width is the recorder's own
 * `measureText` — the metric the painter placed the text against — capped at `maxWidth` when the
 * painter passed one, which is what the canvas does with it.
 */
export interface RecordedText {
  text: string;
  x: number;
  y: number;
  width: number;
  fontPx: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
}

export function recordingCtx(): { ctx: unknown; paths: RecordedPath[]; texts: RecordedText[] } {
  const paths: RecordedPath[] = [];
  const texts: RecordedText[] = [];
  let pending: RecordedPath[] = [];
  let current: RecordedPath | null = null;
  let batch = 0;
  let dash: readonly number[] = [];

  const flush = (kind: 'stroke' | 'fill'): void => {
    for (const p of pending) {
      p.batch = batch;
      p.flush = kind;
      p.strokeStyle = String(ctx.strokeStyle);
      p.fillStyle = String(ctx.fillStyle);
      p.lineWidth = ctx.lineWidth;
      p.dashed = dash.length > 0;
    }
    batch += 1;
    pending = [];
    current = null;
  };

  const ctx = {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {
      // A path abandoned without a flush keeps `flush: 'none'` and is excluded by every rule below.
      pending = [];
      current = null;
    },
    moveTo: (x: number, y: number) => {
      current = {
        pts: [{ x, y }],
        batch: -1,
        flush: 'none',
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        dashed: false,
      };
      paths.push(current);
      pending.push(current);
    },
    lineTo: (x: number, y: number) => {
      if (current) current.pts.push({ x, y });
    },
    stroke: () => flush('stroke'),
    fill: () => flush('fill'),
    setTransform: () => {},
    setLineDash: (d: readonly number[]) => {
      dash = d;
    },
    fillText: (text: string, x: number, y: number, maxWidth?: number) => {
      const measured = text.length * 6;
      const px = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
      texts.push({
        text,
        x,
        y,
        width: maxWidth === undefined ? measured : Math.min(measured, maxWidth),
        fontPx: px ? Number(px[1]) : 11,
        align: ctx.textAlign,
        baseline: ctx.textBaseline,
      });
    },
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };

  return { ctx, paths, texts };
}

/**
 * Sentinel link colours.
 *
 * Distinctive values no other token carries, so a batch flushed with one of them is a link batch.
 * If the painter ever derives a tint from these rather than using them directly, the sentinel will
 * not appear and the control below will throw — which is the point: the assumption is checkable
 * rather than assumed.
 */
export const LINK_SENTINELS = {
  edge: '#010203',
  critical: '#040506',
  nearCritical: '#070809',
} as const;

export const PALETTE: TsldPalette = {
  canvasGround: '#14161c',
  gridLine: '#e5e7eb',
  gridLineDay: '#eef0f3',
  gridLineMonth: '#d7dbe0',
  gridLineYear: '#b9bfc7',
  laneRule: '#ececee',
  edge: LINK_SENTINELS.edge,
  bar: '#3b82f6',
  critical: LINK_SENTINELS.critical,
  nearCritical: LINK_SENTINELS.nearCritical,
  outline: '#ffffff',
  selection: '#0ea5e9',
  nonWorking: '#f3f4f6',
  today: '#dc2626',
  todayInk: '#ffffff',
  dataDate: '#111827',
  dataDateInk: '#ffffff',
  conflict: '#f59e0b',
  laneOverlap: '#f59e0b',
  labelInside: '#ffffff',
  labelInsideCritical: '#ffffff',
  labelInsideNearCritical: '#111827',
  labelBeside: '#374151',
  barStroke: '#94a3b8',
  hoverRing: '#94a3b8',
  handleHalo: '#0f172a',
  monthBand: '#f8fafc',
};

// ── The metric ───────────────────────────────────────────────────────────────────────────────────

/**
 * The link polylines in a recording.
 *
 * **Derived from a dump of the real painter, not from a belief about it** (`dump` above; run
 * recorded in `docs/specs/diagram-legibility/part-c-m-c0.md`). At 500 activities the link layer
 * emits four groups sharing one sentinel: a dashed 1px stroke batch and a solid 2px stroke batch
 * (the non-driving and driving lines), and **a filled batch beside each** — the arrowheads, which
 * are 4-point triangles built from `moveTo` + `lineTo` and carry the same `strokeStyle`.
 *
 * So the discriminator is the **flush kind**, not the colour: 237 of the 520 sentinel-coloured
 * paths in that run were arrowheads. A recorder that could not tell a fill from a stroke would have
 * counted every one as a line, and the count would have been 84 % too high with nothing looking
 * wrong.
 */
export function linkPaths(paths: readonly RecordedPath[]): RecordedPath[] {
  const sentinels = new Set<string>(Object.values(LINK_SENTINELS));
  return paths.filter(
    (p) => p.flush === 'stroke' && sentinels.has(p.strokeStyle) && p.pts.length >= 2,
  );
}

interface Seg {
  /** Index of the polyline this segment belongs to — the same-edge exclusion. */
  link: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Axis-aligned segments of each link, plus a count of any that are not axis-aligned. */
function segmentsOf(links: readonly RecordedPath[]): { segs: Seg[]; diagonal: number } {
  const segs: Seg[] = [];
  let diagonal = 0;
  links.forEach((p, link) => {
    for (let i = 1; i < p.pts.length; i += 1) {
      const a = p.pts[i - 1]!;
      const b = p.pts[i]!;
      const horizontal = Math.abs(a.y - b.y) < 0.001;
      const vertical = Math.abs(a.x - b.x) < 0.001;
      // A zero-length segment is neither and is not a diagonal; it simply cannot cross anything.
      if (!horizontal && !vertical) {
        diagonal += 1;
        continue;
      }
      segs.push({ link, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
    }
  });
  return { segs, diagonal };
}

/**
 * Whole-plan transversal crossings between **distinct** links.
 *
 * ADR-0065 rejected diagonals on a time-scaled diagram, so every routed segment is axis-aligned and
 * a crossing is one horizontal meeting one vertical at an interior point of both. Two horizontals,
 * or two verticals, can only be collinear or disjoint — and collinear is the **bundled trunk**
 * (ADR-0065 M3), which is a deliberate shipped design and is therefore not a crossing.
 *
 * ### The three exclusions, each a shipped design rather than a defect
 *
 * 1. **Same-edge elbows** — a polyline's own corners. Excluded by `s.link !== t.link`.
 * 2. **Shared endpoints** — fan-out converges many link ends on one bar edge *by design*
 *    (`FAN_OUT_STEP_PX`), so two links meeting at a shared anchor are not crossing. Excluded by
 *    requiring the meeting point to be **strictly interior** to both segments.
 * 3. **Collinear bundled trunks** — excluded structurally, because parallel segments never satisfy
 *    the horizontal-meets-vertical test at all.
 *
 * Counting any of the three would make the product's own shipped features its worst offenders, and
 * a candidate would then be rewarded for removing them.
 */
export function countCrossings(links: readonly RecordedPath[]): {
  crossings: number;
  segments: number;
  diagonal: number;
} {
  const { segs, diagonal } = segmentsOf(links);
  const horizontals = segs.filter((s) => Math.abs(s.y0 - s.y1) < 0.001);
  const verticals = segs.filter((s) => Math.abs(s.x0 - s.x1) < 0.001);

  const strictlyBetween = (v: number, a: number, b: number): boolean =>
    v > Math.min(a, b) + 0.001 && v < Math.max(a, b) - 0.001;

  let crossings = 0;
  for (const h of horizontals) {
    for (const v of verticals) {
      if (h.link === v.link) continue;
      if (!strictlyBetween(v.x0, h.x0, h.x1)) continue;
      if (!strictlyBetween(h.y0, v.y0, v.y1)) continue;
      crossings += 1;
    }
  }
  return { crossings, segments: segs.length, diagonal };
}

// ── FC-C1: does the metric discriminate? ─────────────────────────────────────────────────────────

const DATA_DATE = '2026-01-01';
const DAY_MS = 86_400_000;

function iso(day: number): string {
  return new Date(Date.parse(`${DATA_DATE}T00:00:00Z`) + day * DAY_MS).toISOString().slice(0, 10);
}

export interface Layout {
  name: string;
  laneOf: ReadonlyMap<string, number>;
  lanes: number;
  /**
   * What the SCENE paints, when that is narrower than the plan — the WBS band lifts its summaries
   * out (`wbs-band-source.ts`), so band-on configurations paint a subset. `undefined` means every
   * activity, which is what every band-off layout wants and is byte-identically today's path.
   */
  sceneIds?: ReadonlySet<string>;
}

/** The Unit 300 programme as the painter wants it, under a given lane assignment. */
export function sceneFor(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
  options: { linkRouting?: boolean } = {},
): { scene: TsldScene; edges: number } {
  const painted = (asap.activities as { key: string; type: string }[]).filter(
    (a) => layout.sceneIds === undefined || layout.sceneIds.has(a.key),
  );
  const activities = painted.map((a) => ({
    id: a.key,
    type: a.type as never,
    laneIndex: layout.laneOf.get(a.key) ?? 0,
    label: a.key,
    earlyStart: iso(asap.start.get(a.key) ?? 0),
    earlyFinish: iso(asap.finish.get(a.key) ?? 0),
    // The span in days, standing in for the working-day duration so the centre item (NetPoint
    // M1) is drawn and counted by FC-N6a; the harness has no calendar to give the real figure.
    durationDays: a.type.endsWith('MILESTONE')
      ? 0
      : (asap.finish.get(a.key) ?? 0) - (asap.start.get(a.key) ?? 0) + 1,
    isCritical: false,
    isNearCritical: false,
  }));
  const deps = asap.dependencies as {
    predecessorKey: string;
    successorKey: string;
    type: string;
  }[];
  const edges = deps.map((d, i) => ({
    predecessorId: d.predecessorKey,
    successorId: d.successorKey,
    type: d.type as never,
    isDriving: i % 3 === 0,
  }));
  return {
    scene: {
      activities,
      edges,
      dataDate: DATA_DATE,
      visualRefresh: true,
      timeTrueLinks: true,
      // `scene.linkRouting` is the ONE gate on the obstacle index and the corridor bundler
      // (`paint.ts:1091-1098`, `:1184-1189`, `:1211`): false takes the pre-ADR-0065 route. Exposed
      // so a reading can establish that the obstacle-aware branch is the one being measured,
      // rather than assuming it from the flag being set.
      linkRouting: options.linkRouting ?? true,
    },
    edges: edges.length,
  };
}

/** The two layouts FC-C1 compares: what ships today, and the worst configuration measured. */
export function unit300Layouts(
  path: string,
  options: { rollUpSummaries?: boolean } = {},
): {
  asap: ReturnType<typeof unit300Asap>;
  shipped: Layout;
  sourceOrder: Layout;
  scrambled: Layout;
} {
  const asap = unit300Asap(path, options);
  const acts = asap.activities as { key: string }[];
  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];

  // Source order is the lane an import assigns before ADR-0069 phase 3 — one bar per row, and the
  // epic's WORST measured configuration (12.96 mean |Δlane| / 73 long links). It is the low end of
  // FC-C1's discrimination test precisely because it is known to be bad.
  const sourceLane = new Map(acts.map((a, i) => [a.key, i]));

  const items: PackItem[] = acts.map((a) => ({
    id: a.key,
    startDay: asap.start.get(a.key) ?? 0,
    endDay: asap.finish.get(a.key) ?? 0,
    laneIndex: sourceLane.get(a.key) ?? 0,
  }));
  const predecessorsOf = new Map<string, string[]>();
  for (const d of deps) {
    const list = predecessorsOf.get(d.successorKey) ?? [];
    list.push(d.predecessorKey);
    predecessorsOf.set(d.successorKey, list);
  }
  const shippedLane = new Map(sourceLane);
  for (const c of packLanes(items, predecessorsOf)) shippedLane.set(c.id, c.laneIndex);

  const lanesIn = (m: ReadonlyMap<string, number>): number => Math.max(...m.values()) + 1;

  /**
   * **The metric's own discrimination test, at CONSTANT height.**
   *
   * FC-C1 compares the shipped layout against source order on the premise that a layout bad on the
   * existing proxies is bad on crossings. Those proxies measure link LENGTH, and nothing here had
   * ever checked that length and crossings move together — so if that comparison fails, it does not
   * say which of the two is wrong.
   *
   * This one does. A deterministic scramble into the **same number of lanes** the shipped packing
   * uses isolates assignment quality from height: same rows, same bars, same links, a plainly worse
   * assignment. A metric that cannot separate a good 27-row assignment from a random one is broken;
   * one that can is working, and a failure against source order is then a fact about source order
   * rather than about the instrument.
   *
   * Seeded (a 32-bit LCG) so two runs agree exactly — FC-C5's determinism applies to the harness as
   * much as to the product.
   */
  let seed = 0x2545f491;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const shippedLanes = lanesIn(shippedLane);
  const scrambledLane = new Map(
    acts.map((a) => [a.key, Math.floor(next() * shippedLanes)] as const),
  );

  return {
    asap,
    shipped: { name: 'shipped (packed + hint)', laneOf: shippedLane, lanes: shippedLanes },
    sourceOrder: { name: 'source order', laneOf: sourceLane, lanes: lanesIn(sourceLane) },
    scrambled: {
      name: 'scrambled (same height)',
      laneOf: scrambledLane,
      lanes: lanesIn(scrambledLane),
    },
  };
}

export interface CrossingReading {
  layout: string;
  lanes: number;
  viewport: string;
  pxPerDay: number;
  originY: number;
  /** Stroked link polylines the painter drew — the denominator, printed beside every figure. */
  visibleLinks: number;
  crossings: number;
  perLink: number;
  segments: number;
  diagonal: number;
  /**
   * A digest of every routed link polyline, in scene order, rounded to 0.01 px.
   *
   * Two readings that agree on a crossing count have not necessarily drawn the same picture, and
   * two that disagree have not necessarily drawn a different one. This says which — and it is the
   * only thing that can distinguish "this change did not affect the routes" from "this change
   * moved the routes and the count happened to land in the same place".
   */
  fingerprint: string;
}

/**
 * Paint one layout at one framing and count.
 *
 * `height` is deliberately large enough to hold every lane of the **worst** layout when
 * `whole` is set, which is what makes the control below independent: with nothing culled, the
 * number of stroked link polylines must equal the number of edges exactly. That is a real check
 * rather than a model of the cull — it does not reproduce the cull, it **removes** it, so it cannot
 * agree with itself the way a reimplementation would (ADR-0124).
 */
export function read(
  scene: TsldScene,
  layout: Layout,
  vp: { label: string; width: number; height: number },
  pxPerDay: number,
  originY: number,
): CrossingReading {
  const { ctx, paths } = recordingCtx();
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    scene,
    { pxPerDay, originX: 40, originY },
    { width: vp.width, height: vp.height },
    PALETTE,
    1,
  );
  const links = linkPaths(paths);
  const { crossings, segments, diagonal } = countCrossings(links);
  const digest = createHash('sha256');
  for (const link of links) {
    for (const pt of link.pts) digest.update(`${pt.x.toFixed(2)},${pt.y.toFixed(2)};`);
    digest.update('|');
  }
  return {
    layout: layout.name,
    lanes: layout.lanes,
    viewport: vp.label,
    pxPerDay,
    originY,
    visibleLinks: links.length,
    crossings,
    perLink: links.length === 0 ? 0 : crossings / links.length,
    segments,
    diagonal,
    fingerprint: digest.digest('hex').slice(0, 12),
  };
}

export interface Fc1Result {
  edges: number;
  control: { whole: CrossingReading; layout: string; expectedLinks: number };
  /**
   * **The verdict is read from these**, one per layout, at a framing holding the whole plan.
   *
   * FC-C1 says "whole-plan crossings per link", and the first version of this harness judged on a
   * mean over the viewport sweep instead — which compares different sub-populations and is a
   * measurement error, not a stricter reading. Source order spreads the plan over 144 rows, so at
   * any one viewport only 21-52 of the 188 links are on screen and those few sit far apart; the
   * shipped 27-row layout puts all 188 on screen at once. Normalising per VISIBLE link removes the
   * raw-count version of "rewarding a candidate for culling the evidence" and leaves this one, in
   * which a layout wins by showing less of the plan at a time.
   *
   * At the whole-plan framing both sides carry all 188 links, so the populations are identical and
   * only the layout differs — which is the comparison FC-C1 asks for.
   */
  wholePlan: CrossingReading[];
  /** The viewport sweep, kept as supporting evidence: it is what a planner actually sees. */
  readings: CrossingReading[];
}

/**
 * FC-C1. Both layouts, swept over pan positions — because this repository's only two exercises of
 * the routing path paint at `originY: 0`, which `vhv-gutter-probe.ts` records as "the single value
 * at which the defect below is invisible".
 */
export function fc1(path: string, options: { rollUpSummaries?: boolean } = {}): Fc1Result {
  const { asap, shipped, sourceOrder, scrambled } = unit300Layouts(path, options);
  const readings: CrossingReading[] = [];

  // The control framing: every lane of the worst layout on screen, so nothing is culled.
  const whole = sceneFor(asap, sourceOrder);
  const tall = { label: 'whole-plan', width: 4000, height: sourceOrder.lanes * 28 + 200 };
  const controlReading = read(whole.scene, sourceOrder, tall, 1, 32);

  for (const layout of [shipped, sourceOrder]) {
    const { scene } = sceneFor(asap, layout);
    for (const vp of [
      { label: '1646x857', width: 1646, height: 857 },
      { label: '1920x840', width: 1920, height: 840 },
    ]) {
      for (const pxPerDay of [2, 12]) {
        for (const originY of [32, -200, -500]) {
          readings.push(read(scene, layout, vp, pxPerDay, originY));
        }
      }
    }
  }

  // The whole-plan framing for BOTH layouts — one box tall and wide enough for the worst of them,
  // so neither side is culled and the two populations are identical.
  const wholePlan = [shipped, sourceOrder, scrambled].map((layout) =>
    read(sceneFor(asap, layout).scene, layout, tall, 1, 32),
  );

  return {
    edges: whole.edges,
    control: { whole: controlReading, layout: sourceOrder.name, expectedLinks: whole.edges },
    wholePlan,
    readings,
  };
}

// ── M-C0-T3: does compressing the diagram raise crossings per link? ──────────────────────────────

/**
 * The summaries the ADR-0063 band actually **draws**, and therefore lifts out of the scene
 * (`wbs-band-source.ts:78`).
 *
 * **Not every summary.** The band depth-caps what it draws (`isWithinBandDepth`,
 * `WBS_BAND_MAX_DEPTH = 2`), and `wbs-band-source.ts` records a shipped defect from lifting them
 * all out unconditionally: a depth-3 summary vanished from both surfaces at once.
 *
 * Depth here is the activity's depth in the `parentKey` tree, which **approximates** the band's own
 * group depth rather than reproducing it — `wbsBandGroups` is a feature-tier derivation this pure
 * harness does not import. The approximation is `lane-travel-probe.ts`'s, stated the same way:
 * measured on this fixture all 18 summaries sit at depth 0-2, so the two agree here; on an unusual
 * tree they could differ by a level.
 */
export function bandDrawnKeys(asap: ReturnType<typeof unit300Asap>): Set<string> {
  const acts = asap.activities as { key: string; type: string; parentKey: string | null }[];
  const parentOf = new Map(acts.map((a) => [a.key, a.parentKey]));
  const depthOf = (key: string): number => {
    let d = 0;
    let at = parentOf.get(key) ?? null;
    while (at !== null && d < 50) {
      d += 1;
      at = parentOf.get(at) ?? null;
    }
    return d;
  };
  return new Set(
    acts.filter((a) => a.type === 'WBS_SUMMARY' && depthOf(a.key) <= 2).map((a) => a.key),
  );
}

/**
 * The five configurations M-C0-T3 reads, and why there are five rather than the four the plan names.
 *
 * The plan asks for band on/off × packed/un-packed. Those four answer the **decision** (CQ-C4:
 * should the band default on, i.e. is 12 rows better than 27?) and cannot answer the **mechanism**,
 * because band-on differs from band-off in two ways at once: it compresses the rows AND it stops
 * painting 18 summary bars. Summary bars are obstacles the router steers around
 * (ADR-0065's `LaneIntervalIndex`), so removing them changes the lines independently of the height.
 *
 * The fifth isolates it, and it is not a contrivance — it is **the shipped behaviour before #364**:
 * band on, lanes packed for the band-off scene, so the summaries' rows are still reserved and paint
 * nothing. `E → D` is therefore identical bars, identical links, identical relative order, with the
 * 13 blank rows squeezed out — compression and nothing else, between two states this product has
 * really been in.
 */
export interface BandConfig {
  layout: Layout;
  band: 'on' | 'off';
  arrangement: string;
  /** Bars the scene paints — 144 band off, 126 band on. */
  bars: number;
  /**
   * Lanes holding **nothing but** band-drawn summaries: the rows that go empty when the band comes
   * on, and the only rows whose obstacles band-on removes.
   */
  summaryOnlyLanes: number;
  /**
   * Links whose endpoints are more than one lane apart — `routeOrthogonal` returns today's elbow
   * unexamined when `crossedLanes` is empty (`link-routing.ts:191-193`), so only these can consult
   * an obstacle at all.
   */
  spanningLinks: number;
  /**
   * …and of those, how many cross a summary-only lane. **This is the number that explains why
   * removing the summary bars moves no line**, and it is measured rather than reasoned: the
   * obstacle sets genuinely differ (27 occupied lanes against 14), and almost no link's crossed set
   * contains one of the lanes that differ.
   */
  spanningLinksOverSummaryOnlyLane: number;
}

export function unit300BandConfigs(
  path: string,
  options: { rollUpSummaries?: boolean } = {},
): {
  asap: ReturnType<typeof unit300Asap>;
  configs: BandConfig[];
  maxDay: number;
} {
  const asap = unit300Asap(path, options);
  const acts = asap.activities as { key: string }[];
  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];
  const bandDrawn = bandDrawnKeys(asap);
  const sceneIds = new Set(acts.map((a) => a.key).filter((k) => !bandDrawn.has(k)));

  const sourceLane = new Map(acts.map((a, i) => [a.key, i]));
  const predecessorsOf = new Map<string, string[]>();
  for (const d of deps) {
    const list = predecessorsOf.get(d.successorKey) ?? [];
    list.push(d.predecessorKey);
    predecessorsOf.set(d.successorKey, list);
  }
  const itemFor = (key: string): PackItem => ({
    id: key,
    startDay: asap.start.get(key) ?? 0,
    endDay: asap.finish.get(key) ?? 0,
    laneIndex: sourceLane.get(key) ?? 0,
  });

  // Band off, arranged: the pack over EVERY activity — `computeLaneArrangement`'s band-off path,
  // which that file's own docblock calls "the pre-#364 call over the pre-#364 items".
  const allLane = new Map(sourceLane);
  for (const c of packLanes(
    acts.map((a) => itemFor(a.key)),
    predecessorsOf,
  )) {
    allLane.set(c.id, c.laneIndex);
  }

  // Band on, arranged (#364): the pack over what the SCENE paints. The band's own summaries are
  // appended above the scene's range by `computeLaneArrangement` and are not painted in the scene,
  // so their lanes cannot reach a line and are left at source order here.
  const sceneLane = new Map(sourceLane);
  for (const c of packLanes(
    acts.filter((a) => sceneIds.has(a.key)).map((a) => itemFor(a.key)),
    predecessorsOf,
  )) {
    sceneLane.set(c.id, c.laneIndex);
  }

  // The DRAWN extent is `worldExtent`'s rule: the max lane among the activities it is given, which
  // band on is `sceneActivities`. Computing it over the painted set rather than over the whole map
  // is why configuration E reports 27 and not 12.
  const extent = (
    laneOf: ReadonlyMap<string, number>,
    painted: ReadonlySet<string> | null,
  ): number =>
    Math.max(
      ...acts
        .filter((a) => painted === null || painted.has(a.key))
        .map((a) => laneOf.get(a.key) ?? 0),
    ) + 1;

  const bars = (painted: ReadonlySet<string> | null): number =>
    painted === null ? acts.length : acts.filter((a) => painted.has(a.key)).length;

  const laneDiagnostics = (
    laneOf: ReadonlyMap<string, number>,
  ): Pick<
    BandConfig,
    'summaryOnlyLanes' | 'spanningLinks' | 'spanningLinksOverSummaryOnlyLane'
  > => {
    const owners = new Map<number, string[]>();
    for (const a of acts) {
      const lane = laneOf.get(a.key) ?? 0;
      const list = owners.get(lane);
      if (list) list.push(a.key);
      else owners.set(lane, [a.key]);
    }
    const summaryOnly = new Set(
      [...owners.entries()]
        .filter(([, keys]) => keys.every((k) => bandDrawn.has(k)))
        .map(([lane]) => lane),
    );
    let spanning = 0;
    let over = 0;
    for (const d of deps) {
      const a = laneOf.get(d.predecessorKey) ?? 0;
      const b = laneOf.get(d.successorKey) ?? 0;
      if (Math.abs(a - b) <= 1) continue;
      spanning += 1;
      for (let lane = Math.min(a, b) + 1; lane <= Math.max(a, b) - 1; lane += 1) {
        if (summaryOnly.has(lane)) {
          over += 1;
          break;
        }
      }
    }
    return {
      summaryOnlyLanes: summaryOnly.size,
      spanningLinks: spanning,
      spanningLinksOverSummaryOnlyLane: over,
    };
  };

  const make = (
    name: string,
    laneOf: ReadonlyMap<string, number>,
    painted: ReadonlySet<string> | null,
    band: 'on' | 'off',
    arrangement: string,
  ): BandConfig => ({
    layout: {
      name,
      laneOf,
      lanes: extent(laneOf, painted),
      ...(painted === null ? {} : { sceneIds: painted }),
    },
    band,
    arrangement,
    bars: bars(painted),
    ...laneDiagnostics(laneOf),
  });

  const maxDay = Math.max(...acts.map((a) => asap.finish.get(a.key) ?? 0));

  return {
    asap,
    maxDay,
    configs: [
      make('A band off · as imported', sourceLane, null, 'off', 'source order'),
      make('B band off · arranged', allLane, null, 'off', 'packed (all bars)'),
      make('C band on · as imported', sourceLane, sceneIds, 'on', 'source order'),
      make('E band on · arranged pre-#364', allLane, sceneIds, 'on', 'packed (all bars)'),
      make('D band on · arranged (#364)', sceneLane, sceneIds, 'on', 'packed (scene bars)'),
    ],
  };
}

export interface T3Reading extends CrossingReading {
  band: 'on' | 'off';
  arrangement: string;
  bars: number;
  /**
   * How many activities the PAINTER was handed — the control that separates "the band changed
   * nothing" from "the band never reached the painter". Without it a filter that silently failed
   * to apply would report the band-on and band-off readings as identical, which is exactly what a
   * genuine null result looks like.
   */
  paintedActivities: number;
}

export interface T3Result {
  edges: number;
  /** The configurations themselves, so a runner can print the lane diagnostics beside the counts. */
  configs: BandConfig[];
  /** Whole-plan readings, one per configuration per zoom. Nothing is culled at any of them. */
  readings: T3Reading[];
  /**
   * The same configurations painted with `scene.linkRouting` **off** — the pre-ADR-0065 route.
   *
   * This is the discriminator the band readings need. If band on and band off produce identical
   * routes, there are two explanations — the obstacle index is inert on this plan, or it was never
   * consulted — and only a reading with the gate deliberately off can tell them apart. Without it
   * a harness that had silently lost obstacle awareness would report exactly the same identity and
   * read as a finding about the band.
   */
  routingOff: T3Reading[];
  zooms: number[];
}

/**
 * M-C0-T3. Every configuration read **whole-plan**, for FC-C1's own reason: a framing that culls
 * hands the win to whichever layout shows less of the plan at a time, and these configurations
 * differ by a factor of twelve in height, so that trap is at its widest here.
 *
 * Swept over three zooms because a crossing is a property of the picture and the picture's aspect
 * changes with `pxPerDay`: at 1 px/day the programme is a narrow column and corridors are forced
 * together horizontally; at 12 it is a wide ribbon. A finding that holds at one zoom and reverses
 * at another is a finding about the zoom.
 */
export function t3(path: string, options: { rollUpSummaries?: boolean } = {}): T3Result {
  const { asap, configs, maxDay } = unit300BandConfigs(path, options);
  const zooms = [1, 4, 12];
  const readings: T3Reading[] = [];
  const routingOff: T3Reading[] = [];
  const sweep = (into: T3Reading[], config: BandConfig, linkRouting: boolean): void => {
    const { scene } = sceneFor(asap, config.layout, { linkRouting });
    for (const pxPerDay of zooms) {
      // Wide and tall enough for the WORST case at this zoom, so nothing is culled in any
      // configuration and every reading carries the same 188 links.
      const vp = {
        label: 'whole-plan',
        width: (maxDay + 4) * pxPerDay + 400,
        height: 145 * 28 + 200,
      };
      into.push({
        ...read(scene, config.layout, vp, pxPerDay, 32),
        band: config.band,
        arrangement: config.arrangement,
        bars: config.bars,
        paintedActivities: scene.activities.length,
      });
    }
  };
  for (const config of configs) sweep(readings, config, true);
  for (const config of configs) sweep(routingOff, config, false);
  return { edges: (asap.dependencies as unknown[]).length, configs, readings, routingOff, zooms };
}

// ── M-C0-T4: is the inter-lane gutter the term? (FC-C3) ──────────────────────────────────────────

/**
 * FC-C3 asks for a pitch at which "two runs through one gutter read as two lines, clear of both bar
 * edges". Both halves are questions about the polylines the painter draws, so both are measured
 * here before any pitch is rendered.
 *
 * **A gutter leg is identified by the painter's own definition, not by a band.** `routeOrthogonal`
 * puts the VHV fallback's horizontal leg at `view.originY + (gutterLane + 1) * laneHeight -
 * (laneHeight - barHeight) / 2` (`link-routing.ts:225-228`) — ONE value per gutter, with no
 * per-link term. So a leg is a horizontal segment whose offset within its lane is exactly
 * `pad + barHeight`, and anything looser would count a 4-point route's first or last leg, which
 * runs at a bar's centre and is not in a gutter at all.
 *
 * **Clearance is measured against `activityRect`**, the one existing source of a bar's geometry and
 * the same one `laneIntervalIndex` reads — never against the routing formula, which would make the
 * answer a restatement of the expression rather than a measurement of the picture.
 */
export interface GutterReading {
  laneHeight: number;
  barHeight: number;
  /** `laneHeight - barHeight` — the band every corridor has to share. */
  gutterHeight: number;
  pxPerDay: number;
  links: number;
  /** Routes that took the VHV fallback: 6 points rather than 4. */
  vhvRoutes: number;
  gutterLegs: number;
  /** How many distinct y values those legs occupy. */
  distinctGutterY: number;
  /** The most legs sharing a single y — the number FC-C3's first half turns on. */
  maxLegsOnOneY: number;
  /**
   * Gutter legs whose y lies within a bar's painted vertical extent, in either lane the gutter
   * separates. FC-C3's second half — "clear of both bar edges" — is about this.
   */
  legsTouchingABar: number;
  /** The smallest gap between a gutter leg and the nearest bar edge, in CSS px. */
  minClearancePx: number;
  /** Channels available at this pitch, derived from the CLEAR band (M3-T3). */
  channels: number;
  /**
   * The **net** band a channel may use, after the row's name and date rows have taken theirs —
   * FC-L11's quantity, and the one the epic's verdict is read against.
   */
  clearBandPx: number;
  /**
   * The **gross** band the thin bar hands back, before the row spends any of it. **FC-L11 forbids
   * quoting this without the net beside it**, which is why both are on every row.
   */
  grossBandPx: number;
  /** The most runs simultaneously live in one gutter — the denominator of FC-L3's second limb. */
  peakGutterOverlap: number;
  /** The most runs that OVERLAP IN X and share a y — what that limb is really about. */
  maxOverlappingOnOneY: number;
}

export function gutterReadings(
  path: string,
  pxPerDays: readonly number[],
  options: { rollUpSummaries?: boolean } = {},
): GutterReading[] {
  const { asap, configs, maxDay } = unit300BandConfigs(path, options);
  // The shipped configuration a planner meets: band off, lanes arranged.
  const config = configs.find((c) => c.layout.name.startsWith('B '));
  if (!config) throw new Error('the band-off arranged configuration is missing');
  const { scene } = sceneFor(asap, config.layout);
  const originY = 32;

  return pxPerDays.map((pxPerDay) => {
    const view: Viewport = { pxPerDay, originX: 40, originY };
    const size = { width: (maxDay + 4) * pxPerDay + 400, height: 145 * LANE_HEIGHT + 200 };
    const { ctx, paths } = recordingCtx();
    paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
    const links = linkPaths(paths);

    // **The legs come from `gutterStats`, not from a second search here** (logic-legibility M3-T4).
    //
    // This function found them by testing a leg's y against the BAR'S BOTTOM EDGE — M1-T1's datum
    // before M1-T1 moved it to the lane boundary. `gutterStats` was corrected to the
    // datum-independent definition (`packGutterChannels`'s own: the middle horizontal of a
    // six-point polyline) and this was not, so two leg-finders diverged in the one direction that
    // reports well.
    //
    // **Measured at the M3-T3 geometry before the fix: 103 six-point routes painted, 0 gutter legs
    // found, `legsTouchingABar: 0`** — the "blind spot wearing a triumph's clothes" the other
    // function's docblock records having fixed, reproduced here because the fix reached one of the
    // two. `measure-gutter-pitch.mjs`'s control only fires when EVERY row is empty, so a sweep in
    // which one pitch happened to work would have graded the rest on nothing.
    const stats = gutterStats(links, scene, view);
    const legs = stats.legs;

    // Bar extents from `activityRect` — the painter's own source, so this measures the picture.
    const bars = scene.activities.flatMap((activity) => {
      const rect = activityRect(activity, view, scene.dataDate);
      return rect === null
        ? []
        : [{ top: rect.y, bottom: rect.y + rect.h, x0: rect.x, x1: rect.x + rect.w }];
    });

    const byY = new Map<number, number>();
    for (const leg of legs) byY.set(leg.y, (byY.get(leg.y) ?? 0) + 1);

    let touching = 0;
    let minClearance = Number.POSITIVE_INFINITY;
    for (const leg of legs) {
      for (const bar of bars) {
        // Only bars the leg actually runs past horizontally can be touched by it.
        if (bar.x1 < leg.x0 || bar.x0 > leg.x1) continue;
        if (leg.y >= bar.top - 0.001 && leg.y <= bar.bottom + 0.001) {
          touching += 1;
          minClearance = 0;
          break;
        }
        const gap = Math.min(Math.abs(leg.y - bar.top), Math.abs(leg.y - bar.bottom));
        if (gap < minClearance) minClearance = gap;
      }
    }

    return {
      laneHeight: LANE_HEIGHT,
      barHeight: BAR_HEIGHT,
      gutterHeight: LANE_HEIGHT - BAR_HEIGHT,
      pxPerDay,
      links: links.length,
      vhvRoutes: links.filter((l) => l.pts.length >= 6).length,
      gutterLegs: legs.length,
      distinctGutterY: byY.size,
      maxLegsOnOneY: legs.length === 0 ? 0 : Math.max(...byY.values()),
      legsTouchingABar: touching,
      minClearancePx: legs.length === 0 ? Number.NaN : minClearance,
      // What FC-L3 and FC-L11 are judged on at each swept pitch (M3-T4). `clearBandPx` is the NET
      // band — what a channel may use after the row's name and date rows have taken theirs — and
      // `grossBandPx` is what the thin bar hands back before they do. FC-L11 forbids the second
      // without the first beside it.
      channels: stats.channels,
      clearBandPx: stats.clearBandPx,
      grossBandPx: stats.grossBandPx,
      peakGutterOverlap: stats.peakGutterOverlap,
      maxOverlappingOnOneY: stats.maxOverlappingOnOneY,
    };
  });
}

/**
 * The scene the FC-C3 picture is taken of, and the lane whose gutter carries the most runs.
 *
 * The picture has to show the **worst** gutter, or it shows a case nobody was complaining about.
 * The lane is measured here at the shipped pitch rather than chosen; the browser recomputes its own
 * `originY` from it, because where a lane sits on screen is a function of the pitch under test.
 */
export function sceneForShot(
  path: string,
  options: { rollUpSummaries?: boolean } = {},
): { scene: TsldScene; focusLane: number } {
  const { asap, configs, maxDay } = unit300BandConfigs(path, options);
  const config = configs.find((c) => c.layout.name.startsWith('B '));
  if (!config) throw new Error('the band-off arranged configuration is missing');
  const { scene } = sceneFor(asap, config.layout);
  const originY = 32;
  const pxPerDay = 12;
  const { ctx, paths } = recordingCtx();
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    scene,
    { pxPerDay, originX: 40, originY },
    { width: (maxDay + 4) * pxPerDay + 400, height: 145 * LANE_HEIGHT + 200 },
    PALETTE,
    1,
  );
  // **A gutter leg is the middle segment of a six-point route** — structural, so this survived
  // M1-T1 moving the datum from the upper lane's bar bottom to the lane boundary. The previous
  // test named the old y and would have found nothing, sending the throw below off on a plan that
  // has plenty of gutter runs (`gutterStats` records the same correction).
  const byLane = new Map<number, number>();
  for (const link of linkPaths(paths)) {
    if (link.pts.length !== 6) continue;
    const a = link.pts[2]!;
    const b = link.pts[3]!;
    if (Math.abs(a.y - b.y) > 0.001 || Math.abs(a.x - b.x) < 0.001) continue;
    // Round rather than floor: a channel offset puts the leg a few px either side of the boundary,
    // so the lane it belongs to is the nearest one, not the one below it.
    const lane = Math.round((a.y - originY) / LANE_HEIGHT) - 1;
    byLane.set(lane, (byLane.get(lane) ?? 0) + 1);
  }
  if (byLane.size === 0) {
    throw new Error(
      'M-C0-T4 INDETERMINATE: no gutter leg was found, so there is no worst gutter to photograph. ' +
        'Refusing to produce a picture that would look like an answer.',
    );
  }
  const focusLane = [...byLane.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  return { scene, focusLane };
}

/**
 * The three layouts M-C0-T2b measured, as scenes ready to photograph.
 *
 * The numbers alone do not settle CQ-C1 and were never meant to: this epic exists because a diagram
 * that satisfied every number was still hard to read, and the product owner reserved the choice for
 * themselves on the pictures as well as the figures. A reader who has seen 2.617, 2.160 and 6.404
 * still has no idea what any of them looks like — these are what calibrates that.
 */
export function layoutScenes(
  path: string,
  options: { rollUpSummaries?: boolean } = {},
): { name: string; scene: TsldScene; lanes: number }[] {
  const { asap, shipped, sourceOrder, scrambled } = unit300Layouts(path, options);
  return [shipped, sourceOrder, scrambled].map((layout) => ({
    name: layout.name,
    scene: sceneFor(asap, layout).scene,
    lanes: layout.lanes,
  }));
}

// ── M-C4: logic-aware lane assignment candidates ─────────────────────────────────────────────────

/**
 * The three assignment rules M-C4 measures, built here **before** anything is built in the product.
 *
 * M-C0-T2b re-aimed this milestone: height does not buy legibility (144 rows against 21 differs by
 * under half a per cent at the two working zooms) and assignment quality does (2.7× between a good
 * 21-row assignment and a random one). So a candidate is an **assignment rule**, and the height it
 * happens to need is an output rather than a budget.
 *
 * All three are measured against FC-C2's floor — a candidate must halve whole-plan crossings per
 * link to be offered at all — with the withdrawal clause stated in `part-c-conditions.md`.
 */
export interface AssignmentCandidate {
  name: string;
  laneOf: Map<string, number>;
  lanes: number;
}

interface Item {
  key: string;
  startDay: number;
  endDay: number;
}

/** Lowest lane whose latest occupant finishes before `startDay`, or `-1` to open one. */
function firstFree(laneEnds: number[], startDay: number): number {
  return laneEnds.findIndex((end) => startDay > end);
}

export function assignmentCandidates(path: string): {
  asap: ReturnType<typeof unit300Asap>;
  shipped: Layout;
  candidates: AssignmentCandidate[];
} {
  const { asap, shipped } = unit300Layouts(path, { rollUpSummaries: true });
  const acts = asap.activities as { key: string }[];
  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];
  const items: Item[] = acts.map((a) => ({
    key: a.key,
    startDay: asap.start.get(a.key) ?? 0,
    endDay: asap.finish.get(a.key) ?? 0,
  }));
  const byKey = new Map(items.map((i) => [i.key, i]));

  const successorsOf = new Map<string, string[]>();
  const predecessorsOf = new Map<string, string[]>();
  for (const d of deps) {
    (
      successorsOf.get(d.predecessorKey) ??
      successorsOf.set(d.predecessorKey, []).get(d.predecessorKey)!
    ).push(d.successorKey);
    (
      predecessorsOf.get(d.successorKey) ??
      predecessorsOf.set(d.successorKey, []).get(d.successorKey)!
    ).push(d.predecessorKey);
  }

  /**
   * **Candidate A — chain rows.** Decompose the logic into chains longest-first and give each chain
   * a row of its own where its members fit.
   *
   * The idea a time-scaled diagram makes obvious: a chain drawn on ONE row has no vertical corridor
   * at all — every link in it is a short horizontal hop between neighbours. That is what a NetPoint
   * diagram looks like, and it is the shape the product owner's own screenshots were compared
   * against.
   */
  const chainRows = (): Map<string, number> => {
    const lane = new Map<string, number>();
    const laneEnds: number[] = [];
    const remaining = new Set(items.map((i) => i.key));
    // A deterministic topological order over the whole graph, reused for every extraction.
    const order = [...items].sort(
      (a, b) => a.startDay - b.startDay || a.endDay - b.endDay || (a.key < b.key ? -1 : 1),
    );
    while (remaining.size > 0) {
      // Longest chain (by member count) through the remaining set, by DP over the fixed order.
      const best = new Map<string, number>();
      const next = new Map<string, string | null>();
      for (let i = order.length - 1; i >= 0; i -= 1) {
        const key = order[i]!.key;
        if (!remaining.has(key)) continue;
        let bestLen = 1;
        let bestNext: string | null = null;
        for (const successor of successorsOf.get(key) ?? []) {
          if (!remaining.has(successor)) continue;
          const length = (best.get(successor) ?? 0) + 1;
          if (
            length > bestLen ||
            (length === bestLen && bestNext !== null && successor < bestNext)
          ) {
            bestLen = length;
            bestNext = successor;
          }
        }
        best.set(key, bestLen);
        next.set(key, bestNext);
      }
      let head: string | null = null;
      let headLen = -1;
      for (const item of order) {
        if (!remaining.has(item.key)) continue;
        const length = best.get(item.key) ?? 0;
        if (length > headLen) {
          headLen = length;
          head = item.key;
        }
      }
      if (head === null) break;
      const chain: string[] = [];
      for (let at: string | null = head; at !== null; at = next.get(at) ?? null) chain.push(at);

      // The chain's own row: the lowest lane its FIRST member fits in, then every member that fits
      // after it. A member that does not fit (an SS/FF overlap) spills to the general pool rather
      // than forcing the chain apart wholesale.
      const first = byKey.get(chain[0]!)!;
      let row = firstFree(laneEnds, first.startDay);
      if (row === -1) {
        row = laneEnds.length;
        laneEnds.push(Number.NEGATIVE_INFINITY);
      }
      for (const key of chain) {
        const item = byKey.get(key)!;
        const target = item.startDay > laneEnds[row]! ? row : firstFree(laneEnds, item.startDay);
        const placed = target === -1 ? laneEnds.push(Number.NEGATIVE_INFINITY) - 1 : target;
        laneEnds[placed] = item.endDay;
        lane.set(key, placed);
        remaining.delete(key);
      }
    }
    return lane;
  };

  /**
   * **Candidate B — predecessor adjacency, allowed to open a row.** Today's packer chooses among
   * lanes that are already free and never opens one for the sake of the hint
   * (`pack-lanes.ts`'s own docblock says so). This one opens a row when the nearest free lane is
   * more than `NEAR` away from the predecessor mean — trading height for link length directly.
   */
  const NEAR = 2;
  const nearPredecessors = (): Map<string, number> => {
    const lane = new Map<string, number>();
    const laneEnds: number[] = [];
    const order = [...items].sort(
      (a, b) => a.startDay - b.startDay || a.endDay - b.endDay || (a.key < b.key ? -1 : 1),
    );
    for (const item of order) {
      const placed = (predecessorsOf.get(item.key) ?? [])
        .map((p) => lane.get(p))
        .filter((l): l is number => l !== undefined);
      const free: number[] = [];
      laneEnds.forEach((end, l) => {
        if (item.startDay > end) free.push(l);
      });
      let target: number;
      if (placed.length === 0) {
        target = free.length > 0 ? free[0]! : laneEnds.length;
      } else {
        const mean = placed.reduce((sum, l) => sum + l, 0) / placed.length;
        let nearest = -1;
        let distance = Number.POSITIVE_INFINITY;
        for (const l of free) {
          const d = Math.abs(l - mean);
          if (d < distance) {
            distance = d;
            nearest = l;
          }
        }
        target = nearest !== -1 && distance <= NEAR ? nearest : laneEnds.length;
      }
      if (target >= laneEnds.length) laneEnds.push(Number.NEGATIVE_INFINITY);
      laneEnds[target] = item.endDay;
      lane.set(item.key, target);
    }
    return lane;
  };

  /**
   * **Candidate C — topological depth first.** Sort by longest-path depth before first-fit, so a
   * chain's members are placed in logical order rather than in date order. Free: it changes one
   * comparator and nothing else.
   */
  const depthFirst = (): Map<string, number> => {
    const depth = new Map<string, number>();
    const order = [...items].sort((a, b) => a.startDay - b.startDay || (a.key < b.key ? -1 : 1));
    for (const item of order) {
      const preds = predecessorsOf.get(item.key) ?? [];
      depth.set(
        item.key,
        preds.length === 0 ? 0 : Math.max(...preds.map((p) => (depth.get(p) ?? 0) + 1)),
      );
    }
    const lane = new Map<string, number>();
    const laneEnds: number[] = [];
    const sorted = [...items].sort(
      (a, b) =>
        (depth.get(a.key) ?? 0) - (depth.get(b.key) ?? 0) ||
        a.startDay - b.startDay ||
        (a.key < b.key ? -1 : 1),
    );
    for (const item of sorted) {
      let target = firstFree(laneEnds, item.startDay);
      if (target === -1) {
        target = laneEnds.length;
        laneEnds.push(Number.NEGATIVE_INFINITY);
      }
      laneEnds[target] = item.endDay;
      lane.set(item.key, target);
    }
    return lane;
  };

  const build = (name: string, laneOf: Map<string, number>): AssignmentCandidate => ({
    name,
    laneOf,
    lanes: Math.max(...laneOf.values()) + 1,
  });

  return {
    asap,
    shipped,
    candidates: [
      build('A chain rows', chainRows()),
      build('B near predecessors', nearPredecessors()),
      build('C depth-first pack', depthFirst()),
      /**
       * **Candidate D — lane re-indexing** (`cheap-levers.md` Finding 4, logic-legibility M4-T2).
       *
       * Not a packing rule at all: it takes the SHIPPED packing and permutes which row index each
       * lane gets, so the bars in a row, the row count and every bar's x are untouched and only
       * the vertical distance a link travels changes. Measured at −7.5 % mean and −14.3 % long
       * links on travel and **never on occlusion or crossings**, which is what this run supplies.
       *
       * It is the one candidate whose row count is structurally guaranteed not to move, and that
       * is asserted below rather than inherited from the file that argues it.
       */
      build(
        'D lane re-indexing',
        reorderLanes(
          shipped.laneOf,
          deps.map((d) => ({ from: d.predecessorKey, to: d.successorKey })),
        ),
      ),
    ],
  };
}

/** One whole-plan reading of an arbitrary lane assignment — the comparison M-C4 is judged on. */
export function readWholePlan(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
): CrossingReading {
  const acts = asap.activities as { key: string }[];
  const maxDay = Math.max(...acts.map((a) => asap.finish.get(a.key) ?? 0));
  const worstLanes = Math.max(layout.lanes, 145);
  return read(
    sceneFor(asap, layout).scene,
    layout,
    { label: 'whole-plan', width: (maxDay + 4) * 4 + 400, height: worstLanes * LANE_HEIGHT + 200 },
    4,
    32,
  );
}

// ── logic-legibility M0: link-over-bar OCCLUSION, which nothing in Part C ever counted ─────────

/**
 * How many of a plan's links have a horizontal leg running **through a bar**, and how many merely
 * **touch** one.
 *
 * ## Why this is a different quantity from {@link countCrossings}
 *
 * `crossingsOf` counts segment-versus-segment against a `SegmentIndex` built from link polylines
 * ONLY. Bars are not in it, and they structurally could not be: {@link recordingCtx} discards
 * `fillRect` entirely (`fillRect: () => {}`), which is how a bar is painted. So the instrument Part
 * C judged four milestones with was **incapable of seeing the thing the product owner was
 * complaining about** — "the logic is mapping across other bars" — and ADR-0149's −20.8 % is a true
 * statement about link-versus-link that says nothing at all about this.
 *
 * ## Why a leg can run through a bar at all
 *
 * `routeOrthogonal` applies its obstacle check to the vertical corridor only, and only across
 * `crossedLanes(fromLane, toLane)` — the lanes strictly BETWEEN the two endpoints. The two
 * horizontal legs run at `from.y` and `to.y`, the source and target bars' centre-lines, and are
 * checked against nothing. A leg therefore runs straight through any bar sharing its lane between
 * the anchor and the corridor. Links paint UNDER bars (`paint.ts` Layer 2 against Layer 3), so the
 * line does not overlap the bar — it **disappears behind it**, which is worse for tracing.
 *
 * ## ONE predicate, imported rather than restated (M0-T1 step 4)
 *
 * The bars come from `laneIntervalIndex`, the same index `routeOrthogonal` consults, so what the
 * router refuses and what this counts cannot drift into two opinions about where a bar is. The
 * containment convention differs on purpose and is argued below.
 * The lane index is `laneIntervalIndex`, likewise the router's own — and both derive from
 * `activityRect`, the painter's own rect source, never from the routing formula. M-C0-T4 established
 * that rule after measuring the gutter against the routing expression and getting an answer about
 * the formula rather than about the picture.
 *
 * ## TANGENCY IS ITS OWN COLUMN, and that is the correction this function exists to carry
 *
 * The first version of this counter tested `a.y > r.y1 && a.y < r.y2` — strictly inside a bar's
 * vertical extent. `gutterY` expands to **exactly** the upper lane's bar bottom at every pitch
 * (ADR-0149 D3's arithmetic; at `originY = 32`, lane 0, both are 55.0), so **every gutter leg scored
 * zero** — including the 58 of Unit 300's 68 that M-C0-T4 measured as lying _inside_ a painted bar
 * at 0.0 px clearance. The relayed **77.1 %** was taken with that blind spot and is a FLOOR, never a
 * measurement; `conditions.md` §0.2 binds every document that quotes it to say so.
 *
 * So a leg is classified three ways against each bar in its lane:
 *   - `through`  — its y is strictly inside the bar's vertical extent.
 *   - `tangent`  — its y is exactly on the bar's top or bottom edge. A gutter leg, by construction.
 *   - neither    — it is in clear air.
 *
 * ## The endpoint problem, which the router's own predicate could not answer
 *
 * A recorded polyline carries no link identity, so a leg's OWN endpoint bars cannot be excluded by
 * id here, and every leg begins on one by construction. The first version of this function used
 * {@link isLaneFreeBetween} directly — the router's predicate, CLOSED at both ends, because a
 * corridor sitting on a bar's edge is drawn on the bar and is unusable. Run, it reported **100 % of
 * Unit 300's links occluded at both layouts, with 391 of 395 incidents self-anchored**: a number
 * that is true of the predicate and says nothing about the picture.
 *
 * So the occlusion test is {@link laneOverlapBetween}, which is deliberately OPEN and returns a
 * LENGTH — a leg that merely touches an edge hides nothing, and `buriedPx` separates a leg buried
 * forty pixels inside a bar from one grazing it. Both functions read the same `laneIntervalIndex`,
 * so they cannot disagree about where a bar IS; only about whether an edge counts, which is the
 * caller's question and not the index's. `grazing` reports the excluded residue rather than
 * dropping it silently, because its size is what justifies excluding it.
 *
 * An epsilon on the anchor would NOT have worked: an `SF` corridor at `(from.x + to.x) / 2` can
 * fall well inside either bar, and a clamped lag anchor is placed **on** the bar deliberately
 * (`lagAnchorPoints`) — neither is near an edge. The overlap-length rule handles both without
 * knowing which link it is looking at.
 */
/**
 * Where the bars are, in the two shapes the occlusion questions need. Built once per reading and
 * passed to {@link lineOcclusion}, so the counter and the counterfactual cannot hold two opinions
 * about the picture they are judging.
 */
export function occlusionContext(
  scene: TsldScene,
  view: Viewport,
): {
  index: LaneIntervalIndex;
  barsOfLane: Map<number, { x0: number; x1: number }[]>;
  extentOfLane: Map<number, { top: number; bottom: number }>;
  barAt: (x: number, y: number) => string | null;
} {
  const index = laneIntervalIndex(scene.activities, view, scene.dataDate);

  // **Per-bar, UNMERGED, and that is not a detail.** `laneIntervalIndex` merges spans that overlap
  // OR TOUCH (`span[0] <= last[1]`), which is right for the router — it only ever asks whether a
  // position is usable — and useless for attribution, because `packLanes` puts activities end to
  // end in a lane and two touching bars become one span. Attributing against merged spans reports a
  // leg crossing its neighbour as "its own bar", and measured, it undercounts foreign occlusion by
  // 6.6x. Both this and the index read `activityRect`, the painter's own rect source, so they
  // cannot disagree about where a bar is.
  const barsOfLane = new Map<number, { x0: number; x1: number }[]>();
  const extentOfLane = new Map<number, { top: number; bottom: number }>();
  for (const activity of scene.activities) {
    const rect = activityRect(activity, view, scene.dataDate);
    if (rect === null) continue;
    const lane = activity.laneIndex;
    const bars = barsOfLane.get(lane);
    if (bars) bars.push({ x0: rect.x, x1: rect.x + rect.w });
    else barsOfLane.set(lane, [{ x0: rect.x, x1: rect.x + rect.w }]);
    // Every bar in a lane shares one vertical extent (`activityRect`'s `top` depends on the lane
    // and BAR_HEIGHT alone), so one (top, bottom) pair per lane is exact rather than an
    // approximation — and it is why thinning the bar cannot reduce occlusion: a leg runs at its
    // bar's CENTRE-LINE, so the question is pure x-overlap and the bar's height never enters it
    // (spec decision D9).
    if (!extentOfLane.has(lane)) extentOfLane.set(lane, { top: rect.y, bottom: rect.y + rect.h });
  }

  /** Which bar does the point `(x, y)` sit on the edge of? The signature of a link's own anchor. */
  const barAt = (x: number, y: number): string | null => {
    for (const [lane, extent] of extentOfLane) {
      if (y < extent.top - EPS_Y || y > extent.bottom + EPS_Y) continue;
      const bars = barsOfLane.get(lane) ?? [];
      for (let i = 0; i < bars.length; i += 1) {
        if (x >= bars[i]!.x0 - EPS_X && x <= bars[i]!.x1 + EPS_X) return `${lane}:${i}`;
      }
    }
    return null;
  };

  return { index, barsOfLane, extentOfLane, barAt };
}

/**
 * One polyline's occlusion, against one {@link occlusionContext}.
 *
 * **A link's own two anchors are recovered from the polyline's ends rather than from an id.** A
 * recorded path carries no link identity (ADR-0149 D1 records why the recorder is built the way it
 * is), but `routeOrthogonal`'s first and last points ARE the source and target anchors, and each
 * sits on its bar's edge by construction. Running over your own bar is what a backward link does
 * necessarily and is NOT the reported complaint — "the logic is mapping across other bars" — so the
 * avoidable denominator (FC-L4) counts only the rest.
 *
 * The discriminator has an independent control rather than an argument: at ONE BAR PER LANE no lane
 * holds a foreign bar at all, so `foreign` must read exactly ZERO. Predicted before the first run,
 * asserted by `measure-occlusion.mjs`, which refuses to print otherwise.
 */
export function lineOcclusion(
  pts: readonly Point[],
  ctx: ReturnType<typeof occlusionContext>,
  /**
   * Optional: accumulate FOREIGN incidents by the lane they happened in, and each one's x. An
   * optional out-parameter rather than a second walk of the same legs, because a second walk is a
   * second opinion about which legs there are — the ADR-0065 `routeOrthogonal` argument, one level
   * down.
   */
  foreignByLane?: Map<number, number[]>,
): {
  through: number;
  tangent: number;
  foreign: number;
  grazing: number;
  buriedPx: number;
  horizontals: number;
} {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const own = new Set<string>();
  if (first) {
    const id = ctx.barAt(first.x, first.y);
    if (id !== null) own.add(id);
  }
  if (last) {
    const id = ctx.barAt(last.x, last.y);
    if (id !== null) own.add(id);
  }

  let through = 0;
  let tangent = 0;
  let foreign = 0;
  let grazing = 0;
  let buriedPx = 0;
  let horizontals = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (Math.abs(a.y - b.y) > EPS_Y) continue; // vertical corridors are already obstacle-checked
    horizontals += 1;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    for (const [lane, extent] of ctx.extentOfLane) {
      const inside = a.y > extent.top + EPS_Y && a.y < extent.bottom - EPS_Y;
      const onEdge = Math.abs(a.y - extent.top) <= EPS_Y || Math.abs(a.y - extent.bottom) <= EPS_Y;
      if (!inside && !onEdge) continue;
      // The shared predicate decides whether this lane is hit at all. It is OPEN and returns a
      // length, unlike the router's closed `isLaneFreeBetween` — see that function's docblock.
      if (laneOverlapBetween(ctx.index, lane, lo, hi) <= EPS_X) {
        // Zero (or sub-pixel) length: the leg touches a bar edge and hides nothing. That is the
        // signature of its own anchor, and it is COUNTED AND REPORTED rather than dropped.
        if (!isLaneFreeBetween(ctx.index, lane, lo, hi)) grazing += 1;
        continue;
      }
      const bars = ctx.barsOfLane.get(lane) ?? [];
      for (let j = 0; j < bars.length; j += 1) {
        const overlap = Math.min(hi, bars[j]!.x1) - Math.max(lo, bars[j]!.x0);
        if (overlap <= EPS_X) continue;
        buriedPx += overlap;
        if (inside) through += 1;
        else tangent += 1;
        if (!own.has(`${lane}:${j}`)) {
          foreign += 1;
          if (foreignByLane) {
            const at = foreignByLane.get(lane) ?? [];
            at.push((Math.max(lo, bars[j]!.x0) + Math.min(hi, bars[j]!.x1)) / 2);
            foreignByLane.set(lane, at);
          }
        }
      }
    }
  }
  return { through, tangent, foreign, grazing, buriedPx, horizontals };
}

/**
 * How many of a plan's links have a horizontal leg running **through a bar**, how many merely
 * **touch** one, and how many cross a bar that is not their own.
 *
 * ## Why this is a different quantity from {@link countCrossings}
 *
 * `crossingsOf` counts segment-versus-segment against a `SegmentIndex` built from link polylines
 * ONLY. Bars are not in it, and they structurally could not be: {@link recordingCtx} discards
 * `fillRect` entirely (`fillRect: () => {}`), which is how a bar is painted. So the instrument Part
 * C judged four milestones with was **incapable of seeing the thing the product owner was
 * complaining about** — "the logic is mapping across other bars" — and ADR-0149's −20.8 % is a true
 * statement about link-versus-link that says nothing at all about this.
 *
 * ## Why a leg can run through a bar at all
 *
 * `routeOrthogonal` applies its obstacle check to the vertical corridor only, and only across
 * `crossedLanes(fromLane, toLane)` — the lanes strictly BETWEEN the two endpoints. The two
 * horizontal legs run at `from.y` and `to.y`, the source and target bars' centre-lines, and are
 * checked against nothing. A leg therefore runs straight through any bar sharing its lane between
 * the anchor and the corridor. Links paint UNDER bars (`paint.ts` Layer 2 against Layer 3), so the
 * line does not overlap the bar — it **disappears behind it**, which is worse for tracing.
 *
 * ## Tangency is its own column, and that is a correction this function carries
 *
 * The first version tested `a.y > r.y1 && a.y < r.y2` — strictly inside a bar's vertical extent.
 * `gutterY` expands to **exactly** the upper lane's bar bottom at every pitch (ADR-0149 D3's
 * arithmetic; at `originY = 32`, lane 0, both are 55.0), so **every gutter leg scored zero**. The
 * relayed **77.1 %** was taken with that blind spot and is a FLOOR, never a measurement — measured,
 * the headroom is 6 links (3.2 pp).
 */
export function countOcclusions(
  links: readonly RecordedPath[],
  scene: TsldScene,
  view: Viewport,
): {
  occluded: number;
  tangentOnly: number;
  incidents: number;
  tangentIncidents: number;
  horizontals: number;
  grazing: number;
  buriedPx: number;
  foreign: number;
  foreignLinks: number;
  twoPointForeign: number;
  twoPointLinks: number;
} {
  const ctx = occlusionContext(scene, view);
  let occluded = 0;
  let tangentOnly = 0;
  let incidents = 0;
  let tangentIncidents = 0;
  let horizontals = 0;
  let grazing = 0;
  let buriedPx = 0;
  let foreign = 0;
  let foreignLinks = 0;
  let twoPointForeign = 0;
  let twoPointLinks = 0;
  for (const link of links) {
    if (link.pts.length === 2) twoPointLinks += 1;
    const r = lineOcclusion(link.pts, ctx);
    incidents += r.through;
    tangentIncidents += r.tangent;
    horizontals += r.horizontals;
    grazing += r.grazing;
    buriedPx += r.buriedPx;
    foreign += r.foreign;
    if (r.through > 0) occluded += 1;
    else if (r.tangent > 0) tangentOnly += 1;
    if (r.foreign > 0) {
      foreignLinks += 1;
      // **Spec §0.3's same-lane mechanism, counted apart from every other kind.** `routeOrthogonal`
      // returns `[from, to]` before obstacles are consulted whenever the two anchors share a y
      // (`link-routing.ts:182`), so a two-point polyline is a link that was never routed at all.
      // `packLanes` packs by time, so A→C in one lane draws straight through the B between them —
      // which is why the complaint arrived about "even a simple plan", where there are few lanes and
      // most links are same-lane. It is a different defect from a long route meeting a far bar, and
      // a single total would let M2 look effective while leaving the small-plan case untouched.
      if (link.pts.length === 2) twoPointForeign += 1;
    }
  }
  return {
    occluded,
    tangentOnly,
    incidents,
    tangentIncidents,
    horizontals,
    grazing,
    buriedPx,
    foreign,
    foreignLinks,
    twoPointForeign,
    twoPointLinks,
  };
}

/**
 * Symptom **(d)** — how many horizontal legs share one y in a gutter, and how many of them run
 * inside a bar.
 *
 * **M-C0-T4's definitions, reproduced exactly, on the SAME recorded paths as the occlusion count.**
 * `gutterReadings` already measures this and reported 68 gutter legs, 12 distinct y, 13 on one y and
 * 58 touching a bar — but it selects its own scene from `unit300BandConfigs` and pins `originY` at
 * 32, so reading FC-L0's columns from it and the occlusion columns from {@link readBoth} would be
 * two pictures of possibly two plans. Every column of the vector comes from one paint of one scene,
 * which is the whole reason this is here rather than a second call.
 *
 * ## A gutter leg is STRUCTURAL — the middle segment of a six-point route
 *
 * It used to be "a horizontal whose y sits at a lane's bar bottom", which was the single value
 * `routeOrthogonal`'s VHV route computed. **M1-T1 moved that datum to the lane boundary and this
 * counter went to zero** — not because the legs had gone, but because the instrument was looking
 * for them at the old y. It reported `0 gutter legs, 0 touching a bar`, which is the shape of a
 * triumph and was the shape of a blind spot: `legsTouchingABar = 0` out of **nothing found**.
 *
 * So the definition is now the one `packGutterChannels` uses — the middle horizontal of a six-point
 * polyline — which is datum-independent and cannot drift from the pass it measures. The **control**
 * is that a scene containing six-point routes must yield gutter legs; it throws otherwise, because
 * that is the failure this paragraph exists to record.
 *
 * `legsTouchingABar` keeps M-C0-T4's CLOSED x test rather than the occlusion count's open one, so
 * the 58-of-68 figure it produced stays comparable; the two conventions are named in
 * {@link laneOverlapBetween} and the difference is a leg's own anchor.
 */
export function gutterStats(
  links: readonly RecordedPath[],
  scene: TsldScene,
  view: Viewport,
): {
  /** The pitch this reading was painted at — every reading says which geometry it describes. */
  laneHeight: number;
  gutterLegs: number;
  distinctGutterY: number;
  maxLegsOnOneY: number;
  legsTouchingABar: number;
  peakGutterOverlap: number;
  maxOverlappingOnOneY: number;
  channels: number;
  clearBandPx: number;
  /** The GROSS band the thin bar hands back, before the row spends any of it (FC-L11). */
  grossBandPx: number;
  usableBandPx: number;
  /**
   * The legs themselves, so `gutterReadings` measures clearance against the SAME set rather than
   * running a second search — which is exactly how the two diverged (M3-T4).
   */
  legs: readonly { y: number; x0: number; x1: number }[];
} {
  const pad = (LANE_HEIGHT - BAR_HEIGHT) / 2;
  const legs: { y: number; x0: number; x1: number }[] = [];
  let vhvRoutes = 0;
  for (const link of links) {
    if (link.pts.length !== 6) continue;
    vhvRoutes += 1;
    const a = link.pts[2]!;
    const b = link.pts[3]!;
    if (Math.abs(a.y - b.y) > EPS_Y || Math.abs(a.x - b.x) < EPS_Y) continue;
    legs.push({ y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
  }
  if (vhvRoutes > 0 && legs.length === 0) {
    throw new Error(
      `INDETERMINATE: ${String(vhvRoutes)} six-point routes were painted and no gutter leg was ` +
        `found in any of them. The counter is looking in the wrong place, and "0 legs touching a ` +
        `bar" would be a blind spot wearing a triumph's clothes. Refusing to judge.`,
    );
  }

  const bars = scene.activities.flatMap((activity) => {
    const rect = activityRect(activity, view, scene.dataDate);
    return rect === null
      ? []
      : [{ top: rect.y, bottom: rect.y + rect.h, x0: rect.x, x1: rect.x + rect.w }];
  });

  const byY = new Map<number, number>();
  for (const leg of legs) byY.set(leg.y, (byY.get(leg.y) ?? 0) + 1);

  // **FC-L3's second limb needs a denominator**: `max legs on one y` is only meaningful against how
  // many runs genuinely coincide. Grouping by the lane boundary each leg belongs to — NOT by its
  // channel, which is the thing under test — a sweep over the interval endpoints gives the largest
  // number of runs alive at any single x, which is the most channels that gutter could ever need.
  const boundaryOf = (y: number): number => Math.round((y - view.originY) / LANE_HEIGHT);
  const byGutter = new Map<number, { x0: number; x1: number }[]>();
  for (const leg of legs) {
    const key = boundaryOf(leg.y);
    byGutter.set(key, [...(byGutter.get(key) ?? []), { x0: leg.x0, x1: leg.x1 }]);
  }
  const peakOf = (runs: { x0: number; x1: number }[]): number => {
    const events = runs.flatMap((r) => [
      { x: r.x0, d: 1 },
      { x: r.x1, d: -1 },
    ]);
    events.sort((a, b) => a.x - b.x || a.d - b.d);
    let live = 0;
    let peak = 0;
    for (const e of events) {
      live += e.d;
      if (live > peak) peak = live;
    }
    return peak;
  };
  let peakGutterOverlap = 0;
  for (const runs of byGutter.values()) {
    peakGutterOverlap = Math.max(peakGutterOverlap, peakOf(runs));
  }

  /**
   * **FC-L3's second limb means OVERLAPPING legs on one y, and says "legs on one y".**
   *
   * Its bound is `max legs on one y <= ceil(peak gutter overlap / channels)`, and a channel
   * legitimately carries many runs that do not overlap each other — that is the whole point of
   * packing by x-interval. Measured after M1, Unit 300 reads peak 5 over 3 channels, so the literal
   * bound is 2 and `maxLegsOnOneY` is 7: a FAIL that describes correct behaviour.
   *
   * So both are reported. The literal one is judged as written (this file never softens a threshold
   * after measuring it), and this one is what the condition is for: no two runs that overlap in x
   * may share a y beyond what the channel count forces.
   */
  const byChannelY = new Map<number, { x0: number; x1: number }[]>();
  for (const leg of legs) {
    byChannelY.set(leg.y, [...(byChannelY.get(leg.y) ?? []), { x0: leg.x0, x1: leg.x1 }]);
  }
  let maxOverlappingOnOneY = 0;
  for (const runs of byChannelY.values()) {
    maxOverlappingOnOneY = Math.max(maxOverlappingOnOneY, peakOf(runs));
  }

  let touching = 0;
  for (const leg of legs) {
    for (const bar of bars) {
      if (bar.x1 < leg.x0 || bar.x0 > leg.x1) continue;
      if (leg.y >= bar.top - EPS_Y && leg.y <= bar.bottom + EPS_Y) {
        touching += 1;
        break;
      }
    }
  }

  return {
    laneHeight: LANE_HEIGHT,
    gutterLegs: legs.length,
    distinctGutterY: byY.size,
    maxLegsOnOneY: legs.length === 0 ? 0 : Math.max(...byY.values()),
    legsTouchingABar: touching,
    peakGutterOverlap,
    maxOverlappingOnOneY,
    channels: gutterChannels(rowSlots(0).clearHalfBandPx).length,
    // **The CLEAR band, not the raw one** (M3-T3). The gross figure — `LANE_HEIGHT - BAR_HEIGHT` —
    // is what a thin bar hands back before the row's name and date rows take theirs, and FC-L11
    // forbids quoting it alone. Both are reported so the net and the gross are never confused.
    clearBandPx: rowSlots(0).clearHalfBandPx * 2,
    grossBandPx: LANE_HEIGHT - BAR_HEIGHT,
    // What a channel may actually use: a channel at the band's own edge IS the bar edge, so the
    // usable span is the band less one pixel each side. Derived from `pad` rather than written as a
    // constant, so it re-scales when M3 thins the bar (FC-L3's amendment requires exactly that).
    usableBandPx: Math.max(0, 2 * (pad - 1) + 1),
    legs,
  };
}

/**
 * A polyline set's digest, **order-insensitive**, so a model line set and a recorded one can be
 * compared without draw order mattering. The edge layer uses no arcs, so a route's points and its
 * recorded points are the same numbers — which is what makes byte-identity the right control for
 * {@link avoidableOcclusions} rather than "close enough".
 */
export function sortedDigest(lines: readonly (readonly Point[])[]): string {
  const digest = createHash('sha256');
  for (const key of lines
    .map((pts) => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(';'))
    .sort())
    digest.update(`${key}|`);
  return digest.digest('hex').slice(0, 12);
}

/** Sub-pixel tolerances. `EPS_Y` decides tangency, which is an exact-equality question in theory
 *  (`gutterY` IS the bar bottom) and a float question in practice. */
const EPS_Y = 0.01;
const EPS_X = 0.5;

/** One whole-plan reading carrying BOTH quantities, from **one** paint (M0-T1 step 3). */
export function readBoth(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
  pxPerDay: number,
  originY = 32,
): CrossingReading &
  ReturnType<typeof countOcclusions> &
  ReturnType<typeof gutterStats> & { edges: number; sortedFingerprint: string } {
  const acts = asap.activities as { key: string }[];
  const maxDay = Math.max(...acts.map((a) => asap.finish.get(a.key) ?? 0));
  const worstLanes = Math.max(layout.lanes, 145);
  const vp = {
    label: 'whole-plan',
    width: (maxDay + 4) * pxPerDay + 400,
    height: worstLanes * LANE_HEIGHT + 200,
  };
  const { scene, edges } = sceneFor(asap, layout);
  const view: Viewport = { pxPerDay, originX: 40, originY };

  const { ctx, paths } = recordingCtx();
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    scene,
    view,
    { width: vp.width, height: vp.height },
    PALETTE,
    1,
  );
  const links = linkPaths(paths);
  const { crossings, segments, diagonal } = countCrossings(links);
  const digest = createHash('sha256');
  for (const link of links) {
    for (const pt of link.pts) digest.update(`${pt.x.toFixed(2)},${pt.y.toFixed(2)};`);
    digest.update('|');
  }
  return {
    layout: layout.name,
    lanes: layout.lanes,
    viewport: vp.label,
    pxPerDay,
    originY,
    edges,
    visibleLinks: links.length,
    crossings,
    perLink: links.length === 0 ? 0 : crossings / links.length,
    segments,
    diagonal,
    fingerprint: digest.digest('hex').slice(0, 12),
    sortedFingerprint: sortedDigest(links.map((l) => l.pts)),
    ...countOcclusions(links, scene, view),
    ...gutterStats(links, scene, view),
  };
}

/** {@link gutterStats} for a scene, painting it once — the sibling of {@link worstOcclusionLane}. */
export function gutterReadingFor(
  scene: TsldScene,
  view: Viewport,
  size: { width: number; height: number },
): ReturnType<typeof gutterStats> {
  const { ctx, paths } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  return gutterStats(linkPaths(paths), scene, view);
}

/**
 * **Which lane carries the worst occlusion cluster?** (M0-T5)
 *
 * A picture of a quiet area shows a case nobody complained about, so the frame is centred on the
 * worst cluster **measured rather than chosen** — `sceneForShot`'s rule, applied to occlusion
 * instead of to gutter runs. Returns the lane with the most foreign incidents, and the count, so a
 * caller can print what it framed rather than assert that it framed the right thing.
 */
export function worstOcclusionLane(
  scene: TsldScene,
  view: Viewport,
  size: { width: number; height: number },
): { lane: number; incidents: number; x: number } {
  const { ctx: recorder, paths } = recordingCtx();
  paintScene(recorder as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  const links = linkPaths(paths);
  const ctx = occlusionContext(scene, view);
  const byLane = new Map<number, number[]>();
  for (const link of links) lineOcclusion(link.pts, ctx, byLane);
  let lane = 0;
  let incidents = -1;
  // Ascending lane order on a tie, so two runs of the same scene frame the same picture.
  for (const key of [...byLane.keys()].sort((a, b) => a - b)) {
    const n = (byLane.get(key) ?? []).length;
    if (n > incidents) {
      lane = key;
      incidents = n;
    }
  }
  // The MEDIAN incident x, not the mean: a lane with a tight cluster and one distant outlier would
  // otherwise be framed on empty canvas between them, which is a picture of nothing.
  const xs = [...(byLane.get(lane) ?? [])].sort((a, b) => a - b);
  const x = xs.length === 0 ? 0 : xs[Math.floor(xs.length / 2)]!;
  return { lane, incidents: Math.max(0, incidents), x };
}

// ── M0-T3: the AVOIDABLE denominator, computed from routes rather than from a recording ─────────

/**
 * FC-L4's denominator: **of the links whose legs cross a bar that is not their own, how many could
 * have been routed clear with the corridor machinery that already exists?**
 *
 * FC-L4's threshold is a fraction of this number, and the fraction was committed before the number
 * existed. So the number is produced here, before M2 is built, and neither can be adjusted to suit
 * the other afterwards.
 *
 * ## Why this reads routes and not the recording
 *
 * Every other reading in this file measures the painter's OUTPUT, which is right for "what does a
 * planner see". This asks a counterfactual — *what would a different corridor have drawn?* — and a
 * recorded polyline cannot answer it: it is one line, already chosen. So the line set is rebuilt
 * from the scene through the same three functions `paint.ts` uses, in the same order.
 *
 * **That reconstruction is not asserted, it is CHECKED.** `avoidableOcclusions` returns a digest of
 * its model lines, sorted so draw order cannot matter, and {@link readBoth} returns the same digest
 * of the recorded ones. Equal digests mean the model set IS the painted set, point for point, and
 * the denominator is exact rather than approximate; the harness prints both and says which it got.
 * The edge layer uses no arcs, so a route's points and its recorded points are the same numbers.
 *
 * ## What counts as avoidable
 *
 * For each foreign-occluded link, every x in `routeOrthogonal`'s own candidate list is tried — the
 * preferred elbow, `± 2 × gap`, the midpoint, `max(from, to) + 3 × gap` — plus the VHV gutter route.
 * A candidate counts only if the resulting polyline has **no foreign occlusion on any leg** AND its
 * corridor is free across every lane it crosses, which is the same pair of conditions M2 would have
 * to satisfy. A link with no such candidate is **unavoidable by corridor choice alone** and is what
 * the 30 % residue FC-L4 allows is expected to be made of.
 */
export function avoidableOcclusions(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
  pxPerDay: number,
  originY = 32,
): {
  modelLinks: number;
  modelForeignLinks: number;
  avoidable: number;
  avoidableByCandidate: number;
  avoidableByGutter: number;
  avoidableWithClearGutter: number;
  avoidableByClearGutter: number;
  avoidableByAnyCorridor: number;
  avoidableByTightGutter: number;
  avoidableByEither: number;
  sortedFingerprint: string;
} {
  const { scene } = sceneFor(asap, layout);
  const view: Viewport = { pxPerDay, originX: 40, originY };
  const index = laneIntervalIndex(scene.activities, view, scene.dataDate);
  const ctx = occlusionContext(scene, view);
  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const gap = corridorGap(view);

  const obstaclesFor = (fromLane: number, toLane: number) => ({
    index,
    fromLane,
    toLane,
    laneHeight: LANE_HEIGHT,
    barHeight: BAR_HEIGHT,
  });

  // The model line set, built through the same three functions `paint.ts` uses, in the same order:
  // `lagAnchorPoints` -> `routeOrthogonal` -> `chooseCorridorsByCrossing` -> `bundleCorridors`.
  const corridors: { line: Point[]; fromLane: number; toLane: number }[] = [];
  const built: { from: Point; to: Point; type: string; fromLane: number; toLane: number }[] = [];
  for (const edge of scene.edges) {
    const pred = byId.get(edge.predecessorId);
    const succ = byId.get(edge.successorId);
    if (!pred || !succ) continue;
    const anchors = lagAnchorPoints(
      pred,
      succ,
      edge.type,
      edge.lagDays ?? 0,
      view,
      scene.dataDate,
      ELAPSED_DAY_WALK,
    );
    if (!anchors) continue;
    // Fan-out is retired (M3-T3): every link converges on its bar's node glyph, so the anchors
    // the painter routes from are the unshifted ones.
    const from = anchors.pred;
    const to = anchors.succ;
    // The endpoint spans the painter passes after M2-T2. Without them the model set stops matching
    // the picture and the digest control below reports DIVERGENT — which it did, on the first run
    // after M2 landed, rather than quietly producing a denominator from the wrong lines.
    const predRect = activityRect(pred, view, scene.dataDate);
    const succRect = activityRect(succ, view, scene.dataDate);
    const line = routeOrthogonal(from, to, edge.type, view, 0, {
      ...obstaclesFor(pred.laneIndex, succ.laneIndex),
      ...(predRect ? { fromSpan: { x0: predRect.x, x1: predRect.x + predRect.w } } : {}),
      ...(succRect ? { toSpan: { x0: succRect.x, x1: succRect.x + succRect.w } } : {}),
    });
    corridors.push({ line, fromLane: pred.laneIndex, toLane: succ.laneIndex });
    built.push({
      from,
      to,
      type: edge.type,
      fromLane: pred.laneIndex,
      toLane: succ.laneIndex,
    });
  }
  chooseCorridorsByCrossing(corridors, index, gap);
  bundleCorridors(corridors, index);
  // **Last, exactly as the painter calls it** (M1-T3). Omitting it left the model carrying the same
  // occlusion as the picture and a different geometry — caught by the digest below, which is the
  // reason that control compares fingerprints and not counts.
  packGutterChannels(corridors, rowSlots(0).clearHalfBandPx);

  const sortedFingerprint = sortedDigest(corridors.map((c) => c.line));

  let modelForeignLinks = 0;
  let avoidable = 0;
  let avoidableByCandidate = 0;
  let avoidableByGutter = 0;
  let avoidableWithClearGutter = 0;
  let avoidableByClearGutter = 0;
  let avoidableByAnyCorridor = 0;
  let avoidableByTightGutter = 0;
  let avoidableByEither = 0;
  for (let i = 0; i < corridors.length; i += 1) {
    if (lineOcclusion(corridors[i]!.line, ctx).foreign === 0) continue;
    modelForeignLinks += 1;
    const b = built[i]!;
    const crossed: number[] = [];
    for (
      let lane = Math.min(b.fromLane, b.toLane) + 1;
      lane < Math.max(b.fromLane, b.toLane);
      lane += 1
    )
      crossed.push(lane);
    const corridorFree = (x: number): boolean =>
      crossed.every((lane) => isLaneFreeBetween(index, lane, x, x));
    const clear = (line: Point[], x: number): boolean =>
      corridorFree(x) && lineOcclusion(line, ctx).foreign === 0;

    // `routeOrthogonal`'s own candidate list, recomputed here in its own order. The `preferred`
    // expression is duplicated rather than imported because that function returns a LINE and this
    // needs the x it chose; the duplication is pinned by the digest control above, which would
    // diverge the moment the two disagreed about what `preferred` is.
    const preferred =
      b.type === 'FS'
        ? b.from.x + gap
        : b.type === 'SS'
          ? Math.min(b.from.x, b.to.x) - gap
          : b.type === 'FF'
            ? Math.max(b.from.x, b.to.x) + gap
            : (b.from.x + b.to.x) / 2;
    const candidates = [
      preferred,
      ...[
        preferred + gap * 2,
        preferred - gap * 2,
        (b.from.x + b.to.x) / 2,
        Math.max(b.from.x, b.to.x) + gap * 3,
      ].slice(0, MAX_CORRIDOR_CANDIDATES),
    ];
    const byCandidate = candidates.some((x) =>
      clear([b.from, { x, y: b.from.y }, { x, y: b.to.y }, b.to], x),
    );

    // The VHV gutter route, the router's last structured attempt.
    const gutterLane = Math.min(b.fromLane, b.toLane);
    const gutterY = view.originY + (gutterLane + 1) * LANE_HEIGHT - (LANE_HEIGHT - BAR_HEIGHT) / 2;
    const near = preferred + gap * 2;
    const far = (b.from.x + b.to.x) / 2;
    const gutterLine: Point[] = [
      b.from,
      { x: near, y: b.from.y },
      { x: near, y: gutterY },
      { x: far, y: gutterY },
      { x: far, y: b.to.y },
      b.to,
    ];
    const byGutter = lineOcclusion(gutterLine, ctx).foreign === 0;

    /**
     * **The same gutter route with M1's channel already in it, measured before M1 is built.**
     *
     * Today `gutterY` expands to exactly the upper lane's bar BOTTOM at every pitch (ADR-0149 D3),
     * so the router's last structured escape runs along a bar edge and through any bar it passes —
     * M-C0-T4 measured 58 of Unit 300's 68 gutter legs as lying inside a painted bar at 0.0 px
     * clearance. That is why `avoidableByGutter` rescues almost nothing, and it means the escape
     * the router already has has never been usable.
     *
     * Moving it to the lane boundary — the middle of the clear band, where a bar can never be —
     * is M1's subject. Measuring it here says what M1 is worth to M2's ceiling BEFORE either is
     * built, which is the whole point of doing M0 first.
     */
    const clearGutterY = view.originY + (gutterLane + 1) * LANE_HEIGHT;
    const clearGutterLine: Point[] = [
      b.from,
      { x: near, y: b.from.y },
      { x: near, y: clearGutterY },
      { x: far, y: clearGutterY },
      { x: far, y: b.to.y },
      b.to,
    ];
    const byClearGutter = lineOcclusion(clearGutterLine, ctx).foreign === 0;

    /**
     * **Is the candidate LIST too narrow, or is there no clear corridor at all?** An unrestricted
     * sweep of every x at 1 px across the anchors' span plus three gaps either side. If this is far
     * above `byCandidate`, M2's remedy is "widen the search", which is cheap; if it is about the
     * same, no elbow position works and the answer is room rather than routing — a completely
     * different epic. Unbounded search is NOT a proposal for the paint path (ADR-0065's bounded,
     * fixed-order rule stands); it is the ceiling that says which remedy to build.
     */
    const lo = Math.min(b.from.x, b.to.x) - gap * 3;
    const hi = Math.max(b.from.x, b.to.x) + gap * 3;
    let byAnyCorridor = false;
    for (let x = Math.round(lo); x <= hi && !byAnyCorridor; x += 1) {
      if (clear([b.from, { x, y: b.from.y }, { x, y: b.to.y }, b.to], x)) byAnyCorridor = true;
    }

    /**
     * **The VHV route with BOTH legs hugging their anchors**, in a clear channel.
     *
     * The shipped gutter route puts its far corridor at `(from.x + to.x) / 2`, so the leg at the
     * target's y runs half the span and meets whatever is in the way — which is why a clear channel
     * alone rescues almost nothing. Leaving each lane immediately and travelling in the gutter is
     * the shape that makes the legs short at BOTH ends, and this measures it before it is designed.
     */
    const tightNear = b.from.x < b.to.x ? b.from.x + gap : b.from.x - gap;
    const tightFar = b.from.x < b.to.x ? b.to.x - gap : b.to.x + gap;
    const tightLine: Point[] = [
      b.from,
      { x: tightNear, y: b.from.y },
      { x: tightNear, y: clearGutterY },
      { x: tightFar, y: clearGutterY },
      { x: tightFar, y: b.to.y },
      b.to,
    ];
    const byTightGutter = lineOcclusion(tightLine, ctx).foreign === 0;

    if (byAnyCorridor) avoidableByAnyCorridor += 1;
    if (byTightGutter) avoidableByTightGutter += 1;
    if (byAnyCorridor || byTightGutter) avoidableByEither += 1;
    if (byCandidate) avoidableByCandidate += 1;
    if (byGutter) avoidableByGutter += 1;
    if (byClearGutter) avoidableByClearGutter += 1;
    if (byCandidate || byGutter) avoidable += 1;
    if (byCandidate || byGutter || byClearGutter) avoidableWithClearGutter += 1;
  }

  return {
    modelLinks: corridors.length,
    modelForeignLinks,
    avoidable,
    avoidableByCandidate,
    avoidableByGutter,
    avoidableWithClearGutter,
    avoidableByClearGutter,
    avoidableByAnyCorridor,
    avoidableByTightGutter,
    avoidableByEither,
    sortedFingerprint,
  };
}

/**
 * **What the pitch costs the deliverable, the overview and the reader's window** (logic-legibility
 * M3-T4, FC-L7).
 *
 * FC-L7 is **reported, never used to bound height** (decision 2) — the product owner removed the row
 * cap deliberately, so a number here is a cost to state and not a veto. Three limbs, and the third
 * is the one the condition insists be measured rather than assumed.
 *
 * - **Export.** `buildExportViewport` sizes the `whole` raster as `(maxLane + 1) * LANE_HEIGHT`
 *   plus the reserved bands, so the height term is **linear in the pitch**. Read at the product
 *   owner's own `devicePixelRatio = 1.75` (FC-C7's rule, reused), because the raster is `size × dpr`
 *   and reading at 1 overstates the headroom by that factor.
 * - **Minimap `pxPerLane`.** `minimap.ts:212` is `box.height / laneCount` — the box is allocated
 *   across **lanes**, not across scene pixels, and `minimap-axes.structural.test.ts` bans the name
 *   `LANE_HEIGHT` from that module. So the pitch structurally cannot move it. Measured anyway: a
 *   figure that is invariant **because a gate forbids the dependency** is worth printing, and the
 *   alternative is asserting a structural claim in a document.
 * - **The reader's window inside the minimap.** `sceneWindowRect` takes `sceneLaneHeight` as a
 *   parameter, and `visibleLanes = size.height / sceneLaneHeight`. **This is where the pitch lands**:
 *   a taller row means fewer lanes on screen, so the rectangle that says "you are here" covers less
 *   of the plan. It is the orientation cost of decision 6, and it is a real number rather than the
 *   "no lane remedy touches the minimap" reading `docs/TECH_DEBT.md` #323 would otherwise licence.
 */
export function rowCosts(
  path: string,
  pxPerDays: readonly number[],
  options: { rollUpSummaries?: boolean; scaleTo?: number } = {},
): {
  laneHeight: number;
  pxPerDay: number;
  lanes: number;
  exportWidth: number;
  exportHeight: number;
  rasterWidth: number;
  rasterHeight: number;
  scaledToFit: boolean;
  pxPerLane: number;
  minimapLaneCount: number;
  visibleLanes: number;
  windowRectHeight: number;
}[] {
  /**
   * **`scaleTo` names the fixture FC-L7's "largest measured" clause is about.** Unit 300 is 21
   * lanes; ADR-0128's canvas scenes are 2,000 activities, and the export's height term is
   * `(maxLane + 1) * LANE_HEIGHT`. A reading taken only on Unit 300 would report acres of headroom
   * on the fixture where the cap cannot bind.
   */
  let scene: TsldScene;
  if (options.scaleTo === undefined) {
    const { asap, configs } = unit300BandConfigs(path, options);
    const config = configs.find((c) => c.layout.name.startsWith('B '));
    if (!config) throw new Error('the band-off arranged configuration is missing');
    scene = sceneFor(asap, config.layout).scene;
  } else {
    const source = scaleScene(options.scaleTo);
    scene = {
      activities: source.activities,
      edges: source.edges,
      dataDate: '2026-01-01',
      visualRefresh: true,
      timeTrueLinks: true,
      linkRouting: true,
    };
  }
  /** The product owner's own display (FC-C7), and the viewport ADR-0091 M7 made permanent. */
  const DPR = 1.75;
  const LIVE = { width: 1646, height: 681 };
  /**
   * `MINIMAP_BOX` is exported from a `.tsx` component, so importing it would pull React into a
   * node probe. It is restated here and **checked against the source**, because a restated
   * constant that drifts reports the old box under the new box's name.
   */
  const box = { width: 200, height: 120 };
  // Resolved from the working directory, never from `import.meta.url`: the sweep bundles this
  // file into a temp directory, where a path relative to the module resolves outside the repo.
  const declared = readFileSync('src/features/tsld/components/TsldMinimap.tsx', 'utf8');
  const expected = `export const MINIMAP_BOX: MinimapBox = { width: ${String(box.width)}, height: ${String(box.height)} };`;
  if (!declared.includes(expected)) {
    throw new Error(
      `rowCosts INDETERMINATE: \`MINIMAP_BOX\` is no longer \`${expected}\`. The figures below ` +
        'would describe a box the product does not draw. Refusing to measure.',
    );
  }

  return pxPerDays.map((pxPerDay) => {
    const live = {
      view: { pxPerDay, originX: 40, originY: 32 },
      size: LIVE,
    };
    const ex = buildExportViewport(scene.activities, scene.dataDate, {
      extent: 'whole',
      liveViewport: live,
      dpr: DPR,
    });
    const extent = worldExtent(scene.activities, scene.dataDate);
    if (extent === null) {
      throw new Error(
        'rowCosts INDETERMINATE: the scene has no placeable extent, so the export falls back to ' +
          'the live framing and the minimap draws nothing. There is no row cost to report.',
      );
    }
    const mapping = minimapViewport(extent, box);
    const rect = sceneWindowRect(live.view, LIVE, LANE_HEIGHT, mapping);
    return {
      laneHeight: LANE_HEIGHT,
      pxPerDay,
      lanes: extent.maxLane + 1,
      exportWidth: Math.round(ex.size.width),
      exportHeight: Math.round(ex.size.height),
      rasterWidth: Math.round(ex.size.width * ex.dpr),
      rasterHeight: Math.round(ex.size.height * ex.dpr),
      scaledToFit: ex.scaledToFit,
      pxPerLane: mapping.pxPerLane,
      minimapLaneCount: mapping.laneCount,
      visibleLanes: LIVE.height / LANE_HEIGHT,
      windowRectHeight: rect.true.h,
    };
  });
}

/**
 * **The M4 vector: occlusion, crossings and travel from one paint, with the H1/H2 split**
 * (logic-legibility M4, FC-L6).
 *
 * FC-L6 judges a candidate on three numbers — `occl/link`, `x/link` and mean |Δlane| — and its
 * chain-rows clause demands a **decomposition** on top, because the aggregate structurally cannot
 * tell H1 from H2:
 *
 * - **H1**: a chain drawn on one row needs no traversal, so its links should be occlusion-free.
 * - **H2**: a chain on one row puts more bars in that row, and occlusion is a leg meeting a bar in
 *   **its own lane**, so every link _out_ of the chain has a leg in a crowded row.
 *
 * The split is by **geometry, not by edge identity**: a link is same-row when its polyline's first
 * and last point share a y, which is exactly `routeOrthogonal`'s own same-lane condition
 * (`link-routing.ts:346`). Deriving it from the drawn line rather than from an assumed
 * index-to-edge correspondence means the classification cannot silently disagree with the picture
 * — and there is no correspondence to assume, since the painter is free to reorder or omit.
 *
 * Travel comes from `statsFor`, the function `lane-travel-probe.ts` already uses for the figures
 * `cheap-levers.md` quotes, rather than a second mean-|Δlane| written here.
 */
export function readVector(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
  pxPerDay = 4,
  /**
   * The pan (NetPoint-layout M0-T2). Default 32 is what every earlier caller measured at, so they
   * are unchanged; the baseline sweeps {0, 32, 200, 500} to ESTABLISH pan invariance rather than
   * assume it (`measure-occlusion.mjs`'s reason for sweeping pans at all).
   */
  originY = 32,
): {
  name: string;
  lanes: number;
  visibleLinks: number;
  /** Worst count of gutter legs overlapping in x on one y — ADR-0151's "stacked lines" figure. */
  maxOverlappingOnOneY: number;
  /** The pitch the painter actually used — so a pitch substitution that did not take is visible. */
  laneHeight: number;
  crossings: number;
  perLink: number;
  foreignLinks: number;
  occlPerLink: number;
  meanDelta: number;
  overFive: number;
  sameRow: { links: number; foreignLinks: number };
  crossRow: { links: number; foreignLinks: number };
  /**
   * The same-row count derived from the **layout** (`lane(pred) === lane(succ)`) rather than from
   * the drawn polyline — a second opinion sharing no code with the first.
   *
   * It exists because the first run of M4 reported chain rows and the shipped packing with an
   * **identical** 68/120 split, which is exactly what a classifier that is not seeing the candidate
   * would report. It is not: the two agree, and the coincidence is a real fact about the shipped
   * packer's predecessor hint. A control that had not been run would have left that unknowable.
   */
  sameRowByLane: number;
  fingerprint: string;
} {
  const acts = asap.activities as { key: string }[];
  const deps = asap.dependencies as { predecessorKey: string; successorKey: string }[];
  const maxDay = Math.max(...acts.map((a) => asap.finish.get(a.key) ?? 0));
  const worstLanes = Math.max(layout.lanes, 145);
  const size = {
    width: (maxDay + 4) * pxPerDay + 400,
    // + originY: a positive pan moves the scene DOWN, so the canvas must grow with it or the
    // bottom lanes are culled and the reading covers less than the plan.
    height: worstLanes * LANE_HEIGHT + 200 + originY,
  };
  const { scene } = sceneFor(asap, layout);
  const view: Viewport = { pxPerDay, originX: 40, originY };

  const { ctx, paths } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  const links = linkPaths(paths);
  const { crossings } = countCrossings(links);
  const occl = countOcclusions(links, scene, view);
  const gutter = gutterStats(links, scene, view);

  const occlusion = occlusionContext(scene, view);
  const sameRow = { links: 0, foreignLinks: 0 };
  const crossRow = { links: 0, foreignLinks: 0 };
  for (const link of links) {
    const first = link.pts[0]!;
    const last = link.pts[link.pts.length - 1]!;
    const bucket = Math.abs(first.y - last.y) < 0.001 ? sameRow : crossRow;
    bucket.links += 1;
    if (lineOcclusion(link.pts, occlusion).foreign > 0) bucket.foreignLinks += 1;
  }
  if (sameRow.foreignLinks + crossRow.foreignLinks !== occl.foreignLinks) {
    throw new Error(
      `M4 INDETERMINATE: the decomposition counts ${String(sameRow.foreignLinks + crossRow.foreignLinks)} ` +
        `foreign links and the aggregate counts ${String(occl.foreignLinks)}. The two are reading ` +
        'different things, so H1 and H2 cannot be told apart. Refusing to judge.',
    );
  }

  let sameRowByLane = 0;
  for (const d of deps) {
    const a = layout.laneOf.get(d.predecessorKey);
    const b = layout.laneOf.get(d.successorKey);
    if (a !== undefined && b !== undefined && a === b) sameRowByLane += 1;
  }

  const travel = statsFor(
    layout.laneOf,
    deps.map((d) => ({ from: d.predecessorKey, to: d.successorKey })),
  );
  const digest = createHash('sha256');
  for (const link of links) {
    for (const pt of link.pts) digest.update(`${pt.x.toFixed(2)},${pt.y.toFixed(2)};`);
    digest.update('|');
  }

  return {
    name: layout.name,
    lanes: layout.lanes,
    visibleLinks: links.length,
    maxOverlappingOnOneY: gutter.maxOverlappingOnOneY,
    laneHeight: gutter.laneHeight,
    crossings,
    perLink: links.length === 0 ? 0 : crossings / links.length,
    foreignLinks: occl.foreignLinks,
    occlPerLink: links.length === 0 ? 0 : occl.foreignLinks / links.length,
    meanDelta: travel.meanDelta,
    overFive: travel.overFive,
    sameRow,
    crossRow,
    sameRowByLane,
    fingerprint: digest.digest('hex').slice(0, 12),
  };
}

/**
 * **The shipped packing and every assignment candidate as scenes** (logic-legibility M4).
 *
 * FC-L6's clause says a qualifying candidate goes to the product owner **with a rendered picture**,
 * not with a table — the epic's founding observation is that a diagram satisfying every number was
 * still hard to read, so a verdict taken on the vector alone would be the same mistake one metric
 * further on. The sibling of `layoutScenes`, which serves the same purpose for Part C's three.
 */
export function candidateScenes(path: string): { name: string; scene: TsldScene; lanes: number }[] {
  const { asap, shipped, candidates } = assignmentCandidates(path);
  return [
    { name: shipped.name, scene: sceneFor(asap, shipped).scene, lanes: shipped.lanes },
    ...candidates.map((c) => ({
      name: c.name,
      scene: sceneFor(asap, { name: c.name, laneOf: c.laneOf, lanes: c.lanes }).scene,
      lanes: c.lanes,
    })),
  ];
}

/**
 * **How much of the picture is bar and how much is link?** (logic-legibility M5-T1)
 *
 * M5's first development step is "measure the ink distribution between bars and links … **then**
 * design", because Part A §4.5 listed four candidate terms and said the design picks from the
 * measurement rather than from the list. This supplies the measurement.
 *
 * ## What is counted, and why it is not a pixel count
 *
 * The obvious instrument — render with a mask palette and count pixels — **cannot work here**, and
 * the reason is worth recording: `TsldPalette` has ONE `critical` field, read both by a critical
 * bar's fill and by a critical link's stroke. In the recording context the two are separable by
 * flush kind (`linkPaths` filters on `stroke`), and in a rendered image they are the same colour.
 * A mask would therefore attribute every critical bar to the link total, silently, and report a
 * flattering number for exactly the plans where criticality matters most.
 *
 * So ink is derived instead, in px², from the two sources this epic already trusts:
 *
 * - **links** — `linkPaths`, the epic's own link extractor, summing each polyline's length times
 *   the `lineWidth` it was flushed with. Solid and dashed are reported **apart**, because a dashed
 *   line's ink is a fraction of its length and the fraction is not recoverable from the recording
 *   (`RecordedPath.dashed` is a boolean; the pattern is not captured). Reporting one number that
 *   silently treated a dashed line as solid would overstate exactly the links — the non-driving
 *   ones — that this milestone is about.
 * - **bars** — `activityRect`, the painter's own rect source, which is the same function
 *   `gutterStats` measures bars with, so the two cannot disagree about where a bar is.
 *
 * **Text is NOT counted and that is a gap, not an omission by design**: `fillText` records no
 * geometry, so a label's ink is unmeasurable here. Names sit in the row above the bar after M3, so
 * they are a real part of the picture's weight and the figures below are a bar-versus-link ratio
 * rather than a share of all ink. Said plainly so nobody quotes it as the latter.
 */
export function inkDistribution(
  scene: TsldScene,
  view: Viewport,
  size: { width: number; height: number },
): {
  barCount: number;
  barInkPx2: number;
  linkCount: number;
  linkInkPx2: number;
  solidLinkCount: number;
  solidLinkInkPx2: number;
  dashedLinkCount: number;
  dashedLinkInkPx2: number;
  linkLengthPx: number;
  ratio: number;
  /**
   * **Per-mark weight, which is what "quiet" actually means.** Total ink says how much of the
   * picture a layer occupies; it says nothing about whether one link is easy to follow. A 1 px
   * grey line is quiet whether there are five of them or five hundred. The weight ratio is the
   * figure M5's premise is really about, and M3 moved it by construction when it took the bar from
   * 18 px to 5.
   */
  linkWidths: Record<string, number>;
  barHeightPx: number;
  weightRatio: number;
} {
  const { ctx, paths } = recordingCtx();
  paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  const links = linkPaths(paths);

  let linkInk = 0;
  let linkLength = 0;
  let solidInk = 0;
  let solidCount = 0;
  let dashedInk = 0;
  let dashedCount = 0;
  for (const link of links) {
    let length = 0;
    for (let i = 1; i < link.pts.length; i += 1) {
      const a = link.pts[i - 1]!;
      const b = link.pts[i]!;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const ink = length * link.lineWidth;
    linkLength += length;
    linkInk += ink;
    if (link.dashed) {
      dashedInk += ink;
      dashedCount += 1;
    } else {
      solidInk += ink;
      solidCount += 1;
    }
  }

  const linkWidths: Record<string, number> = {};
  for (const link of links) {
    const key = link.lineWidth.toFixed(2);
    linkWidths[key] = (linkWidths[key] ?? 0) + 1;
  }

  let barInk = 0;
  let barCount = 0;
  let barHeightSum = 0;
  for (const activity of scene.activities) {
    const rect = activityRect(activity, view, scene.dataDate);
    if (rect === null) continue;
    // Culled exactly as the painter culls, so this is the ink of the picture rather than of the plan.
    if (!rectsIntersect(rect, { x: 0, y: 0, w: size.width, h: size.height })) continue;
    barCount += 1;
    barInk += rect.w * rect.h;
    barHeightSum += rect.h;
  }
  // The mean, not the constant: a milestone's diamond and a summary's bracket are not `BAR_HEIGHT`,
  // and quoting the constant would describe a picture made only of tasks.
  const barHeightPx = barCount === 0 ? 0 : barHeightSum / barCount;
  const meanLinkWidth =
    links.length === 0 ? 0 : links.reduce((sum, l) => sum + l.lineWidth, 0) / links.length;

  return {
    barCount,
    barInkPx2: barInk,
    linkCount: links.length,
    linkInkPx2: linkInk,
    solidLinkCount: solidCount,
    solidLinkInkPx2: solidInk,
    dashedLinkCount: dashedCount,
    dashedLinkInkPx2: dashedInk,
    linkLengthPx: linkLength,
    ratio: barInk === 0 ? 0 : linkInk / barInk,
    linkWidths,
    barHeightPx,
    weightRatio: barHeightPx === 0 ? 0 : meanLinkWidth / barHeightPx,
  };
}

/**
 * **A plan in the shape `readVector` reads, from `scaleScene`** (NetPoint-layout M0-T2).
 *
 * `scale-2000` is a drawn scene, not a plan: the generator lays bars out without scheduling them
 * (`scale-scene.ts`), so its `earlyStart`/`earlyFinish` ARE its drawn spans. They are converted to
 * whole days from the same `DATA_DATE` the scene uses, and its own lanes become a layout — the
 * generator's, which is NOT a `packLanes` result, so {@link packedOnDrawn} gives the one that is.
 */
export function scalePlan(count: number): {
  asap: ReturnType<typeof unit300Asap>;
  generator: Layout;
} {
  const source = scaleScene(count);
  const dayOf = (isoDate: string): number =>
    Math.round(
      (Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${DATA_DATE}T00:00:00Z`)) / 86_400_000,
    );
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  for (const a of source.activities) {
    if (a.earlyStart === null) continue;
    start.set(a.id, dayOf(a.earlyStart));
    finish.set(a.id, dayOf(a.earlyFinish ?? a.earlyStart));
  }
  const asap = {
    activities: source.activities.map((a) => ({ key: a.id, type: a.type })),
    dependencies: source.edges.map((e) => ({
      predecessorKey: e.predecessorId,
      successorKey: e.successorId,
      type: e.type,
      lagDays: 0,
    })),
    start,
    finish,
  } as unknown as ReturnType<typeof unit300Asap>;
  const laneOf = new Map(source.activities.map((a) => [a.id, a.laneIndex]));
  return {
    asap,
    generator: {
      name: `scale-${String(count)} (generator lanes)`,
      laneOf,
      lanes: Math.max(...laneOf.values()) + 1,
    },
  };
}

/**
 * **Today's Arrange on any plan in this directory's shape** — `packLanes` over the DRAWN spans with
 * the predecessor hint, exactly as `computeLaneArrangement` calls it since PR #663. This is
 * Re-layout's seed (spec §4.5), so a baseline taken on it is the number Re-layout must not lose to.
 */
export function packedOnDrawn(
  asap: {
    activities: readonly { key: string }[];
    dependencies: readonly { predecessorKey: string; successorKey: string }[];
    start: ReadonlyMap<string, number>;
    finish: ReadonlyMap<string, number>;
  },
  name: string,
): Layout {
  const items: PackItem[] = asap.activities.map((a) => ({
    id: a.key,
    startDay: asap.start.get(a.key) ?? 0,
    endDay: asap.finish.get(a.key) ?? 0,
    laneIndex: -1,
  }));
  const predecessorsOf = new Map<string, string[]>();
  for (const d of asap.dependencies) {
    predecessorsOf.set(d.successorKey, [
      ...(predecessorsOf.get(d.successorKey) ?? []),
      d.predecessorKey,
    ]);
  }
  const laneOf = new Map<string, number>();
  // A sentinel current lane no pack produces, so every item comes back — the same device
  // `computeLaneArrangement` uses to read a full assignment out of the one packer.
  for (const c of packLanes(items, predecessorsOf)) laneOf.set(c.id, c.laneIndex);
  return { name, laneOf, lanes: Math.max(...laneOf.values()) + 1 };
}
