import { describe, expect, it } from 'vitest';

import {
  buildRulerTicks,
  DAY_TICK_MIN_PX,
  MONTH_LABEL_MIN_PITCH_PX,
  monthLabelSamples,
} from './ruler-ticks';

/**
 * The tick maths is shared by the on-screen ruler and the printed document (ADR-0059 M4). Testing
 * it directly, rather than only through either surface's DOM, is what stops a change made for one
 * from silently moving a month boundary in the other.
 */
describe('buildRulerTicks', () => {
  const major = (anchor: string, width: number, px: number): ReturnType<typeof buildRulerTicks> =>
    buildRulerTicks(anchor, width, px).filter((t) => t.major);

  it('marks every month boundary within the rendered width', () => {
    // 120 days from 1 Feb reaches into June: Feb 1 itself plus Mar, Apr, May, Jun.
    expect(major('2026-02-01', 120, 1)).toHaveLength(5);
  });

  it('labels a month tick with its month and year', () => {
    const [first] = major('2026-03-01', 30, 3);
    expect(first?.label).toMatch(/Mar/);
    expect(first?.label).toMatch(/2026/);
  });

  it('places a month tick at the pixel its date falls on', () => {
    // 1 Mar is 27 days after 2 Feb; at 3px/day that is x = 81.
    const [first] = major('2026-02-02', 200, 3);
    expect(first?.x).toBe(81);
  });

  it('omits day ticks below the legibility threshold', () => {
    const ticks = buildRulerTicks('2026-02-02', 280, DAY_TICK_MIN_PX - 1);
    expect(ticks.filter((t) => !t.major)).toHaveLength(0);
  });

  it('draws day ticks once each has room', () => {
    const ticks = buildRulerTicks('2026-02-02', 280, DAY_TICK_MIN_PX);
    expect(ticks.filter((t) => !t.major).length).toBeGreaterThan(0);
  });

  // Iteration is bounded by the rendered width, not the plan's duration — a ten-year programme
  // must not cost ten years of ticks.
  it('costs the same for a long plan as a short one at the same width', () => {
    const short = buildRulerTicks('2026-02-02', 200, 2);
    const long = buildRulerTicks('2016-02-02', 200, 2);
    expect(long.length).toBeLessThanOrEqual(short.length + 2);
  });

  it('returns nothing for a zero width rather than looping', () => {
    expect(buildRulerTicks('2026-02-02', 0, 6)).toHaveLength(0);
  });

  it('returns nothing for a non-positive scale', () => {
    expect(buildRulerTicks('2026-02-02', 200, 0)).toHaveLength(0);
    expect(buildRulerTicks('2026-02-02', 200, -4)).toHaveLength(0);
  });

  describe('month labels thin out as the zoom drops', () => {
    const labelled = (
      anchor: string,
      width: number,
      px: number,
    ): ReturnType<typeof buildRulerTicks> => major(anchor, width, px).filter((t) => t.label !== '');

    // The reported defect: a ~19-month plan fitted to a 1912 px window is ~1.1 px/day, and every
    // month name was printed 33 px from the next.
    it('keeps labels at least the minimum pitch apart when a 19-month plan is fitted', () => {
      const labels = labelled('2026-01-01', 1912 - 400, 1.1);
      expect(labels.length).toBeGreaterThan(1);
      for (let i = 1; i < labels.length; i += 1) {
        expect(labels[i]!.x - labels[i - 1]!.x).toBeGreaterThanOrEqual(MONTH_LABEL_MIN_PITCH_PX);
      }
    });

    it('still draws a line at every month boundary when it drops labels', () => {
      // 19 months from 1 Jan 2026 reach 1 Jul 2027 (day 546 at 1.1 px/day = 600 px): 19 starts.
      expect(major('2026-01-01', 600, 1.1)).toHaveLength(19);
      expect(labelled('2026-01-01', 600, 1.1).length).toBeLessThan(19);
    });

    it('labels every month when there is room', () => {
      expect(labelled('2026-01-01', 400, 6)).toHaveLength(major('2026-01-01', 400, 6).length);
    });

    it('aligns quarterly labels to Jan/Apr/Jul/Oct, whatever the first visible month', () => {
      // 0.8 px/day: a month is 24 px, a quarter 73 px — the first step that fits is 3.
      const labels = labelled('2026-02-01', 700, 0.8);
      expect(labels.map((t) => t.label.slice(0, 3))).toEqual(
        expect.arrayContaining(['Apr', 'Jul', 'Oct']),
      );
      for (const t of labels) expect(t.label).toMatch(/^(Jan|Apr|Jul|Oct)/);
      expect(labels.map((t) => t.label)).not.toContain(expect.stringMatching(/^Feb/));
    });

    it('labels only January at half-yearly-and-wider steps, and thins Januaries beyond a year', () => {
      const yearly = labelled('2026-01-01', 3000, 0.2); // a year is 73 px
      for (const t of yearly) expect(t.label).toMatch(/^Jan/);
      const sparse = labelled('2020-01-01', 3000, 0.05); // a year is 18 px: every 5th year
      expect(sparse.length).toBeGreaterThan(0);
      for (const t of sparse) expect(Number(t.label.slice(-4)) % 5).toBe(0);
    });

    // #501: 65.5 px between labels 99.1 px wide overprinted at 200 % text. A wider label must
    // thin to a coarser step rather than keep the 64 px floor.
    it('thins to a coarser step when the caller measures a wider label', () => {
      // 1.07 px/day: a quarter is 97.7 px, a half-year 195 px, a month 32.6 px.
      const at = (pitch?: number): string[] =>
        buildRulerTicks('2026-01-01', 700, 1.07, pitch)
          .filter((t) => t.label !== '')
          .map((t) => t.label);
      expect(at()).toHaveLength(at(MONTH_LABEL_MIN_PITCH_PX).length);
      const wide = at(113);
      expect(wide.length).toBeLessThan(at().length);
      for (const label of wide) expect(label).toMatch(/^(Jan|Jul)/);
    });

    it('keeps labels a measured pitch apart', () => {
      const labels = labelled('2026-01-01', 900, 1.07).length;
      const pitch = 113;
      const wide = buildRulerTicks('2026-01-01', 900, 1.07, pitch).filter((t) => t.label !== '');
      expect(wide.length).toBeLessThan(labels);
      for (let i = 1; i < wide.length; i += 1) {
        expect(wide[i]!.x - wide[i - 1]!.x).toBeGreaterThanOrEqual(pitch);
      }
    });

    // The printed document passes no pitch, and paper does not scale with text size: its ticks
    // are what the default produces. (The zero-label fallback below changes a range only where it
    // had no label at all, at any pitch.)
    it.each([0.2, 0.8, 1.1, 3, 6, 20])('is unchanged for the default pitch at %s px/day', (px) => {
      expect(buildRulerTicks('2026-01-01', 1500, px)).toEqual(
        buildRulerTicks('2026-01-01', 1500, px, MONTH_LABEL_MIN_PITCH_PX),
      );
    });
  });

  describe('a range whose step lands on no month in view still carries one label', () => {
    const labels = (anchor: string, width: number, px: number, pitch?: number): string[] =>
      buildRulerTicks(anchor, width, px, pitch)
        .filter((t) => t.label !== '')
        .map((t) => t.label);

    it('labels the first month start in a year-long range at the yearly step', () => {
      // 0.3 px/day with a 113 px pitch is the every-January step; 300 days from 1 Feb holds none.
      const found = labels('2026-02-01', 90, 0.3, 113);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^Feb/);
    });

    it('labels one month in a short range at the half-year step with no January or July', () => {
      // 0.6 px/day: the half-year step; 100 days from 1 Feb reach May.
      expect(labels('2026-02-01', 60, 0.6)).toHaveLength(1);
    });

    it('adds nothing where a label already lands', () => {
      expect(labels('2026-01-01', 90, 0.3, 113)).toEqual(['Jan 2026']);
    });
  });

  describe('monthLabelSamples', () => {
    it('gives one label per month of the year', () => {
      const samples = monthLabelSamples();
      expect(samples).toHaveLength(12);
      for (const s of samples) expect(s).toMatch(/2027/);
    });
  });
});
