import { ChevronDown } from 'lucide-react';
import { useId, useRef } from 'react';

import type { ToolbarItemRenderApi } from './toolbar-registry';
import { toolbarControlVariants } from './toolbar-styles';
import { usePopoverPanel } from './use-popover-panel';

import { cn } from '@/lib/utils';

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
  activeKind,
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
  /**
   * Reflect an **engaged** state on the trigger even while the panel is closed (e.g. an attribute
   * filter is on), so the cue survives closing the popover.
   *
   * It read *"`aria-pressed`/active becomes `open || active` … Absent ⇒ pressed only while open"*
   * until the console epic's M3, and both halves are now false: an open disclosure reports
   * `aria-expanded` and no `aria-pressed` at all, and it paints the `open` state rather than the
   * engaged one. Corrected rather than deleted, because the old sentence is what the three
   * consumers were written against.
   */
  active?: boolean;
  /**
   * Which picture an engaged trigger takes — see `ToolbarItem.activeKind`. It outranks `open`:
   * `selected` paints `open`'s fill plus an underline, so an engaged trigger keeps its mark while
   * the panel is showing instead of losing it exactly when the planner opened the panel to check.
   */
  activeKind?: 'armed' | 'selected';
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
  // The panel itself is `usePopoverPanel` (ADR-0091 M7-S6) — anchor, clamp, Escape, outside-pointer
  // and focus-left, and the portal. Extracted so the merged `Go to today ▾` split button can host
  // the same panel without a second implementation of behaviours this repository has already fixed
  // defects in. This component's props did not change, which is what makes its suite the oracle.
  const { open, openPanel, close, panel } = usePopoverPanel({ triggerRef, align });

  return (
    <>
      <button
        {...itemProps}
        ref={triggerRef}
        type="button"
        aria-disabled={disabled || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        // **`aria-pressed` reports the item's own state, never whether the panel is open**
        // (console epic M3-T4). It read `open || active`, which said "pressed" to a screen reader
        // about a disclosure that is merely showing — a fact `aria-expanded` on the same element
        // already carries, and one that made an open menu indistinguishable from an armed tool for
        // both an AT user and the state ladder. A trigger that declares no `isActive` now reports
        // no `aria-pressed` at all while open.
        //
        // **Not "what the APG disclosure pattern asks for"**, which is how this read until the
        // accessibility review: that pattern does not mention `aria-pressed` anywhere, because a
        // canonical disclosure has no pressed state to report. This control is a hybrid — a toggle
        // that also owns a panel — so the argument is the plainer one: `aria-expanded` already says
        // the panel is showing, and `aria-pressed` should answer a different question or say
        // nothing. Only `Filter ▾` is affected in practice; the other three triggers pass no
        // `active` at all, so the guard above was already false for them.
        {...(active !== undefined ? { 'aria-pressed': active } : {})}
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
          toolbarControlVariants({
            // **The item's own state outranks the transient fact that its panel is showing** — the
            // same rule `ToolbarSplitButton` uses, so the two primitives need not be reasoned about
            // separately. `selected`'s class is `open`'s plus an underline, so a filtered
            // `Filter ▾` keeps its underline while open rather than losing it at the moment the
            // planner opened the menu to check. Open with nothing else true still paints the fill.
            state: active === true ? (activeKind ?? 'selected') : open ? 'open' : 'rest',
            disabled: disabled === true,
          }),
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        ) : null}
        {compact ? null : <span className="truncate">{label}</span>}
        <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
        {describedBy ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
      </button>

      {panel(label, children)}
    </>
  );
}
