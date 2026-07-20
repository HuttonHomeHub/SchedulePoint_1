import type { ActivityType, DependencyType } from '@repo/types';
import { useEffect, useImperativeHandle, useRef } from 'react';

import {
  IDLE,
  reduce,
  type BodyGrab,
  type EditIntent,
  type EditMode,
  type GestureState,
  type Modifiers,
} from '../interaction/gesture-machine';
import type { GhostBar } from '../render/lenses';
import { linkLegality } from '../render/link-legality';
import {
  paintInteractionLayer,
  paintScene,
  type InteractionOverlay,
  type LinkOverlay,
  type TsldPalette,
  type TsldScene,
  type TsldViewToggles,
} from '../render/paint';
import { resolveTsldPalette } from '../render/palette';
import {
  activityRect,
  classifyHit,
  dayCellRect,
  daysBetween,
  DEFAULT_VIEWPORT,
  edgeAnchor,
  fitToContent,
  hitTest,
  LANE_HEIGHT,
  pan,
  panToDate,
  zoomAt,
  type HitZone,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
  type ZoomLevel,
} from '../render/render-model';
import { presetOf, rulerTicks, stepZoom, zoomToPreset } from '../render/time-scale';
import { useThemeVersion } from '../render/use-theme-version';
import type { SelectionAnchor } from '../toolbar/selection-actions';

import { CANVAS_AUTHORING_ENABLED } from '@/config/env';

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

const CLICK_MOVE_THRESHOLD_PX = 4;

/** The pending create ghost (day/lane geometry) held open under the name popover. */
export interface PendingGhost {
  startDay: number;
  endDay: number;
  laneIndex: number;
}

export interface TsldCanvasProps {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
  /** Whether an edge-handle grab may start a dependency-draw (i.e. a link handler is wired).
   * When false, a handle press falls through to M1 select — no dangling rubber-band. */
  canLink?: boolean;
  /** Called with a committed edit + the (container-clamped) anchor point for its popover. */
  onIntent?: (intent: EditIntent, anchor: Point) => void;
  /** Called when Esc is pressed while idle in add-activity mode (revert to Select). */
  onExitAddMode?: () => void;
  /** The active edit ghost drawn on the interaction layer — a dropped create awaiting its name,
   * or the moved bar while a reposition is in flight. While set, canvas gestures are suspended. */
  pending?: PendingGhost | null;
  /** Which optional view layers to draw (grid variants / today / non-working). Defaults to all on. */
  view?: TsldViewToggles;
  /** Predicate built from the plan calendar (mask + holiday exceptions): is this day offset worked?
   * Null/absent → no non-working shading. Must be referentially stable (memoised) to avoid repaints. */
  isWorkingDay?: ((dayOffset: number) => boolean) | null;
  /** Day offset (from `dataDate`) of "today", or null when it isn't placeable. */
  todayOffset?: number | null;
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
  /** Imperative handle so the toolbar can command zoom presets / steps (ADR-0026 D3 seam). */
  controlRef?: React.Ref<TsldCanvasHandle>;
  /** Fires only when the active zoom preset changes (a stop-boundary crossing) — never per frame —
   * so the toolbar can reflect the active preset without per-frame React state. */
  onZoomStopChange?: (level: ZoomLevel) => void;
  /** When set, the loop writes the selected activity's live viewport geometry here every frame (or
   * `null` when it has no drawn position / is off-screen / the surface is hidden), so the floating
   * {@link SelectionActionsBar} can follow the canvas without per-frame React state (ADR-0026 D3). */
  selectionAnchorRef?: React.RefObject<SelectionAnchor | null>;
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

/** The picked-predecessor rect while the two-click `link` tool waits for the second click (M5), or
 * null when not mid-pick — drawn as a highlight ring so the "now click the successor" step reads. */
function linkPickRect(
  state: GestureState,
  view: Viewport,
  activities: readonly RenderActivity[],
  dataDate: string,
): Rect | null {
  if (state.kind !== 'linkPicking') return null;
  const source = activities.find((a) => a.id === state.predecessorId);
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
  onSelect,
  fitSignal,
  editing = false,
  mode = 'select',
  createType,
  linkType,
  canReposition = false,
  canLink = false,
  onIntent,
  onExitAddMode,
  pending = null,
  view,
  isWorkingDay = null,
  todayOffset = null,
  dimmedIds,
  barFill,
  barInk,
  baselineGhosts,
  controlRef,
  onZoomStopChange,
  selectionAnchorRef,
}: TsldCanvasProps): React.ReactElement {
  // The painter draws from concrete resolved token colours (Canvas 2D `fillStyle` can't take a `var()`),
  // so the palette must re-resolve on a theme switch. `useThemeVersion` (the shared theme-mutation
  // counter, one source of truth) bumps then; an effect below re-resolves `paletteRef` + repaints. The
  // rAF loop reads the ref, so no per-frame work and no stale closure.
  const themeVersion = useThemeVersion();
  const paletteRef = useRef<TsldPalette | null>(null);
  paletteRef.current ??= resolveTsldPalette();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const pendingRef = useRef<PendingGhost | null>(pending);
  // Read by the window key listener (set up once), so it sees the current mode/handler.
  const modeRef = useRef(mode);
  const exitAddModeRef = useRef(onExitAddMode);
  useEffect(() => {
    modeRef.current = mode;
    exitAddModeRef.current = onExitAddMode;
  });

  // Edge handles are the flag-off edge-drag affordance. Canvas-first authoring (ADR-0032 M5) replaces
  // edge-drag with the two-click `link` tool, so the handles are suppressed there — no dangling
  // rubber-band path when the flag is on. `canLink` still gates whether linking is offered at all.
  const showEdgeHandles = editing && canLink && !CANVAS_AUTHORING_ENABLED;
  const sceneRef = useRef<TsldScene>({
    activities,
    edges,
    dataDate,
    selectedId,
    showEdgeHandles,
    view,
    isWorkingDay,
    todayOffset,
    dimmedIds,
    barFill,
    barInk,
    baselineGhosts,
  });

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
      showEdgeHandles,
      view,
      isWorkingDay,
      todayOffset,
      dimmedIds,
      barFill,
      barInk,
      baselineGhosts,
    };
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
  }, [
    activities,
    edges,
    dataDate,
    selectedId,
    showEdgeHandles,
    view,
    isWorkingDay,
    todayOffset,
    dimmedIds,
    barFill,
    barInk,
    baselineGhosts,
  ]);

  // Report the active preset when the zoom stop crosses a boundary (called at the pxPerDay-changing
  // sites only). Kept off the per-frame path since pan never changes pxPerDay.
  const reportZoomStop = (): void => {
    const level = presetOf(viewRef.current.pxPerDay);
    if (level !== lastStopRef.current) {
      lastStopRef.current = level;
      onZoomStopChangeRef.current?.(level);
    }
  };

  useImperativeHandle(
    controlRef,
    () => ({
      zoomToPreset: (level: ZoomLevel) => {
        viewRef.current = zoomToPreset(viewRef.current, sizeRef.current, level);
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
        reportZoomStop();
      },
      stepZoom: (factor: number) => {
        viewRef.current = stepZoom(viewRef.current, sizeRef.current, factor);
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
    if (!activity) return;
    const rect = activityRect(activity, viewRef.current, dataDate);
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
    const dy = reveal(rect.y, rect.h, size.height);
    if (dx !== 0 || dy !== 0) {
      viewRef.current = pan(viewRef.current, dx, dy);
      dirtyRef.current = true;
      interactionDirtyRef.current = true;
    }
  }, [selectedId, activities, dataDate]);

  // Publish the pending ghost to the loop.
  useEffect(() => {
    pendingRef.current = pending;
    interactionDirtyRef.current = true;
  }, [pending]);

  // Switching tools drops any in-progress gesture ghost — most importantly an unfinished link pick
  // (M5), so leaving the Link tool mid-pick never leaves a dangling highlight ring.
  useEffect(() => {
    if (gestureRef.current.kind !== 'idle') {
      gestureRef.current = IDLE;
      gestureActiveRef.current = false;
      interactionDirtyRef.current = true;
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let raf = 0;

    const measure = (): void => {
      const rect = container.getBoundingClientRect();
      // The canvas sits below the ruler band, so its drawable height is the container minus the ruler.
      const size = {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height - RULER_HEIGHT),
      };
      if (size.width !== sizeRef.current.width || size.height !== sizeRef.current.height) {
        sizeRef.current = size;
        const dpr = getDpr();
        for (const c of [canvas, interactionCanvasRef.current]) {
          if (!c) continue;
          c.width = Math.round(size.width * dpr);
          c.height = Math.round(size.height * dpr);
          c.style.width = `${size.width}px`;
          c.style.height = `${size.height}px`;
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
      if (!visibleRef.current) {
        // The floating selection bar is portaled to <body>, so it must hide when the surface is
        // hidden (e.g. the below-`md` Activities pane is showing) — clear its anchor.
        if (selectionAnchorRef) selectionAnchorRef.current = null;
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = sizeRef.current;
      const dpr = getDpr();
      if (!fittedRef.current && size.width > 1) {
        const withDates = sceneRef.current.activities.some((a) => a.earlyStart !== null);
        viewRef.current = withDates
          ? fitToContent(sceneRef.current.activities, size, sceneRef.current.dataDate)
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
      const ictx = editing ? interactionCanvasRef.current?.getContext('2d') : null;
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
        };
        paintInteractionLayer(ictx, overlay, size, paletteRef.current!, dpr);
        interactionDirtyRef.current = false;
      }
      // Publish the selected activity's live viewport anchor for the floating selection bar (ADR-0031):
      // the selected bar's top edge + horizontal centre in viewport px, or null when it has no drawn
      // position or is scrolled off the surface. Off the per-frame React path (ADR-0026 D3); the one
      // `getBoundingClientRect` runs only on a moved frame (the anchor is otherwise unchanged), so it
      // never interleaves a layout read with an idle-frame ruler write, and only while wired.
      if (selectionAnchorRef && movedThisFrame) {
        const scene = sceneRef.current;
        const selected = scene.selectedId
          ? scene.activities.find((a) => a.id === scene.selectedId)
          : undefined;
        const rect =
          selected && selected.earlyStart !== null
            ? activityRect(selected, viewRef.current, scene.dataDate)
            : null;
        const onSurface =
          rect !== null &&
          rect.x + rect.w > 0 &&
          rect.x < size.width &&
          rect.y + rect.h > 0 &&
          rect.y < size.height;
        if (rect && onSurface) {
          const box = canvas.getBoundingClientRect();
          selectionAnchorRef.current = {
            top: box.top + rect.y,
            centerX: box.left + rect.x + rect.w / 2,
          };
        } else {
          selectionAnchorRef.current = null;
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
      if (gestureActiveRef.current) {
        gestureActiveRef.current = false;
        gestureRef.current = reduce(
          gestureRef.current,
          { type: 'escape' },
          { mode: 'select', view: viewRef.current, dataDate: sceneRef.current.dataDate },
        ).state;
        interactionDirtyRef.current = true;
      } else if (gestureRef.current.kind === 'linkPicking') {
        // First Escape drops an unfinished link pick (M5) — the tool stays armed for another try.
        gestureRef.current = IDLE;
        interactionDirtyRef.current = true;
      } else if (
        editing &&
        (modeRef.current === 'add-activity' || modeRef.current === 'link') &&
        !pendingRef.current
      ) {
        // With no pick/ghost pending, Escape leaves the authoring tool back to Select.
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
  }, [editing, selectionAnchorRef]);

  // Re-resolve the painter palette on a theme switch (`useThemeVersion` bumps) and repaint. Kept out of
  // the rAF loop's effect so the loop isn't torn down/rebuilt on a theme change (theme flips are rare).
  useEffect(() => {
    paletteRef.current = resolveTsldPalette();
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
  }, [themeVersion]);

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
  const modifiersOf = (e: React.PointerEvent): Modifiers => ({ shift: e.shiftKey, alt: e.altKey });
  const classifyAt = (p: Point): HitZone =>
    classifyHit(sceneRef.current.activities, p, viewRef.current, dataDate);

  return (
    <div ref={containerRef} className="bg-card relative h-full w-full overflow-hidden">
      {/* The sticky date ruler: a DOM band updated imperatively from the rAF loop (aria-hidden — the
          canvas already has the parallel a11y listbox; pointer-events-none so pan/zoom fall through). */}
      <div
        aria-hidden="true"
        data-testid="tsld-ruler"
        className="bg-card text-muted-foreground border-border pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden border-b text-xs leading-none"
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
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ top: RULER_HEIGHT }}
        className={`absolute inset-x-0 block touch-none ${
          editing && (mode === 'add-activity' || mode === 'link')
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={(e) => {
          // A create popover is open — the canvas is inert until it commits or cancels, so an
          // in-progress name (and its ghost) is never lost to a stray drag.
          if (pending) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          canvasRef.current?.setPointerCapture?.(e.pointerId);
          // The Link tool (M5) is click-driven (handled on pointer-up), not a drag gesture — so a
          // press must NOT run the gesture reducer here, else it would clear an in-progress pick
          // before the second click's release lands. Panning still works via `drag` below.
          if (editing && mode !== 'link') {
            const p = localPoint(e);
            const rawHit = classifyAt(p);
            const isHandle = rawHit.kind === 'startHandle' || rawHit.kind === 'finishHandle';
            // Downgrade a handle to a body hit when linking isn't wired, so it never starts a
            // dangling rubber-band — it falls through to reposition (if wired) or M1 select.
            const hit: HitZone =
              isHandle && !canLink && rawHit.id ? { kind: 'body', id: rawHit.id } : rawHit;
            // A body grab in select mode needs the activity's current geometry to reposition it —
            // but only when a reposition handler is wired, else it falls through to M1 select.
            const body =
              canReposition && mode === 'select' && hit.kind === 'body' && hit.id
                ? bodyGrab(sceneRef.current.activities, hit.id, dataDate)
                : undefined;
            const { state } = reduce(
              gestureRef.current,
              {
                type: 'pointerDown',
                point: p,
                hit,
                modifiers: modifiersOf(e),
                ...(body ? { body } : {}),
              },
              machineCtx(),
            );
            gestureRef.current = state;
            if (state.kind !== 'idle') {
              gestureActiveRef.current = true;
              interactionDirtyRef.current = true;
            }
          }
        }}
        onPointerMove={(e) => {
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
            interactionDirtyRef.current = true;
            return;
          }
          if (!drag.current) return;
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
            interactionDirtyRef.current = true;
            if (intent) onIntent?.(intent, clampAnchor(p, sizeRef.current));
            else if (select) onSelect(select);
            return;
          }
          const wasDrag = drag.current?.moved ?? false;
          drag.current = null;
          if (wasDrag) return;
          const p = localPoint(e);
          // Link tool (M5): a click picks a predecessor, then a successor — the gesture machine
          // holds the pick between clicks. Panning still works (a drag returns above); only a
          // stationary click reaches here. Non-link modes keep the plain M1 select-on-click.
          if (editing && mode === 'link') {
            const { state, intent } = reduce(
              gestureRef.current,
              { type: 'click', hit: classifyAt(p) },
              machineCtx(),
            );
            gestureRef.current = state;
            interactionDirtyRef.current = true;
            if (intent) onIntent?.(intent, clampAnchor(p, sizeRef.current));
            return;
          }
          onSelect(hitTest(sceneRef.current.activities, p, viewRef.current, dataDate));
        }}
        onPointerCancel={() => {
          if (!gestureActiveRef.current) return;
          gestureActiveRef.current = false;
          drag.current = null;
          gestureRef.current = reduce(gestureRef.current, { type: 'escape' }, machineCtx()).state;
          interactionDirtyRef.current = true;
        }}
      />
      {editing ? (
        <canvas
          ref={interactionCanvasRef}
          aria-hidden="true"
          style={{ top: RULER_HEIGHT }}
          className="pointer-events-none absolute inset-x-0"
        />
      ) : null}
    </div>
  );
}
