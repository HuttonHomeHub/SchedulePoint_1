import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The font-load bust's WIRING (#173) — `measure.test.ts` proves `clear()` works; nothing proved
 * the module-level `document.fonts.ready` hook actually calls it. Under jsdom `document.fonts`
 * does not exist, so the shipped guard makes the hook a no-op in every other suite — which is
 * also why this file must stub the property and re-import the module: the hook runs once, at
 * import time (2026-08-28 component review).
 */
describe('labelWidths font-load bust', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('clears the memo when document.fonts.ready settles, so labels re-measure in the real face', async () => {
    let settle!: () => void;
    const ready = new Promise<void>((resolve) => {
      settle = resolve;
    });
    vi.stubGlobal('document', { fonts: { ready } });
    vi.resetModules();

    const { labelWidths } = await import('./text-measure');

    // Measured before the font arrived — the fallback-face width the bust exists to drop.
    let width = 21;
    const measureText = vi.fn(() => width);
    expect(labelWidths.measure('abc', measureText)).toBe(21);
    expect(labelWidths.size).toBe(1);

    settle();
    await ready;
    // The .then() chained on `ready` runs on the microtask after ours; yield once more.
    await Promise.resolve();

    expect(labelWidths.size).toBe(0); // the bust fired
    width = 30;
    expect(labelWidths.measure('abc', measureText)).toBe(30); // re-measured in the loaded face
  });

  it('is a no-op where document.fonts does not exist (jsdom): the module imports cleanly', async () => {
    vi.stubGlobal('document', {});
    vi.resetModules();
    const { labelWidths } = await import('./text-measure');
    expect(labelWidths.size).toBe(0); // imported without throwing; the guard held
  });
});
