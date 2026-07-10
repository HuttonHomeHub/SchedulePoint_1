import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full font-medium whitespace-nowrap', {
  variants: {
    // Each pair uses a token validated as legible text on page surfaces (a
    // `*-text` / `muted-foreground` token), never a solid surface tone — see the
    // colour-token rule in docs/DESIGN_SYSTEM.md.
    variant: {
      neutral: 'bg-muted text-muted-foreground',
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
