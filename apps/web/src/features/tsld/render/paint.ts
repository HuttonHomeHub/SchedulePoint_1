import type { ActivityType } from '@repo/types';

import { canvasLabel } from './a11y';
import { activityIndexFor } from './activity-index';
import { axisMarkers } from './axis-markers';
import type { Ctx2D } from './ctx-2d';
import {
  beginRoundedRect,
  drawPolyline,
  drawRoundedPolyline,
  traceMilestoneDiamond,
  traceMilestoneGlyph,
  traceMilestoneTriangle,
} from './layers/shapes';
import { labelWidths } from './layers/text-measure';
import { createWrapClearance } from './layers/wrap-clearance';
import type { GhostBar, LevelledGhost } from './lenses';
import { linkFactsOf, plateScoringOf } from './link-facts';
import {
  chevronsAlong,
  freePlatePosition,
  gapLabelCandidates,
  lagPlateCandidates,
  linkRung,
} from './link-marks';
import { nodeHeadTrim } from './link-tracks';
import { buildPaintFrame } from './paint-frame';
import { PLATE_GRAZE_PX, plateGlyphBoxes, SLACK_CHIP_H } from './plate-room';
import {
  arrowhead,
  barGlyphKind,
  axisDayOf,
  edgeTouches,
  isMilestone,
  isResizeEligibleType,
  linkHighlightIds,
  loeBracketRects,
  NODE_RADIUS,
  lodTier,
  nodeCentres,
  nodeMarks,
  NODE_REACH_PX,
  trimPolylineEnd,
  NEAR_CRITICAL_DOT_R,
  NODE_RIM_W,
  type NodeMark,
  type CriticalityRung,
  laneAtScreenY,
  progressGeometry,
  rectsIntersect,
  rowReservesTextRows,
  screenXOfDay,
  screenYOfLane,
  summaryTabRects,
  spanLineRect,
  truncateToWidth,
  BAR_HEIGHT,
  BAR_PAD,
  BAR_RADIUS,
  ARROWHEAD_HALF_W_PX,
  ARROWHEAD_ROUTED_PX,
  EMPHASIS_STROKE_W,
  criticalityRung,
  LABEL_FONT,
  MILESTONE_LABEL_FONT,
  activityRect,
  edgeGapDays,
  feasibleWindowRect,
  LABEL_PAD_PX,
  LABEL_LINE_H,
  WRAP_LINE_H,
  LANE_HEIGHT,
  MILESTONE_RADIUS,
  PROGRESS_MIN_PX_PER_DAY,
  type LagRun,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from './render-model';
import {
  SEGMENT_RULE_MIN_PX,
  STRIP_BAR_TOP_PAD,
  bucketBarsFromDays,
  type ResourceStripSnapshot,
} from './resource-strip';
import { routeFrame, type RouteFrame } from './route-frame';
import { allItems, layoutRowText, type PlacedText } from './row-text-layout';
import { textIndexOf } from './text-index';
import { DEFAULT_VIEW_TOGGLES, type TsldViewToggles } from './view-toggles';
import type { WbsBandBar } from './wbs-band';

/** Below this px-per-day the per-day gridlines would merge into a solid block, so they're culled. */
const DAY_GRID_MIN_PX = 6;
/** Below this px-per-day non-working columns are sub-pixel; the wash is culled (and would be costly). */
const NON_WORKING_MIN_PX = 3;
/**
 * The day and month gridlines' dash, 3 on / 3 off (NetPoint grammar G1): the reference's own
 * pattern, measured from its picture (`docs/specs/netpoint-grammar/reference-observations.md`).
 */
const GRID_DASH: readonly number[] = [3, 3];

/**
 * The palette the painter draws with — resolved from the app's semantic design tokens
 * (ADR-0006) so the canvas is theme-aware without hardcoding colour. All values are CSS
 * colour strings.
 */
export interface TsldPalette {
  /** The opaque canvas ground (`--canvas`) — read by the minimap bitmap (ADR-0100), which
   * paints its own ground because a detached canvas has no CSS behind it; the scene itself gets
   * this colour from the container's `bg-canvas` class and never reads the field. */
  canvasGround: string;
  gridLine: string;
  edge: string;
  bar: string;
  critical: string;
  nearCritical: string;
  /** Foreground-contrast stroke outlining critical/near-critical bars (non-colour cue). */
  outline: string;
  selection: string;
  /** Muted wash over non-working (weekend/holiday) day columns. */
  nonWorking: string;
  /** Diagonal-stripe ink drawn over the non-working wash (F7a, `VITE_CANVAS_TIME_AXIS`) — a step
   * stronger than `nonWorking`, so a weekend/holiday reads as a distinct KIND of surface, not just
   * a darker shade of the month band. Read only by the hatch-pattern builder; the flat `nonWorking`
   * fill remains the fallback when a pattern can't be built (jsdom, or a minimal test context). */
  /** The TODAY marker line + label (shares the critical/destructive hue, dashed to distinguish). */
  today: string;
  /** Ink for the Today pill's `Today` text (F6b) — paired with `today` the same way every other
   * fill pairs with its `*-foreground` token, so contrast is guaranteed by the same 1:1 pairing.
   * Deliberately not `selection`: that is the cursor chip's hue, and the two markers must never
   * read as the same thing. */
  todayInk: string;
  /** Visual-Planning conflict cue (ADR-0033): a placement earlier than its feasible start. The
   * warning hue, drawn as a distinct **triangle badge** (shape, not colour-only) at the bar's start. */
  conflict: string;
  /** Same-lane time-overlap cue (TECH_DEBT #24c): a manual lane drop left two bars overlapping. The
   * warning hue, drawn as a distinct **stacked-squares badge** (shape, not colour-only) above the bar. */
  laneOverlap: string;
  // Label text colours (ADR-0026 D1). Inside-bar text uses the fill's paired *-foreground token so
  // it contrasts against that fill in both themes; beside text uses the page foreground.
  labelInside: string;
  labelInsideCritical: string;
  labelInsideNearCritical: string;
  labelBeside: string;
  // ── Bar visual refresh (ADR-0052 M4, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ──────────
  /** The calm hairline definition stroke around every refreshed non-critical bar (the border
   * token) — deliberately quieter than the foreground `outline`, so the emphasised critical /
   * near-critical outlines pop against it. Read only when `TsldScene.visualRefresh` is on. */
  barStroke: string;
  /** The idle-hover ring (muted-foreground) — visually lighter than the `selection` ring so
   * hover and selection never read as the same state. A transient pointer affordance twinned
   * with the cursor change; selection stays the keyboard/AT-reachable state. Refresh-only. */
  hoverRing: string;
  /** The **halo** ring drawn around a canvas grab-handle's `outline` core (the canvas ground /
   * card token). The pair is what makes a handle perceivable on ANY ground without a per-bar
   * contrast calculation: `outline` and `handleHalo` are each other's theme-inverse, so whichever
   * of the two loses contrast against the bar it lands on, the other holds it (verified for every
   * criticality fill in both themes — see `palette.test.ts`). Read only by the lag handle today
   * (ADR-0052 M3 discoverability fix); flag-off it is never read. */
  handleHalo: string;
  /** The alternating month band drawn under the diagram (ADR-0055 §4). Opaque. */
  monthBand: string;
  // ── Data-date status marker (`VITE_CANVAS_DATA_DATE`, canvas status & feedback M1) ─────────
  /** The **data-date** status vertical + its pill fill — the strongest neutral in the palette
   * (`--foreground`), NOT `--info`: in all three shipped themes info is a near
   * neighbour of `--primary`, the on-schedule bar fill, and a "distinct" line in the bar
   * hue on a diagram made of bars is not distinct (measured, spec CQ-1). Its one collision is the
   * 1.5px critical-bar outline — a bar-shaped stroke, not a full-height rule — noted and
   * accepted. The line is solid 2px vs Today's dashed 1.5px, so the two differ by shape and
   * weight, never hue alone (WCAG 1.4.1). */
  dataDate: string;
  /** Data-date pill ink — `dataDate`'s 1:1 partner (`--background`), the same guarantee
   * `todayInk` gives the Today pill: the pair inverts together per theme, so the label always
   * reads on its own fill without a per-theme contrast decision. */
  dataDateInk: string;
  // The refresh introduces NO other colour: the in-bar progress band + front divider draw in the
  // bar's own paired label ink (`labelInside*` / the lens `barInk` override), so their contrast is
  // guaranteed by the same 1:1 fill↔ink pairing labels rely on in both themes and under every
  // lens; the LOE bracket caps + WBS-summary tabs draw in the bar's own resolved fill, so the
  // Colour-by lenses recolour the whole glyph as one shape (the lens owns colour, M4 owns shape).
  // ── Time-axis gridline tiers (`VITE_CANVAS_TIME_AXIS`, tsld-toolbar-canvas-refinements F5) ──
  // `gridLine` above is kept and still resolves `--border` — it is the value the flag-off
  // path strokes, which is what makes the parity claim structural. Read only when
  // `TsldScene.gridTiers` is on.
  /** The finest tier (day boundaries) — a step lighter than `gridLine`. */
  gridLineDay: string;
  /** The mid tier (month boundaries) — approximately `gridLine`. */
  gridLineMonth: string;
  /** The coarsest tier (year boundaries) — a step stronger than `gridLine`, drawn at `lineWidth 2`. */
  gridLineYear: string;
  /** The per-lane horizontal hairline (workspace redesign M4-T2). */
  laneRule: string;
  /** A NON-DRIVING link (NetPoint-layout M2, `--canvas-link-minor`): 1 px solid, quieter than a
   * driving link by weight. Its own token rather than `edge`, which is the page's secondary text
   * colour (TECH_DEBT #367). */
  linkMinor: string;
  /** An ordinary (neither critical nor near-critical) DRIVING link — `--primary`, the on-schedule
   * ink. Its own key rather than `bar`, which also fills every bar and LOE cap, so a measurement
   * harness can tell a driving link from a bar by colour alone. */
  linkDriving: string;
  /**
   * The node rim for each criticality rung (NetPoint grammar M2, spec §4.2 G4). They resolve to the
   * same tokens as the three bar fills, and are keys of their own for the `linkDriving` reason: a
   * measurement harness has to tell a node from a bar and a link by colour alone (spec §4.11 R2).
   */
  nodeRim: string;
  nodeRimNear: string;
  nodeRimCritical: string;
  /**
   * The direction marks on a violet link, and the gap label's text (NetPoint grammar M3,
   * `--canvas-link-mark`). A key of its own so a harness can tell a mark from its line.
   */
  linkMark: string;
  /**
   * The dot where a link joins partway along a bar (NetPoint grammar M3-T5, spec G12). Resolves to
   * the mark shade, under its own key so a harness can tell a dot from a chevron.
   */
  attachDot: string;
}

/** Which optional canvas layers are drawn — the toolbar's view toggles, defaulting all on. */

export interface TsldScene {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  /** The currently-selected activity id (drawn with a selection ring), if any. */
  selectedId?: string | null;
  /**
   * The whole selection when it is plural (`docs/specs/canvas-multi-select/` M2-T5).
   *
   * Sits **beside** `selectedId` rather than replacing it, so every non-canvas caller — the export
   * scene, the printed programme, the golden-log tests — keeps the exact scene it always built and
   * paints byte-for-byte. `selectedId` remains the PRIMARY: the one the edge handles, the activity
   * panel and `aria-activedescendant` mean.
   */
  selectedIds?: readonly string[] | undefined;
  /** When true (editing + linking enabled), draw the persistent edge-handle affordance on the
   * selected bar. Off for the read-only surface, keeping M1 byte-for-byte unchanged. */
  showEdgeHandles?: boolean;
  /** Which optional layers to draw (grid variants / today / non-working). Defaults to all on. */
  view?: TsldViewToggles | undefined;
  /** Predicate: is the day at this offset (from `dataDate`) worked? Null → no calendar, so the
   * non-working layer draws nothing. Built once from the plan calendar (mask + holiday exceptions). */
  isWorkingDay?: ((dayOffset: number) => boolean) | null | undefined;
  /** Day offset (from `dataDate`) of "today", or null when today is outside a schedulable range. */
  todayOffset?: number | null | undefined;
  /**
   * The viewer-local time-of-day fraction (0…1, `todayDayFraction`) added to `todayOffset` for a
   * fractional Today line + pill (F6a/F6b, `VITE_CANVAS_TIME_AXIS`). Absent/null ⇒ the line draws
   * at the plain integer offset and no pill draws ⇒ byte-for-byte today's paint (the flag-off
   * parity claim is structural, not a promise).
   */
  todayFraction?: number | null | undefined;
  /**
   * Paint the alternating month bands (ADR-0055 §4, `VITE_CANVAS_VISUAL_LANGUAGE`). Absent ⇒ the
   * band layer is skipped entirely ⇒ the frame is byte-for-byte today's paint, which is what makes
   * the flag-off parity claim structural rather than a promise. The budget suite flips it.
   */
  monthBands?: boolean | undefined;
  /**
   * Draw the **data-date line** — a solid 2px `palette.dataDate` vertical at day offset 0 (day 0
   * IS the data date: `screenXOfDay(0, view) === view.originX`, `render-model.ts`) with its own
   * pill row, plus the coincidence rule against the Today line (`VITE_CANVAS_DATA_DATE`, canvas
   * status & feedback M1). Absent ⇒ the layer never runs ⇒ the frame is byte-for-byte today's
   * paint — the flag-off parity claim is structural, not a promise (the `monthBands` precedent;
   * pinned by `paint.data-date-parity.test.ts`).
   *
   * Named `dataDateLine`, NOT the plan's `TsldScene.dataDate`: that name has been the scene's
   * coordinate-origin ISO date since ADR-0026, and overloading one key with a date-or-boolean
   * meaning is exactly the conflation ADR-0033 unpicked once already.
   */
  dataDateLine?: boolean | undefined;
  /**
   * Draw the time-axis grid as three tiers — day / month / year, each its own colour + weight
   * (ADR-0055 token rule; day/month tier F5, `VITE_CANVAS_TIME_AXIS`) — instead of the single
   * `gridLine` pass. Absent ⇒ the one flag-off pass, byte-for-byte today's paint (the flag-off
   * parity claim structural, not a promise). The budget suite (`paint.grid-budget.test.ts`) flips it.
   */
  gridTiers?: boolean | undefined;
  // ── Insight lenses (spec `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`) ──────────
  // ALL default-absent ⇒ byte-for-byte today's paint (the flag-off / no-active-lens parity gate).
  /** Ids of activities the active filter dimmed (non-matches). Members paint muted (reduced alpha)
   * while keeping the criticality outline, so the diagram geometry stays stable and the shape cue
   * survives the dim. Absent ⇒ no filter active ⇒ every bar at full emphasis. */
  dimmedIds?: ReadonlySet<string> | undefined;
  /** The activity whose ghost is in flight right now (ADR-0054 §1, `VITE_CANVAS_LIVE_FEEDBACK`) —
   * its source bar recedes to {@link GESTURE_SOURCE_ALPHA} so a drag or resize reads as one shape
   * moving rather than a bar plus a floating rectangle. Absent (the flag-off path never sets it)
   * ⇒ no-op ⇒ byte-for-byte parity. */
  gestureSourceId?: string | null | undefined;
  /** Per-activity Colour-by fill override (id → CSS colour), precomputed by `buildColourMap`. When a
   * bar's id is present the painter uses this fill; absent ids (and an absent map) fall back to today's
   * `barColour`. Passed only for the non-default Colour-by modes, so Criticality ⇒ absent ⇒ parity. */
  barFill?: ReadonlyMap<string, string> | undefined;
  /** Per-activity Colour-by inside-label **ink** override (id → CSS colour), paired 1:1 with `barFill`
   * (precomputed by `buildColourInkMap`), so an inside-bar label clears 4.5:1 on the recoloured bar
   * (WCAG 1.4.3). When a bar's id is present the painter uses this ink for its inside label; absent ids
   * (and an absent map) fall back to today's criticality-based ink. Passed only for the non-default
   * Colour-by modes, so Criticality ⇒ absent ⇒ byte-for-byte parity. */
  barInk?: ReadonlyMap<string, string> | undefined;
  /** Baseline ghost bars drawn as a culled outline layer beneath the live bars (the Baseline overlay).
   * Absent ⇒ the overlay is off / no active baseline ⇒ no ghost layer (parity). */
  baselineGhosts?: readonly GhostBar[] | undefined;
  /** The revision-comparison change picture (ADR-0127): where the CHANGED bars were on the `from`
   * side of the pair the comparison dock has selected — including work that is no longer in the
   * plan. A SEPARATE field from `baselineGhosts` rather than a widening of it, because the two
   * answer different questions (this plan against its active baseline; one revision against
   * another), can be on at the same time, and treat removed work differently. Absent ⇒ the overlay
   * is off / no pair selected ⇒ no layer at all (parity). */
  compareGhosts?: readonly CompareGhost[] | undefined;
  /** The revision comparison's CHANGED LOGIC (ADR-0127) — the differentiating half: a re-sequence
   * is only visible as a re-sequence if the links are drawn. Absent ⇒ no pass (parity). */
  compareLinks?: readonly CompareLink[] | undefined;
  /**
   * The **levelled ghosts** (one-planning-surface M-E) — where the resource-levelling pass would
   * put each bar it MOVED. A third ghost field rather than a widening of either neighbour, on the
   * reasoning ADR-0127 used to keep those two apart: the three answer different questions, any two
   * can be on at once, and a shared field would make a levelled date read as a baseline one.
   *
   * **A bound and a position are different objects** — the feasible window is where a bar MAY go
   * and this is a rival place it COULD be, which is also why one is a view toggle and this is a
   * lens. Absent ⇒ the lens is off / levelling never ran / nothing moved ⇒ no layer (parity). */
  levelledGhosts?: readonly LevelledGhost[] | undefined;
  // ── Over-allocation highlight (Stage E M2, spec `docs/specs/canvas-resource-view/`) ─────────
  /** Ids of activities the engine flagged as over-allocated (`levelingWindowExceeded ||
   * selfOverAllocated`, ADR-0041), marked on the canvas with a distinct **mini-histogram badge** — a
   * shape cue, never colour-only (WCAG 1.4.1). A per-bar `Set.has` in the existing single pass, so it
   * adds no repaint. Absent ⇒ the highlight is off / nothing is over-allocated ⇒ byte-for-byte parity. */
  flaggedIds?: ReadonlySet<string> | undefined;
  // ── Canvas direct manipulation M1 (ADR-0052, behind `VITE_CANVAS_DIRECT_MANIPULATION`) ──────
  /** Time-true link rendering: anchor each dependency at the point in time its lag actually
   * constrains — `lagDays` walked from the constrained edge on the relationship's lag calendar
   * (`isWorkingDay`; `TWENTY_FOUR_HOUR` elapsed) — and tip it with a directional arrowhead at the
   * successor end. Absent/false ⇒ the legacy extreme-end routing, no arrowheads ⇒ byte-for-byte
   * today's paint (the flag-off parity gate). */
  timeTrueLinks?: boolean | undefined;
  // ── Canvas direct manipulation M4 (ADR-0052, the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ────
  /** The activity-bar visual refresh (ADR-0052 M4): rounded bar shape with a calm hairline
   * definition stroke, a heavier critical/near-critical emphasis outline (dash cue retained,
   * WCAG 1.4.1), the shape-bounded in-bar progress fill (`percentComplete`, LOD-culled), the
   * LOE-bracket / WBS-summary-tab glyphs, an outlined constraint pin, and the rounded selection
   * ring. A separate scene field from `timeTrueLinks` so each render change stays independently
   * testable, but fed from the SAME env flag — there is exactly ONE flag-off parity gate.
   * Absent/false ⇒ byte-for-byte today's bar layer.
   *
   * Under M5 the same field also gates the **link** refresh: rounded elbows on the orthogonal
   * routing, deterministic fan-out of crowded bar-edge anchors, the dashed lag-run depiction
   * (with `timeTrueLinks` geometry), and the incident-link highlight for `selectedId`/`hoverId`. */
  visualRefresh?: boolean | undefined;
  // ── Canvas direct manipulation M5 (ADR-0052, the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ────
  /** The idle-hovered bar's activity id (published by the canvas from the SAME already-armed
   * hover classify the M4 hover ring reads — editing surfaces only): its incident links draw
   * transiently highlighted, mirroring the persistent `selectedId` highlight (the keyboard/AT
   * equivalent — WCAG 2.1.1). Only read under `visualRefresh`; absent ⇒ no hover highlight. */
  hoverId?: string | null | undefined;
  /**
   * Draw a visible **grab handle** at every draggable lag anchor (the ADR-0052 M3 discoverability
   * fix). Set from the canvas's `lagArmed` gate — flag + editing/pen + `select` mode + a wired lag
   * handler — so a read-only viewer (or any surface that can't commit a lag) never sees an
   * affordance it can't honour. The painted handles mirror `classifyHit`'s `lagAnchor` zones
   * exactly (offset anchors only, `lagDays !== 0`), so what the user sees is precisely what they
   * can grab. Absent/false ⇒ no handles ⇒ byte-for-byte today's paint (the parity gate).
   */
  lagHandles?: boolean | undefined;
  /**
   * The dependency id whose lag handle draws **emphasised** — the hovered anchor, or the one a
   * `lagDragging` gesture currently holds. A size + stroke-weight change (never colour alone —
   * WCAG 1.4.1), twinned with the `ew-resize` cursor the canvas already sets over the zone. Only
   * read when {@link TsldScene.lagHandles} is on; absent ⇒ every handle draws at rest.
   */
  activeLagId?: string | null | undefined;
  // ── Canvas link routing (ADR-0064 M2, behind `VITE_CANVAS_LINK_ROUTING`) ──────────────────────
  /**
   * Route a link's vertical corridor **around** the bars between its two lanes rather than through
   * them. Read only on the refreshed link path (`visualRefresh`), which is the one branch that
   * composes `routeOrthogonal` directly; the two legacy branches go through
   * `dependencyPolyline`/`dependencyPolylineTimeTrue`, which do not take obstacles, so they cannot
   * change shape whatever this field says.
   *
   * Absent/false ⇒ the painter never builds the interval index and never passes one ⇒ the geometry
   * takes its no-obstacle default ⇒ **byte-for-byte today's edge layer**. That is the parity gate,
   * and it is structural: there is one route function, not two.
   */
  linkRouting?: boolean | undefined;
}

/** Half-size (px) of the square drawn at a bar's start/finish edge to mark it grabbable. */
const EDGE_HANDLE_MARK = 3;

/**
 * Width / height (px) of the little triangular pin marking a bar's constrained edge.
 *
 * **The height is a fourth constant in the M3-T2 family that the spec's table did not name**, and
 * `paint.lane-containment.test.ts` is what named it: the pin drops `CONSTRAINT_PIN_H` above the
 * bar's top and the literal 5 happened to equal `BAR_PAD` exactly, so the filled triangle topped
 * out ON the lane boundary and the outlined variant's 1 px stroke put ink in the lane above
 * (FC-6). Nothing coupled the two — one lives here and the other is a function of two constants in
 * `geometry.ts` — so nothing would have reported it had they not been equal.
 *
 * The `- 1` is the outline's half-width, which is the part that escaped. The width stays absolute:
 * it is a horizontal measure and the row treatment does not touch x.
 */
const CONSTRAINT_PIN_W = 7;
const CONSTRAINT_PIN_H = Math.max(2, Math.min(5, BAR_PAD - 1));

/**
 * Re-exported so every existing consumer keeps importing them from `paint.ts` (ADR-0078 §3: the
 * barrel is preserved, so the 30 consuming files and their suites are the before/after oracle).
 * Their definitions moved out for the §3a ordering reason — `paint-frame.ts` needs them and
 * `paint.ts` imports `paint-frame.ts`.
 */
export type { Ctx2D };
export { activityIndexFor };
export { DEFAULT_VIEW_TOGGLES, type TsldViewToggles };

/**
 * The fill for a bar. A Colour-by lens (`barFill`) overrides per id when present (precomputed from the
 * design tokens by `buildColourMap`); absent — the default, and every id when no lens is active — it
 * falls back to today's criticality fill, so the default paint is byte-for-byte unchanged.
 */
function barColour(
  activity: RenderActivity,
  palette: TsldPalette,
  barFill?: ReadonlyMap<string, string>,
): string {
  const override = barFill?.get(activity.id);
  if (override !== undefined) return override;
  if (activity.isCritical) return palette.critical;
  if (activity.isNearCritical) return palette.nearCritical;
  return palette.bar;
}

/** The reduced alpha a filter-dimmed bar paints at — enough to recede without vanishing (the
 * criticality outline is still drawn at full strength, so the shape cue survives the dim). */
const DIMMED_ALPHA = 0.3;

/**
 * Alpha of the bar a gesture is currently dragging (ADR-0054 §1) — below {@link DIMMED_ALPHA},
 * because a filter dim says "not in your filter" while this says "this shape has moved; look at
 * the ghost". Still visible, so the origin of the drag stays readable.
 */
const GESTURE_SOURCE_ALPHA = 0.18;

/** Spacing (px) between a float/drift tail's hatch strokes — the non-colour cue's density. */
const TAIL_HATCH_STEP = 6;

/**
 * Trace one vertical cap of a feasible window into the caller's open path.
 *
 * **One function, called from both layers**, because a cap drawn before the bars and a cap drawn
 * after one must be the same mark — that is the whole content of "the window is a bracket". Two
 * tracers is how the inverted case would end up a pixel taller or a half-pixel off, visible only on
 * the placements this milestone exists to show.
 *
 * The half-pixel offsets match the span's, so a cap meets the rails it closes.
 */
function traceWindowCap(ctx: Ctx2D, x: number, band: Rect): void {
  ctx.moveTo(x + 0.5, band.y + 0.5);
  ctx.lineTo(x + 0.5, band.y + band.h - 0.5);
}

/**
 * Height (px) of the opaque plate drawn behind a flanking date when the float/drift tails are ALSO
 * on — just taller than the label text, so the hatched tail passes visibly behind the date instead
 * of striking through it. Only ever drawn with both toggles on.
 */
const DATE_PLATE_H = 12;

/** Line dash + width of a baseline ghost's outline (thin, dashed — visibly not a live bar). */
const GHOST_DASH: readonly number[] = [2, 2];

/**
 * The comparison overlay's dash — **deliberately different from {@link GHOST_DASH}**.
 *
 * Both overlays draw a dashed outline in `palette.edge`, and they can be on at the same time, so a
 * merely-moved compare ghost was pixel-identical to a baseline-drift ghost: a planner comparing two
 * named revisions could be looking at baseline drift and believe it was the comparison, or the
 * reverse. That undermines the one promise the overlay makes — *this picture is about these two
 * revisions* — and the M8 ux review found it. A longer dash with a wider gap is a shape channel and
 * needs no new token (the ADR-0100 M4 trap).
 */
const COMPARE_DASH: readonly number[] = [6, 3];

/**
 * The levelled ghost's dash — a THIRD rhythm, deliberately distinct from both of its neighbours
 * (one-planning-surface M-E).
 *
 * `GHOST_DASH` is [2,2] and `COMPARE_DASH` is [6,3], and that constant's own docblock records the
 * two having been **pixel-identical once**, found by a ux review. A long-short rhythm is a third
 * shape class rather than a third length of the same one: neither neighbour alternates, so this
 * reads as different even at the moment a planner cannot see which is which.
 */
const LEVELLED_DASH: readonly number[] = [5, 2, 1, 2];

/**
 * One frozen bar of the revision-comparison change picture (ADR-0127) — where a CHANGED activity
 * was on the old side of the selected pair.
 *
 * Declared here rather than imported from `@repo/types`, so `render/` keeps its no-DTO rule and this
 * file states exactly what it draws.
 *
 * `name` is carried even though NO painter reads it. It is here so the drawn array is
 * self-describing: the spoken twin of this layer (`compareOverlaySummary`) walks the SAME array the
 * painter walks, which is what stops the picture and its description disagreeing about what is on
 * screen — the ADR-0121 finding, where a legend was decided by name, listed as a step, and never
 * written, leaving colour as the sole channel.
 */
export interface CompareGhost {
  readonly activityId: string;
  readonly name: string;
  /** `YYYY-MM-DD`, both non-null — a row with no old dates contributes no ghost (ADR-0126). */
  readonly fromStart: string;
  readonly fromFinish: string;
  /** The FROZEN lane, never the live one and never a guess. Removed work has no live lane. */
  readonly laneIndex: number;
  /** The old side's type: it places the ghost by the live bar's rule (ADR-0155, #383). */
  readonly type: ActivityType;
  readonly removed: boolean;
}

/**
 * One link the comparison found changed (ADR-0127).
 *
 * `REMOVED` is the one with no live counterpart, which is why the endpoints are carried: the
 * painter cannot look the edge up in `scene.edges` because it is not there. Both endpoints ARE in
 * the live plan — the server refuses to emit a link it cannot anchor, and counts it instead, since
 * a link has no geometry of its own.
 */
export interface CompareLink {
  readonly dependencyId: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly state: 'ADDED' | 'REMOVED' | 'CHANGED';
}

/**
 * A horizontal line through the middle of a shape — the removed-work cue.
 *
 * A shape, deliberately, and not a second colour: colour alone would fail WCAG 1.4.1, and a NEW
 * canvas token would risk the ADR-0100 M4 defect (a pair absent from `@theme inline` paints no
 * colour at all in a real browser, invisibly to the contrast gate). Drawn solid over the dashed
 * outline, so the two cues do not merge into one texture.
 */
/**
 * **Where a ghost sits on the axis — by the rule the live bar uses** (#383).
 *
 * Every ghost layer used to centre a milestone on the MIDDLE of its dated day, `(x1 + x2) / 2`,
 * while the live diamond sits on a day BOUNDARY (`computeActivityRect`): the start of its day, or
 * its end for a finish milestone (ADR-0155). So an unmoved milestone's ghost sat half a day from the
 * diamond it describes. Taking the type and going through `axisDayOf` makes the ghost and its live
 * bar one derivation rather than two that happen to agree.
 */
export function ghostGeometry(
  type: ActivityType,
  dataDate: string,
  start: string,
  finish: string,
  view: Viewport,
): { milestone: true; cx: number } | { milestone: false; x1: number; x2: number } {
  const startDay = axisDayOf(type, dataDate, start);
  if (isMilestone(type)) return { milestone: true, cx: screenXOfDay(startDay, view) };
  return {
    milestone: false,
    x1: screenXOfDay(startDay, view),
    x2: screenXOfDay(axisDayOf(type, dataDate, finish) + 1, view), // inclusive finish → +1 day
  };
}

function strikeThrough(ctx: Ctx2D, x: number, midY: number, width: number): void {
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, midY + 0.5);
  ctx.lineTo(x + width, midY + 0.5);
  ctx.stroke();
  // Restores the COMPARE dash, which is the only layer that calls this.
  ctx.setLineDash(COMPARE_DASH as number[]);
}

/**
 * The dash pattern that encodes criticality without relying on colour (WCAG 1.4.1):
 * a solid outline for critical, a dashed outline for near-critical, and `null` (no
 * outline) otherwise. Paired with the fill colour and the panel's visible legend.
 *
 * **Two consumers, and they are not the same shape.** The legacy (non-refresh) bar layer still
 * outlines the BAR with it. The refreshed path outlines a **milestone diamond** — which has no
 * node to carry the rung — and never a bar: a `[3, 2]` period is wider than a 5 px bar outline,
 * which is the whole reason the bar's rung moved to its nodes (`criticalityRung`).
 */
/**
 * A milestone's outline width per rung (NetPoint grammar M5, spec §4.2 G8): the triangle's
 * non-colour channel for criticality, by weight. On schedule draws no outline.
 */
const MILESTONE_OUTLINE_W: Readonly<Record<'critical' | 'near', number>> = {
  critical: EMPHASIS_STROKE_W,
  near: 1.5,
};

function criticalDash(activity: RenderActivity): number[] | null {
  if (activity.isCritical) return [];
  if (activity.isNearCritical) return [3, 2];
  return null;
}

/** Dash pattern of the lag-run depiction (ADR-0052 M5) — visibly "waiting", not a solid tie. */
const LAG_RUN_DASH: readonly number[] = [2, 2];

/** Radius (px) of the lag handle's core disc at rest, and while hovered / dragged. Small enough
 * to sit on an 18px bar without hiding it, large enough to read as "grab me"; the emphasised
 * radius is a SIZE change (with the heavier halo below), never colour alone — WCAG 1.4.1. The
 * pointer target is far larger than the ink: `LAG_ANCHOR_PX` gives it 24px (WCAG 2.5.8). */
const LAG_HANDLE_R = 3.5;
const LAG_HANDLE_R_ACTIVE = 5;
/** Width (px) of the contrasting halo ring straddling the core's edge, at rest / emphasised. */
const LAG_HANDLE_HALO_W = 1.5;
const LAG_HANDLE_HALO_W_ACTIVE = 2;

/**
 * Draw the draggable **lag handles** (ADR-0052 M3 discoverability fix): a small disc in the
 * foreground `outline` colour ringed by the contrasting `handleHalo`, centred on each walked lag
 * anchor. The two-tone construction is what guarantees the handle reads on **any** bar fill in
 * both themes — the pair are theme-inverses, so whichever loses contrast against the bar, the
 * other holds it (`palette.test.ts` pins this for every criticality fill).
 *
 * A **disc**, deliberately, so it never collides with the canvas's existing shape vocabulary: the
 * milestone/baseline diamond, the square selected-bar resize marks, and the triangle/squares/
 * histogram badges. Traced with the same optional, guarded `roundRect` the M4 bar refresh uses
 * (radius = half the box ⇒ a circle), degrading to a square on contexts without it — never
 * throwing. Batched: one path per colour for the whole set, so a crowded diagram costs two fills.
 */
/** The attachment dot's radius: 4 px across, under the lag handle's {@link LAG_HANDLE_R}. */
export const ATTACH_DOT_R = 2;

/** Every attachment dot in one filled path (one `fill()` per frame, whatever the count). */
function drawAttachDots(ctx: Ctx2D, points: readonly Point[], palette: TsldPalette): void {
  const r = ATTACH_DOT_R;
  ctx.fillStyle = palette.attachDot;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    for (const p of points) ctx.roundRect(p.x - r, p.y - r, r * 2, r * 2, r);
    ctx.fill();
  } else {
    for (const p of points) ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }
}

function drawLagHandles(
  ctx: Ctx2D,
  points: readonly Point[],
  palette: TsldPalette,
  active: boolean,
): void {
  const r = active ? LAG_HANDLE_R_ACTIVE : LAG_HANDLE_R;
  const boxes = points.map((p) => ({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 }));
  const trace = (): boolean => {
    if (typeof ctx.roundRect !== 'function') return false;
    ctx.beginPath();
    for (const b of boxes) ctx.roundRect(b.x, b.y, b.w, b.h, r);
    return true;
  };
  ctx.fillStyle = palette.outline;
  if (trace()) ctx.fill();
  else for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = palette.handleHalo;
  ctx.lineWidth = active ? LAG_HANDLE_HALO_W_ACTIVE : LAG_HANDLE_HALO_W;
  if (trace()) ctx.stroke();
  else for (const b of boxes) ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.lineWidth = 1;
}

/**
 * A small downward triangular pin sitting just above a bar's constrained edge, its tip at `tipY`:
 * the top of the bar, or — where the edge carries a node — just clear of the node's rim (see the
 * caller, and {@link edgeCuePlacement}). A **shape** cue — not colour — so a set constraint reads
 * without relying on hue (WCAG 1.4.1); the panel's legend names it, and the parallel
 * listbox spells the constraint out for AT. Under the visual refresh (`outlined`, ADR-0052
 * M4) it gains the same foreground outline the other three badges already carry — a pure
 * consistency restyle: the shape, position, legend entry and AT text are untouched.
 */
function drawConstraintPin(
  ctx: Ctx2D,
  edgeX: number,
  tipY: number,
  palette: TsldPalette,
  outlined = false,
): void {
  const ax = edgeX - CONSTRAINT_PIN_W / 2;
  const bx = edgeX + CONSTRAINT_PIN_W / 2;
  const topY = tipY - CONSTRAINT_PIN_H;
  ctx.fillStyle = palette.edge;
  ctx.beginPath();
  ctx.moveTo(ax, topY);
  ctx.lineTo(bx, topY);
  ctx.lineTo(edgeX, tipY);
  ctx.fill();
  if (outlined) {
    // Traced over the same triangle (closed manually — the Ctx2D surface has no closePath),
    // matching the conflict badge's outline treatment so the four badges read as one family.
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, topY);
    ctx.lineTo(bx, topY);
    ctx.lineTo(edgeX, tipY);
    ctx.lineTo(ax, topY);
    ctx.stroke();
  }
}

/** The milestone constraint mark's stem and dot, in CSS px (see {@link drawMilestoneConstraintMark}). */
const MILESTONE_BANG_W = 2;
const MILESTONE_BANG_STEM_TOP = -3.6;
const MILESTONE_BANG_STEM_H = 4;
const MILESTONE_BANG_DOT_TOP = 1.4;
const MILESTONE_BANG_DOT_H = 1.8;

/**
 * **A constrained milestone carries a "!" inside its triangle**, in the diagram's ground colour —
 * NetPoint's own mark for a constrained milestone (the product owner's choice, 2026-09-25,
 * `docs/TECH_DEBT.md` #392).
 *
 * The pin that marks a task's constrained edge was placed on a milestone's centre, tip on the
 * triangle's top edge, which put it on the milestone's bold name one row up: every constrained
 * milestone printed a pin over the middle of its own name. Nothing required it to sit outside the
 * glyph. It sat there because it was designed for the legacy diamond, which has no interior to
 * speak of, and nobody re-asked when the milestone became a 14 px filled triangle.
 *
 * The mark is cut from the fill, so it reads against every rung's colour and every Colour-by lens
 * fill: the pair is ground-on-fill, the same pair that makes the triangle visible on the ground at
 * all. Stem and dot sit in the triangle's upper, wider part: the dot's bottom is 3.2 px below the
 * centre, where the triangle is still 4.5 px wide. The legacy (flag-off) diamond keeps the pin.
 */
function drawMilestoneConstraintMark(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  palette: TsldPalette,
): void {
  ctx.fillStyle = palette.canvasGround;
  const x = cx - MILESTONE_BANG_W / 2;
  ctx.fillRect(x, cy + MILESTONE_BANG_STEM_TOP, MILESTONE_BANG_W, MILESTONE_BANG_STEM_H);
  ctx.fillRect(x, cy + MILESTONE_BANG_DOT_TOP, MILESTONE_BANG_W, MILESTONE_BANG_DOT_H);
}

/** Half-width (px) of the upward warning triangle marking a Visual-Planning conflict. */
const CONFLICT_BADGE_W = 6;
const CONFLICT_BADGE_H = 7;

/**
 * An upward warning triangle at the **breached edge** of a conflicting bar (ADR-0033). A **shape**
 * cue in the warning hue — distinct from the downward constraint pin — so it never relies on colour
 * alone (WCAG 1.4.1). It carries a **contrasting outline** (the foreground stroke, like the
 * critical/near-critical bar outlines) so the triangle clears the 3:1 non-text-contrast bar (WCAG
 * 1.4.11) even against a same-hue near-critical bar fill, where the fill colour alone would vanish.
 * The legend names it and the listbox spells it out for AT.
 *
 * **Which edge is the caller's to decide, and it is not always the start.** The badge marked
 * `rect.x` unconditionally until the M-J gate pass, under a docblock that said "start edge" and
 * described only `EARLIER_THAN_LOGIC` — correct while that was the one reason the flag had. M-D
 * added `LATER_THAN_BOUND`, whose test is `placedFinish > constraintCeiling`, so its breach is at
 * the finish; marking the start pointed the planner at the end of the bar that is not the problem.
 *
 * It sits ON the bar (a bar without nodes: `barTop + 1` downwards; a bar with nodes: centred on
 * the bar, inboard of the node) while the constraint pin sits ABOVE it, so the two never collide
 * even when both mark the same edge — which is the common shape for this reason, since the bound
 * that was breached is usually drawn as a pin at that very edge. Where to draw it is
 * {@link edgeCuePlacement}'s decision; this only draws.
 */
function drawConflictBadge(ctx: Ctx2D, leftX: number, apexY: number, palette: TsldPalette): void {
  const ax = leftX;
  const ay = apexY + CONFLICT_BADGE_H;
  const bx = leftX + CONFLICT_BADGE_W;
  const cx = leftX + CONFLICT_BADGE_W / 2;
  const cy = apexY;
  ctx.fillStyle = palette.conflict;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, ay);
  ctx.lineTo(cx, cy);
  ctx.fill();
  // A foreground outline traced over the same triangle (closed manually — the Ctx2D surface has no
  // closePath) so the shape stays perceivable on any bar fill, including a same-hue near-critical one.
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, ay);
  ctx.lineTo(cx, cy);
  ctx.lineTo(ax, ay);
  ctx.stroke();
}

/**
 * Side (px) of each little square in the stacked-squares lane-overlap badge.
 *
 * **Deliberately NOT derived from {@link BAR_PAD}, and the reason is the rule for this whole
 * family: a badge's size is a legibility choice and the pad is a constraint it either satisfies or
 * does not.** Conflating the two is how a constant ends up illegible.
 *
 * Two 5 px squares offset by 2 need 7 px above the bar, and a 28 px lane holding an 18 px bar has
 * 5 — so the badge escapes its lane today (`paint.lane-containment.test.ts`), by 3 px alone and by
 * 9 px once the constraint-pin lift applies. Clamping it to fit would mean 3 px squares with a
 * 1 px outline, which is not a cue. **The fix is the pad, not the badge**: M3-T3's row leaves
 * ~19 px above the bar and the escape closes with no change here. Recorded rather than papered
 * over, and pinned in the containment gate until it does.
 */
const OVERLAP_BADGE_S = 5;

/**
 * Two small offset outlined squares ("stacked bars") centred just above a bar, marking that it
 * shares a lane with a time-overlapping neighbour (TECH_DEBT #24c). A **shape** cue in the warning
 * hue — distinct from the conflict triangle and the constraint pin — so it never relies on colour
 * alone (WCAG 1.4.1); each square carries a foreground outline so it clears the 3:1 non-text-contrast
 * bar on any ground (WCAG 1.4.11). The legend names it and the listbox spells it out for AT.
 */
function drawOverlapBadge(
  ctx: Ctx2D,
  centerX: number,
  barTop: number,
  palette: TsldPalette,
  liftBy = 0,
): void {
  const s = OVERLAP_BADGE_S;
  const off = 2;
  const leftX = Math.round(centerX - (s + off) / 2);
  // `liftBy` stacks this badge above the constraint pin (which shares the bar-centre for a milestone)
  // so a bar carrying both cues never draws them on top of each other.
  const topY = barTop - s - off - 1 - liftBy;
  const square = (x: number, y: number): void => {
    ctx.fillStyle = palette.laneOverlap;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  };
  square(leftX + off, topY + off); // back square (down-right)
  square(leftX, topY); // front square (up-left)
}

/** Bar width / gap / tallest-bar height (px) of the over-allocation mini-histogram badge. */
const OVERALLOC_BAR_W = 2;
const OVERALLOC_BAR_GAP = 1;
/**
 * The tallest mini-bar, and therefore the badge's whole height.
 *
 * Intrinsic, not pad-derived — see {@link OVERLAP_BADGE_S} for the rule and the same outcome: 7 px
 * plus a 2 px lift-off needs 9 px above the bar against the 5 px a 28 px lane leaves, so the
 * histogram's tall end sits 4 px into the lane above today (FC-6). A three-bar histogram clamped
 * to 3 px is a smudge. M3-T3's row closes it by widening the pad.
 */
const OVERALLOC_BADGE_H = 7;
/** The three ascending mini-bar heights (a rising histogram = "over-allocated resource"). */
const OVERALLOC_BAR_HEIGHTS: readonly number[] = [3, 5, OVERALLOC_BADGE_H];

/**
 * A small **rising mini-histogram** (three ascending bars) at a flagged bar's top-right corner, marking
 * an engine-flagged resource over-allocation (`levelingWindowExceeded || selfOverAllocated`, ADR-0041).
 * A **shape** cue in the warning hue — a histogram, distinct from the constraint pin (down triangle),
 * the conflict badge (up triangle) and the lane-overlap stacked squares — so over-allocation never relies
 * on colour alone (WCAG 1.4.1). It deliberately uses the WARNING hue (shared with the conflict/overlap
 * badges), NOT the destructive red, so it doesn't collide with the critical-path fill semantics
 * (a11y review N2). Each mini-bar carries a foreground outline so it clears the 3:1 non-text-contrast
 * bar on any ground (WCAG 1.4.11). The parallel listbox spells it out for AT, and the count is announced.
 * Right-anchored to the bar's end and lifted just above its top; a milestone (whose bounding box still has
 * width) is marked at its box's right edge.
 */
function drawOverAllocationBadge(
  ctx: Ctx2D,
  rightX: number,
  barTop: number,
  palette: TsldPalette,
): void {
  const w = OVERALLOC_BAR_W;
  const gap = OVERALLOC_BAR_GAP;
  const totalW = OVERALLOC_BAR_HEIGHTS.length * w + (OVERALLOC_BAR_HEIGHTS.length - 1) * gap;
  const baseY = barTop - 2; // sit just above the bar's top edge
  let x = Math.round(rightX - totalW); // right-anchored to the bar's end
  for (const h of OVERALLOC_BAR_HEIGHTS) {
    const y = baseY - h;
    ctx.fillStyle = palette.conflict;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    x += w + gap;
  }
}

/** Clearance (px) between a node's rim and a cue placed beside it. */
const NODE_CUE_GAP_PX = 1;

/** Where a bar's edge cues sit, in screen px. */
interface EdgeCuePlacement {
  /** The constraint pin's tip y (the pin hangs above it). */
  pinTipY: number;
  /** The conflict triangle's left x and apex y. */
  conflict: { leftX: number; apexY: number };
  /** The right x the over-allocation histogram is anchored to. */
  overAllocRightX: number;
}

/**
 * **Where the constraint pin, the conflict triangle and the over-allocation histogram sit, and
 * why none of them is ever inside a node** (the product owner's report against `web-v0.149.1`,
 * 2026-09-25: "the constraint and conflict marks are now obscured pretty much by the nodes").
 *
 * The three cues were placed against the bar's own edges when the bar was 18 px tall and had no
 * nodes. NetPoint grammar M2 put a 15 px node on each end of a 6 px bar, centred on exactly the
 * point every one of these cues was anchored to, and nothing re-asked where they should go: the pin
 * (7 × 5, hanging 5 px above the bar's top) now falls entirely inside the node's disc, the conflict
 * triangle (drawn from the bar's start, 1 px in) sits inside the disc too, and the histogram
 * overlaps the finish node's upper-left quarter. Each was still drawn on top of the node, so no
 * test failed — the cue was present and merely unreadable, reading as a smudge on the ring.
 *
 * So, **for a bar that draws nodes**, each cue moves clear of {@link NODE_REACH_PX}:
 *
 * - the **pin** hangs above its node, its tip {@link NODE_CUE_GAP_PX} above the rim — the node is
 *   what the constraint pins, so the pin marks it rather than the bar;
 * - the **conflict triangle** sits on the bar, centred on its centre-line, just inboard of the node
 *   at the breached end (the start for `EARLIER_THAN_LOGIC`, the finish for `LATER_THAN_BOUND`) —
 *   on the line the conflict is about, and below the pin, so the two never meet at a shared edge;
 *   where the bar is too short to hold it between its nodes it is centred on the bar instead;
 * - the **histogram** is right-anchored inboard of the finish node rather than on it.
 *
 * A bar without nodes — the legacy path, a milestone, an LOE or a summary — returns exactly the
 * positions the painter used before, so those glyphs and the golden log for them do not move.
 */
function edgeCuePlacement(
  activity: RenderActivity,
  rect: Rect,
  hasNodes: boolean,
): EdgeCuePlacement {
  const late = activity.visualConflictReason === 'LATER_THAN_BOUND';
  if (!hasNodes) {
    return {
      pinTipY: rect.y,
      conflict: {
        leftX: (late ? Math.max(rect.x, rect.x + rect.w - CONFLICT_BADGE_W - 2) : rect.x) + 1,
        apexY: rect.y + 1,
      },
      overAllocRightX: rect.x + rect.w,
    };
  }
  const cy = rect.y + rect.h / 2;
  const inset = NODE_REACH_PX + NODE_CUE_GAP_PX;
  const fits = rect.w >= 2 * inset + CONFLICT_BADGE_W;
  const leftX = !fits
    ? rect.x + rect.w / 2 - CONFLICT_BADGE_W / 2
    : late
      ? rect.x + rect.w - inset - CONFLICT_BADGE_W
      : rect.x + inset;
  return {
    pinTipY: cy - inset,
    conflict: { leftX, apexY: cy - CONFLICT_BADGE_H / 2 },
    overAllocRightX: rect.x + rect.w - inset,
  };
}

/** The criticality-paired inside ink for a bar — the lens `barInk` override when present, else
 * the painter's own criticality ink (the same fallback chain the inside labels use). */
function barInkColour(
  activity: RenderActivity,
  palette: TsldPalette,
  barInk?: ReadonlyMap<string, string>,
): string {
  const override = barInk?.get(activity.id);
  if (override !== undefined) return override;
  if (activity.isCritical) return palette.labelInsideCritical;
  if (activity.isNearCritical) return palette.labelInsideNearCritical;
  return palette.labelInside;
}

/**
 * Paint the frame's nodes (NetPoint grammar M2-T3, spec §4.2 G4): each a disc filled with the
 * diagram ground and ringed in its rung's ink at its rung's weight ({@link NODE_RIM_W}).
 *
 * The ground fill is the point. It breaks a row of back-to-back bars into separate activities,
 * which a hollow ring cannot do (the bar shows through it). It also sits over the link that ends at
 * the node's centre, which is why the arrowhead is pulled back to the rim (spec §4.13 A1).
 *
 * The rim follows the owner's BAR fill when a Colour-by lens has set one (`barFill`), so rim and
 * bar never disagree; otherwise it takes the rung's own key. Nodes are grouped by ink and weight so
 * each group sets its styles once: the count of style writes grows with the number of distinct
 * rims on screen (at most three rungs times the lens ramp), never with the number of nodes.
 */
function paintNodes(
  ctx: Ctx2D,
  marks: readonly NodeMark[],
  palette: TsldPalette,
  barFill?: ReadonlyMap<string, string>,
): void {
  const rungInk: Readonly<Record<CriticalityRung, string>> = {
    none: palette.nodeRim,
    near: palette.nodeRimNear,
    critical: palette.nodeRimCritical,
  };
  const groups = new Map<string, { ink: string; width: number; marks: NodeMark[] }>();
  for (const mark of marks) {
    const ink = barFill?.get(mark.ownerId) ?? rungInk[mark.rung];
    const width = NODE_RIM_W[mark.rung];
    const key = `${ink}|${width}`;
    const group = groups.get(key);
    if (group) group.marks.push(mark);
    else groups.set(key, { ink, width, marks: [mark] });
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.canvasGround;
  for (const { ink, width, marks: group } of groups.values()) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    for (const mark of group) {
      const box: Rect = {
        x: mark.x - NODE_RADIUS,
        y: mark.y - NODE_RADIUS,
        w: NODE_RADIUS * 2,
        h: NODE_RADIUS * 2,
      };
      // A circle is a `roundRect` whose radius is half its side; a context without `roundRect`
      // takes the square fallback every other rounded shape here takes.
      if (beginRoundedRect(ctx, box, NODE_RADIUS)) {
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
    }
  }
  // **The near-critical dot** ({@link NEAR_CRITICAL_DOT_R}), drawn after every disc so a later disc
  // cannot cover it, and in the rim's own ink so it follows a Colour-by lens exactly as the rim does.
  // The near rung's weight is unique among the three, so its groups are found by width; one
  // `fillStyle` write per group keeps the style count off the node count.
  for (const { ink, width, marks: group } of groups.values()) {
    if (width !== NODE_RIM_W.near) continue;
    ctx.fillStyle = ink;
    for (const mark of group) {
      const dot: Rect = {
        x: mark.x - NEAR_CRITICAL_DOT_R,
        y: mark.y - NEAR_CRITICAL_DOT_R,
        w: NEAR_CRITICAL_DOT_R * 2,
        h: NEAR_CRITICAL_DOT_R * 2,
      };
      if (beginRoundedRect(ctx, dot, NEAR_CRITICAL_DOT_R)) ctx.fill();
      else ctx.fillRect(dot.x, dot.y, dot.w, dot.h);
    }
  }
}

/**
 * Draw one **refreshed** activity bar (ADR-0052 M4, `scene.visualRefresh`). Called with the
 * bar's fill (`barColour`) already set and `globalAlpha` at the bar's dim state; restores alpha
 * to 1 before the outline (so the criticality shape cue survives a filter dim, like the legacy
 * path). Per glyph family:
 *
 * - **bar** — a rounded fill (`BAR_RADIUS`; square fallback where `roundRect` is absent) with a
 *   calm hairline `barStroke` definition stroke, OR the heavier critical/near-critical emphasis
 *   outline (`EMPHASIS_STROKE_W`, dash cue retained — WCAG 1.4.1).
 * - **loe** (LOE + hammock) — the bar plus bracket end-caps in the bar's own fill (the
 *   bracketed-span glyph); **summary** — the bar plus downward end tabs (the summary bracket).
 * - **milestone** — the diamond, gaining a hairline `barStroke` outline when not emphasised so
 *   every glyph carries the same stroke language.
 *
 * Progress (`percentComplete`): a shape-bounded band along the bar bottom + a band-height
 * hairline divider at the progress front, drawn in the bar's paired **ink** ({@link barInkColour})
 * so contrast is guaranteed on every fill in both themes and under every lens. Drawn at the bar's
 * alpha (a dimmed bar's detail recedes with it) and culled below `PROGRESS_MIN_PX_PER_DAY` /
 * on too-narrow bars — the label LOD philosophy. Everything here is rects, lines and one rounded
 * path — no shadow/blur (the ADR-0026 draw budget).
 */
function drawRefreshedBar(
  ctx: Ctx2D,
  activity: RenderActivity,
  rect: Rect,
  palette: TsldPalette,
  scene: TsldScene,
  view: Viewport,
): void {
  const glyph = barGlyphKind(activity.type);
  if (glyph === 'milestone') {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    // **A downward triangle** (NetPoint grammar M5, spec §4.2 G8, CQ-6): the reference's milestone,
    // filled in the rung colour already set, inside the diamond's envelope.
    traceMilestoneTriangle(ctx, cx, cy, MILESTONE_RADIUS, true);
    ctx.fill();
    ctx.globalAlpha = 1; // outline + badges stay full-strength even on a dimmed bar
    // It draws NO nodes: the triangle is already a terminal glyph. **Its outline carries the rung's
    // non-colour channel** (WCAG 1.4.1), by weight as a node's rim does (CQ-11): 2 px in the
    // foreground for critical, 1.5 px for near-critical, none on schedule.
    const rung = criticalityRung(activity);
    if (rung !== 'none') {
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = MILESTONE_OUTLINE_W[rung];
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    return;
  }

  // A span paints its line at half height (`spanLineRect`, spec §4.13 U1); a task fills the bar.
  const isSpan = glyph === 'loe' || glyph === 'summary';
  const line = isSpan ? spanLineRect(rect) : rect;
  if (beginRoundedRect(ctx, line, BAR_RADIUS)) ctx.fill();
  else ctx.fillRect(line.x, line.y, line.w, line.h);
  // Span glyphs, in the bar's own resolved fill (already set) so a Colour-by lens recolours the
  // whole shape as one: LOE/hammock bracket end-caps on the full rect, so they stand proud of the
  // thinner line; WBS-summary downward end tabs hanging from the line they close.
  if (glyph === 'loe') {
    for (const cap of loeBracketRects(rect)) ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
  } else if (glyph === 'summary') {
    for (const tab of summaryTabRects(line)) ctx.fillRect(tab.x, tab.y, tab.w, tab.h);
  }
  // **Progress is a second, shorter bar along the same line, not an in-bar band** (M3-T3, CQ-6's
  // default). `progressGeometry`'s band is inset 2 px top and bottom inside the bar, which needs
  // 8 px before the band itself; a thin bar has 5. So the completed portion is redrawn in the
  // bar's paired ink over the bar's own full height, with a hairline divider at the front standing
  // 2 px proud top and bottom — a **shape** cue (WCAG 1.4.1) that survives at this thickness where
  // the old in-bar divider, clamped to a band that no longer exists, would not.
  if (view.pxPerDay >= PROGRESS_MIN_PX_PER_DAY) {
    const progress = progressGeometry(line, activity.percentComplete ?? 0);
    if (progress) {
      ctx.fillStyle = barInkColour(activity, palette, scene.barInk);
      const { band, front } = progress;
      ctx.fillRect(band.x, band.y, band.w, band.h);
      if (front) ctx.fillRect(front.x, front.y, front.w, front.h);
    }
  }
  ctx.globalAlpha = 1; // outline + badges stay full-strength even on a dimmed bar
  // **The bar's own outline is GONE, deliberately** (M3-T3). A non-critical bar carried a 1 px
  // inset hairline and a critical one a 2 px dashed emphasis; inset into a thin bar the first
  // leaves almost no fill and the second is a dash whose period exceeds the shape it dashes. The
  // reference draws a plain line and puts the definition in the node.
  //
  // **The nodes are not drawn here** (NetPoint grammar M2-T3). A node is filled with the diagram
  // ground and shared where two bars meet, so it has to paint after EVERY bar body in its lane:
  // drawn per bar, a later bar would paint over the left half of an earlier bar's shared node. See
  // the node pass in `paintScene` and `nodeMarks`.
}

/**
 * Paint one frame of the TSLD onto `ctx` from the pure render model (ADR-0026). The
 * order is grid → dependency edges → activity bars/milestones → selection ring, so
 * later layers sit on top. Only the culled (visible) activities are drawn, and edges
 * only when an endpoint is visible, so the cost is bounded by the viewport, not the
 * plan size. `dpr` scales the backing store; drawing is authored in CSS px.
 *
 * Returns the culled activity ids (the painter already computed them) so a caller could
 * reuse the set for hit-testing without a second cull pass — today the only production
 * caller discards it (`TsldCanvas.tsx`) and only tests read it. The minimap deliberately
 * does NOT use it: the culled set is what is ON screen, and the minimap's subject is the
 * whole plan — measured, a whole-plan viewport culls to 255 of 2,160 bars
 * (`docs/specs/tsld-minimap/input-performance.md` §5).
 */
/**
 * Per-call paint overrides. Future overrides EXTEND this interface rather than adding new
 * positional parameters to `paintScene` — this object is the seam the signature grew for
 * (2026-08-28 component review), and an eighth positional would re-open it.
 */
export interface PaintSceneOptions {
  /**
   * Override for the non-working wash's px-per-day cull floor (`docs/TECH_DEBT.md` #166). On
   * screen the floor is a legibility decision — below `NON_WORKING_MIN_PX` a day column is
   * sub-pixel and a planner can zoom — but a whole-plan EXPORT frames any span at any scale and
   * paper has no zoom, so the export passes `0` and the wash paints at every scale (as merged
   * runs — see the layer). Absent ⇒ the constant, and the sub-floor branch is unreachable: the
   * live painter is byte-identical.
   */
  minNonWorkingPx?: number;
}

export function paintScene(
  ctx: Ctx2D,
  scene: TsldScene,
  view: Viewport,
  size: Size,
  palette: TsldPalette,
  dpr = 1,
  opts?: PaintSceneOptions,
): string[] {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  // Everything derived once per frame and shared by two or more layers (ADR-0078 §1). Destructured
  // straight back out, so each layer below still reads a plain local and the call sites are
  // untouched — which is what lets the existing suites act as the before/after oracle (§3).
  const frame = buildPaintFrame(ctx, scene, view, size);
  const { byId, rectCache, visibleIds, toggles, firstDay, lastDay, bounds } = frame;

  // Layer -0.5: alternating month bands — the diagram's own ground, banded, so a planner can
  // count months without reading a label. Beneath EVERYTHING, including the non-working wash, so
  // a weekend still reads as a weekend on top of its band.
  //
  // Parity is the absolute month ordinal, not a running count of crossed boundaries: derived from
  // the calendar, it cannot invert when the viewport pans. Banding is ground, so it deliberately
  // does NOT follow the `Month grid` toggle — that toggle governs a line, this is a surface.
  //
  // Cost: one `fillStyle` and at most `visibleMonths + 1` `fillRect`, no text. Pinned by
  // `paint.band-budget.test.ts`, because this is the tightest loop in the app.
  if (scene.monthBands) {
    ctx.fillStyle = palette.monthBand;
    const edges = bounds.months.filter((d) => d > firstDay);
    edges.push(lastDay + 1);
    let segStart = firstDay;
    let monthIndex = bounds.startMonthIndex;
    for (const edge of edges) {
      if (monthIndex % 2 !== 0) {
        const x = screenXOfDay(segStart, view);
        ctx.fillRect(x, 0, screenXOfDay(edge, view) - x, size.height);
      }
      segStart = edge;
      monthIndex += 1;
    }
  }

  // Layer 0: non-working (weekend/holiday) column wash, beneath the grid. Only when the plan has a
  // calendar (`isWorkingDay` present) and the toggle is on, and only once columns are wide enough
  // to read — at coarse zoom the columns are sub-pixel, so it's culled (and avoids a long loop).
  if (toggles.nonWorking && scene.isWorkingDay && view.pxPerDay >= NON_WORKING_MIN_PX) {
    // **A flat wash, no hatch** (workspace redesign, 2026-08-24). This used to build an offscreen
    // diagonal-stripe tile and paint the columns with it. In the product owner's screenshot that
    // striping was the single loudest thing on the diagram — a texture covering most of the
    // picture, competing with the bars it sits behind.
    //
    // Removing it needed a real `--canvas-nonworking` value, because the wash beneath the hatch
    // was `--muted`, 0.007 of lightness from the canvas: the hatch was not decorating a visible
    // wash, it WAS the entire signal. Deleting it alone would have made weekends disappear.
    ctx.fillStyle = palette.nonWorking;
    for (let d = firstDay; d <= lastDay; d += 1) {
      if (scene.isWorkingDay(d)) continue;
      ctx.fillRect(screenXOfDay(d, view), 0, view.pxPerDay, size.height);
    }
  } else if (
    toggles.nonWorking &&
    scene.isWorkingDay &&
    view.pxPerDay >= (opts?.minNonWorkingPx ?? NON_WORKING_MIN_PX)
  ) {
    // **Below the screen floor, only when a caller lowered it — the export** (#166). A whole-plan
    // export can frame years at under a pixel per day, and on paper the wash is the only weekend
    // channel and there is no zoom — so the deliverable was losing weekends entirely, not
    // degrading them. Consecutive non-working days merge into one rect: at these scales the RUN
    // (a weekend, a shutdown) is the legible unit, and a merged fill is crisp where per-day
    // sub-pixel fills would each blend separately. Unreachable with `opts` absent, so the live
    // painter above stays byte-identical — pinned by the golden log.
    ctx.fillStyle = palette.nonWorking;
    let runStart: number | null = null;
    for (let d = firstDay; d <= lastDay + 1; d += 1) {
      const nonWorking = d <= lastDay && !scene.isWorkingDay(d);
      if (nonWorking && runStart === null) runStart = d;
      else if (!nonWorking && runStart !== null) {
        const x = screenXOfDay(runStart, view);
        ctx.fillRect(x, 0, screenXOfDay(d, view) - x, size.height);
        runStart = null;
      }
    }
  }

  // Layer 1: time-axis gridlines — day / month / year variants, each gated by its toggle. Day
  // lines are culled below `DAY_GRID_MIN_PX` (else a solid block); month/year boundaries come
  // from the cheap integer-rollover `calendarBoundaries` (no per-day Date parsing).
  if (scene.gridTiers) {
    // Three tiers (F5, `VITE_CANVAS_TIME_AXIS`): each its own batched pass, drawn in order
    // day → month → year so a heavier tier overwrites a coincident lighter one (a month start is
    // also a day; a year start is also both). Every tier is 1 px on a HALF-pixel x, the crispness
    // rule for an odd width.
    //
    // **The day and month tiers are dashed 3 on / 3 off; the year tier is solid** (NetPoint
    // grammar G1, M1). Dash halves a rule's ink, which is what lets the grid read as the quietest
    // mark while the logic reads first. The year stays solid so a coarser boundary still wins where
    // it meets a month at the same x (ADR-0056 §2). This amends ADR-0056 §2's reservation of dash
    // for the Today line and the cursor guideline: the Today line stays separable by its ink (≥ 4:1
    // against a ≤ 1.80:1 rule), its weight and its pill. One `setLineDash` per tier, and the dash is
    // cleared after the last tier, so nothing painted later inherits it.
    const strokeTier = (days: Iterable<number>, colour: string, dash: readonly number[]): void => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.setLineDash(dash);
      ctx.beginPath();
      for (const d of days) {
        const x = Math.round(screenXOfDay(d, view)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size.height);
      }
      ctx.stroke();
    };
    if (toggles.dayGrid && view.pxPerDay >= DAY_GRID_MIN_PX) {
      const days: number[] = [];
      for (let d = firstDay; d <= lastDay; d += 1) days.push(d);
      strokeTier(days, palette.gridLineDay, GRID_DASH);
    }
    if (toggles.monthGrid) strokeTier(bounds.months, palette.gridLineMonth, GRID_DASH);
    if (toggles.yearGrid) strokeTier(bounds.years, palette.gridLineYear, []);
    ctx.setLineDash([]);
  } else {
    // Flag-off: the single `gridLine` pass, byte-for-byte today's paint. Batched into one stroke.
    ctx.strokeStyle = palette.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridLine = (d: number): void => {
      const x = Math.round(screenXOfDay(d, view)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
    };
    if (toggles.dayGrid && view.pxPerDay >= DAY_GRID_MIN_PX) {
      for (let d = firstDay; d <= lastDay; d += 1) gridLine(d);
    }
    if (toggles.monthGrid) for (const d of bounds.months) gridLine(d);
    if (toggles.yearGrid) for (const d of bounds.years) gridLine(d);
    ctx.stroke();
  }

  // Layer 1.5: **lane hairlines** — one 1 px horizontal rule per lane boundary (workspace redesign
  // M4-T2). The time axis has had three tiers of vertical structure since ADR-0056 and the lane
  // axis had none, so a bar three lanes below another had nothing to sit on: the eye had to measure
  // the gap. A drafting table has rules both ways.
  //
  // **Derived from the viewport, never from the activities.** The lane range comes from
  // `laneAtScreenY` at the top and bottom of the canvas, which is arithmetic on `view.originY` — so
  // this is O(visible lanes) with no dependency on plan size, and it deliberately does NOT call
  // `frame.laneRows()`. That getter is lazy on purpose (`paint-frame.ts`): it buckets and sorts the
  // visible set, and a paint with the labels and dates layers off never builds it. Reading it here
  // would make every frame pay for a build this layer has no use for — it needs boundaries, not
  // contents.
  //
  // Batched into one path with one stroke, on a half-pixel y for the same crispness rule the day
  // and month gridlines follow. `paint.lane-rule-budget.test.ts` counts the calls.
  {
    ctx.strokeStyle = palette.laneRule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstLane = Math.floor(laneAtScreenY(0, view));
    const lastLane = Math.ceil(laneAtScreenY(size.height, view));
    for (let lane = firstLane; lane <= lastLane; lane += 1) {
      const y = Math.round(screenYOfLane(lane, view)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(size.width, y);
    }
    ctx.stroke();
  }

  // Layer 2: dependency edges (only when an endpoint is visible). Driving edges — the
  // ties that set their successor's start (M3) — are drawn emphasised: a heavier SOLID
  // line, versus a thin DASHED line for non-driving ties. The weight + dash encode
  // "driver" without relying on colour (WCAG 1.4.1), mirroring the bar criticality cue.
  // Two batched passes so each dash/width state is set once, not per edge.
  // Lag runs (ADR-0052 M5) are collected during the edge passes but painted ABOVE the bars
  // (layer 3.2) — an on-bar depiction under the bars would be invisible. Refresh-only.
  let lagRuns: LagRun[] | null = null;
  // The draggable lag anchors' handle centres, collected in the same pass as the runs and painted
  // just above them (layer 3.2) — the affordance sits ON the bar, so it must clear the bar layer.
  // The emphasised (hovered / dragged) one is held out so it draws last, at its larger radius.
  let lagHandlePoints: Point[] | null = null;
  // Read after the edge layer, because the revision overlay may still route through `lineOf`.
  let routed: RouteFrame | null = null;
  /**
   * **Gap labels are placed last, against the text already there** (NetPoint grammar M4, found by
   * FC-G5's text-on-text limb). M3-T3 drew each gap label in the link layer as soon as its link was
   * stroked, which put two labels on one shared leg on top of each other, and one over a date on
   * the row below (Unit 300, 5 to 6 collisions per zoom). So the link layer only collects them, the
   * name, date and plate passes record the boxes they draw, and the labels are placed after all of
   * them, each only where its chip meets none of those boxes and no label placed before it. Scene
   * order decides between two labels, so the choice is deterministic.
   */
  const pendingGapLabels: { text: string; line: Point[]; x0: number; x1: number }[] = [];
  /**
   * The lag plates, collected by the link layer and placed with the gap labels, after every name
   * and date (node-to-node links M3). Node-to-node routing moves which segment of a link is
   * longest, and a plate placed with no knowledge of the text rows landed on an activity's own
   * code or date ("+1d" over "A108" on the small plan). Each plate now takes the first position on
   * its own line whose box meets no text, and is withheld where none is free; the lag is still in
   * the listbox. Plates are placed before gap labels, so a plate keeps its place over a label.
   */
  const pendingPlates: { text: string; line: Point[]; ink: string }[] = [];
  const placedText: Rect[] = [];
  const noteText = (x: number, w: number, y: number, align: 'left' | 'right' | 'center'): void => {
    const left = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    placedText.push({ x: left, y: y - LABEL_LINE_H / 2, w, h: LABEL_LINE_H });
  };
  // **The row's text, placed once** (links-and-labels M1, spec §4.2): every name, date and centre
  // item, by `row-text-layout.ts`, before the edge layer so the router can read where the text is
  // (M2). Layers 3.6–3.8 below draw these items and place nothing themselves: one opinion about
  // where the text is, which the painter and the router both read.
  //
  // `measure` sets the font only on a memo miss, so a warm frame makes no context call here (the
  // golden log is byte-identical). A cold miss leaves whichever label font it measured in; every
  // text layer sets its own font before it draws, which `paint.text-layout-memo.test.ts` holds by
  // comparing each `fillText`'s font cold and warm.
  const reservesTextRows = rowReservesTextRows();
  const withCodes = toggles.activityCodes === true;
  const textLayout = layoutRowText({
    rows: frame.laneRows,
    view,
    size,
    toggles,
    visualRefresh: scene.visualRefresh === true,
    reservesTextRows,
    measure: (t, f) =>
      labelWidths.measure(
        t,
        (x) => {
          ctx.font = f ?? LABEL_FONT;
          return ctx.measureText(x).width;
        },
        f,
      ),
    // The canvas label (NetPoint grammar M4-T1): the name, with the code before it only while
    // `View ▾ ▸ Markers ▸ Activity codes` is on (spec §4.2 G7).
    labelOf: (a) => canvasLabel({ code: a.code ?? null, name: a.label }, withCodes),
  });
  // A link's facts that do not depend on its route (links-and-labels M2, spec D-5), derived once
  // in `link-facts.ts` so the router can score whether a lagged link's plate has room and the link
  // layer below draws the same plate: the gap a non-driving link waits, and the plate's text.
  const linkFacts = linkFactsOf(
    scene,
    view,
    toggles,
    typeof ctx.fillText === 'function' && typeof ctx.measureText === 'function'
      ? (t, f) =>
          labelWidths.measure(
            t,
            (x) => {
              ctx.font = f ?? LABEL_FONT;
              return ctx.measureText(x).width;
            },
            f,
          )
      : null,
  );
  const { gapOf, plateTextOf } = linkFacts;
  if (scene.edges.length > 0) {
    const route = routeFrame(
      scene,
      view,
      visibleIds,
      byId,
      rectCache,
      textIndexOf(allItems(textLayout)),
      plateScoringOf(linkFacts, scene, view, visibleIds, byId, rectCache, textLayout),
    );
    const { workingWalk, refresh, glyphs, lineOf, lines } = route;
    lagRuns = route.lagRuns;
    lagHandlePoints = route.lagHandlePoints;
    routed = route;
    const highlightIds = refresh ? linkHighlightIds(scene.selectedId, scene.hoverId) : null;
    /**
     * **The link language** (NetPoint-layout M2, spec §4.7, ADR-0154) — the refreshed path only;
     * flag-off keeps the legacy dashed/solid passes below byte for byte.
     *
     * - A **driving** link is 2 px solid in its rung's ink (`linkRung`): critical only when both
     *   ends are critical. Drivingness is carried by WEIGHT, criticality also by the endpoints' node
     *   shapes, so no fact here is colour-only (WCAG 1.4.1).
     * - A **non-driving** link is 1 px SOLID in `linkMinor`.
     * - **Waiting time is a number, not a dash** (NetPoint grammar M3-T3, spec §4.2 G6, CQ-5). The
     *   dash ADR-0154 D3 gave it is retired: a non-driving link whose gap (`linkGapSpan`, working
     *   days on the plan calendar, the number the listbox speaks) is positive carries a borderless
     *   label on its waiting run, on an opaque ground chip, at the working tier or finer, under the
     *   `Link gaps` switch. A driving link has no waiting by definition, so it never has one.
     * - **Direction**: filled chevrons along the line (`chevronsAlong`, capped per link) plus the
     *   terminal head, filled in the link's ink in one batch per bucket.
     * - **Lag**: a BORDERED plate on the link's longest segment, its border in the link's own ink
     *   (U2/X2), drawn after every link so no line crosses it. A link with a lag and a gap carries
     *   one plate with both figures, the lag first with its sign.
     *
     * Links are batched into buckets by (ink, width), drawn quietest first, so a critical link is
     * never overdrawn by an ordinary one and each style is set once per bucket, not per link.
     */
    /**
     * The polyline a link's HEAD is built from (NetPoint grammar M2-T3, spec §4.13 A1). Where the
     * link ends on a node, the node paints over its last {@link NODE_REACH_PX} px, so the head is
     * built from the line with that length removed and stops at the rim. Only where a node is
     * actually drawn: the refreshed path, a task bar, and a tip on one of its two node centres (a
     * time-true lag anchor mid-bar has no node). The stroked line is never trimmed.
     */
    const headLineFor = (edge: RenderEdge, line: Point[]): Point[] => {
      if (scene.visualRefresh !== true) return line;
      const succ = byId.get(edge.successorId);
      if (!succ) return line;
      const succRect = activityRect(succ, view, scene.dataDate, rectCache);
      const tip = line[line.length - 1];
      if (!succRect || !tip) return line;
      const at = (c: Point): boolean => Math.abs(c.x - tip.x) < 0.5 && Math.abs(c.y - tip.y) < 0.5;
      // A milestone's centre port (node-to-node links spec D-5): a vertical arrives at the glyph's
      // centre, so the head stops on the triangle rather than under it.
      if (isMilestone(succ.type)) {
        const centre = { x: succRect.x + succRect.w / 2, y: succRect.y + succRect.h / 2 };
        return at(centre) ? trimPolylineEnd(line, MILESTONE_RADIUS) : line;
      }
      if (barGlyphKind(succ.type) !== 'bar') return line;
      // On a node centre, or a two-way track's end beside one (links-and-labels M3, spec §4.7).
      const trim = nodeHeadTrim(tip, nodeCentres(succRect));
      return trim === null ? line : trimPolylineEnd(line, trim);
    };
    const paintLinkLanguage = (): void => {
      interface Bucket {
        ink: string;
        /** The marks' fill: the violet mark shade on a violet link, else the line's own ink. */
        markInk: string;
        width: number;
        solid: Point[][];
        marks: [Point, Point, Point][];
      }
      const order = ['minor', 'normal', 'near', 'critical'] as const;
      const inkOf = (key: (typeof order)[number]): string =>
        key === 'minor'
          ? palette.linkMinor
          : key === 'critical'
            ? palette.critical
            : key === 'near'
              ? palette.nearCritical
              : palette.linkDriving;
      const base = new Map<string, Bucket>();
      const lit = new Map<string, Bucket>();
      const plates: { text: string; line: Point[]; ink: string }[] = [];
      const gapLabels = pendingGapLabels;
      for (const edge of scene.edges) {
        const line = lines.get(edge);
        if (!line) continue;
        const pred = byId.get(edge.predecessorId);
        const succ = byId.get(edge.successorId);
        if (!pred || !succ) continue;
        const key = edge.isDriving ? linkRung(pred, succ) : 'minor';
        const highlighted = highlightIds !== null && edgeTouches(edge, highlightIds);
        const buckets = highlighted ? lit : base;
        const bucketKey = highlighted ? (edge.isDriving ? 'driving' : 'minor') : key;
        let bucket = buckets.get(bucketKey);
        if (!bucket) {
          bucket = {
            ink: highlighted ? palette.selection : inkOf(key),
            // NetPoint grammar M3 (spec §4.2 G5): a violet link's direction marks are the darker
            // mark shade, clearing 3:1 on the line itself. A rung link's marks stay in the rung's
            // ink and read by their outline, because no darker step clears 3:1 on the critical line
            // (conditions.md, the 2026-09-24 amendment).
            markInk: highlighted
              ? palette.selection
              : key === 'minor' || key === 'normal'
                ? palette.linkMark
                : inkOf(key),
            // The highlight is one weight step heavier than the link it lights (ADR-0052 M5).
            width: (edge.isDriving ? 2 : 1) + (highlighted ? 1 : 0),
            solid: [],
            marks: [],
          };
          buckets.set(bucketKey, bucket);
        }
        bucket.solid.push(line);
        // The gap a non-driving link waits, and where (M3-T3). One computation for both, from the
        // relationship's lag anchor to the successor's constrained edge (`linkGapSpan`).
        const gap = gapOf(edge, pred, succ);
        // Chevrons first and the terminal head last, so each link's head is the final subpath it
        // emits — the same order the legacy pass gives, which is what a recorder reads a head by.
        bucket.marks.push(...chevronsAlong(line));
        if (workingWalk) {
          const headLine = headLineFor(edge, line);
          const head = glyphs
            ? arrowhead(headLine, ARROWHEAD_ROUTED_PX, ARROWHEAD_HALF_W_PX)
            : arrowhead(headLine);
          if (head) bucket.marks.push(head);
        }
        const plateText = plateTextOf(edge, gap);
        if (plateText !== null) {
          plates.push({ text: plateText, line, ink: bucket.ink });
        } else if (gap) {
          gapLabels.push({ text: gap.text, line, x0: gap.x0, x1: gap.x1 });
        }
      }
      const drawBucket = (bucket: Bucket): void => {
        ctx.lineWidth = bucket.width;
        ctx.strokeStyle = bucket.ink;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const run of bucket.solid) drawRoundedPolyline(ctx, run);
        ctx.stroke();
        if (bucket.marks.length > 0) {
          ctx.fillStyle = bucket.markInk;
          ctx.beginPath();
          for (const [tip, left, right] of bucket.marks) {
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(left.x, left.y);
            ctx.lineTo(right.x, right.y);
            ctx.lineTo(tip.x, tip.y); // close manually (the Ctx2D surface has no closePath)
          }
          ctx.fill();
        }
      };
      for (const key of order) {
        const bucket = base.get(key);
        if (bucket) drawBucket(bucket);
      }
      for (const key of ['minor', 'driving']) {
        const bucket = lit.get(key);
        if (bucket) drawBucket(bucket);
      }
      pendingPlates.push(...plates);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.edge;
    };
    const drawEdges = (driving: boolean, highlighted = false): void => {
      const heads: [Point, Point, Point][] = [];
      ctx.beginPath();
      for (const edge of scene.edges) {
        if (edge.isDriving !== driving) continue;
        // With a highlight active, the base passes skip incident edges and the highlight passes
        // draw ONLY them (on top, restyled). No highlight ⇒ the predicate is never consulted.
        if (highlightIds && edgeTouches(edge, highlightIds) !== highlighted) continue;
        const line = lines.get(edge);
        if (!line) continue;
        if (refresh) drawRoundedPolyline(ctx, line);
        else drawPolyline(ctx, line);
        if (workingWalk) {
          // The routed head (T17) is longer along the line but no wider — legible where a Month-zoom
          // link is a few pixels of rule, without a barb crossing its neighbour in a fanned bundle.
          // It rides the routing flag, so flag-off is the same five-pixel head it has always been.
          const headLine = headLineFor(edge, line);
          const head = glyphs
            ? arrowhead(headLine, ARROWHEAD_ROUTED_PX, ARROWHEAD_HALF_W_PX)
            : arrowhead(headLine);
          if (head) heads.push(head);
        }
      }
      ctx.stroke();
      // Arrowheads fill after the pass's stroke in one batched path. They share the pass's line
      // colour (the edge colour; the selection colour on a highlight pass) — the driving cue
      // stays the line weight + dash (WCAG 1.4.1), so no new colour is introduced.
      if (heads.length > 0) {
        ctx.fillStyle = highlighted ? palette.selection : palette.edge;
        ctx.beginPath();
        for (const [tip, left, right] of heads) {
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(left.x, left.y);
          ctx.lineTo(right.x, right.y);
          ctx.lineTo(tip.x, tip.y); // close manually (the Ctx2D surface has no closePath)
        }
        ctx.fill();
      }
    };
    if (refresh) {
      paintLinkLanguage();
    } else {
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      drawEdges(false); // non-driving: thin, dashed
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      drawEdges(true); // driving: heavier, solid
      ctx.lineWidth = 1;
      // Incident-link highlight passes (ADR-0052 M5): the selected/hovered bar's ties re-draw on
      // top, one weight step heavier in the selection colour — a WEIGHT change with the colour, and
      // each pass keeps its dash state, so neither the highlight nor the driving cue is colour-only
      // (WCAG 1.4.1); the ring token clears the 3:1 non-text bar on the canvas ground (1.4.11).
      // Selection is the keyboard/AT-reachable equivalent of the pointer hover (WCAG 2.1.1).
      if (highlightIds) {
        ctx.strokeStyle = palette.selection;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        drawEdges(false, true); // highlighted non-driving: heavier, still dashed
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        drawEdges(true, true); // highlighted driving: heaviest, solid
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.edge;
      }
    }

    /*
     * **Layer 2.4: the comparison's changed logic** (ADR-0127) — the differentiating half, because
     * a re-sequence is only visible as a re-sequence if the links are drawn.
     *
     * **ONE router, and the treatment is a stroke style** (spec §4.4 D7). ADR-0065 made obstacle
     * awareness an optional PARAMETER of `routeOrthogonal` precisely so a second
     * `routeOrthogonalAvoiding` could not drift invisibly; a ghost router would be that mistake one
     * epic along. So an ADDED or CHANGED link REUSES the line already computed for this frame —
     * bundled, obstacle-aware, arrowheaded, identical to the one underneath it — and a REMOVED link
     * is routed through the SAME `lineOf` closure with a synthetic edge.
     *
     * That reuse is what makes the pass cheap: no second routing for the common case, and the
     * bundling decision above has already been taken over all the lines together.
     *
     * REMOVED is drawn dashed and ADDED/CHANGED solid-and-heavier, on top of the base passes, in
     * the selection colour — a WEIGHT and DASH change alongside the colour, so neither cue is
     * colour-only (WCAG 1.4.1), matching the incident-highlight passes immediately above.
     *
     * **No accessible claim is made for a link, and that is a decision** (spec §4.8): a link is not
     * a selectable object in this product and there is no listbox of edges, so tier 1 — the change
     * list, in text — is the route for logic changes. The toggle's own description says so rather
     * than implying a parity that does not exist (ADR-0122).
     */
    if (scene.compareLinks && scene.compareLinks.length > 0) {
      const byDependencyId = new Map<string, Point[]>();
      for (const [edge, line] of lines) {
        if (edge.id !== undefined) byDependencyId.set(edge.id, line);
      }
      const removed: Point[][] = [];
      const present: Point[][] = [];
      for (const link of scene.compareLinks) {
        if (link.state === 'REMOVED') {
          // Not in `scene.edges`, so it has no computed line — routed here through the same
          // closure the live edges used. `FS` because a removed link's type is not carried: the
          // picture's claim is "these two were linked", and the change list carries the type.
          const pred = byId.get(link.predecessorId);
          const succ = byId.get(link.successorId);
          if (!pred || !succ) continue;
          if (!visibleIds.has(link.predecessorId) && !visibleIds.has(link.successorId)) continue;
          const line = lineOf(
            {
              predecessorId: link.predecessorId,
              successorId: link.successorId,
              type: 'FS',
              // Not driving, and no lag: the picture's claim is "these two WERE linked". The
              // change list carries the type and the lag in text, which is where a reader gets
              // them (spec §4.8). Inventing a lag here would draw a time-true anchor for a
              // quantity nobody supplied.
              isDriving: false,
            },
            pred,
            succ,
          );
          if (line) removed.push(line);
          continue;
        }
        const line = byDependencyId.get(link.dependencyId);
        if (line) present.push(line);
      }
      ctx.strokeStyle = palette.selection;
      if (present.length > 0) {
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (const line of present) drawPolyline(ctx, line);
        ctx.stroke();
      }
      if (removed.length > 0) {
        ctx.lineWidth = 2;
        ctx.setLineDash(COMPARE_DASH as number[]);
        ctx.beginPath();
        for (const line of removed) drawPolyline(ctx, line);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.edge;
    }
  }

  // Layer 2.5: baseline ghost bars (the Baseline overlay lens, `docs/specs/canvas-lenses/`) — the
  // captured baseline span drawn as a thin dashed outline BENEATH the live bars, so slip reads on the
  // canvas. Culled by count exactly like the bar layer: `visibleIds.has(ghost.id)` is the FIRST check,
  // so a ghost whose live bar is off-screen does no date math / allocation at all (matching the `rects`
  // path, built only over `visibleIds`); the per-ghost `rectsIntersect` then culls a slipped ghost whose
  // own span left the viewport. Batched into one stroke state. Absent ⇒ this whole block is skipped ⇒
  // byte-for-byte parity. A milestone ghosts as a diamond outline (matching its live shape, ADR-0026),
  // and a filter-dimmed ghost recedes at the same reduced alpha as its dimmed live bar.
  if (scene.baselineGhosts && scene.baselineGhosts.length > 0) {
    const viewport: Rect = { x: 0, y: 0, w: size.width, h: size.height };
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash(GHOST_DASH as number[]);
    for (const ghost of scene.baselineGhosts) {
      if (!visibleIds.has(ghost.id)) continue; // cull by count before any date math / allocation
      const g = ghostGeometry(
        ghost.type,
        scene.dataDate,
        ghost.baselineStart,
        ghost.baselineFinish,
        view,
      );
      const top = screenYOfLane(ghost.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
      const dimmed = scene.dimmedIds?.has(ghost.id) ?? false;
      if (g.milestone) {
        // A zero-width diamond outline centred on the baseline point, matching the live milestone.
        const cx = g.cx;
        const cy = top + BAR_HEIGHT / 2;
        if (
          !rectsIntersect(
            {
              x: cx - MILESTONE_RADIUS,
              y: cy - MILESTONE_RADIUS,
              w: MILESTONE_RADIUS * 2,
              h: MILESTONE_RADIUS * 2,
            },
            viewport,
          )
        ) {
          continue;
        }
        if (dimmed) ctx.globalAlpha = DIMMED_ALPHA;
        traceMilestoneGlyph(ctx, cx, cy, MILESTONE_RADIUS, true, scene.visualRefresh === true); // closed — stroke-only
        ctx.stroke();
        if (dimmed) ctx.globalAlpha = 1;
      } else {
        const w = Math.max(2, g.x2 - g.x1);
        if (!rectsIntersect({ x: g.x1, y: top, w, h: BAR_HEIGHT }, viewport)) continue;
        if (dimmed) ctx.globalAlpha = DIMMED_ALPHA;
        ctx.strokeRect(g.x1 + 0.5, top + 0.5, w - 1, BAR_HEIGHT - 1);
        if (dimmed) ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);
  }

  // Layer 2.6: the revision-comparison change picture (ADR-0127) — where the CHANGED bars were on
  // the old side of the selected pair, drawn as a dashed outline beneath the live bars, with work
  // that is no longer in the plan struck through.
  //
  // **It does NOT cull by `visibleIds`, and that is the one thing to know about this layer.** Its
  // sibling above does, correctly: a baseline ghost always has a live bar to sit behind, so an
  // off-screen live bar means an irrelevant ghost. Here, REMOVED work has no live activity at all —
  // it is not in `scene.activities`, so it is never in `visibleIds`, and culling by it would
  // silently drop exactly the rows this layer exists to show. The plan for this milestone said to
  // cull by `visibleIds` first "as the ghost layer already does"; that instruction is right for the
  // layer it was copied from and wrong here, and following it would have produced an overlay that
  // looked correct on every plan where nothing had been deleted.
  //
  // The cull is therefore the per-ghost `rectsIntersect` alone — the same viewport test the layer
  // above falls back on for a slipped ghost. `compareGhosts` holds only what CHANGED (the server
  // decides that, ADR-0126), so the set is already a small fraction of the plan.
  if (scene.compareGhosts && scene.compareGhosts.length > 0) {
    const viewport: Rect = { x: 0, y: 0, w: size.width, h: size.height };
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash(COMPARE_DASH as number[]);
    for (const ghost of scene.compareGhosts) {
      const g = ghostGeometry(ghost.type, scene.dataDate, ghost.fromStart, ghost.fromFinish, view);
      const top = screenYOfLane(ghost.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
      if (g.milestone) {
        const cx = g.cx;
        const cy = top + BAR_HEIGHT / 2;
        if (
          !rectsIntersect(
            {
              x: cx - MILESTONE_RADIUS,
              y: cy - MILESTONE_RADIUS,
              w: MILESTONE_RADIUS * 2,
              h: MILESTONE_RADIUS * 2,
            },
            viewport,
          )
        ) {
          continue;
        }
        traceMilestoneGlyph(ctx, cx, cy, MILESTONE_RADIUS, true, scene.visualRefresh === true);
        ctx.stroke();
        if (ghost.removed) strikeThrough(ctx, cx - MILESTONE_RADIUS, cy, MILESTONE_RADIUS * 2);
        continue;
      }
      const w = Math.max(2, g.x2 - g.x1);
      if (!rectsIntersect({ x: g.x1, y: top, w, h: BAR_HEIGHT }, viewport)) continue;
      ctx.strokeRect(g.x1 + 0.5, top + 0.5, w - 1, BAR_HEIGHT - 1);
      // Removed work is distinguished by SHAPE, not by colour (WCAG 1.4.1) — and by a shape that
      // needs no new token, which also sidesteps the ADR-0100 M4 trap of a canvas pair that is
      // absent from `@theme inline` and therefore paints nothing at all in a real browser while the
      // contrast gate stays green.
      if (ghost.removed) strikeThrough(ctx, g.x1, top + BAR_HEIGHT / 2, w);
    }
    ctx.setLineDash([]);
  }

  // Forced HERE, at exactly the point the eager build used to sit — after the edge layer, whose
  // `laneIntervalIndex` independently re-derives the same geometry. That duplication is
  // `docs/TECH_DEBT.md` #76 and is deliberately NOT fixed by this refactor: hoisting the call above
  // the edge layer is a performance change with its own measurement, and it would be invisible to
  // every gate here (`activityRect` makes no `ctx` calls). The frame's getter makes that a one-line
  // move later; this line keeps today's ordering byte-for-byte until someone measures it.
  const rects = frame.rects();

  // Layer 2.65: the **LEVELLED GHOSTS** (one-planning-surface M-E) — where the resource-levelling
  // pass would put each bar it MOVED, drawn as a dashed outline beneath the live bars.
  //
  // **A rival POSITION, not a bound**, which is what separates it from the feasible window one
  // layer below: the window is where the bar MAY go, this is a place it COULD be. Drawing the two
  // as peers was the rejected design.
  //
  // Culled by `visibleIds` FIRST, exactly as the baseline ghost layer is and unlike the comparison
  // layer between them — and the difference is not stylistic. A levelled ghost always belongs to a
  // live activity (the pass only overlays activities in the plan), so an off-screen live bar means
  // an irrelevant ghost; the comparison layer cannot cull that way because REMOVED work has no
  // live activity at all. Copying the wrong neighbour is a defect that looks correct on every plan
  // where nothing was deleted, which that layer's docblock records.
  //
  // Absent ⇒ the lens is off, levelling never ran, or nothing moved ⇒ this block is skipped ⇒
  // byte-for-byte parity.
  if (scene.levelledGhosts && scene.levelledGhosts.length > 0) {
    const viewport: Rect = { x: 0, y: 0, w: size.width, h: size.height };
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash(LEVELLED_DASH as number[]);
    for (const ghost of scene.levelledGhosts) {
      if (!visibleIds.has(ghost.id)) continue; // cull by count before any date math / allocation
      const g = ghostGeometry(
        ghost.type,
        scene.dataDate,
        ghost.leveledStart,
        ghost.leveledFinish,
        view,
      );
      const top = screenYOfLane(ghost.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
      const dimmed = scene.dimmedIds?.has(ghost.id) ?? false;
      if (g.milestone) {
        const cx = g.cx;
        const cy = top + BAR_HEIGHT / 2;
        if (
          !rectsIntersect(
            {
              x: cx - MILESTONE_RADIUS,
              y: cy - MILESTONE_RADIUS,
              w: MILESTONE_RADIUS * 2,
              h: MILESTONE_RADIUS * 2,
            },
            viewport,
          )
        ) {
          continue;
        }
        if (dimmed) ctx.globalAlpha = DIMMED_ALPHA;
        traceMilestoneGlyph(ctx, cx, cy, MILESTONE_RADIUS, true, scene.visualRefresh === true); // closed — stroke-only
        ctx.stroke();
        if (dimmed) ctx.globalAlpha = 1;
      } else {
        const w = Math.max(2, g.x2 - g.x1);
        if (!rectsIntersect({ x: g.x1, y: top, w, h: BAR_HEIGHT }, viewport)) continue;
        if (dimmed) ctx.globalAlpha = DIMMED_ALPHA;
        ctx.strokeRect(g.x1 + 0.5, top + 0.5, w - 1, BAR_HEIGHT - 1);
        if (dimmed) ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);
  }

  // Layer 2.7: the **FEASIBLE WINDOW** (one-planning-surface M-E, spec §4.8) — the span
  // `[earlyStart, lateFinish]` a bar may legally occupy, as ONE hollow bracket with a vertical cap
  // at each end.
  //
  // **It REPLACES the shipped float and drift tails rather than sitting beside them**, on the
  // product owner's decision: they were one fact drawn twice. Both centred on this same band, and
  // their extremes were already this window's — the drift tail's left edge is `earlyStart`, and a
  // CORRECTED float tail's right edge is `lateFinish`. Two thirds of this was on screen already.
  //
  // **Drawn BEFORE the bars**, which is what lets one rect read as two flanking tails: the bar
  // paints over the middle. The two cases where a cap falls inside the bar invert that and are
  // handled at Layer 3.56 — stated there rather than discovered.
  //
  // Hollow and hatched, never filled: a filled extension would read as duration, and the hatch is
  // the non-colour cue (WCAG 1.4.1) that survives a monochrome print. **The hatch skips the span
  // the bar covers** — that region is occluded, so tracing it is invisible work; the OUTLINE still
  // spans the whole window, because the caps must sit at the true ends.
  //
  // Cheap by construction: no text, no measurement, culled with the bar. Toggle off ⇒ not one call
  // ⇒ parity.
  if (toggles.floatTails === true) {
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.labelBeside;
    // ONE batched path for every window on screen (the file's established discipline — a stroke
    // per bar would be up to 4,000 calls).
    ctx.beginPath();
    for (const [id, rect] of rects) {
      const activity = byId.get(id)!;
      const win = feasibleWindowRect(rect, activity.remainingFloat, activity.visualDriftDays, view);
      if (!win) continue;
      const { rect: band } = win;
      if (band.w >= 2) {
        // The span, minus the caps, which are traced separately so an inverted one can be held
        // back to Layer 3.56.
        ctx.moveTo(band.x + 0.5, band.y + 0.5);
        ctx.lineTo(band.x + band.w - 0.5, band.y + 0.5);
        ctx.moveTo(band.x + 0.5, band.y + band.h - 0.5);
        ctx.lineTo(band.x + band.w - 0.5, band.y + band.h - 0.5);
        // Diagonal hatch — CLAMPED TO THE VIEWPORT, which is the difference between bounded and
        // unbounded work: a window's width is `(drift + duration + float) × pxPerDay`, so a routine
        // 200-day float at day zoom runs thousands of pixels off the side of the screen. Hatching
        // its full length measured 320,000 segments for a 2,000-activity plan — cost scaling with
        // the DATA rather than the screen.
        const from = Math.max(band.x + TAIL_HATCH_STEP, -band.h);
        const to = Math.min(band.x + band.w, size.width);
        // …and skips the occluded middle. `rect` is the bar; everything between its edges is
        // painted over by Layer 3 a few lines below.
        for (let hx = from; hx < to; hx += TAIL_HATCH_STEP) {
          // Skip only the FULLY occluded lines. A hatch stroke runs from `hx` to `hx + band.h`,
          // so one starting just left of the bar is still partly visible and must be traced —
          // the conservative test is the difference between an invisible saving and a visible gap
          // at each edge of every bar.
          if (hx >= rect.x && hx + band.h <= rect.x + rect.w) continue;
          ctx.moveTo(hx, band.y + band.h);
          ctx.lineTo(hx + band.h, band.y);
        }
      }
      if (!win.leftCapInsideBar) traceWindowCap(ctx, win.leftCapX, band);
      if (!win.rightCapInsideBar) traceWindowCap(ctx, win.rightCapX, band);
    }
    ctx.stroke();
  }

  // Layer 3: activity bars + milestone diamonds. **On the LEGACY path** critical/near-critical
  // activities get a solid/dashed outline on the bar itself (a non-colour cue for criticality —
  // WCAG 1.4.1); the refreshed path carries the same three rungs on the node glyph instead, and
  // `drawRefreshedBar` uses `dash` only for a milestone's own outline.
  for (const [id, rect] of rects) {
    const activity = byId.get(id)!;
    const dash = criticalDash(activity);
    // Filter lens: a dimmed (non-matching) bar recedes via reduced alpha, but its criticality outline
    // is drawn at full strength below (alpha restored), so the shape cue survives the dim (WCAG 1.4.1
    // — never colour/emphasis alone). Absent `dimmedIds` ⇒ this is a no-op ⇒ byte-for-byte parity.
    // The bar a gesture is currently dragging/resizing recedes further still (ADR-0054 §1), so the
    // in-flight ghost reads as *the bar itself moving* rather than a second shape beside it; what
    // stays is a faint "you came from here" trace. It counts as `dimmed` for everything downstream
    // (label ink, badges), so only the alpha differs. Absent `gestureSourceId` ⇒ no-op ⇒ parity.
    const gestureSource = scene.gestureSourceId === id;
    const dimmed = gestureSource || (scene.dimmedIds?.has(id) ?? false);
    ctx.globalAlpha = dimmed ? (gestureSource ? GESTURE_SOURCE_ALPHA : DIMMED_ALPHA) : 1;
    ctx.fillStyle = barColour(activity, palette, scene.barFill);
    if (scene.visualRefresh) {
      // M4 refreshed bar body (shape/progress/emphasis/glyphs) — the lens fill above still
      // decides the colour; the refresh restyles only shape/structure. Restores alpha itself.
      drawRefreshedBar(ctx, activity, rect, palette, scene, view);
    } else if (isMilestone(activity.type)) {
      // A diamond centred in the bounding box.
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      traceMilestoneDiamond(ctx, cx, cy, MILESTONE_RADIUS);
      ctx.fill();
      ctx.globalAlpha = 1; // outline + badges below stay full-strength even on a dimmed bar
      if (dash) {
        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1; // outline + badges below stay full-strength even on a dimmed bar
      if (dash) {
        ctx.strokeStyle = palette.outline;
        ctx.lineWidth = 1.5;
        ctx.setLineDash(dash);
        ctx.strokeRect(rect.x + 0.75, rect.y + 0.75, rect.w - 1.5, rect.h - 1.5);
        ctx.setLineDash([]);
      }
    }
  }

  // Layer 3.1: the NODES (NetPoint grammar M2-T3, spec §4.2 G4) — after every bar body, so a shared
  // node is never half-covered by the bar it joins, and before the badges, so a constraint pin
  // (whose apex touches the bar edge a node is centred on) stays on top. Refresh path only: the
  // legacy path carries criticality on the bar outline and has never drawn a node.
  if (scene.visualRefresh)
    paintNodes(ctx, nodeMarks(frame.laneRows().values()), palette, scene.barFill);

  for (const [id, rect] of rects) {
    const activity = byId.get(id)!;
    // Where each edge cue sits: clear of the node on a bar that draws them, exactly where it always
    // was on one that does not (`edgeCuePlacement`, the product owner's 2026-09-25 report).
    const cues = edgeCuePlacement(
      activity,
      rect,
      scene.visualRefresh === true && barGlyphKind(activity.type) === 'bar',
    );
    // A set date constraint pins the bar's start or finish edge — mark that edge (a milestone,
    // having no width, is marked at its centre). A cheap per-bar shape, drawn only for the
    // constrained + visible activities, so it stays within the draw budget (ADR-0026).
    if (activity.constraint) {
      if (isMilestone(activity.type) && scene.visualRefresh === true) {
        // The refreshed milestone is a filled triangle, and its constraint is a "!" cut into it
        // (`drawMilestoneConstraintMark`) rather than a pin hung above it on the name row.
        drawMilestoneConstraintMark(ctx, rect.x + rect.w / 2, rect.y + rect.h / 2, palette);
      } else {
        const edgeX = isMilestone(activity.type)
          ? rect.x + rect.w / 2
          : activity.constraint === 'finish'
            ? rect.x + rect.w
            : rect.x;
        drawConstraintPin(ctx, edgeX, cues.pinTipY, palette, scene.visualRefresh === true);
      }
    }
    // Placement conflict (ADR-0033): never auto-moved, only flagged. The mapping seam gates this to
    // the placed basis, so a Late-overlay bar never shows it.
    //
    // **The edge is chosen by the REASON, not the boolean** (M-J gate pass). `LATER_THAN_BOUND` is
    // a breach of the placed FINISH against a ceiling (`engine/compute.ts:836`), so it is marked at
    // the finish; `EARLIER_THAN_LOGIC` is a start placed before the earliest feasible one and stays
    // at the start. The boolean is true for both, so gating on it drew every conflict at the start
    // — and for the late reason that is the one end of the bar nothing is wrong with, next to a
    // constraint pin sitting at the other.
    //
    // Clamped to the bar's own start so a narrow bar or a milestone keeps its badge on the shape
    // rather than hanging it off the left edge (`edgeCuePlacement` owns the arithmetic).
    if (activity.visualConflict) {
      drawConflictBadge(ctx, cues.conflict.leftX, cues.conflict.apexY, palette);
    }
    // Same-lane time-overlap (TECH_DEBT #24c): a manual lane drop left this bar overlapping another
    // in its lane. A stacked-squares badge above the bar's centre — width-independent (so a milestone
    // is marked too) and clear of the start-edge conflict/constraint cues.
    if (activity.laneOverlap) {
      // Lift clear of the constraint pin when the bar also carries one (they share the bar centre for
      // a milestone / a very narrow bar) so the two shape cues stack instead of colliding.
      const lift = activity.constraint ? CONSTRAINT_PIN_H + 1 : 0;
      drawOverlapBadge(ctx, rect.x + rect.w / 2, rect.y, palette, lift);
    }
    // Over-allocation highlight (Stage E M2): the engine flagged this activity's resource loading
    // (levelling window exceeded / self-over-allocated, ADR-0041). A mini-histogram badge at the bar's
    // top-right — a distinct shape cue, drawn only for the flagged + visible activities, so it stays a
    // set-membership check in this single pass (no extra repaint, ADR-0026). Absent `flaggedIds` ⇒ this
    // is a no-op ⇒ byte-for-byte parity.
    if (scene.flaggedIds?.has(id)) {
      drawOverAllocationBadge(ctx, cues.overAllocRightX, rect.y, palette);
    }
  }

  // Layer 3.2: lag-run depiction (ADR-0052 M5, refresh-only) — the horizontal stretch between a
  // bar edge and its walked lag anchor, as a dashed hairline in the edge colour OVER the bar (the
  // run is on-bar geometry; under the bars it would be invisible), so lag reads as waiting time.
  // Batched into one stroke; collected during the edge passes, so it is O(visible lagged edges).
  // `lagRuns` is only ever allocated under `visualRefresh` + time-true links ⇒ flag-off this whole
  // block is skipped ⇒ byte-for-byte parity.
  if (lagRuns && lagRuns.length > 0) {
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash(LAG_RUN_DASH as number[]);
    ctx.beginPath();
    for (const run of lagRuns) {
      ctx.moveTo(run.from.x, run.from.y);
      ctx.lineTo(run.to.x, run.to.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Layer 3.2b: the draggable lag handles, drawn just above their runs and above every bar so the
  // grab point is never occluded (ADR-0052 M3 discoverability fix — the drag shipped with an
  // invisible target). Only ever collected when the drag is armed AND the flag is on, so a
  // read-only surface and the flag-off path skip this block entirely (byte-for-byte parity). The
  // emphasised handle draws LAST, so it sits over any neighbour it grew into.
  // Layer 3.2a: the attachment dots (NetPoint grammar M3-T5, spec G12) — where a link joins
  // partway along a bar, drawn at the working tier and finer, above the bars and the lag runs and
  // beneath the lag handles, which keep their size and draw over a dot when the drag is armed. In
  // the mark shade and 4 px across, so a dot never reads as the handle (7 px, outline ink).
  const attachPoints = routed?.attachPoints ?? null;
  if (attachPoints && attachPoints.length > 0 && lodTier(view.pxPerDay) !== 'overview') {
    drawAttachDots(ctx, attachPoints, palette);
  }
  if (lagHandlePoints && lagHandlePoints.length > 0) {
    drawLagHandles(ctx, lagHandlePoints, palette, false);
  }
  const activeLagHandle = routed?.activeLagHandle ?? null;
  if (activeLagHandle) drawLagHandles(ctx, [activeLagHandle], palette, true);

  // Layer 3.5: the STATUS verticals — the data date and TODAY — above the bars and below the
  // labels + selection ring, so label text stays legible over the lines, not under them.
  //
  // Two marks, two channels (the marker-channel vocabulary, `docs/DESIGN_SYSTEM.md`): the **data
  // date** (`VITE_CANVAS_DATA_DATE`) is the schedule's own pivot — a fact of the programme — so it
  // draws SOLID at 2px in the foreground hue; **Today** is wall-clock now, a moving cue, so it
  // stays dashed at 1.5px in the destructive hue. Shape and weight distinguish them without
  // relying on hue (WCAG 1.4.1). Day 0 IS the data date (`screenXOfDay(0, view) === view.originX`,
  // render-model.ts), so the line needs no new geometry; it is culled by the same on-screen test
  // the Today line uses. `scene.dataDateLine` absent ⇒ `dataDateX` stays null ⇒ not one call is
  // added and the Today branch below is byte-for-byte the pre-change layer (the parity gate).
  //
  // THE COINCIDENCE RULE: when the two rules round to the same pixel, drawing both would only
  // overdraw one line with the other — the sole case where two lines are a rendering artefact
  // rather than two facts — so exactly ONE line draws, in the data-date treatment, and its pill
  // merges the labels (`Data date · today`). The test is `Math.round(x)` on the already-computed
  // screen x values, asserted both ways in `paint.test.ts`.
  //
  // **The decision itself now lives in `render/axis-markers.ts`** (#148 M1): cull, then clamp, then
  // coincidence, then overlap, once — because the labels are moving to the ruler's DOM layer and a
  // second implementation of "do these coincide?" would drift invisibly from this one. This block
  // draws the rules from that model; nothing about what it draws has changed.
  const markers = axisMarkers(view, size, {
    dataDateLine: scene.dataDateLine,
    todayOffset: scene.todayOffset,
    todayFraction: scene.todayFraction,
    todayToggle: toggles.today,
  });
  const dataDateX = markers.lines.find((l) => l.kind === 'dataDate')?.x ?? null;
  const todayLine = markers.lines.find((l) => l.kind === 'today') ?? null;
  if (dataDateX !== null) {
    ctx.strokeStyle = palette.dataDate;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(dataDateX, 0);
    ctx.lineTo(dataDateX, size.height);
    ctx.stroke();
  }

  // The TODAY marker — a dashed vertical in the destructive hue. `todayFraction` (F6a,
  // `VITE_CANVAS_TIME_AXIS`) interpolates the line to the actual time-of-day rather than the
  // midnight boundary; absent/null keeps the plain integer offset, which is what makes the flag-off
  // parity claim structural. Culling, the toggle and the coincidence rule are all decided in
  // `axis-markers.ts`: a line is here iff the model returned one.
  //
  // **The LABELS are no longer drawn here** (#148 M2). They were pills at fixed screen y — chrome
  // painted onto a scrolling surface — so they printed over whichever lane the planner had panned
  // to the top. They are DOM in the ruler band now (`TsldCanvas.tsx`'s axis-marker rows), which
  // costs the diagram no height and puts a date mark where the x axis is. What stays is the rule:
  // a full-height vertical IS a scene mark, meaning something at every lane.
  if (todayLine !== null) {
    ctx.strokeStyle = palette.today;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(todayLine.x, 0);
    ctx.lineTo(todayLine.x, size.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Layer 3.56: the feasible window's INVERTED CAPS — the two states that draw AFTER the bars.
  //
  // The window itself is Layer 2.7, below the bars, so the bar occludes its middle and the span
  // reads as two flanking tails with no special-casing. These are that rule's only exceptions, and
  // they are independent: a cap that falls INSIDE the bar would be painted over and invisible.
  //
  //   * RIGHT, when remaining float is negative — the placement is past a ceiling, so the bar
  //     overflows its own window.
  //   * LEFT, when drift is negative — ADR-0033's stay-and-flag KEEPS a placement earlier than
  //     logic allows rather than clamping it, and drift is signed.
  //
  // **Both states drew nothing at all before M-E** (`floatTailRect`/`driftTailRect` each returned
  // `null` for a non-positive quantity), so each becomes visible here for the first time. The left
  // one was missing from the spec until an architecture review: one correct pattern applied to a
  // control and not its neighbour, which is this register's most-recorded shape.
  if (toggles.floatTails === true) {
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.labelBeside;
    ctx.beginPath();
    for (const [id, rect] of rects) {
      const activity = byId.get(id)!;
      const win = feasibleWindowRect(rect, activity.remainingFloat, activity.visualDriftDays, view);
      if (!win) continue;
      if (win.leftCapInsideBar) traceWindowCap(ctx, win.leftCapX, win.rect);
      if (win.rightCapInsideBar) traceWindowCap(ctx, win.rightCapX, win.rect);
    }
    ctx.stroke();
  }

  // Layer 3.58: relationship SLACK on the selected activity's links (ADR-0054 §5) — the gap in
  // days each tie leaves, answering "why is this activity waiting?". Scoped to the selection: a
  // number on every edge is unreadable at real network sizes. A driving edge's gap is 0 by
  // definition and is skipped, so what remains is exactly the non-binding slack worth reading.
  //
  // **The legacy path only, since NetPoint grammar M3-T3**: the refreshed path labels every waiting
  // link (the link language, above), so drawing this chip there too would be two marks for one fact
  // (ADR-0093's defect). Kept here as the flag-off rollback, byte for byte.
  if (
    scene.visualRefresh !== true &&
    toggles.linkSlack === true &&
    scene.selectedId &&
    typeof ctx.fillText === 'function' &&
    typeof ctx.measureText === 'function'
  ) {
    const selected = scene.selectedId;
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillStyle = palette.labelBeside;
    for (const edge of scene.edges) {
      if (edge.predecessorId !== selected && edge.successorId !== selected) continue;
      const pred = byId.get(edge.predecessorId);
      const succ = byId.get(edge.successorId);
      const predRect = rects.get(edge.predecessorId);
      const succRect = rects.get(edge.successorId);
      if (!pred?.earlyStart || !pred.earlyFinish || !succ?.earlyStart || !succ.earlyFinish)
        continue;
      if (!predRect || !succRect) continue; // both ends culled off-screen ⇒ nothing to annotate
      const gap = edgeGapDays({
        type: edge.type,
        predStartDay: axisDayOf(pred.type, scene.dataDate, pred.earlyStart),
        predFinishDay: axisDayOf(pred.type, scene.dataDate, pred.earlyFinish),
        succStartDay: axisDayOf(succ.type, scene.dataDate, succ.earlyStart),
        succFinishDay: axisDayOf(succ.type, scene.dataDate, succ.earlyFinish),
        lagDays: edge.lagDays ?? 0,
      });
      if (gap <= 0) continue; // driving / binding: no slack to report
      // Anchor the annotation on the endpoints the RELATIONSHIP actually constrains, not always
      // the predecessor's right edge: an SS tie runs start→start and an FF tie finish→finish, so a
      // fixed right-edge midpoint would float the number away from the line it explains.
      const predX = edge.type === 'SS' || edge.type === 'SF' ? predRect.x : predRect.x + predRect.w;
      const succX = edge.type === 'FF' || edge.type === 'SF' ? succRect.x + succRect.w : succRect.x;
      const midX = (predX + succX) / 2;
      const midY = (predRect.y + predRect.h / 2 + (succRect.y + succRect.h / 2)) / 2;
      // Drawn on the same filled+outlined chip the lag and cursor readouts use — a bare fillText
      // lands on bars, grid lines and other links with no guaranteed contrast.
      const text = `${gap}d`;
      const cw = ctx.measureText(text).width + LABEL_PAD_PX * 2;
      ctx.fillStyle = palette.bar;
      ctx.fillRect(midX - cw / 2, midY - SLACK_CHIP_H / 2, cw, SLACK_CHIP_H);
      ctx.strokeStyle = palette.barStroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(midX - cw / 2 + 0.5, midY - SLACK_CHIP_H / 2 + 0.5, cw - 1, SLACK_CHIP_H - 1);
      ctx.fillStyle = palette.labelInside;
      ctx.fillText(text, midX, midY + SLACK_CHIP_H / 2 - 3);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
  }

  // Layer 3.6: activity labels (ADR-0026 D1), drawn from `textLayout.names` (placed by
  // `row-text-layout.ts`, where the placement rules and their reasons now live). The context writes
  // stay here, in their order: the layer's font and alignment, then per activity a milestone's bold
  // font set before its name is measured and reset after, even where the name did not fit.
  if (textLayout.names) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // Where a wrapped name's first line may go: the lazy, counted segment index
    // (`layers/wrap-clearance.ts`, NetPoint grammar M4-T2 and the M6 gate pass).
    const lane0Top = screenYOfLane(0, view);
    const wrapClearance = createWrapClearance(
      () => routed?.lines.values() ?? [],
      (y) => Math.floor((y - lane0Top) / LANE_HEIGHT),
      SLACK_CHIP_H / 2,
    );
    const { steps, legacy, order } = textLayout.names;
    for (const entry of order) {
      if ('legacy' in entry) {
        const item = legacy[entry.legacy]!;
        if (item.kind === 'inside') {
          // A Colour-by lens repaints the bar a non-criticality hue, so the criticality-based ink can
          // fail contrast (e.g. white-on-warning-yellow at 2.02:1). `barInkColour` applies the paired,
          // contrast-safe override when the lens carries one (non-default modes only), else falls back
          // to today's criticality ink (absent map / Criticality mode ⇒ byte-for-byte parity, WCAG
          // 1.4.3) — the SAME chain the in-bar progress band draws with.
          ctx.fillStyle = barInkColour(byId.get(item.activityId)!, palette, scene.barInk);
        } else {
          ctx.fillStyle = palette.labelBeside;
        }
        ctx.fillText(item.text, item.x, item.y);
        noteText(item.x, item.width, item.y, item.align);
        continue;
      }
      const step = steps[entry.step]!;
      if (step.bold) ctx.font = MILESTONE_LABEL_FONT;
      let upper: PlacedText | null = null;
      let line: PlacedText | null = step.line;
      if (step.wrap) {
        const { wrap } = step;
        const lane = byId.get(step.activityId)!.laneIndex;
        if (wrapClearance.clear(lane, wrap.upper.x, wrap.upper.width, wrap.upper.y, WRAP_LINE_H)) {
          upper = wrap.upper;
          line = wrap.lower;
        } else {
          // No room above: the one truncated line, exactly as before the wrap existed.
          line = wrap.fallback;
        }
      }
      if (!line) {
        if (step.bold) ctx.font = LABEL_FONT;
        continue;
      }
      ctx.fillStyle = palette.labelBeside;
      ctx.textAlign = 'center';
      if (upper) {
        ctx.fillText(upper.text, upper.x, upper.y);
        noteText(upper.x, upper.width, upper.y, 'center');
      }
      ctx.fillText(line.text, line.x, line.y);
      noteText(line.x, line.width, line.y, 'center');
      ctx.textAlign = 'left';
      if (step.bold) ctx.font = LABEL_FONT;
    }
  }

  // Layer 3.7: start/finish DATES (ADR-0054 §3), drawn from `textLayout.dates`. On the reserved-row
  // path every bar with dates sets the fill even where the ladder withheld both, as it always has.
  if (textLayout.dates) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    for (const step of textLayout.dates.reserved) {
      ctx.fillStyle = palette.labelBeside;
      for (const item of step.items) {
        ctx.textAlign = item.align;
        ctx.fillText(item.text, item.x, item.y);
        noteText(item.x, item.width, item.y, item.align);
      }
      ctx.textAlign = 'left';
    }
    for (const { item, plate } of textLayout.dates.flank) {
      // With the float/drift tails also on, each date gets an opaque plate in the canvas ground
      // behind it, so the tail visibly passes behind the date (placement: `row-text-layout.ts`).
      if (plate) {
        ctx.fillStyle = palette.handleHalo; // the canvas ground, so the plate reads as "behind"
        ctx.fillRect(plate.x, item.y - DATE_PLATE_H / 2, plate.w, DATE_PLATE_H);
      }
      ctx.fillStyle = palette.labelBeside;
      ctx.textAlign = item.align;
      ctx.fillText(item.text, item.x, item.y);
      noteText(item.x, item.width, item.y, item.align);
    }
    ctx.textAlign = 'left';
  }

  // Layer 3.8: the CENTRE ITEM under each bar (NetPoint-layout M1, spec §4.6), drawn from
  // `textLayout.centre`. **Every context write is lazy**, as it was: the font only where a
  // measurement happened, the style only where an item is drawn.
  if (textLayout.centre) {
    if (textLayout.centre.measured) {
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'middle';
    }
    let styled = false;
    for (const item of textLayout.centre.items) {
      if (!styled) {
        ctx.fillStyle = palette.labelBeside;
        ctx.textAlign = 'center';
        styled = true;
      }
      ctx.fillText(item.text, item.x, item.y);
      noteText(item.x, item.width, item.y, 'center');
    }
    if (styled) ctx.textAlign = 'left';
  }

  // Layer 3.9: the LAG PLATES and then the GAP LABELS, collected by the link layer and placed here,
  // after every other row text, so each can move or be withheld where it would sit on text already
  // drawn (NetPoint grammar M3-T3; plates since node-to-node links M3).
  if (pendingPlates.length > 0) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;
    // A plate is drawn after the bars now, so it also keeps off every bar and its two nodes: before,
    // a bar painted over a plate that landed on it, and now the plate would paint over the bar.
    // The grazing rule and the glyph boxes are `plate-room.ts`'s, which the router's plate sub-term
    // reads too (links-and-labels M2, spec D-5).
    const glyphBoxes = plateGlyphBoxes(
      scene.activities,
      visibleIds,
      view,
      scene.dataDate,
      rectCache,
    );
    for (const { text, line, ink } of pendingPlates) {
      const w = linkFacts.plateWidth(text);
      const at = freePlatePosition(
        lagPlateCandidates(line, w, SLACK_CHIP_H),
        w,
        SLACK_CHIP_H,
        placedText,
        glyphBoxes,
        PLATE_GRAZE_PX,
      );
      if (!at) continue;
      // The border is the link's own ink (U2/X2): ≥ 3:1 on the ground, so the plate is a
      // perceivable box, and it says which link the figure belongs to.
      ctx.strokeStyle = ink;
      ctx.fillStyle = palette.canvasGround;
      ctx.fillRect(at.x - w / 2, at.y - SLACK_CHIP_H / 2, w, SLACK_CHIP_H);
      ctx.strokeRect(at.x - w / 2 + 0.5, at.y - SLACK_CHIP_H / 2 + 0.5, w - 1, SLACK_CHIP_H - 1);
      ctx.fillStyle = palette.labelBeside;
      ctx.fillText(text, at.x, at.y);
      placedText.push({ x: at.x - w / 2, y: at.y - SLACK_CHIP_H / 2, w, h: SLACK_CHIP_H });
    }
    ctx.textAlign = 'left';
    ctx.lineWidth = 1;
  }
  if (pendingGapLabels.length > 0) {
    // Borderless, on an opaque ground chip that knocks the line out beneath it, the text in the
    // mark ink (≥ 4.5:1 on the ground; the minor line ink is not, `m0-solved.md`). Placed on
    // the longest horizontal stretch of the route inside the waiting interval, and only where
    // that stretch holds the label plus 4 px (spec G6): a label that does not fit is withheld,
    // and the gap is still in the listbox.
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const { text, line, x0, x1 } of pendingGapLabels) {
      const w = labelWidths.measure(text, (t) => ctx.measureText(t).width) + LABEL_PAD_PX * 2;
      // The waiting interval runs node to node, and a node paints over the line for its reach
      // at each end, so the label is placed inside the interval less that reach: a gap label on
      // a disc is row text on a node (FC-G5), measured at 4 before this inset and 0 after.
      // The first free position along its own run inside the interval (links-and-labels M4
      // review): withheld only where every one would sit on text already placed, and the gap is
      // still in the listbox.
      let chip: Rect | null = null;
      let at: Point | null = null;
      for (const c of gapLabelCandidates(
        line,
        Math.min(x0, x1) + NODE_REACH_PX,
        Math.max(x0, x1) - NODE_REACH_PX,
        w + 4,
      )) {
        const box: Rect = { x: c.x - w / 2, y: c.y - SLACK_CHIP_H / 2, w, h: SLACK_CHIP_H };
        if (placedText.some((r) => rectsIntersect(r, box))) continue;
        chip = box;
        at = c;
        break;
      }
      if (!chip || !at) continue;
      placedText.push(chip);
      ctx.fillStyle = palette.canvasGround;
      ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
      ctx.fillStyle = palette.linkMark;
      ctx.fillText(text, at.x, at.y);
    }
    ctx.textAlign = 'left';
  }

  // Layer 4: the selection ring on the selected activity (if visible), plus — when editing
  // enables link-draw — a persistent edge-handle mark at each end of the selected bar. That mark
  // is the non-hover affordance advertising that the bar's ends are grabbable to draw a
  // dependency (UX_STANDARDS: hover-only affordances need a non-hover equivalent); selection is
  // keyboard-reachable via the listbox, so the cue isn't pointer-only either.
  // Layer 4a: the SECONDARY members of a plural selection (`docs/specs/canvas-multi-select/`
  // M2-T5). Drawn first and thinner, so the primary's heavier ring below paints over any shared
  // edge and stays the emphatic one.
  //
  // The distinction is deliberately **not colour**: the primary keeps the 2px ring AND the edge
  // handles, a secondary gets 1px and none — two channels, so "which one does Edit act on" is
  // legible without relying on hue (WCAG 1.4.1). Absent `selectedIds` ⇒ not one extra call ⇒
  // flag-off is byte-for-byte.
  if (scene.selectedIds) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.selection;
    for (const id of scene.selectedIds) {
      if (id === scene.selectedId || !visibleIds.has(id)) continue;
      const rect = rects.get(id);
      if (!rect) continue;
      const ring: Rect = { x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 };
      if (scene.visualRefresh && beginRoundedRect(ctx, ring, BAR_RADIUS + 2)) ctx.stroke();
      else ctx.strokeRect(ring.x, ring.y, ring.w, ring.h);
    }
  }

  if (scene.selectedId && visibleIds.has(scene.selectedId)) {
    const selected = byId.get(scene.selectedId);
    const rect = rects.get(scene.selectedId);
    if (selected && rect) {
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 2;
      // Under the refresh the ring rounds with the bar (radius tracks BAR_RADIUS at the ring's
      // 2px offset) so the two shapes read as one crisp outline; square fallback / flag-off is
      // byte-for-byte today's ring. Never colour-only: the ring is itself the shape cue, and
      // selection stays keyboard-reachable via the listbox.
      const ring: Rect = { x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 };
      if (scene.visualRefresh && beginRoundedRect(ctx, ring, BAR_RADIUS + 2)) ctx.stroke();
      else ctx.strokeRect(ring.x, ring.y, ring.w, ring.h);
      // With direct manipulation on (`timeTrueLinks` mirrors the ADR-0052 flag) the edge marks
      // advertise the *resize* handles, so a bar whose duration can't be resized (LOE / WBS
      // summary) draws none — matching classifyHit's refusal. Flag-off keeps today's link-draw
      // affordance byte-for-byte (milestones were already excluded).
      const marksSuppressed = scene.timeTrueLinks && !isResizeEligibleType(selected.type);
      if (scene.showEdgeHandles && selected && !isMilestone(selected.type) && !marksSuppressed) {
        const cy = rect.y + rect.h / 2;
        ctx.fillStyle = palette.selection;
        for (const cx of [rect.x, rect.x + rect.w]) {
          ctx.fillRect(
            cx - EDGE_HANDLE_MARK,
            cy - EDGE_HANDLE_MARK,
            EDGE_HANDLE_MARK * 2,
            EDGE_HANDLE_MARK * 2,
          );
        }
      }
    }
  }

  return [...visibleIds];
}

/**
 * A dependency rubber-band in flight: a straight line from the source bar's grabbed edge
 * (`from`) to the live pointer (`to`), plus the drop target's rect when the pointer is over a
 * valid successor (drawn as a highlight so the drop is discoverable — ADR-0026 D5).
 */
export interface LinkOverlay {
  from: Point;
  to: Point;
  targetRect: Rect | null;
  /** Whether the hovered target is a legal drop (no self/duplicate/cycle, ADR-0026 D5). An illegal
   * target rings in the critical colour with a dashed "can't drop" outline. Defaults to legal. */
  targetLegal?: boolean;
}

/** A duration resize in flight (ADR-0052 M2): the tentative bar plus its live duration label. */
export interface ResizeOverlay {
  /** The tentative bar span under the pointer (start fixed, finish tracking). */
  rect: Rect;
  /** The live duration readout (e.g. `7d`), drawn just above the ghost. */
  label: string;
}

/** A lag-anchor drag in flight (ADR-0052 M3): the tentative-lag readout chip. */
export interface LagOverlay {
  /** The tentative anchor's screen point (chip drawn just above it). */
  x: number;
  y: number;
  /** The live lag readout, e.g. `SS + 3d` / `FS - 1d` (negative = lead). */
  label: string;
}

/**
 * Full-fidelity detail for the in-flight ghost (ADR-0054 §1, `VITE_CANVAS_LIVE_FEEDBACK`). The
 * ADR-0052 ghost was a deliberately bare fill+outline, which was right while it sat beside a
 * fully-painted source bar; now the source recedes, the ghost IS the bar and must look like it.
 * Absent ⇒ the ADR-0052 ghost, byte-for-byte.
 */
export interface GhostDetail {
  /** The bar's own label (`{code} {name} · {n}d`), drawn inside when the ghost is wide enough. */
  label: string;
  /** Schedule % complete, drawn as the same in-bar progress band the real bar carries. */
  percentComplete?: number;
  /** Draw the milestone diamond rather than a rounded bar, matching the real glyph. */
  milestone?: boolean;
}

/** Chip height (px) of the lag readout drawn above the dragged anchor. */
const LAG_CHIP_H = 14;
/** Gap (px) between the dragged anchor point and its readout chip. */
const LAG_CHIP_GAP = 6;

/** The transient shapes drawn on the interaction layer for an in-progress edit. */
export interface InteractionOverlay {
  /** The bar being drawn/moved (solid fill + outline). */
  live?: Rect | null;
  /** A dropped edit awaiting the authoritative recalc (dashed "saving" outline). */
  pending?: Rect | null;
  /** A dependency being drawn (rubber-band + target highlight). */
  link?: LinkOverlay | null;
  /** The picked predecessor while the two-click link tool waits for its second click (M5): a solid
   * highlight ring so "now click the successor" reads. */
  linkPick?: Rect | null;
  /** A bar-end duration resize in flight (ADR-0052 M2/M3): ghost + live readout label. */
  resize?: ResizeOverlay | null;
  /** A lag-anchor drag in flight (ADR-0052 M3): the tentative-lag readout chip. */
  lag?: LagOverlay | null;
  // ── Bar visual refresh (ADR-0052 M4, the SAME `VITE_CANVAS_DIRECT_MANIPULATION`) ──────────
  /** Restyle the live/resize ghosts (rounded, elevation-by-inner-inset-stroke — never
   * shadow/blur) and enable the hover ring. Absent/false ⇒ byte-for-byte the legacy overlay. */
  visualRefresh?: boolean;
  /** The idle-hovered bar's rect (published by the canvas while the resize/lag zones are armed):
   * a light `hoverRing` outline around the bar, visually quieter than the selection ring and
   * cleared when the pointer leaves. A transient pointer affordance twinned with the cursor
   * change (never the sole carrier of state — selection remains the keyboard/AT state), drawn
   * OUTSIDE the bar so it obscures no label or badge. Only read under `visualRefresh`. */
  hover?: Rect | null;
  // ── Live feedback (ADR-0054 §1–§2, `VITE_CANVAS_LIVE_FEEDBACK`) ──────────────────────────
  /** Full-fidelity detail for the in-flight `live`/`resize` ghost, so a drag reads as the bar
   * itself moving. Absent ⇒ the ADR-0052 ghost, byte-for-byte. */
  ghost?: GhostDetail | null;
  /** The cursor date readout (ADR-0054 §2): a full-height guideline at the day being chosen plus
   * a chip stating its date. Computed by the pure `cursorReadout`, so the number shown is the one
   * the gesture will commit. Absent ⇒ nothing drawn. */
  cursor?: CursorChip | null;
  // ── Multi-select (`docs/specs/canvas-multi-select/` M2-T5, `VITE_CANVAS_MULTI_SELECT`) ─────
  /**
   * The live marquee sweep rectangle, in screen space.
   *
   * On the **interaction** layer, not the base one, for the same reason every other in-flight
   * shape is: a marquee repaints on every pointer move, and the base layer carries the whole
   * scene. Absent ⇒ not one call ⇒ byte-for-byte parity with the flag off.
   */
  marquee?: Rect | null;
  /**
   * The OTHER selected bars' destinations during a plural drag (`docs/TECH_DEBT.md` #108's
   * preview half): one outline ghost per peer, each the peer's own rect shifted by the grabbed
   * bar's live day/lane delta — the SAME delta the release writes through `bulkMoveSnapshots`,
   * so the preview and the write cannot disagree about where a bar lands.
   *
   * Outline-plus-faint-fill deliberately, never the full-fidelity treatment: the grabbed bar
   * carries the labelled ghost, and N labelled ghosts would multiply the frame's text cost for
   * detail the planner already has — the peers' source bars stay lit until release. Absent ⇒
   * not one call ⇒ parity, which is the whole draw-budget argument (ADR-0026 §9): the field is
   * only ever populated while a plural drag is in flight.
   */
  peers?: readonly Rect[] | null;
}

/** The cursor date readout's screen shape (ADR-0054 §2) — see `render/cursor-readout.ts`. */
export interface CursorChip {
  /** Screen x of the guideline: the day boundary, not the raw pointer. */
  x: number;
  /** The date sentence, e.g. `Fri 2 Jan` or `2 Jan – 6 Jan · 5d`. */
  label: string;
}

/*
 * `TODAY_CHIP_H`, `TODAY_CHIP_TOP` and `DATA_DATE_CHIP_TOP` were here, and #148 deleted them with
 * the pills they positioned. The shape of what they got wrong is worth keeping, because it is not
 * carelessness and a reader who assumes it was will repeat it.
 *
 * Each was **derived** rather than written as a literal — `TODAY_CHIP_TOP` from the cursor chip's
 * own footprint, `DATA_DATE_CHIP_TOP` from Today's — and each carried a docblock explaining that a
 * literal would let a future edit "silently reintroduce the collision". `paint.test.ts` asserted
 * both derivations. All of that was correct, careful, and about the wrong subject: **both guards
 * asked whether the pills collided with EACH OTHER. Nothing ever asked what was underneath them**,
 * and a bar occupies y 5–23 of a lane that starts wherever the planner last panned to.
 *
 * The two replacement guards therefore look outward rather than inward: a unit case pinning each
 * marker row wholly inside `RULER_HEIGHT`, and a browser case asserting that no marker's rect
 * intersects the scene canvas's at all. The second is the one that could not have been written
 * here, because it is a question about two elements rather than about two constants.
 */

/**
 * Paint the interaction (top) canvas layer for an in-progress edit (ADR-0026 D1/D4, M2):
 * the **live** ghost (the bar being drawn/moved), a **pending** ghost (a dropped edit awaiting
 * the authoritative recalc, dashed), and/or a **link** rubber-band (dependency-draw, 2.3). All
 * are plain screen shapes the caller computed from the gesture; this layer never touches the
 * base layer, so a gesture repaints only this cheap surface. An empty overlay clears it.
 */
export function paintInteractionLayer(
  ctx: Ctx2D,
  overlay: InteractionOverlay,
  size: Size,
  palette: TsldPalette,
  dpr = 1,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const { live, pending, link, linkPick, resize, lag } = overlay;
  const refresh = overlay.visualRefresh === true;

  // The marquee sweep (M2-T5). Drawn before every other overlay shape so a ghost or chip that
  // happens to sit inside it still reads on top — the marquee is a region, not an object.
  // A translucent fill plus a dashed outline: the fill says "these bars", the outline says "and
  // this is exactly where the edge is", which matters at the boundary where a bar is half in.
  if (overlay.marquee) {
    const { x, y, w, h } = overlay.marquee;
    // `Ctx2D` is the narrow subset this painter is typed against (so a counting stub can implement
    // it) and has no save/restore — alpha is set and put back by hand, as everywhere else here.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = palette.selection;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    ctx.setLineDash([]);
  }

  // The cursor date readout's GUIDELINE (ADR-0054 §2), drawn FIRST so every ghost and ring paints
  // over it — it is a reference line, not a foreground object. A full-height dashed rule marks the
  // day boundary being chosen. Absent ⇒ not one call ⇒ parity.
  //
  // **The chip that used to sit above it is DOM in the ruler now** (#148 M3), on the transient
  // marker row above the persistent `Data date` / `Today` row. The rule stays on the canvas for the
  // same reason the other two rules did: a full-height vertical IS a scene mark, meaning something
  // at every lane, while a date label is chrome and was only ever painted here by accident of
  // history. `overlay.cursor.label` is still carried — the DOM layer reads it — and this function
  // no longer touches it, which is why the interaction layer now emits no text at all.
  if (overlay.cursor) {
    const { x } = overlay.cursor;
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (refresh && overlay.hover) {
    // The idle-hover ring (M4): a light rounded outline in the hover hue, drawn FIRST so every
    // in-flight ghost/ring paints over it. Thinner + quieter than the selection ring (2px
    // selection colour), so hover and selection never read as the same state.
    const h = overlay.hover;
    ctx.strokeStyle = palette.hoverRing;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    const ring: Rect = { x: h.x - 1.5, y: h.y - 1.5, w: h.w + 3, h: h.h + 3 };
    if (beginRoundedRect(ctx, ring, BAR_RADIUS + 1.5)) ctx.stroke();
    else ctx.strokeRect(ring.x, ring.y, ring.w, ring.h);
  }

  if (linkPick) {
    // The picked predecessor waiting for the second click (M5): a **dashed** selection-colour ring —
    // dash (not just colour) sets it apart from the plain solid selection ring, since the picked
    // predecessor and the current selection are independent and can ring different bars at once
    // (a11y review). Drawn first (below any ghost).
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(linkPick.x - 2, linkPick.y - 2, linkPick.w + 4, linkPick.h + 4);
    ctx.setLineDash([]);
  }

  if (pending) {
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(pending.x + 0.5, pending.y + 0.5, pending.w - 1, pending.h - 1);
    ctx.setLineDash([]);
  }

  if (link) {
    // Ring the drop target first, so the line draws over it. A legal target rings solid in the
    // selection colour; an illegal one (self/duplicate/cycle) rings dashed in the critical colour
    // so it reads as "can't drop here" before release — colour AND dash, not colour alone (D5).
    if (link.targetRect) {
      const t = link.targetRect;
      const illegal = link.targetLegal === false;
      ctx.strokeStyle = illegal ? palette.critical : palette.selection;
      ctx.lineWidth = 2;
      ctx.setLineDash(illegal ? [3, 3] : []);
      ctx.strokeRect(t.x - 2, t.y - 2, t.w + 4, t.h + 4);
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(link.from.x, link.from.y);
    ctx.lineTo(link.to.x, link.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The shared refreshed drag-ghost treatment (M4): a rounded fill with the selection outline
  // plus an inner inset hairline in the bar-definition stroke — "elevation" approximated by the
  // double stroke, never a shadow/blur (draw budget). Square fallback where roundRect is absent;
  // flag-off callers never reach it. Reads as "the bar, lifted", obscuring no label or badge.
  const detail = overlay.ghost;

  /**
   * The ghost's own bar detail (ADR-0054 §1): the milestone diamond where the type calls for it,
   * the in-bar progress band, and the inside label — the same three things that make the real bar
   * recognisable. Drawn only when the caller supplies `overlay.ghost`, so the flag-off path paints
   * the ADR-0052 ghost byte-for-byte. Text is guarded like every other label pass so a text-less
   * test context never throws.
   */
  const ghostDetail = (r: Rect): void => {
    if (!detail) return;
    if (detail.percentComplete !== undefined && !detail.milestone) {
      const progress = progressGeometry(r, detail.percentComplete);
      if (progress) {
        ctx.fillStyle = palette.labelInside;
        const { band, front } = progress;
        ctx.fillRect(band.x, band.y, band.w, band.h);
        if (front) ctx.fillRect(front.x, front.y, front.w, front.h);
      }
    }
    if (detail.milestone) return; // a diamond has no room for an inside label
    if (typeof ctx.fillText !== 'function' || typeof ctx.measureText !== 'function') return;
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const pad = LABEL_PAD_PX + 2;
    const text = truncateToWidth(detail.label, r.w - pad * 2, (s) => ctx.measureText(s).width);
    if (!text) return;
    ctx.fillStyle = palette.labelInside;
    ctx.fillText(text, r.x + pad, r.y + r.h / 2);
  };

  const refreshedGhost = (r: Rect): void => {
    ctx.fillStyle = palette.bar;
    // A milestone ghosts as the triangle it really is, so a dragged milestone never momentarily
    // becomes a bar (ADR-0054 §1). The outline below then traces the same path.
    if (detail?.milestone) {
      traceMilestoneTriangle(ctx, r.x + r.w / 2, r.y + r.h / 2, MILESTONE_RADIUS, true);
      ctx.fill();
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();
      return;
    }
    if (beginRoundedRect(ctx, r, BAR_RADIUS)) ctx.fill();
    else ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    const outer: Rect = { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 };
    if (beginRoundedRect(ctx, outer, BAR_RADIUS)) ctx.stroke();
    else ctx.strokeRect(outer.x, outer.y, outer.w, outer.h);
    ctx.strokeStyle = palette.barStroke;
    ctx.lineWidth = 1;
    const inner: Rect = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
    if (beginRoundedRect(ctx, inner, Math.max(1, BAR_RADIUS - 2))) ctx.stroke();
    else ctx.strokeRect(inner.x, inner.y, inner.w, inner.h);
  };

  // Peer ghosts (#108) — drawn BEFORE the live ghost so the grabbed bar reads on top. A faint
  // fill plus the solid selection outline: fainter siblings of the live ghost, never dashed —
  // dashed is `pending`'s "saving" vocabulary and a peer is not saving, it is previewing.
  if (overlay.peers) {
    for (const r of overlay.peers) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = palette.bar;
      if (beginRoundedRect(ctx, r, BAR_RADIUS)) ctx.fill();
      else ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const outer = { x: r.x + 0.5, y: r.y + 0.5, w: r.w - 1, h: r.h - 1 };
      if (beginRoundedRect(ctx, outer, BAR_RADIUS)) ctx.stroke();
      else ctx.strokeRect(outer.x, outer.y, outer.w, outer.h);
    }
  }

  if (live) {
    if (refresh) {
      refreshedGhost(live);
      ghostDetail(live);
    } else {
      ctx.fillStyle = palette.bar;
      ctx.fillRect(live.x, live.y, live.w, live.h);
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(live.x + 0.5, live.y + 0.5, live.w - 1, live.h - 1);
    }
  }

  if (resize) {
    // The resize ghost mirrors the reposition/create `live` ghost (fill + solid outline; the
    // refreshed treatment under M4) so the two in-flight edits read the same, plus a live
    // duration readout just above the bar — the number a planner is actually choosing (ADR-0052
    // M2). Guarded like `paintResourceStrip`'s label so a text-less test context never throws.
    const r = resize.rect;
    if (refresh) {
      refreshedGhost(r);
      ghostDetail(r);
    } else {
      ctx.fillStyle = palette.bar;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    if (typeof ctx.fillText === 'function') {
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.labelBeside;
      ctx.fillText(resize.label, r.x + LABEL_PAD_PX, r.y - 2);
    }
  }

  if (lag) {
    // The lag-drag readout chip (ADR-0052 M3): the tentative "SS + 3d" the planner is choosing,
    // drawn just above the dragged anchor point on a filled, outlined chip so it stays legible
    // over bars and links. Guarded like the resize label so a text-less test context never throws
    // (`measureText` sizes the chip to its text).
    if (typeof ctx.fillText === 'function' && typeof ctx.measureText === 'function') {
      ctx.font = LABEL_FONT;
      const w = ctx.measureText(lag.label).width + LABEL_PAD_PX * 2;
      const x = lag.x - w / 2;
      const y = lag.y - BAR_HEIGHT / 2 - LAG_CHIP_GAP - LAG_CHIP_H;
      ctx.fillStyle = palette.bar;
      ctx.fillRect(x, y, w, LAG_CHIP_H);
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, LAG_CHIP_H - 1);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = palette.labelInside;
      ctx.fillText(lag.label, x + LABEL_PAD_PX, y + LAG_CHIP_H / 2);
    }
  }
}

/**
 * The resource-strip layer's palette (Stage E, ADR-0049) — resolved concrete colours (Canvas 2D
 * `fillStyle` can't take a `var()`), re-resolved on the shared theme bump by `TsldCanvas` like the main
 * painter. `bar` is the demand-bar fill, `axis` the thin baseline/top rule, `tick` the max-tick label ink.
 */
export interface ResourceStripPalette {
  /**
   * The single-band fill, kept deliberately. The isolated path publishes a one-segment stack and
   * paints it with this, so isolating a resource draws exactly what it drew before the strip
   * learned to stack — the promise the spec makes about that path, honoured rather than restated.
   */
  bar: string;
  axis: string;
  tick: string;
  /**
   * The band's ground — what a segment boundary is drawn in. Not decoration: every categorical fill
   * is gated at >= 3:1 against it, which is what makes a ground-coloured hairline legible against
   * both neighbours whatever they are.
   */
  ground: string;
}

/** Format a demand value (`DECIMAL(18,4)` units) for the max-tick label — ≤ 4 dp, trailing zeros dropped. */
function formatStripUnits(value: number): string {
  return Number(value.toFixed(4)).toString();
}

/**
 * `import.meta.env.DEV`, read defensively.
 *
 * Vite replaces it statically in the app, but the measurement harnesses bundle this module with
 * esbuild in IIFE format, where `import.meta` is an empty object — so reading `.DEV` off it throws
 * before the painter draws anything. A guard that takes down the instrument measuring the code it
 * guards is worse than no guard, and this one did, on its first run.
 */
const IS_DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/**
 * Paint the **resource strip** (Stage E, ADR-0049) — the third Canvas 2D layer, on its own
 * `aria-hidden` sibling `<canvas>` band at the bottom of the `TsldCanvas` container. It draws the
 * selected resource's per-bucket demand bars from the {@link ResourceStripSnapshot} the DOM host
 * published, using the SAME `viewRef` (via {@link bucketBarsFromDays}) as the scene and ruler, so the
 * bars sit under the diagram's day/week/month columns and pan/zoom with the canvas with zero desync.
 * `band.width`/`band.height` are the strip canvas's CSS-px size; the backing store is `× dpr`. A `null`
 * snapshot (or an empty series / non-positive max) draws just the axis rule — the DOM band then shows
 * the empty/loading state. The painter uses only rectangles + an optional label, staying within the
 * ADR-0026 draw budget (O(visible buckets)).
 */
export function paintResourceStrip(
  ctx: Ctx2D,
  snapshot: ResourceStripSnapshot | null,
  view: Viewport,
  band: Size,
  palette: ResourceStripPalette,
  dpr = 1,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, band.width, band.height);

  // A thin top rule (the strip's "zero" reference / separation from the diagram), never colour-only —
  // it is a structural divider, not an encoded value.
  ctx.fillStyle = palette.axis;
  ctx.fillRect(0, 0, band.width, 1);

  if (!snapshot || snapshot.max <= 0 || snapshot.segments.length === 0) return;

  // **Fail loud in development on an unresolved fill.** `fillStyle` discards a `var()` and keeps
  // the previous colour, so the whole stack paints as one block with nothing thrown, nothing
  // logged, and a jsdom test asserting the `fill` string passing on the exact value a browser
  // refuses. That defect reached this painter once; this is what turns the next one into a
  // failing test rather than a screenshot somebody has to notice.
  if (IS_DEV) {
    const unresolved = snapshot.segments.find((seg) => seg.fill.startsWith('var('));
    if (unresolved) {
      throw new Error(
        `paintResourceStrip: segment fill "${unresolved.fill}" is a CSS variable. Canvas 2D ` +
          'cannot paint one — resolve the ramp with categoricalCycleResolved() before publishing ' +
          'the snapshot.',
      );
    }
  }

  // **x, w and the cull come from ONE projector, called once on the bucket totals.** Every segment
  // in a bucket shares them by definition, so delegating rather than projecting per segment makes
  // co-alignment definitional — a sibling projector would be a second copy of the same affine, and
  // the symptom of a drift would be a band landing under a different day column from the bar it
  // belongs to (the ADR-0065 `routeOrthogonal` argument, one module in).
  // **The totals are the producer's, not re-summed here.** `stackSeries` sums them once in draw
  // order precisely because summing the same values another way can differ in the last bits under
  // IEEE addition; re-deriving them in the painter was a second implementation of the computation
  // that rule exists to forbid, agreeing only by the accident that segment order survives the trip.
  const bars = bucketBarsFromDays(snapshot.bucketTotals, snapshot.dayOffsets, view, band, {
    height: band.height,
    max: snapshot.max,
  });

  const barArea = Math.max(0, band.height - STRIP_BAR_TOP_PAD);
  for (const bar of bars) {
    // Bars grow up from the band's baseline; the top pad keeps a full-height bar clear of the
    // rule/tick. Segments stack from the baseline in draw order.
    let offset = 0;
    for (const seg of snapshot.segments) {
      const value = seg.values[bar.index] ?? 0;
      if (value <= 0) continue;
      const h = (value / snapshot.max) * barArea;
      ctx.fillStyle = seg.fill;
      ctx.fillRect(bar.x, band.height - offset - h, bar.w, h);
      offset += h;
    }

    // **The boundaries, drawn in the GROUND colour — the mechanism, not a workaround.** Every fill
    // is gated at >= 3:1 against this ground, so a ground-coloured hairline is guaranteed >= 3:1
    // against both of its neighbours however close two fills are to each other. That is what makes
    // adjacent-fill contrast a non-question (WCAG 1.4.11 applies to the boundary, not the pair).
    //
    // **Skipped where either neighbour is thinner than the rule is tall.** At 66 px of bar area,
    // nine segments means eight boundaries: 12 % of the column at the peak bucket, 24 % at half
    // and 48 % at a quarter — and off-peak buckets are the majority of any real profile. A
    // separator that eats half the column has stopped separating anything.
    offset = 0;
    let previousH = 0;
    for (const seg of snapshot.segments) {
      const value = seg.values[bar.index] ?? 0;
      if (value <= 0) continue;
      const h = (value / snapshot.max) * barArea;
      if (previousH >= SEGMENT_RULE_MIN_PX && h >= SEGMENT_RULE_MIN_PX && offset > 0) {
        ctx.fillStyle = palette.ground;
        ctx.fillRect(bar.x, band.height - offset - 1, bar.w, 1);
      }
      offset += h;
      previousH = h;
    }
  }

  // A single labelled max tick at the top-left (ADR-0026 D1 style), so the vertical scale is legible;
  // exact per-bucket values live in the parallel table. Guarded so the no-op test 2D context (which
  // omits text APIs) never throws — it runs only against a real context.
  if (typeof ctx.fillText === 'function') {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = palette.tick;
    ctx.fillText(formatStripUnits(snapshot.max), LABEL_PAD_PX, 2);
  }
}

/**
 * The WBS band layer's palette (ADR-0063) — resolved concrete colours, re-resolved on the shared
 * theme bump exactly as the scene's and the strip's are. `bar` is a real summary's fill, `derived`
 * the Unassigned bucket's (visibly different, because one is a thing in the plan and the other is
 * an observation about it), `rule` the separating hairline, `label` the ink, `selection` the
 * selected summary's outline.
 */
export interface WbsBandPalette {
  bar: string;
  /** The derived bucket's **bracket stroke** — not a fill; see `paintWbsBand` and #71. */
  derived: string;
  rule: string;
  /** Ink for a real summary's name, painted on `bar`. */
  label: string;
  /**
   * Ink for the derived "Unassigned" bucket's name, painted on the canvas **ground**.
   *
   * **It was painted on `derived` until that stopped being a fill** (`docs/TECH_DEBT.md` #71). The
   * history below is kept because the measurement is the useful part, and because the token it
   * used to hold — `--background`, i.e. the ground itself inside the canvas scope — would have
   * rendered the name invisible the moment the fill went. The bracket and this ink are one change.
   *
   * **A separate field because the two names sit on different things, and one ink cannot serve
   * both.** The
   * band paints its name on whichever fill applies, and reused `label` for both until an
   * accessibility gate measured it: `label` pairs with `bar` at 4.86:1 and landed on `derived` at
   * **3.01:1**, a live 1.4.3 failure on any plan with an ungrouped activity — which is most of
   * them — and in the exported and printed diagram too.
   *
   * It was masked before ADR-0102 by the very bug that ADR fixes: the resolver read the frozen
   * `--color-*` aliases, so the band painted the PAGE's primary/muted/primary-foreground triple,
   * which happened to be internally coherent at 8.15:1. Making the resolver read the canvas scope
   * for the first time exposed a pairing nobody had ever checked, because the criticality ladder
   * had inverted `--plot-primary-foreground` to dark for its own fill and this second, unrelated
   * consumer went with it.
   */
  derivedLabel: string;
  /**
   * The selected summary's ring.
   *
   * **Painted INSET, on the bar's own fill** (unlike the scene's ring, which is offset 2px outward
   * onto the ground and therefore never touches a fill). So it needs contrast against `bar`, not
   * against the canvas — which is why it is the diagram's ink rather than `--ring`: `--plot-ring`
   * measures **1.68:1** on the summary fill against 1.4.11's 3:1, while `--foreground` measures
   * 3.55:1 on the fill and 11.19:1 on the ground. Same principle as `outline`, which is a stroke
   * on a bar for the same reason.
   */
  selection: string;
}

/**
 * Paint the **WBS band** (ADR-0063) — the fourth Canvas 2D layer, on its own top-pinned canvas
 * above the scene. Placement comes entirely from `wbsBandBars`, which shares the scene's
 * `screenXOfDay`/`daysBetween`, so the band's columns cannot drift from the diagram's.
 *
 * O(rendered bars + 1) per frame — typically under 50 against the scene's 2,000. The label is
 * guarded on `fillText`/`measureText` like the strip's, so the minimal test context never throws.
 *
 * `offsetY` exists for the **image export** (ADR-0063 §M5), which has no separate band canvas: the
 * band is drawn into the same surface as the diagram, below the title strip. It rides in the
 * transform rather than being added to each bar's `y`, so the band's own geometry stays
 * band-local — the coordinate space the hit-test and the live canvas both use. Defaulting it to 0
 * leaves the live path byte-identical.
 */
export function paintWbsBand(
  ctx: Ctx2D,
  bars: readonly WbsBandBar[],
  selectedId: string | null,
  band: Size,
  palette: WbsBandPalette,
  dpr = 1,
  offsetY = 0,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, offsetY * dpr);
  ctx.clearRect(0, 0, band.width, band.height);

  // A hairline at the band's foot separates it from the scene — a structural divider, so it is
  // drawn whether or not there are bars, and never carries meaning by colour alone.
  ctx.fillStyle = palette.rule;
  ctx.fillRect(0, band.height - 1, band.width, 1);

  const measure =
    typeof ctx.measureText === 'function' ? (t: string) => ctx.measureText(t).width : null;
  if (measure !== null) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
  }

  for (const bar of bars) {
    if (bar.id === null) {
      /**
       * **The derived bucket is an open bracket, not a bar** (`docs/TECH_DEBT.md` #71,
       * `docs/specs/wbs-bucket-bracket/`).
       *
       * One of these two objects is a grouping the planner made; the other is the app observing
       * that some work has no grouping at all. They used to be the same rounded rectangle in two
       * fills — so at any width where the label is dropped below, colour was the only thing left
       * telling them apart (WCAG 1.4.1). The Gantt had already decided this and says why in its
       * own words: "the bucket is not a scheduled thing, it is the extent of things that are."
       *
       * **The rejected remedy was a dashed outline over the fill, and it was rejected by looking.**
       * The accessibility review reasoned that a dash "stays visually distinct at any bar width
       * above a couple of px". Mocked up on a real canvas with colour withdrawn — which is the
       * actual 1.4.1 test — a 1px dash sitting ON a fill of similar tone reads as a slightly
       * textured block rather than a different kind of object, because `--muted-foreground` and
       * `--foreground` are both mid-greys once hue is gone. The product owner could not see it.
       * Dash was also already carrying four meanings on this canvas (near-critical, Today, the
       * cursor guideline, lag runs, float tails), and this would have been a fifth.
       *
       * Three sides with the foot left OPEN is the whole distinction from a rectangle: the first
       * and last points sit at `y + h` and nothing runs between them at that y. Half-pixel offsets
       * put the 1px stroke on a pixel rather than across two. Square corners, deliberately — a
       * bracket is not a bar with its middle removed.
       *
       * **`setLineDash([])` is explicit and is not defensive tidiness.** The image export runs
       * `paintScene` and then this painter through ONE shared context, so a dash left set by an
       * earlier layer would be inherited here. Every dash site over there happens to reset today,
       * which is a property nothing asserts, across a function boundary, on the one path where
       * nobody is watching a screen.
       *
       * **Accepted and reported rather than special-cased:** below about 4px the two verticals are
       * close enough to read as one mark. The `CRITICAL_FRINGE_MIN_H` precedent — state the limit,
       * do not add a second glyph for it.
       */
      ctx.strokeStyle = palette.derived;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(bar.x + 0.5, bar.y + bar.h);
      ctx.lineTo(bar.x + 0.5, bar.y + 0.5);
      ctx.lineTo(bar.x + bar.w - 0.5, bar.y + 0.5);
      ctx.lineTo(bar.x + bar.w - 0.5, bar.y + bar.h);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.bar;
      if (beginRoundedRect(ctx, { x: bar.x, y: bar.y, w: bar.w, h: bar.h }, 3)) ctx.fill();
      else ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    }

    if (bar.id !== null && bar.id === selectedId) {
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(bar.x + 0.5, bar.y + 0.5, bar.w - 1, bar.h - 1);
    }

    // Labels are the band's whole point — a bar with no name says only "something happens here" —
    // but a label wider than its bar would run into the next one, so it is truncated to fit and
    // dropped entirely when there is no room for even an ellipsis.
    if (measure === null || typeof ctx.fillText !== 'function') continue;
    const maxPx = bar.w - LABEL_PAD_PX * 2;
    if (maxPx <= 0) continue;
    const text = truncateToWidth(bar.label, maxPx, measure);
    if (text.length === 0) continue;
    // A real summary's ink follows its FILL, the way every inside label in this painter does; the
    // bucket's now follows the GROUND, because it no longer has a fill to sit on. Using one ink for
    // both is what put the derived bucket's name at 3.01:1.
    ctx.fillStyle = bar.id === null ? palette.derivedLabel : palette.label;
    ctx.fillText(text, bar.x + LABEL_PAD_PX, bar.y + bar.h / 2);
  }
}
