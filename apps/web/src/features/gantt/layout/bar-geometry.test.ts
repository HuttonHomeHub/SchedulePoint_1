import { describe, expect, it } from 'vitest';

import {
  CHART_PADDING_DAYS,
  MIN_BAR_WIDTH_PX,
  barGeometry,
  baselineGeometry,
  chartAnchor,
  chartWidth,
  fitPxPerDay,
} from './bar-geometry';

import { anActivity } from '@/test/activity-fixture';

const ANCHOR = '2026-02-01';

describe('barGeometry', () => {
  it('places a bar at its start offset from the anchor', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-02-03', earlyFinish: '2026-02-03' }),
      ANCHOR,
      10,
    );
    expect(geo?.x).toBe(20);
  });

  // ADR-0023: dates are inclusive, so a one-day activity starts and finishes the same day and
  // must be one day wide — not zero. Getting this wrong makes every bar a day short.
  it('is inclusive: a one-day activity is one day wide', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-02-02', earlyFinish: '2026-02-02' }),
      ANCHOR,
      10,
    );
    expect(geo?.width).toBe(10);
  });

  it('spans finish minus start plus one', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-02-02', earlyFinish: '2026-02-06' }),
      ANCHOR,
      10,
    );
    expect(geo?.width).toBe(50);
  });

  it('places a bar left of the anchor at a negative x', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-01-30', earlyFinish: '2026-01-31' }),
      ANCHOR,
      10,
    );
    expect(geo?.x).toBe(-20);
  });

  // A real activity that renders as nothing reads as "not scheduled", which is a different and
  // wrong statement. Clamping keeps it visible at every zoom.
  it('clamps a sub-pixel bar to a visible minimum', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-02-02', earlyFinish: '2026-02-02' }),
      ANCHOR,
      0.05,
    );
    expect(geo?.width).toBe(MIN_BAR_WIDTH_PX);
  });

  it('renders a milestone as a diamond with no width', () => {
    const geo = barGeometry(
      anActivity({
        type: 'START_MILESTONE',
        durationDays: 0,
        earlyStart: '2026-02-05',
        earlyFinish: '2026-02-05',
      }),
      ANCHOR,
      10,
    );
    expect(geo).toMatchObject({ milestone: true, width: 0, floatWidth: 0 });
  });

  it('renders a finish milestone as a diamond too', () => {
    const geo = barGeometry(
      anActivity({
        type: 'FINISH_MILESTONE',
        durationDays: 0,
        earlyStart: '2026-02-05',
        earlyFinish: '2026-02-05',
      }),
      ANCHOR,
      10,
    );
    expect(geo?.milestone).toBe(true);
  });

  // ADR-0035: a zero-duration TASK is not a milestone. The two must be told apart or the chart
  // silently reclassifies the planner's data.
  it('renders a zero-duration task as a bar, not a diamond', () => {
    const geo = barGeometry(
      anActivity({
        type: 'TASK',
        durationDays: 0,
        earlyStart: '2026-02-05',
        earlyFinish: '2026-02-05',
      }),
      ANCHOR,
      10,
    );
    expect(geo?.milestone).toBe(false);
    expect(geo?.width).toBe(10);
  });

  it('returns null when the plan has not been calculated', () => {
    expect(barGeometry(anActivity({ earlyStart: null, earlyFinish: null }), ANCHOR, 10)).toBeNull();
  });

  it('returns null when only one endpoint is known', () => {
    expect(
      barGeometry(anActivity({ earlyStart: '2026-02-02', earlyFinish: null }), ANCHOR, 10),
    ).toBeNull();
    expect(
      barGeometry(anActivity({ earlyStart: null, earlyFinish: '2026-02-06' }), ANCHOR, 10),
    ).toBeNull();
  });

  describe('float tail', () => {
    it('trails the bar by the total float', () => {
      const geo = barGeometry(anActivity({ totalFloat: 4 }), ANCHOR, 10);
      expect(geo?.floatWidth).toBe(40);
    });

    it('is absent when float is zero — a critical activity has no slack to draw', () => {
      expect(barGeometry(anActivity({ totalFloat: 0 }), ANCHOR, 10)?.floatWidth).toBe(0);
    });

    it('is absent when float is null (not yet calculated)', () => {
      expect(barGeometry(anActivity({ totalFloat: null }), ANCHOR, 10)?.floatWidth).toBe(0);
    });

    // Negative float means the activity is late, not that it has slack. A tail would draw the
    // opposite of what it means.
    it('is absent for negative float', () => {
      expect(barGeometry(anActivity({ totalFloat: -12 }), ANCHOR, 10)?.floatWidth).toBe(0);
    });
  });

  describe('progress fill', () => {
    it.each([
      [0, 0],
      [50, 0.5],
      [100, 1],
    ])('maps %i%% complete to %d', (percent, expected) => {
      expect(barGeometry(anActivity({ percentComplete: percent }), ANCHOR, 10)?.progress).toBe(
        expected,
      );
    });

    it('clamps out-of-range values rather than overflowing the bar', () => {
      expect(barGeometry(anActivity({ percentComplete: 140 }), ANCHOR, 10)?.progress).toBe(1);
      expect(barGeometry(anActivity({ percentComplete: -20 }), ANCHOR, 10)?.progress).toBe(0);
    });

    it('treats NaN as no progress', () => {
      expect(barGeometry(anActivity({ percentComplete: Number.NaN }), ANCHOR, 10)?.progress).toBe(
        0,
      );
    });
  });

  // A UTC-exact day count must not shift when the span crosses a DST boundary in the viewer's
  // local zone — a bar that moves a day in March would be a real, visible defect.
  it('is unaffected by a DST boundary in the span', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2026-03-28', earlyFinish: '2026-03-30' }),
      '2026-03-28',
      10,
    );
    expect(geo?.x).toBe(0);
    expect(geo?.width).toBe(30);
  });

  it('handles a leap day', () => {
    const geo = barGeometry(
      anActivity({ earlyStart: '2028-02-28', earlyFinish: '2028-03-01' }),
      '2028-02-28',
      10,
    );
    expect(geo?.width).toBe(30);
  });
});

describe('chart framing', () => {
  it('anchors a padding day before the first activity', () => {
    expect(chartAnchor({ start: '2026-02-02' })).toBe('2026-02-01');
  });

  it('anchors correctly across a month boundary', () => {
    expect(chartAnchor({ start: '2026-03-01' })).toBe('2026-02-28');
  });

  it('spans the data plus padding on both sides', () => {
    const width = chartWidth({ start: '2026-02-02', finish: '2026-02-06' }, 10);
    expect(width).toBe((5 + CHART_PADDING_DAYS * 2) * 10);
  });

  it('gives a single-day plan a non-zero width', () => {
    expect(chartWidth({ start: '2026-02-02', finish: '2026-02-02' }, 10)).toBeGreaterThan(0);
  });
});

describe('baselineGeometry', () => {
  const row = (over: Partial<Parameters<typeof baselineGeometry>[0]> = {}) => ({
    inBaseline: true,
    baselineStart: '2026-02-02',
    baselineFinish: '2026-02-06',
    ...over,
  });

  it('places the ghost at its baselined start', () => {
    expect(baselineGeometry(row(), ANCHOR, 10)?.x).toBe(10);
  });

  // A ghost a day short of the bar it is compared against reads as drift that does not exist.
  it('is inclusive, exactly like the live bar', () => {
    expect(baselineGeometry(row(), ANCHOR, 10)?.width).toBe(50);
    expect(baselineGeometry(row({ baselineFinish: '2026-02-02' }), ANCHOR, 10)?.width).toBe(10);
  });

  it('clamps a sub-pixel ghost so it stays visible', () => {
    expect(baselineGeometry(row({ baselineFinish: '2026-02-02' }), ANCHOR, 0.05)?.width).toBe(
      MIN_BAR_WIDTH_PX,
    );
  });

  it.each([
    ['the activity was added after the baseline', { inBaseline: false }],
    ['the baseline has no start', { baselineStart: null }],
    ['the baseline has no finish', { baselineFinish: null }],
  ])('draws nothing when %s', (_label, over) => {
    expect(baselineGeometry(row(over), ANCHOR, 10)).toBeNull();
  });
});

describe('fitPxPerDay', () => {
  const span = { start: '2026-02-02', finish: '2026-02-11' }; // 10 days + 2 padding = 12

  // The round trip is the point: fitting a span to a width, then measuring the chart at that
  // scale, must land back on the width. A printed page that is 3% too wide clips a column.
  it('is the inverse of chartWidth', () => {
    const px = fitPxPerDay(span, 600);
    expect(chartWidth(span, px)).toBeCloseTo(600, 6);
  });

  it('shrinks the scale as the span grows, for a fixed page', () => {
    const short = fitPxPerDay({ start: '2026-02-02', finish: '2026-02-11' }, 600);
    const long = fitPxPerDay({ start: '2026-02-02', finish: '2036-02-11' }, 600);
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThan(0);
  });

  // A caller that has measured nothing must draw nothing, not divide into infinity.
  it.each([0, -100])('returns zero for a non-positive width (%s)', (width) => {
    expect(fitPxPerDay(span, width)).toBe(0);
  });

  it('handles a single-day span without dividing by zero', () => {
    expect(fitPxPerDay({ start: '2026-02-02', finish: '2026-02-02' }, 600)).toBe(200);
  });
});
