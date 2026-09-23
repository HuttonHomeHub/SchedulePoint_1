import { describe, expect, it } from 'vitest';

import { edgeGapDays } from './geometry';
import {
  CHEVRON_MAX_PER_LINK,
  CHEVRON_SPACING_PX,
  chevronsAlong,
  formatLag,
  lagPlateAt,
  linkRung,
  splitRunsByX,
  waitingSpanX,
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

describe('splitRunsByX', () => {
  it('leaves a line with no waiting whole and solid', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ];
    expect(splitRunsByX(line, 100, 200)).toEqual({ solid: [line], waiting: [] });
  });

  it('cuts a horizontal leg at both boundaries, keeping the order along the line', () => {
    const line = [
      { x: 0, y: 5 },
      { x: 100, y: 5 },
    ];
    expect(splitRunsByX(line, 20, 60)).toEqual({
      solid: [
        [
          { x: 0, y: 5 },
          { x: 20, y: 5 },
        ],
        [
          { x: 60, y: 5 },
          { x: 100, y: 5 },
        ],
      ],
      waiting: [
        [
          { x: 20, y: 5 },
          { x: 60, y: 5 },
        ],
      ],
    });
  });

  it('dashes a vertical inside the interval and keeps one on a boundary solid', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 30 },
      { x: 80, y: 30 },
    ];
    const inside = splitRunsByX(line, 20, 60);
    expect(inside.waiting).toEqual([
      [
        { x: 20, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 30 },
        { x: 60, y: 30 },
      ],
    ]);
    const onBoundary = splitRunsByX(line, 40, 60);
    expect(onBoundary.waiting).toEqual([
      [
        { x: 40, y: 30 },
        { x: 60, y: 30 },
      ],
    ]);
  });

  it('loses no length: the runs cover the line exactly', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 120, y: 40 },
    ];
    const length = (runs: { x: number; y: number }[][]): number =>
      runs.reduce(
        (sum, r) =>
          sum + r.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - r[i]!.x, p.y - r[i]!.y), 0),
        0,
      );
    const { solid, waiting } = splitRunsByX(line, 30, 90);
    expect(length(solid) + length(waiting)).toBeCloseTo(50 + 40 + 70);
  });
});

describe('chevronsAlong', () => {
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

describe('waitingSpanX', () => {
  const px = 12;
  const bar = (start: number, finish: number) => ({ x: start * px, w: (finish + 1 - start) * px });
  const cases = [
    {
      type: 'FS',
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 9,
      succFinishDay: 12,
      lagDays: 2,
    },
    {
      type: 'SS',
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 6,
      succFinishDay: 9,
      lagDays: 1,
    },
    {
      type: 'FF',
      predStartDay: 0,
      predFinishDay: 4,
      succStartDay: 2,
      succFinishDay: 10,
      lagDays: 0,
    },
    {
      type: 'SF',
      predStartDay: 3,
      predFinishDay: 4,
      succStartDay: 0,
      succFinishDay: 8,
      lagDays: 2,
    },
  ] as const;
  const spanOf = (
    c:
      | (typeof cases)[number]
      | {
          type: 'FS';
          predStartDay: number;
          predFinishDay: number;
          succStartDay: number;
          succFinishDay: number;
          lagDays: number;
        },
  ) =>
    waitingSpanX({
      type: c.type,
      pred: bar(c.predStartDay, c.predFinishDay),
      succ: bar(c.succStartDay, c.succFinishDay),
      lagPx: c.lagDays * px,
    });

  it.each(cases)('spans exactly the gap edgeGapDays reports ($type)', (c) => {
    const span = spanOf(c);
    expect(span).not.toBeNull();
    expect((span!.x1 - span!.x0) / px).toBe(edgeGapDays(c));
  });

  it('is null for a driving (zero-gap) tie and for an overlapping lead', () => {
    const base = { type: 'FS' as const, predStartDay: 0, predFinishDay: 4, succFinishDay: 8 };
    expect(spanOf({ ...base, succStartDay: 5, lagDays: 0 })).toBeNull();
    expect(spanOf({ ...base, succStartDay: 2, lagDays: -2 })).toBeNull();
  });
});
