import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  clampAnchor,
  overlayMaxHeight,
  portalTarget,
  useMeasuredBox,
} from '@/components/ui/overlay-position';

/** Estimated panel box for the first paint only — the measured correction lands before paint. */
const ESTIMATED_WIDTH = 288;
const ESTIMATED_HEIGHT = 320;

/**
 * **The non-modal panel behind a toolbar disclosure**, extracted from {@link ToolbarPopover}
 * (ADR-0091 M7-S6) so a second control can host one without a second implementation.
 *
 * There is exactly one thing this hook is for. `Go to date` merges into `Go to today` as a split
 * button, and its caret has to open the same kind of panel `View ▾` and `Summary ▾` open — anchored,
 * clamped to the viewport, closed by Escape, by an outside pointer press and by focus leaving, and
 * portalled so it escapes the row's clip. Every one of those behaviours has a defect recorded
 * against it, and this repository's standing finding is that two implementations of one behaviour
 * drift **invisibly**: each looks right alone, and only a reader who opens both would ever see one
 * is a version behind (ADR-0062's extraction argument; ADR-0065's `routeOrthogonal`).
 *
 * **Positioning is the shared `overlay-position` leaf** (fix-slice M-C, TECH_DEBT #203(b)): this
 * hook used to clamp against an estimate ONLY — it never measured, so a panel taller than 320 px
 * overflowed the viewport with its lower controls pointer-unreachable, and `View ▾` carried a
 * local `max-h-[60vh]` workaround naming the estimate as the cause. The panel now measures itself,
 * clamps against its real box, and caps its height to the space below the clamped top with its own
 * scroll — so the workaround is deleted and the next tall panel needs none.
 *
 * **`ToolbarPopover`'s public props are unchanged by the extraction**, which is what makes
 * `ToolbarPopover.test.tsx` the before/after oracle: it passes untouched, or the move was not a move.
 *
 * The **trigger** is deliberately not part of this. `ToolbarPopover`'s trigger is a labelled
 * disclosure with a caret; the split button's is two halves with separate gates. They share a panel,
 * not a button, and pretending otherwise is how a shared component grows a `variant` prop for every
 * consumer.
 */
export interface PopoverPanel {
  open: boolean;
  /** Anchor the panel under `triggerRef`'s box and open it. No-op before the trigger has mounted. */
  openPanel: () => void;
  /** Close it; `restoreFocus` returns focus to the trigger (never to a `tabIndex={-1}` caret). */
  close: (restoreFocus: boolean) => void;
  /** The panel element, portalled past any clipping ancestor, or `null` while closed. */
  panel: (label: string, children: React.ReactNode) => React.ReactNode;
}

export function usePopoverPanel({
  triggerRef,
  align = 'start',
}: {
  /**
   * The element the panel anchors to and returns focus to. For a split button this is the
   * **primary** half: the caret is `tabIndex={-1}`, so restoring focus there strands a keyboard user
   * (WCAG 2.4.3 — shipped once, and caught by the ADR-0064 enablement review).
   */
  triggerRef: React.RefObject<HTMLElement | null>;
  align?: 'start' | 'end';
}): PopoverPanel {
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** The trigger's box at open time — position derives from it plus the panel's measured box. */
  const [triggerBox, setTriggerBox] = useState<{ left: number; right: number; bottom: number }>({
    left: 0,
    right: 0,
    bottom: 0,
  });

  const openPanel = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTriggerBox({ left: rect.left, right: rect.right, bottom: rect.bottom });
    setOpen(true);
  };

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // The measured clamp (shared leaf). `align === 'end'` hangs the panel's END from the trigger's
  // right edge, so the x fed to the clamp depends on the panel's own width — the estimate for the
  // first paint, the measurement before the browser paints (useMeasuredBox is a layout effect).
  const box = useMeasuredBox(panelRef, triggerBox, open);
  const width = box?.width ?? ESTIMATED_WIDTH;
  const height = box?.height ?? ESTIMATED_HEIGHT;
  const { left, top } = clampAnchor(
    { x: align === 'end' ? triggerBox.right - width : triggerBox.left, y: triggerBox.bottom + 4 },
    width,
    height,
  );
  /**
   * The panel's height ceiling (fix-slice M-C, corrected at the M-G gate pass): the whole
   * viewport, less a margin at each end. A panel taller than that scrolls INSIDE itself
   * (`overflow-y: auto`) instead of running off-screen — #203(a): a control below the fold in an
   * unscrollable panel is present in the DOM and unreachable by pointer, the same class the
   * menu's measured clamp fixed one primitive over. Deliberately NOT derived from the clamped
   * `top`: that is self-referential and reintroduces the defect (see {@link overlayMaxHeight}).
   */
  const maxHeight = overlayMaxHeight();

  // While open: move focus into the panel; Escape / outside-pointer close it, and — since the panel
  // may hold no focusable content (Summary/Legend are static) — **Tab out of it closes it too**,
  // rather than leaving an open panel behind while focus lands elsewhere in DOM order (WCAG 2.4.3 /
  // 2.4.7). `focusout` with `relatedTarget` outside both panel and trigger is that "focus left" signal.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // **Both, and `preventDefault` is the load-bearing one** (#196a, its third copy — the fix
        // landed in `Menu` and `Combobox` and this file kept only `stopPropagation`).
        // `stopPropagation` keeps the key from other LISTENERS; a modal `<dialog>`'s
        // Escape-to-close is a **default action**, checked against `defaultPrevented` after the
        // whole dispatch finishes, so propagation is irrelevant to it. Without `preventDefault`
        // one Escape closes this panel AND fires the enclosing dialog's close request.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onFocusOut = (event: FocusEvent): void => {
      const next = event.relatedTarget as Node | null;
      if (next && (panelRef.current?.contains(next) || triggerRef.current?.contains(next))) return;
      // Focus left the panel entirely (Tab/Shift-Tab or programmatic) — close without stealing it back.
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer, true);
    panel?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer, true);
      panel?.removeEventListener('focusout', onFocusOut);
    };
  }, [open, triggerRef]);

  const panel = (label: string, children: React.ReactNode): React.ReactNode =>
    open
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            style={{ position: 'fixed', left, top, maxHeight }}
            className="border-border bg-popover text-popover-foreground z-50 max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-md border p-3 shadow-md outline-none"
          >
            {children}
          </div>,
          // The shared target (fix-slice M-C): the topmost open modal `<dialog>` when one is open.
          // No `ToolbarPopover` renders inside a modal today (verified: the deck is not inside
          // one), so this is latent — fixed for `sheet.tsx`'s stated reason that a convention is
          // not a property of the primitive.
          portalTarget(),
        )
      : null;

  return { open, openPanel, close, panel };
}
