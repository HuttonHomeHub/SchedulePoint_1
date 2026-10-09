import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CANVAS_MIN_HEIGHT,
  DOCK_MIN_HEIGHT,
  PANEL_BODY_PAD_PX,
  PANEL_FOOT_PX,
  PANEL_HEADER_PX,
  PANEL_MIN_OPEN,
  PANEL_USEFUL_MIN,
  ROW_PX,
  SHORT_BODY_HYSTERESIS_PX,
  TABLE_HEAD_PX,
  isShortBody,
  useActivityPanelPrefs,
} from './use-activity-panel-prefs';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('the panel minimum is made of the panel’s own parts', () => {
  it('sums the named parts plus one row, and three rows for the useful minimum', () => {
    expect(PANEL_MIN_OPEN).toBe(
      PANEL_HEADER_PX + PANEL_FOOT_PX + PANEL_BODY_PAD_PX + TABLE_HEAD_PX + ROW_PX,
    );
    expect(PANEL_USEFUL_MIN).toBe(
      PANEL_HEADER_PX + PANEL_FOOT_PX + PANEL_BODY_PAD_PX + TABLE_HEAD_PX + 3 * ROW_PX,
    );
  });

  it('is pinned to the measured readings (m0-measurement.md, coarse header and foot)', () => {
    // ROW_PX 57->61 when the activities row's ⋯ grows to 44 on touch (dense-row-touch-targets M1).
    expect(PANEL_MIN_OPEN).toBe(249);
    expect(PANEL_USEFUL_MIN).toBe(371);
    expect(CANVAS_MIN_HEIGHT + PANEL_USEFUL_MIN).toBe(611);
  });

  it('is larger than the old 140, which was smaller than the panel’s own fixed parts (#468)', () => {
    // Red against `PANEL_MIN_OPEN = 140`: the header, foot and table head alone are 188.
    expect(PANEL_MIN_OPEN).toBeGreaterThan(140);
    expect(PANEL_MIN_OPEN).toBeGreaterThan(PANEL_HEADER_PX + PANEL_FOOT_PX + TABLE_HEAD_PX);
  });
});

describe('isShortBody', () => {
  const line = CANVAS_MIN_HEIGHT + PANEL_USEFUL_MIN;

  it('is never short for an unmeasured body (first paint, jsdom)', () => {
    expect(isShortBody(0, CANVAS_MIN_HEIGHT, false)).toBe(false);
    expect(isShortBody(0, DOCK_MIN_HEIGHT, true)).toBe(false);
  });

  it('flips exactly at the boundary when it was not short', () => {
    expect(isShortBody(line - 1, CANVAS_MIN_HEIGHT, false)).toBe(true);
    expect(isShortBody(line, CANVAS_MIN_HEIGHT, false)).toBe(false);
  });

  it('holds the swap through the hysteresis band once it was short', () => {
    expect(isShortBody(line, CANVAS_MIN_HEIGHT, true)).toBe(true);
    expect(isShortBody(line + SHORT_BODY_HYSTERESIS_PX - 1, CANVAS_MIN_HEIGHT, true)).toBe(true);
    expect(isShortBody(line + SHORT_BODY_HYSTERESIS_PX, CANVAS_MIN_HEIGHT, true)).toBe(false);
    expect(SHORT_BODY_HYSTERESIS_PX).toBe(24);
  });

  it('moves the line with the reserve (a dock keeps more of the row)', () => {
    const dockLine = DOCK_MIN_HEIGHT + PANEL_USEFUL_MIN;
    expect(isShortBody(dockLine - 1, DOCK_MIN_HEIGHT, false)).toBe(true);
    expect(isShortBody(dockLine, DOCK_MIN_HEIGHT, false)).toBe(false);
    // The same body is short against a dock's reserve and not against the canvas's.
    expect(isShortBody(line + 10, DOCK_MIN_HEIGHT, false)).toBe(true);
    expect(isShortBody(line + 10, CANVAS_MIN_HEIGHT, false)).toBe(false);
  });

  it('calls the 1024 × 600 floor short on both pointers and 1280 × 800 not short', () => {
    // Body heights from m0-measurement.md §1: fine 365 / coarse 329 at 1024 × 600; fine 653 at 1280 × 800.
    expect(isShortBody(365, CANVAS_MIN_HEIGHT, false)).toBe(true);
    expect(isShortBody(329, CANVAS_MIN_HEIGHT, false)).toBe(true);
    expect(isShortBody(653, CANVAS_MIN_HEIGHT, false)).toBe(false);
  });
});

describe('useActivityPanelPrefs', () => {
  it('reads a stored 140 back as PANEL_MIN_OPEN', () => {
    localStorage.setItem(
      'schedulepoint-activity-panel',
      JSON.stringify({ collapsed: false, size: 140 }),
    );
    const { result } = renderHook(() => useActivityPanelPrefs());
    expect(result.current.size).toBe(PANEL_MIN_OPEN);
  });

  it('rewrites a stored 140 as the clamped value (the hook persists its state on mount)', () => {
    localStorage.setItem(
      'schedulepoint-activity-panel',
      JSON.stringify({ collapsed: false, size: 140 }),
    );
    renderHook(() => useActivityPanelPrefs());
    const stored = JSON.parse(localStorage.getItem('schedulepoint-activity-panel') ?? '{}') as {
      size?: number;
    };
    expect(stored.size).toBe(PANEL_MIN_OPEN);
  });
});
