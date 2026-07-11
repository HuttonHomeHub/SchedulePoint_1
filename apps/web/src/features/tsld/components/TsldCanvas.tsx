import { useEffect, useRef } from 'react';

import { paintScene, type TsldScene } from '../render/paint';
import { resolveTsldPalette } from '../render/palette';
import {
  DEFAULT_VIEWPORT,
  fitToContent,
  hitTest,
  pan,
  zoomAt,
  type RenderActivity,
  type RenderEdge,
  type Size,
  type Viewport,
} from '../render/render-model';

const CLICK_MOVE_THRESHOLD_PX = 4;

export interface TsldCanvasProps {
  activities: readonly RenderActivity[];
  edges: readonly RenderEdge[];
  dataDate: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Bump to re-fit the viewport to the content (the toolbar's "Fit" button). */
  fitSignal: number;
}

/**
 * The Canvas 2D TSLD painter (ADR-0026, M1 read-only). Draws the plan's computed
 * schedule from the pure render model on a single `<canvas>`, with cursor-anchored wheel
 * zoom and drag-to-pan. The canvas is **`aria-hidden`** — assistive tech uses the
 * parallel focusable representation in {@link TsldPanel}; this element is pointer chrome
 * only. Drawing is imperative off refs (never React state per frame): a
 * `requestAnimationFrame` loop repaints only dirty frames, so idle costs nothing. The
 * palette is resolved from semantic tokens and re-resolved on theme change.
 *
 * `selectedId` drives a selection ring; a click that isn't a drag hit-tests and calls
 * `onSelect`. Editing (create/move/logic) is deliberately out of this milestone.
 */
export function TsldCanvas({
  activities,
  edges,
  dataDate,
  selectedId,
  onSelect,
  fitSignal,
}: TsldCanvasProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<Viewport>(DEFAULT_VIEWPORT);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const dirtyRef = useRef(true);
  const fittedRef = useRef(false);

  // Keep the latest scene inputs in a ref so the rAF loop reads current data without
  // being torn down/recreated each render. The loop reads `sceneRef.current`
  // asynchronously, so it is written from an effect (not during render).
  const sceneRef = useRef<TsldScene>({ activities, edges, dataDate, selectedId });

  // Re-fit on demand (toolbar) and whenever the plan identity changes.
  useEffect(() => {
    fittedRef.current = false;
    dirtyRef.current = true;
  }, [fitSignal, dataDate]);

  // Publish the latest scene to the loop and mark dirty on any input change.
  useEffect(() => {
    sceneRef.current = { activities, edges, dataDate, selectedId };
    dirtyRef.current = true;
  }, [activities, edges, dataDate, selectedId]);

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
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        canvas.width = Math.round(size.width * dpr);
        canvas.height = Math.round(size.height * dpr);
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
        fittedRef.current = false; // re-frame content when the surface resizes
        dirtyRef.current = true;
      }
    };

    const frame = (): void => {
      raf = requestAnimationFrame(frame);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const size = sizeRef.current;
      if (!fittedRef.current && size.width > 1) {
        const withDates = sceneRef.current.activities.some((a) => a.earlyStart !== null);
        viewRef.current = withDates
          ? fitToContent(sceneRef.current.activities, size, sceneRef.current.dataDate)
          : DEFAULT_VIEWPORT;
        fittedRef.current = true;
        dirtyRef.current = true;
      }
      if (!dirtyRef.current) return;
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      paintScene(ctx, sceneRef.current, viewRef.current, size, palette, dpr);
      dirtyRef.current = false;
    };

    measure();
    frame();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(container);

    // Repaint with fresh token values when the theme flips (root class/attr change).
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            palette = resolveTsldPalette();
            dirtyRef.current = true;
          })
        : null;
    mo?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    // Cursor-anchored wheel zoom. Attached natively as a **non-passive** listener so it can
    // `preventDefault` — a React `onWheel` prop is passive at the root and would let the
    // gesture scroll the page instead of zooming the diagram.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      viewRef.current = zoomAt(
        viewRef.current,
        e.clientX - rect.left,
        e.deltaY < 0 ? 1.1 : 1 / 1.1,
      );
      dirtyRef.current = true;
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      mo?.disconnect();
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Pointer pan + click-to-select (drag past a threshold suppresses the click).
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const localPoint = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div ref={containerRef} className="bg-card relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          canvasRef.current?.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > CLICK_MOVE_THRESHOLD_PX) drag.current.moved = true;
          viewRef.current = pan(viewRef.current, dx, dy);
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
          dirtyRef.current = true;
        }}
        onPointerUp={(e) => {
          const wasDrag = drag.current?.moved ?? false;
          drag.current = null;
          if (wasDrag) return;
          const p = localPoint(e);
          onSelect(hitTest(sceneRef.current.activities, p, viewRef.current, dataDate));
        }}
      />
    </div>
  );
}
