import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeWorkspaceScale,
  DESIGNED_BAND_HEIGHT_PX,
  DESIGNED_ROOT_HEIGHT_PX,
  DESIGNED_WORKSPACE_HEIGHT_PX,
  DESIGNED_WORKSPACE_WIDTH_PX,
  distanceFromEdgeInLayout,
  isBrowserZoomed,
  isTextEnlarged,
  layoutRect,
  layoutSize,
  pointInLayout,
  requiredWorkspaceScale,
  SCALE_ATTRIBUTE,
  toLayoutPx,
  workspaceScaleOf,
  WORKSPACE_SCALE_FLOOR,
  WORKSPACE_SCALE_SNAP,
  WORKSPACE_WINDOW_INSET_HEIGHT_PX,
  WORKSPACE_WINDOW_INSET_WIDTH_PX,
  ZOOM_RATIO_TOLERANCE,
} from './workspace-scale';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the designed box (ADR-0222 D2, measured at 1280 x 800 by M0)', () => {
  it('is the root plus the band, and the window less what the shell keeps', () => {
    expect(DESIGNED_WORKSPACE_WIDTH_PX).toBe(1003);
    expect(DESIGNED_ROOT_HEIGHT_PX).toBe(661);
    expect(DESIGNED_BAND_HEIGHT_PX).toBe(88);
    expect(DESIGNED_WORKSPACE_HEIGHT_PX).toBe(749);
    // 1280 wide: the Explorer's 277 and the root's 1003.
    expect(DESIGNED_WORKSPACE_WIDTH_PX + WORKSPACE_WINDOW_INSET_WIDTH_PX).toBe(1280);
    // 800 high: the header 48, the band 88 and its 3 px rule, and the root's 661.
    expect(48 + DESIGNED_BAND_HEIGHT_PX + 3).toBe(WORKSPACE_WINDOW_INSET_HEIGHT_PX);
    expect(DESIGNED_ROOT_HEIGHT_PX + WORKSPACE_WINDOW_INSET_HEIGHT_PX).toBe(800);
  });

  it('has a floor of 0.75, and a floor above the stated 24 px target (24 / 32)', () => {
    expect(WORKSPACE_SCALE_FLOOR).toBe(0.75);
    expect(32 * WORKSPACE_SCALE_FLOOR).toBeGreaterThanOrEqual(24);
  });
});

describe('requiredWorkspaceScale', () => {
  it('is 1 at the designed box and above it, and for a box not measured yet', () => {
    expect(requiredWorkspaceScale({ width: 1003, height: 749 })).toBe(1);
    expect(requiredWorkspaceScale({ width: 1700, height: 1200 })).toBe(1);
    expect(requiredWorkspaceScale(null)).toBe(1);
    expect(requiredWorkspaceScale({ width: 0, height: 0 })).toBe(1);
  });

  it('is the smaller of the two ratios', () => {
    // 1366 x 636 (M0 §1): the root is 1089 wide and the unit 585 high.
    expect(requiredWorkspaceScale({ width: 1089, height: 585 })).toBe(0.781);
    // Wide and short: the height decides. Narrow and tall: the width does.
    expect(requiredWorkspaceScale({ width: 1500, height: 600 })).toBe(0.801);
    expect(requiredWorkspaceScale({ width: 800, height: 749 })).toBe(0.798);
  });

  it('snaps a fit within 1 % of the designed box to 1 (m3-measurement.md §2)', () => {
    // A finger-sized band at 1280 x 800 leaves the unit 1003 x 746: 0.996, which drew "Scaled to 99 %".
    expect(requiredWorkspaceScale({ width: 1003, height: 746 })).toBe(1);
    // The same box a window narrower: 1278 x 800 is a 998-wide root.
    expect(requiredWorkspaceScale({ width: 998, height: 749 })).toBe(1);
    // Just past the snap the transform is worth having again.
    expect(
      requiredWorkspaceScale({ width: 1003 * (WORKSPACE_SCALE_SNAP - 0.005), height: 749 }),
    ).toBeLessThan(1);
  });

  it('never goes under the floor', () => {
    // 1024 x 600: the unit is 549 high.
    expect(requiredWorkspaceScale({ width: 747, height: 549 })).toBe(WORKSPACE_SCALE_FLOOR);
    expect(requiredWorkspaceScale({ width: 100, height: 100 })).toBe(WORKSPACE_SCALE_FLOOR);
  });
});

describe('computeWorkspaceScale (ADR-0222 D4)', () => {
  const small = { width: 800, height: 600 };
  const none = { textEnlarged: false, zoomed: false, actualSize: false };

  it('scales a small box when no guard holds', () => {
    expect(computeWorkspaceScale(small, none)).toBeLessThan(1);
  });

  it.each([
    ['enlarged text', { ...none, textEnlarged: true }],
    ['browser zoom', { ...none, zoomed: true }],
    ['the reader’s choice of actual size', { ...none, actualSize: true }],
  ])('is 1 under %s, however small the box', (_name, guards) => {
    expect(computeWorkspaceScale(small, guards)).toBe(1);
    expect(computeWorkspaceScale({ width: 100, height: 100 }, guards)).toBe(1);
  });
});

describe('the guards', () => {
  it('reads enlarged text from the root font size, however it was made', () => {
    expect(isTextEnlarged()).toBe(false);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      fontSize: '32px',
    } as CSSStyleDeclaration);
    expect(isTextEnlarged()).toBe(true);
  });

  it('treats a root font size that cannot be read as the default', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ fontSize: '' } as CSSStyleDeclaration);
    expect(isTextEnlarged()).toBe(false);
  });

  describe('browser zoom, as Chromium reports it (M0 §3)', () => {
    const widths = (outer: number, inner: number): void => {
      vi.stubGlobal('outerWidth', outer);
      vi.stubGlobal('innerWidth', inner);
    };
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is zoom when the outer width is more than the tolerance above the inner width', () => {
      expect(ZOOM_RATIO_TOLERANCE).toBe(1.05);
      widths(1280, 1067); // level 1, 120 %
      expect(isBrowserZoomed()).toBe(true);
      widths(1280, 889); // level 2, 144 %
      expect(isBrowserZoomed()).toBe(true);
      widths(1280, 1164); // 110 %, the smallest step a reader takes
      expect(isBrowserZoomed()).toBe(true);
    });

    it('ignores a window frame and zoom-out', () => {
      widths(1280, 1280); // no frame
      expect(isBrowserZoomed()).toBe(false);
      widths(1296, 1280); // 16 px of side border
      expect(isBrowserZoomed()).toBe(false);
      widths(1280, 1536); // zoom level -1
      expect(isBrowserZoomed()).toBe(false);
    });

    it('says no where a width is missing', () => {
      widths(0, 1280);
      expect(isBrowserZoomed()).toBe(false);
      widths(1280, 0);
      expect(isBrowserZoomed()).toBe(false);
    });
  });
});

describe('the conversions into layout px', () => {
  /** A scaled wrapper whose child reports a screen rect, as a browser does under a transform. */
  function scaledChild(scale: number, rect: Partial<DOMRect>): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.setAttribute(SCALE_ATTRIBUTE, String(scale));
    const child = document.createElement('div');
    wrapper.appendChild(child);
    document.body.appendChild(wrapper);
    const full = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect };
    vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(full as DOMRect);
    return child;
  }

  it('finds the nearest scaled wrapper, and is 1 outside every one', () => {
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    expect(workspaceScaleOf(outside)).toBe(1);
    expect(workspaceScaleOf(null)).toBe(1);
    expect(workspaceScaleOf(scaledChild(0.8, {}))).toBe(0.8);
  });

  it('refuses a garbled scale rather than dividing by it', () => {
    for (const value of ['', 'NaN', '0', '-1']) {
      const wrapper = document.createElement('div');
      wrapper.setAttribute(SCALE_ATTRIBUTE, value);
      const child = document.createElement('div');
      wrapper.appendChild(child);
      expect(workspaceScaleOf(child), `"${value}"`).toBe(1);
    }
  });

  it('turns a screen length into layout px', () => {
    expect(toLayoutPx(scaledChild(0.75, {}), 300)).toBe(400);
  });

  it('puts a pointer inside an element in the element’s own px (M0: a point drawn at 247 read 185)', () => {
    const canvas = scaledChild(0.75, { left: 100, top: 50, width: 560, height: 283 });
    // The pointer is 185.25 screen px right of the canvas's left edge: 247 layout px.
    expect(pointInLayout({ clientX: 285.25, clientY: 50 + 91.125 }, canvas)).toEqual({
      x: 247,
      y: 121.5,
    });
  });

  it('is the identity at scale 1', () => {
    const canvas = scaledChild(1, { left: 10, top: 20 });
    expect(pointInLayout({ clientX: 110, clientY: 70 }, canvas)).toEqual({ x: 100, y: 50 });
  });

  it('reads a rect and a size in layout px (M0: a canvas measured 747 inside a 996 box)', () => {
    const box = scaledChild(0.75, {
      left: 75,
      top: 30,
      right: 822,
      bottom: 491,
      width: 747,
      height: 461,
    });
    expect(layoutSize(box)).toEqual({ width: 996, height: 614.6666666666666 });
    const rect = layoutRect(box);
    expect(rect.width).toBe(996);
    expect(rect.left).toBe(100);
    expect(rect.right).toBe(1096);
  });

  it('measures how far a pointer is from an edge in layout px', () => {
    const body = scaledChild(0.5, { right: 600, bottom: 400 });
    expect(distanceFromEdgeInLayout(body, 'right', 500)).toBe(200);
    expect(distanceFromEdgeInLayout(body, 'bottom', 300)).toBe(200);
  });
});
