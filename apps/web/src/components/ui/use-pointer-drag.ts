import { useCallback, useEffect, useRef } from 'react';

export interface UsePointerDragOptions<E extends HTMLElement> {
  /**
   * Map a pointer event to a candidate value. Kept with the caller because only it knows the
   * geometry (which edge the handle sits on, what the value is measured from).
   */
  toValue: (event: React.PointerEvent<E>) => number;
  /** Apply a value. Called at most once per animation frame while dragging, and once on release. */
  onValue: (value: number) => void;
  /** A press began: capture whatever the gesture is measured from (a start width, a start x). */
  onStart?: (event: React.PointerEvent<E>) => void;
  /** A gesture that had begun ended (release or cancel), after the last value was applied. */
  onEnd?: () => void;
}

export interface PointerDragHandlers<E extends HTMLElement> {
  onPointerDown: (event: React.PointerEvent<E>) => void;
  onPointerMove: (event: React.PointerEvent<E>) => void;
  onPointerUp: (event: React.PointerEvent<E>) => void;
  onPointerCancel: (event: React.PointerEvent<E>) => void;
}

/**
 * The pointer half of a divider, lifted out of `PanelResizer` so a second handle (the Gantt's
 * column edges, ADR-0173) drags exactly as the first does.
 *
 * **Keyboard contract: none — it claims no key.** `PanelResizer` keeps its arrows, Home and End
 * itself; a handle that wants keys owns them. Pointer contract: `pointerdown` captures;
 * `pointermove` while captured is coalesced to one `onValue` per animation frame; `pointerup` and
 * `pointercancel` apply the last value immediately and release capture; unmount cancels a queued
 * frame and does NOT call `onEnd` (the gesture never finished, and its owner is gone).
 *
 * Pointer moves fire faster than paint (120Hz+ on some devices), and each `onValue` re-renders the
 * caller, so coalescing keeps a drag smooth (ADR-0030 perf review).
 */
export function usePointerDrag<E extends HTMLElement = HTMLElement>({
  toValue,
  onValue,
  onStart,
  onEnd,
}: UsePointerDragOptions<E>): PointerDragHandlers<E> {
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current !== null) {
      onValue(pendingRef.current);
      pendingRef.current = null;
    }
  }, [onValue]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<E>) => {
      draggingRef.current = true;
      onStart?.(event);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [onStart],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<E>) => {
      if (!draggingRef.current) return;
      pendingRef.current = toValue(event);
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
    },
    [toValue, flush],
  );

  const stopDragging = useCallback(
    (event: React.PointerEvent<E>) => {
      const wasDragging = draggingRef.current;
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
      if (wasDragging) onEnd?.();
    },
    [flush, onEnd],
  );

  // Cancel a queued frame if the handle unmounts mid-drag. Cleared too, so a StrictMode
  // re-mount (which reuses the refs) does not resume a drag nobody is holding.
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      pendingRef.current = null;
      draggingRef.current = false;
    },
    [],
  );

  return { onPointerDown, onPointerMove, onPointerUp: stopDragging, onPointerCancel: stopDragging };
}
