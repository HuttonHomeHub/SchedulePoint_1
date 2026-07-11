import { useEffect, useRef } from 'react';

import {
  IDLE,
  reduce,
  type BodyGrab,
  type EditIntent,
  type EditMode,
  type GestureState,
  type Modifiers,
} from '../interaction/gesture-machine';
import {
  paintInteractionLayer,
  paintScene,
  type InteractionOverlay,
  type LinkOverlay,
  type TsldScene,
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
  zoomAt,
  type HitZone,
  type Point,
  type Rect,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from '../render/render-model';

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

/** The live dependency rubber-band (anchor → pointer + target highlight), or null when not linking. */
function liveLink(
  state: GestureState,
  view: Viewport,
  activities: readonly RenderActivity[],
  dataDate: string,
): LinkOverlay | null {
  if (state.kind !== 'linking') return null;
  const source = activities.find((a) => a.id === state.sourceId);
  const sourceRect = source && activityRect(source, view, dataDate);
  if (!sourceRect) return null;
  const target = state.targetId ? activities.find((a) => a.id === state.targetId) : undefined;
  const targetRect = (target && activityRect(target, view, dataDate)) || null;
  return { from: edgeAnchor(sourceRect, state.sourceHandle), to: state.point, targetRect };
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
  canReposition = false,
  canLink = false,
  onIntent,
  onExitAddMode,
  pending = null,
}: TsldCanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<Viewport>(DEFAULT_VIEWPORT);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const dirtyRef = useRef(true);
  const fittedRef = useRef(false);

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

  const showEdgeHandles = editing && canLink;
  const sceneRef = useRef<TsldScene>({ activities, edges, dataDate, selectedId, showEdgeHandles });

  useEffect(() => {
    fittedRef.current = false;
    dirtyRef.current = true;
  }, [fitSignal, dataDate]);

  useEffect(() => {
    sceneRef.current = { activities, edges, dataDate, selectedId, showEdgeHandles };
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
  }, [activities, edges, dataDate, selectedId, showEdgeHandles]);

  // Focus-follows-viewport (M5, WCAG 2.4.7/2.4.11): when the selection changes — e.g. keyboard
  // navigation or chain-nav to an off-screen bar — pan the minimum distance so the selected bar's
  // ring is fully on-screen, kept off the edges by a margin so nothing obscures it. A no-op when
  // it's already visible (so pointer selection doesn't jump), or when it has no drawn position.
  useEffect(() => {
    if (!selectedId) return;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let palette = resolveTsldPalette();
    let raf = 0;

    const measure = (): void => {
      const rect = container.getBoundingClientRect();
      const size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
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
        fittedRef.current = false; // re-frame content when the surface resizes
        dirtyRef.current = true;
        interactionDirtyRef.current = true;
      }
    };

    const frame = (): void => {
      raf = requestAnimationFrame(frame);
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
      }
      if (dirtyRef.current) {
        paintScene(ctx, sceneRef.current, viewRef.current, size, palette, dpr);
        dirtyRef.current = false;
      }
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
          ),
        };
        paintInteractionLayer(ictx, overlay, size, palette, dpr);
        interactionDirtyRef.current = false;
      }
    };

    measure();
    frame();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(container);

    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            palette = resolveTsldPalette();
            dirtyRef.current = true;
            interactionDirtyRef.current = true;
          })
        : null;
    mo?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

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
      } else if (editing && modeRef.current === 'add-activity' && !pendingRef.current) {
        exitAddModeRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [editing]);

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const localPoint = (e: React.PointerEvent | React.MouseEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const machineCtx = () => ({ mode, view: viewRef.current, dataDate });
  const modifiersOf = (e: React.PointerEvent): Modifiers => ({ shift: e.shiftKey, alt: e.altKey });
  const classifyAt = (p: Point): HitZone =>
    classifyHit(sceneRef.current.activities, p, viewRef.current, dataDate);

  return (
    <div ref={containerRef} className="bg-card relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 block touch-none ${
          editing && mode === 'add-activity'
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
        onPointerDown={(e) => {
          // A create popover is open — the canvas is inert until it commits or cancels, so an
          // in-progress name (and its ghost) is never lost to a stray drag.
          if (pending) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          canvasRef.current?.setPointerCapture?.(e.pointerId);
          if (editing) {
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
          className="pointer-events-none absolute inset-0"
        />
      ) : null}
    </div>
  );
}
