import type { GhostBar } from './lenses';
import { createMeasureCache } from './measure';
import {
  activityRect,
  arrowhead,
  barGlyphKind,
  computeEdgeFanOut,
  cull,
  daysBetween,
  dependencyPolyline,
  dependencyPolylineTimeTrue,
  edgeTouches,
  elbowRadius,
  isMilestone,
  isResizeEligibleType,
  labelPlacement,
  lagAnchorPoints,
  lagRunSegment,
  linkHighlightIds,
  loeBracketRects,
  makeWorkingDayWalk,
  progressGeometry,
  rectsIntersect,
  routeOrthogonal,
  screenXOfDay,
  screenYOfLane,
  summaryTabRects,
  truncateToWidth,
  BAR_HEIGHT,
  BAR_RADIUS,
  ELAPSED_DAY_WALK,
  EMPHASIS_STROKE_W,
  LABEL_FONT,
  LABEL_GAP_PX,
  DATE_LABEL_MIN_PX_PER_DAY,
  dateLabelSlot,
  driftTailRect,
  floatTailRect,
  formatCanvasDate,
  LABEL_MIN_PX_PER_DAY,
  LABEL_PAD_PX,
  LANE_HEIGHT,
  MILESTONE_RADIUS,
  PROGRESS_MIN_PX_PER_DAY,
  type FanOutOffsets,
  type LagRun,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from './render-model';
import { bucketBarsFromDays, type ResourceStripSnapshot } from './resource-strip';
import { calendarBoundaries } from './time-scale';

/**
 * Session-lived width memo for label text (font is fixed, so keyed by string alone). Held at
 * module scope so it persists across frames and canvas instances — a given label measures once.
 */
const labelWidths = createMeasureCache();

/**
 * Fan-out offsets memoised on the edges ARRAY identity (ADR-0052 M5 perf). `scene.edges` is
 * reference-stable across pan/zoom frames (the scene is only rebuilt on a data / selection /
 * hover-id change, and those rebuilds reuse the same edges array), so recomputing the pure
 * `computeEdgeFanOut` per frame is pure waste — measured 5–11 ms alone at 2,000 activities /
 * 4,000 edges, busting the ADR-0026 ≤4 ms draw budget on its own. A WeakMap keyed by the array
 * lets a replaced edge list recompute once and lets the old entry be GC'd with its array.
 */
const edgeFanOuts = new WeakMap<readonly RenderEdge[], ReadonlyMap<RenderEdge, FanOutOffsets>>();

/**
 * The memoised {@link computeEdgeFanOut} the painter reads: the SAME array instance returns the
 * SAME (identical) offsets map; a new array instance recomputes. Exported so the memo identity
 * is unit-testable — the painter is its only production caller.
 */
export function edgeFanOutFor(
  edges: readonly RenderEdge[],
): ReadonlyMap<RenderEdge, FanOutOffsets> {
  let offsets = edgeFanOuts.get(edges);
  if (!offsets) {
    offsets = computeEdgeFanOut(edges);
    edgeFanOuts.set(edges, offsets);
  }
  return offsets;
}

/** Below this px-per-day the per-day gridlines would merge into a solid block, so they're culled. */
const DAY_GRID_MIN_PX = 6;
/** Below this px-per-day non-working columns are sub-pixel; the wash is culled (and would be costly). */
const NON_WORKING_MIN_PX = 3;

/**
 * The palette the painter draws with — resolved from the app's semantic design tokens
 * (ADR-0006) so the canvas is theme-aware without hardcoding colour. All values are CSS
 * colour strings.
 */
export interface TsldPalette {
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
  /** The TODAY marker line + label (shares the critical/destructive hue, dashed to distinguish). */
  today: string;
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
  // The refresh introduces NO other colour: the in-bar progress band + front divider draw in the
  // bar's own paired label ink (`labelInside*` / the lens `barInk` override), so their contrast is
  // guaranteed by the same 1:1 fill↔ink pairing labels rely on in both themes and under every
  // lens; the LOE bracket caps + WBS-summary tabs draw in the bar's own resolved fill, so the
  // Colour-by lenses recolour the whole glyph as one shape (the lens owns colour, M4 owns shape).
}

/** Which optional canvas layers are drawn — the toolbar's view toggles, defaulting all on. */
export interface TsldViewToggles {
  dayGrid: boolean;
  monthGrid: boolean;
  yearGrid: boolean;
  today: boolean;
  nonWorking: boolean;
  /** On-canvas activity labels (`{code} {name} · {n}d`). */
  labels: boolean;
  /** Flanking start/finish **dates** on each bar (ADR-0054 §3, `VITE_CANVAS_LIVE_FEEDBACK`).
   * Optional so every existing caller/fixture stays valid and paints byte-for-byte; absent or
   * false ⇒ the pass never runs and not one `measureText` is spent. */
  dates?: boolean;
  /** The GPM **float / drift tails** (ADR-0054 §4, `VITE_CANVAS_LIVE_FEEDBACK`): a hollow tail
   * right of each bar for total float, left for drift.
   *
   * A view TOGGLE rather than a lens (a deliberate departure from the plan's "beside Baseline
   * overlay"): a lens exists because it needs data that can be loading or absent — Baseline
   * overlay is disabled with a reason when there is no active baseline. Float and drift are
   * already on every activity, so the control can never be unavailable and needs none of the
   * lens context's loading/error/enablement machinery. It belongs with Labels and Dates.
   *
   * Optional ⇒ absent/false ⇒ the pass never runs ⇒ byte-for-byte parity. */
  floatTails?: boolean;
  /** The read-only **Late-Start overlay** (ADR-0033 M4): render bars from the late dates for float
   * analysis. Per-user client state (never persisted); while on, all edit gestures are suppressed.
   * Default off. Only surfaced under `SCHEDULING_MODES_ENABLED`. */
  lateOverlay: boolean;
}

/** All view layers on — the default before the user toggles anything (the Late overlay starts off). */
export const DEFAULT_VIEW_TOGGLES: TsldViewToggles = {
  dayGrid: true,
  monthGrid: true,
  yearGrid: true,
  today: true,
  nonWorking: true,
  labels: true,
  lateOverlay: false,
};

export interface TsldScene {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  /** The currently-selected activity id (drawn with a selection ring), if any. */
  selectedId?: string | null;
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
}

/** Half-size (px) of the square drawn at a bar's start/finish edge to mark it grabbable. */
const EDGE_HANDLE_MARK = 3;

/** Width / height (px) of the little triangular pin marking a bar's constrained edge. */
const CONSTRAINT_PIN_W = 7;
const CONSTRAINT_PIN_H = 5;

/** The minimal 2D-context surface the painter uses (kept small so it is easy to mock/test). */
export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'stroke'
  | 'fill'
  | 'setTransform'
  | 'setLineDash'
  | 'fillText'
  | 'measureText'
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  /** Global opacity multiplier (0–1). Used to dim filter non-matches without a second fill colour. */
  globalAlpha: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  /** Optional (Baseline 2023; absent from older/test contexts): the refreshed bar shape rounds its
   * corners with it when present and falls back to square rects when not — guarded like the
   * text APIs (`paintResourceStrip`'s label), so a minimal test context never throws. */
  roundRect?: (x: number, y: number, w: number, h: number, radii: number) => void;
  /** Optional like `roundRect`: the refreshed link routing rounds its elbows with it when present
   * (ADR-0052 M5) and falls back to hard `lineTo` corners when not — an arc, not a shadow/blur,
   * so the draw budget holds; a minimal test context never throws. */
  arcTo?: (x1: number, y1: number, x2: number, y2: number, radius: number) => void;
};

/**
 * Begin a rounded-rect path when the context supports `roundRect` (ADR-0052 M4). Returns whether
 * the path was begun — callers fall back to the square `fillRect`/`strokeRect` when not, so the
 * refresh degrades gracefully on contexts without it (older browsers / minimal test mocks).
 */
function beginRoundedRect(ctx: Ctx2D, r: Rect, radius: number): boolean {
  if (typeof ctx.roundRect !== 'function') return false;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  return true;
}

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

/** Line dash + width of a baseline ghost's outline (thin, dashed — visibly not a live bar). */
const GHOST_DASH: readonly number[] = [2, 2];

/**
 * The dash pattern that encodes criticality without relying on colour (WCAG 1.4.1):
 * a solid outline for critical, a dashed outline for near-critical, and `null` (no
 * outline) otherwise. Paired with the fill colour and the panel's visible legend.
 */
function criticalDash(activity: RenderActivity): number[] | null {
  if (activity.isCritical) return [];
  if (activity.isNearCritical) return [3, 2];
  return null;
}

function drawPolyline(ctx: Ctx2D, points: Point[]): void {
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i]!.x, points[i]!.y);
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
 * Trace a polyline with small rounded elbows (ADR-0052 M5): each interior corner arcs with the
 * pure {@link elbowRadius} (clamped to half its adjoining segments; 0 = a hard corner) via the
 * optional `arcTo` — degrading to the plain hard-cornered {@link drawPolyline} on contexts
 * without it (older browsers / minimal test mocks), like the M4 `roundRect` guard. Rect/line/arc
 * primitives only; called only on the refreshed (flag-on) path.
 */
function drawRoundedPolyline(ctx: Ctx2D, points: Point[]): void {
  if (points.length < 3 || typeof ctx.arcTo !== 'function') {
    drawPolyline(ctx, points);
    return;
  }
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const radius = elbowRadius(points[i - 1]!, points[i]!, points[i + 1]!);
    if (radius > 0)
      ctx.arcTo(points[i]!.x, points[i]!.y, points[i + 1]!.x, points[i + 1]!.y, radius);
    else ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.lineTo(points[points.length - 1]!.x, points[points.length - 1]!.y);
}

/**
 * A small downward triangular pin sitting just above a bar's constrained edge (its tip
 * touching the top of the bar). A **shape** cue — not colour — so a set constraint reads
 * without relying on hue (WCAG 1.4.1); the panel's legend names it, and the parallel
 * listbox spells the constraint out for AT. Under the visual refresh (`outlined`, ADR-0052
 * M4) it gains the same foreground outline the other three badges already carry — a pure
 * consistency restyle: the shape, position, legend entry and AT text are untouched.
 */
function drawConstraintPin(
  ctx: Ctx2D,
  edgeX: number,
  barTop: number,
  palette: TsldPalette,
  outlined = false,
): void {
  const ax = edgeX - CONSTRAINT_PIN_W / 2;
  const bx = edgeX + CONSTRAINT_PIN_W / 2;
  const topY = barTop - CONSTRAINT_PIN_H;
  ctx.fillStyle = palette.edge;
  ctx.beginPath();
  ctx.moveTo(ax, topY);
  ctx.lineTo(bx, topY);
  ctx.lineTo(edgeX, barTop);
  ctx.fill();
  if (outlined) {
    // Traced over the same triangle (closed manually — the Ctx2D surface has no closePath),
    // matching the conflict badge's outline treatment so the four badges read as one family.
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, topY);
    ctx.lineTo(bx, topY);
    ctx.lineTo(edgeX, barTop);
    ctx.lineTo(ax, topY);
    ctx.stroke();
  }
}

/** Half-width (px) of the upward warning triangle marking a Visual-Planning conflict. */
const CONFLICT_BADGE_W = 6;
const CONFLICT_BADGE_H = 7;

/**
 * An upward warning triangle at a conflicting bar's start edge (ADR-0033): a Visual placement earlier
 * than its feasible start. A **shape** cue in the warning hue — distinct from the downward constraint
 * pin — so it never relies on colour alone (WCAG 1.4.1). It carries a **contrasting outline** (the
 * foreground stroke, like the critical/near-critical bar outlines) so the triangle clears the 3:1
 * non-text-contrast bar (WCAG 1.4.11) even against a same-hue near-critical bar fill, where the fill
 * colour alone would vanish. The legend names it and the listbox spells it out for AT.
 */
function drawConflictBadge(ctx: Ctx2D, startX: number, barTop: number, palette: TsldPalette): void {
  const ax = startX + 1;
  const ay = barTop + CONFLICT_BADGE_H + 1;
  const bx = startX + 1 + CONFLICT_BADGE_W;
  const cx = startX + 1 + CONFLICT_BADGE_W / 2;
  const cy = barTop + 1;
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

/** Side (px) of each little square in the stacked-squares lane-overlap badge. */
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

/**
 * Begin the 4-vertex milestone diamond path centred on (`cx`, `cy`) — the ONE tracing shared by
 * the refreshed bar, the baseline ghost, and the legacy bar layer, so the three can never drift.
 * Left open by default (a `fill` closes it implicitly); `close` traces the final segment back to
 * the top vertex for stroke-only callers (the Ctx2D surface has no closePath).
 */
function traceMilestoneDiamond(ctx: Ctx2D, cx: number, cy: number, r: number, close = false): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  if (close) ctx.lineTo(cx, cy - r);
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
  const dash = criticalDash(activity);
  const glyph = barGlyphKind(activity.type);
  if (glyph === 'milestone') {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    traceMilestoneDiamond(ctx, cx, cy, MILESTONE_RADIUS);
    ctx.fill();
    ctx.globalAlpha = 1; // outline + badges stay full-strength even on a dimmed bar
    if (dash) {
      ctx.strokeStyle = palette.outline;
      ctx.lineWidth = EMPHASIS_STROKE_W;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // The consistent-glyph hairline: a calm definition stroke on the same diamond path.
      ctx.strokeStyle = palette.barStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    return;
  }

  if (beginRoundedRect(ctx, rect, BAR_RADIUS)) ctx.fill();
  else ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // Span glyphs, in the bar's own resolved fill (already set) so a Colour-by lens recolours the
  // whole shape as one: LOE/hammock bracket end-caps; WBS-summary downward end tabs.
  if (glyph === 'loe') {
    for (const cap of loeBracketRects(rect)) ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
  } else if (glyph === 'summary') {
    for (const tab of summaryTabRects(rect)) ctx.fillRect(tab.x, tab.y, tab.w, tab.h);
  }
  // In-bar progress, LOD-culled like labels; still at the bar's alpha so a dim recedes whole.
  if (view.pxPerDay >= PROGRESS_MIN_PX_PER_DAY) {
    const progress = progressGeometry(rect, activity.percentComplete ?? 0);
    if (progress) {
      ctx.fillStyle = barInkColour(activity, palette, scene.barInk);
      const { band, frontX } = progress;
      ctx.fillRect(band.x, band.y, band.w, band.h);
      // The hairline front divider — the non-colour boundary cue (WCAG 1.4.1) — clamped to the
      // band's own vertical extent so it marks the band's front without slicing through the
      // centred inside label (ux review). Skipped at 100%, where the front coincides with the
      // bar's end edge.
      if (frontX !== null) ctx.fillRect(frontX - 0.5, band.y, 1, band.h);
    }
  }
  ctx.globalAlpha = 1; // outline + badges stay full-strength even on a dimmed bar
  if (dash) {
    // Stronger-than-legacy emphasis (2px vs 1.5) so the critical path pops; the solid/dashed
    // dash cue is untouched (WCAG 1.4.1 — never colour or weight alone).
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = EMPHASIS_STROKE_W;
    ctx.setLineDash(dash);
    const inset: Rect = { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 };
    if (beginRoundedRect(ctx, inset, Math.max(1, BAR_RADIUS - 1))) ctx.stroke();
    else ctx.strokeRect(inset.x, inset.y, inset.w, inset.h);
    ctx.setLineDash([]);
  } else {
    // The calm hairline definition stroke — quieter than the emphasis, so normal bars recede.
    ctx.strokeStyle = palette.barStroke;
    ctx.lineWidth = 1;
    const inset: Rect = { x: rect.x + 0.5, y: rect.y + 0.5, w: rect.w - 1, h: rect.h - 1 };
    if (beginRoundedRect(ctx, inset, BAR_RADIUS)) ctx.stroke();
    else ctx.strokeRect(inset.x, inset.y, inset.w, inset.h);
  }
}

/**
 * Paint one frame of the TSLD onto `ctx` from the pure render model (ADR-0026). The
 * order is grid → dependency edges → activity bars/milestones → selection ring, so
 * later layers sit on top. Only the culled (visible) activities are drawn, and edges
 * only when an endpoint is visible, so the cost is bounded by the viewport, not the
 * plan size. `dpr` scales the backing store; drawing is authored in CSS px.
 *
 * Returns the culled activity ids (the painter already computed them) so the caller can
 * reuse the set for hit-testing / the minimap without a second cull pass.
 */
export function paintScene(
  ctx: Ctx2D,
  scene: TsldScene,
  view: Viewport,
  size: Size,
  palette: TsldPalette,
  dpr = 1,
): string[] {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);

  const byId = new Map(scene.activities.map((a) => [a.id, a]));
  const visibleIds = new Set(cull(scene.activities, view, size, scene.dataDate));
  const toggles = scene.view ?? DEFAULT_VIEW_TOGGLES;
  const firstDay = Math.floor((0 - view.originX) / view.pxPerDay);
  const lastDay = Math.ceil((size.width - view.originX) / view.pxPerDay);

  // Layer 0: non-working (weekend/holiday) column wash, beneath the grid. Only when the plan has a
  // calendar (`isWorkingDay` present) and the toggle is on, and only once columns are wide enough
  // to read — at coarse zoom the columns are sub-pixel, so it's culled (and avoids a long loop).
  if (toggles.nonWorking && scene.isWorkingDay && view.pxPerDay >= NON_WORKING_MIN_PX) {
    ctx.fillStyle = palette.nonWorking;
    for (let d = firstDay; d <= lastDay; d += 1) {
      if (scene.isWorkingDay(d)) continue;
      ctx.fillRect(screenXOfDay(d, view), 0, view.pxPerDay, size.height);
    }
  }

  // Layer 1: time-axis gridlines — day / month / year variants, each gated by its toggle. Batched
  // into one stroke. Day lines are culled below `DAY_GRID_MIN_PX` (else a solid block); month/year
  // boundaries come from the cheap integer-rollover `calendarBoundaries` (no per-day Date parsing).
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
  if (toggles.monthGrid || toggles.yearGrid) {
    const { months, years } = calendarBoundaries(firstDay, lastDay, scene.dataDate);
    if (toggles.monthGrid) for (const d of months) gridLine(d);
    if (toggles.yearGrid) for (const d of years) gridLine(d);
  }
  ctx.stroke();

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
  let activeLagHandle: Point | null = null;
  if (scene.edges.length > 0) {
    // Time-true anchoring (ADR-0052 M1): the working-day walk is built once per frame from the
    // same predicate the non-working wash reads (memoised + horizon-bounded, so the per-edge cost
    // stays O(visible edges)); a `TWENTY_FOUR_HOUR` lag swaps in the elapsed walk (ADR-0036 §6).
    // No calendar loaded ⇒ elapsed for every edge (display-only; the engine stays authoritative).
    // Flag off ⇒ `null` ⇒ the legacy extreme-end routing below ⇒ byte-for-byte parity.
    const workingWalk = scene.timeTrueLinks
      ? scene.isWorkingDay
        ? makeWorkingDayWalk(scene.isWorkingDay)
        : ELAPSED_DAY_WALK
      : null;
    // Link visual refresh (ADR-0052 M5) — the SAME `visualRefresh` scene field M4 reads (ONE env
    // flag, ONE flag-off parity gate): rounded elbows, deterministic fan-out of crowded bar-edge
    // anchors (memoised on the edges array identity via `edgeFanOutFor` — the array is stable
    // across pan/zoom frames, so offsets never jitter while panning and never recompute per
    // frame), the dashed lag-run depiction, and the incident-link highlight for the selection
    // (persistent, keyboard/AT-reachable) + idle hover (transient). All inert when
    // `visualRefresh` is off ⇒ byte-for-byte today's edge layer.
    const refresh = scene.visualRefresh === true;
    const fanOut = refresh ? edgeFanOutFor(scene.edges) : null;
    const highlightIds = refresh ? linkHighlightIds(scene.selectedId, scene.hoverId) : null;
    if (refresh && workingWalk) lagRuns = [];
    // Handles ride the SAME gate as the runs plus their own scene flag: they are only meaningful
    // where the anchors are time-true (the geometry `classifyHit` grabs), and only wanted where
    // the drag is actually armed. Flag-off ⇒ null ⇒ not one extra call in the paint log.
    if (lagRuns && scene.lagHandles === true) lagHandlePoints = [];
    // The one per-edge geometry seam: flag-off it is exactly the M1 branch (time-true or legacy);
    // refreshed it composes the SAME anchor mapping with the fan-out offsets + elbow shift, and
    // collects the edge's lag run while the anchors are at hand.
    const lineOf = (
      edge: RenderEdge,
      pred: RenderActivity,
      succ: RenderActivity,
    ): Point[] | null => {
      if (!workingWalk) return dependencyPolyline(pred, succ, edge.type, view, scene.dataDate);
      const walk = edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : workingWalk;
      const lag = edge.lagDays ?? 0;
      if (!fanOut) {
        return dependencyPolylineTimeTrue(pred, succ, edge.type, lag, view, scene.dataDate, walk);
      }
      const anchors = lagAnchorPoints(pred, succ, edge.type, lag, view, scene.dataDate, walk);
      if (!anchors) return null;
      const off = fanOut.get(edge);
      if (lagRuns && lag !== 0) {
        // FS/FF walk the successor end, SS/SF the predecessor end — the SAME choice `classifyHit`
        // makes for the draggable anchor, so the handle can never land on the wrong end. Both the
        // run and the handle ride that end's fan-out offset, staying with their own link line
        // (the ±FAN_OUT_MAX_PX spread is well inside the zone's ±BAR_HEIGHT/2 y tolerance).
        const walkedSucc = edge.type === 'FS' || edge.type === 'FF';
        const dy = (walkedSucc ? off?.succ : off?.pred) ?? 0;
        const run = lagRunSegment(pred, succ, edge.type, lag, view, scene.dataDate, walk);
        if (run) {
          lagRuns.push(
            dy === 0
              ? run
              : {
                  from: { x: run.from.x, y: run.from.y + dy },
                  to: { x: run.to.x, y: run.to.y + dy },
                },
          );
        }
        if (lagHandlePoints) {
          // Collected off the ANCHOR, not the run: a clamped anchor (a lag past the bar's extent)
          // yields no run but is still grabbable, and that is exactly the case where an invisible
          // target would silently shadow the bar-end resize handle.
          const anchor = walkedSucc ? anchors.succ : anchors.pred;
          const point: Point = { x: anchor.x, y: anchor.y + dy };
          if (edge.id !== undefined && edge.id === scene.activeLagId) activeLagHandle = point;
          else lagHandlePoints.push(point);
        }
      }
      const from =
        off && off.pred !== 0 ? { x: anchors.pred.x, y: anchors.pred.y + off.pred } : anchors.pred;
      const to =
        off && off.succ !== 0 ? { x: anchors.succ.x, y: anchors.succ.y + off.succ } : anchors.succ;
      return routeOrthogonal(from, to, edge.type, view, off?.pred ?? 0);
    };
    const drawEdges = (driving: boolean, highlighted = false): void => {
      const heads: [Point, Point, Point][] = [];
      ctx.beginPath();
      for (const edge of scene.edges) {
        if (edge.isDriving !== driving) continue;
        // With a highlight active, the base passes skip incident edges and the highlight passes
        // draw ONLY them (on top, restyled). No highlight ⇒ the predicate is never consulted.
        if (highlightIds && edgeTouches(edge, highlightIds) !== highlighted) continue;
        if (!visibleIds.has(edge.predecessorId) && !visibleIds.has(edge.successorId)) continue;
        const pred = byId.get(edge.predecessorId);
        const succ = byId.get(edge.successorId);
        if (!pred || !succ) continue;
        const line = lineOf(edge, pred, succ);
        if (!line) continue;
        if (refresh) drawRoundedPolyline(ctx, line);
        else drawPolyline(ctx, line);
        if (workingWalk) {
          const head = arrowhead(line);
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
      const startDay = daysBetween(scene.dataDate, ghost.baselineStart);
      const finishDay = daysBetween(scene.dataDate, ghost.baselineFinish);
      const x1 = screenXOfDay(startDay, view);
      const x2 = screenXOfDay(finishDay + 1, view); // inclusive finish → +1 day right edge
      const top = screenYOfLane(ghost.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
      const dimmed = scene.dimmedIds?.has(ghost.id) ?? false;
      if (ghost.isMilestone) {
        // A zero-width diamond outline centred on the baseline point, matching the live milestone.
        const cx = (x1 + x2) / 2;
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
        traceMilestoneDiamond(ctx, cx, cy, MILESTONE_RADIUS, true); // closed — stroke-only
        ctx.stroke();
        if (dimmed) ctx.globalAlpha = 1;
      } else {
        const w = Math.max(2, x2 - x1);
        if (!rectsIntersect({ x: x1, y: top, w, h: BAR_HEIGHT }, viewport)) continue;
        if (dimmed) ctx.globalAlpha = DIMMED_ALPHA;
        ctx.strokeRect(x1 + 0.5, top + 0.5, w - 1, BAR_HEIGHT - 1);
        if (dimmed) ctx.globalAlpha = 1;
      }
    }
    ctx.setLineDash([]);
  }

  // Each visible activity's screen rect is computed once here and reused by the bar, label, and
  // selection layers below, rather than recomputed per layer — each recompute re-parses the
  // activity's ISO dates (two Date.parse calls), so a shared map keeps the per-frame draw within
  // the ADR-0026 budget. Insertion follows `visibleIds`, so bar draw order (z-order) is unchanged.
  const rects = new Map<string, Rect>();
  for (const id of visibleIds) {
    const activity = byId.get(id);
    if (!activity) continue;
    const rect = activityRect(activity, view, scene.dataDate);
    if (rect) rects.set(id, rect);
  }

  // Layer 3: activity bars + milestone diamonds. Critical/near-critical activities also
  // get a solid/dashed outline (a non-colour cue for criticality — WCAG 1.4.1).
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
    // A set date constraint pins the bar's start or finish edge — mark that edge (a milestone,
    // having no width, is marked at its centre). A cheap per-bar shape, drawn only for the
    // constrained + visible activities, so it stays within the draw budget (ADR-0026).
    if (activity.constraint) {
      const edgeX = isMilestone(activity.type)
        ? rect.x + rect.w / 2
        : activity.constraint === 'finish'
          ? rect.x + rect.w
          : rect.x;
      drawConstraintPin(ctx, edgeX, rect.y, palette, scene.visualRefresh === true);
    }
    // Visual-Planning conflict (ADR-0033): the placement is before its earliest feasible start. A
    // warning triangle at the bar's start — never auto-moved, only flagged (the mapping seam gates
    // this to VISUAL mode, so EARLY/late bars never show it).
    if (activity.visualConflict) {
      drawConflictBadge(ctx, rect.x, rect.y, palette);
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
      drawOverAllocationBadge(ctx, rect.x + rect.w, rect.y, palette);
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
  if (lagHandlePoints && lagHandlePoints.length > 0) {
    drawLagHandles(ctx, lagHandlePoints, palette, false);
  }
  if (activeLagHandle) drawLagHandles(ctx, [activeLagHandle], palette, true);

  // Layer 3.5: the TODAY marker — a dashed vertical in the destructive hue, above the bars and
  // below the labels + selection ring. Dashed (not colour alone) and named in the panel legend.
  // Drawn only when the toggle is on, today maps to a day offset, and that column is on-screen.
  // Painted before the labels so label text stays legible over the dashed line, not under it.
  if (toggles.today && scene.todayOffset != null) {
    const x = Math.round(screenXOfDay(scene.todayOffset, view)) + 0.5;
    if (x >= 0 && x <= size.width) {
      ctx.strokeStyle = palette.today;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Layer 3.55: GPM **float / drift tails** (ADR-0054 §4) — a hollow tail right of the bar for
  // total float ("how far can this slip?") and left of it for drift ("how much earlier could it
  // have gone?"), in the same time-scale as the bar so slack is comparable across the whole
  // diagram at a glance, which a number printed on a link cannot be.
  //
  // Hollow and hatched, never filled: a filled extension would read as duration. The hatch is the
  // non-colour cue (WCAG 1.4.1), so the tails survive a monochrome print and a colour-blind
  // reader. Drawn BELOW the labels, so no name is ever obscured by slack.
  //
  // Cheap by construction: no text, no measurement — two stroked rects and a few hatch lines per
  // bar, culled with the bar itself. Absent flag ⇒ not one call ⇒ parity.
  if (toggles.floatTails === true) {
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.labelBeside;
    for (const [id, rect] of rects) {
      const activity = byId.get(id)!;
      const tails = [
        floatTailRect(rect, activity.totalFloat, view),
        driftTailRect(rect, activity.visualDriftDays, view),
      ];
      for (const tail of tails) {
        if (!tail || tail.w < 2) continue; // sub-2px slack is not worth a shape
        ctx.strokeRect(tail.x + 0.5, tail.y + 0.5, tail.w - 1, tail.h - 1);
        // Diagonal hatch — the non-colour cue. Stepped so a long tail costs a bounded number of
        // lines rather than one per pixel.
        ctx.beginPath();
        for (let hx = tail.x + TAIL_HATCH_STEP; hx < tail.x + tail.w; hx += TAIL_HATCH_STEP) {
          ctx.moveTo(hx, tail.y + tail.h);
          ctx.lineTo(hx + tail.h, tail.y);
        }
        ctx.stroke();
      }
    }
  }

  // Layer 3.6: activity labels (`{code} {name} · {n}d`), so the diagram reads without selecting
  // (ADR-0026 D1). Gated by the toggle and a legibility zoom (LABEL_MIN_PX_PER_DAY). Placed inside
  // a wide-enough task bar (truncated + ellipsised to fit, so no clip needed), beside a short bar or
  // milestone when the same-lane neighbour leaves clear room, else suppressed. The visible set is
  // bucketed by lane and x-sorted once (O(v log v)) so each label's right-neighbour is known without
  // a per-label scan; widths are memoised (font fixed) so a label measures at most once ever.
  if ((toggles.labels ?? true) && view.pxPerDay >= LABEL_MIN_PX_PER_DAY) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const measure = (s: string): number => labelWidths.measure(s, (t) => ctx.measureText(t).width);
    // Placement polish (M4): an inside label clears the refreshed bar's rounded corner with a
    // little extra pad. Flag-off the extra is 0, so the arithmetic (and the paint log) is
    // byte-for-byte today's. The font is deliberately unchanged — the module-scope width memo is
    // keyed by text alone, so a metric change would poison it across palettes (export path).
    const insidePad = LABEL_PAD_PX + (scene.visualRefresh ? 2 : 0);

    const lanes = new Map<number, { activity: RenderActivity; rect: Rect }[]>();
    for (const [id, rect] of rects) {
      const activity = byId.get(id)!;
      const row = lanes.get(activity.laneIndex);
      if (row) row.push({ activity, rect });
      else lanes.set(activity.laneIndex, [{ activity, rect }]);
    }

    for (const row of lanes.values()) {
      row.sort((a, b) => a.rect.x - b.rect.x);
      for (let i = 0; i < row.length; i += 1) {
        const { activity, rect } = row[i]!;
        const nextLeftX = i + 1 < row.length ? row[i + 1]!.rect.x : Infinity;
        const besideRoomPx = nextLeftX - (rect.x + rect.w) - LABEL_GAP_PX;
        const placement = labelPlacement({
          barWidth: rect.w,
          isMilestone: isMilestone(activity.type),
          besideRoomPx,
        });
        if (placement === 'none') continue;
        const cy = rect.y + rect.h / 2;
        if (placement === 'inside') {
          const text = truncateToWidth(activity.label, rect.w - insidePad * 2, measure);
          if (!text) continue;
          // A Colour-by lens repaints the bar a non-criticality hue, so the criticality-based ink can
          // fail contrast (e.g. white-on-warning-yellow at 2.02:1). `barInkColour` applies the paired,
          // contrast-safe override when the lens carries one (non-default modes only), else falls back
          // to today's criticality ink (absent map / Criticality mode ⇒ byte-for-byte parity, WCAG
          // 1.4.3) — the SAME chain the in-bar progress band draws with.
          ctx.fillStyle = barInkColour(activity, palette, scene.barInk);
          ctx.fillText(text, rect.x + insidePad, cy);
        } else {
          const startX = rect.x + rect.w + LABEL_GAP_PX;
          const maxPx = (nextLeftX === Infinity ? size.width : nextLeftX) - startX - LABEL_PAD_PX;
          const text = truncateToWidth(activity.label, maxPx, measure);
          if (!text) continue;
          ctx.fillStyle = palette.labelBeside;
          ctx.fillText(text, startX, cy);
        }
      }
    }
  }

  // Layer 3.7: flanking start/finish DATES (ADR-0054 §3) — the start date left of the bar, the
  // finish date right of it, never inside (an inside date competes with the name label for the
  // same pixels and vanishes on any bar narrower than its text). Gated by the `dates` toggle AND
  // a zoom well above the label LOD, because this is two strings + two measurements per bar
  // against the ADR-0026 draw budget. Absent toggle ⇒ not one call ⇒ byte-for-byte parity.
  if (toggles.dates === true && view.pxPerDay >= DATE_LABEL_MIN_PX_PER_DAY) {
    ctx.font = LABEL_FONT;
    ctx.textBaseline = 'middle';
    const measure = (t: string): number => labelWidths.measure(t, (x) => ctx.measureText(x).width);
    // Lane-bucketed and x-sorted exactly like the label pass, so each bar's neighbours — and so
    // the room its dates have — are known without a per-bar scan.
    const laneRows = new Map<number, { activity: RenderActivity; rect: Rect }[]>();
    for (const [id, rect] of rects) {
      const activity = byId.get(id)!;
      const row = laneRows.get(activity.laneIndex);
      if (row) row.push({ activity, rect });
      else laneRows.set(activity.laneIndex, [{ activity, rect }]);
    }
    ctx.fillStyle = palette.labelBeside;
    for (const row of laneRows.values()) {
      row.sort((a, b) => a.rect.x - b.rect.x);
      for (let i = 0; i < row.length; i += 1) {
        const { activity, rect } = row[i]!;
        if (!activity.earlyStart || !activity.earlyFinish) continue; // uncalculated ⇒ no dates
        const startText = formatCanvasDate(activity.earlyStart);
        const finishText = formatCanvasDate(activity.earlyFinish);
        const prevRight = i > 0 ? row[i - 1]!.rect.x + row[i - 1]!.rect.w : 0;
        const nextLeft = i + 1 < row.length ? row[i + 1]!.rect.x : size.width;
        const slot = dateLabelSlot({
          roomLeftPx: rect.x - prevRight,
          roomRightPx: nextLeft - (rect.x + rect.w),
          startWidthPx: measure(startText),
          finishWidthPx: measure(finishText),
        });
        const cy = rect.y + rect.h / 2;
        if (slot.start) {
          ctx.textAlign = 'right';
          ctx.fillText(startText, rect.x - LABEL_GAP_PX, cy);
        }
        if (slot.finish) {
          ctx.textAlign = 'left';
          ctx.fillText(finishText, rect.x + rect.w + LABEL_GAP_PX, cy);
        }
      }
    }
    ctx.textAlign = 'left';
  }

  // Layer 4: the selection ring on the selected activity (if visible), plus — when editing
  // enables link-draw — a persistent edge-handle mark at each end of the selected bar. That mark
  // is the non-hover affordance advertising that the bar's ends are grabbable to draw a
  // dependency (UX_STANDARDS: hover-only affordances need a non-hover equivalent); selection is
  // keyboard-reachable via the listbox, so the cue isn't pointer-only either.
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
}

/** The cursor date readout's screen shape (ADR-0054 §2) — see `render/cursor-readout.ts`. */
export interface CursorChip {
  /** Screen x of the guideline: the day boundary, not the raw pointer. */
  x: number;
  /** The date sentence, e.g. `Fri 2 Jan` or `2 Jan – 6 Jan · 5d`. */
  label: string;
}

/** Height (px) of the cursor date chip. */
const CURSOR_CHIP_H = 16;
/** Gap (px) between the canvas top edge and the chip. */
const CURSOR_CHIP_TOP = 4;

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

  // The cursor date readout (ADR-0054 §2), drawn FIRST so every ghost, ring and chip paints over
  // it — it is a reference line, not a foreground object. A full-height dashed rule marks the day
  // boundary being chosen; the chip above it states the date. Absent ⇒ not one call ⇒ parity.
  if (overlay.cursor) {
    const { x, label } = overlay.cursor;
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size.height);
    ctx.stroke();
    ctx.setLineDash([]);
    // Guarded like every other label pass so a text-less test context never throws; `measureText`
    // sizes the chip, and the x is clamped so the chip never leaves the surface at either edge.
    if (typeof ctx.fillText === 'function' && typeof ctx.measureText === 'function') {
      ctx.font = LABEL_FONT;
      const w = ctx.measureText(label).width + LABEL_PAD_PX * 2;
      const cx = Math.max(0, Math.min(x - w / 2, size.width - w));
      ctx.fillStyle = palette.bar;
      ctx.fillRect(cx, CURSOR_CHIP_TOP, w, CURSOR_CHIP_H);
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, CURSOR_CHIP_TOP + 0.5, w - 1, CURSOR_CHIP_H - 1);
      ctx.fillStyle = palette.labelInside;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, cx + LABEL_PAD_PX, CURSOR_CHIP_TOP + CURSOR_CHIP_H / 2);
    }
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
        const { band, frontX } = progress;
        ctx.fillRect(band.x, band.y, band.w, band.h);
        if (frontX !== null) ctx.fillRect(frontX - 0.5, band.y, 1, band.h);
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
    // A milestone ghosts as the diamond it really is, so a dragged milestone never momentarily
    // becomes a bar (ADR-0054 §1). The outline below then traces the same path.
    if (detail?.milestone) {
      traceMilestoneDiamond(ctx, r.x + r.w / 2, r.y + r.h / 2, MILESTONE_RADIUS);
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
  bar: string;
  axis: string;
  tick: string;
}

/** Format a demand value (`DECIMAL(18,4)` units) for the max-tick label — ≤ 4 dp, trailing zeros dropped. */
function formatStripUnits(value: number): string {
  return Number(value.toFixed(4)).toString();
}

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

  if (!snapshot || snapshot.max <= 0 || snapshot.series.values.length === 0) return;

  const bars = bucketBarsFromDays(snapshot.series.values, snapshot.dayOffsets, view, band, {
    height: band.height,
    max: snapshot.max,
  });
  ctx.fillStyle = palette.bar;
  for (const bar of bars) {
    // Bars grow up from the band's baseline; the top pad keeps a full-height bar clear of the rule/tick.
    ctx.fillRect(bar.x, band.height - bar.h, bar.w, bar.h);
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

/** The inclusive [minDay, maxDay] world-day extent of the computed activities (for the ruler/minimap). */
export function dayExtent(
  activities: readonly RenderActivity[],
  dataDate: string,
): { minDay: number; maxDay: number } | null {
  let minDay = Infinity;
  let maxDay = -Infinity;
  for (const a of activities) {
    if (a.earlyStart === null) continue;
    const start = daysBetween(dataDate, a.earlyStart);
    const finish = a.earlyFinish === null ? start : daysBetween(dataDate, a.earlyFinish);
    minDay = Math.min(minDay, start);
    maxDay = Math.max(maxDay, finish + 1);
  }
  return Number.isFinite(minDay) ? { minDay, maxDay } : null;
}
