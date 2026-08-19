import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full font-medium whitespace-nowrap', {
  variants: {
    // Each pair uses a token validated as legible text ON THAT surface (a `*-text`
    // or `*-foreground` token paired with its own surface), never a solid surface
    // tone — see the colour-token rule in docs/DESIGN_SYSTEM.md.
    //
    // **The neutral pill used `text-secondary-foreground` on `bg-muted`, and ADR-0097's
    // closure turned that into a live failure.** The reasoning was sound while
    // `--secondary-foreground` was a fixed near-white: it was legible on the light `--muted`
    // where `--muted-foreground` reached only 4.34:1. But `--secondary-foreground` means
    // "ink ON `--secondary`", and once every scope derived its own — near-black on the navy
    // surfaces, where the secondary fill is light — the pill composited a near-black label on
    // a dark navy `--muted` at **1.53:1**. Caught by `e2e-designed-chrome` in a real browser;
    // no unit test could see it, because the pair is only wrong once a scope rebinds both
    // halves independently.
    //
    // `--foreground` is the fix and not a workaround: a status pill's label is the pill's
    // CONTENT, not secondary text, and it is the surface's own ink by definition. It measures
    // 9.98–14.44:1 across the five scopes, and the pairing is now in the contrast census so it
    // cannot drift back.
    variant: {
      neutral: 'bg-muted text-foreground',
      critical: 'bg-destructive/10 text-destructive-text',
      warning: 'bg-warning/15 text-warning-text',
    },
    size: {
      sm: 'px-1.5 py-0.5 text-micro',
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
