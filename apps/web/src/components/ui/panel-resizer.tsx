import { useCallback } from 'react';

import { usePointerDrag } from './use-pointer-drag';

import { cn } from '@/lib/utils';

/**
 * Default keyboard step (px) for arrow-key resizing. Exported so a typed twin of a divider (the Gantt's
 * `View ▾` width fields) steps by the same amount rather than restating the number.
 */
export const KEY_STEP = 16;

/** The divider's thickness in px (`w-px` / `h-px` below), for a caller that budgets the space beside it. */
export const SPLITTER_WIDTH = 1;

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
  /**
   * Invert the arrow-key grow/shrink sense. The default assumes a start-anchored panel (grows as it
   * extends away from the origin — Right for a `vertical` divider, Up for a `horizontal` one). Set this
   * for an **end-anchored** panel — e.g. the right-docked notes panel, whose pointer-drag LEFT grows it —
   * so the keyboard matches the pointer (Left = grow, Right = shrink). Default `false` (start-anchored).
   */
  reverseKeys?: boolean;
  /**
   * How the grab strip grows under a **coarse pointer** (ADR-0188 D3; fine pointers always keep 25 px).
   * The strip is `--control-h` (44 px) across the divider's axis, which is wider than the gap some
   * dividers have on either side, so the consumer says which way it may grow:
   *
   * - `both` (default): centred on the line. It takes over the nearest 5 px of a neighbouring 44 px
   *   control where the gap is 17 px each side (M0 measured this at the docks and the activities
   *   panel); the neighbour keeps 39 of its 44.
   * - `outward`: keeps today's 12 px on the panel side and grows the other 32 px away from the panel
   *   the divider sizes, for a divider whose panel holds controls at the line (the Explorer's `⋯` and
   *   links end 5 to 13 px short of it). The stage side is not empty either — the activities table's
   *   select labels start there — but a 32 px reach leaves their centres alone.
   * - `none`: stays 25 px, and marks itself `data-coarse-exempt="divider"` so the coarse sweep counts
   *   it. Only where a wider strip would cover a neighbour's whole target and a typed equivalent
   *   exists — the Gantt grid divider, whose equivalent is View ▾ › Columns › Table width.
   */
  coarseStrip?: 'both' | 'outward' | 'none';
  /** Surface-specific styling (colour, visibility) merged onto the orientation base classes. */
  className?: string;
}

/**
 * The hit strip's coarse classes. Whole literals, so Tailwind sees them. The strip is 25 px
 * (`-3` either side of the 1 px line) with a mouse and a finger alike unless `coarseStrip` says
 * otherwise; `z-10` makes it win the pixels it grows into, which for the Explorer's outward half is
 * the stage — a positioned child of `main` that otherwise paints over it (M0: every sample from +1 to
 * +26 px hit the canvas, so today's right half is dead).
 */
function coarseStripClasses(
  orientation: 'vertical' | 'horizontal',
  strip: 'both' | 'outward',
  reverseKeys: boolean,
): string {
  if (orientation === 'vertical') {
    if (strip === 'both') {
      return 'pointer-coarse:z-10 pointer-coarse:inset-x-auto pointer-coarse:left-1/2 pointer-coarse:w-(--control-h) pointer-coarse:-translate-x-1/2';
    }
    // The panel is on the start side unless the keys are reversed (an end-anchored panel). The panel
    // side keeps today's 12 px and the rest of the 44 grows the other way.
    return reverseKeys
      ? 'pointer-coarse:z-10 pointer-coarse:inset-x-auto pointer-coarse:-right-3 pointer-coarse:w-(--control-h)'
      : 'pointer-coarse:z-10 pointer-coarse:inset-x-auto pointer-coarse:-left-3 pointer-coarse:w-(--control-h)';
  }
  if (strip === 'both') {
    return 'pointer-coarse:z-10 pointer-coarse:inset-y-auto pointer-coarse:top-1/2 pointer-coarse:h-(--control-h) pointer-coarse:-translate-y-1/2';
  }
  // A horizontal panel grows upward by default, so it sits below the line and outward is up.
  return reverseKeys
    ? 'pointer-coarse:z-10 pointer-coarse:inset-y-auto pointer-coarse:-top-3 pointer-coarse:h-(--control-h)'
    : 'pointer-coarse:z-10 pointer-coarse:inset-y-auto pointer-coarse:-bottom-3 pointer-coarse:h-(--control-h)';
}

/**
 * A **window splitter** (WAI-ARIA APG): an intentionally focusable, keyboard-operable
 * `separator` with a value/min/max so assistive tech announces the current size. Pointer drag
 * resizes; arrows nudge; Home/End jump to the bounds. The single divider implementation shared
 * by the Project Explorer rail (ADR-0029) and the plan workspace's activity panel (ADR-0030).
 *
 * **Touch contract (TECH_DEBT #439).** The separator is `touch-action: none`, so a finger drag
 * delivers its pointer moves to the divider for the whole gesture instead of the browser claiming
 * the gesture and ending it in `pointercancel` after a few pixels. The divider is a drag target
 * and nothing else, so it gives up panning and pinch over its own strip. `className` is merged
 * last, so a consumer could undo this; none may, and a structural test fails a `<PanelResizer>`
 * call site that passes a `touch-*` class.
 *
 * **Strip contract (TECH_DEBT #476, ADR-0188 D3).** The grab strip is 25 px with a mouse and
 * `--control-h` (44 px) with a finger, unless `coarseStrip` says `outward` or `none`. It is the
 * `[data-resizer-hit]` child, which is what the coarse sweep measures; the 1 px separator is not the
 * target. A `none` divider carries `data-coarse-exempt="divider"` so the sweep can count it.
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
  reverseKeys = false,
  coarseStrip = 'both',
  className,
}: PanelResizerProps): React.ReactElement {
  // The pointer half lives in `usePointerDrag` (shared with the Gantt's column edges, ADR-0173); this
  // component keeps the keyboard half. The keyboard path stays immediate (discrete steps).
  const pointer = usePointerDrag({ toValue: pointerToSize, onValue: onResize });

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // A (start-anchored) vertical divider grows with Right / shrinks with Left; a horizontal one
      // grows with Up (the panel expands upward) / shrinks with Down. `reverseKeys` swaps the pair for
      // an end-anchored panel (e.g. the right-docked notes panel). Home/End jump to the bounds either way.
      const growKey = orientation === 'vertical' ? 'ArrowRight' : 'ArrowUp';
      const shrinkKey = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowDown';
      const grow = reverseKeys ? shrinkKey : growKey;
      const shrink = reverseKeys ? growKey : shrinkKey;
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
    [orientation, onResize, size, keyStep, min, max, reverseKeys],
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
      onPointerDown={pointer.onPointerDown}
      onPointerMove={pointer.onPointerMove}
      onPointerUp={pointer.onPointerUp}
      onPointerCancel={pointer.onPointerCancel}
      onKeyDown={onKeyDown}
      {...(coarseStrip === 'none' ? { 'data-coarse-exempt': 'divider' } : {})}
      className={cn(
        // `touch-none` must be on the element that owns the pointer handlers; the hit-area child is covered by it (the effective touch-action is the intersection up the ancestors).
        'relative shrink-0 touch-none outline-none',
        vertical
          ? 'w-px cursor-col-resize focus-visible:w-0.5'
          : 'h-px cursor-row-resize focus-visible:h-0.5',
        className,
      )}
    >
      {/* Widen the pointer hit area to ≥24px over the 1px divider (WCAG 2.2 SC 2.5.8), and to 44 under
          a coarse pointer unless `coarseStrip` is `none`: the overflowing child bubbles pointer
          events to the separator. */}
      <span
        aria-hidden="true"
        data-resizer-hit=""
        className={cn(
          'absolute',
          vertical ? 'inset-y-0 -right-3 -left-3' : 'inset-x-0 -top-3 -bottom-3',
          coarseStrip === 'none'
            ? undefined
            : coarseStripClasses(orientation, coarseStrip, reverseKeys),
        )}
      />
    </div>
  );
}
