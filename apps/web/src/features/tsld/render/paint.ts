import type { GhostBar } from './lenses';
import { createMeasureCache } from './measure';
import {
  activityRect,
  cull,
  daysBetween,
  dependencyPolyline,
  isMilestone,
  labelPlacement,
  rectsIntersect,
  screenXOfDay,
  screenYOfLane,
  truncateToWidth,
  BAR_HEIGHT,
  LABEL_FONT,
  LABEL_GAP_PX,
  LABEL_MIN_PX_PER_DAY,
  LABEL_PAD_PX,
  LANE_HEIGHT,
  MILESTONE_RADIUS,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from './render-model';
import { calendarBoundaries } from './time-scale';

/**
 * Session-lived width memo for label text (font is fixed, so keyed by string alone). Held at
 * module scope so it persists across frames and canvas instances — a given label measures once.
 */
const labelWidths = createMeasureCache();

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
  /** Per-activity Colour-by fill override (id → CSS colour), precomputed by `buildColourMap`. When a
   * bar's id is present the painter uses this fill; absent ids (and an absent map) fall back to today's
   * `barColour`. Passed only for the non-default Colour-by modes, so Criticality ⇒ absent ⇒ parity. */
  barFill?: ReadonlyMap<string, string> | undefined;
  /** Baseline ghost bars drawn as a culled outline layer beneath the live bars (the Baseline overlay).
   * Absent ⇒ the overlay is off / no active baseline ⇒ no ghost layer (parity). */
  baselineGhosts?: readonly GhostBar[] | undefined;
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
};

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

/**
 * A small downward triangular pin sitting just above a bar's constrained edge (its tip
 * touching the top of the bar). A **shape** cue — not colour — so a set constraint reads
 * without relying on hue (WCAG 1.4.1); the panel's legend names it, and the parallel
 * listbox spells the constraint out for AT.
 */
function drawConstraintPin(ctx: Ctx2D, edgeX: number, barTop: number, palette: TsldPalette): void {
  ctx.fillStyle = palette.edge;
  ctx.beginPath();
  ctx.moveTo(edgeX - CONSTRAINT_PIN_W / 2, barTop - CONSTRAINT_PIN_H);
  ctx.lineTo(edgeX + CONSTRAINT_PIN_W / 2, barTop - CONSTRAINT_PIN_H);
  ctx.lineTo(edgeX, barTop);
  ctx.fill();
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
  if (scene.edges.length > 0) {
    const drawEdges = (driving: boolean): void => {
      ctx.beginPath();
      for (const edge of scene.edges) {
        if (edge.isDriving !== driving) continue;
        if (!visibleIds.has(edge.predecessorId) && !visibleIds.has(edge.successorId)) continue;
        const pred = byId.get(edge.predecessorId);
        const succ = byId.get(edge.successorId);
        if (!pred || !succ) continue;
        const line = dependencyPolyline(pred, succ, edge.type, view, scene.dataDate);
        if (line) drawPolyline(ctx, line);
      }
      ctx.stroke();
    };
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    drawEdges(false); // non-driving: thin, dashed
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    drawEdges(true); // driving: heavier, solid
    ctx.lineWidth = 1;
  }

  // Layer 2.5: baseline ghost bars (the Baseline overlay lens, `docs/specs/canvas-lenses/`) — the
  // captured baseline span drawn as a thin dashed outline BENEATH the live bars, so slip reads on the
  // canvas. Culled exactly like the bar layer (only ghosts whose rect intersects the viewport draw),
  // and batched into one stroke state. Absent ⇒ this whole block is skipped ⇒ byte-for-byte parity.
  if (scene.baselineGhosts && scene.baselineGhosts.length > 0) {
    const viewport: Rect = { x: 0, y: 0, w: size.width, h: size.height };
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash(GHOST_DASH as number[]);
    for (const ghost of scene.baselineGhosts) {
      const startDay = daysBetween(scene.dataDate, ghost.baselineStart);
      const finishDay = daysBetween(scene.dataDate, ghost.baselineFinish);
      const x1 = screenXOfDay(startDay, view);
      const x2 = screenXOfDay(finishDay + 1, view); // inclusive finish → +1 day right edge
      const top = screenYOfLane(ghost.laneIndex, view) + (LANE_HEIGHT - BAR_HEIGHT) / 2;
      const w = Math.max(2, x2 - x1);
      if (!rectsIntersect({ x: x1, y: top, w, h: BAR_HEIGHT }, viewport)) continue;
      ctx.strokeRect(x1 + 0.5, top + 0.5, w - 1, BAR_HEIGHT - 1);
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
    const dimmed = scene.dimmedIds?.has(id) ?? false;
    ctx.globalAlpha = dimmed ? DIMMED_ALPHA : 1;
    ctx.fillStyle = barColour(activity, palette, scene.barFill);
    if (isMilestone(activity.type)) {
      // A diamond centred in the bounding box.
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - MILESTONE_RADIUS);
      ctx.lineTo(cx + MILESTONE_RADIUS, cy);
      ctx.lineTo(cx, cy + MILESTONE_RADIUS);
      ctx.lineTo(cx - MILESTONE_RADIUS, cy);
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
      drawConstraintPin(ctx, edgeX, rect.y, palette);
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
  }

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
          const text = truncateToWidth(activity.label, rect.w - LABEL_PAD_PX * 2, measure);
          if (!text) continue;
          ctx.fillStyle = activity.isCritical
            ? palette.labelInsideCritical
            : activity.isNearCritical
              ? palette.labelInsideNearCritical
              : palette.labelInside;
          ctx.fillText(text, rect.x + LABEL_PAD_PX, cy);
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
      ctx.strokeRect(rect.x - 2, rect.y - 2, rect.w + 4, rect.h + 4);
      if (scene.showEdgeHandles && selected && !isMilestone(selected.type)) {
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
}

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

  const { live, pending, link, linkPick } = overlay;

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

  if (live) {
    ctx.fillStyle = palette.bar;
    ctx.fillRect(live.x, live.y, live.w, live.h);
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(live.x + 0.5, live.y + 0.5, live.w - 1, live.h - 1);
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
