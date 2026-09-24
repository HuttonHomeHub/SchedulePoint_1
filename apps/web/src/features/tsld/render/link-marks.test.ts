import { describe, expect, it } from 'vitest';

import {
  CHEVRON_MAX_PER_LINK,
  CHEVRON_SPACING_PX,
  chevronsAlong,
  formatLag,
  lagPlateAt,
  linkRung,
  gapLabelAt,
} from './link-marks';

const crit = { isCritical: true, isNearCritical: false };
const near = { isCritical: false, isNearCritical: true };
const plain = { isCritical: false, isNearCritical: false };

describe('linkRung', () => {
  it('is critical only when both ends are critical', () => {
    expect(linkRung(crit, crit)).toBe('critical');
    expect(linkRung(crit, plain)).toBe('normal');
    expect(linkRung(plain, crit)).toBe('normal');
  });

  it('is near-critical when both ends are at least near-critical', () => {
    expect(linkRung(near, near)).toBe('near');
    expect(linkRung(crit, near)).toBe('near');
    expect(linkRung(near, crit)).toBe('near');
    expect(linkRung(near, plain)).toBe('normal');
  });
});

describe('chevronsAlong', () => {
  it('spaces marks at the reference’s rhythm, about every 40 px (NetPoint grammar M3)', () => {
    expect(CHEVRON_SPACING_PX).toBe(40);
  });

  it('puts none on a short link', () => {
    expect(
      chevronsAlong([
        { x: 0, y: 0 },
        { x: CHEVRON_SPACING_PX * 2 - 1, y: 0 },
      ]),
    ).toEqual([]);
  });

  it('spaces them evenly, points them along the line, and keeps them off both ends', () => {
    const len = CHEVRON_SPACING_PX * 4;
    const marks = chevronsAlong([
      { x: 0, y: 7 },
      { x: len, y: 7 },
    ]);
    expect(marks.map(([tip]) => tip.x)).toEqual([1, 2, 3].map((k) => k * CHEVRON_SPACING_PX));
    for (const [tip, left, right] of marks) {
      expect(left.x).toBeLessThan(tip.x); // pointing right, the direction of travel
      expect(right.x).toBeLessThan(tip.x);
      expect(tip.y).toBe(7);
    }
  });

  it('never carries more than the cap, however long the link', () => {
    const marks = chevronsAlong([
      { x: 0, y: 0 },
      { x: CHEVRON_SPACING_PX * 100, y: 0 },
    ]);
    expect(marks).toHaveLength(CHEVRON_MAX_PER_LINK);
    // NetPoint grammar M3: where the cap binds, the marks spread along the whole link instead of
    // bunching in its first stretch — evenly, one seventh of the length apart for six marks.
    const total = CHEVRON_SPACING_PX * 100;
    const step = total / (CHEVRON_MAX_PER_LINK + 1);
    marks.forEach(([tip], i) => expect(tip.x).toBeCloseTo((i + 1) * step, 6));
  });

  it('follows the line round a corner', () => {
    const marks = chevronsAlong([
      { x: 0, y: 0 },
      { x: CHEVRON_SPACING_PX * 1.5, y: 0 },
      { x: CHEVRON_SPACING_PX * 1.5, y: CHEVRON_SPACING_PX * 3 },
    ]);
    const [, second] = marks;
    expect(second![0].x).toBe(CHEVRON_SPACING_PX * 1.5); // on the vertical…
    expect(second![1].y).toBeLessThan(second![0].y); // …pointing down it
  });
});

describe('formatLag', () => {
  it('writes a lead with a true minus sign', () => {
    expect(formatLag(2)).toBe('+2d');
    expect(formatLag(-1)).toBe('−1d');
  });
});

describe('lagPlateAt', () => {
  it('prefers the longest horizontal segment that fits the plate', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 50 },
      { x: 110, y: 50 },
    ];
    expect(lagPlateAt(line, 24, 12)).toEqual({ x: 70, y: 50 });
  });

  it('falls back to a vertical segment, and then to nothing', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 40 },
      { x: 20, y: 40 },
    ];
    expect(lagPlateAt(line, 24, 12)).toEqual({ x: 10, y: 20 });
    expect(lagPlateAt(line, 24, 60)).toBeNull();
  });
});

describe('gapLabelAt (NetPoint grammar M3-T3)', () => {
  it('centres the label on the longest horizontal stretch inside the waiting interval', () => {
    const line = [
      { x: 0, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 200, y: 40 },
    ];
    // Waiting from x 30 to 180: 20 px on the first leg, 130 px on the second.
    expect(gapLabelAt(line, 30, 180, 20)).toEqual({ x: 115, y: 40 });
  });

  it('never sits on a vertical, and is withheld where no stretch holds the label', () => {
    const line = [
      { x: 0, y: 10 },
      { x: 0, y: 100 },
      { x: 30, y: 100 },
    ];
    expect(gapLabelAt(line, 0, 30, 31)).toBeNull();
    expect(gapLabelAt(line, 0, 30, 30)).toEqual({ x: 15, y: 100 });
  });
});
