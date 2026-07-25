import { describe, expect, it } from 'vitest';

import { resolvePrintPalette, resolveTsldPalette } from './palette';

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

// ── Bar visual refresh palette entries (ADR-0052 M4) ─────────────────────────────────────
describe('M4 refresh palette entries (barStroke / hoverRing)', () => {
  it('resolveTsldPalette resolves the refresh entries (documented jsdom fallbacks)', () => {
    const palette = resolveTsldPalette();
    // jsdom serves no tokens, so the documented fallbacks come back — the entries are total.
    expect(palette.barStroke).toBe('#2a2f3a'); // --color-border fallback
    expect(palette.hoverRing).toBe('#7a8090'); // --color-muted-foreground fallback
    // Hover must never masquerade as selection (two distinct state rings).
    expect(palette.hoverRing).not.toBe(palette.selection);
  });

  it('resolvePrintPalette carries LIGHT fallbacks for the same entries (total contract)', () => {
    const palette = resolvePrintPalette();
    expect(palette.barStroke).toBe('#e5e7eb');
    expect(palette.hoverRing).toBe('#6b7280');
  });
});

// The M4 in-bar progress band draws in the bar's PAIRED label ink (labelInside — the fill's
// `*-foreground` token — or the lens `barInk` override), so its contrast on the fill is the same
// contract the inside labels already meet. Verified here for the painter's three criticality
// fills in BOTH themes with the self-contained oklch→luminance helper (mirrors lenses.test.ts;
// token values mirror `styles/globals.css`).
describe('M4 progress-band ink contrast on its bar fill (WCAG 1.4.3-equivalent, both themes)', () => {
  const oklchToLuminance = (L: number, C: number, H: number): number => {
    const hr = (H * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((x) => Math.min(1, Math.max(0, x)));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  };
  type Oklch = [number, number, number];
  const ratio = (fill: Oklch, ink: Oklch): number => {
    const a = oklchToLuminance(...fill);
    const b = oklchToLuminance(...ink);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const themes: Record<string, Array<[string, Oklch, Oklch]>> = {
    light: [
      ['on-schedule (primary / primary-fg)', [0.5, 0.18, 255], [0.985, 0, 0]],
      ['critical (destructive / destructive-fg)', [0.577, 0.245, 27.325], [0.985, 0, 0]],
      ['near-critical (warning / warning-fg)', [0.769, 0.15, 80], [0.205, 0, 0]],
    ],
    dark: [
      ['on-schedule (primary / primary-fg)', [0.65, 0.17, 255], [0.205, 0, 0]],
      ['critical (destructive / destructive-fg)', [0.52, 0.2, 22.216], [0.985, 0, 0]],
      ['near-critical (warning / warning-fg)', [0.82, 0.16, 82], [0.205, 0, 0]],
    ],
  };
  for (const [theme, pairs] of Object.entries(themes)) {
    for (const [name, fill, ink] of pairs) {
      it(`${name} progress ink clears 4.5:1 on its fill (${theme})`, () => {
        expect(ratio(fill, ink)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
