import { describe, expect, it } from 'vitest';

import {
  clearOfObstacle,
  clusterOuterHeight,
  COLUMN_GAP_PX,
  COLUMN_INSET_PX,
  minimapHasRoom,
  minimapOuterHeight,
} from './viewport-column';

const BOX = { width: 200, height: 120 };

describe('the column heights are the sum of declared parts', () => {
  // Measured in a browser at 1024 x 600 (`m4-measurement.md` section 3): fine 164 / 46, coarse 168 / 54.
  it('matches the readings the journey asserts', () => {
    expect(minimapOuterHeight(BOX.height, false)).toBe(164);
    expect(minimapOuterHeight(BOX.height, true)).toBe(168);
    expect(clusterOuterHeight(false)).toBe(46);
    expect(clusterOuterHeight(true)).toBe(54);
  });
});

describe('minimapHasRoom', () => {
  const fits = (coarse: boolean) =>
    COLUMN_INSET_PX +
    minimapOuterHeight(BOX.height, coarse) +
    COLUMN_GAP_PX +
    clusterOuterHeight(coarse);

  it('keeps the width rule: three minimap widths', () => {
    expect(minimapHasRoom({ width: 599, height: 900 }, BOX, false)).toBe(false);
    expect(minimapHasRoom({ width: 600, height: 900 }, BOX, false)).toBe(true);
  });

  it('adds a height clause: the whole column and its inset must fit under the ruler', () => {
    expect(minimapHasRoom({ width: 747, height: fits(false) }, BOX, false)).toBe(true);
    expect(minimapHasRoom({ width: 747, height: fits(false) - 1 }, BOX, false)).toBe(false);
    expect(minimapHasRoom({ width: 747, height: fits(true) - 1 }, BOX, true)).toBe(false);
  });

  it('is stricter for a finger, whose buttons are taller', () => {
    expect(fits(true)).toBeGreaterThan(fits(false));
  });

  it('never suppresses the panel on an unmeasured stage (first frame, jsdom)', () => {
    expect(minimapHasRoom({ width: 1, height: 1 }, BOX, true)).toBe(true);
  });
});

describe('clearOfObstacle: the keyboard reveal margin (SC-15)', () => {
  const obstacle = { x: 800, y: 300, w: 200, h: 200 };

  it('asks for nothing when the bar is clear of the column', () => {
    expect(clearOfObstacle({ x: 100, y: 100, w: 80, h: 20 }, obstacle, 28)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('asks for nothing when the column is unmeasured', () => {
    expect(
      clearOfObstacle({ x: 900, y: 400, w: 80, h: 20 }, { x: 0, y: 0, w: 0, h: 0 }, 28),
    ).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('moves a bar under the column the shorter way out, leaving the margin', () => {
    const bar = { x: 900, y: 450, w: 60, h: 20 };
    // Left: 900 + 60 - (800 - 28) = 188. Up: 450 + 20 - (300 - 28) = 198. Left is shorter.
    expect(clearOfObstacle(bar, obstacle, 28)).toEqual({ dx: -188, dy: 0 });
    const tall = { x: 790, y: 330, w: 60, h: 20 };
    // Left: 790 + 60 - 772 = 78. Up: 330 + 20 - 272 = 78. A tie goes up.
    expect(clearOfObstacle(tall, obstacle, 28)).toEqual({ dx: 0, dy: -78 });
  });

  it('leaves the moved bar outside the inflated obstacle', () => {
    const bar = { x: 850, y: 380, w: 100, h: 20 };
    const { dx, dy } = clearOfObstacle(bar, obstacle, 28);
    const moved = { ...bar, x: bar.x + dx, y: bar.y + dy };
    const clear = moved.x + moved.w <= obstacle.x - 28 || moved.y + moved.h <= obstacle.y - 28;
    expect(clear).toBe(true);
  });
});
