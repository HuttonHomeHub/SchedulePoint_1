import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFollowPlanOffer } from './use-follow-plan-offer';

import type { Command } from '@/features/undo-redo';
import { APPLIED } from '@/features/undo-redo/replay';
import { usePlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The whole-plan Follow logic offer's state** (placed-bar-follows-link M3, ADR-0216 D6): a standing
 * condition read from the activities, dismissible for the session, with the same visible phases as the
 * edit offer. The write itself is the model's `followLogicRowsWrite`, so what is asserted here is
 * which bars count, when the strip is there, and what the write's outcome turns it into.
 */

function bar(id: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return anActivity({
    id,
    name: id,
    visualStart: '2026-02-01',
    visualConflictReason: null,
    ...overrides,
  });
}
const early = { visualConflictReason: 'EARLIER_THAN_LOGIC' } as const;

function step(label: string): Command {
  return {
    label,
    subjects: [],
    undo: () => Promise.resolve(APPLIED),
    redo: () => Promise.resolve(APPLIED),
  };
}

interface Harness {
  rows: ActivitySummary[];
  enabled: boolean;
  settled: number;
  pendingEdits: number;
}

function setup(initial: Partial<Harness> = {}) {
  const state: Harness = {
    rows: [bar('A'), bar('B', early), bar('C', early)],
    enabled: true,
    settled: 0,
    pendingEdits: 0,
    ...initial,
  };
  const announce = vi.fn();
  const view = renderHook(
    (props: Harness) => {
      const history = usePlanEditHistory('p1');
      const plan = useFollowPlanOffer({
        enabled: props.enabled,
        planId: 'p1',
        activities: props.rows,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        history,
        announce,
      });
      return { history, plan };
    },
    { initialProps: { ...state } },
  );
  const rerender = (next: Partial<Harness> = {}): void => {
    Object.assign(state, next);
    view.rerender({ ...state });
  };
  return { view, state, rerender, announce };
}

/** Press Follow logic and have the write land and record its step. */
function pressAndLand(view: ReturnType<typeof setup>['view']): Command {
  const recorded = step('Follow logic for 2 activities');
  act(() => {
    view.result.current.plan.start('B', 2);
  });
  act(() => {
    view.result.current.history.record(recorded);
    view.result.current.plan.succeed(recorded);
  });
  return recorded;
}

describe('useFollowPlanOffer', () => {
  it('offers the count of placed, flagged bars, and says nothing on mount: a standing condition', () => {
    const { view, announce } = setup();
    const { offer } = view.result.current.plan;
    expect(offer?.count).toBe(2);
    expect(offer?.phase).toBe('idle');
    expect(offer?.message).toBe('2 bars stay where they were placed, before their logic allows.');
    expect(announce).not.toHaveBeenCalled();
  });

  it('is absent when no placed bar is flagged', () => {
    const { view } = setup({ rows: [bar('A'), bar('B')] });
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('counts a started bar or a summary as nothing, so the count can read below the conflict chip', () => {
    const { view } = setup({
      rows: [
        bar('B', early),
        bar('S', { type: 'WBS_SUMMARY', ...early }),
        bar('C', { ...early, actualStart: '2026-01-20' }),
      ],
    });
    expect(view.result.current.plan.offer?.count).toBe(1);
  });

  it('is omitted without the pen: its whole content is a pen-gated offer', () => {
    const { view } = setup({ enabled: false });
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('stays dismissed for the plan once dismissed, even as the count changes', () => {
    const { view, rerender } = setup();
    act(() => view.result.current.plan.dismiss());
    expect(view.result.current.plan.offer).toBeNull();
    rerender({ rows: [bar('B', early), bar('C', early), bar('D', early)] });
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('flags a count over the batch route’s limit, so the host can shade the button', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => bar(`R${String(i)}`, early));
    const over = setup({ rows });
    expect(over.view.result.current.plan.offer?.count).toBe(2001);
    expect(over.view.result.current.plan.overLimit).toBe(true);
    expect(setup().view.result.current.plan.overLimit).toBe(false);
  });

  it('goes busy when pressed, and refuses a second press: no double-submit', () => {
    const { view } = setup();
    let first: boolean | undefined;
    let second: boolean | undefined;
    act(() => {
      first = view.result.current.plan.start('B', 2);
    });
    act(() => {
      second = view.result.current.plan.start('B', 2);
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(view.result.current.plan.offer?.phase).toBe('busy');
    expect(view.result.current.plan.offer?.message).toBe('Moving “B” and 1 other…');
  });

  it('stays up as "Moving…" while the recalculation runs even though the flags are cleared, then confirms', () => {
    // **Verified red** by dropping the held state: the cache loses the flags first, the offer's count
    // reads zero, and the strip vanishes with no confirmation and no Undo.
    const { view, rerender } = setup();
    pressAndLand(view);
    rerender({ rows: [bar('A'), bar('B'), bar('C')] });
    expect(view.result.current.plan.offer?.phase).toBe('moving');
    rerender({ settled: 1 });
    const { offer } = view.result.current.plan;
    expect(offer?.phase).toBe('done');
    expect(offer?.undoable).toBe(true);
    expect(offer?.message).toBe('“B” and 1 other now follow their logic; dates will update.');
  });

  it('keeps the offer and says why after a failure, and Try again can start it once more', () => {
    const { view } = setup();
    act(() => {
      view.result.current.plan.start('B', 2);
    });
    act(() =>
      view.result.current.plan.fail('Couldn’t move “B” and 1 other just now. Nothing was changed.'),
    );
    expect(view.result.current.plan.offer?.phase).toBe('failed');
    expect(view.result.current.plan.offer?.message).toContain('Nothing was changed');
    let again: boolean | undefined;
    act(() => {
      again = view.result.current.plan.start('B', 2);
    });
    expect(again).toBe(true);
  });

  it('announces a failure once, because the strip itself has no live role', () => {
    const { view, announce } = setup();
    act(() => {
      view.result.current.plan.start('B', 2);
    });
    act(() => view.result.current.plan.fail('Nothing was changed.'));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Nothing was changed.');
  });

  it('returns to asking when the pen was lost mid-press: the pen banner owns that message', () => {
    const { view } = setup();
    act(() => {
      view.result.current.plan.start('B', 2);
    });
    act(() => view.result.current.plan.restore());
    expect(view.result.current.plan.offer?.phase).toBe('idle');
    expect(view.result.current.plan.offer?.message).toBe(
      '2 bars stay where they were placed, before their logic allows.',
    );
  });

  it('withdraws the confirmation when anything else lands on the undo stack', () => {
    const { view, rerender } = setup();
    pressAndLand(view);
    rerender({ rows: [bar('A'), bar('B'), bar('C')], settled: 1 });
    expect(view.result.current.plan.offer?.phase).toBe('done');
    act(() => view.result.current.history.record(step('Something later')));
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('forgets a held confirmation on an undo or redo, so a redo cannot bring it back', () => {
    const { view, rerender } = setup();
    pressAndLand(view);
    rerender({ rows: [bar('A'), bar('B'), bar('C')], settled: 1 });
    // An undo has put the placements back, so the standing condition is true again: the offer is the
    // fresh question, not the old confirmation, which a redo must not resurrect.
    act(() => view.result.current.plan.noteReplay());
    rerender({ rows: [bar('A'), bar('B', early), bar('C', early)] });
    expect(view.result.current.plan.offer?.phase).toBe('idle');
    expect(view.result.current.plan.offer?.count).toBe(2);
  });
});
