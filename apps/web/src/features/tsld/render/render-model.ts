import type { ActivityType } from '@repo/types';

import {
  BAR_HEIGHT,
  BAR_PAD,
  isMilestone,
  LABEL_INSIDE_MIN_HEIGHT_PX,
  LABEL_MIN_PX_PER_DAY,
  type Point,
  type Rect,
} from './geometry';

/**
 * The pure, renderer-agnostic TSLD render model (ADR-0026) — **the barrel**, plus the bar-glyph
 * model that has no better home yet.
 *
 * Every consumer in the repository imports from here, and not one of them changed as the geometry
 * core (`docs/TECH_DEBT.md` #106), link routing, hit testing and the viewport moved out beneath it.
 * That is ADR-0078 §3's barrel-preserving rule, and it is what makes each extraction reviewable as
 * a move: the diff relocates lines, and the whole-scene golden log (`paint.golden.test.ts`) is the
 * oracle that says the scene did not change.
 *
 * What is left here is the **bar visual refresh** (ADR-0052 M4) — radii, progress-band geometry,
 * the LOE bracket and summary tab rects, and `barGlyphKind`. It is a coherent little model and
 * could be `bar-model.ts`; ADR-0078 does not call for that, so it stays until something needs it
 * to move rather than being moved because the file was being touched anyway.
 */

export * from './geometry';
export * from './hit-test';
export * from './link-routing';
export * from './viewport';
export * from './working-time';

// ── Bar visual refresh (ADR-0052 M4, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ────────────

/**
 * Corner radius (px) of a refreshed task bar — **subtle**, so the bar reads "softened", not
 * "pill". The selection/hover rings add 2 so their curve tracks the bar's.
 *
 * Derived rather than written, because "subtle" is a statement about the radius **relative to the
 * bar** and the literal 3 was subtle only at `BAR_HEIGHT = 18`: at a NetPoint-thin bar, 3 is more
 * than half the height and the bar is a capsule. A sixth of the bar reproduces today's 3 exactly.
 */
export const BAR_RADIUS = Math.max(1, Math.round(BAR_HEIGHT / 6));

/** Outline width (px) of the refreshed critical/near-critical emphasis stroke — heavier than the
 * legacy 1.5 so the critical path pops against the calmer hairline-stroked normal bars. The
 * solid-vs-dashed dash cue is unchanged (WCAG 1.4.1 — never colour/weight alone). */
export const EMPHASIS_STROKE_W = 2;

/**
 * Height (px) of the in-bar progress band (the completed portion), inset along the bar bottom.
 *
 * Bar-relative for the same reason as its neighbours: the band plus its inset must fit inside the
 * bar with the centred label still legible above it, which a literal 4 does at `BAR_HEIGHT = 18`
 * and cannot at 5 — `PROGRESS_INSET_PX * 2 + PROGRESS_BAND_H` already exceeds a thin bar outright.
 * Whether an in-bar band survives the row treatment at all is CQ-6, a product-owner decision; this
 * makes the constant honest either way rather than pre-empting it.
 */
export const PROGRESS_BAND_H = Math.max(1, Math.round(BAR_HEIGHT / 4.5));
/** Inset (px) of the progress band from the bar's left/right/bottom edges (shape-bounded). */
export const PROGRESS_INSET_PX = 2;
/** Bars narrower than this (px) draw no progress detail — it would be a sub-pixel smear. */
export const PROGRESS_MIN_BAR_PX = 12;
/** Below this px-per-day the progress band is culled, mirroring the label LOD gate. */
export const PROGRESS_MIN_PX_PER_DAY = LABEL_MIN_PX_PER_DAY;
/**
 * How far (px) the progress-front divider stands proud of a **thin** bar, top and bottom.
 *
 * The shipped divider was clamped to the in-bar band's vertical extent so it would not slice
 * through a centred inside label. A thin bar has neither a band nor an inside label, and a 1 px
 * mark confined to 5 px of height is not a shape a reader can see — so it stands proud instead,
 * which is the only way this cue survives the row treatment (WCAG 1.4.1).
 */
export const PROGRESS_FRONT_PROUD_PX = 2;

/** The progress geometry for one bar: the completed portion plus its front divider. */
export interface ProgressGeometry {
  /** The completed portion. */
  band: Rect;
  /**
   * The hairline divider at the progress front — the boundary/shape cue, never colour alone
   * (WCAG 1.4.1) — or null at 100 %, where the front coincides with the bar's own end.
   *
   * A **rect** rather than an x, because on a thin bar it has to stand proud of the bar to be
   * seen at all and only this function knows which shape the bar took.
   */
  front: Rect | null;
}

/**
 * The in-bar progress fill for a bar rect (ADR-0052 M4; re-derived at logic-legibility M3-T3).
 *
 * **Two shapes, chosen by whether the bar can hold the first** — and the choice lives here rather
 * than in the painter because the scene painter and the drag-ghost painter both draw this, and two
 * opinions about it would differ exactly while a planner was dragging a progressed bar.
 *
 * - A bar tall enough for `PROGRESS_INSET_PX` top and bottom plus {@link PROGRESS_BAND_H} gets the
 *   shipped **inset band along the bar's bottom**, which sits below a centred inside label so the
 *   label's ink never loses contrast over it.
 * - A bar that is not — the NetPoint-thin row — gets the completed portion redrawn over the bar's
 *   **whole height**, which is CQ-6's default read literally: a second, shorter bar along the same
 *   line. There is no inside label to sit below, because the row's name is above the bar.
 *
 * The front divider **stands proud** by {@link PROGRESS_FRONT_PROUD_PX} in the thin case and is
 * clamped to the band in the inset one. A 1 px mark confined to 5 px of height is not a shape a
 * reader can see, and the shape is the whole point of the divider.
 *
 * Null when there is nothing to draw: no progress (<= 0 / not finite) or a bar too narrow to hold
 * legible detail ({@link PROGRESS_MIN_BAR_PX}). Percent clamps to 100.
 */
export function progressGeometry(rect: Rect, percentComplete: number): ProgressGeometry | null {
  if (!Number.isFinite(percentComplete) || percentComplete <= 0) return null;
  if (rect.w < PROGRESS_MIN_BAR_PX) return null;
  const fraction = Math.min(100, percentComplete) / 100;
  // **The discriminator is whether the bar holds an INSIDE LABEL, not whether the band fits.**
  // Arithmetic fit was the first version and it was wrong in a way only running it showed: at a
  // 5 px bar `PROGRESS_BAND_H` derives to 1, so `2 + 1 + 2 <= 5` is true and the inset branch fires
  // — producing a 1 px line inside a 5 px bar, which is not a band. The inset shape exists **to sit
  // below a centred inside label**, so the condition that decides it is the one that decides
  // whether there is a label to sit below (`labelPlacement`, `LABEL_INSIDE_MIN_HEIGHT_PX`). Tying
  // them together is also what stops the two thresholds drifting apart later.
  const inset = rect.h >= LABEL_INSIDE_MIN_HEIGHT_PX ? PROGRESS_INSET_PX : 0;
  const h = inset > 0 ? PROGRESS_BAND_H : rect.h;
  const band: Rect = {
    x: rect.x + inset,
    y: rect.y + rect.h - inset - h,
    w: (rect.w - inset * 2) * fraction,
    h,
  };
  if (fraction >= 1) return { band, front: null };
  const proud = inset > 0 ? 0 : PROGRESS_FRONT_PROUD_PX;
  return {
    band,
    front: { x: band.x + band.w - 0.5, y: band.y - proud, w: 1, h: band.h + proud * 2 },
  };
}

/** Width (px) of an LOE/hammock bracket end-cap; the caps overhang the bar top+bottom. */
export const GLYPH_CAP_W = 2;
/**
 * How far (px) an LOE/hammock bracket end-cap overhangs the bar's top and bottom edges.
 *
 * Two bounds, and the literal 3 satisfied both only by coincidence at `BAR_HEIGHT = 18`. It must
 * stay a **proportion** of the bar — at 5 px a +/-3 overhang makes a cap more than twice the bar
 * it brackets — and it must fit inside {@link BAR_PAD}, or the bracket leaves the lane (FC-6). The
 * literal cleared the second by 2 px and nothing said so.
 */
export const GLYPH_CAP_OVERHANG = Math.max(1, Math.min(BAR_PAD - 1, Math.round(BAR_HEIGHT / 6)));

/**
 * The two vertical end-cap rects of the refreshed LOE / hammock **bracketed-span** glyph
 * (ADR-0052 M4): `[` and `]` caps at the span's ends, overhanging the bar top and bottom, so a
 * derived-span activity reads as a bracket, not a task bar — a shape cue, consistent across
 * themes (the painter draws them in the bar's own resolved fill, so lenses compose). Pure vertex
 * math over the bar rect.
 */
export function loeBracketRects(rect: Rect): [Rect, Rect] {
  const y = rect.y - GLYPH_CAP_OVERHANG;
  const h = rect.h + GLYPH_CAP_OVERHANG * 2;
  return [
    { x: rect.x, y, w: GLYPH_CAP_W, h },
    { x: rect.x + rect.w - GLYPH_CAP_W, y, w: GLYPH_CAP_W, h },
  ];
}

/** Width / height (px) of a WBS-summary bracket's downward end tab. */
export const SUMMARY_TAB_W = 3;
/**
 * The tab's drop below the bar.
 *
 * The shipped 4 was justified by the **1 px clearance** it left inside a 28 px lane — a clearance
 * argument, which stops being the binding one the moment the bar thins: at a NetPoint-thin bar the
 * pad is ~11 px and a 4 px tab under a 5 px bar is nearly as tall as the bar it hangs from. So it
 * is a **proportion** first and a clearance second, and both are expressed: a quarter-ish of the
 * bar, never more than the pad will hold. Reproduces today's 4 at `BAR_HEIGHT = 18`.
 */
export const SUMMARY_TAB_H = Math.max(1, Math.min(BAR_PAD - 1, Math.round(BAR_HEIGHT / 4.5)));

/**
 * The two downward end-tab rects of the refreshed WBS-summary **bracket** glyph (ADR-0052 M4):
 * small tabs dropping below the bar at each end — the classic summary-bar silhouette — so a
 * rolled-up span reads distinctly from a task and from an LOE bracket. Pure vertex math.
 */
export function summaryTabRects(rect: Rect): [Rect, Rect] {
  const y = rect.y + rect.h;
  return [
    { x: rect.x, y, w: SUMMARY_TAB_W, h: SUMMARY_TAB_H },
    { x: rect.x + rect.w - SUMMARY_TAB_W, y, w: SUMMARY_TAB_W, h: SUMMARY_TAB_H },
  ];
}

/**
 * **A span is thinner than work** (NetPoint grammar, spec §4.13 U1). An LOE/hammock or WBS-summary
 * bar draws no node, so without another channel it reads as one more task. Weight is that channel:
 * the span's line paints at half the bar height, centred, in the same rung ink, so no new colour is
 * needed. Only the PAINTED line thins — `activityRect` is unchanged, so routing, hit-testing and the
 * route fingerprints (FC-G1) cannot see it. The bracket caps keep the full rect, which is what makes
 * them read as a bracket around the thinner line; a summary's tabs hang from the line they close.
 */
export function spanLineRect(rect: Rect): Rect {
  const h = rect.h / 2;
  return { x: rect.x, y: rect.y + (rect.h - h) / 2, w: rect.w, h };
}

// ── The node glyph (logic-legibility M3-T3) ─────────────────────────────────────────────────────

/**
 * Radius (px) of the **node** at each end of a bar — the reference's own device, and the thing
 * that makes a thin bar read as an activity rather than a rule.
 *
 * It also **replaces fan-out** (spec D10). `FAN_OUT_MAX_PX` spread several link ends along a bar
 * edge by `FAN_OUT_STEP_PX`, which needs the bar's half-height to spread within; at 5 px that is
 * 2.5 and the step alone exceeds it. The reference solves the same problem the other way — every
 * link converges **on the node** — which needs no vertical room on the bar at all.
 *
 * Sized against the bar rather than written: a node is what a reader's eye lands on, so it has to
 * be visibly larger than the line it terminates without becoming a blob. Twice the bar's height
 * puts it at 10 px across for a 5 px bar, which is the reference's own proportion.
 */
export const NODE_RADIUS = 5;

/**
 * Where a bar's two node glyphs sit: on the bar's centre-line, at each end.
 *
 * A **milestone draws no nodes** — its diamond is already a terminal glyph and a node at each end
 * of a zero-width shape is two circles on top of each other. The caller decides; this returns the
 * geometry for a spanning glyph.
 */
export function nodeCentres(rect: Rect): [Point, Point] {
  const cy = rect.y + rect.h / 2;
  return [
    { x: rect.x, y: cy },
    { x: rect.x + rect.w, y: cy },
  ];
}

/**
 * **Criticality's second, non-colour channel — three rungs, not two** (WCAG 1.4.1, CQ-6).
 *
 * The cue this epic replaced was a **dashed emphasis outline on the bar**, and it carried three
 * states: solid for critical, dashed for near-critical, absent for neither. A dash on a 5 px
 * outline is not a channel a reader can use — the dash period is wider than the shape being
 * dashed — so the shape difference moves to the node, which the reference draws both ways.
 *
 * **M3-T3 shipped that move as a BOOLEAN, and the accessibility gate caught it**: `isCritical ||
 * isNearCritical` collapsed two states into one, so critical and near-critical became
 * distinguishable by **hue alone** — a real WCAG 1.4.1 regression against a cue that had carried
 * three states for a year, on the most important distinction in the product. So the rung is a
 * three-value union and the compiler makes every caller name each branch.
 *
 * **Which glyph carries each rung is still CQ-6's to settle** (FC-L8 limb 1: a cue that moves is
 * recorded as moved, a cue that goes is the product owner's). What is NOT open is the count:
 * three states in, three states out.
 */
export type CriticalityRung = 'critical' | 'near' | 'none';

/** The rung an activity draws at. `isCritical` wins where both flags are set — the engine never
 * sets both, and a reader who sees the critical mark on a critical activity is not misled. */
export function criticalityRung(activity: {
  isCritical?: boolean;
  isNearCritical?: boolean;
}): CriticalityRung {
  if (activity.isCritical === true) return 'critical';
  if (activity.isNearCritical === true) return 'near';
  return 'none';
}

/** Which refreshed glyph family a bar draws as (ADR-0052 M4). */
export type BarGlyphKind = 'milestone' | 'loe' | 'summary' | 'bar';

/** The refreshed glyph family for an activity type: milestones stay diamonds, LOE **and**
 * hammock spans draw the bracketed-span glyph (both are derived spans), WBS summaries the
 * summary bracket, and everything else a plain (rounded) bar. */
export function barGlyphKind(type: ActivityType): BarGlyphKind {
  if (isMilestone(type)) return 'milestone';
  if (type === 'LEVEL_OF_EFFORT' || type === 'HAMMOCK') return 'loe';
  if (type === 'WBS_SUMMARY') return 'summary';
  return 'bar';
}
