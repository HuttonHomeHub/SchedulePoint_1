// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLAMP_MARGIN, clampAnchor, portalTarget, useMeasuredBox } from './overlay-position';

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

/**
 * **An open overlay is re-measured when its content changes size** (toolbar-redesign M2-T3).
 *
 * `useMeasuredBox` measured on open and never again, which was right while every overlay had the
 * size it opened with. View ▾'s folded sections broke that: unfolding one at 1024 x 600 grew the
 * panel, the position computed for the shorter box left its bottom below the viewport, and the last
 * controls could not be reached — found by `command-surface.spec.ts`'s "every toggle is reachable".
 * jsdom has no layout, so this drives the observer by hand: a size change delivered to the observer
 * must reach the returned box.
 *
 * Verified red by deleting the observer: the box stays at its opening height.
 */
describe('useMeasuredBox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the element when it resizes while open, and stops following when it closes', () => {
    let deliver: () => void = () => {
      throw new Error('no observer was created');
    };
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          deliver = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect = disconnect;
      },
    );
    let height = 300;
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ width: 200, height }) as DOMRect;
    const ref = { current: el };

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) => useMeasuredBox(ref, 'anchor', open),
      { initialProps: { open: true } },
    );
    expect(result.current).toEqual({ width: 200, height: 300 });

    height = 520;
    act(() => deliver());
    expect(result.current).toEqual({ width: 200, height: 520 });

    rerender({ open: false });
    expect(disconnect).toHaveBeenCalled();
  });
});
