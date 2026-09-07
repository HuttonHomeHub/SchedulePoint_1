import type { PhaseTiming } from '../model/judge';
import type { ScenarioPreset } from '../model/scenarios';

import { scaleScene } from './scale-scene';

import { cull } from '@/features/tsld/render/geometry';
import { paintScene, type TsldPalette, type TsldScene } from '@/features/tsld/render/paint';
import type { Viewport } from '@/features/tsld/render/render-model';

/**
 * The canvas draw scenario — `docs/TECH_DEBT.md` #75's question, taken on real hardware.
 *
 * **This is an ABSOLUTE measurement, not a difference one**, and that is what separates it from
 * `revision-diff`. There is no treatment to compare against: the question is not "does this feature
 * cost anything" but "does the shipped painter hold its frame rate at all", which ADR-0026 §9 gates
 * as **≥ 45 fps at 500 activities and ≥ 30 fps at 2,000** under sustained pan. So the run has one
 * phase repeated, and the judge it feeds is {@link judgeAbsolute} rather than {@link judgeRun}.
 *
 * ## Nothing here is a second painter
 *
 * The pan calls `paintScene` — the shipped one, with the real palette the panel resolves from the
 * live document — and the visible-bar count comes from `cull`, which is the function the painter
 * itself uses to decide what to draw. A second opinion about what is on screen would disagree with
 * the painter exactly when it mattered (the ADR-0065 `routeOrthogonal` argument), and here it would
 * disagree in the one direction that is fatal: over-counting makes an empty picture pass the
 * non-vacuity floor.
 *
 * The bench in `scripts/revision-diff-bench.ts` counts x-overlap only, which is an **upper bound**
 * because it ignores lanes scrolled out of view. That is tolerable there, where the count is a
 * denominator; it is not tolerable here, where it is the floor.
 *
 * ## What a Week reading at 2,000 activities is actually about — measured, and it surprised
 *
 * Counting the bars at a 1646x900 viewport (`canvas-draw.test.ts`) gives:
 *
 * | scene | preset | total | on screen | px/day | span   |
 * | ----- | ------ | ----- | --------- | ------ | ------ |
 * | 500   | week   | 540   | **192**   | 12.00  | 362 d  |
 * | 500   | fit    | 540   | 540       | 4.55   | 362 d  |
 * | 2,000 | week   | 2,160 | **222**   | 12.00  | 1,150 d|
 * | 2,000 | fit    | 2,160 | 1,591     | 1.43   | 1,150 d|
 *
 * **At the Week framing the two limbs draw almost the same picture** — 192 bars against 222 — because
 * a working zoom frames roughly 137 days whatever the plan's size, and a bigger plan is mostly a
 * longer one. That is the cull doing exactly its job (ADR-0026 §8: the painter draws O(visible), not
 * O(total)), and it means a Week PASS at "2,000 activities" is **not** evidence that the painter
 * handles 2,000 bars. It is evidence that it handles ~220 bars while `cull` walks 2,160 of them.
 *
 * Both are worth knowing and they are different claims, so the visible count is reported beside
 * every number and pinned by a test rather than left for a reader to infer. **Fit is the framing
 * that separates the limbs** (540 against 1,591) — and Fit is the framing this scenario deliberately
 * does not gate, which is a tension recorded here rather than resolved by moving a floor.
 *
 * The scene is **not** tuned to make Week look busier. It comes from ADR-0066's generator and the
 * framing is a planner's real working zoom; changing either to produce a more impressive number
 * would be tuning the instrument to the answer, which is the failure this epic exists to refuse.
 */

/** Day 0 of every scene this module builds — `scale-scene.ts`'s own epoch, quoted rather than reinvented. */
const EPOCH_ISO = '2026-01-01';

/** The working zoom. A planner's ordinary framing, and the one ADR-0026 §9's gesture describes. */
const WEEK_PX_PER_DAY = 12;

/** Below this the whole plan is a smear; the Fit framing clamps rather than dividing by a huge span. */
const MIN_FIT_PX_PER_DAY = 0.4;

export interface DrawScene {
  readonly scene: TsldScene;
  /** Quoted with every number, so a reading always carries the picture it came from. */
  readonly summary: string;
  readonly totalActivities: number;
  readonly totalEdges: number;
}

/**
 * Build the scene at a given size.
 *
 * The flags are the **shipped defaults** — visual refresh, time-true links and orthogonal routing
 * are all default-on features (ADR-0052, ADR-0065). Measuring with them off would answer a question
 * about a product nobody runs.
 */
export function buildDrawScene(activities: number): DrawScene {
  const source = scaleScene(activities);
  return {
    scene: {
      activities: source.activities,
      edges: source.edges,
      dataDate: EPOCH_ISO,
      visualRefresh: true,
      timeTrueLinks: true,
      linkRouting: true,
    },
    summary: source.summary,
    totalActivities: source.activities.length,
    totalEdges: source.edges.length,
  };
}

export interface DrawFraming {
  readonly preset: ScenarioPreset;
  readonly pxPerDay: number;
  /** How many bars the painter would actually draw at this framing, from `cull`. */
  readonly visibleBars: number;
  /** The non-vacuity floor that applies at this preset — see {@link minVisibleBarsFor}. */
  readonly minVisibleBars: number;
  /** The plan's span in days, so a reader can see why Fit landed where it did. */
  readonly spanDays: number;
}

/**
 * Where the viewport sits, and how much of the plan that puts on screen.
 *
 * **Fit derives px/day from the plan's own span rather than a constant**, so "whole plan" means the
 * whole plan on a 1280-wide laptop and on a 2560-wide monitor, instead of whatever a fixed 2 px/day
 * happens to frame. Both the derived scale and the resulting bar count are recorded on the result:
 * two machines with different viewports are measuring different pictures, and the reader has to be
 * able to see that rather than assume it away.
 */
export function framingFor(
  scene: DrawScene,
  preset: ScenarioPreset,
  size: { width: number; height: number },
): DrawFraming {
  const spanDays = scene.scene.activities.reduce((max, activity) => {
    if (activity.earlyFinish === null) return max;
    const day =
      (new Date(`${activity.earlyFinish}T00:00:00Z`).getTime() -
        new Date(`${EPOCH_ISO}T00:00:00Z`).getTime()) /
      86_400_000;
    return Math.max(max, day);
  }, 1);

  const pxPerDay =
    preset === 'week' ? WEEK_PX_PER_DAY : Math.max(MIN_FIT_PX_PER_DAY, size.width / spanDays);

  const view: Viewport = { pxPerDay, originX: 0, originY: 0 };
  const visibleBars = cull(scene.scene.activities, view, size, EPOCH_ISO).length;

  return {
    preset,
    pxPerDay,
    visibleBars,
    minVisibleBars: minVisibleBarsFor(preset, scene.totalActivities),
    spanDays,
  };
}

/**
 * The non-vacuity floor, and why it differs by preset.
 *
 * **ADR-0066 records this exact failure**: a plan laid nose-to-tail spanned 28 years, the whole-plan
 * zoom culled roughly nine bars in ten, and the resulting 4.6 ms p95 "looked like the budget being
 * met" (`docs/TECH_DEBT.md` #75). A number measured on an almost-empty canvas is a number about the
 * cull, not about the painter, and it is indistinguishable from a good result.
 *
 * The two presets mean different things, so one floor cannot serve both:
 *
 * - **Fit** frames the *whole plan*. If most of it is not on screen the framing has failed at its
 *   own job, so the floor is a majority of the scene.
 * - **Week** frames a *working window* — a slice by design — so the floor is a small fraction with
 *   an absolute guard underneath it, because 5 % of a tiny scene is not a measurement either.
 */
export function minVisibleBarsFor(preset: ScenarioPreset, totalActivities: number): number {
  return preset === 'fit'
    ? Math.floor(totalActivities * 0.5)
    : Math.max(25, Math.floor(totalActivities * 0.05));
}

const percentile = (sortedAscending: readonly number[], p: number): number =>
  sortedAscending[Math.min(sortedAscending.length - 1, Math.floor(sortedAscending.length * p))] ??
  0;

/**
 * One sustained pan, painted under `requestAnimationFrame`.
 *
 * Panning one day per frame is what ADR-0026 §9's gesture describes, and it is also what makes the
 * cull do real work: a stationary canvas repaints an identical picture, which a browser is free to
 * be unusually good at.
 *
 * The timing comes from the rAF timestamps rather than from around `paintScene`, because the gap
 * between frames is what a planner feels — #75's whole finding is that the painter can sit inside a
 * 16.7 ms frame and still miss vsyncs.
 */
export async function runDrawPhase(
  ctx: CanvasRenderingContext2D,
  scene: DrawScene,
  framing: DrawFraming,
  size: { width: number; height: number },
  palette: TsldPalette,
  frames: number,
  idleInterval: number,
): Promise<PhaseTiming> {
  const stamps: number[] = [];
  await new Promise<void>((resolve) => {
    let i = 0;
    const tick = (t: number): void => {
      stamps.push(t);
      const view: Viewport = {
        pxPerDay: framing.pxPerDay,
        originX: -i * framing.pxPerDay,
        originY: 0,
      };
      paintScene(ctx, scene.scene, view, size, palette, 1);
      i += 1;
      if (i > frames) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const gaps = stamps.slice(1).map((t, i) => t - (stamps[i] ?? t));
  const dropped = gaps.filter((g) => g > idleInterval * 1.5).length;
  const sorted = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
  return {
    droppedPct: (dropped / Math.max(1, gaps.length)) * 100,
    intervalP50: percentile(sorted, 0.5),
    intervalP95: percentile(sorted, 0.95),
    fps: 1000 / mean,
  };
}
