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

  it('hoverRing fallback clears 3:1 on the paper ground (M4 refresh entry, WCAG 1.4.11)', () => {
    expect(contrast(palette.hoverRing, palette.ground)).toBeGreaterThanOrEqual(3);
  });
});

// ── Grab-handle two-tone entries (ADR-0052 M3 discoverability fix) ───────────────────────────
describe('lag-handle palette entries (outline core / handleHalo ring)', () => {
  it('resolveTsldPalette resolves the halo (documented jsdom fallback)', () => {
    const palette = resolveTsldPalette();
    expect(palette.handleHalo).toBe('#161a22'); // --color-card fallback
    // The core/halo pair must be two distinct colours — the ring is what makes the disc read.
    expect(palette.handleHalo).not.toBe(palette.outline);
  });

  it('resolvePrintPalette carries a LIGHT fallback for the same entry (total contract)', () => {
    expect(resolvePrintPalette().handleHalo).toBe('#ffffff');
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

// ── Time-axis gridline tier palette entries (F5, `VITE_CANVAS_TIME_AXIS`) ────────────────
describe('gridline tier palette entries (gridLineDay / gridLineMonth / gridLineYear)', () => {
  it('resolveTsldPalette resolves all three tiers (documented jsdom fallbacks), distinct from each other', () => {
    const palette = resolveTsldPalette();
    expect(palette.gridLineDay).toBe('#3a3f4a');
    expect(palette.gridLineMonth).toBe('#2a2f3a');
    expect(palette.gridLineYear).toBe('#565c6a');
    // The whole point is a visible hierarchy — three distinct colours, not one repeated.
    expect(new Set([palette.gridLineDay, palette.gridLineMonth, palette.gridLineYear]).size).toBe(
      3,
    );
    // The flag-off value is unchanged by this addition (total contract, kept separate).
    expect(palette.gridLine).toBe('#2a2f3a');
  });

  it('resolvePrintPalette carries LIGHT fallbacks for the same three tiers (total contract)', () => {
    const palette = resolvePrintPalette();
    expect(palette.gridLineDay).toBe('#eff1f4');
    expect(palette.gridLineMonth).toBe('#e5e7eb');
    expect(palette.gridLineYear).toBe('#9ca3af');
  });
});

// Self-contained oklch→luminance/contrast helpers shared by the token-mirror contrast suites
// below (mirrors lenses.test.ts; token values mirror `styles/globals.css`).
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

// The M4 in-bar progress band draws in the bar's PAIRED label ink (labelInside — the fill's
// `*-foreground` token — or the lens `barInk` override), so its contrast on the fill is the same
// contract the inside labels already meet. Verified here for the painter's three criticality
// fills in BOTH themes.
describe('M4 progress-band ink contrast on its bar fill (WCAG 1.4.3-equivalent, both themes)', () => {
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

// The M4/M5 refresh's contrast pins against the canvas GROUND (WCAG 1.4.11-equivalent, ≥ 3:1,
// both themes; token values mirror `styles/globals.css` :root / .dark). Two documented reliances
// are asserted here rather than the raw `barStroke` token: the definition stroke (the border
// token) is DELIBERATELY a quiet hairline that does not itself clear 3:1 — a bar's perceivability
// rides its FILL against the background (primary / critical), and a near-critical bar in the
// light theme (the warning yellow, ~2.1:1 on white — no usable yellow clears 3:1 there) rides the
// 2px foreground EMPHASIS outline it always carries (`drawRefreshedBar`'s dash cue).
describe('M4/M5 refresh contrast on the canvas ground (WCAG 1.4.11-equivalent, both themes)', () => {
  const background: Record<string, Oklch> = { light: [1, 0, 0], dark: [0.145, 0, 0] };
  /** The `hoverRing` token (muted-foreground) per theme. */
  const hoverRing: Record<string, Oklch> = { light: [0.556, 0, 0], dark: [0.708, 0, 0] };
  /** The emphasis `outline` token (foreground) per theme. */
  const outline: Record<string, Oklch> = { light: [0.145, 0, 0], dark: [0.985, 0, 0] };
  const fills: Record<string, Array<[string, Oklch]>> = {
    light: [
      ['on-schedule (primary)', [0.5, 0.18, 255]],
      ['critical (destructive)', [0.577, 0.245, 27.325]],
    ],
    dark: [
      ['on-schedule (primary)', [0.65, 0.17, 255]],
      ['critical (destructive)', [0.52, 0.2, 22.216]],
      // In dark the warning fill itself clears 3:1 on the near-black ground; in light it cannot
      // (see the outline reliance below), so it is only pinned here.
      ['near-critical (warning)', [0.82, 0.16, 82]],
    ],
  };
  for (const theme of ['light', 'dark'] as const) {
    it(`hoverRing clears 3:1 on the canvas background (${theme})`, () => {
      expect(ratio(hoverRing[theme]!, background[theme]!)).toBeGreaterThanOrEqual(3);
    });
    it(`the 2px emphasis outline clears 3:1 on the canvas background (${theme})`, () => {
      // The near-critical (and critical) bars' guaranteed non-fill boundary cue in both themes.
      expect(ratio(outline[theme]!, background[theme]!)).toBeGreaterThanOrEqual(3);
    });
    for (const [name, fill] of fills[theme]!) {
      it(`${name} fill clears 3:1 on the canvas background (${theme})`, () => {
        expect(ratio(fill, background[theme]!)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});

// The lag handle (ADR-0052 M3 discoverability fix) is drawn ON a bar, so its perceivability can't
// ride the canvas ground: it must read against every bar FILL, in both themes, under no
// assumption about which fill a lens produced. That is what the two-tone construction buys — the
// `outline` core (foreground) and the `handleHalo` ring (card, the canvas ground) are each other's
// theme-inverse, so whichever loses contrast against the ground it lands on, the other holds it.
// Asserted as `max(core, halo) ≥ 3` per fill, plus the pair's own separation.
describe('lag-handle core/halo contrast on the bar fills (WCAG 1.4.11-equivalent, both themes)', () => {
  const core: Record<string, Oklch> = { light: [0.145, 0, 0], dark: [0.985, 0, 0] }; // foreground
  const halo: Record<string, Oklch> = { light: [1, 0, 0], dark: [0.205, 0, 0] }; // card
  const grounds: Record<string, Array<[string, Oklch]>> = {
    light: [
      ['on-schedule (primary)', [0.5, 0.18, 255]],
      ['critical (destructive)', [0.577, 0.245, 27.325]],
      ['near-critical (warning)', [0.769, 0.15, 80]],
      ['bare canvas (background)', [1, 0, 0]],
    ],
    dark: [
      ['on-schedule (primary)', [0.65, 0.17, 255]],
      ['critical (destructive)', [0.52, 0.2, 22.216]],
      ['near-critical (warning)', [0.82, 0.16, 82]],
      ['bare canvas (background)', [0.145, 0, 0]],
    ],
  };
  for (const theme of ['light', 'dark'] as const) {
    it(`the core and its halo are mutually distinguishable (${theme})`, () => {
      expect(ratio(core[theme]!, halo[theme]!)).toBeGreaterThanOrEqual(3);
    });
    for (const [name, ground] of grounds[theme]!) {
      it(`the handle reads on ${name} — core or halo clears 3:1 (${theme})`, () => {
        const best = Math.max(ratio(core[theme]!, ground), ratio(halo[theme]!, ground));
        expect(best).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
