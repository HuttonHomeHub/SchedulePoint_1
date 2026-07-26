import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/button';

/**
 * The variant-ink invariant (ADR-0055 §2, defect D3). A variant that states its own fill and
 * then inherits its ink is a latent bug: it renders correctly only while the surrounding ink
 * happens to contrast with the fill it just painted. That held on the page and broke the moment
 * `outline` landed on the navy header — a light-on-light invisible button.
 *
 * Asserted structurally rather than visually because the failure mode is *absence*: no rendered
 * output distinguishes "inherits the right ink" from "inherits the wrong one".
 */
const FILLED_VARIANTS = ['default', 'secondary', 'outline', 'destructive'] as const;

describe('buttonVariants', () => {
  it.each(FILLED_VARIANTS)('the %s variant states an ink alongside its fill', (variant) => {
    const classes = buttonVariants({ variant }).split(/\s+/);
    expect(classes.some((c) => /^bg-/.test(c))).toBe(true);
    expect(classes.some((c) => /^text-(?!sm$|xs$|base$|lg$)/.test(c))).toBe(true);
  });

  it('the ghost variant states neither, so it inherits both from its surface', () => {
    // Deliberately exempt: `ghost` paints nothing at rest, so inheriting is the correct
    // behaviour — it is the one variant that *should* take its surface's colours.
    const classes = buttonVariants({ variant: 'ghost' }).split(/\s+/);
    expect(classes.some((c) => /^bg-/.test(c))).toBe(false);
  });
});
