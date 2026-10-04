import { useCallback, useRef } from 'react';

import { RULER_HEIGHT } from './GanttRuler';

import { usePointerDrag } from '@/components/ui/use-pointer-drag';

export interface GanttColumnEdgeProps {
  /** The width the gesture is measured from, read at the press so a re-render mid-drag cannot move it. */
  startWidth: () => number;
  /** Apply a width for this frame. Not stored — `onCommit` is the one write. */
  onDrag: (width: number) => void;
  /** The gesture ended: store once. */
  onCommit: () => void;
  /** Double-click: this column back to its standard width. */
  onReset: () => void;
}

/**
 * **The pointer-only edge of a column header** (ADR-0173 D3). It is `aria-hidden` and unfocusable on
 * purpose: seven more Tab stops between the sort buttons and the rows, and an arrow-key contest with
 * the treegrid's own handler (the ADR-0111 #192 shape), would be bought to duplicate what the
 * `View ▾` width fields already give — and a keyboard step is not WCAG 2.5.7's single-pointer
 * alternative to a drag, where a typed field is. The equivalent is stated at the field.
 *
 * Under `pointer: coarse` it is not rendered at all (`pointer-coarse:hidden`): a 44 px strip on a
 * 60 px Float column would cover that column's sort control, so the fields are the touch route.
 * `touch-none` is for a hybrid device whose finger is on a fine-primary screen: it drags rather than
 * scrolls.
 *
 * The strip is 24 px wide (WCAG 2.5.8) centred on the boundary and the header row's full height. It
 * stops propagation on the press and the click so a drag never reaches the treegrid or a sort button.
 */
export function GanttColumnEdge({
  startWidth,
  onDrag,
  onCommit,
  onReset,
}: GanttColumnEdgeProps): React.ReactElement {
  const origin = useRef({ x: 0, width: 0 });

  const onStart = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      origin.current = { x: event.clientX, width: startWidth() };
    },
    [startWidth],
  );
  const toValue = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) =>
      origin.current.width + (event.clientX - origin.current.x),
    [],
  );
  const pointer = usePointerDrag<HTMLSpanElement>({
    toValue,
    onValue: onDrag,
    onStart,
    onEnd: onCommit,
  });

  return (
    <span
      aria-hidden="true"
      data-gantt-column-edge=""
      style={{ height: RULER_HEIGHT }}
      className="group absolute -right-3 bottom-0 z-10 w-6 cursor-col-resize touch-none select-none pointer-coarse:hidden"
      onPointerDown={(event) => {
        event.stopPropagation();
        pointer.onPointerDown(event);
      }}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerCancel}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
    >
      <span className="group-hover:bg-ring absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-transparent" />
    </span>
  );
}
