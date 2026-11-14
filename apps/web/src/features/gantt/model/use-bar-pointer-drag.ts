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
 * **Escape cancels, and so does the browser's `pointercancel`**, and cancelling is not the same as
 * dropping: the bar returns to where it was and nothing is written. Without it a planner who starts a drag by accident has to complete it and
 * then undo, which is two writes and a recalculation to fix a slip.
 *
 * Every window event is matched to the **pointer that started the gesture**: a second finger
 * landing mid-drag must not move, drop or cancel it.
 *
 * **A finger or a stylus drags only what it has selected** (ADR-0177 D2). A `touch` or `pen`
 * press on a bar that is not `touchArmed` returns first — before the refusal branch and without a
 * `preventDefault` — so the browser scrolls and the trailing click selects. It is a separate input
 * from `enabled` because flipping `enabled` would send an unarmed stylus down the refusal path and
 * announce a refusal nobody attempted. A mouse is never gated: its press is unambiguous.
 */

export interface BarPointerDrag {
  /** The live x offset from the drag's origin, or null when no drag is in progress. */
  deltaX: number | null;
  /** True while a drag is in progress — for the cursor and the ghost. */
  dragging: boolean;
  /**
   * Abandon a live gesture exactly as Escape or `pointercancel` would: the ghost is cleared, the
   * window and capture-phase Escape listeners are removed, nothing is written. A no-op between
   * gestures. The row's `contextmenu` handler calls it before opening a menu, so a press-and-hold
   * does not leave a drag half-alive underneath it.
   */
  cancel: () => void;
  /** True while a live gesture has moved past `DRAG_INTENT_PX` — a drag, not a hold that jittered. */
  intentExceeded: () => boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * The part of the scroller a drag may scroll, **in viewport pixels**: the scroller itself and the
 * span of it that shows the timeline (the sticky grid column covers the rest, so the timeline's left
 * edge is not the scroller's).
 */
export interface DragScrollRegion {
  scroller: HTMLElement;
  /** The viewport x where the visible timeline begins. */
  left: number;
  /** The viewport x where the visible timeline ends. */
  right: number;
}

/** How close (px) to the timeline's edge the pointer must be for the drag to scroll it. */
export const DRAG_SCROLL_EDGE_PX = 40;

/**
 * How fast (px a second) the timeline scrolls while the pointer is in that zone. **One steady rate,
 * with no easing and no smooth-scroll animation**, so a planner who has asked for reduced motion
 * gets nothing that moves on its own beyond what they are holding the pointer still to ask for.
 */
export const DRAG_SCROLL_PX_PER_SECOND = 600;

/**
 * How far (px) sideways a press must travel before it counts as a drag attempt rather than a tap or
 * a hold. One threshold for the refusal path and the row's `contextmenu` handler, so "this was a
 * drag" is not decided two ways.
 */
export const DRAG_INTENT_PX = 4;

export function useBarPointerDrag({
  enabled,
  touchArmed,
  onCommit,
  onRefused,
  scrollRegion,
}: {
  enabled: boolean;
  /** Whether a `touch` or `pen` press may start (or be refused) here — the bar is selected. */
  touchArmed: boolean;
  /** Called once per press that travels past a few pixels on a bar that is NOT draggable
   * (`enabled` false), so the refusal can be spoken instead of the bar silently ignoring a drag. */
  onRefused?: () => void;
  /** Called once, on release, with the total x movement. Never called for a cancelled drag. */
  onCommit: (deltaX: number) => void;
  /**
   * The timeline's scroller and visible span, when the drag should scroll it with the pointer near
   * an edge. The reported `deltaX` then counts how far the scroller has moved as well as the pointer,
   * because a bar drawn in the scrolling content has travelled both. Absent: a drag stays on screen.
   */
  scrollRegion?: () => DragScrollRegion | null;
}): BarPointerDrag {
  const [deltaX, setDeltaX] = useState<number | null>(null);

  // Everything the move handler needs, kept out of the render path.
  const originX = useRef(0);
  const liveDeltaX = useRef(0);
  const frame = useRef<number | null>(null);
  const cancelled = useRef(false);
  const lastClientX = useRef(0);
  const originScroll = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const lastScrollTick = useRef<number | null>(null);
  // Detaches the live gesture's window listeners, or null between gestures. Held in a ref so the
  // unmount effect can reach it: the release handler does not run for a row virtualized away.
  const teardown = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    setDeltaX(null);
  }, []);

  // A drag that outlives its component would keep listeners on the window and publish into a
  // setState on an unmounted tree. Cleared here rather than trusted to the release handler, which
  // by definition does not run if the row is virtualized away mid-drag. The listeners are removed
  // too, not only the frame: left attached, the next unrelated `pointerup` committed a dead drag.
  useEffect(
    () => () => {
      teardown.current?.();
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    teardown.current?.();
  }, []);

  const intentExceeded = useCallback(
    () => teardown.current !== null && Math.abs(liveDeltaX.current) > DRAG_INTENT_PX,
    [],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Primary button only. A right-click opening a context menu must not also start a drag, and a
      // middle-click must not scroll-and-drag at once.
      if (event.button !== 0) return;
      if ((event.pointerType === 'touch' || event.pointerType === 'pen') && !touchArmed) return;
      if (!enabled) {
        if (!onRefused) return;
        // A finger on a started bar is a scroll or a tap, never a drag attempt worth a refusal.
        if (event.pointerType === 'touch') return;
        const refusedId = event.pointerId;
        const startX = event.clientX;
        const end = (): void => {
          window.removeEventListener('pointermove', onRefusedMove);
          window.removeEventListener('pointerup', onRefusedEnd);
          window.removeEventListener('pointercancel', onRefusedEnd);
        };
        const onRefusedMove = (moveEvent: PointerEvent): void => {
          if (moveEvent.pointerId !== refusedId) return;
          // Horizontal only: a vertical mouse drag is a text selection, not an attempt to slide the bar.
          if (Math.abs(moveEvent.clientX - startX) <= DRAG_INTENT_PX) return;
          end();
          onRefused();
        };
        const onRefusedEnd = (endEvent: PointerEvent): void => {
          if (endEvent.pointerId === refusedId) end();
        };
        window.addEventListener('pointermove', onRefusedMove);
        window.addEventListener('pointerup', onRefusedEnd);
        window.addEventListener('pointercancel', onRefusedEnd);
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      // A second press while one gesture is live (the first's release was lost) replaces it.
      teardown.current?.();

      const pointerId = event.pointerId;
      originX.current = event.clientX;
      lastClientX.current = event.clientX;
      originScroll.current = scrollRegion?.()?.scroller.scrollLeft ?? 0;
      liveDeltaX.current = 0;
      cancelled.current = false;
      lastScrollTick.current = null;
      setDeltaX(0);

      const publish = (): void => {
        frame.current = null;
        setDeltaX(liveDeltaX.current);
      };

      // The pointer's travel plus the scroller's: the bar lives in the scrolling content, so what it
      // has moved is both, and the day under the pointer is read from the sum.
      const measureDelta = (): void => {
        const scrolled =
          (scrollRegion?.()?.scroller.scrollLeft ?? originScroll.current) - originScroll.current;
        liveDeltaX.current = lastClientX.current - originX.current + scrolled;
      };

      // While the pointer holds in an edge zone the timeline scrolls at a steady rate, so a bar can
      // be taken further than the screen shows. Driven by its own frame loop rather than by
      // pointermove, because a pointer held still at the edge sends none.
      const scrollTick = (timestamp: number): void => {
        scrollFrame.current = null;
        const region = scrollRegion?.();
        if (!region) return;
        // A press that has not yet become a drag must not scroll: a bar near the edge would otherwise
        // run away from a click.
        const pointer = lastClientX.current;
        const zone = Math.min(DRAG_SCROLL_EDGE_PX, (region.right - region.left) / 3);
        const direction =
          Math.abs(liveDeltaX.current) <= DRAG_INTENT_PX
            ? 0
            : pointer < region.left + zone
              ? -1
              : pointer > region.right - zone
                ? 1
                : 0;
        if (direction === 0) {
          lastScrollTick.current = null;
          return;
        }
        // Capped so a backgrounded tab's first frame back is not a lurch.
        const elapsed = lastScrollTick.current === null ? 16 : timestamp - lastScrollTick.current;
        lastScrollTick.current = timestamp;
        const before = region.scroller.scrollLeft;
        region.scroller.scrollLeft =
          before + (direction * DRAG_SCROLL_PX_PER_SECOND * Math.min(50, elapsed)) / 1000;
        if (region.scroller.scrollLeft !== before) {
          measureDelta();
          frame.current ??= requestAnimationFrame(publish);
        }
        scrollFrame.current = requestAnimationFrame(scrollTick);
      };

      const onMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== pointerId) return;
        lastClientX.current = moveEvent.clientX;
        measureDelta();
        // At most one publish per frame. Without this the row re-renders per pointermove, which on a
        // virtualized list is the whole window.
        frame.current ??= requestAnimationFrame(publish);
        if (scrollRegion !== undefined) scrollFrame.current ??= requestAnimationFrame(scrollTick);
      };

      const finish = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        teardown.current = null;
        if (scrollFrame.current !== null) {
          cancelAnimationFrame(scrollFrame.current);
          scrollFrame.current = null;
        }
        stop();
      };

      const onUp = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId !== pointerId) return;
        measureDelta();
        const total = liveDeltaX.current;
        const wasCancelled = cancelled.current;
        finish();
        // A drag that never moved is a click, and a click is a selection. Committing zero would
        // burn a version bump and a recalculation on a bar the planner merely touched.
        if (!wasCancelled && total !== 0) onCommit(total);
      };

      // The browser took the pointer over (a touch became a scroll, a gesture was claimed) and sent
      // `pointercancel` INSTEAD of `pointerup`. It is a cancel, not a drop: without it the window
      // listeners outlive the gesture and the next unrelated `pointerup` commits a stale delta.
      const onCancel = (cancelEvent: PointerEvent): void => {
        if (cancelEvent.pointerId !== pointerId) return;
        cancelled.current = true;
        finish();
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

      teardown.current = finish;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
    },
    [enabled, touchArmed, onCommit, onRefused, scrollRegion, stop],
  );

  return { deltaX, dragging: deltaX !== null, cancel, intentExceeded, onPointerDown };
}
