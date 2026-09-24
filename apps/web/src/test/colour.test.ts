import { describe, expect, it } from 'vitest';

import { oklchInGamut } from './colour';

describe('oklchInGamut', () => {
  it('accepts a neutral and a moderate chroma the product already ships', () => {
    expect(oklchInGamut(0.5, 0, 0)).toBe(true);
    expect(oklchInGamut(0.624, 0.115, 249)).toBe(true);
  });

  it('refuses a chroma sRGB cannot render at that lightness', () => {
    // A vivid light green: the clamp in `oklchToSrgb` would silently paint a different colour.
    expect(oklchInGamut(0.9, 0.3, 150)).toBe(false);
  });

  it('refuses full lightness once any real chroma is added', () => {
    // White is the top corner of the gamut; there is no lighter colour to carry a hue.
    expect(oklchInGamut(1, 0.05, 250)).toBe(false);
  });
});
