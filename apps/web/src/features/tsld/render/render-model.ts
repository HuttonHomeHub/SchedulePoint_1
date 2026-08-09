import type { ActivityType } from '@repo/types';

import { isMilestone, LABEL_MIN_PX_PER_DAY, type Rect } from './geometry';

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

/** Corner radius (px) of a refreshed task bar — subtle at BAR_HEIGHT 18, so the bar reads
 * "softened", not "pill". The selection/hover rings add 2 so their curve tracks the bar's. */
export const BAR_RADIUS = 3;

/** Outline width (px) of the refreshed critical/near-critical emphasis stroke — heavier than the
 * legacy 1.5 so the critical path pops against the calmer hairline-stroked normal bars. The
 * solid-vs-dashed dash cue is unchanged (WCAG 1.4.1 — never colour/weight alone). */
export const EMPHASIS_STROKE_W = 2;

/** Height (px) of the in-bar progress band (the completed portion), inset along the bar bottom. */
export const PROGRESS_BAND_H = 4;
/** Inset (px) of the progress band from the bar's left/right/bottom edges (shape-bounded). */
export const PROGRESS_INSET_PX = 2;
/** Bars narrower than this (px) draw no progress detail — it would be a sub-pixel smear. */
export const PROGRESS_MIN_BAR_PX = 12;
/** Below this px-per-day the progress band is culled, mirroring the label LOD gate. */
export const PROGRESS_MIN_PX_PER_DAY = LABEL_MIN_PX_PER_DAY;

/** The in-bar progress geometry: the completed band plus the divider x at the progress front. */
export interface ProgressGeometry {
  /** The completed portion — a band inset along the bar's bottom edge, length ∝ % complete. */
  band: Rect;
  /** The x of the hairline divider at the progress front (the boundary/shape cue — never
   * colour-only, WCAG 1.4.1), or null at 100% where the front coincides with the bar end. */
  frontX: number | null;
}

/**
 * The shape-bounded in-bar progress fill for a bar rect (ADR-0052 M4): a band inset along the
 * bar's bottom edge whose length is proportional to `percentComplete`, plus a band-height hairline
 * divider at the progress front so the completed/remaining boundary reads as a shape, not colour
 * alone (WCAG 1.4.1). The band — and the divider, clamped to the band's vertical extent — sits
 * below the label's centred text line, so the label ink never loses contrast over it and the
 * divider never slices through the label row. Null when there is nothing to draw: no progress (≤ 0 / not finite) or a
 * bar too narrow to hold legible detail ({@link PROGRESS_MIN_BAR_PX}). Percent clamps to 100.
 */
export function progressGeometry(rect: Rect, percentComplete: number): ProgressGeometry | null {
  if (!Number.isFinite(percentComplete) || percentComplete <= 0) return null;
  if (rect.w < PROGRESS_MIN_BAR_PX) return null;
  const fraction = Math.min(100, percentComplete) / 100;
  const innerW = rect.w - PROGRESS_INSET_PX * 2;
  const band: Rect = {
    x: rect.x + PROGRESS_INSET_PX,
    y: rect.y + rect.h - PROGRESS_INSET_PX - PROGRESS_BAND_H,
    w: innerW * fraction,
    h: PROGRESS_BAND_H,
  };
  return { band, frontX: fraction < 1 ? band.x + band.w : null };
}

/** Width (px) of an LOE/hammock bracket end-cap; the caps overhang the bar top+bottom. */
export const GLYPH_CAP_W = 2;
/** How far (px) an LOE/hammock bracket end-cap overhangs the bar's top and bottom edges. */
export const GLYPH_CAP_OVERHANG = 3;

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
export const SUMMARY_TAB_H = 4;

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
