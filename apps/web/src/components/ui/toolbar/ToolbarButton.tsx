import { forwardRef, useId } from 'react';

import type { ToolbarLabelState } from './toolbar-registry';
import { toolbarControlVariants, toolbarLabelClass } from './toolbar-styles';

import { useTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The default control a {@link Toolbar} renders for an `onActivate` item: an icon+label button that
 * reflects the item's resolved gating. `pressed` maps to `aria-pressed` for toggle/segment items;
 * a disabled button carries `aria-disabled` rather than the native `disabled` attribute so it
 * **stays focusable** — a keyboard/AT user can still land on it and hear why it's off (WCAG 2.4.3 /
 * the ADR-0028 read-only reason), and roving tabindex isn't broken.
 *
 * **The reason is `aria-describedby`-linked, not only a `title`.** It was title-only until the W5
 * enablement pass, which is the house failure pattern this codebase has now been caught by four
 * times: a reason placed *near* a control rather than *associated* with it. `title` is a hover
 * tooltip — no mainstream browser shows it on keyboard focus — so a sighted keyboard-only planner
 * who tabbed to a shaded Duplicate got a dimmed button and nothing else, unable to tell "not
 * allowed right now" from "broken". The docblock above already claimed the reason was reachable,
 * which is exactly how it survived: the sentence described the intent and the markup did not.
 * Fixing it here repairs every pen-gated toolbar item at once — Edit, Delete, Dissolve and the rest
 * share this primitive.
 */
export interface ToolbarButtonProps {
  /** The item id — stamped as `data-toolbar-item` so the toolbar can focus it by query (roving). */
  itemId: string;
  label: string;
  /**
   * Supplementary tooltip clause (`<name> — <description>`), never the accessible name. Required in
   * practice for a `'roomy'` item, whose tooltip is the only thing naming it once the label goes —
   * `defineToolbar` refuses one without.
   */
  description?: string;
  icon?: React.ReactNode;
  /**
   * Whether the label shows, **already resolved** by `resolveLabelVisibility` — this component never
   * decides (SC-8). `'visible'` (default) paints it; `'hidden'` is icon-only (name → `aria-label`);
   * `'roomy'` paints it `sr-only` below the deck's `--container-roomy`. Either of the latter two
   * names itself with the Tooltip primitive, so the tooltip is mounted whenever the label *can* be
   * absent, and the container query alone decides whether it is.
   */
  labelState?: ToolbarLabelState;
  pressed?: boolean;
  /**
   * Which picture a pressed control takes (console epic M3). `'armed'` is a modal tool holding the
   * next canvas gesture; `'selected'` (the default) is a toggle or a chosen segment. Ignored unless
   * {@link pressed} is true — a control that is not pressed is at rest whatever kind it would be.
   */
  activeKind?: 'armed' | 'selected' | 'primary';
  /**
   * The command's work is in flight → `aria-busy="true"`. Paired with (not replaced by) an animated
   * icon: the app reduces every animation to 0.01 ms under `prefers-reduced-motion`, so a spin is
   * the only busy cue a motion-averse user does **not** get.
   */
  busy?: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
  /** A description read on focus — see `ToolbarItem.srDescription`. Independent of `disabled`. */
  srDescription?: string | undefined;
  tabIndex: number;
  onActivate: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void;
  className?: string;
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    {
      itemId,
      label,
      description,
      icon,
      labelState = 'visible',
      pressed,
      activeKind,
      busy,
      disabled,
      disabledReason,
      srDescription,
      tabIndex,
      onActivate,
      onKeyDown,
      onFocus,
      className,
    },
    ref,
  ) {
    // **Two tooltip channels, chosen by whether the label can be absent — and exactly one of them
    // is ever live.** A control whose label is always painted keeps the native hover `title`: its
    // name is visible and the title is a supplementary clause (a live `description`, or the reason
    // while shaded). A control whose label can be absent (`'hidden'` or `'roomy'`) names itself with
    // the Tooltip primitive instead, below, and carries no `title` at all — a native title beside
    // the tooltip would be two tips on one hover. This was one boolean, `showLabel`, that selected
    // the title, the tooltip and the purpose together, which is why `'roomy'` (label present on a
    // wide deck, absent on a narrow one, in the same render) could not be expressed.
    const tipped = labelState !== 'visible';
    const reasonId = useId();
    const srDescriptionId = useId();
    // Only when there IS a reason: an `aria-describedby` pointing at an element that renders nothing
    // is a dangling reference, which some AT reads as an empty description rather than as absence.
    const reasonRef = disabled && disabledReason ? reasonId : undefined;
    // A persistent description (ADR-0094 M3-T2) — a fact visible beside the control that the name
    // does not carry. Independent of `disabled`: `next-conflict` needs its count read whether it is
    // actionable or not.
    const srRef = srDescription ? srDescriptionId : undefined;
    // **Reason first when both apply.** A shaded control's most useful sentence is why it is shut;
    // the standing fact reads after it.
    const describedBy = [reasonRef, srRef].filter(Boolean).join(' ') || undefined;
    // When a reason node is rendered, the accessible NAME is pinned to `label` via `aria-label`.
    // The span has to live inside the button — that is this component's single root, and a sibling
    // would need a wrapper the toolbar's flex layout and its `data-toolbar-focusable` query both
    // assume is absent — and a button's name comes from its content, so without the pin the reason
    // would be appended to the name as well as the description: "Duplicate Take the edit lock to
    // change this plan." Thirteen existing toolbar tests caught that the moment it was written,
    // which is the argument for the primitive having them.
    // The text both channels share. Labelled: only a description adds anything, and a shaded
    // control's reason owns the tip (the description is not appended there). Tipped: the tip is the
    // name, so it always has text — `<name> — <description>`, `<name> — <reason>` or the bare name.
    const liveTitle = description ? `${label} — ${description}` : tipped ? label : undefined;
    const title = disabled
      ? tipped
        ? disabledReason
          ? `${label} — ${disabledReason}`
          : label
        : disabledReason
      : liveTitle;
    /**
     * **The tooltip is the Tooltip primitive, not `title`** (fix-slice M-B — #131/#204(a),
     * ADR-0117). `title` is hover-only: no mainstream browser shows it on keyboard focus and touch
     * has no hover at all, so a control with no visible label was unreadable to exactly the users
     * with the least other signal. The content is the SAME string the `title` carried —
     * character-identical, or copy has silently changed.
     *
     * `purpose` is DERIVED (the M-B accessibility review's finding 2): a tip carrying a live
     * `description` is saying MORE than the name, and pre-M-B its `title` reached AT as the
     * accessible description, so `'name-echo'` would have silently stranded that text from AT.
     * `'description'` restores exactly that. The shaded branch stays `'name-echo'`: its reason
     * already rides the `aria-describedby` reason span below, and linking the tooltip too would
     * read it twice. `'name-echo'` is also `aria-hidden`, so AT hears nothing new and nothing twice.
     */
    const tipPurpose = tipped && description && !disabled ? 'description' : 'name-echo';
    const tip = useTooltip({
      content: tipped ? title : undefined,
      purpose: tipPurpose,
      disabled: !tipped,
    });
    // The tooltip's own description id (only ever set for `'description'`) joins the reason/sr
    // chain — the explicit `aria-describedby` below would otherwise overwrite the spread's.
    const labelClass = toolbarLabelClass(labelState);
    const fullDescribedBy =
      [tip.triggerProps['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined;
    return (
      <button
        // Spread FIRST, exactly as the primitive's own recipe shows, so a key added to
        // `triggerProps` later reaches the DOM without this file knowing (the M-B component
        // review's blocking finding: hand-wiring each handler is the invisible-drift shape the
        // shared leaf exists to prevent). Only the two keys that genuinely need composition are
        // overridden below: `ref` (merged with the forwarded one) and `onFocus` (composed with
        // the roving-focus callback).
        {...tip.triggerProps}
        ref={(el) => {
          tip.triggerProps.ref(el);
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        type="button"
        data-toolbar-focusable=""
        data-toolbar-item={itemId}
        // aria-disabled (not `disabled`) keeps the control focusable so the reason is reachable.
        aria-disabled={disabled || undefined}
        {...(busy ? { 'aria-busy': true } : {})}
        {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
        {...(!tipped && !describedBy ? {} : { 'aria-label': label })}
        {...(!tipped && title ? { title } : {})}
        {...(fullDescribedBy ? { 'aria-describedby': fullDescribedBy } : {})}
        tabIndex={tabIndex}
        onClick={() => {
          if (!disabled) onActivate();
        }}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          tip.triggerProps.onFocus(event);
          onFocus?.(event);
        }}
        className={cn(
          toolbarControlVariants({
            state: pressed === true ? (activeKind ?? 'selected') : 'rest',
            disabled: disabled === true,
          }),
          className,
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        ) : null}
        {labelClass ? <span className={labelClass}>{label}</span> : null}
        {reasonRef ? (
          <span id={reasonId} className="sr-only">
            {disabledReason}
          </span>
        ) : null}
        {srRef ? (
          <span id={srDescriptionId} className="sr-only">
            {srDescription}
          </span>
        ) : null}
        {tip.tooltip}
      </button>
    );
  },
);
