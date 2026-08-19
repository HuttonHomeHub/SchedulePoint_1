import type { ActivityType, DependencyType } from '@repo/types';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';

import {
  IDLE,
  reduce,
  type BodyGrab,
  type EditIntent,
  type EditMode,
  type GestureState,
  type LagGrab,
  type LoeSpanStep,
  type Modifiers,
} from '../interaction/gesture-machine';
import { useCanvasSurface } from '../render/canvas-surface';
import { cursorReadout } from '../render/cursor-readout';
import type { GhostBar } from '../render/lenses';
import { linkLegality } from '../render/link-legality';
import {
  paintInteractionLayer,
  paintResourceStrip,
  paintScene,
  paintWbsBand,
  type GhostDetail,
  type InteractionOverlay,
  type LagOverlay,
  type LinkOverlay,
  type ResizeOverlay,
  type ResourceStripPalette,
  type TsldPalette,
  type WbsBandPalette,
  type TsldScene,
  type TsldViewToggles,
} from '../render/paint';
import {
  resolveResourceStripPalette,
  resolveTsldPalette,
  resolveWbsBandPalette,
} from '../render/palette';
import {
  activityRect,
  addCalendarDays,
  classifyHit,
  dayCellRect,
  daysBetween,
  DEFAULT_VIEWPORT,
  edgeAnchor,
  fitToContent,
  hitTest,
  idsIntersecting,
  rectFromCorners,
  MIN_CONTEXT_DAYS,
  withMinimumSpan,
  lagAnchorDay,
  makeWorkingDayWalk,
  pan,
  isMilestone,
  panToDate,
  screenXOfDay,
  zoomAt,
  ELAPSED_DAY_WALK,
  LANE_HEIGHT,
  LEGACY_MAX_PX_PER_DAY,
  MAX_PX_PER_DAY,
  type ClassifyHitOptions,
  type DayWalk,
  type HitZone,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
  type ZoomLevel,
} from '../render/render-model';
import type { ResourceStripSnapshot } from '../render/resource-strip';
import { drawnSpanPlacement } from '../render/snap';
import {
  presetOf,
  pxPerDayForPreset,
  rulerTicks,
  stepZoom,
  zoomToPreset,
} from '../render/time-scale';
import { useThemeVersion } from '../render/use-theme-version';
import {
  wbsBandBars,
  wbsBandHitTest,
  type WbsBandBar,
  type WbsBandGroup,
} from '../render/wbs-band';

import {
  CANVAS_AUTHORING_ENABLED,
  CANVAS_DATA_DATE_ENABLED,
  CANVAS_DIRECT_MANIPULATION_ENABLED,
  CANVAS_LINK_ROUTING_ENABLED,
  CANVAS_LIVE_FEEDBACK_ENABLED,
  CANVAS_MULTI_SELECT_ENABLED,
  CANVAS_SEARCH_NAV_ENABLED,
  CANVAS_TIME_AXIS_ENABLED,
  CANVAS_VISUAL_LANGUAGE_ENABLED,
} from '@/config/env';
import { formatCalendarDate } from '@/lib/format-date';

/** Imperative commands the toolbar issues to the canvas (kept ref-authoritative — ADR-0026 D3). */
export interface TsldCanvasHandle {
  /** Reframe to a zoom preset's scale, centre-anchored. */
  zoomToPreset: (level: ZoomLevel) => void;
  /** Zoom in/out by a factor about the centre (the button equivalent of wheel zoom). */
  stepZoom: (factor: number) => void;
  /** Pan (no zoom) so the given calendar day (`YYYY-MM-DD`) sits at the left edge of the surface —
   * a pure **view** jump (ADR-0033 "Go to date"): no fetch, no persisted state, no schedule change. */
  goToDate: (iso: string) => void;
  /** Pan (no zoom) so the given calendar day sits at the **horizontal centre** of the surface — the
   * centred sibling of {@link goToDate}, used by *Next conflict* to bring a flagged bar to the middle
   * (canvas nav, `docs/specs/canvas-nav/`). Same pure view transform; no fetch/persisted state. */
  centerOnDate: (iso: string) => void;
  /**
   * Frame a single activity at a readable scale (`docs/specs/canvas-search-navigation/` M3).
   *
   * A **command, not a mode** (ADR-0056): it sets the scale once, and a later resize preserves what
   * it set rather than re-deriving it — the same contract the zoom presets have.
   *
   * Returns whether it framed anything, so the caller can announce honestly. False when the activity
   * has no computed dates (nothing to frame) or the canvas has not been measured yet.
   */
  zoomToActivity: (id: string) => boolean;
  /** Read (never mutate) the current viewport transform + measured surface size — used by the
   * **Diagram — current view (PNG)** export (spec `docs/specs/export-print/`) to crop the off-screen
   * image to the live bounds. A pure read off the rAF-owned refs; it never repaints the live canvas. */
  getViewport: () => { view: Viewport; size: Size };
}

/** Left inset (px) the "Go to date" jump leaves before the target day, so it isn't flush to the edge. */
const GOTO_LEFT_INSET = 12;

/** Height (px) of the sticky date-ruler band across the top of the canvas. The drawing canvas sits
 * below it, so a canvas-relative y maps to a container y by adding this (used to place the create
 * popover, which is positioned against the outer container). */
export const RULER_HEIGHT = 40;

/** Height (px) of the resource-strip band pinned to the **bottom** of the canvas container (Stage E,
 * ADR-0049). Mirrors {@link RULER_HEIGHT}'s top reservation: when the strip is active, `measure()`
 * subtracts this from the scene canvas's drawable height, exactly as `RULER_HEIGHT` is subtracted from
 * the top; when inactive it reserves nothing, so the scene is byte-for-byte today's (the parity gate). */
export const RESOURCE_STRIP_HEIGHT = 72;

/**
 * The scene canvas's top offset inside the container — **the one definition** (ADR-0063 §5).
 *
 * It used to be `RULER_HEIGHT` written out at each call site, which was correct only while the
 * ruler was the sole thing above the scene. The WBS band breaks that assumption, and it breaks it
 * quietly: the band renders, the canvas looks right, and the create popover opens forty pixels
 * above where the user clicked. So every conversion from a canvas-relative y to a container y now
 * goes through here, and `wbsBandHeightPx` is `0` whenever the band is off — which makes the
 * flag-off path byte-for-byte `RULER_HEIGHT`, the parity gate.
 */
export function sceneTopOffset(wbsBandHeightPx: number): number {
  return RULER_HEIGHT + wbsBandHeightPx;
}

const CLICK_MOVE_THRESHOLD_PX = 4;

/**
 * The zoom-scale ceiling this build actually allows: the raised {@link MAX_PX_PER_DAY} once
 * `VITE_CANVAS_TIME_AXIS` is on, else the pre-epic {@link LEGACY_MAX_PX_PER_DAY} — resolved once
 * here (the flag is a build-time constant) rather than at each of the four call sites below, so a
 * flag-off build's wheel/pinch/button/preset zoom stays byte-for-byte within the old ceiling
 * (a component-review finding on an earlier draft that read `MAX_PX_PER_DAY` unconditionally).
 */
const RESOLVED_MAX_PX_PER_DAY = CANVAS_TIME_AXIS_ENABLED ? MAX_PX_PER_DAY : LEGACY_MAX_PX_PER_DAY;

/** The pending create ghost (day/lane geometry) held open under the name popover. */
export interface PendingGhost {
  startDay: number;
  endDay: number;
  laneIndex: number;
}

/**
 * How a click should fold into the selection (`docs/specs/canvas-multi-select/` M2).
 *
 * Absent means **replace** — the plain click every version of this canvas has had. Naming only the
 * two plural cases keeps the flag-off path literally unrepresentable rather than merely unused.
 */
export type SelectModifier = 'toggle' | 'span';

export interface TsldCanvasProps {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  selectedId: string | null;
  /**
   * Report a click's selection target.
   *
   * `modifier` is **optional and additive** (`docs/specs/canvas-multi-select/` M2-T2): flag-off the
   * canvas never passes one, so every existing host reads exactly the signature it always did and
   * behaves byte-for-byte. A host that does not understand it simply ignores a second argument,
   * which is why this is a widened parameter rather than a second callback — one selection channel
   * cannot drift from another.
   */
  /**
   * The whole selection when it is plural (`docs/specs/canvas-multi-select/` M2-T5). Secondary
   * members get a thinner ring; {@link selectedId} stays the primary and keeps the edge handles.
   * Absent ⇒ the scene carries no plural field and paints byte-for-byte as today.
   */
  selectedIds?: readonly string[] | undefined;
  onSelect: (id: string | null, modifier?: SelectModifier) => void;
  /**
   * A committed marquee sweep, already resolved to ids (`docs/specs/canvas-multi-select/` M2-T3).
   *
   * The **canvas** resolves the rectangle rather than the host, because resolving needs the live
   * viewport and `activityRect`, which the canvas owns and the host would have to reach across a
   * boundary for. The gesture machine stays blind to the scene and reports the rectangle only.
   *
   * `additive` came from the modifier held at **press**. Absent, no marquee is ever committed.
   */
  onSelectRegion?: (ids: readonly string[], additive: boolean) => void;
  /** Bump to re-fit the viewport to the content (the toolbar's "Fit" button). */
  fitSignal: number;
  /** M2: enable on-canvas editing. Absent/false → the M1 read-only surface, unchanged. */
  editing?: boolean;
  /** The active editing tool (only meaningful when `editing`). */
  mode?: EditMode;
  /** The activity type the add-activity tool draws (ADR-0032 M4); absent ⇒ TASK. Milestones place
   * as a point on a single click. */
  createType?: ActivityType;
  /** The dependency type the two-click `link` tool creates (ADR-0032 M5); absent ⇒ FS. */
  linkType?: DependencyType;
  /** Whether a body-grab in select mode may start a reposition (i.e. a handler is wired). When
   * false, a body press falls through to M1 select — no dangling ghost that no-ops on release. */
  canReposition?: boolean;
  /** Whether a bar-end grab in select mode may start a duration resize (i.e. a resize handler is
   * wired — ADR-0052 M2 finish edge, M3 start edge). Only effective under
   * `VITE_CANVAS_DIRECT_MANIPULATION`; when false (or flag-off) the bar ends keep their previous
   * behaviour byte-for-byte. */
  canResize?: boolean;
  /** Whether a drawn lag anchor may be dragged to change its link's lag (i.e. a lag handler is
   * wired — ADR-0052 M3). Only effective under `VITE_CANVAS_DIRECT_MANIPULATION`; when false (or
   * flag-off) no lag-anchor zones exist, byte-for-byte. */
  canLag?: boolean;
  /** Whether an edge-handle grab may start a dependency-draw (i.e. a link handler is wired).
   * When false, a handle press falls through to M1 select — no dangling rubber-band. */
  canLink?: boolean;
  /** Called with a committed edit + the (container-clamped) anchor point for its popover. */
  onIntent?: (intent: EditIntent, anchor: Point) => void;
  /** LOE endpoint-pick step feedback (Stage D) — the parallel-DOM a11y channel `TsldPanel` announces +
   * syncs: the first pick (`start`), a rejected same-activity re-pick (`reprompt`), or a cancelling
   * empty click (`cancel`). The committed span arrives via {@link onIntent} as a `loeSpan` intent. */
  onLoeSpanStep?: (step: LoeSpanStep) => void;
  /**
   * The two-click **Link** tool's open pick (ADR-0064 T4): the picked predecessor's id, or null
   * when no pick is open. Mirrors {@link onLoeSpanStep}'s shape — the shell needs it to state
   * *which* endpoint is picked, and the gesture machine is the only thing that knows.
   *
   * Emitted on every transition of the picking state, including the Escape that drops a pick, so
   * the shell never has to infer "still picking?" from a stale render.
   */
  onLinkPickStep?: (predecessorId: string | null) => void;
  /**
   * Bumped by the shell to **drop an open link pick** without disarming the tool (ADR-0064 T7). The
   * one caller is the recalculation hold hitting its cap: the bars are about to move, so a pick
   * taken against the old positions is no longer the pick the planner made. Signal-shaped like
   * `fitSignal` because the shell is asking for an action, not describing a state.
   */
  dropLinkPickSignal?: number;
  /**
   * The shell's picked link predecessor, seeded INTO the internal gesture (ADR-0064 T6) — the exact
   * mirror of {@link loePickStartId}. Without it the keyboard pick and the pointer pick would be
   * two separate notions of "which endpoint is chosen", and picking by keyboard then clicking the
   * successor would start a second pick instead of committing the first.
   */
  linkPickPredecessorId?: string | null;
  /** The LOE tool's picked **start driver** id, controlled by `TsldPanel` (Stage D) — the single source
   * of truth for the pick, mirroring the inbound {@link selectedId} pattern. A keyboard-side pick (the
   * listbox Enter) sets this; the canvas seeds its internal gesture from it so the NEXT pointer click
   * resolves as the SECOND pick against the keyboard-picked start (not a restarted first pick). Null ⇒
   * no start picked; the canvas keeps its gesture idle. Only meaningful in `loe` mode. */
  loePickStartId?: string | null;
  /** Called when Esc is pressed while idle in add-activity mode (revert to Select). */
  onExitAddMode?: () => void;
  /** The dropped-create ghost held open under the name popover. While set, the canvas is TOTALLY
   * inert (no pan, no gesture): an in-progress name must never be lost to a stray drag. A
   * reposition/resize write in flight is deliberately NOT this prop — that state keeps the surface
   * live and rides {@link writeGhost} + {@link writeBusy} instead (canvas status & feedback M2). */
  pending?: PendingGhost | null;
  /** The optimistic ghost of a reposition/resize write in flight — painted in the same overlay
   * slot as {@link pending} (at most one of the two is ever set: `onIntent` refuses a new gesture
   * while either is pending), but it does NOT own the canvas. */
  writeGhost?: PendingGhost | null;
  /** True while a reposition/resize write is in flight. Refuses only NEW edit grabs
   * (body-reposition, bar-end resize, lag-anchor — and an add-mode draw, whose intent the panel
   * would drop anyway); empty-ground pan, wheel zoom, hover and the plain click-select stay live.
   * Split from {@link pending} rather than deleting the gate: `onIntent` already refuses a second
   * intent mid-write, so an un-gated drag would run, ghost and then apply nothing — the "lit but
   * inert" defect shape (ADR-0059 M6 / ADR-0062 M6). The refusal is visible instead (busy cursor,
   * `aria-busy`). */
  writeBusy?: boolean;
  /** Which optional view layers to draw (grid variants / today / non-working). Defaults to all on. */
  view?: TsldViewToggles;
  /** Predicate built from the plan calendar (mask + holiday exceptions): is this day offset worked?
   * Null/absent → no non-working shading. Must be referentially stable (memoised) to avoid repaints. */
  isWorkingDay?: ((dayOffset: number) => boolean) | null;
  /** Day offset (from `dataDate`) of "today", or null when it isn't placeable. */
  todayOffset?: number | null;
  /** The viewer-local time-of-day fraction (0…1) added to `todayOffset` for a fractional (not
   * midnight-boundary) Today line + pill (F6a/F6b, `VITE_CANVAS_TIME_AXIS`). Absent/null ⇒ the
   * plain integer offset ⇒ byte-for-byte today's paint (the flag-off parity claim). */
  todayFraction?: number | null;
  // ── Insight lenses (spec `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`) ──────────
  // All default-absent ⇒ byte-for-byte today's paint. `TsldPanel` derives these (memoised).
  /** Ids of activities the active filter dimmed (non-matches); they paint muted, keeping the outline. */
  dimmedIds?: ReadonlySet<string> | undefined;
  /** Per-activity Colour-by fill override (id → CSS colour); absent ⇒ today's criticality fills. */
  barFill?: ReadonlyMap<string, string> | undefined;
  /** Per-activity Colour-by inside-label ink override (id → CSS colour), paired with `barFill`; absent ⇒
   * today's criticality-based label ink. */
  barInk?: ReadonlyMap<string, string> | undefined;
  /** Baseline ghost bars drawn as a culled outline layer beneath the live bars (the Baseline overlay). */
  baselineGhosts?: readonly GhostBar[] | undefined;
  // ── Over-allocation highlight (Stage E M2, spec `docs/specs/canvas-resource-view/`) ─────────
  /** Ids of engine-flagged over-allocated activities (`levelingWindowExceeded || selfOverAllocated`,
   * ADR-0041), marked on the canvas with a distinct mini-histogram badge (never colour-only). Absent ⇒
   * the highlight is off / nothing is over-allocated ⇒ byte-for-byte today's paint. `TsldPanel` derives
   * it (memoised). */
  flaggedIds?: ReadonlySet<string> | undefined;
  // ── Resource strip (Stage E, ADR-0049, behind `VITE_CANVAS_RESOURCE_VIEW`) ──────────────────
  // Both default-absent ⇒ byte-for-byte today's `measure()` + paint (the parity gate): no band is
  // reserved and the rAF loop does no strip work when the strip is inactive.
  /** When true, reserve the {@link RESOURCE_STRIP_HEIGHT} band at the container bottom and paint the
   * demand strip there each frame. When false/absent the band reserves nothing and no strip layer
   * mounts, so the scene is byte-for-byte today's. */
  resourceStripActive?: boolean;
  /** The immutable strip snapshot the DOM `ResourceStripPanel` publishes (selected series + pre-projected
   * bucket day-offsets + whole-series max). Writing it repaints ONLY the strip (a `stripDirtyRef` flag),
   * never the main scene. `null` ⇒ the band draws just its axis rule (the DOM shows the empty/loading
   * state). Ignored unless {@link resourceStripActive}. */
  resourceStrip?: ResourceStripSnapshot | null;
  /** Imperative handle so the toolbar can command zoom presets / steps (ADR-0026 D3 seam). */
  controlRef?: React.Ref<TsldCanvasHandle>;
  /** Fires only when the active zoom preset changes (a stop-boundary crossing) — never per frame —
   * so the toolbar can reflect the active preset without per-frame React state. */
  onZoomStopChange?: (level: ZoomLevel) => void;
  /**
   * The pinned WBS band (ADR-0063): the groups to draw, or `null` when the band is off. The host
   * derives them (`features/wbs`) because the tsld feature imports no other feature (ADR-0026 D8).
   */
  wbsBandGroups?: readonly WbsBandGroup[] | null;
  /**
   * The band's reserved height in px — **`0` when the band is off**, which is what makes
   * `measure()` subtract nothing and the scene byte-for-byte today's. Derived by the host from the
   * same groups, so this component and the create popover cannot disagree about the offset.
   */
  wbsBandHeightPx?: number;
  /** Selecting a summary from a band bar. Never called for the derived bucket, which has no id. */
  onSelectBandSummary?: (activityId: string) => void;
}

/** Approximate popover footprint (w-56 + fields) used to keep it inside the canvas. */
const POPOVER_W = 224;
const POPOVER_H = 140;
const POPOVER_MARGIN = 8;

function getDpr(): number {
  return Math.min(globalThis.devicePixelRatio || 1, 2);
}

/** Keep the create popover fully inside the canvas by clamping its anchor to the surface. */
function clampAnchor(point: Point, size: Size): Point {
  return {
    x: Math.max(POPOVER_MARGIN, Math.min(point.x, size.width - POPOVER_W - POPOVER_MARGIN)),
    y: Math.max(POPOVER_MARGIN, Math.min(point.y, size.height - POPOVER_H - POPOVER_MARGIN)),
  };
}

/** The live ghost rect for the in-flight gesture, or null when idle. */
function liveGhostRect(state: GestureState, view: Viewport): Rect | null {
  if (state.kind === 'creating') {
    const left = Math.min(state.originDay, state.currentDay);
    const right = Math.max(state.originDay, state.currentDay);
    return dayCellRect(left, right, state.laneIndex, view);
  }
  if (state.kind === 'repositioning') {
    // Free-2D (M4): the ghost tracks the live day column AND lane row under the pointer.
    return dayCellRect(
      state.currentStartDay,
      state.currentStartDay + state.spanDays,
      state.currentLaneIndex,
      view,
    );
  }
  return null;
}

/**
 * The activity a gesture is currently dragging or resizing (ADR-0054 §1) — the bar the scene dims
 * so its ghost reads as the bar itself moving rather than a second shape beside it. A `creating`
 * gesture has no source bar yet, and the link / LOE tools move nothing. Exported for unit tests.
 */
export function gestureSourceId(state: GestureState): string | null {
  return state.kind === 'repositioning' || state.kind === 'resizing' ? state.activityId : null;
}

/**
 * Full-fidelity detail for that gesture's ghost (ADR-0054 §1): the manipulated bar's own label,
 * progress and glyph, so the ghost looks like the thing being moved. A create has no activity to
 * describe yet, so it ghosts plain — there is nothing truthful to draw. Exported for unit tests.
 */
export function gestureGhostDetail(
  state: GestureState,
  lookup: (id: string) => RenderActivity | undefined,
): GhostDetail | null {
  const id = gestureSourceId(state);
  if (id === null) return null;
  const activity = lookup(id);
  if (!activity) return null;
  return {
    label: activity.label,
    ...(activity.percentComplete === undefined
      ? {}
      : { percentComplete: activity.percentComplete }),
    ...(isMilestone(activity.type) ? { milestone: true } : {}),
  };
}

/** The in-flight resize ghost + its live readout (ADR-0052 M2/M3), or null. A finish drag pins
 * the start (label = the tentative duration); a start drag pins the finish and moves the left
 * edge (label = the tentative start date + duration — the two numbers the planner is choosing).
 * Exported for unit tests (pure). */
export function liveResize(
  state: GestureState,
  view: Viewport,
  dataDate: string,
  isWorkingDay?: ((dayOffset: number) => boolean) | null,
): ResizeOverlay | null {
  if (state.kind !== 'resizing') return null;
  // The gesture tracks CANVAS COLUMNS; the duration the activity ends up with is counted in
  // WORKING days. Over a weekend those differ, so a raw column count in the chip would promise a
  // number the commit cannot deliver — the exact thing this readout exists to prevent. Converted
  // through the same helper the write uses, so the chip and the saved duration are one number.
  // Without a calendar (not loaded) the column count is all there is, which is today's behaviour.
  const drawnEnd = state.currentStartDay + state.currentDurationDays - 1;
  const days = `${drawnSpanPlacement(state.currentStartDay, drawnEnd, isWorkingDay ?? null).durationDays}d`;
  return {
    rect: dayCellRect(
      state.currentStartDay,
      state.currentStartDay + state.currentDurationDays - 1,
      state.laneIndex,
      view,
    ),
    label:
      state.edge === 'start'
        ? `${formatCalendarDate(addCalendarDays(dataDate, state.currentStartDay))} · ${days}`
        : days,
  };
}

/** The in-flight lag-anchor drag's readout chip (ADR-0052 M3), or null: the tentative anchor's
 * screen point (the FORWARD anchor mapping over the drag's own lag-calendar walk — the exact
 * inverse pair of the gesture's `lagFromAnchorDay`) plus a compact `SS + 3d` / `FS - 1d` label.
 * Exported for unit tests (pure). */
export function liveLag(state: GestureState, view: Viewport): LagOverlay | null {
  if (state.kind !== 'lagDragging') return null;
  const day = lagAnchorDay(
    state.predStartDay,
    state.predFinishDay,
    state.depType,
    state.currentLagDays,
    state.walk,
  );
  const n = state.currentLagDays;
  return {
    x: screenXOfDay(day, view),
    y: state.anchorY,
    label: `${state.depType} ${n < 0 ? '-' : '+'} ${Math.abs(n)}d`,
  };
}

/** Build the {@link LagGrab} context for a `lagAnchor` press (ADR-0052 M3): the edge's type/lag,
 * the predecessor's day span (the anchor walk's base), the lag-calendar-resolved walk, and the
 * anchor bar's centre y for the readout chip. Undefined when the edge or its bars aren't drawn. */
function lagGrabOf(
  edges: readonly RenderEdge[],
  activities: readonly RenderActivity[],
  dependencyId: string,
  view: Viewport,
  dataDate: string,
  planWalk: DayWalk,
): LagGrab | undefined {
  const edge = edges.find((e) => e.id === dependencyId);
  if (!edge) return undefined;
  const pred = activities.find((a) => a.id === edge.predecessorId);
  // The draggable (offset) anchor sits on the successor for FS/FF, the predecessor for SS/SF —
  // the same rule classifyHit used to report the zone.
  const anchorBarId =
    edge.type === 'FS' || edge.type === 'FF' ? edge.successorId : edge.predecessorId;
  const anchorBar = activities.find((a) => a.id === anchorBarId);
  if (!pred || pred.earlyStart === null || !anchorBar) return undefined;
  const rect = activityRect(anchorBar, view, dataDate);
  if (!rect) return undefined;
  const predStartDay = daysBetween(dataDate, pred.earlyStart);
  const predFinishDay =
    pred.earlyFinish === null ? predStartDay : daysBetween(dataDate, pred.earlyFinish);
  return {
    dependencyId,
    type: edge.type,
    lagDays: edge.lagDays ?? 0,
    predStartDay,
    predFinishDay,
    walk: edge.lagCalendar === 'TWENTY_FOUR_HOUR' ? ELAPSED_DAY_WALK : planWalk,
    anchorY: rect.y + rect.h / 2,
  };
}

/** The live dependency rubber-band (anchor → pointer + target highlight), or null when not linking.
 * When a target is hovered, its ring reflects link legality (ADR-0026 D5) computed from `edges`. */
function liveLink(
  state: GestureState,
  view: Viewport,
  activities: readonly RenderActivity[],
  dataDate: string,
  edges: readonly RenderEdge[],
): LinkOverlay | null {
  if (state.kind !== 'linking') return null;
  const source = activities.find((a) => a.id === state.sourceId);
  const sourceRect = source && activityRect(source, view, dataDate);
  if (!sourceRect) return null;
  const target = state.targetId ? activities.find((a) => a.id === state.targetId) : undefined;
  const targetRect = (target && activityRect(target, view, dataDate)) || null;
  const targetLegal =
    state.targetId === null
      ? true
      : linkLegality(state.sourceId, state.targetId, state.type, edges) === null;
  return {
    from: edgeAnchor(sourceRect, state.sourceHandle),
    to: state.point,
    targetRect,
    targetLegal,
  };
}

/** The picked-first-endpoint rect while a two-click tool waits for the second click — the `link` tool's
 * predecessor (M5) or the LOE tool's start driver (Stage D) — or null when not mid-pick. Drawn as a
 * highlight ring so the "now pick the second endpoint" step reads on the canvas. */
function linkPickRect(
  state: GestureState,
  view: Viewport,
  activities: readonly RenderActivity[],
  dataDate: string,
): Rect | null {
  const pickedId =
    state.kind === 'linkPicking'
      ? state.predecessorId
      : state.kind === 'loePicking'
        ? state.startId
        : null;
  if (pickedId === null) return null;
  const source = activities.find((a) => a.id === pickedId);
  return (source && activityRect(source, view, dataDate)) || null;
}

/** Build the body-grab (current day span + lane) the machine needs to reposition an activity. */
function bodyGrab(
  activities: readonly RenderActivity[],
  id: string,
  dataDate: string,
): BodyGrab | undefined {
  const a = activities.find((x) => x.id === id);
  if (!a || a.earlyStart === null) return undefined;
  const startDay = daysBetween(dataDate, a.earlyStart);
  const endDay = a.earlyFinish === null ? startDay : daysBetween(dataDate, a.earlyFinish);
  return { id, startDay, endDay, laneIndex: a.laneIndex };
}

/**
 * Reconcile one ruler row's label pool against a tick list: reuse/create absolutely-positioned
 * spans, position each at its band start (year/month bands clamp their label to the left edge so
 * the current period stays visible — "sticky"), and hide the surplus. No per-frame allocation
 * after warm-up, and no React — the whole ruler updates imperatively from the rAF loop (ADR-0026 D3).
 */
function syncRulerRow(
  row: HTMLDivElement,
  pool: HTMLSpanElement[],
  ticks: { x: number; label: string }[],
  clampLeft: boolean,
): void {
  for (let i = 0; i < ticks.length; i += 1) {
    let node = pool[i];
    if (!node) {
      node = document.createElement('span');
      node.style.position = 'absolute';
      node.style.left = '0';
      node.style.whiteSpace = 'nowrap';
      node.style.paddingInline = '3px';
      row.appendChild(node);
      pool[i] = node;
    }
    const left = clampLeft ? Math.max(0, ticks[i]!.x) : ticks[i]!.x;
    node.style.transform = `translateX(${left}px)`;
    node.textContent = ticks[i]!.label;
    node.style.display = '';
  }
  for (let i = ticks.length; i < pool.length; i += 1) pool[i]!.style.display = 'none';
}

/**
 * The Canvas 2D TSLD painter (ADR-0026). Draws the plan's computed schedule from the pure
 * render model, with cursor-anchored wheel zoom and drag-to-pan; the canvas is
 * **`aria-hidden`** (assistive tech uses the parallel representation in {@link TsldPanel}).
 *
 * **M2:** when `editing` is on, a second, pointer-transparent **interaction canvas** sits on
 * top and paints the live/pending edit ghost, and pointer-downs are routed through the pure
 * {@link reduce gesture machine}: in `add-activity` mode a drag draws a create ghost and emits
 * a `create` intent on release; in `select` mode a drag on a bar body starts a reposition ghost
 * that commits a `reposition` intent on drop (or selects the bar if it never moved), while empty
 * space keeps the M1 pan/select path. Committed edits go to `onIntent`; `TsldPanel` owns the
 * mutation + recalc (ADR-0026 D8). With `editing` off this is byte-for-byte the M1 read-only canvas.
 */
export function TsldCanvas({
  activities,
  edges,
  dataDate,
  selectedId,
  selectedIds,
  onSelect,
  onSelectRegion,
  fitSignal,
  editing = false,
  mode = 'select',
  createType,
  linkType,
  canReposition = false,
  canResize = false,
  canLag = false,
  canLink = false,
  onIntent,
  onLoeSpanStep,
  onLinkPickStep,
  dropLinkPickSignal = 0,
  linkPickPredecessorId = null,
  loePickStartId = null,
  onExitAddMode,
  pending = null,
  writeGhost = null,
  writeBusy = false,
  view,
  isWorkingDay = null,
  todayOffset = null,
  todayFraction = null,
  dimmedIds,
  barFill,
  barInk,
  baselineGhosts,
  flaggedIds,
  resourceStripActive = false,
  resourceStrip = null,
  controlRef,
  onZoomStopChange,
  wbsBandGroups = null,
  wbsBandHeightPx = 0,
  onSelectBandSummary,
}: TsldCanvasProps): React.ReactElement {
  // The painter draws from concrete resolved token colours (Canvas 2D `fillStyle` can't take a `var()`),
  // so the palette must re-resolve on a theme switch. `useThemeVersion` (the shared theme-mutation
  // counter, one source of truth) bumps then; an effect below re-resolves `paletteRef` + repaints. The
  // rAF loop reads the ref, so no per-frame work and no stale closure.
  const themeVersion = useThemeVersion();
  // The element whose scope the painter reads (ADR-0097 Landing E). Published as STATE by
  // `CanvasSurfaceProvider`, so this re-renders exactly once when the diagram's `<Surface>` mounts
  // and the palettes below re-resolve against the diagram's ground instead of the page's.
  const canvasSurface = useCanvasSurface();
  const paletteRef = useRef<TsldPalette | null>(null);
  paletteRef.current ??= resolveTsldPalette(canvasSurface);
  // The resource-strip layer (Stage E, ADR-0049): its own re-resolved palette (Canvas 2D can't take a
  // `var()`), the sibling band `<canvas>`, the published data snapshot (a ref — no per-frame React),
  // and a **separate** dirty flag set by DATA changes (picker/bucket/refetch/theme) so a strip-only
  // change never repaints the main scene. All inert when the strip is inactive (the parity gate).
  const stripPaletteRef = useRef<ResourceStripPalette | null>(null);
  stripPaletteRef.current ??= resolveResourceStripPalette(canvasSurface);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const stripCanvasRef = useRef<HTMLCanvasElement>(null);
  const stripRef = useRef<ResourceStripSnapshot | null>(resourceStrip);
  const stripDirtyRef = useRef(true);
  // The WBS band layer (ADR-0063) — the strip's trio reflected to the top of the container: its own
  // re-resolved palette, its own sibling `<canvas>`, its own dirty flag (so a groups-only change
  // never repaints the scene), plus the last frame's placed bars for the hit-test. All inert when
  // the band is off, which is the parity path.
  const wbsBandPaletteRef = useRef<WbsBandPalette | null>(null);
  wbsBandPaletteRef.current ??= resolveWbsBandPalette(canvasSurface);
  const wbsBandCanvasRef = useRef<HTMLCanvasElement>(null);
  const wbsBandDirtyRef = useRef(true);
  const wbsBandBarsRef = useRef<readonly WbsBandBar[]>([]);
  const wbsBandGroupsRef = useRef<readonly WbsBandGroup[] | null>(wbsBandGroups);
  const viewRef = useRef<Viewport>(DEFAULT_VIEWPORT);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const dirtyRef = useRef(true);
  const fittedRef = useRef(false);
  // Whether the surface is on-screen (an IntersectionObserver drives it below). When it's hidden —
  // the below-`md` Activities pane showing, so the diagram pane is `display:none` — the rAF loop
  // skips its paint/measure work (TECH_DEBT #30d). Defaults visible; where IntersectionObserver is
  // absent (jsdom) it stays visible, so the render path is unchanged under test.
  const visibleRef = useRef(true);

  // Live gesture + pending ghost drive the interaction layer; read by the rAF loop, so both
  // live in refs (per-frame writes must not go through setState — ADR-0026 D3).
  const gestureRef = useRef<GestureState>(IDLE);
  const gestureActiveRef = useRef(false);
  const interactionDirtyRef = useRef(true);
  // The idle-hovered bar's rect (ADR-0052 M4): published by the pointermove idle-hover branch
  // (which already classifies per move while the resize/lag zones are armed — no new hit-test)
  // and drawn as the hover ring on the interaction layer. Flag-off it is never written, so the
  // overlay stays byte-for-byte today's (the parity gate).
  const hoverRef = useRef<Rect | null>(null);
  // The last pointer position over the surface (ADR-0054 §2), for the cursor date readout. Written
  // per move (the readout tracks the pointer by design) but only ever read on the interaction
  // layer, which a move already repaints — so it adds no frame the surface was not drawing.
  // Flag-off nothing writes it and the overlay field stays null.
  const cursorPointRef = useRef<Point | null>(null);
  // The idle-hovered bar's id (ADR-0052 M5): published from the SAME classify as the hover rect
  // above, but into the SCENE (`TsldScene.hoverId`) — the base edge layer draws that bar's
  // incident links transiently highlighted, the pointer twin of the persistent selection
  // highlight (which stays the keyboard/AT-reachable equivalent, WCAG 2.1.1). A scene repaint is
  // marked only when the hovered BAR changes (never per move — the same discipline as the ring).
  // Flag-off the branch never runs, so the scene stays byte-for-byte today's (the parity gate).
  const hoverIdRef = useRef<string | null>(null);
  // The lag anchor drawing emphasised (ADR-0052 M3 discoverability fix): the hovered one, or the
  // one a `lagDragging` gesture holds. Published into the SCENE like `hoverId` (the handles live
  // on the base layer, above the bars), and written only when it actually changes — a scene
  // repaint per hovered-ANCHOR change, never per pointer move. Flag-off nothing writes it.
  const activeLagIdRef = useRef<string | null>(null);
  // The bar the in-flight gesture is dragging (ADR-0054 §1). Published into the SCENE (the bars
  // live on the base layer), so it is written — and the scene marked dirty — only when it actually
  // CHANGES: once when a drag arms and once when it drops, never per pointer move. Flag-off nothing
  // writes it, so the scene stays byte-for-byte today's (the parity gate).
  const gestureSourceIdRef = useRef<string | null>(null);
  // O(1) id→activity lookup for the per-move idle-hover branch (perf review): rebuilt only when
  // the activities ARRAY identity changes (a data rebuild), never per pointer move — a linear
  // `.find` per move over a 2,000-activity plan is avoidable per-frame work.
  const activityIndexRef = useRef<{
    list: readonly RenderActivity[];
    byId: ReadonlyMap<string, RenderActivity>;
  } | null>(null);
  const pendingRef = useRef<PendingGhost | null>(pending ?? writeGhost);
  // Read by the window key listener (set up once), so it sees the current mode/handler.
  const modeRef = useRef(mode);
  const exitAddModeRef = useRef(onExitAddMode);
  // Read by the window key listener (set up once) so an Escape that drops a pick can tell the shell,
  // which is otherwise left stating a pick the machine has already discarded.
  const linkPickStepRef = useRef(onLinkPickStep);
  useEffect(() => {
    modeRef.current = mode;
    exitAddModeRef.current = onExitAddMode;
    linkPickStepRef.current = onLinkPickStep;
  });

  // Edge handles are the flag-off edge-drag affordance. Canvas-first authoring (ADR-0032 M5) replaces
  // edge-drag with the two-click `link` tool, so the handles are suppressed there — no dangling
  // rubber-band path when the flag is on. `canLink` still gates whether linking is offered at all.
  // Under direct manipulation (ADR-0052 §1) the bar ends are repurposed as RESIZE handles, so the
  // selected-bar edge marks advertise resize instead (and the painter suppresses them for
  // resize-ineligible types); flag-off keeps today's expression byte-for-byte.
  const showEdgeHandles = CANVAS_DIRECT_MANIPULATION_ENABLED
    ? editing && canResize
    : editing && canLink && !CANVAS_AUTHORING_ENABLED;
  // Whether a bar-end press/hover means "resize" (ADR-0052 M2/M3): flag + editing + Select tool +
  // a wired handler. Build-time flag first, so flag-off short-circuits to false with zero extra
  // work. `lagArmed` is the same gate for the drawn lag-anchor grab zones (M3) — and, since the
  // fix, for the painted handles that advertise them, so the affordance and the target appear and
  // disappear together (a read-only surface gets neither).
  const resizeArmed =
    CANVAS_DIRECT_MANIPULATION_ENABLED && editing && mode === 'select' && canResize;
  const lagArmed = CANVAS_DIRECT_MANIPULATION_ENABLED && editing && mode === 'select' && canLag;
  /**
   * Whether the pointer-transparent **interaction** canvas is mounted.
   *
   * It was `editing` alone, which was right while every gesture that drew on it was a write. The
   * marquee is not one: selecting is a read (the ADR-0063 M4b rule), so a Viewer can arm the tool
   * and sweep — and gated on `editing` the sweep would be invisible to exactly the person who has
   * no other feedback on this canvas. Flag-off the expression is `editing`, so the read-only
   * surface is byte-for-byte today's.
   */
  const interactionLayerMounted = editing || CANVAS_MULTI_SELECT_ENABLED;
  // Ground, not data: the flag decides whether the band layer paints at all, so flag-off the scene
  // carries no `monthBands` and the frame is byte-for-byte today's (ADR-0055 §4). The user's own
  // `view?.monthBands` preference (F7b, `VITE_CANVAS_TIME_AXIS`) only narrows the flag-on case — it
  // never widens flag-off, which is what keeps the parity claim structural. Hoisted to one
  // expression (component-review finding) so the initial scene ref and the resync effect below
  // can't drift out of step.
  const monthBandsEnabled = CANVAS_VISUAL_LANGUAGE_ENABLED && (view?.monthBands ?? true);
  // Same shape for the data-date line (canvas status & feedback M1): the flag decides whether the
  // status layer exists at all — flag-off the scene carries no `dataDateLine` and the frame is
  // byte-for-byte today's — while the user's `View▾` preference only narrows the flag-on case.
  // The painter stays flag-free, as every other layer does.
  const dataDateLineEnabled = CANVAS_DATA_DATE_ENABLED && (view?.dataDate ?? true);
  const sceneRef = useRef<TsldScene>({
    activities,
    edges,
    dataDate,
    selectedId,
    selectedIds,
    showEdgeHandles,
    view,
    isWorkingDay,
    todayOffset,
    todayFraction,
    monthBands: monthBandsEnabled,
    dataDateLine: dataDateLineEnabled,
    // Flag decides whether the three-tier grid paints at all: flag-off the scene carries no
    // `gridTiers` and the frame is byte-for-byte today's single `gridLine` pass (F5).
    gridTiers: CANVAS_TIME_AXIS_ENABLED,
    dimmedIds,
    barFill,
    barInk,
    baselineGhosts,
    flaggedIds,
    // Time-true link anchoring + arrowheads (ADR-0052 M1). A build-time constant, so it never
    // re-triggers the scene effect; flag-off the painter keeps today's routing byte-for-byte.
    timeTrueLinks: CANVAS_DIRECT_MANIPULATION_ENABLED,
    // The M4 bar visual refresh rides the SAME env flag (one flag, one flag-off parity gate);
    // its own scene field keeps the two render changes independently testable in the painter.
    visualRefresh: CANVAS_DIRECT_MANIPULATION_ENABLED,
    // Obstacle-aware link corridors (ADR-0064 M2). A build-time constant like its siblings; flag-off
    // the painter builds no interval index and the geometry takes its no-obstacle default, which is
    // today's line point-for-point.
    linkRouting: CANVAS_LINK_ROUTING_ENABLED,
    // M5 hover-driven incident-link highlight — null until the idle-hover branch publishes.
    hoverId: null,
    // The visible lag-anchor handles ride the SAME gate as their grab zones (`lagArmed`), so the
    // picture never advertises a drag the surface can't perform; `activeLagId` is null until a
    // hover / drag emphasises one.
    lagHandles: lagArmed,
    activeLagId: null,
    // The bar a gesture is dragging (ADR-0054 §1) — null until a gesture arms one.
    gestureSourceId: null,
  });

  /**
   * Publish the bar the in-flight gesture is dragging into the SCENE (ADR-0054 §1), mirroring
   * {@link setActiveLagId}: written — and the scene marked dirty — only when it actually changes,
   * so a drag costs exactly two scene repaints (arm and drop), never one per pointer move. Called
   * after every `gestureRef` transition; flag-off it is a permanent no-op (the id stays null).
   */
  const syncGestureSource = (): void => {
    const id = CANVAS_LIVE_FEEDBACK_ENABLED ? gestureSourceId(gestureRef.current) : null;
    if (gestureSourceIdRef.current === id) return;
    gestureSourceIdRef.current = id;
    sceneRef.current = { ...sceneRef.current, gestureSourceId: id };
    dirtyRef.current = true;
  };

  const activityById = (id: string): RenderActivity | undefined => {
    const list = sceneRef.current.activities;
    let index = activityIndexRef.current;
    if (!index || index.list !== list) {
      index = { list, byId: new Map(list.map((a) => [a.id, a])) };
      activityIndexRef.current = index;
    }
    return index.byId.get(id);
  };

  // The date-ruler overlay is updated imperatively from the rAF loop off `viewRef` (ADR-0026 D3 —
  // no per-frame setState). Row containers + reusable element pools live in refs; `rulerSyncRef`
  // snapshots the last synced view so the loop reconciles only when the viewport actually moved.
  const rulerYearsRef = useRef<HTMLDivElement>(null);
  const rulerMonthsRef = useRef<HTMLDivElement>(null);
  const rulerDaysRef = useRef<HTMLDivElement>(null);
  const rulerPoolRef = useRef<{
    years: HTMLSpanElement[];
    months: HTMLSpanElement[];
    days: HTMLSpanElement[];
  }>({ years: [], months: [], days: [] });
  const rulerSyncRef = useRef({ pxPerDay: 0, originX: 0, width: 0 });
  // Coarse active-preset feedback: report only when the zoom STOP changes, never per frame.
  const lastStopRef = useRef<ZoomLevel | null>(null);
  const onZoomStopChangeRef = useRef(onZoomStopChange);
  useEffect(() => {
    onZoomStopChangeRef.current = onZoomStopChange;
  });

  useEffect(() => {
    fittedRef.current = false;
    dirtyRef.current = true;
  }, [fitSignal, dataDate]);

  useEffect(() => {
    sceneRef.current = {
      activities,
      edges,
      dataDate,
      selectedId,
      selectedIds,
      showEdgeHandles,
      view,
      isWorkingDay,
      todayOffset,
      todayFraction,
      monthBands: monthBandsEnabled,
      dataDateLine: dataDateLineEnabled,
      // Flag decides whether the three-tier grid paints at all: flag-off the scene carries no
      // `gridTiers` and the frame is byte-for-byte today's single `gridLine` pass (F5).
      gridTiers: CANVAS_TIME_AXIS_ENABLED,
      dimmedIds,
      barFill,
      barInk,
      baselineGhosts,
      flaggedIds,
      timeTrueLinks: CANVAS_DIRECT_MANIPULATION_ENABLED,
      visualRefresh: CANVAS_DIRECT_MANIPULATION_ENABLED,
      linkRouting: CANVAS_LINK_ROUTING_ENABLED,
      // Preserve the live hover highlight across a data/selection rebuild (M5) — the pointer
      // hasn't moved, so the hovered bar's ties should not flicker off. Flag-off this is
      // always null (the branch that writes it never runs), keeping the scene byte-identical.
      hoverId: hoverIdRef.current,
      lagHandles: lagArmed,
      // Preserved across a rebuild for the same reason as `hoverId`: the pointer hasn't moved (and
      // a drag may be in flight), so the emphasised handle must not blink back to rest.
      activeLagId: activeLagIdRef.current,
      // Preserved across a data/selection rebuild for the same reason as `hoverId` — a drag may be
      // in flight, and the source bar must not blink back to full strength mid-gesture.
      gestureSourceId: gestureSourceIdRef.current,
    };
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
  }, [
    activities,
    edges,
    dataDate,
    selectedId,
    selectedIds,
    showEdgeHandles,
    lagArmed,
    view,
    monthBandsEnabled,
    dataDateLineEnabled,
    isWorkingDay,
    todayOffset,
    todayFraction,
    dimmedIds,
    barFill,
    barInk,
    baselineGhosts,
    flaggedIds,
  ]);

  // Report the active preset when the zoom stop crosses a boundary (called at the pxPerDay-changing
  // sites only). Kept off the per-frame path since pan never changes pxPerDay.
  const reportZoomStop = (): void => {
    const level = presetOf(
      viewRef.current.pxPerDay,
      sizeRef.current.width,
      CANVAS_TIME_AXIS_ENABLED,
    );
    if (level !== lastStopRef.current) {
      lastStopRef.current = level;
      onZoomStopChangeRef.current?.(level);
    }
  };

  useImperativeHandle(
    controlRef,
    () => ({
      zoomToPreset: (level: ZoomLevel) => {
        viewRef.current = zoomToPreset(
          viewRef.current,
          sizeRef.current,
          level,
          CANVAS_TIME_AXIS_ENABLED,
          RESOLVED_MAX_PX_PER_DAY,
        );
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
        reportZoomStop();
      },
      stepZoom: (factor: number) => {
        viewRef.current = stepZoom(
          viewRef.current,
          sizeRef.current,
          factor,
          RESOLVED_MAX_PX_PER_DAY,
        );
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
        reportZoomStop();
      },
      goToDate: (iso: string) => {
        // Pure pan (scale untouched, so it never crosses a zoom stop → no `reportZoomStop`); a view
        // jump only — no fetch, no persisted state, no schedule change (ADR-0033 "Go to date").
        viewRef.current = panToDate(
          viewRef.current,
          sceneRef.current.dataDate,
          iso,
          GOTO_LEFT_INSET,
        );
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
      },
      centerOnDate: (iso: string) => {
        // Centred variant of `goToDate` (canvas nav): the target day lands at the surface's horizontal
        // centre (inset = half the measured width) rather than the left inset. Pure pan, same guarantees.
        viewRef.current = panToDate(
          viewRef.current,
          sceneRef.current.dataDate,
          iso,
          sizeRef.current.width / 2,
        );
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
      },
      zoomToActivity: (id: string): boolean => {
        const size = sizeRef.current;
        // An unmeasured canvas has no width to divide by, so every derived scale would be garbage.
        if (size.width <= 1) return false;
        const activity = sceneRef.current.activities.find((a) => a.id === id);
        if (!activity || activity.earlyStart === null) return false;
        // It IS `fitToContent`, handed a one-element array — not a second implementation of "frame
        // these". A parallel one would drift from `Fit to plan` about padding and the lane axis, and
        // the drift would only ever be visible to someone using both on the same plan.
        //
        // Two clamps, each for its own reason:
        //  - MIN_CONTEXT_DAYS, because a milestone has zero span and `fitToContent` would frame it to
        //    nothing; a bar with no surrounding days is also unreadable as a *position* in a plan.
        //  - the `day` preset's scale, because zooming past the finest preset leaves `presetOf`
        //    unable to name the result and the zoom control silently misreports where you are
        //    (ADR-0056: a preset is the vocabulary, not just a button).
        const framed = withMinimumSpan(activity, sceneRef.current.dataDate, MIN_CONTEXT_DAYS);
        viewRef.current = fitToContent(
          framed,
          size,
          sceneRef.current.dataDate,
          Math.min(RESOLVED_MAX_PX_PER_DAY, pxPerDayForPreset('day', size.width)),
        );
        // The command owns the scale from here — a later resize preserves it (ADR-0056 M2).
        fittedRef.current = true;
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
        reportZoomStop();
        return true;
      },
      // A pure read of the live viewport (transform + measured size) for the current-view PNG export.
      // Returns copies so a caller can't mutate the rAF-owned refs; never repaints the live canvas.
      getViewport: () => ({ view: { ...viewRef.current }, size: { ...sizeRef.current } }),
    }),
    // Stable — reads live state through refs.
    [],
  );

  // Focus-follows-viewport (M5, WCAG 2.4.7/2.4.11): when the selection changes — e.g. keyboard
  // navigation or chain-nav to an off-screen bar — pan the minimum distance so the selected bar's
  // ring is fully on-screen, kept off the edges by a margin so nothing obscures it. A no-op when
  // it's already visible (so pointer selection doesn't jump), or when it has no drawn position.
  useEffect(() => {
    if (!selectedId) return;
    // Skip while a (re-)fit is pending: the next frame reframes the whole plan and would discard
    // this pan anyway, so revealing off the pre-fit viewport is pointless (and would flicker).
    if (!fittedRef.current) return;
    const size = sizeRef.current;
    if (size.width <= 1) return; // not measured yet
    const activity = activities.find((a) => a.id === selectedId);
    // A selected summary is not in the SCENE when the band is on (ADR-0063 §4) — it is a band bar.
    // The band is top-pinned, so it never needs revealing vertically, but it still scrolls out of
    // the viewport horizontally, and a keyboard user arrowing onto an off-screen phase would
    // otherwise be told nothing moved.
    const bandBar =
      !activity && selectedId !== null && wbsBandHeightPx > 0
        ? (wbsBandBarsRef.current.find((b) => b.id === selectedId) ?? null)
        : null;
    const rect = activity
      ? activityRect(activity, viewRef.current, dataDate)
      : bandBar
        ? { x: bandBar.x, y: 0, w: bandBar.w, h: 0 }
        : null;
    if (!rect) return;
    const margin = LANE_HEIGHT;
    const reveal = (start: number, span: number, extent: number): number => {
      if (start < margin) return margin - start;
      if (start + span > extent - margin) {
        // If it's larger than the viewport, align its start; else pan just enough to fit the end.
        return span > extent - 2 * margin ? margin - start : extent - margin - (start + span);
      }
      return 0;
    };
    const dx = reveal(rect.x, rect.w, size.width);
    // A band bar has no vertical position in the scene, so only the horizontal pan applies.
    const dy = bandBar ? 0 : reveal(rect.y, rect.h, size.height);
    if (dx !== 0 || dy !== 0) {
      viewRef.current = pan(viewRef.current, dx, dy);
      dirtyRef.current = true;
      interactionDirtyRef.current = true;
    }
  }, [selectedId, activities, dataDate, wbsBandHeightPx]);

  // Publish the held ghost to the loop. The create ghost and the write ghost share the one overlay
  // slot (they are mutually exclusive — see the prop docs), so the in-flight write keeps its
  // optimistic picture even though it no longer rides the `pending` gate. The Escape handler's
  // "no ghost pending" check reads this same ref, so its behaviour is byte-for-byte the old
  // single-prop gate's in both states.
  useEffect(() => {
    pendingRef.current = pending ?? writeGhost;
    interactionDirtyRef.current = true;
  }, [pending, writeGhost]);

  // Publish the resource-strip snapshot to the loop (Stage E, ADR-0049). Writing it marks ONLY the
  // strip dirty (`stripDirtyRef`) — never `dirtyRef` — so a picker/bucket/refetch change repaints the
  // strip band WITHOUT repainting the main scene (the two-dirty-flag decoupling). Inert when the strip
  // is inactive (nothing reads `stripRef` then), so this never affects the scene paint (parity).
  useEffect(() => {
    stripRef.current = resourceStrip;
    stripDirtyRef.current = true;
  }, [resourceStrip]);

  // Publish the band's groups to the loop, marking ONLY the band dirty — the two-dirty-flag
  // decoupling the strip established, for the same reason: a membership change must not cost the
  // scene a repaint. Inert when the band is off (nothing reads the ref then).
  useEffect(() => {
    wbsBandGroupsRef.current = wbsBandGroups;
    wbsBandDirtyRef.current = true;
  }, [wbsBandGroups]);

  // Switching tools drops any in-progress gesture ghost — most importantly an unfinished link pick
  // (M5), so leaving the Link tool mid-pick never leaves a dangling highlight ring.
  useEffect(() => {
    if (gestureRef.current.kind !== 'idle') {
      gestureRef.current = IDLE;
      syncGestureSource();
      gestureActiveRef.current = false;
      interactionDirtyRef.current = true;
    }
  }, [mode]);

  // Single-source the LOE tool's picked start across modalities (Stage D, B3): the pick lives in
  // `TsldPanel`'s controlled `loePickStartId`; SEED the internal gesture from it so a keyboard-side
  // pick makes the next pointer click resolve as the SECOND pick (not a silent restart that discards
  // the keyboard pick). Runs AFTER the mode-reset effect above, so on arming (`mode → 'loe'`, pick
  // null) it leaves the gesture idle. The pointer→state direction feeds back here harmlessly — the
  // gesture already matches, so this is a no-op. Only touches the gesture in `loe` mode.
  useEffect(() => {
    if (mode !== 'loe') return;
    if (loePickStartId) {
      const g = gestureRef.current;
      if (g.kind !== 'loePicking' || g.startId !== loePickStartId) {
        gestureRef.current = { kind: 'loePicking', startId: loePickStartId };
        interactionDirtyRef.current = true;
      }
    } else if (gestureRef.current.kind === 'loePicking') {
      // The pick was cleared (Escape / cancel / commit) — drop the stale ring.
      gestureRef.current = IDLE;
      syncGestureSource();
      interactionDirtyRef.current = true;
    }
  }, [loePickStartId, mode]);

  // Seed the internal gesture from the shell's picked predecessor, so the keyboard pick (listbox
  // Enter) and the pointer pick are ONE state (ADR-0064 T6) — the `loePickStartId` precedent.
  useEffect(() => {
    if (mode !== 'link') return;
    const g = gestureRef.current;
    if (linkPickPredecessorId) {
      if (g.kind !== 'linkPicking' || g.predecessorId !== linkPickPredecessorId) {
        gestureRef.current = { kind: 'linkPicking', predecessorId: linkPickPredecessorId };
        syncGestureSource();
        interactionDirtyRef.current = true;
      }
      return;
    }
    if (g.kind === 'linkPicking') {
      gestureRef.current = IDLE;
      syncGestureSource();
      interactionDirtyRef.current = true;
    }
    // `syncGestureSource` is redefined per render and is deliberately not a dependency.
  }, [linkPickPredecessorId, mode]);

  // Drop an open link pick on the shell's signal (ADR-0064 T7). Skips the initial render — a `0`
  // signal means "nothing has asked yet", not "drop now" — and leaves the tool armed, because the
  // planner did not ask to stop linking; the schedule moved underneath them.
  const droppedPickSignalRef = useRef(dropLinkPickSignal);
  useEffect(() => {
    if (dropLinkPickSignal === droppedPickSignalRef.current) return;
    droppedPickSignalRef.current = dropLinkPickSignal;
    if (gestureRef.current.kind !== 'linkPicking') return;
    gestureRef.current = IDLE;
    syncGestureSource();
    interactionDirtyRef.current = true;
    linkPickStepRef.current?.(null);
    // `syncGestureSource` is a plain function redefined each render and is intentionally not a
    // dependency: this effect must run on a signal change and nothing else.
  }, [dropLinkPickSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let raf = 0;
    // The size actually WRITTEN to the canvas backing stores, tracked per loop-init rather than
    // compared against `sizeRef`.
    //
    // This is the fix for a canvas that looked dead while editing. The interaction canvas is mounted
    // by `editing` flipping true — i.e. it appears *after* the last measure, unsized (a default
    // 300×150 backing store) — while the container's own size has not changed. Comparing against
    // `sizeRef` therefore skipped the whole body, so the new canvas kept that default: the loop went
    // on painting ghosts, the cursor guideline and the resize readout onto a surface a fraction of
    // the size it was addressing, and everything past ~300px simply landed off it. Taking the pen
    // and drawing produced no visible bar; resizing the window (the one thing that does change the
    // container) silently "fixed" it, which is what made it look intermittent.
    //
    // Resetting per init makes the first measure after any (re-)mount always apply.
    let applied: Size = { width: 0, height: 0 };

    const measure = (): void => {
      const rect = container.getBoundingClientRect();
      // The canvas sits below the ruler band, so its drawable height is the container minus the ruler —
      // and, when the resource strip is active (Stage E, ADR-0049), minus the strip band at the bottom,
      // exactly as the ruler is subtracted from the top. Inactive ⇒ `stripBand` is 0, so the height
      // expression is byte-for-byte today's `rect.height - RULER_HEIGHT` (the parity gate).
      const stripBand = resourceStripActive ? RESOURCE_STRIP_HEIGHT : 0;
      // The WBS band (ADR-0063) reserves at the TOP, so it joins the ruler in `sceneTopOffset` —
      // `wbsBandHeightPx` is 0 when the band is off, which is what keeps this expression
      // byte-for-byte the pre-band `rect.height - RULER_HEIGHT - stripBand`.
      const size = {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height - sceneTopOffset(wbsBandHeightPx) - stripBand),
      };
      if (size.width !== applied.width || size.height !== applied.height) {
        applied = size;
        sizeRef.current = size;
        const dpr = getDpr();
        for (const c of [canvas, interactionCanvasRef.current]) {
          if (!c) continue;
          c.width = Math.round(size.width * dpr);
          c.height = Math.round(size.height * dpr);
          c.style.width = `${size.width}px`;
          c.style.height = `${size.height}px`;
        }
        // The strip band mirrors the scene canvas's DPR/backing-store sizing but keeps its FIXED band
        // height (only its width follows the container). Only when the band is mounted (active).
        const strip = stripCanvasRef.current;
        if (strip) {
          strip.width = Math.round(size.width * dpr);
          strip.height = Math.round(RESOURCE_STRIP_HEIGHT * dpr);
          strip.style.width = `${size.width}px`;
          strip.style.height = `${RESOURCE_STRIP_HEIGHT}px`;
          stripDirtyRef.current = true;
        }
        // The WBS band mirrors that exactly, keeping its own fixed band height (ADR-0063).
        const wbsBand = wbsBandCanvasRef.current;
        if (wbsBand) {
          wbsBand.width = Math.round(size.width * dpr);
          wbsBand.height = Math.round(wbsBandHeightPx * dpr);
          wbsBand.style.width = `${size.width}px`;
          wbsBand.style.height = `${wbsBandHeightPx}px`;
          wbsBandDirtyRef.current = true;
        }
        // Preserve the current viewport (pan + pxPerDay) across a surface resize — only the
        // backing store grows/shrinks and we repaint. Re-fitting here made the diagram "jump"
        // on every tick of a container resize (e.g. dragging the activity panel up/down —
        // ADR-0030). Explicit Fit and a dataDate change still re-frame via `fitSignal` (above);
        // mount fits once because `fittedRef` starts false.
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
      }
    };

    const syncRuler = (): void => {
      const years = rulerYearsRef.current;
      const months = rulerMonthsRef.current;
      const days = rulerDaysRef.current;
      if (!years || !months || !days) return;
      const v = viewRef.current;
      const s = sizeRef.current;
      const last = rulerSyncRef.current;
      // Only re-tile when the viewport actually moved (pan changes originX every frame; idle skips).
      if (v.pxPerDay === last.pxPerDay && v.originX === last.originX && s.width === last.width)
        return;
      rulerSyncRef.current = { pxPerDay: v.pxPerDay, originX: v.originX, width: s.width };
      const model = rulerTicks(v, s, sceneRef.current.dataDate);
      const pools = rulerPoolRef.current;
      syncRulerRow(years, pools.years, model.years, true);
      syncRulerRow(months, pools.months, model.months, true);
      syncRulerRow(days, pools.days, model.days, false);
    };

    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      // Skip all paint/measure work while the surface is hidden (e.g. the below-`md` Activities pane
      // is showing, so the diagram pane is `display:none`, or the canvas is scrolled off-screen):
      // otherwise the loop keeps painting an unseen canvas every frame (TECH_DEBT #30d). Visibility
      // comes from the IntersectionObserver below; where that API is absent (jsdom) it stays visible.
      if (!visibleRef.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = sizeRef.current;
      const dpr = getDpr();
      if (!fittedRef.current && size.width > 1) {
        const withDates = sceneRef.current.activities.some((a) => a.earlyStart !== null);
        viewRef.current = withDates
          ? fitToContent(
              sceneRef.current.activities,
              size,
              sceneRef.current.dataDate,
              RESOLVED_MAX_PX_PER_DAY,
            )
          : DEFAULT_VIEWPORT;
        fittedRef.current = true;
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
        reportZoomStop();
      }
      // Snapshot before the paint clears it: everything that moves the selection anchor (pan, zoom,
      // resize, selection change) also sets `dirtyRef`, so we recompute the anchor only on those
      // frames — never on the many idle frames of a held selection (perf review).
      const movedThisFrame = dirtyRef.current;
      if (dirtyRef.current) {
        paintScene(ctx, sceneRef.current, viewRef.current, size, paletteRef.current!, dpr);
        dirtyRef.current = false;
      }
      // Keep the date ruler pixel-synced to the same viewport snapshot the painter just used, so the
      // labels and the bars can never disagree. Early-returns unless the viewport actually moved.
      syncRuler();
      const ictx = interactionLayerMounted ? interactionCanvasRef.current?.getContext('2d') : null;
      if (ictx && interactionDirtyRef.current) {
        const p = pendingRef.current;
        const overlay: InteractionOverlay = {
          live: liveGhostRect(gestureRef.current, viewRef.current),
          pending: p ? dayCellRect(p.startDay, p.endDay, p.laneIndex, viewRef.current) : null,
          link: liveLink(
            gestureRef.current,
            viewRef.current,
            sceneRef.current.activities,
            sceneRef.current.dataDate,
            sceneRef.current.edges,
          ),
          linkPick: linkPickRect(
            gestureRef.current,
            viewRef.current,
            sceneRef.current.activities,
            sceneRef.current.dataDate,
          ),
          // Bar-end resize ghost + live readout (ADR-0052 M2/M3), and the lag-drag readout chip
          // (M3). Both null except while their gesture is active, so every other frame paints
          // byte-for-byte as before.
          resize: liveResize(
            gestureRef.current,
            viewRef.current,
            sceneRef.current.dataDate,
            sceneRef.current.isWorkingDay,
          ),
          lag: liveLag(gestureRef.current, viewRef.current),
          // M4 refresh: restyled ghosts + the idle-hover ring (suppressed while a gesture is in
          // flight — the ghost is the live affordance then). Flag-off both fields are inert
          // (`visualRefresh` false, `hover` never written) ⇒ byte-for-byte today's overlay.
          visualRefresh: CANVAS_DIRECT_MANIPULATION_ENABLED,
          hover: gestureActiveRef.current ? null : hoverRef.current,
          // Live feedback (ADR-0054 §1): the ghost carries the dragged bar's own label, progress
          // and glyph. Null off-flag and whenever no bar is being manipulated (a create has none),
          // so the ghost falls back to the ADR-0052 treatment byte-for-byte.
          ghost: CANVAS_LIVE_FEEDBACK_ENABLED
            ? gestureGhostDetail(gestureRef.current, activityById)
            : null,
          // The cursor date readout (ADR-0054 §2). The day comes from the gesture where one is in
          // flight — so the chip states the date that will be COMMITTED, not the pixel under the
          // pointer — and from the pointer's own column when idle.
          cursor: CANVAS_LIVE_FEEDBACK_ENABLED
            ? cursorReadout({
                state: gestureRef.current,
                point: cursorPointRef.current,
                view: viewRef.current,
                dataDate: sceneRef.current.dataDate,
              })
            : null,
          // The live marquee sweep (M2-T5). Read straight off the gesture state, which keeps raw
          // screen points — so the rectangle drawn is the rectangle the release will resolve, with
          // no second derivation that could disagree at the boundary. Null in every other state.
          marquee:
            CANVAS_MULTI_SELECT_ENABLED && gestureRef.current.kind === 'marqueeing'
              ? rectFromCorners(gestureRef.current.originPoint, gestureRef.current.currentPoint)
              : null,
        };
        paintInteractionLayer(ictx, overlay, size, paletteRef.current!, dpr);
        interactionDirtyRef.current = false;
      }
      // Layer 3 — the resource strip (Stage E, ADR-0049). Painted from the SAME `viewRef` snapshot the
      // scene just used, so the demand bars stay pixel-aligned under the diagram columns at every frame.
      // Repaint when the viewport moved (`movedThisFrame`, shared with the scene — the strip re-aligns
      // for free) OR the data changed (`stripDirtyRef`). Only when the band is active — otherwise the
      // loop does no strip work at all (byte-for-byte today's paint).
      if (resourceStripActive) {
        const sctx = stripCanvasRef.current?.getContext('2d');
        if (sctx && (movedThisFrame || stripDirtyRef.current)) {
          paintResourceStrip(
            sctx,
            stripRef.current,
            viewRef.current,
            { width: size.width, height: RESOURCE_STRIP_HEIGHT },
            stripPaletteRef.current!,
            dpr,
          );
          stripDirtyRef.current = false;
        }
      }
      // Layer 4 — the WBS band (ADR-0063). Same `viewRef` snapshot the scene just used, so the
      // band's columns sit over the diagram's by construction; same repaint condition as the strip
      // (viewport moved OR groups/theme changed). `wbsBandBarsRef` keeps the placed bars for the
      // hit-test, so a click re-uses the frame's geometry rather than re-deriving it.
      const bandGroups = wbsBandGroupsRef.current;
      if (bandGroups !== null && wbsBandHeightPx > 0) {
        const bctx = wbsBandCanvasRef.current?.getContext('2d');
        if (bctx && (movedThisFrame || wbsBandDirtyRef.current)) {
          const bandSize = { width: size.width, height: wbsBandHeightPx };
          const bars = wbsBandBars(
            bandGroups,
            sceneRef.current.dataDate,
            viewRef.current,
            bandSize,
          );
          wbsBandBarsRef.current = bars;
          paintWbsBand(
            bctx,
            bars,
            sceneRef.current.selectedId ?? null,
            bandSize,
            wbsBandPaletteRef.current!,
            dpr,
          );
          wbsBandDirtyRef.current = false;
        }
      }
    };

    measure();
    frame();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(container);

    // Pause the render loop when the surface is off-screen (hidden pane / scrolled away), and re-arm
    // a repaint the moment it returns (TECH_DEBT #30d). No-op where IntersectionObserver is absent.
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            const visible = entry?.isIntersecting ?? true;
            visibleRef.current = visible;
            if (visible) {
              dirtyRef.current = true;
              interactionDirtyRef.current = true;
            }
          })
        : null;
    io?.observe(container);

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = zoomAt(
        viewRef.current,
        e.clientX - rect.left,
        e.deltaY < 0 ? 1.1 : 1 / 1.1,
        RESOLVED_MAX_PX_PER_DAY,
      );
      dirtyRef.current = true;
      interactionDirtyRef.current = true;
      reportZoomStop();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Esc cancels an in-flight edit gesture; if none is active, it exits add-activity mode
    // back to Select (unless a create popover is open — that owns its own Esc).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // **An Escape typed into a text field belongs to that field**
      // (`docs/specs/canvas-search-navigation/` §4.5, M1-T4). This listener is on `window`, so
      // before the search field existed it fired wherever focus was — and with a tool armed, a
      // planner refining their search query lost the tool to a keystroke they aimed at the text.
      // That is the ADR-0064 defect class exactly, and it was live: the flag-on journey found it.
      //
      // The guard, not `stopPropagation` from the field: the toolbar is portalled into the chrome
      // band (ADR-0055 S2), so whether a React handler's `stopPropagation` reaches a `window`
      // listener depends on the native bubble path through the portal target — an assumption the
      // spec refuses to make (C15). This is the third consumer of the pattern
      // `use-plan-workspace-key-scope.ts` already uses for `?`.
      //
      // Deliberately about text ENTRY, not "anything that is not the canvas": Escape typed on a
      // toolbar button does not mean "undo my typing", so the tool contract still applies there.
      //
      // Flag-gated, because flag-off must be byte-for-byte the prior behaviour — including this
      // listener (spec §4.8, the rollback contract).
      if (CANVAS_SEARCH_NAV_ENABLED) {
        const target = e.target;
        if (
          target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"]')
        ) {
          return;
        }
      }
      if (gestureActiveRef.current) {
        gestureActiveRef.current = false;
        gestureRef.current = reduce(
          gestureRef.current,
          { type: 'escape' },
          { mode: 'select', view: viewRef.current, dataDate: sceneRef.current.dataDate },
        ).state;
        syncGestureSource();
        interactionDirtyRef.current = true;
      } else if (gestureRef.current.kind === 'linkPicking') {
        // First Escape drops an unfinished link pick (M5) — the tool stays armed for another try.
        gestureRef.current = IDLE;
        syncGestureSource();
        interactionDirtyRef.current = true;
        linkPickStepRef.current?.(null);
      } else if (CANVAS_MULTI_SELECT_ENABLED && modeRef.current === 'marquee') {
        // The marquee is the one tool mode **not** gated on `editing` — selecting is a read, so a
        // Viewer can arm it. Its disarm must be ungated for the same reason, or the tool arms for a
        // reader who then has no way out of it: the plan's "arming a mode nobody can leave" risk,
        // which the `editing &&` below would have produced by inheritance rather than by decision.
        exitAddModeRef.current?.();
      } else if (
        editing &&
        (modeRef.current === 'add-activity' ||
          modeRef.current === 'link' ||
          modeRef.current === 'loe') &&
        !pendingRef.current
      ) {
        // With no pick/ghost pending, Escape leaves the authoring tool back to Select. For the LOE tool
        // this fires even mid-pick (its `loePicking` isn't caught above), so Escape both cancels the
        // pick and disarms the tool (Stage D spec: "Escape cancels and disarms").
        exitAddModeRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
    // `resourceStripActive` re-inits the loop when the strip toggles (like `editing`) so `measure()`
    // re-reserves the band height and re-sizes the strip canvas; a stable `false` (inactive/flag-off)
    // never changes, so the loop init is byte-for-byte today's (the parity gate).
    //
    // `wbsBandHeightPx` is here for exactly the same reason and is the more dangerous of the two:
    // it feeds `measure()`'s scene height AND the band canvas's backing store, so without it a
    // band toggle would leave the scene sized for the wrong offset — the canvas would look right
    // and every pointer y would be out by the band's height. It is a stable `0` when the band is
    // off, so the flag-off loop init is unchanged.
    // `editing` as well as `interactionLayerMounted`: the two were the same expression until the
    // marquee made the layer mount without the pen, and this effect's Escape handler still reads
    // `editing` to decide whether an authoring tool may be disarmed. Dropping it would have closed
    // over the value from the render that first mounted the layer.
  }, [interactionLayerMounted, editing, resourceStripActive, wbsBandHeightPx]);

  // Re-resolve the painter palette on a theme switch (`useThemeVersion` bumps) and repaint. Kept out of
  // the rAF loop's effect so the loop isn't torn down/rebuilt on a theme change (theme flips are rare).
  // **`useLayoutEffect`, not `useEffect`, and keyed on the surface as well as the theme**
  // (ADR-0097 Landing E). The `??=` bootstrap above runs during the FIRST render, when the
  // provider's state is still null and `useCanvasSurface` therefore falls back to the page — so
  // something has to re-resolve once the diagram's `<Surface>` has mounted. A passive effect would
  // let the rAF loop paint page colours first; a layout effect runs before the browser paints.
  //
  // Keying on `themeVersion` alone would not do it: ADR-0097 §1.5a collapsed the product to one
  // theme, so that counter never bumps again and a missed first pass would have no second chance
  // for the life of the mount.
  useLayoutEffect(() => {
    paletteRef.current = resolveTsldPalette(canvasSurface);
    // Re-resolve the strip palette on the SAME bump so the demand bars track the scope like the
    // main painter (Canvas 2D `fillStyle` can't take a `var()`); mark the strip dirty so it repaints.
    stripPaletteRef.current = resolveResourceStripPalette(canvasSurface);
    wbsBandPaletteRef.current = resolveWbsBandPalette(canvasSurface);
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
    stripDirtyRef.current = true;
    wbsBandDirtyRef.current = true;
  }, [themeVersion, canvasSurface]);

  // The idle-hover affordance writes an INLINE cursor ('ew-resize'), which beats the class-based
  // busy cursor. Clear it the moment a write starts: the hover branch only re-runs on the next
  // pointer move, so a stationary pointer over a handle would otherwise keep advertising a grab
  // the pointer-down gate now refuses.
  useEffect(() => {
    if (writeBusy && canvasRef.current) canvasRef.current.style.cursor = '';
  }, [writeBusy]);

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const localPoint = (e: React.PointerEvent | React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const machineCtx = () => ({
    mode,
    view: viewRef.current,
    dataDate,
    ...(createType ? { createType } : {}),
    ...(linkType ? { linkType } : {}),
  });
  // `ctrl` folds Ctrl and Cmd into one field on purpose (M2-T1): they are the same intent on two
  // platforms, and a downstream consumer that had to check both would eventually check one.
  const modifiersOf = (e: React.PointerEvent): Modifiers => ({
    shift: e.shiftKey,
    alt: e.altKey,
    ctrl: e.ctrlKey || e.metaKey,
  });
  /**
   * The selection modifier a click carries, or `undefined` for a plain replace.
   *
   * Ctrl/Cmd wins over Shift when both are held. Arbitrary but stable, and stated rather than left
   * to reading order: toggle is the reversible one, so a planner who over-reaches with both fingers
   * down loses less.
   */
  const selectModifierOf = (e: React.PointerEvent): SelectModifier | undefined => {
    if (e.ctrlKey || e.metaKey) return 'toggle';
    if (e.shiftKey) return 'span';
    return undefined;
  };
  // The plan working-day walk the lag-anchor hit zones + grabs run on — memoised so the walk's own
  // per-(day, n) memo survives across pointer events (the painter builds its walk per frame; the
  // two share `makeWorkingDayWalk`, so they can never place an anchor differently). No calendar ⇒
  // elapsed, mirroring the painter's fallback.
  const lagWalk = useMemo(
    () => (isWorkingDay ? makeWorkingDayWalk(isWorkingDay) : ELAPSED_DAY_WALK),
    [isWorkingDay],
  );
  // The memoised id→activity resolve backing the idle-hover branch — `.get()` per move, with the
  // Map rebuilt only on an activities-array identity change (see `activityIndexRef`).
  /** Publish the emphasised lag anchor into the scene, repainting only on a real change. */
  const setActiveLagId = (id: string | null): void => {
    if (activeLagIdRef.current === id) return;
    activeLagIdRef.current = id;
    sceneRef.current = { ...sceneRef.current, activeLagId: id };
    dirtyRef.current = true;
  };
  const classifyAt = (p: Point, resizeZones = false, lagZones = false): HitZone => {
    const options: ClassifyHitOptions | undefined =
      resizeZones || lagZones
        ? {
            ...(resizeZones ? { resizeHandles: true } : {}),
            ...(lagZones ? { lagAnchors: { edges: sceneRef.current.edges, walk: lagWalk } } : {}),
          }
        : undefined;
    return classifyHit(sceneRef.current.activities, p, viewRef.current, dataDate, options);
  };

  return (
    // `aria-busy` states the in-flight write to AT (plan test: present while the write is pending,
    // absent after EVERY settle path incl. `.catch`). Deliberately not set for the create popover —
    // that is a held question awaiting the user, not the app being busy.
    <div
      ref={containerRef}
      aria-busy={writeBusy || undefined}
      className="bg-canvas relative h-full w-full overflow-hidden"
    >
      {/* The sticky date ruler: a DOM band updated imperatively from the rAF loop (aria-hidden — the
          canvas already has the parallel a11y listbox; pointer-events-none so pan/zoom fall through). */}
      <div
        aria-hidden="true"
        data-testid="tsld-ruler"
        className="bg-canvas text-muted-foreground border-border pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden border-b text-xs leading-none"
        // RULER_HEIGHT is a raw px value (not a Tailwind class) because the canvas-sizing math in
        // measure() needs the exact same number — one source of truth for the CSS + JS.
        style={{ height: RULER_HEIGHT }}
      >
        <div
          ref={rulerYearsRef}
          className="text-foreground/70 absolute inset-x-0 top-0 h-3 font-medium"
        />
        <div
          ref={rulerMonthsRef}
          className="text-foreground/90 absolute inset-x-0 top-3 h-3.5 font-medium"
        />
        <div ref={rulerDaysRef} className="absolute inset-x-0 bottom-0 h-3.5" />
      </div>
      {/* Layer 4 — the pinned WBS band (ADR-0063): an aria-hidden sibling canvas between the ruler
          and the scene. Unlike the resource strip it DOES take pointer events, because it is
          select-only and a click has to reach a summary; its a11y equivalent is the band group in
          the parallel DOM listbox. Mounted only when the band has height, so the scene is
          byte-for-byte today's when the band is off (the parity gate). */}
      {wbsBandHeightPx > 0 ? (
        <canvas
          ref={wbsBandCanvasRef}
          aria-hidden="true"
          data-testid="tsld-wbs-band"
          style={{ top: RULER_HEIGHT, height: wbsBandHeightPx }}
          className="absolute inset-x-0 block cursor-pointer"
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const bar = wbsBandHitTest(
              wbsBandBarsRef.current,
              e.clientX - box.left,
              e.clientY - box.top,
            );
            // A bar with no id is the derived bucket — it is not in the database, so there is
            // nothing to select. Refusing it here (rather than in the hit-test) keeps the geometry
            // a purely geometric question; see `wbsBandHitTest`.
            if (bar?.id != null) onSelectBandSummary?.(bar.id);
          }}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ top: sceneTopOffset(wbsBandHeightPx) }}
        className={`absolute inset-x-0 block touch-none ${
          editing && writeBusy
            ? // A write is in flight: `progress` (busy but still interactive) rather than `wait` —
              // pan/select/hover stay live; only a new edit grab is refused. This also replaces the
              // grab/crosshair affordance over bars, so the refusal is visible before the press.
              'cursor-progress'
            : editing && (mode === 'add-activity' || mode === 'link' || mode === 'loe')
              ? 'cursor-crosshair'
              : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={(e) => {
          // A create popover is open — the canvas is inert until it commits or cancels, so an
          // in-progress name (and its ghost) is never lost to a stray drag.
          if (pending) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          canvasRef.current?.setPointerCapture?.(e.pointerId);
          // The Link tool (M5) AND the LOE tool (Stage D) are click-driven (handled on pointer-up), not
          // drag gestures — so a press must NOT run the gesture reducer here, else it would clear an
          // in-progress pick before the second click's release lands. Panning still works via `drag`.
          // A marquee sweep is a READ (the ADR-0063 M4b rule), so it arms on a surface that has no
          // pen — a Viewer, or a writer who has not taken the lock. Everything else in this branch
          // is an edit gesture and stays gated on `editing`; the reducer itself will only reach the
          // `marqueeing` state from an empty-ground press in the two armed cases.
          const marqueeArmable =
            CANVAS_MULTI_SELECT_ENABLED && (mode === 'marquee' || e.ctrlKey || e.metaKey);
          if ((editing || marqueeArmable) && mode !== 'link' && mode !== 'loe') {
            // A reposition/resize write is in flight (canvas status & feedback M2): refuse to START
            // another edit gesture. The panel's `onIntent` would drop its result anyway, and a drag
            // that runs, ghosts and then applies nothing is the "lit but inert" shape (ADR-0059 M6 /
            // ADR-0062 M6) — so it is refused before it arms, with the busy cursor + `aria-busy`
            // saying why. Returning HERE (after the pan setup above) keeps panning live by
            // construction, and a stationary press still selects through the plain click path on
            // pointer-up.
            // …but not a marquee: it writes nothing, so an in-flight save is no reason to refuse it.
            if (writeBusy && !marqueeArmable) return;
            const p = localPoint(e);
            const rawHit = classifyAt(p, resizeArmed, lagArmed);
            const isHandle = rawHit.kind === 'startHandle' || rawHit.kind === 'finishHandle';
            // Downgrade a handle to a body hit when linking isn't wired — OR when direct
            // manipulation is on (ADR-0052 §1 gates the legacy edge-drag-link off under the flag;
            // linking is the two-click tool) — so it never starts a dangling rubber-band and falls
            // through to reposition (if wired) or M1 select.
            const hit: HitZone =
              isHandle && (!canLink || CANVAS_DIRECT_MANIPULATION_ENABLED) && rawHit.id
                ? { kind: 'body', id: rawHit.id }
                : rawHit;
            // A body grab in select mode needs the activity's current geometry to reposition it —
            // but only when a reposition handler is wired, else it falls through to M1 select. A
            // bar-end resize grab (ADR-0052 M2 finish, M3 start) needs the same geometry (its
            // start + span).
            const body =
              mode === 'select' &&
              hit.id &&
              ((canReposition && hit.kind === 'body') ||
                hit.kind === 'resizeFinish' ||
                hit.kind === 'resizeStart')
                ? bodyGrab(sceneRef.current.activities, hit.id, dataDate)
                : undefined;
            // A lag-anchor grab (ADR-0052 M3) instead needs its edge's context + the resolved walk.
            const lag =
              hit.kind === 'lagAnchor' && hit.dependencyId
                ? lagGrabOf(
                    sceneRef.current.edges,
                    sceneRef.current.activities,
                    hit.dependencyId,
                    viewRef.current,
                    dataDate,
                    lagWalk,
                  )
                : undefined;
            const { state } = reduce(
              gestureRef.current,
              {
                type: 'pointerDown',
                point: p,
                hit,
                modifiers: modifiersOf(e),
                ...(body ? { body } : {}),
                ...(lag ? { lag } : {}),
              },
              machineCtx(),
            );
            gestureRef.current = state;
            syncGestureSource();
            // Hold the grabbed anchor emphasised for the whole drag: the idle-hover branch below
            // is skipped while a gesture runs, so without this the handle would drop back to rest
            // the moment the pointer moved.
            if (state.kind === 'lagDragging') setActiveLagId(state.dependencyId);
            if (state.kind !== 'idle') {
              gestureActiveRef.current = true;
              interactionDirtyRef.current = true;
            }
          }
        }}
        onPointerMove={(e) => {
          // Track the pointer for the cursor date readout (ADR-0054 §2). This is the one place the
          // epic costs a frame it was not already drawing: with no gesture in flight the
          // interaction layer previously repainted only on a hover-ring change, and a live
          // guideline must follow every move. It is the CHEAP layer — a clear plus a rule, a chip
          // and (when a gesture runs) one ghost — never the bar/link scene. Flag-off this whole
          // block is dead, so the idle repaint cadence is byte-for-byte today's.
          // Gated on `editing` as well as the flag: the interaction canvas only exists while
          // editing (`ictx` is null otherwise), so on a read-only surface — a Viewer, or the
          // ADR-0051 guest share view — this would force a `getBoundingClientRect()` on every
          // raw pointer move for a chip that can never be painted. Per-EVENT layout reads are
          // exactly what ADR-0026 D3 avoids.
          if (CANVAS_LIVE_FEEDBACK_ENABLED && editing) {
            cursorPointRef.current = localPoint(e);
            interactionDirtyRef.current = true;
          }
          if (gestureActiveRef.current) {
            const p = localPoint(e);
            // Only a link drag needs the hovered target + live modifiers (a per-move hit-test);
            // create/reposition track by point alone, so we skip the classify for them.
            const linking = gestureRef.current.kind === 'linking';
            const { state } = reduce(
              gestureRef.current,
              linking
                ? { type: 'pointerMove', point: p, hit: classifyAt(p), modifiers: modifiersOf(e) }
                : { type: 'pointerMove', point: p },
              machineCtx(),
            );
            gestureRef.current = state;
            syncGestureSource();
            interactionDirtyRef.current = true;
            return;
          }
          if (!drag.current) {
            // Idle hover (no gesture, no pan): show the ew-resize affordance over an eligible
            // bar's grab-zones (ADR-0052 M2 finish, M3 start + lag anchor — all horizontal
            // time-axis drags). Inline style wins over the className cursor and clears back to it
            // ('' → class fallback) off the zone. Flag-off / not armed ⇒ no classify, no style
            // write — byte-for-byte today's hover behaviour.
            if (resizeArmed || lagArmed) {
              const hover = classifyAt(localPoint(e), resizeArmed, lagArmed);
              const surface = canvasRef.current;
              if (surface) {
                // While a write is in flight the grab is refused (M2), so the zone must not
                // advertise it — '' falls back to the class-based busy cursor.
                surface.style.cursor =
                  !writeBusy &&
                  (hover.kind === 'resizeFinish' ||
                    hover.kind === 'resizeStart' ||
                    hover.kind === 'lagAnchor')
                    ? 'ew-resize'
                    : '';
              }
              // Emphasise the hovered lag handle from the SAME classify (no extra hit-test) — the
              // visual twin of the cursor change, so the point announces itself before the press.
              setActiveLagId(hover.kind === 'lagAnchor' ? (hover.dependencyId ?? null) : null);
              // Hover ring (ADR-0052 M4): publish the hovered bar's rect for the interaction
              // layer — reusing the classify this branch already ran, so no extra hit-test. A
              // repaint is marked only when the hovered bar actually changes (not per move).
              // Suppressed on the SELECTED bar: its ±2px selection ring already outlines it, and
              // stacking the ±1.5px hover ring over it reads as one blurred double outline (ux
              // review) — the incident-link hover highlight below is unaffected (selection
              // already highlights its own ties).
              const hoveredActivity = hover.id ? activityById(hover.id) : undefined;
              const rect =
                hoveredActivity && hoveredActivity.id !== sceneRef.current.selectedId
                  ? activityRect(hoveredActivity, viewRef.current, dataDate)
                  : null;
              const prev = hoverRef.current;
              const changed =
                (prev === null) !== (rect === null) ||
                (prev !== null &&
                  rect !== null &&
                  (prev.x !== rect.x || prev.y !== rect.y || prev.w !== rect.w));
              if (changed) {
                hoverRef.current = rect;
                interactionDirtyRef.current = true;
              }
              // Incident-link hover highlight (ADR-0052 M5): the hovered bar's id rides the
              // SCENE so the base edge layer restyles its ties — a scene repaint per hovered-BAR
              // change (the same cost as a selection change), never per pointer move.
              const hoverId = hoveredActivity?.id ?? null;
              if (hoverId !== hoverIdRef.current) {
                hoverIdRef.current = hoverId;
                sceneRef.current = { ...sceneRef.current, hoverId };
                dirtyRef.current = true;
              }
            }
            return;
          }
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > CLICK_MOVE_THRESHOLD_PX) drag.current.moved = true;
          viewRef.current = pan(viewRef.current, dx, dy);
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
          dirtyRef.current = true;
          interactionDirtyRef.current = true;
        }}
        onPointerUp={(e) => {
          if (gestureActiveRef.current) {
            gestureActiveRef.current = false;
            drag.current = null;
            const p = localPoint(e);
            const { width, height } = sizeRef.current;
            // Releasing outside the canvas cancels the gesture (US-4) — no intent. Skip the
            // check until the surface has a real measured size (avoids a degenerate 1×1).
            const measured = width > 1 && height > 1;
            const outOfBounds = measured && (p.x < 0 || p.y < 0 || p.x > width || p.y > height);
            const linking = gestureRef.current.kind === 'linking';
            const { state, intent, select } = reduce(
              gestureRef.current,
              outOfBounds
                ? { type: 'escape' }
                : linking
                  ? { type: 'pointerUp', hit: classifyAt(p), modifiers: modifiersOf(e) }
                  : { type: 'pointerUp' },
              machineCtx(),
            );
            gestureRef.current = state;
            syncGestureSource();
            interactionDirtyRef.current = true;
            // The drag is over — the next idle move re-emphasises whatever the pointer rests on.
            setActiveLagId(null);
            // A marquee is a SELECTION, not an edit, so it leaves through the selection channel:
            // routing it to `onIntent` would put it behind the host's in-flight-write guard, where
            // a planner mid-save could not re-select. Resolved here — the canvas owns the viewport.
            if (intent?.kind === 'marquee') {
              onSelectRegion?.(
                idsIntersecting(
                  sceneRef.current.activities,
                  intent.rect,
                  viewRef.current,
                  dataDate,
                ),
                intent.additive,
              );
              return;
            }
            if (intent) onIntent?.(intent, clampAnchor(p, sizeRef.current));
            else if (select) onSelect(select);
            return;
          }
          const wasDrag = drag.current?.moved ?? false;
          drag.current = null;
          if (wasDrag) return;
          const p = localPoint(e);
          // Link tool (M5) / LOE tool (Stage D): a click picks the first endpoint, then the second —
          // the gesture machine holds the pick between clicks. Panning still works (a drag returns
          // above); only a stationary click reaches here. Other modes keep the plain M1 select-on-click.
          // A `link`/`loeSpan` commit rides `intent`; the LOE tool's per-pick prompts ride `loe`.
          if (editing && (mode === 'link' || mode === 'loe')) {
            const { state, intent, loe } = reduce(
              gestureRef.current,
              { type: 'click', hit: classifyAt(p) },
              machineCtx(),
            );
            gestureRef.current = state;
            syncGestureSource();
            interactionDirtyRef.current = true;
            if (intent) onIntent?.(intent, clampAnchor(p, sizeRef.current));
            if (loe) onLoeSpanStep?.(loe);
            if (mode === 'link') {
              onLinkPickStep?.(state.kind === 'linkPicking' ? state.predecessorId : null);
            }
            return;
          }
          // Ctrl/Cmd toggles one bar in or out; Shift extends from the primary. Flag-off the
          // modifier is never computed, so this call is the one-argument call it has always been —
          // and `Shift` in particular MUST stay unclaimed there, because the legacy link chord
          // reads it as start-to-start (M0-T1's derived flag makes the overlap impossible).
          const modifier = CANVAS_MULTI_SELECT_ENABLED ? selectModifierOf(e) : undefined;
          const target = hitTest(sceneRef.current.activities, p, viewRef.current, dataDate);
          if (modifier) onSelect(target, modifier);
          else onSelect(target);
        }}
        onPointerLeave={() => {
          // Drop the hover ring when the pointer leaves the surface (M4). Flag-off the ref is
          // never set, so this is a no-op — today's behaviour byte-for-byte.
          if (hoverRef.current !== null) {
            hoverRef.current = null;
            interactionDirtyRef.current = true;
          }
          // …and the transient incident-link highlight with it (M5) — same no-op flag-off.
          if (hoverIdRef.current !== null) {
            hoverIdRef.current = null;
            sceneRef.current = { ...sceneRef.current, hoverId: null };
            dirtyRef.current = true;
          }
          // …and the cursor date readout (ADR-0054 §2) — a guideline left behind by a pointer
          // that has gone would point at nothing.
          if (cursorPointRef.current !== null) {
            cursorPointRef.current = null;
            interactionDirtyRef.current = true;
          }
          // …and any emphasised lag handle with it (same no-op flag-off).
          setActiveLagId(null);
        }}
        onPointerCancel={() => {
          setActiveLagId(null); // a cancelled drag leaves no handle stuck emphasised
          if (!gestureActiveRef.current) return;
          gestureActiveRef.current = false;
          drag.current = null;
          gestureRef.current = reduce(gestureRef.current, { type: 'escape' }, machineCtx()).state;
          syncGestureSource();
          interactionDirtyRef.current = true;
        }}
      />
      {interactionLayerMounted ? (
        <canvas
          ref={interactionCanvasRef}
          aria-hidden="true"
          style={{ top: sceneTopOffset(wbsBandHeightPx) }}
          className="pointer-events-none absolute inset-x-0"
        />
      ) : null}
      {/* Layer 3 — the resource-strip band (Stage E, ADR-0049): an aria-hidden, pointer-transparent
          sibling canvas pinned to the container bottom (the a11y equivalent is the reused `<table>` in
          the DOM `ResourceStripPanel`). Rendered only when active, so the scene is byte-for-byte today's
          when the strip is off. `measure()` reserves its height so it never overlaps the scene canvas. */}
      {resourceStripActive ? (
        <canvas
          ref={stripCanvasRef}
          aria-hidden="true"
          data-testid="tsld-resource-strip"
          style={{ height: RESOURCE_STRIP_HEIGHT }}
          className="pointer-events-none absolute inset-x-0 bottom-0 block"
        />
      ) : null}
    </div>
  );
}
