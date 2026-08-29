import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

const toggleChipVariants = cva(
  'focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      // **`min-h-*` on the token, not a literal height** (ADR-0118 M4). A chip is a control — the
      // canvas lens toggles are chips — and it was 32/28 px on both pointers, i.e. below the house
      // rule on touch and invisible to every surface sweep, because a chip renders inside a panel
      // rather than on the deck, the header or the Explorer. Found by the primitive gate this
      // milestone built rather than by a reviewer reading the file.
      //
      // `min-h` rather than `h` so a chip whose label wraps grows instead of clipping; the fine
      // values are unchanged at 32 and 28.
      size: {
        default: 'min-h-8 px-3 pointer-coarse:min-h-(--control-h)',
        sm: 'min-h-7 px-2.5 text-xs pointer-coarse:min-h-(--control-h)',
      },
      pressed: {
        // Pressed state is carried by fill AND border, never by colour alone — a chip that
        // only changed hue would be invisible to a user who cannot distinguish it.
        true: 'border-primary bg-primary text-primary-foreground',
        // `border-input`, not `border-border`: unpressed the chip has NO fill, so this line is
        // the only thing that says a control is here — the control-boundary case 1.4.11 covers,
        // not the decorative-divider case it exempts.
        false: 'border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
