import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Estimated panel box, to clamp the anchor before the real size is known (mirrors `Menu`). */
const CLAMP_MARGIN = 8;
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
  /** The panel element, portalled to `document.body`, or `null` while closed. */
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
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });

  const openPanel = (): void => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = align === 'end' ? rect.right - ESTIMATED_WIDTH : rect.left;
    const maxLeft = Math.max(CLAMP_MARGIN, window.innerWidth - ESTIMATED_WIDTH - CLAMP_MARGIN);
    const maxTop = Math.max(CLAMP_MARGIN, window.innerHeight - ESTIMATED_HEIGHT - CLAMP_MARGIN);
    setAnchor({
      left: Math.min(Math.max(CLAMP_MARGIN, left), maxLeft),
      top: Math.min(Math.max(CLAMP_MARGIN, rect.bottom + 4), maxTop),
    });
    setOpen(true);
  };

  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

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
            style={{ position: 'fixed', left: anchor.left, top: anchor.top }}
            className="border-border bg-popover text-popover-foreground z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-md border p-3 shadow-md outline-none"
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return { open, openPanel, close, panel };
}
