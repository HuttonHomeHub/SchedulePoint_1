import { describe, expect, it } from 'vitest';

import { barDateSourceFor, barDatesFor } from './bar-dates';

/**
 * **This file exists because the function deciding where every bar in the product is drawn had no
 * test at all** — found while collapsing the scheduling mode (M-F-T1).
 *
 * Six suites `vi.mock` `barDateSourceFor` to `() => 'early'` (`plan-workspace-toolbar.test.tsx`
 * and its neighbours), which pins the mock and says nothing about the rule; the rule itself was
 * never called by anything but the product. So the whole read path collapsed from two branches to
 * one, the entire web suite — 686 files — stayed green, and that proved nothing whatsoever.
 *
 * A green suite that cannot distinguish the change from its absence is the shape this register
 * files most often, and the honest response is a test rather than relief.
 */
describe('barDateSourceFor — which dates draw a bar', () => {
  it('draws a bar where it is PLACED, because there is no mode left to consult', () => {
    /**
     * The collapse in one assertion (M-F). Until it, this took the plan's `schedulingMode` and
     * returned `'early'` for all but the minority of plans a planner had switched to VISUAL.
     *
     * **`'visual'` is not "Pass 1 is gone".** Pass 1 is the float, the criticality, the Late dates,
     * the drift a placement is measured against, every DCMA metric and the whole ADR-0034 matrix;
     * it runs on every recalculation exactly as before, and `computeSchedule` never took a
     * `schedulingMode` in the first place. What collapsed is which of two already-computed columns
     * a BAR reads.
     */
    expect(barDateSourceFor(false)).toBe('visual');
  });

  it('gives the Late-start overlay precedence, which is the one rule that survived', () => {
    // ADR-0033 M4: the overlay is a read-only display of the late dates and outranks the placement,
    // because its whole purpose is to answer "how late could this be?" rather than "where is it?".
    expect(barDateSourceFor(true)).toBe('late');
  });
});

describe('barDatesFor — the columns each source reads', () => {
  const activity = {
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-07',
    visualEffectiveStart: '2026-01-12',
    visualEffectiveFinish: '2026-01-14',
    lateStart: '2026-02-02',
    lateFinish: '2026-02-04',
  };

  it('reads a different pair for each source, so the sources are distinguishable', () => {
    // Three distinct pairs in the fixture deliberately: with two sources sharing values, a resolver
    // that returned the wrong one would pass — which is how a rule about WHICH column to read comes
    // to be tested by a case that cannot see the difference.
    expect(barDatesFor(activity, 'early')).toEqual({ start: '2026-01-05', finish: '2026-01-07' });
    expect(barDatesFor(activity, 'visual')).toEqual({ start: '2026-01-12', finish: '2026-01-14' });
    expect(barDatesFor(activity, 'late')).toEqual({ start: '2026-02-02', finish: '2026-02-04' });
  });

  it('defaults to the early dates, which is now an ANALYSIS default rather than a view default', () => {
    /**
     * The parameter's default is unchanged by the collapse and its meaning is not. It used to be
     * "what most plans draw"; it is now "what the analyses measure" — DCMA, float paths and
     * baseline float variance all read the network rather than the plan as placed
     * (`float-basis.structural.test.ts` pins that on both sides).
     *
     * Kept rather than flipped to `'visual'`: every view passes a source explicitly, so flipping it
     * would change nothing a caller reaches and would quietly re-point any future caller that
     * omitted one — towards the placed basis, which is exactly the argument that makes `'early'`
     * the safer resting value for a reader who did not choose.
     */
    expect(barDatesFor(activity)).toEqual({ start: '2026-01-05', finish: '2026-01-07' });
  });

  it('passes a null through rather than substituting another source', () => {
    // Before the first recalculation every column is null. A resolver that fell back to a
    // neighbouring pair would draw a bar somewhere plausible on a plan that has no dates at all.
    const uncomputed = {
      earlyStart: null,
      earlyFinish: null,
      visualEffectiveStart: null,
      visualEffectiveFinish: null,
      lateStart: null,
      lateFinish: null,
    };
    expect(barDatesFor(uncomputed, 'visual')).toEqual({ start: null, finish: null });
  });
});
