import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { textLinkVariants } from './text-link';

/** ADR-0077 M2-T2 — one inline link style, closing `docs/TECH_DEBT.md` #97(b). */
describe('textLinkVariants', () => {
  it('carries the shared appearance and a visible focus ring', () => {
    render(
      <a href="/sign-in" className={textLinkVariants()}>
        Sign in
      </a>,
    );

    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link.className).toContain('text-primary');
    expect(link.className).toContain('underline-offset-4');
    // The five hand-written copies had no focus ring at all — the one thing this adds rather than
    // just centralises.
    expect(link.className).toContain('focus-visible:ring-2');
  });

  it('inherits the surrounding prose size by default and can size itself', () => {
    expect(textLinkVariants()).not.toContain('text-sm');
    expect(textLinkVariants({ size: 'sm' })).toContain('text-sm');
  });
});
