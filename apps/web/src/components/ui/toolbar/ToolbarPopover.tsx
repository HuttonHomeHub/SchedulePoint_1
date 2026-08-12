import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ToolbarItemRenderApi } from './toolbar-registry';
import { toolbarControlVariants } from './toolbar-styles';

import { cn } from '@/lib/utils';

/** Estimated panel box, to clamp the anchor before the real size is known (mirrors `Menu`). */
const CLAMP_MARGIN = 8;
const ESTIMATED_WIDTH = 288;
const ESTIMATED_HEIGHT = 320;

/**
 * A **Tier-2 labelled disclosure** for the {@link Toolbar} — the `View▾` / `Summary▾` / `Legend▾`
 * buttons. A non-modal popover (unlike the action-only `Menu`): the trigger is a roving-tabindex
 * member of the toolbar (spread `itemProps` from the item's `render` api), and the panel hosts
 * **arbitrary content** (checkbox groups, the summary strip, the legend). Escape and an outside
 * pointer press close it, restoring focus to the trigger — matching `Menu`/`Dialog` conventions.
 * Rendered in a portal so it escapes the toolbar's `overflow-hidden` clip.
 */
export function ToolbarPopover({
  label,
  icon,
  itemProps,
  disabled,
  active,
  title,
  disabledReason,
  align = 'start',
  compact = false,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  /** From the toolbar item's `render(ctx, api)` — joins the trigger to the roving tab order. */
  itemProps: ToolbarItemRenderApi['itemProps'];
  disabled?: boolean;
  /** Reflect an **engaged** state on the trigger even while the panel is closed (e.g. an attribute
   * filter is on) — `aria-pressed`/active becomes `open || active`, so the cue survives closing the
   * popover (mirrors the Colour-by picker's `api.active || open`). Absent ⇒ pressed only while open. */
  active?: boolean;
  /** Native tooltip on the trigger. Absent ⇒ no title. */
  title?: string;
  /**
   * Why this trigger is shut, **programmatically associated** — an `sr-only` sibling wired by
   * `aria-describedby`, exactly as {@link ToolbarButton} and `MenuItem` do it (ADR-0082).
   *
   * **A `title` is not a substitute, and this component shipped believing it was.** `ToolbarButton`'s
   * own docblock records the finding: *"no mainstream browser shows it on keyboard focus… a sighted
   * keyboard-only planner who tabbed to a shaded control got a dimmed button and nothing else."* That
   * fix landed on the plain button and not on its neighbour here — the shape this repository keeps
   * recording (ADR-0064 §7, ADR-0067 M4, ADR-0073 C4, ADR-0086 M6) — and the ADR-0090 M5
   * accessibility gate found it on the live path: `Filter` is `isEnabled: (ctx) => ctx.hasDiagram`,
   * so every empty or uncomputed plan reaches it.
   *
   * Also fills the tooltip when no explicit {@link title} is given, so the two cannot disagree.
   */
  disabledReason?: string;
  /** Align the panel's inline-start (`start`) or inline-end (`end`) to the trigger. */
  align?: 'start' | 'end';
  /**
   * Icon-only trigger (ADR-0090 M3-T3): the visible label is withheld and moves to `aria-label` +
   * the native tooltip, so the control keeps its **name** while giving back roughly 60 px.
   *
   * Set from the row's `collapsed` band and nothing else. The measured reason: at 960 px Row 1's six
   * remaining controls lay out 11 px wider than their container and at 768 px 203 px wider, and four
   * of the six are this component — so one prop here is most of the collapse.
   *
   * **The name moves; it does not disappear.** An icon-only `<button>` whose only child is an
   * `aria-hidden` glyph has no accessible name at all, which is the failure mode a `sr-only` span
   * would also solve — `aria-label` is chosen because this trigger's name is a plain string it
   * already receives, with no markup to preserve.
   */
  compact?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const reasonId = useId();
  // Only when there IS a reason: an `aria-describedby` pointing at an element that renders nothing is
  // a dangling reference, which some AT reads as an empty description rather than as absence.
  const describedBy = disabled === true && disabledReason ? reasonId : undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
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
        close(true);
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
        close(false);
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
  }, [open]);

  return (
    <>
      <button
        {...itemProps}
        ref={triggerRef}
        type="button"
        aria-disabled={disabled || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        {...(active !== undefined ? { 'aria-pressed': open || active } : {})}
        // The name is pinned whenever a reason span is rendered, for the same reason `ToolbarButton`
        // pins it: the span lives inside the button, and a button's name comes from its content, so
        // without this the reason would be appended to the name as well as the description
        // ("Filter Add an activity first").
        {...(compact || describedBy ? { 'aria-label': label } : {})}
        // A disabled reason still wins the tooltip: "why can't I press this" outranks "what is it",
        // and in that state the `aria-label` is already carrying the name.
        {...((title ?? disabledReason)
          ? { title: title ?? disabledReason }
          : compact
            ? { title: label }
            : {})}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        onClick={() => {
          if (disabled) return;
          if (open) close(false);
          else openPanel();
        }}
        className={cn(
          toolbarControlVariants({ active: open || active === true, disabled: disabled === true }),
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        ) : null}
        {compact ? null : <span className="truncate">{label}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5 opacity-70" />
        {describedBy ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
      </button>

      {open
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
        : null}
    </>
  );
}
