import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useRecalcOutcomeAnnouncer,
  type RecalcOutcomeAnnouncerInput,
} from './use-recalc-outcome-announcer';

/**
 * **What a recalculation settled** (M5 T5.3).
 *
 * The defect this hook exists for: a coalesced recalculation (ADR-0032 M3) settled in total
 * silence. The only thing a screen-reader user heard after moving a bar was the promise made half a
 * second **before** the dates existed — "Moved “Excavate”; dates will update." — and then the dates
 * updated and nothing said what they were.
 *
 * Most of the rules under test are about **not** speaking: silence when nothing moved, silence when
 * the planner made no edit here, silence once a note has been consumed, and — the one that makes
 * the failure path work without this hook knowing anything about failures — silence when a
 * recalculation was refused, because a refusal changes no value and there is therefore no result
 * to state.
 */
function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-07',
    lateStart: '2026-01-05',
    lateFinish: '2026-01-07',
    totalFloat: 0,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const announce = vi.fn();

beforeEach(() => announce.mockClear());

function setup(initial: Partial<RecalcOutcomeAnnouncerInput> = {}) {
  const props: RecalcOutcomeAnnouncerInput = {
    pending: false,
    activities: [activity()],
    projectFinish: '2026-03-01',
    announce,
    ...initial,
  };
  return renderHook((p: RecalcOutcomeAnnouncerInput) => useRecalcOutcomeAnnouncer(p), {
    initialProps: props,
  });
}

/** Drive one full recalculation cycle: in flight, then settled with whatever the server produced. */
function recalculate(
  rerender: (p: RecalcOutcomeAnnouncerInput) => void,
  base: RecalcOutcomeAnnouncerInput,
  settled: Partial<RecalcOutcomeAnnouncerInput>,
): void {
  act(() => rerender({ ...base, pending: true }));
  act(() => rerender({ ...base, ...settled, pending: false }));
}

describe('useRecalcOutcomeAnnouncer', () => {
  it('names the edited activity and its resulting dates when a settle moved them', () => {
    const before = activity();
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [before],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, {
      activities: [activity({ earlyStart: '2026-01-12', earlyFinish: '2026-01-14' })],
    });

    expect(announce).toHaveBeenCalledExactlyOnceWith('“Excavate” now 12 Jan 2026 to 14 Jan 2026.');
  });

  /**
   * ADR-0073 C1: two facts, two statements. They are separate **sentences**, in one utterance — the
   * shared announcer is a single region that clears and re-sets, so a second `announce()` in the
   * same frame would overwrite the first and speak one fact while dropping the other.
   */
  it('adds the project finish as a second sentence when it also moved', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, {
      activities: [activity({ earlyStart: '2026-01-12', earlyFinish: '2026-01-14' })],
      projectFinish: '2026-03-20',
    });

    expect(announce).toHaveBeenCalledExactlyOnceWith(
      '“Excavate” now 12 Jan 2026 to 14 Jan 2026. Project finish moved to 20 Mar 2026.',
    );
  });

  it('states the project finish alone when the edited activity did not move', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, { projectFinish: '2026-03-20' });

    expect(announce).toHaveBeenCalledExactlyOnceWith('Project finish moved to 20 Mar 2026.');
  });

  it('says nothing when the settle changed neither the activity nor the finish', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, {});

    expect(announce).not.toHaveBeenCalled();
  });

  /**
   * A recalculation triggered by somebody else's edit, or by the plan being opened, is not this
   * planner's news — and naming an activity they never touched invites them to look for a change
   * they did not make.
   */
  it('says nothing when no edit was made on this surface', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { rerender } = setup(base);

    recalculate(rerender, base, {
      activities: [activity({ earlyStart: '2026-01-12', earlyFinish: '2026-01-14' })],
      projectFinish: '2026-03-20',
    });

    expect(announce).not.toHaveBeenCalled();
  });

  it('consumes the note, so a later unrelated settle is silent', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    const moved: RecalcOutcomeAnnouncerInput = {
      ...base,
      activities: [activity({ earlyStart: '2026-01-12', earlyFinish: '2026-01-14' })],
    };
    recalculate(rerender, base, moved);
    expect(announce).toHaveBeenCalledOnce();

    // A second recalculation with no new edit — somebody else's, or a queued run.
    recalculate(rerender, moved, {
      activities: [activity({ earlyStart: '2026-02-02', earlyFinish: '2026-02-04' })],
    });
    expect(announce).toHaveBeenCalledOnce();
  });

  /**
   * The **value-stable signature** is the note's own baseline, not a memory of what was last said:
   * repeated settles on identical values are silent (above), and a bar moved back to a position it
   * held earlier is announced again. Suppressing that would be the one case where this hook withheld
   * a fact that had genuinely changed — a live region that goes quiet exactly when a value returns
   * to a previous state is worse than one that repeats itself.
   */
  it('announces a return to a previously-announced position — it is news again', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);
    const moved: RecalcOutcomeAnnouncerInput = {
      ...base,
      activities: [activity({ earlyStart: '2026-01-12', earlyFinish: '2026-01-14' })],
    };

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, moved);
    expect(announce).toHaveBeenLastCalledWith('“Excavate” now 12 Jan 2026 to 14 Jan 2026.');

    // The planner undoes it: the bar goes back where it started, and that is a second real outcome.
    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, moved, { activities: base.activities });
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith('“Excavate” now 05 Jan 2026 to 07 Jan 2026.');
  });

  /**
   * A refused recalculation (4xx/5xx) leaves every value exactly where it was, so there is nothing
   * to state — and the coalescer's own error message keeps the live region to itself. This hook
   * therefore needs no knowledge of failure at all, which is the reason it is expressed as a value
   * comparison rather than as a success callback.
   */
  it('says nothing when the recalculation failed and no value changed', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, {});

    expect(announce).not.toHaveBeenCalled();
  });

  it('says nothing about an activity that is no longer in the plan', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity()],
      projectFinish: '2026-03-01',
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, { activities: [] });

    expect(announce).not.toHaveBeenCalled();
  });

  it('withholds the dates of a plan that has never been calculated', () => {
    const base: RecalcOutcomeAnnouncerInput = {
      pending: false,
      activities: [activity({ earlyStart: null, earlyFinish: null })],
      projectFinish: null,
      announce,
    };
    const { result, rerender } = setup(base);

    act(() => result.current.noteEdit('a1'));
    recalculate(rerender, base, {});

    expect(announce).not.toHaveBeenCalled();
  });
});
