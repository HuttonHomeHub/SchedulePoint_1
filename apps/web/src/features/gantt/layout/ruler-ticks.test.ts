import { describe, expect, it } from 'vitest';

import { buildRulerTicks, DAY_TICK_MIN_PX } from './ruler-ticks';

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
    const [first] = major('2026-03-01', 10, 1);
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
});
