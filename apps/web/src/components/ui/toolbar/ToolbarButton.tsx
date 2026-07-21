import { forwardRef } from 'react';

import { toolbarControlVariants } from './toolbar-styles';

import { cn } from '@/lib/utils';

/**
 * The default control a {@link Toolbar} renders for an `onActivate` item: an icon+label button that
 * reflects the item's resolved gating. `pressed` maps to `aria-pressed` for toggle/segment items;
 * a disabled button carries `aria-disabled` + `title` (the `disabledReason`) rather than the native
 * `disabled` attribute so it **stays focusable** — a keyboard/AT user can still land on it and hear
 * why it's off (WCAG 2.4.3 / the ADR-0028 read-only reason), and roving tabindex isn't broken.
 */
export interface ToolbarButtonProps {
  /** The item id — stamped as `data-toolbar-item` so the toolbar can focus it by query (roving). */
  itemId: string;
  label: string;
  /** Supplementary hover-tooltip clause appended to the `title` (never the accessible name). */
  description?: string;
  icon?: React.ReactNode;
  /** Show the text label beside the icon (Tier-1 emphasis); icon-only otherwise (label → aria-label). */
  showLabel?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  disabledReason?: string | undefined;
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
      showLabel,
      pressed,
      disabled,
      disabledReason,
      tabIndex,
      onActivate,
      onKeyDown,
      onFocus,
      className,
    },
    ref,
  ) {
    // Native hover tooltip. A labelled button already shows its name, so its `title` only needs to
    // explain a disabled state. An **icon-only** button shows nothing, so it always gets a `title`
    // naming it — `<name>` when live, `<name> — <reason>` when disabled (e.g. "Colour by… — coming
    // soon"), so hovering any icon tells the user what it is even before the feature ships. When the
    // item carries a {@link description}, it's appended to the live title (never to a disabled-reason
    // title, which the reason already owns) so a terse command becomes self-explanatory on hover.
    const liveBase = showLabel ? undefined : label;
    const withDescription = (base: string | undefined): string | undefined =>
      description ? (base ? `${base} — ${description}` : description) : base;
    const title = disabled
      ? showLabel
        ? disabledReason
        : disabledReason
          ? `${label} — ${disabledReason}`
          : label
      : withDescription(liveBase);
    return (
      <button
        ref={ref}
        type="button"
        data-toolbar-focusable=""
        data-toolbar-item={itemId}
        // aria-disabled (not `disabled`) keeps the control focusable so the reason is reachable.
        aria-disabled={disabled || undefined}
        {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
        {...(showLabel ? {} : { 'aria-label': label })}
        {...(title ? { title } : {})}
        tabIndex={tabIndex}
        onClick={() => {
          if (!disabled) onActivate();
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          toolbarControlVariants({ active: pressed === true, disabled: disabled === true }),
          className,
        )}
      >
        {icon ? (
          <span aria-hidden="true" className="inline-flex shrink-0 items-center">
            {icon}
          </span>
        ) : null}
        {showLabel ? <span className="truncate">{label}</span> : null}
      </button>
    );
  },
);
