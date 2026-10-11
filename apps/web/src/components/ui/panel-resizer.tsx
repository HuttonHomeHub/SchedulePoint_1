import { useCallback, useId, useRef } from 'react';

import { Button } from './button';
import { SizeField, useSizeNotice } from './size-field';
import { usePointerDrag } from './use-pointer-drag';
import { clampSize } from './use-resizable-panel-prefs';

import { usePopoverPanel } from '@/components/ui/toolbar/use-popover-panel';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';
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
  /**
   * What the size is, for the box a press opens, e.g. "Project Explorer width" or "Activities panel
   * height". **Required**, so a new divider cannot ship without its single-pointer alternative to a
   * drag (WCAG 2.5.7, ADR-0188 D1) — a structural test counts the call sites that pass one.
   */
  sizeLabel: string;
  /**
   * Put the size back on its standard. Offers "Reset to standard" in the size box; absent ⇒ no button.
   * Every consumer's prefs hook knows its default (`resetSize`), so passing it is the rule.
   */
  onReset?: () => void;
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
   * The grab strip under a **coarse pointer** (ADR-0188 D3; a mouse always keeps 25 px).
   *
   * - `finger` (default): `--control-h` (44 px) across the divider's axis, centred on the line. The gap
   *   either side of most dividers is 17 or 18 px (M0), so it takes the nearest 5 px of a neighbouring
   *   44 px control and the first control of the selection bar beside the Explorer; every neighbour
   *   keeps its centre and at least 27 px of its box.
   * - `none`: stays 25 px, and marks itself `data-coarse-exempt="divider"` so the coarse sweep counts
   *   it. Only where a wider strip would cover a neighbour's whole target and a typed equivalent
   *   exists — the Gantt grid divider, whose equivalent is View ▾ › Columns › Table width. A structural
   *   test lists the exceptions.
   */
  coarseStrip?: 'finger' | 'none';
  /** Surface-specific styling (colour, visibility) merged onto the orientation base classes. */
  className?: string;
}

/**
 * The hit strip's coarse classes, centred on the line. Whole literals, so Tailwind sees them. The strip
 * is 25 px (`-3` either side of the 1 px line) with a mouse; the `z-10` that lets it win the stage's
 * pixels is on the element itself, for every pointer.
 */
const FINGER_STRIP = {
  vertical:
    'pointer-coarse:inset-x-auto pointer-coarse:left-1/2 pointer-coarse:w-(--control-h) pointer-coarse:-translate-x-1/2',
  horizontal:
    'pointer-coarse:inset-y-auto pointer-coarse:top-1/2 pointer-coarse:h-(--control-h) pointer-coarse:-translate-y-1/2',
} as const;

/** How soon after a pointer gesture ends a `click` is that gesture's own (the browser fires one after a press or a drag). */
const CLICK_AFTER_GESTURE_MS = 500;

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
 * `--control-h` (44 px) with a finger, unless `coarseStrip` says `none`. It is the
 * `[data-resizer-hit]` child, which is what the coarse sweep measures; the 1 px separator is not the
 * target. A `none` divider carries `data-coarse-exempt="divider"` so the sweep can count it.
 *
 * **Press-to-size (TECH_DEBT #442, ADR-0188 D1).** A drag is the only pointer route to a size, and
 * WCAG 2.5.7 asks for a single-pointer alternative that is not a keyboard one. So a press that does not
 * move (under 4 px, `PRESS_SLOP_PX`) opens a small, non-modal box at the divider holding a
 * {@link SizeField} and "Reset to standard"; a click with no preceding press — a screen reader's
 * browse-mode "click" — opens it too. **No key opens it**: the arrows, Home and End already reach every
 * value (2.1.1) and the separator keeps them. Enter or blur in the field applies; Escape closes the box
 * and returns focus here; a press elsewhere closes it and focus goes where that press went. The box is
 * a SIBLING of the separator, not a child: a portal child's pointer and key events bubble to its React
 * parent, and the separator's drag and arrow handlers would act on the field's.
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
  sizeLabel,
  onReset,
  onResize,
  pointerToSize,
  keyStep = KEY_STEP,
  reverseKeys = false,
  coarseStrip = 'finger',
  className,
}: PanelResizerProps): React.ReactElement {
  const separatorRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const sizeBox = usePopoverPanel({ triggerRef: separatorRef, initialFocus: fieldRef });
  // The box unmounts with its divider (a dock closes, the window narrows past a dock's range). If focus
  // was in it, the browser drops it to <body>; hand it to the page's main region and say so (ADR-0135).
  // **Held here, on the divider, and not inside the box**: React's StrictMode simulates an unmount of a
  // freshly mounted component, and a box that mounts with focus going into it would hand that focus
  // away on the spot and close itself (found in the first journey run).
  const handoff = useContainerUnmountHandoff({
    target: '#main',
    message: `${sizeLabel} box closed.`,
  });
  // The time the last pointer gesture ended, to tell a click that FOLLOWS a press or a drag (the
  // browser fires one after both) from an assistive technology's synthesised one, which has no
  // gesture before it. Same clock as `event.timeStamp`.
  const gestureEndedAt = useRef(Number.NEGATIVE_INFINITY);

  const onPress = (event: React.PointerEvent<HTMLDivElement>): void => {
    // A second press on the divider while the box is open puts it away, like any disclosure.
    if (sizeBox.open) sizeBox.close(true);
    else sizeBox.openPanel({ x: event.clientX + 8, y: event.clientY });
  };

  // The pointer half lives in `usePointerDrag` (shared with the Gantt's column edges, ADR-0173); this
  // component keeps the keyboard half. The keyboard path stays immediate (discrete steps).
  const pointer = usePointerDrag({ toValue: pointerToSize, onValue: onResize, onPress });

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
    <>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={separatorRef}
        role="separator"
        aria-orientation={orientation}
        aria-label={label}
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={`${size} pixels`}
        // The affordance a pointer user has: nothing else says the line can be pressed. (A native
        // `title`, because the Tooltip primitive's long-press and click swallowing would fight this
        // element's own pointer handlers; it is a hint for a mouse, and the box itself is the control.)
        title="Drag to resize, or click to type a size"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        onPointerDown={pointer.onPointerDown}
        onPointerMove={pointer.onPointerMove}
        onPointerUp={(event) => {
          gestureEndedAt.current = event.timeStamp;
          pointer.onPointerUp(event);
        }}
        onPointerCancel={(event) => {
          gestureEndedAt.current = event.timeStamp;
          pointer.onPointerCancel(event);
        }}
        onClick={(event) => {
          if (event.timeStamp - gestureEndedAt.current < CLICK_AFTER_GESTURE_MS) {
            // A touch tap is followed by compatibility mouse events AFTER the press has opened the
            // box, and their mousedown focuses the separator (it is a tab stop), taking the focus the
            // box just gave its field. The click is the last of them, so the field takes it back.
            if (sizeBox.open) fieldRef.current?.focus();
            return;
          }
          // No gesture before it: an assistive technology's "click". Anchor at the divider's middle.
          const rect = event.currentTarget.getBoundingClientRect();
          sizeBox.openPanel({ x: rect.left + 8, y: rect.top + rect.height / 2 });
        }}
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
            // `z-10`: the strip wins the pixels it covers over the stage, a positioned child of `main`
            // that otherwise paints over the Explorer's stage-side half (M0 §2: every sample from +1
            // to +26 px hit the canvas), which left a mouse a 13 px strip and a click on the line
            // itself landing on the diagram.
            'absolute z-10',
            vertical ? 'inset-y-0 -right-3 -left-3' : 'inset-x-0 -top-3 -bottom-3',
            coarseStrip === 'none' ? undefined : FINGER_STRIP[orientation],
          )}
        />
      </div>
      {sizeBox.panel(
        `Set ${sizeLabel}`,
        <div {...handoff} className="flex flex-col gap-2">
          <SizeBox
            subject={sizeLabel}
            size={size}
            min={min}
            max={max}
            step={keyStep}
            onResize={onResize}
            {...(onReset ? { onReset } : {})}
            fieldRef={fieldRef}
          />
        </div>,
      )}
    </>
  );
}

/**
 * The box a press opens: one {@link SizeField}, the range in words, "Reset to standard" where the
 * consumer has one, and the polite status that says when a typed value was limited (ADR-0173: never
 * changed silently). Its own component so the notice state lives and dies with the box.
 */
function SizeBox({
  subject,
  size,
  min,
  max,
  step,
  onResize,
  onReset,
  fieldRef,
}: {
  subject: string;
  size: number;
  min: number;
  max: number;
  step: number;
  onResize: (size: number) => void;
  onReset?: () => void;
  fieldRef: React.RefObject<HTMLInputElement | null>;
}): React.ReactElement {
  const hintId = useId();
  const { setNotice, status } = useSizeNotice();
  return (
    <>
      <SizeField
        subject={subject}
        value={size}
        min={min}
        max={max}
        step={step}
        hintId={hintId}
        inputRef={fieldRef}
        apply={(next) => {
          // The caller clamps and persists too; clamping here is what tells the field the truth.
          const applied = clampSize(next, min, max);
          onResize(applied);
          return applied;
        }}
        onNotice={setNotice}
      />
      <p id={hintId} className="text-muted-foreground text-xs">
        {min} to {max} pixels. Drag the line, or type a size and press Enter.
      </p>
      {onReset ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onReset();
            setNotice(`${subject} reset to standard.`);
          }}
        >
          Reset to standard
        </Button>
      ) : null}
      {status}
    </>
  );
}
