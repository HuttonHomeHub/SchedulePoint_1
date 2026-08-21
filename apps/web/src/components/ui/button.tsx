import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // `hover:bg-primary-hover` / `hover:bg-secondary-hover`, never the `/90` and `/80`
        // alpha forms these used to carry — the rule the `destructive` comment below states, now
        // applied to its neighbours rather than to one of the three. The alpha census caught
        // `hover:bg-secondary-hover` at **3.8:1** for its own label on both navy scopes.
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary-hover',
        // `text-foreground` is not decoration: a variant that states its own fill and then
        // inherits its ink is a bug wherever it lands (ADR-0055 §2, defect D3) — on a dark
        // surface it inherited light ink onto a light fill and vanished.
        outline:
          'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        // `hover:bg-destructive-hover`, never `hover:bg-destructive/90`. The alpha form
        // composites the fill against the PAGE, so on a light surface it lightened toward white
        // and took the label to 4.32:1 — below 1.4.3, on every Delete button in the product. It
        // was invisible to both gates: the contrast matrix resolves tokens and a utility is not
        // one, and the axe suite measures no hover state at all. A token is checkable; an alpha
        // utility is not, and that is the reason for the shape rather than the colour.
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
      },
      size: {
        default: 'h-(--control-h) px-4 py-2',
        sm: 'h-(--control-h-sm) px-3',
        lg: 'h-11 px-6',
        icon: 'size-10',
        // 44px icon button — the UX_STANDARDS floor for a NEW close/toggle affordance on a
        // panel (minimap M2-T2; docs/UX_STANDARDS.md "Touch targets"). `icon` predates the
        // floor at 40px; new panel chrome takes this one.
        'icon-lg': 'size-11',
        // Row-height icon button for dense lists (e.g. the Project Explorer tree, whose
        // rows are 28px). Pair with a larger non-pointer target (long-press / keyboard).
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

/** The primary interactive control. Variants/sizes via CVA; tokens only. Forwards its ref
 * so callers can focus it (e.g. returning focus after a popover closes). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});

export { buttonVariants };
