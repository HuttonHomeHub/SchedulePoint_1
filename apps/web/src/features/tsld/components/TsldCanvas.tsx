import { useEffect, useRef } from 'react';

import {
  IDLE,
  reduce,
  type EditIntent,
  type EditMode,
  type GestureState,
} from '../interaction/gesture-machine';
import { paintInteractionLayer, paintScene, type TsldScene } from '../render/paint';
import { resolveTsldPalette } from '../render/palette';
import {
  classifyHit,
  dayCellRect,
  DEFAULT_VIEWPORT,
  fitToContent,
  hitTest,
  pan,
  zoomAt,
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
  /** Called with a committed edit + the drop point (screen, container-relative). */
  onIntent?: (intent: EditIntent, anchor: Point) => void;
  /** A dropped create awaiting its name/commit — drawn as a pending ghost. */
  pending?: PendingGhost | null;
}

function getDpr(): number {
  return Math.min(globalThis.devicePixelRatio || 1, 2);
}

/** The live ghost rect for the in-flight gesture, or null when idle. */
function liveGhostRect(state: GestureState, view: Viewport): Rect | null {
  if (state.kind === 'creating') {
    const left = Math.min(state.originDay, state.currentDay);
    const right = Math.max(state.originDay, state.currentDay);
    return dayCellRect(left, right, state.laneIndex, view);
  }
  return null;
}

/**
 * The Canvas 2D TSLD painter (ADR-0026). Draws the plan's computed schedule from the pure
 * render model, with cursor-anchored wheel zoom and drag-to-pan; the canvas is
 * **`aria-hidden`** (assistive tech uses the parallel representation in {@link TsldPanel}).
 *
 * **M2:** when `editing` is on, a second, pointer-transparent **interaction canvas** sits on
 * top and paints the live/pending edit ghost, and pointer-downs are routed through the pure
 * {@link reduce gesture machine}: in `add-activity` mode a drag draws a create ghost and
 * emits a `create` intent on release; in `select` mode it stays the M1 pan/select path.
 * Committed edits go to `onIntent`; `TsldPanel` owns the mutation + recalc (ADR-0026 D8).
 * With `editing` off this is byte-for-byte the M1 read-only canvas.
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
  onIntent,
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

  const sceneRef = useRef<TsldScene>({ activities, edges, dataDate, selectedId });

  useEffect(() => {
    fittedRef.current = false;
    dirtyRef.current = true;
  }, [fitSignal, dataDate]);

  useEffect(() => {
    sceneRef.current = { activities, edges, dataDate, selectedId };
    dirtyRef.current = true;
    interactionDirtyRef.current = true;
  }, [activities, edges, dataDate, selectedId]);

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
        const live = liveGhostRect(gestureRef.current, viewRef.current);
        const p = pendingRef.current;
        const pendingRect = p
          ? dayCellRect(p.startDay, p.endDay, p.laneIndex, viewRef.current)
          : null;
        paintInteractionLayer(ictx, live, pendingRect, size, palette, dpr);
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

    // Esc cancels an in-flight edit gesture (no intent emitted).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && gestureActiveRef.current) {
        gestureActiveRef.current = false;
        gestureRef.current = reduce(
          gestureRef.current,
          { type: 'escape' },
          { mode: 'select', view: viewRef.current, dataDate: sceneRef.current.dataDate },
        ).state;
        interactionDirtyRef.current = true;
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
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          canvasRef.current?.setPointerCapture?.(e.pointerId);
          if (editing) {
            const p = localPoint(e);
            const hit = classifyHit(sceneRef.current.activities, p, viewRef.current, dataDate);
            const { state } = reduce(
              gestureRef.current,
              { type: 'pointerDown', point: p, hit },
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
            const { state } = reduce(
              gestureRef.current,
              { type: 'pointerMove', point: localPoint(e) },
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
            const anchor = localPoint(e);
            const { state, intent } = reduce(
              gestureRef.current,
              { type: 'pointerUp' },
              machineCtx(),
            );
            gestureRef.current = state;
            interactionDirtyRef.current = true;
            drag.current = null;
            if (intent) onIntent?.(intent, anchor);
            return;
          }
          const wasDrag = drag.current?.moved ?? false;
          drag.current = null;
          if (wasDrag) return;
          const p = localPoint(e);
          onSelect(hitTest(sceneRef.current.activities, p, viewRef.current, dataDate));
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
