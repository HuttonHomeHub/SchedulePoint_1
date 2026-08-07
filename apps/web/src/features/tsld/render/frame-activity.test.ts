import { describe, expect, it } from 'vitest';

import { MIN_CONTEXT_DAYS, type RenderActivity, withMinimumSpan } from './render-model';

const DATA_DATE = '2026-01-01';

function activity(over: Partial<RenderActivity> & { id: string }): RenderActivity {
  return {
    name: over.id,
    code: null,
    laneIndex: 0,
    earlyStart: '2026-02-01',
    earlyFinish: '2026-02-05',
    isCritical: false,
    isNearCritical: false,
    ...over,
  } as RenderActivity;
}

/** Days from the data date, so the assertions read as spans rather than as dates. */
const dayOf = (iso: string): number =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${DATA_DATE}T00:00:00Z`)) / 86_400_000);

describe('withMinimumSpan', () => {
  it('returns nothing for an unscheduled activity', () => {
    // Nothing to frame. The caller announces that rather than framing an arbitrary window.
    expect(withMinimumSpan(activity({ id: 'a', earlyStart: null }), DATA_DATE, MIN_CONTEXT_DAYS));
    expect(
      withMinimumSpan(activity({ id: 'a', earlyStart: null }), DATA_DATE, MIN_CONTEXT_DAYS),
    ).toEqual([]);
  });

  it('leaves a long activity exactly as it is', () => {
    const long = activity({ id: 'a', earlyStart: '2026-02-01', earlyFinish: '2026-06-01' });
    expect(withMinimumSpan(long, DATA_DATE, MIN_CONTEXT_DAYS)).toEqual([long]);
  });

  it('widens a milestone to the minimum span, centred on itself', () => {
    // The case the constant exists for: a zero-span activity would frame to nothing at all.
    const [framed] = withMinimumSpan(
      activity({ id: 'm', earlyStart: '2026-02-10', earlyFinish: '2026-02-10' }),
      DATA_DATE,
      MIN_CONTEXT_DAYS,
    );
    expect(framed).toBeDefined();
    const start = dayOf(framed!.earlyStart!);
    const finish = dayOf(framed!.earlyFinish!);
    expect(finish - start).toBeGreaterThanOrEqual(MIN_CONTEXT_DAYS);
    const midpoint = (start + finish) / 2;
    expect(Math.abs(midpoint - dayOf('2026-02-10'))).toBeLessThanOrEqual(1);
  });

  it('grows a short task symmetrically, so it stays where the planner is looking', () => {
    const [framed] = withMinimumSpan(
      activity({ id: 'a', earlyStart: '2026-02-10', earlyFinish: '2026-02-12' }),
      DATA_DATE,
      MIN_CONTEXT_DAYS,
    );
    const start = dayOf(framed!.earlyStart!);
    const finish = dayOf(framed!.earlyFinish!);
    expect(finish - start).toBeGreaterThanOrEqual(MIN_CONTEXT_DAYS);
    // Roughly equal padding on each side — not "grow rightwards", which would slide the bar to the
    // left edge of the new frame.
    const padLeft = dayOf('2026-02-10') - start;
    const padRight = finish - dayOf('2026-02-12');
    expect(Math.abs(padLeft - padRight)).toBeLessThanOrEqual(1);
  });

  it('never mutates the activity it was handed', () => {
    // The widened span is a framing decision. Writing it back would make an activity's dates lie.
    const short = activity({ id: 'a', earlyStart: '2026-02-10', earlyFinish: '2026-02-11' });
    withMinimumSpan(short, DATA_DATE, MIN_CONTEXT_DAYS);
    expect(short.earlyStart).toBe('2026-02-10');
    expect(short.earlyFinish).toBe('2026-02-11');
  });

  it('treats a missing finish as a zero-span point', () => {
    const [framed] = withMinimumSpan(
      activity({ id: 'a', earlyStart: '2026-02-10', earlyFinish: null }),
      DATA_DATE,
      MIN_CONTEXT_DAYS,
    );
    expect(framed).toBeDefined();
    expect(dayOf(framed!.earlyFinish!) - dayOf(framed!.earlyStart!)).toBeGreaterThanOrEqual(
      MIN_CONTEXT_DAYS,
    );
  });
});
