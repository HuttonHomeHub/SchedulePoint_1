import { forwardRef } from 'react';

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
        {...(disabled && disabledReason ? { title: disabledReason } : {})}
        tabIndex={tabIndex}
        onClick={() => {
          if (!disabled) onActivate();
        }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className={cn(
          'focus-visible:ring-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset',
          pressed ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60',
          disabled && 'cursor-default opacity-50',
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
