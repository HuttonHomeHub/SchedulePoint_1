import { describe, expect, it } from 'vitest';

import { buildDrawScene, framingFor, minVisibleBarsFor } from './canvas-draw';

/**
 * The scene and its framing — and above all the **visible-bar counts**, which are the numbers that
 * decide whether a reading is about the painter or about the cull.
 *
 * Asserted at a fixed viewport, because a bar count is a fact about a framing and not about a scene.
 * Two machines with different viewports measure different pictures, which is exactly why the count
 * is recorded on every result rather than assumed away.
 */
const VIEWPORT = { width: 1646, height: 900 };

describe('the canvas-draw scene', () => {
  it('builds a scene close to the requested size, not a truncation of one', () => {
    // The generator deals whole bands, so it lands NEAR the requested count rather than on it. What
    // matters is that 500 is genuinely a 500-ish plan — if it silently came back as, say, 120, the
    // 500-activity limb would be measuring a different question from the one ADR-0026 §9 asks.
    const small = buildDrawScene(500);
    const large = buildDrawScene(2000);
    expect(small.totalActivities).toBeGreaterThan(400);
    expect(small.totalActivities).toBeLessThan(700);
    expect(large.totalActivities).toBeGreaterThan(1700);
    expect(large.totalActivities).toBeLessThan(2400);
    expect(small.totalEdges).toBeGreaterThan(100);
  });

  it('draws the shipped painter’s picture, not a stripped-down one', () => {
    // Visual refresh, time-true links and orthogonal routing are all default-on shipped features
    // (ADR-0052, ADR-0065). Measuring with them off would answer a question about a product nobody
    // runs — and each of them costs the painter.
    const { scene } = buildDrawScene(500);
    expect(scene.visualRefresh).toBe(true);
    expect(scene.timeTrueLinks).toBe(true);
    expect(scene.linkRouting).toBe(true);
  });

  it('puts a real number of bars on screen at BOTH presets', () => {
    // The non-vacuity floor, proved rather than asserted. ADR-0066's plan spanned 28 years and the
    // whole-plan zoom culled nine bars in ten; the resulting number looked like the budget being
    // met. If this ever goes red, the scene has drifted into that shape and every reading taken
    // from it is about the cull.
    const scene = buildDrawScene(2000);
    for (const preset of ['week', 'fit'] as const) {
      const framing = framingFor(scene, preset, VIEWPORT);
      expect(framing.visibleBars).toBeGreaterThanOrEqual(framing.minVisibleBars);
    }
  });

  it('shows that a Week reading at 2,000 is NOT about 2,000 bars', () => {
    // The measured finding, pinned so it cannot quietly change. A working zoom frames roughly the
    // same number of DAYS whatever the plan's size, and a bigger plan is mostly a longer one — so
    // the two limbs draw almost the same picture at Week (192 bars against 222). The cull is doing
    // exactly its job (ADR-0026 §8), and the consequence is that a Week PASS at "2,000 activities"
    // is evidence about ~220 bars, not about 2,000. Fit is the framing that separates them.
    const small = buildDrawScene(500);
    const large = buildDrawScene(2000);
    const weekSmall = framingFor(small, 'week', VIEWPORT).visibleBars;
    const weekLarge = framingFor(large, 'week', VIEWPORT).visibleBars;
    expect(weekLarge / weekSmall).toBeLessThan(1.5);

    // Fit, by contrast, genuinely does scale with the plan — which is why the table in the module's
    // docblock records the tension rather than pretending Week answers the size question.
    const fitSmall = framingFor(small, 'fit', VIEWPORT).visibleBars;
    const fitLarge = framingFor(large, 'fit', VIEWPORT).visibleBars;
    expect(fitLarge / fitSmall).toBeGreaterThan(2);
  });

  it('frames the whole plan at Fit and a window at Week', () => {
    // The two presets have to genuinely differ, or the second reading is the first one repeated.
    const scene = buildDrawScene(2000);
    const fit = framingFor(scene, 'fit', VIEWPORT);
    const week = framingFor(scene, 'week', VIEWPORT);
    expect(week.pxPerDay).toBe(12);
    expect(fit.pxPerDay).toBeLessThan(week.pxPerDay);
    expect(fit.visibleBars).toBeGreaterThan(week.visibleBars);
  });

  it('derives Fit from the plan’s span, so a wider viewport still frames the whole plan', () => {
    // Not a constant px/day. "Whole plan" has to mean the whole plan on a 1280 laptop and on a 2560
    // monitor, or two operators are measuring different pictures and calling it the same scenario.
    const scene = buildDrawScene(2000);
    const narrow = framingFor(scene, 'fit', { width: 1280, height: 900 });
    const wide = framingFor(scene, 'fit', { width: 2560, height: 900 });
    expect(wide.pxPerDay).toBeGreaterThan(narrow.pxPerDay);
    expect(wide.pxPerDay / narrow.pxPerDay).toBeCloseTo(2, 1);
    expect(narrow.spanDays).toBe(wide.spanDays);
  });

  it('asks a majority of the scene at Fit and only a slice at Week', () => {
    // The floors differ because the presets mean different things. Fit frames the whole plan, so if
    // most of it is off screen the framing has failed at its own job; Week frames a working window,
    // which is a slice by design — with an absolute guard underneath, because 5 % of a tiny scene
    // is not a measurement either.
    expect(minVisibleBarsFor('fit', 2000)).toBe(1000);
    expect(minVisibleBarsFor('week', 2000)).toBe(100);
    expect(minVisibleBarsFor('week', 100)).toBe(25);
  });
});
