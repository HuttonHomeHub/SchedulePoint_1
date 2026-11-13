import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
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
  planId: string;
  userId?: string;
  storage?: Storage;
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

function blockedStorage(): Storage {
  const throwing = (): never => {
    throw new DOMException('denied');
  };
  return {
    get length(): number {
      return throwing();
    },
    clear: throwing,
    getItem: throwing,
    key: throwing,
    removeItem: throwing,
    setItem: throwing,
  };
}

function setup(initial: Partial<Harness> = {}) {
  const state: Harness = {
    rows: [bar('A'), bar('B', early), bar('C', early)],
    enabled: true,
    settled: 0,
    pendingEdits: 0,
    planId: 'p1',
    ...initial,
  };
  const announce = vi.fn();
  const view = renderHook(
    (props: Harness) => {
      const history = usePlanEditHistory('p1');
      const plan = useFollowPlanOffer({
        enabled: props.enabled,
        planId: props.planId,
        activities: props.rows,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        history,
        announce,
        userId: props.userId,
        storage: props.storage,
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
    view.result.current.plan.start('B', ['B', 'C']);
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

  it('stays dismissed for the bars it counted, and asks again only when a NEW bar is eligible', () => {
    const { view, rerender } = setup();
    act(() => view.result.current.plan.dismiss());
    expect(view.result.current.plan.offer).toBeNull();
    rerender({ rows: [bar('B', early), bar('C', early), bar('A')] });
    expect(view.result.current.plan.offer).toBeNull();
    // **Verified red** by keying dismissal on the plan: a bar nobody has put away is then never asked about.
    rerender({ rows: [bar('B', early), bar('C', early), bar('D', early)] });
    expect(view.result.current.plan.offer?.count).toBe(1);
    expect(view.result.current.plan.offer?.message).toBe(
      '1 bar stays where it was placed, before its logic allows.',
    );
  });

  it('Keep it here puts away only the bars that edit offer was about', () => {
    const { view, state } = setup();
    act(() => view.result.current.plan.dismissBars(['B']));
    expect(view.result.current.plan.offer?.count).toBe(1);
    expect(view.result.current.plan.select(state.rows).map((r) => r.id)).toEqual(['C']);
  });

  it('select reads the rows it is given and leaves the dismissed bars out', () => {
    const { view } = setup();
    act(() => view.result.current.plan.dismissBars(['C']));
    const fresh = [bar('B', early), bar('C', early), bar('E', early)];
    expect(view.result.current.plan.select(fresh).map((r) => r.id)).toEqual(['B', 'E']);
  });

  it('remembers a dismissal per plan, so leaving a plan and coming back does not ask again', () => {
    const { view, rerender } = setup();
    act(() => view.result.current.plan.dismiss());
    rerender({ planId: 'p2' });
    expect(view.result.current.plan.offer?.count, 'another plan asks for itself').toBe(2);
    rerender({ planId: 'p1' });
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('Dismiss puts a FAILED offer away: the strip goes and nothing is written', () => {
    // **Verified red** by returning the held branch regardless: the strip stayed up after Dismiss (B1).
    const { view } = setup();
    act(() => {
      view.result.current.plan.start('B', ['B', 'C']);
    });
    act(() => view.result.current.plan.fail('Nothing was changed.'));
    act(() => view.result.current.plan.dismiss());
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('ignores Dismiss while a press is in flight', () => {
    const { view } = setup();
    act(() => {
      view.result.current.plan.start('B', ['B', 'C']);
    });
    act(() => view.result.current.plan.dismiss());
    expect(view.result.current.plan.offer?.phase).toBe('busy');
  });

  it('keeps its identity across a refetch that changes nothing the strip says', () => {
    const { view, rerender } = setup();
    const first = view.result.current.plan.offer;
    rerender({ rows: [bar('A'), bar('B', early), bar('C', early)] });
    expect(view.result.current.plan.offer).toBe(first);
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
      first = view.result.current.plan.start('B', ['B', 'C']);
    });
    act(() => {
      second = view.result.current.plan.start('B', ['B', 'C']);
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
      view.result.current.plan.start('B', ['B', 'C']);
    });
    act(() =>
      view.result.current.plan.fail('Couldn’t move “B” and 1 other just now. Nothing was changed.'),
    );
    expect(view.result.current.plan.offer?.phase).toBe('failed');
    expect(view.result.current.plan.offer?.message).toContain('Nothing was changed');
    let again: boolean | undefined;
    act(() => {
      again = view.result.current.plan.start('B', ['B', 'C']);
    });
    expect(again).toBe(true);
  });

  it('announces a failure once, because the strip itself has no live role', () => {
    const { view, announce } = setup();
    act(() => {
      view.result.current.plan.start('B', ['B', 'C']);
    });
    act(() => view.result.current.plan.fail('Nothing was changed.'));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Nothing was changed.');
  });

  it('returns to asking when the pen was lost mid-press: the pen banner owns that message', () => {
    const { view } = setup();
    act(() => {
      view.result.current.plan.start('B', ['B', 'C']);
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
    expect(view.result.current.plan.offer).toBeNull();
  });

  it('does not re-ask about the bars it moved once that step is undone', () => {
    // **Verified red** by dropping the peekUndo match: the undone bars are flagged again and the offer
    // asks the question the planner has just answered.
    const { view, rerender } = setup();
    pressAndLand(view);
    rerender({ rows: [bar('A'), bar('B'), bar('C')], settled: 1 });
    act(() => view.result.current.plan.noteReplay());
    rerender({ rows: [bar('A'), bar('B', early), bar('C', early), bar('D', early)] });
    expect(view.result.current.plan.offer?.count).toBe(1);
  });

  it('does not treat an undo of some OTHER step as this offer’s', () => {
    const { view, rerender } = setup();
    act(() => view.result.current.history.record(step('Another edit')));
    act(() => view.result.current.plan.noteReplay());
    rerender({ rows: [bar('A'), bar('B', early), bar('C', early)] });
    expect(view.result.current.plan.offer?.count).toBe(2);
  });

  describe('remembered on this device (ADR-0216 D6)', () => {
    const KEY = 'schedulepoint:follow-plan-dismissed:u1';
    const stored = (storage: Storage): unknown => JSON.parse(storage.getItem(KEY) ?? 'null');

    it('Dismiss is written, and a reopening with that store is not asked again', () => {
      const storage = memoryStorage();
      const first = setup({ userId: 'u1', storage });
      act(() => first.view.result.current.plan.dismiss());
      expect(stored(storage)).toMatchObject({ v: 1, plans: { p1: { ids: ['B', 'C'] } } });
      first.view.unmount();
      // **Verified red** by not seeding: the reopened plan counts 2 again.
      const reopened = setup({ userId: 'u1', storage });
      expect(reopened.view.result.current.plan.offer).toBeNull();
      expect(
        reopened.view.result.current.plan.select(reopened.state.rows),
        'select agrees with the strip',
      ).toEqual([]);
    });

    it('a bar that becomes early after the reopening brings the offer back, counting 1', () => {
      const storage = memoryStorage();
      const first = setup({ userId: 'u1', storage });
      act(() => first.view.result.current.plan.dismiss());
      first.view.unmount();
      const reopened = setup({ userId: 'u1', storage });
      reopened.rerender({ rows: [bar('A', early), bar('B', early), bar('C', early)] });
      expect(reopened.view.result.current.plan.offer?.count).toBe(1);
    });

    it('prunes a stored bar that is no longer early only once a recalculation has landed, and once', () => {
      // **Verified red** by pruning on the first list: a flag flipped by a recalculation in flight at
      // opening then drops a valid remembered id for good.
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B', 'GONE'] } } }));
      const { view, rerender } = setup({ userId: 'u1', storage });
      expect(stored(storage), 'activities present, nothing settled yet').toMatchObject({
        plans: { p1: { ids: ['B', 'GONE'] } },
      });
      expect(view.result.current.plan.offer?.count, 'the remembered answer already applies').toBe(
        1,
      );
      rerender({ settled: 1 });
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B'] } } });
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B', 'LATER'] } } }));
      rerender({ settled: 2 });
      expect(stored(storage), 'pruned once per opening').toMatchObject({
        plans: { p1: { ids: ['B', 'LATER'] } },
      });
    });

    it('keeps a remembered id whose flag was off while a recalculation was in flight', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B', 'C'] } } }));
      const { view, rerender } = setup({
        userId: 'u1',
        storage,
        rows: [bar('A'), bar('B', early), bar('C')],
      });
      rerender({ rows: [bar('A'), bar('B', early), bar('C', early)], settled: 1 });
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B', 'C'] } } });
      expect(view.result.current.plan.offer).toBeNull();
    });

    it('applies the answers when the person arrives after the activities list', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B', 'C'] } } }));
      const { view, rerender } = setup({ storage });
      expect(view.result.current.plan.offer?.count).toBe(2);
      rerender({ userId: 'u1' });
      expect(view.result.current.plan.offer).toBeNull();
    });

    it('is today’s behaviour when reaching window.localStorage throws', () => {
      const spy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      try {
        const { view } = setup({ userId: 'u1' });
        expect(view.result.current.plan.offer?.count).toBe(2);
        act(() => view.result.current.plan.dismiss());
        expect(view.result.current.plan.offer).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });

    it('applies the seed once under StrictMode’s double mount', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B'] } } }));
      const reads = vi.spyOn(storage, 'getItem');
      renderHook(
        () => {
          const history = usePlanEditHistory('p1');
          return useFollowPlanOffer({
            enabled: true,
            planId: 'p1',
            activities: [bar('B', early), bar('C', early)],
            settled: 0,
            pendingEdits: 0,
            history,
            announce: vi.fn(),
            userId: 'u1',
            storage,
          });
        },
        { wrapper: StrictMode },
      );
      expect(reads).toHaveBeenCalledTimes(1);
    });

    it('does not prune during a session: a flag that blips off mid-recalculation keeps its answer', () => {
      const storage = memoryStorage();
      const { view, rerender } = setup({ userId: 'u1', storage });
      act(() => view.result.current.plan.dismiss());
      rerender({ rows: [bar('A'), bar('B'), bar('C')] });
      rerender({ rows: [bar('A'), bar('B', early), bar('C', early)] });
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B', 'C'] } } });
    });

    it('waits for the first settled list: nothing is read while an edit is pending', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B'] } } }));
      const { view, rerender } = setup({ userId: 'u1', storage, pendingEdits: 1 });
      expect(view.result.current.plan.offer?.count).toBe(2);
      rerender({ pendingEdits: 0 });
      expect(view.result.current.plan.offer?.count).toBe(1);
    });

    it('merges the stored answers into what was answered before the seed, never replacing it', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p1: { at: 1, ids: ['B'] } } }));
      const { view, rerender } = setup({ userId: 'u1', storage, pendingEdits: 1 });
      act(() => view.result.current.plan.dismissBars(['C']));
      expect(view.result.current.plan.offer?.count, 'B is not yet seeded').toBe(1);
      rerender({ pendingEdits: 0 });
      expect(view.result.current.plan.offer, 'C kept, B added').toBeNull();
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B', 'C'] } } });
    });

    it('Keep it here is written', () => {
      const storage = memoryStorage();
      const { view } = setup({ userId: 'u1', storage });
      act(() => view.result.current.plan.dismissBars(['B']));
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B'] } } });
    });

    it('undoing the offer’s own step is written', () => {
      const storage = memoryStorage();
      const { view, rerender } = setup({ userId: 'u1', storage });
      pressAndLand(view);
      rerender({ rows: [bar('A'), bar('B'), bar('C')], settled: 1 });
      act(() => view.result.current.plan.noteReplay());
      expect(stored(storage)).toMatchObject({ plans: { p1: { ids: ['B', 'C'] } } });
    });

    it('switching plans reads the second plan’s own entry and copies nothing across', () => {
      const storage = memoryStorage();
      storage.setItem(KEY, JSON.stringify({ v: 1, plans: { p2: { at: 1, ids: ['B', 'C'] } } }));
      const { view, rerender } = setup({ userId: 'u1', storage });
      expect(view.result.current.plan.offer?.count, 'p1 has no answers').toBe(2);
      rerender({ planId: 'p2' });
      expect(view.result.current.plan.offer).toBeNull();
      expect(stored(storage)).toMatchObject({ plans: { p2: { ids: ['B', 'C'] } } });
      expect((stored(storage) as { plans: Record<string, unknown> }).plans.p1).toBeUndefined();
    });

    it('reads and writes nothing without a signed-in person', () => {
      const storage = memoryStorage();
      const { view } = setup({ storage });
      act(() => view.result.current.plan.dismiss());
      expect(storage.length).toBe(0);
    });

    it('is today’s session-only behaviour when storage is blocked', () => {
      const { view } = setup({ userId: 'u1', storage: blockedStorage() });
      expect(view.result.current.plan.offer?.count).toBe(2);
      act(() => view.result.current.plan.dismiss());
      expect(view.result.current.plan.offer).toBeNull();
    });
  });
});
