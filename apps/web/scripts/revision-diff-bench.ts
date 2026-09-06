import type { GhostBar } from '../src/features/tsld/render/lenses';
import { dependencyPolyline } from '../src/features/tsld/render/link-routing';
import { paintScene, type TsldScene } from '../src/features/tsld/render/paint';
import type {
  RenderActivity,
  RenderEdge,
  Viewport,
} from '../src/features/tsld/render/render-model';

import { PALETTE } from './link-routing-bench';
import { scaleScene } from './scale-scene';

/**
 * M0 Condition A — does drawing the **difference between two revisions** cost the diagram its
 * smoothness? See `docs/specs/revision-compare-changes/m0-condition.md`, which was committed
 * before this file existed.
 *
 * ## What makes this different from `link-routing-bench.ts`
 *
 * That bench times `paintScene` in a tight `for` loop and reports its wall clock. This one runs
 * under **`requestAnimationFrame`** and reports **frame pacing**, because `docs/TECH_DEBT.md` #75
 * is explicit that duration is the wrong quantity and that the real gate (ADR-0026 §9) is frames
 * per second. A painter can sit comfortably inside 16.7 ms and still drop 10.2 % of frames — #75
 * measured exactly that at Fit — so a duration bench would have reported this feature safe in the
 * one state where the shipped painter is already judder.
 *
 * ## Half the treatment is shipped code, and that is deliberate
 *
 * `paintScene` has taken `baselineGhosts` since ADR-0025's baseline overlay, so the ghost-bar half
 * of a difference overlay is **the real painter**, not a prototype of one — the treatment simply
 * populates that option for the changed set. Only the **changed-link** treatment is new, and it is
 * prototyped here as an honest **upper bound**: a second pass that re-routes each changed edge
 * rather than collecting routes during the main edge pass. A real implementation would collect
 * them (the ADR-0078 §1 per-frame context exists precisely for facts two layers share), so the
 * shipped cost can only be lower than what this reports. A measurement that flatters the feature
 * is worthless; one that over-charges it is merely conservative.
 *
 * ## Why the changed set is synthetic
 *
 * No database and no schema. The set is composed directly at the painter, exactly as
 * `measure-link-routing.mjs` composes its scenes — which is what lets Condition A run **before**
 * M4's migration exists. That ordering is the point (spec §0.3): a withdrawn tier 2b weakens the
 * schema's case before anything is checksummed into a real database.
 */

/** How much of a plan a realistic revision touches. A revision that changed everything would be a
 * different plan; one that changed three bars would measure nothing. 12 % is the fraction the spec
 * uses, and it is stated here rather than buried so a reader can disagree with it in one place. */
const CHANGED_FRACTION = 0.12;

/** Days the ghost is offset from the live bar, so a changed bar's old position is visibly a
 * different rectangle rather than one hidden exactly behind the other (which would under-draw and
 * therefore under-measure). */
const GHOST_SHIFT_DAYS = 4;

export interface PacingResult {
  frames: number;
  /** Percentage of frames whose interval exceeded 1.5x the measured idle interval. */
  droppedPct: number;
  intervalP50: number;
  intervalP95: number;
  fps: number;
}

export interface DiffCounts {
  /** Changed bars whose ghost fell inside the viewport on the first measured frame. */
  visibleChangedBars: number;
  /** Changed links with at least one endpoint inside the viewport on the first measured frame. */
  visibleChangedLinks: number;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? 0;
}

function iso(dayOffset: number): string {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function shiftIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The changed set: every Nth activity, and every Nth edge. Deterministic by index rather than
 * random, so two runs of this harness measure the same picture — a paired design (baseline against
 * treatment, alternating) is meaningless if the treatment's subject moves between pairs.
 */
function changedSet(
  activities: readonly RenderActivity[],
  edges: readonly RenderEdge[],
): { ghosts: GhostBar[]; changedEdges: RenderEdge[] } {
  const stride = Math.max(1, Math.round(1 / CHANGED_FRACTION));
  const ghosts: GhostBar[] = [];
  for (let i = 0; i < activities.length; i += stride) {
    const a = activities[i];
    if (!a) continue;
    // `earlyStart`/`earlyFinish` are null until the plan is recalculated (`geometry.ts:380`). An
    // activity with no dates draws no bar, so it can have no ghost either - skipped rather than
    // coerced, which would invent a date and draw a rectangle the product never would.
    if (a.earlyStart === null || a.earlyFinish === null) continue;
    ghosts.push({
      id: a.id,
      // The OLD dates — the whole point of a ghost. Shifted earlier, which is what a slipped
      // activity looks like and is the common case a planner opens this feature to see.
      baselineStart: shiftIso(a.earlyStart, -GHOST_SHIFT_DAYS),
      baselineFinish: shiftIso(a.earlyFinish, -GHOST_SHIFT_DAYS),
      laneIndex: a.laneIndex,
      isMilestone: a.type === 'START_MILESTONE' || a.type === 'FINISH_MILESTONE',
    });
  }
  const changedEdges: RenderEdge[] = [];
  for (let i = 0; i < edges.length; i += stride) {
    const e = edges[i];
    if (e) changedEdges.push(e);
  }
  return { ghosts, changedEdges };
}

/**
 * The changed-link pass, prototyped as an upper bound (see the file docblock).
 *
 * **Not a second `paintScene` call**, and the reason is worth recording because the first version of
 * this file was one. `paintScene` opens with `ctx.clearRect` unconditionally (`paint.ts:769`), so a
 * second call does not overlay — it erases the scene and repaints. And it takes the whole activity
 * set, so it would have redrawn all 2,160 bars to light 267 links, over-charging the treatment by
 * roughly the entire cost of the thing being measured. Both faults would have produced a confident
 * FAIL and withdrawn a feature that is fine.
 *
 * So the pass composes `dependencyPolyline` directly — the same routing the painter uses, through
 * the same seam — and strokes each changed edge once. It re-routes rather than reusing routes the
 * main pass already computed, which the shipped implementation would not do (the ADR-0078 §1
 * per-frame context exists for exactly this), so the number is still an upper bound. It is now an
 * upper bound on the right quantity.
 */
function paintChangedLinks(
  ctx: CanvasRenderingContext2D,
  activitiesById: ReadonlyMap<string, RenderActivity>,
  changedEdges: readonly RenderEdge[],
  view: Viewport,
  dataDateIso: string,
): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.selection;
  for (const edge of changedEdges) {
    const p = activitiesById.get(edge.predecessorId);
    const s = activitiesById.get(edge.successorId);
    if (!p || !s) continue;
    const points = dependencyPolyline(p, s, edge.type, view, dataDateIso);
    if (!points || points.length === 0) continue;
    ctx.beginPath();
    const [head, ...rest] = points;
    if (!head) continue;
    ctx.moveTo(head.x, head.y);
    for (const point of rest) ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Count what is actually on screen, so a PASS cannot mean "the treatment drew nothing". */
function countVisible(
  ghosts: readonly GhostBar[],
  changedEdges: readonly RenderEdge[],
  activities: readonly RenderActivity[],
  view: Viewport,
  size: { width: number; height: number },
): DiffCounts {
  const dayOf = (isoDate: string): number => {
    const start = Date.UTC(2026, 0, 1);
    return (new Date(`${isoDate}T00:00:00Z`).getTime() - start) / 86_400_000;
  };
  const xOf = (isoDate: string): number => view.originX + dayOf(isoDate) * view.pxPerDay;
  const onScreenX = (isoDate: string): boolean => {
    const x = xOf(isoDate);
    return x >= 0 && x <= size.width;
  };

  let visibleChangedBars = 0;
  for (const g of ghosts) {
    if (onScreenX(g.baselineStart) || onScreenX(g.baselineFinish)) visibleChangedBars += 1;
  }

  const byId = new Map(activities.map((a) => [a.id, a]));
  let visibleChangedLinks = 0;
  for (const e of changedEdges) {
    const p = byId.get(e.predecessorId);
    const s = byId.get(e.successorId);
    if (!p || !s) continue;
    if (p.earlyFinish === null || s.earlyStart === null) continue;
    if (onScreenX(p.earlyFinish) || onScreenX(s.earlyStart)) visibleChangedLinks += 1;
  }
  return { visibleChangedBars, visibleChangedLinks };
}

/**
 * Measure the display's own frame interval with the canvas idle.
 *
 * Not decoration, and the reason is `measure-draw-in-browser.js`'s: without it there is nothing to
 * call a dropped frame *against*, and a 120 Hz machine and a 60 Hz one would both be scored against
 * 16.7 ms — so the faster machine would be reported as dropping half its frames.
 */
async function measureIdleInterval(frames: number): Promise<number> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    const tick = (t: number): void => {
      stamps.push(t);
      if (stamps.length > frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
  gaps.sort((a, b) => a - b);
  return percentile(gaps, 0.5);
}

/** One sustained programmatic pan, painted under rAF, reporting how the FRAMES landed. */
async function panRun(
  ctx: CanvasRenderingContext2D,
  scene: TsldScene,
  size: { width: number; height: number },
  pxPerDay: number,
  frames: number,
  idleInterval: number,
  overlay: {
    ghosts: readonly GhostBar[];
    changedEdges: readonly RenderEdge[];
    activitiesById: ReadonlyMap<string, RenderActivity>;
  } | null,
): Promise<PacingResult> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    let i = 0;
    const tick = (t: number): void => {
      stamps.push(t);
      const view: Viewport = { pxPerDay, originX: -i * pxPerDay, originY: 0 };
      if (overlay) {
        // `baselineGhosts` is a field of `TsldScene` (`paint.ts:283`, inside the interface that
        // opens at :202), NOT of `PaintSceneOptions` (:747). Worth the comment: the ghost layer
        // reads like an overlay and is modelled as part of the picture.
        paintScene(ctx, { ...scene, baselineGhosts: overlay.ghosts }, view, size, PALETTE, 1);
        paintChangedLinks(ctx, overlay.activitiesById, overlay.changedEdges, view, scene.dataDate);
      } else {
        paintScene(ctx, scene, view, size, PALETTE, 1);
      }
      i += 1;
      if (i > frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
  // A frame is "dropped" when its interval exceeds 1.5x the display's own — i.e. at least one
  // whole vsync was missed. Not a fixed 16.7 ms, per `measureIdleInterval`'s docblock.
  const dropped = gaps.filter((g) => g > idleInterval * 1.5).length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
  return {
    frames: gaps.length,
    droppedPct: (dropped / Math.max(1, gaps.length)) * 100,
    intervalP50: percentile(sorted, 0.5),
    intervalP95: percentile(sorted, 0.95),
    fps: 1000 / mean,
  };
}

export interface BenchOptions {
  scene: 'scale' | 'fixture';
  /** Week (working zoom) or Fit (whole plan). Fit is measured and REPORTED but not gated — the
   * baseline already drops 10.2 % there (#75) and a gate that fails on day one gets deleted. */
  preset: 'week' | 'fit';
  frames: number;
  pairs: number;
}

export interface BenchOutcome {
  sceneSummary: string;
  activities: number;
  edges: number;
  idleInterval: number;
  counts: DiffCounts;
  pairs: { baseline: PacingResult; treatment: PacingResult }[];
}

const FIXTURE_COUNT = 147;

function fixtureScene(): { activities: RenderActivity[]; edges: RenderEdge[]; summary: string } {
  const lanes = 12;
  const activities: RenderActivity[] = Array.from({ length: FIXTURE_COUNT }, (_, i) => ({
    id: `f${String(i)}`,
    type: 'TASK' as const,
    laneIndex: i % lanes,
    label: `F${String(i)} Fixture activity ${String(i)} · 5d`,
    earlyStart: iso(Math.floor(i / lanes) * 6),
    earlyFinish: iso(Math.floor(i / lanes) * 6 + 4),
    isCritical: i % 5 === 0,
    isNearCritical: false,
  }));
  const edges: RenderEdge[] = Array.from({ length: 188 }, (_, i) => ({
    predecessorId: `f${String(i % (FIXTURE_COUNT - 1))}`,
    successorId: `f${String((i % (FIXTURE_COUNT - 1)) + 1)}`,
    type: 'FS' as const,
    isDriving: i % 3 === 0,
  }));
  return { activities, edges, summary: `${String(FIXTURE_COUNT)} bars, 188 links (control)` };
}

declare global {
  interface Window {
    __benchRevisionDiff: (opts: BenchOptions) => Promise<BenchOutcome>;
  }
}

window.__benchRevisionDiff = async (opts: BenchOptions): Promise<BenchOutcome> => {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const source = opts.scene === 'scale' ? scaleScene(2000) : fixtureScene();
  const { ghosts, changedEdges } = changedSet(source.activities, source.edges);
  const activitiesById = new Map(source.activities.map((a) => [a.id, a]));
  const size = { width: canvas.width, height: canvas.height };

  // Fit derives px/day from the plan's own span rather than a constant, so "whole plan" means the
  // whole plan at every scene size instead of whatever 2 px/day happens to frame.
  const days = source.activities.reduce((max, a) => {
    if (a.earlyFinish === null) return max;
    const d =
      (new Date(`${a.earlyFinish}T00:00:00Z`).getTime() - Date.UTC(2026, 0, 1)) / 86_400_000;
    return Math.max(max, d);
  }, 1);
  const pxPerDay = opts.preset === 'week' ? 12 : Math.max(0.4, size.width / days);

  const scene: TsldScene = {
    activities: source.activities,
    edges: source.edges,
    dataDate: '2026-01-01',
    visualRefresh: true,
    timeTrueLinks: true,
    linkRouting: true,
  };

  const idleInterval = await measureIdleInterval(60);
  const counts = countVisible(
    ghosts,
    changedEdges,
    source.activities,
    { pxPerDay, originX: 0, originY: 0 },
    size,
  );

  const pairs: { baseline: PacingResult; treatment: PacingResult }[] = [];
  for (let p = 0; p < opts.pairs; p += 1) {
    // Alternating, same session, baseline first. A container's absolute timings are noise; only a
    // paired difference is quotable (ADR-0100 M0's design, the one that passed).
    const baseline = await panRun(ctx, scene, size, pxPerDay, opts.frames, idleInterval, null);
    const treatment = await panRun(ctx, scene, size, pxPerDay, opts.frames, idleInterval, {
      ghosts,
      changedEdges,
      activitiesById,
    });
    pairs.push({ baseline, treatment });
  }

  return {
    sceneSummary: source.summary,
    activities: source.activities.length,
    edges: source.edges.length,
    idleInterval,
    counts,
    pairs,
  };
};
