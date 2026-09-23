import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { drawnDaySpan } from './drawn-span';

/**
 * The drawn span is `barDatesFor`'s dates converted to days, and nothing else — so each case pins
 * one source against a row whose three date pairs all DIFFER, because a helper that read the wrong
 * pair would pass any case where two of them coincide.
 */
const row = {
  earlyStart: '2026-01-11',
  earlyFinish: '2026-01-20',
  visualEffectiveStart: '2026-01-06',
  visualEffectiveFinish: '2026-01-15',
  lateStart: '2026-01-21',
  lateFinish: '2026-01-30',
} as const satisfies Partial<ActivitySummary>;

describe('drawnDaySpan', () => {
  it('reads the effective-Visual dates for the planning surface — never the early ones', () => {
    expect(drawnDaySpan(row, 'visual', '2026-01-01')).toEqual({ startDay: 5, endDay: 14 });
  });

  it('reads the late dates under the Late overlay, as the painter does', () => {
    expect(drawnDaySpan(row, 'late', '2026-01-01')).toEqual({ startDay: 20, endDay: 29 });
  });

  it('reads the early dates only when asked for them', () => {
    expect(drawnDaySpan(row, 'early', '2026-01-01')).toEqual({ startDay: 10, endDay: 19 });
  });

  it('has no span before a recalculation — the canvas draws nothing for that bar either', () => {
    expect(
      drawnDaySpan(
        { ...row, visualEffectiveStart: null, visualEffectiveFinish: null },
        'visual',
        '2026-01-01',
      ),
    ).toBeNull();
  });

  it('collapses a missing finish to the start, as a milestone is drawn', () => {
    expect(drawnDaySpan({ ...row, visualEffectiveFinish: null }, 'visual', '2026-01-01')).toEqual({
      startDay: 5,
      endDay: 5,
    });
  });
});
