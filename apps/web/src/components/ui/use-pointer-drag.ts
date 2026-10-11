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
  /**
   * The primary button or a finger went down and came up **without moving more than
   * {@link PRESS_SLOP_PX}** — a press, not a drag (ADR-0188 D1). Fires after `onEnd`, never on a
   * cancel, and never for a secondary button. **Giving this option also withholds `onValue` until the
   * pointer has moved past the slop**, so finger jitter on a tap cannot nudge the size it is about to
   * offer to type. A handle that passes no `onPress` is unchanged. It still claims no key.
   */
  onPress?: (event: React.PointerEvent<E>) => void;
}

/**
 * How far (CSS px, straight line) a pointer may travel between press and release and still be a press.
 * 4 px is a default, not a measurement: a finger's jitter on a tap is read on the Surface sheet
 * (`device-checklist.md`, step 26), and a mouse click moves 0 to 2.
 */
export const PRESS_SLOP_PX = 4;

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
  onPress,
}: UsePointerDragOptions<E>): PointerDragHandlers<E> {
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  /** Where the press began, and whether the pointer has since gone past the slop. */
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  /** Set only for a primary-button press on a handle that listens for one. */
  const pressableRef = useRef(false);

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
      startRef.current = { x: event.clientX, y: event.clientY };
      movedRef.current = false;
      pressableRef.current = onPress !== undefined && event.button === 0;
      onStart?.(event);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [onStart, onPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<E>) => {
      if (!draggingRef.current) return;
      if (pressableRef.current && !movedRef.current) {
        const start = startRef.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < PRESS_SLOP_PX) {
          return;
        }
        movedRef.current = true;
      }
      pendingRef.current = toValue(event);
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(flush);
    },
    [toValue, flush],
  );

  const stopDragging = useCallback(
    (event: React.PointerEvent<E>, released: boolean) => {
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
      if (wasDragging) {
        onEnd?.();
        if (released && pressableRef.current && !movedRef.current) onPress?.(event);
      }
    },
    [flush, onEnd, onPress],
  );
  const onPointerUp = useCallback(
    (event: React.PointerEvent<E>) => stopDragging(event, true),
    [stopDragging],
  );
  const onPointerCancel = useCallback(
    (event: React.PointerEvent<E>) => stopDragging(event, false),
    [stopDragging],
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

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
