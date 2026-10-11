import { describe, expect, it } from 'vitest';

import {
  clearOfObstacle,
  clusterHasRoom,
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

describe('clusterHasRoom', () => {
  // The measured case behind it: coarse 1024 x 600 with a conflict selected leaves 49 px of scene
  // against a 54 px card (`m4-measurement.md`), so the card is withdrawn rather than drawn clipped.
  it('needs the card plus its inset', () => {
    expect(clusterHasRoom({ width: 747, height: COLUMN_INSET_PX + 46 }, false)).toBe(true);
    expect(clusterHasRoom({ width: 747, height: COLUMN_INSET_PX + 45 }, false)).toBe(false);
    expect(clusterHasRoom({ width: 747, height: COLUMN_INSET_PX + 54 }, true)).toBe(true);
    expect(clusterHasRoom({ width: 747, height: 49 }, true)).toBe(false);
  });

  it('never withdraws on an unmeasured stage', () => {
    expect(clusterHasRoom({ width: 1, height: 0 }, true)).toBe(true);
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

  describe('on a very narrow stage, where the column spans nearly the whole width', () => {
    // The obstacle starts 40 px in from the left, so the shorter way out is LEFT (a 30 px bar at
    // x = 60 needs 60 + 30 - (40 - 28) = 78) — and that takes the bar to x = -18, past the stage's own
    // left margin. Up is 140 and stays inside. Verified red against the unconditional shorter-way rule.
    const narrow = { x: 40, y: 200, w: 120, h: 120 };
    const bar = { x: 60, y: 260, w: 30, h: 20 };

    it('prefers the way out that stays inside the stage over a shorter one that leaves it', () => {
      expect(clearOfObstacle(bar, narrow, 28)).toEqual({ dx: 0, dy: -(260 + 20 - (200 - 28)) });
    });

    it('never moves the bar past the left or top margin when a way out stays inside', () => {
      const { dx, dy } = clearOfObstacle(bar, narrow, 28);
      expect(bar.x + dx).toBeGreaterThanOrEqual(28);
      expect(bar.y + dy).toBeGreaterThanOrEqual(28);
    });

    it('falls back to the shorter way when neither stays inside', () => {
      // Both exits leave the stage; the old rule's answer stands rather than inventing a third.
      const tiny = { x: 20, y: 20, w: 200, h: 200 };
      const near = { x: 24, y: 24, w: 30, h: 20 };
      const { dx, dy } = clearOfObstacle(near, tiny, 28);
      expect(dx !== 0 || dy !== 0).toBe(true);
      expect(dx === 0 || dy === 0).toBe(true);
    });
  });
});
