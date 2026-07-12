import { useCallback, useRef } from 'react';

import { RAIL_MAX_WIDTH, RAIL_MIN_WIDTH } from './use-rail-prefs';

/** Keyboard step (px) for arrow-key resizing. */
const KEY_STEP = 16;

/**
 * The divider between the pinned rail and the workspace, operable by pointer **and**
 * keyboard (WCAG 2.2). It is an ARIA `separator` with a value/min/max so assistive
 * tech announces the current width; arrows nudge it, Home/End jump to the bounds.
 * The rail's left edge sits at the shell row's origin, so the pointer's `clientX`
 * is the candidate width directly.
 */
export function RailResizer({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}): React.ReactElement {
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) onResize(event.clientX);
    },
    [onResize],
  );

  const stopDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'ArrowLeft':
          onResize(width - KEY_STEP);
          break;
        case 'ArrowRight':
          onResize(width + KEY_STEP);
          break;
        case 'Home':
          onResize(RAIL_MIN_WIDTH);
          break;
        case 'End':
          onResize(RAIL_MAX_WIDTH);
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [onResize, width],
  );

  return (
    // A "window splitter" is an intentionally focusable, keyboard-operable separator
    // (WAI-ARIA APG). jsx-a11y treats `separator` as non-interactive, so the tabindex /
    // handler rules are disabled here deliberately — the ARIA value + keyboard support
    // above are exactly what make it operable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Project Explorer"
      aria-valuenow={width}
      aria-valuemin={RAIL_MIN_WIDTH}
      aria-valuemax={RAIL_MAX_WIDTH}
      aria-valuetext={`${width} pixels`}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={onKeyDown}
      className="bg-sidebar-border/60 hover:bg-sidebar-border focus-visible:bg-sidebar-ring relative hidden w-px shrink-0 cursor-col-resize outline-none focus-visible:w-0.5 lg:block"
    >
      {/* Widen the actual pointer hit area to ≥24px over the 1px divider (WCAG 2.2
          SC 2.5.8): the overflowing child bubbles pointer events to the separator. */}
      <span aria-hidden="true" className="absolute inset-y-0 -right-3 -left-3" />
    </div>
  );
}
