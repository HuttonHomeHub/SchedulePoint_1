import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '@/components/layout/brand-mark';
import { Surface } from '@/components/ui/surface';

describe('BrandMark', () => {
  it('reads as the product name once, not twice', () => {
    render(<BrandMark />);
    // The tile is decorative — it repeats the wordmark's first letter, so exposing it would make
    // a screen reader announce "S SchedulePoint".
    expect(screen.getByText('SchedulePoint')).toBeInTheDocument();
    expect(screen.getByText('S')).toHaveAttribute('aria-hidden', 'true');
  });

  it('paints its tile from tokens so each surface gets a validated pair', () => {
    render(
      <Surface tone="chrome">
        <BrandMark />
      </Surface>,
    );
    const tile = screen.getByText('S');
    // `bg-primary` inside chrome resolves to `--chrome-primary` — amber on Corporate's navy,
    // the brand blue on Light/Dark. A literal amber would be unreadable on a white header and
    // would be exactly the one-off styling the design system forbids.
    expect(tile).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(tile.className).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|oklch\(/i);
  });
});
