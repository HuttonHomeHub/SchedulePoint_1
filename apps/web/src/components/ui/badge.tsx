import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full font-medium whitespace-nowrap', {
  variants: {
    // Each pair uses a token validated as legible text ON THAT surface (a `*-text`
    // or `*-foreground` token paired with its own surface), never a solid surface
    // tone — see the colour-token rule in docs/DESIGN_SYSTEM.md. `muted-foreground`
    // is tuned for the page background and only reaches 4.34:1 on the lighter
    // `muted` fill, so the neutral pill uses `secondary-foreground` (the legible
    // foreground for this surface) to clear WCAG AA on both themes.
    variant: {
      neutral: 'bg-muted text-secondary-foreground',
      critical: 'bg-destructive/10 text-destructive-text',
      warning: 'bg-warning/15 text-warning-text',
    },
    size: {
      sm: 'px-1.5 py-0.5 text-[0.6875rem]',
      md: 'px-2 py-0.5 text-xs',
    },
  },
  defaultVariants: { variant: 'neutral', size: 'md' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/**
 * A compact status pill (DESIGN_SYSTEM.md). Meaning is carried by the text, not
 * the colour alone (WCAG 2.2 — never colour as the sole signal); the variant only
 * reinforces it. Tokens only, theme-aware.
 */
export function Badge({ className, variant, size, ...props }: BadgeProps): React.ReactElement {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
