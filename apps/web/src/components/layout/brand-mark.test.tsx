import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '@/components/layout/brand-mark';
import { Surface } from '@/components/ui/surface';

describe('BrandMark', () => {
  it('reads as the product name once, not twice', () => {
    render(<BrandMark />);
    // The tile is decorative — it repeats the wordmark's first letter, so exposing it would make
    // a screen reader announce "S SchedulePoint". It is also painted rather than typed, so the
    // link's visible words are the wordmark alone (WCAG 2.5.3, axe-core 4.14).
    expect(screen.getByText('SchedulePoint')).toBeInTheDocument();
    const tile = screen.getByTestId('brand-tile');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).toBeEmptyDOMElement();
    expect(tile).toHaveClass("before:content-['S']");
  });

  it('paints its tile from tokens so each surface gets a validated pair', () => {
    render(
      <Surface tone="chrome">
        <BrandMark />
      </Surface>,
    );
    const tile = screen.getByTestId('brand-tile');
    // `bg-primary` inside chrome resolves to `--chrome-primary` — amber on Corporate's navy,
    // the brand blue on Light/Dark. A literal amber would be unreadable on a white header and
    // would be exactly the one-off styling the design system forbids.
    expect(tile).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(tile.className).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|oklch\(/i);
  });
});
