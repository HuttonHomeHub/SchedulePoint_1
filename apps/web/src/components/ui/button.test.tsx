import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button, buttonVariants } from '@/components/ui/button';

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

  it('dims an aria-disabled control to 60 % while native disabled stays at 50 %', () => {
    const classes = buttonVariants().split(/\s+/);
    expect(classes).toContain('aria-disabled:opacity-60');
    expect(classes).toContain('disabled:opacity-50');
    // The pointer class is the caller's call (it depends on the bound expression), never the CVA's.
    expect(classes).not.toContain('aria-disabled:pointer-events-none');
  });

  it.each(['default', 'secondary', 'outline', 'ghost', 'destructive'] as const)(
    'the %s variant withholds its hover while aria-disabled',
    (variant) => {
      const hovers = buttonVariants({ variant })
        .split(/\s+/)
        .filter((c) => c.includes('hover:'));
      expect(hovers.length).toBeGreaterThan(0);
      for (const hover of hovers) expect(hover).toMatch(/^not-aria-disabled:hover:/);
    },
  );

  it('outline and ghost gate their hover ink as well as their hover fill', () => {
    for (const variant of ['outline', 'ghost'] as const) {
      const classes = buttonVariants({ variant }).split(/\s+/);
      expect(classes).toContain('not-aria-disabled:hover:bg-accent');
      expect(classes).toContain('not-aria-disabled:hover:text-accent-foreground');
    }
  });

  it('keeps a caller fill and the shading together on an aria-disabled button', () => {
    render(
      <Button className="bg-x" aria-disabled>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('bg-x', 'aria-disabled:opacity-60');
    // The caller's fill replaces the variant's; the gated hover class stays but is inert while shaded.
    expect(button).not.toHaveClass('bg-primary');
  });
});
