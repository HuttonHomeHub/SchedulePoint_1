import { describe, expect, it } from 'vitest';

import { drawnSpanDays, finishMilestoneDayShift } from './drawn-span.js';

const dayOf = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
const FRIDAY = dayOf('2026-01-09');

describe('drawnSpanDays', () => {
  it('a task spans its inclusive dates, unshifted', () => {
    expect(
      drawnSpanDays({ type: 'TASK', start: '2026-01-05', finish: '2026-01-09' }, dayOf),
    ).toEqual({ startDay: FRIDAY - 4, endDay: FRIDAY });
  });

  it('a finish milestone sits one day later at BOTH ends (ADR-0155)', () => {
    expect(
      drawnSpanDays({ type: 'FINISH_MILESTONE', start: '2026-01-09', finish: '2026-01-09' }, dayOf),
    ).toEqual({ startDay: FRIDAY + 1, endDay: FRIDAY + 1 });
  });

  it('a start milestone is unshifted', () => {
    expect(
      drawnSpanDays({ type: 'START_MILESTONE', start: '2026-01-09', finish: '2026-01-09' }, dayOf),
    ).toEqual({ startDay: FRIDAY, endDay: FRIDAY });
  });

  it('a missing finish collapses to the start, and a missing start is not drawn', () => {
    expect(drawnSpanDays({ type: 'TASK', start: '2026-01-09', finish: null }, dayOf)).toEqual({
      startDay: FRIDAY,
      endDay: FRIDAY,
    });
    expect(drawnSpanDays({ type: 'TASK', start: null, finish: '2026-01-09' }, dayOf)).toBeNull();
  });
});

describe('finishMilestoneDayShift', () => {
  it('shifts only a finish milestone', () => {
    expect(finishMilestoneDayShift('FINISH_MILESTONE')).toBe(1);
    expect(finishMilestoneDayShift('START_MILESTONE')).toBe(0);
    expect(finishMilestoneDayShift('TASK')).toBe(0);
    expect(finishMilestoneDayShift(undefined)).toBe(0);
  });
});
