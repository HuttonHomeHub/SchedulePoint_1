import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { barGeometry } from './bar-geometry';

/**
 * **A VISUAL plan's Gantt draws from the effective-Visual columns, not the early ones.**
 *
 * `docs/TECH_DEBT.md` #135. `barGeometry` destructured `activity.earlyStart`/`earlyFinish`
 * unconditionally while the canvas was handed `barDateSourceFor(...)` and read
 * `visualEffectiveStart` in VISUAL mode — so the chart and the diagram disagreed about where every
 * hand-placed bar sat. Each view was internally consistent, which is why nobody reported it: the
 * disagreement is visible only to someone opening the same plan two ways.
 *
 * The fixture below is the shape that makes the defect unambiguous — an activity whose planner
 * placement (`visualEffective*`) is **a month away** from its computed earliest, so a geometry
 * derived from the wrong pair cannot coincidentally match.
 *
 * Verified red first: against the previous `bar-geometry.ts` the VISUAL case returns x=0 (the early
 * date, which is the anchor) instead of x=310.
 */
const PX_PER_DAY = 10;
const ANCHOR = '2026-01-01';

/** Early: 1–5 Jan. Visual: 1–5 Feb — a month later, and two days longer. */
const PLACED = {
  id: 'a1',
  type: 'TASK',
  earlyStart: '2026-01-01',
  earlyFinish: '2026-01-05',
  visualEffectiveStart: '2026-02-01',
  visualEffectiveFinish: '2026-02-07',
  lateStart: '2026-03-01',
  lateFinish: '2026-03-05',
  totalFloat: 0,
} as unknown as ActivitySummary;

describe('barGeometry — the bar-date source', () => {
  it('draws from the early dates by default, which is every EARLY-mode plan', () => {
    const g = barGeometry(PLACED, ANCHOR, PX_PER_DAY);
    expect(g).not.toBeNull();
    expect(g?.x).toBe(0);
    // Inclusive dates (ADR-0023): 1–5 Jan is five days.
    expect(g?.width).toBe(5 * PX_PER_DAY);
  });

  it('draws from the effective-Visual dates in VISUAL mode — the defect this closes', () => {
    const g = barGeometry(PLACED, ANCHOR, PX_PER_DAY, 'visual');
    expect(g).not.toBeNull();
    // 1 Feb is 31 days after 1 Jan.
    expect(g?.x).toBe(31 * PX_PER_DAY);
    // 1–7 Feb inclusive is seven days — so the WIDTH moves too, not just the position. A fix that
    // only re-anchored the start would pass the assertion above and fail this one.
    expect(g?.width).toBe(7 * PX_PER_DAY);
  });

  it('draws from the late dates under the Late-start overlay', () => {
    const g = barGeometry(PLACED, ANCHOR, PX_PER_DAY, 'late');
    // 1 Mar is 59 days after 1 Jan (Jan 31 + Feb 28, 2026 not being a leap year).
    expect(g?.x).toBe(59 * PX_PER_DAY);
  });

  it('returns null when the SELECTED source has no dates, not when another source does', () => {
    // The guard must test the resolved pair. An activity with early dates but no Visual placement
    // must render nothing in VISUAL mode rather than silently falling back to the early ones —
    // a fallback would put the bar at a date the engine never assigned it, which is the same
    // class of lie as the original defect.
    const noVisual = { ...PLACED, visualEffectiveStart: null, visualEffectiveFinish: null };
    expect(barGeometry(noVisual, ANCHOR, PX_PER_DAY, 'visual')).toBeNull();
    expect(barGeometry(noVisual, ANCHOR, PX_PER_DAY)).not.toBeNull();
  });
});
