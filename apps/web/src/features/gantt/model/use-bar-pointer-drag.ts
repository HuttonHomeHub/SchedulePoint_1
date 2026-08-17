import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * **Dragging a bar with a pointer, without re-rendering per pointermove.**
 *
 * A pointermove fires at the display's refresh rate or faster. Putting the cursor position into
 * React state means a render of the row — and, through the virtualizer, potentially the window —
 * for every one of them. The canvas learnt this and the rule is the same here: the live position
 * lives in a **ref**, a `requestAnimationFrame` publishes it at most once a frame, and only that
 * publish touches state.
 *
 * The frame is cancelled on release and on unmount. A leaked rAF is the failure this shape is prone
 * to and it fails silently — ADR-0064 chose an effect cleanup for its recalculation holds for the
 * same reason.
 *
 * **Escape cancels**, and cancelling is not the same as dropping: the bar returns to where it was
 * and nothing is written. Without it a planner who starts a drag by accident has to complete it and
 * then undo, which is two writes and a recalculation to fix a slip.
 */

export interface BarPointerDrag {
  /** The live x offset from the drag's origin, or null when no drag is in progress. */
  deltaX: number | null;
  /** True while a drag is in progress — for the cursor and the ghost. */
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

export function useBarPointerDrag({
  enabled,
  onCommit,
}: {
  enabled: boolean;
  /** Called once, on release, with the total x movement. Never called for a cancelled drag. */
  onCommit: (deltaX: number) => void;
}): BarPointerDrag {
  const [deltaX, setDeltaX] = useState<number | null>(null);

  // Everything the move handler needs, kept out of the render path.
  const originX = useRef(0);
  const liveDeltaX = useRef(0);
  const frame = useRef<number | null>(null);
  const cancelled = useRef(false);

  const stop = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setDeltaX(null);
  }, []);

  // A drag that outlives its component would keep listeners on the window and publish into a
  // setState on an unmounted tree. Cleared here rather than trusted to the release handler, which
  // by definition does not run if the row is virtualized away mid-drag.
  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Primary button only. A right-click opening a context menu must not also start a drag, and a
      // middle-click must not scroll-and-drag at once.
      if (!enabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      originX.current = event.clientX;
      liveDeltaX.current = 0;
      cancelled.current = false;
      setDeltaX(0);

      const publish = (): void => {
        frame.current = null;
        setDeltaX(liveDeltaX.current);
      };

      const onMove = (moveEvent: PointerEvent): void => {
        liveDeltaX.current = moveEvent.clientX - originX.current;
        // At most one publish per frame. Without this the row re-renders per pointermove, which on a
        // virtualized list is the whole window.
        frame.current ??= requestAnimationFrame(publish);
      };

      const finish = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        stop();
      };

      const onUp = (): void => {
        const total = liveDeltaX.current;
        const wasCancelled = cancelled.current;
        finish();
        // A drag that never moved is a click, and a click is a selection. Committing zero would
        // burn a version bump and a recalculation on a bar the planner merely touched.
        if (!wasCancelled && total !== 0) onCommit(total);
      };

      const onKey = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key !== 'Escape') return;
        // Capture phase, and stopped here: while a drag is live, Escape belongs to the drag. The
        // grid's own Escape rung and the canvas-era window listener must not also fire — ADR-0079's
        // rule, and ADR-0080's ladder, applied to a gesture.
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        cancelled.current = true;
        finish();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    },
    [enabled, onCommit, stop],
  );

  return { deltaX, dragging: deltaX !== null, onPointerDown };
}
