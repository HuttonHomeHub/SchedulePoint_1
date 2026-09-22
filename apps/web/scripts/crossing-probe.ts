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
import { packLanes, type PackItem } from '@repo/layout';

import { scaleScene } from '../src/features/perf-probe/scenes/scale-scene';
import { paintScene, type TsldPalette, type TsldScene } from '../src/features/tsld/render/paint';
import type { Viewport } from '../src/features/tsld/render/render-model';

import { unit300Asap } from './lane-travel-probe';

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
export function recordingCtx(): { ctx: unknown; paths: RecordedPath[] } {
  const paths: RecordedPath[] = [];
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
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };

  return { ctx, paths };
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

/**
 * **Exploratory dump.** Prints every distinct (flush kind, strokeStyle, point-count) combination
 * the painter produced, so the attribution rule is written from what the painter emits rather than
 * from a belief about it.
 *
 * This exists because the plan's rule — "identify link batches by sentinel palette values" — is a
 * hypothesis about a painter nobody has interrogated this way, and §19.11 says a decision-bearing
 * claim names what established it.
 */
export function dump(count: number, pxPerDay: number, originY: number): void {
  const source = scaleScene(count);
  const scene: TsldScene = {
    activities: source.activities,
    edges: source.edges,
    dataDate: '2026-01-01',
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
  };
  const { ctx, paths } = recordingCtx();
  const view: Viewport = { pxPerDay, originX: 40, originY };
  paintScene(
    ctx as Parameters<typeof paintScene>[0],
    scene,
    view,
    { width: 1646, height: 857 },
    PALETTE,
    1,
  );

  const groups = new Map<string, { n: number; pts: Map<number, number>; batches: Set<number> }>();
  for (const p of paths) {
    const key = `${p.flush}\u0000${p.flush === 'fill' ? p.fillStyle : p.strokeStyle}\u0000dash=${p.dashed}\u0000lw=${p.lineWidth}`;
    let g = groups.get(key);
    if (!g) {
      g = { n: 0, pts: new Map(), batches: new Set() };
      groups.set(key, g);
    }
    g.n += 1;
    g.pts.set(p.pts.length, (g.pts.get(p.pts.length) ?? 0) + 1);
    g.batches.add(p.batch);
  }

  console.log(
    `\n  scene ${count} act · ${source.edges.length} edges · ${pxPerDay}px/d · originY ${originY}`,
  );
  console.log(
    `  ${paths.length} recorded paths in ${Math.max(...paths.map((p) => p.batch)) + 1} batches\n`,
  );
  const rows = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [key, g] of rows) {
    const [flush, style, dashed, lw] = key.split('\u0000');
    const shape = [...g.pts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([len, n]) => `${len}pt×${n}`)
      .join(' ');
    const sentinel =
      style === LINK_SENTINELS.edge
        ? ' ← LINK edge'
        : style === LINK_SENTINELS.critical
          ? ' ← LINK critical'
          : style === LINK_SENTINELS.nearCritical
            ? ' ← LINK near-critical'
            : '';
    console.log(
      `    ${String(flush).padEnd(6)} ${String(style).padEnd(9)} ${String(dashed).padEnd(10)} ${String(lw).padEnd(6)} n=${String(g.n).padStart(5)} batches=${String(g.batches.size).padStart(4)}  ${shape}${sentinel}`,
    );
  }
}

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
}

/** The Unit 300 programme as the painter wants it, under a given lane assignment. */
function sceneFor(
  asap: ReturnType<typeof unit300Asap>,
  layout: Layout,
): { scene: TsldScene; edges: number } {
  const activities = (asap.activities as { key: string; type: string }[]).map((a) => ({
    id: a.key,
    type: a.type as never,
    laneIndex: layout.laneOf.get(a.key) ?? 0,
    label: a.key,
    earlyStart: iso(asap.start.get(a.key) ?? 0),
    earlyFinish: iso(asap.finish.get(a.key) ?? 0),
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
      linkRouting: true,
    },
    edges: edges.length,
  };
}

/** The two layouts FC-C1 compares: what ships today, and the worst configuration measured. */
export function unit300Layouts(path: string): {
  asap: ReturnType<typeof unit300Asap>;
  shipped: Layout;
  sourceOrder: Layout;
  scrambled: Layout;
} {
  const asap = unit300Asap(path);
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
export function fc1(path: string): Fc1Result {
  const { asap, shipped, sourceOrder, scrambled } = unit300Layouts(path);
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
