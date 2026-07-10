import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        critical: 'bg-destructive/10 text-destructive-text',
        warning: 'bg-warning/20 text-warning-foreground',
        success: 'bg-success/15 text-success',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/**
 * A compact status pill (DESIGN_SYSTEM.md). Meaning is carried by the text, not
 * the colour alone (WCAG 2.2 — never colour as the sole signal); the variant only
 * reinforces it. Tokens only, theme-aware.
 */
export function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
