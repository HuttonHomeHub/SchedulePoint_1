import { ChevronDown } from 'lucide-react';
import { useId, useRef } from 'react';

import type { ToolbarItemRenderApi, ToolbarLabelState } from './toolbar-registry';
import { toolbarControlVariants, toolbarLabelClass } from './toolbar-styles';
import { useCloseWhenChanged } from './use-close-when-changed';
import { usePopoverPanel } from './use-popover-panel';

import { useTooltip } from '@/components/ui/tooltip';
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
  description,
  align = 'start',
  panelWidth = 'default',
  labelState = 'visible',
  closeOnChangeOf,
  badge,
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
  activeKind?: 'armed' | 'selected' | 'primary';
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
  /**
   * What the control is for, as a sentence — the tooltip an **icon-only** trigger names itself with
   * (`<label> — <description>`). Ignored while the label is painted, because a visible name needs no
   * tip. An icon-only trigger without one tips its bare name (ADR-0117's `'name-echo'`).
   *
   * The tooltip is the Tooltip primitive and not a native `title`: `title` is hover-only, which is
   * the gap ADR-0117 closed for `ToolbarButton`, and this trigger became icon-only for the first
   * time when Summary moved to the plan's identity row (toolbar-redesign M2-T1). It stands down
   * while the panel is open, so the tip never lies across the panel it opened.
   */
  description?: string;
  /** Align the panel's inline-start (`start`) or inline-end (`end`) to the trigger. */
  align?: 'start' | 'end';
  /** How wide the panel may grow — see {@link usePopoverPanel}. `'wide'` is for a panel in columns. */
  panelWidth?: 'default' | 'wide';
  /**
   * Whether the visible label shows — pass the render API's `labelState`, already resolved by
   * `resolveLabelVisibility`. `'hidden'` withholds it: the name moves to `aria-label` + the native
   * tooltip, so the control keeps its **name**. An icon-only `<button>` whose only child is an
   * `aria-hidden` glyph has no accessible name at all, which is the failure mode a `sr-only` span
   * would also solve — `aria-label` is chosen because this trigger's name is a plain string it
   * already receives, with no markup to preserve.
   *
   * This replaced a `compact` boolean (ADR-0090 M3-T3) that the row's `collapsed` band set and that
   * no band could set after ADR-0109 D1. A trigger cannot be `'roomy'`: it has only a native
   * `title`, and `defineToolbar` refuses the declaration.
   */
  labelState?: ToolbarLabelState;
  /**
   * Close the panel when this value changes (compared with `Object.is`). The promotion ladder passes
   * its stage: a resize can move a row out of the panel, and the panel is portalled where nothing
   * inside it sees that. Focus inside the panel as it closes goes to the trigger, announced
   * ({@link useCloseWhenChanged}). Absent ⇒ the panel is never closed by a prop.
   */
  closeOnChangeOf?: unknown;
  /**
   * **How many things are engaged**, drawn as a count on the glyph's corner (toolbar-redesign M6
   * V4a: `Filter ▾` with attributes on). It costs the row no width — it sits on the icon's corner, not
   * beside it — which matters because the LOOK row at 1024 has about 28 px to spare with a conflict
   * chip showing. `description` is the sentence a screen reader gets ("2 filters on") through
   * `aria-describedby`, since the number itself is `aria-hidden`: a bare "2" inside a button's name
   * would read as part of it. The trigger's own `aria-pressed` already says that SOMETHING is on;
   * this says how much, in the same place for a sighted reader. Absent or zero ⇒ nothing is drawn.
   */
  badge?: { count: number; description: string };
  children: React.ReactNode;
}): React.ReactElement {
  const reasonId = useId();
  const badgeId = useId();
  const badged = badge !== undefined && badge.count > 0;
  // Only when there IS a reason: an `aria-describedby` pointing at an element that renders nothing is
  // a dangling reference, which some AT reads as an empty description rather than as absence.
  const reasonDescribedBy = disabled === true && disabledReason ? reasonId : undefined;
  const describedBy =
    [reasonDescribedBy, badged ? badgeId : undefined].filter(Boolean).join(' ') || undefined;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelClass = toolbarLabelClass(labelState);
  const iconOnly = labelClass === null;
  // The panel itself is `usePopoverPanel` (ADR-0091 M7-S6) — anchor, clamp, Escape, outside-pointer
  // and focus-left, and the portal. Extracted so the merged `Go to today ▾` split button can host
  // the same panel without a second implementation of behaviours this repository has already fixed
  // defects in. This component's props did not change, which is what makes its suite the oracle.
  const { open, openPanel, close, panel } = usePopoverPanel({
    triggerRef,
    align,
    panelWidth,
  });
  useCloseWhenChanged(closeOnChangeOf, open, () => close(false), triggerRef);
  // Purpose is derived exactly as `ToolbarButton` derives it: a tip carrying a `description` says
  // MORE than the name, so it is linked to the control; one that restates the name is not, or a
  // screen reader says the name twice. A shaded trigger's reason already rides `aria-describedby`.
  const tipped = iconOnly && !open;
  const tip = useTooltip({
    content: iconOnly
      ? disabled === true && disabledReason
        ? `${label} — ${disabledReason}`
        : description
          ? `${label} — ${description}`
          : label
      : undefined,
    purpose: description && disabled !== true ? 'description' : 'name-echo',
    disabled: !tipped,
  });
  const fullDescribedBy =
    [tip.triggerProps['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined;

  return (
    <>
      <button
        {...itemProps}
        // Spread after `itemProps` and before the two keys that need composing, as `ToolbarButton`
        // does: a key added to the tooltip's `triggerProps` later reaches the DOM without this file
        // knowing. Both are inert unless the trigger is icon-only and closed.
        {...tip.triggerProps}
        ref={(el) => {
          tip.triggerProps.ref(el);
          triggerRef.current = el;
        }}
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
        {...(iconOnly || describedBy ? { 'aria-label': label } : {})}
        // A disabled reason still wins the tooltip: "why can't I press this" outranks "what is it",
        // and in that state the `aria-label` is already carrying the name. An icon-only trigger
        // speaks through the Tooltip primitive above instead of a native `title` — two tips on one
        // hover — so it keeps a `title` only when the caller passes one.
        {...(iconOnly
          ? title
            ? { title }
            : {}
          : (title ?? disabledReason)
            ? { title: title ?? disabledReason }
            : {})}
        {...(fullDescribedBy ? { 'aria-describedby': fullDescribedBy } : {})}
        onFocus={(event) => {
          tip.triggerProps.onFocus(event);
          itemProps.onFocus?.();
        }}
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
          <span aria-hidden="true" className="relative inline-flex shrink-0 items-center">
            {icon}
            {badged ? (
              // Out past the glyph's corner (`-top-2 -right-2`) and smaller (`h-3.5`), so it no longer
              // covers the funnel; `min-w-3.5 px-0.5` lets two characters ("9+") widen it into a pill
              // instead of spilling, and the count stops at 9+ (the sentence says the exact number).
              <span className="bg-foreground text-background text-micro absolute -top-2 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5">
                {badge.count > 9 ? '9+' : badge.count}
              </span>
            ) : null}
          </span>
        ) : null}
        {labelClass ? <span className={labelClass}>{label}</span> : null}
        <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
        {reasonDescribedBy ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
        {badged ? (
          <span id={badgeId} className="sr-only">
            {badge.description}
          </span>
        ) : null}
        {tip.tooltip}
      </button>

      {panel(label, children)}
    </>
  );
}
