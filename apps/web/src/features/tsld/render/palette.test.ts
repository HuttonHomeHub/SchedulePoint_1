import { describe, expect, it } from 'vitest';

import { resolvePrintPalette } from './palette';

/**
 * Contrast verification (WCAG 1.4.3) for the LIGHT-forced **print** palette (spec
 * `docs/specs/export-print/`): a printed/exported diagram's title `ink` and subtitle `mutedInk` must
 * clear 4.5:1 against the paper `ground`, so the self-describing title band stays legible on white
 * (a11y review S5; mirrors the `render/lenses.test.ts` contrast-assertion pattern). In jsdom the tokens
 * aren't loaded, so `resolvePrintPalette()` returns its documented light fallbacks — exactly the values
 * `PrintSurface.css` is pinned to — which is what this asserts on.
 */
describe('resolvePrintPalette — title/subtitle ink contrast on paper (WCAG 1.4.3)', () => {
  /** sRGB relative luminance of a `#rrggbb` colour (WCAG definition). */
  const luminance = (hex: string): number => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
    if (!m) throw new Error(`not a hex colour: ${hex}`);
    const channel = (h: string): number => {
      const s = parseInt(h, 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [, r, g, b] = m as unknown as [string, string, string, string];
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (a: string, b: string): number => {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  const palette = resolvePrintPalette();

  it('title ink clears 4.5:1 on the paper ground', () => {
    expect(contrast(palette.ink, palette.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted subtitle ink clears 4.5:1 on the paper ground', () => {
    expect(contrast(palette.mutedInk, palette.ground)).toBeGreaterThanOrEqual(4.5);
  });
});
