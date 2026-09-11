import type { ActivitySummary } from '@repo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGanttGridEditing } from './use-gantt-grid-editing';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **What a typed date says, and how many times it says it** (ADR-0134 D6).
 *
 * This hook had **no direct coverage at all** before this milestone — every existing test of the
 * grid mounts the panel — so the note's two properties were going to be asserted by nothing. Both
 * are properties of the hook rather than of the markup: how often a sentence is spoken, and how
 * many `announce` calls one commit makes.
 *
 * The second matters more than it reads. This repository has shipped announcement-overwrite
 * defects twice, most recently ADR-0080's bulk delete, where a deletion's own sentence was spoken
 * and then immediately replaced by the row description of whatever focus landed on. Two `announce`
 * calls in one tick is a race whichever order they are written in, so the assertion is that there
 * is exactly ONE — not that the note happens to come second.
 */

const ACTIVITY = {
  id: 'a1',
  name: 'Foundations',
  type: 'TASK',
  version: 7,
  durationDays: 5,
  durationMinutes: 2400,
  earlyStart: '2026-03-02',
  earlyFinish: '2026-03-06',
  visualEffectiveStart: '2026-03-02',
  visualEffectiveFinish: '2026-03-06',
  lateStart: null,
  lateFinish: null,
  constraintType: null,
} as unknown as ActivitySummary;

/**
 * Hoisted, and that is not tidiness. Inlining `[ACTIVITY]` and the callbacks in the render function
 * builds a new array and new closures on every render, which the hook's reseed effect treats as new
 * input — the first version of this file hung the whole suite before printing a single test name.
 * The panel passes a memoised list for the same reason.
 */
const ACTIVITIES = [ACTIVITY];
const GATING = deriveActivityEditorGating({
  penManaged: false,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});
const HOURS_PER_DAY = () => 8;
const NOOP = () => {};

function setup() {
  const announce = vi.fn();
  const updateFields = vi.fn(() => Promise.resolve(ACTIVITY));
  const hook = renderHook(() =>
    useGanttGridEditing({
      activities: ACTIVITIES,
      gating: GATING,
      hasComputedSchedule: true,
      barDateSource: 'early',
      schedulingMode: 'EARLY',
      hoursPerDayFor: HOURS_PER_DAY,
      updateFields,
      announce,
      onCellClosed: NOOP,
      recordUpdate: NOOP,
    }),
  );
  return { hook, announce, updateFields };
}

/** Open a cell, type a value, commit. */
async function type(
  hook: ReturnType<typeof setup>['hook'],
  key: 'earlyStart' | 'earlyFinish' | 'name',
  seed: string,
  text: string,
): Promise<void> {
  act(() => hook.result.current.begin({ activityId: ACTIVITY.id, key }, seed));
  act(() => hook.result.current.change(text));
  await act(async () => {
    await Promise.resolve(hook.result.current.commit());
  });
}

describe('the typed-date note', () => {
  it('explains the pin the first time, and is silent afterwards', async () => {
    // Verified red by returning the sentence unconditionally: the second commit then repeats it.
    const { hook, announce } = setup();

    await type(hook, 'earlyStart', '02 Mar 2026', '04 Mar 2026');
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce.mock.calls[0]![0]).toMatch(/pins the activity there/);

    await type(hook, 'earlyStart', '04 Mar 2026', '05 Mar 2026');
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(2));
    expect(announce.mock.calls[1]![0]).not.toMatch(/pins the activity there/);
  });

  it('makes exactly ONE announcement per commit, note and confirmation together', async () => {
    // The overwrite race. Verified red by announcing the note as a second `announce` call.
    const { hook, announce } = setup();

    await type(hook, 'earlyStart', '02 Mar 2026', '04 Mar 2026');

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce.mock.calls[0]![0]).toMatch(/^Foundations updated\./);
  });

  it('says a different thing for a typed finish, because it does a different thing', async () => {
    // ADR-0134 D3: a typed finish writes a DURATION and no constraint. A note saying "pins the
    // activity" there would be false, which is worse than silence.
    const { hook, announce } = setup();

    await type(hook, 'earlyFinish', '06 Mar 2026', '10 Mar 2026');

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce.mock.calls[0]![0]).toMatch(/changes the duration/);
    expect(announce.mock.calls[0]![0]).not.toMatch(/pins/);
  });

  it('says nothing extra for a cell that is not a date', async () => {
    const { hook, announce } = setup();

    await type(hook, 'name', 'Foundations', 'Piling');

    await waitFor(() => expect(announce).toHaveBeenCalledTimes(1));
    expect(announce.mock.calls[0]![0]).toBe('Foundations updated.');
  });
});
