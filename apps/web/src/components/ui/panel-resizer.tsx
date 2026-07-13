import { useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

/** Default keyboard step (px) for arrow-key resizing. */
const KEY_STEP = 16;

export interface PanelResizerProps {
  /**
   * `vertical` = a vertical divider dragged horizontally to set a **width** (e.g. the Project
   * Explorer rail); `horizontal` = a horizontal divider dragged vertically to set a **height**
   * (e.g. the activity panel). Drives the ARIA orientation, cursor, hit-area, and arrow keys.
   */
  orientation: 'vertical' | 'horizontal';
  /** The current size (px) — width for `vertical`, height for `horizontal`. */
  size: number;
  min: number;
  max: number;
  /** Accessible name, e.g. "Resize Project Explorer". */
  label: string;
  /** Apply a new size (px). The caller clamps + persists. */
  onResize: (size: number) => void;
  /**
   * Map a pointer event to a candidate size. For a rail this is `(e) => e.clientX`; for a
   * bottom panel it is `(e) => panelBottom - e.clientY`. Kept with the caller because only it
   * knows the geometry (which edge the divider sits on).
   */
  pointerToSize: (event: React.PointerEvent<HTMLDivElement>) => number;
  keyStep?: number;
  /** Surface-specific styling (colour, visibility) merged onto the orientation base classes. */
  className?: string;
}

/**
 * A **window splitter** (WAI-ARIA APG): an intentionally focusable, keyboard-operable
 * `separator` with a value/min/max so assistive tech announces the current size. Pointer drag
 * resizes; arrows nudge; Home/End jump to the bounds. The single divider implementation shared
 * by the Project Explorer rail (ADR-0029) and the plan workspace's activity panel (ADR-0030).
 *
 * jsx-a11y treats `separator` as non-interactive, so the tabindex / handler rules are disabled
 * deliberately — the ARIA value + keyboard support are exactly what make it operable.
 */
export function PanelResizer({
  orientation,
  size,
  min,
  max,
  label,
  onResize,
  pointerToSize,
  keyStep = KEY_STEP,
  className,
}: PanelResizerProps): React.ReactElement {
  const draggingRef = useRef(false);
  // Pointer moves fire faster than paint (120Hz+ on some devices); coalesce them to at most one
  // `onResize` per animation frame. Each `onResize` re-renders the caller and writes the persisted
  // size, so throttling keeps a drag smooth (ADR-0030 perf review). The keyboard path stays
  // immediate (discrete steps).
  const rafRef = useRef<number | null>(null);
  const pendingSizeRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingSizeRef.current !== null) {
      onResize(pendingSizeRef.current);
      pendingSizeRef.current = null;
    }
  }, [onResize]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      pendingSizeRef.current = pointerToSize(event);
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
    },
    [pointerToSize, flush],
  );

  const stopDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      // Apply the final position immediately (don't wait a frame) and drop any queued move.
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      flush();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [flush],
  );

  // Cancel a queued frame if the splitter unmounts mid-drag.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // A vertical divider grows with Right / shrinks with Left; a horizontal one grows with Up
      // (the panel expands upward) / shrinks with Down. Home/End jump to the bounds either way.
      const grow = orientation === 'vertical' ? 'ArrowRight' : 'ArrowUp';
      const shrink = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowDown';
      switch (event.key) {
        case grow:
          onResize(size + keyStep);
          break;
        case shrink:
          onResize(size - keyStep);
          break;
        case 'Home':
          onResize(min);
          break;
        case 'End':
          onResize(max);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [orientation, onResize, size, keyStep, min, max],
  );

  const vertical = orientation === 'vertical';
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${size} pixels`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={onKeyDown}
      className={cn(
        'relative shrink-0 outline-none',
        vertical
          ? 'w-px cursor-col-resize focus-visible:w-0.5'
          : 'h-px cursor-row-resize focus-visible:h-0.5',
        className,
      )}
    >
      {/* Widen the pointer hit area to ≥24px over the 1px divider (WCAG 2.2 SC 2.5.8): the
          overflowing child bubbles pointer events to the separator. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute',
          vertical ? 'inset-y-0 -right-3 -left-3' : 'inset-x-0 -top-3 -bottom-3',
        )}
      />
    </div>
  );
}
