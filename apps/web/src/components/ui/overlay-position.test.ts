// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAMP_MARGIN, clampAnchor, portalTarget } from './overlay-position';

/**
 * `clampAnchor`'s boundary arithmetic, covered at the unit tier for the first time — TECH_DEBT
 * #203(a) records that the browser gate was its only cover. Verified red 2026-08-28 against two
 * deliberate breaks: min/max swapped (fails the pass-through and margin cases) and the upper bound
 * removed (fails the three overflow/oversize cases) — every case discriminates one of the two.
 */
describe('clampAnchor', () => {
  const stubViewport = (width: number, height: number): void => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);
  };
  afterEach(() => vi.unstubAllGlobals());

  it('leaves an anchor alone when the box fits where it is', () => {
    stubViewport(1280, 800);
    expect(clampAnchor({ x: 100, y: 100 }, 200, 300)).toEqual({ left: 100, top: 100 });
  });

  it('clamps an anchor left of the margin to the margin', () => {
    stubViewport(1280, 800);
    expect(clampAnchor({ x: -40, y: 2 }, 200, 300)).toEqual({
      left: CLAMP_MARGIN,
      top: CLAMP_MARGIN,
    });
  });

  it('pulls a box that would overflow the right/bottom edges back inside the margin', () => {
    stubViewport(1280, 800);
    expect(clampAnchor({ x: 1250, y: 790 }, 200, 300)).toEqual({
      left: 1280 - 200 - CLAMP_MARGIN,
      top: 800 - 300 - CLAMP_MARGIN,
    });
  });

  it('a box taller than the viewport pins to the top margin rather than a negative top', () => {
    stubViewport(1280, 400);
    const { top } = clampAnchor({ x: 100, y: 350 }, 200, 600);
    expect(top).toBe(CLAMP_MARGIN);
  });

  it('a box wider than the viewport pins to the left margin', () => {
    stubViewport(300, 800);
    const { left } = clampAnchor({ x: 250, y: 100 }, 600, 200);
    expect(left).toBe(CLAMP_MARGIN);
  });
});

describe('portalTarget', () => {
  it('is document.body with no open modal, and the LAST open dialog with nesting', () => {
    expect(portalTarget()).toBe(document.body);
    const outer = document.createElement('dialog');
    outer.setAttribute('open', '');
    const inner = document.createElement('dialog');
    inner.setAttribute('open', '');
    document.body.append(outer, inner);
    expect(portalTarget()).toBe(inner);
    outer.remove();
    inner.remove();
  });
});
