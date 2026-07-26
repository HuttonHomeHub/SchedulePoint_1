import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

const toggleChipVariants = cva(
  'focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2.5 text-xs',
      },
      pressed: {
        // Pressed state is carried by fill AND border, never by colour alone — a chip that
        // only changed hue would be invisible to a user who cannot distinguish it.
        true: 'border-primary bg-primary text-primary-foreground',
        false: 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      },
    },
    defaultVariants: { size: 'default', pressed: false },
  },
);

export interface ToggleChipProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'>,
    Omit<VariantProps<typeof toggleChipVariants>, 'pressed'> {
  /** Whether the chip is on. Mirrored to `aria-pressed`, which is how AT learns the state. */
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/**
 * A **toggle chip** — an `aria-pressed` button for an **independent boolean**: "also show
 * this" (Critical, Chain, Non-working). Each chip stands alone; turning one on says nothing
 * about the others.
 *
 * Use {@link SegmentedControl} instead when the options are **mutually exclusive** ("one of
 * these"). The choice is a semantic one, not a visual one: a radiogroup tells assistive
 * technology "one of a set of N", and a pressed button tells it "this is on". Getting it
 * backwards misdescribes the control even when it looks right.
 *
 * A presentational {@link Badge} is explicitly **not** this — a badge is output, a chip is a
 * control.
 *
 * **The consumer owes an announcement.** A chip that filters a list without changing an
 * announced result count leaves screen-reader users with no evidence anything happened
 * (WCAG 4.1.3 Status Messages). Pair it with `useResultCountAnnouncement` or an equivalent
 * live region, exactly as the library screens do.
 *
 * ```tsx
 * <ToggleChip pressed={showCritical} onPressedChange={setShowCritical}>
 *   Critical
 * </ToggleChip>
 * ```
 */
export const ToggleChip = forwardRef<HTMLButtonElement, ToggleChipProps>(function ToggleChip(
  { pressed, onPressedChange, size, className, type, onClick, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-pressed={pressed}
      className={cn(toggleChipVariants({ size, pressed }), className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onPressedChange(!pressed);
      }}
      {...props}
    >
      {children}
    </button>
  );
});

export { toggleChipVariants };
