import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '@/components/layout/brand-mark';
import { Surface } from '@/components/ui/surface';

describe('BrandMark', () => {
  it('reads as the product name once, not twice', () => {
    render(<BrandMark />);
    // The tile is decorative — it is a picture with no words, so the link's visible text is the
    // wordmark alone (WCAG 2.5.3) and nothing is announced for it.
    expect(screen.getByText('SchedulePoint')).toBeInTheDocument();
    const tile = screen.getByTestId('brand-tile');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).toHaveAttribute('alt', '');
  });

  it('serves its tile as a file, at the size the old tile had, on any surface', () => {
    render(
      <Surface tone="chrome">
        <BrandMark />
      </Surface>,
    );
    const tile = screen.getByTestId('brand-tile');
    // A file, because `img-src 'self'` blocks `data:` and the colour-literal lint rule keeps
    // literals out of components; the file's own colours are the brand's.
    expect(tile).toHaveAttribute('src', '/brand/mark.svg');
    expect(tile).toHaveClass('size-7');
    expect(tile.className).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|oklch\(/i);
  });

  it('drops the wordmark for the tile variant but keeps the mark', () => {
    render(<BrandMark variant="tile" />);
    expect(screen.queryByText('SchedulePoint')).toBeNull();
    expect(screen.getByTestId('brand-tile')).toBeInTheDocument();
  });
});
