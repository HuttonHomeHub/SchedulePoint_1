import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TsldMotif } from './tsld-motif';

/** ADR-0077 M4-T1 — the product's own picture, drawn in tokens. */
describe('TsldMotif', () => {
  it('is decorative and scales rather than overflowing', () => {
    const { container } = render(<TsldMotif className="w-full" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // A fixed viewBox plus `preserveAspectRatio` is what lets it sit in a column of any width
    // without a second breakpoint or a clipped diagram.
    expect(svg).toHaveAttribute('viewBox', '0 0 100 60');
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  });

  it('names no colour — every stroke and fill is a compiled utility', () => {
    // The `--chart-*` trap this avoids is worth restating: chart tokens are page-level and are NOT
    // in `REBOUND_NAMES`, so on a fixed navy panel Corporate's `--chart-2` keeps its page value and
    // lands near 1.4:1 — the motif would vanish for those users, silently. Everything here draws
    // from the enclosing scope's own semantic names. The colour-literal lint rule covers this file
    // too (verified by inserting `fill="#14213D"` and watching `pnpm lint` fail).
    const { container } = render(<TsldMotif />);
    const markup = container.innerHTML;

    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toMatch(/\b(rgba?|hsla?|oklch)\(/);
    expect(markup).toContain('fill-primary');
    expect(markup).toContain('stroke-border');
  });

  it('is a motif, not a chart — six bars is the cap', () => {
    const { container } = render(<TsldMotif />);
    expect(container.querySelectorAll('rect').length).toBeLessThanOrEqual(6);
  });
});
