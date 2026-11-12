import type { ActivitySummary } from '@repo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoResolveOverlaps } from './use-auto-resolve-overlaps';
import { useFollowLogicOffer } from './use-follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import { APPLIED } from '@/features/undo-redo/replay';
import { usePlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The follow-logic offer's state machine** (placed-bar-follows-link M2, ADR-0216), composed with
 * `useAutoResolveOverlaps` exactly as the workspace model composes them: `begin` takes both
 * snapshots, a settle resolves overlaps first, and the offer is decided from that hook's
 * `afterResolve`, so it binds to the step actually on top.
 */

function bar(id: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return anActivity({
    id,
    name: id,
    laneIndex: id.charCodeAt(0) - 65,
    visualStart: '2026-02-01',
    visualConflictReason: null,
    visualEffectiveStart: '2026-02-01',
    visualEffectiveFinish: '2026-02-05',
    ...overrides,
  });
}
const early = { visualConflictReason: 'EARLIER_THAN_LOGIC' } as const;

/** A recorded edit: the step the planner's change left on top of the undo stack. */
function edit(label: string): Command {
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
  writing: boolean;
}

function setup(initial: Partial<Harness> = {}) {
  const state: Harness = {
    rows: [bar('A'), bar('B'), bar('C')],
    enabled: true,
    settled: 0,
    pendingEdits: 0,
    writing: false,
    ...initial,
  };
  const announce = vi.fn();
  const batchPositions = vi.fn(() => Promise.resolve([] as ActivitySummary[]));
  const view = renderHook(
    (props: Harness) => {
      const history = usePlanEditHistory('p1');
      const follow = useFollowLogicOffer({
        enabled: props.enabled,
        pendingEdits: props.pendingEdits,
        isWriting: () => props.writing,
        readActivities: () => props.rows,
        history,
        announce,
      });
      const resolve = useAutoResolveOverlaps({
        enabled: props.enabled,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        readActivities: () => props.rows,
        isWriting: () => props.writing,
        batchPositions,
        readSwimlaneInput: () => null,
        writeLayouts: vi.fn() as never,
        history,
        announce,
        onWriteRejected: vi.fn(),
        afterResolve: follow.evaluate,
      });
      return { history, follow, resolve };
    },
    { initialProps: { ...state } },
  );
  const settle = (next: Partial<Harness> = {}): void => {
    Object.assign(state, next, { settled: state.settled + 1 });
    view.rerender({ ...state });
  };
  /** What an edit does: both snapshots first, then its step lands on the stack. */
  const planEdit = (label: string): Command => {
    const step = edit(label);
    act(() => {
      view.result.current.resolve.begin(['B']);
      view.result.current.follow.begin();
      view.result.current.history.record(step);
    });
    return step;
  };
  return { view, state, settle, announce, batchPositions, planEdit };
}

describe('useFollowLogicOffer', () => {
  it('raises one offer naming the bar the edit newly stranded, announced once, bound to the top step', async () => {
    const { view, settle, announce, planEdit } = setup();
    const step = planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    const { offer } = view.result.current.follow;
    expect(offer?.ids).toEqual(['B']);
    expect(offer?.command).toBe(step);
    expect(offer?.message).toBe('“B” stays where you placed it, before its logic allows.');
    // The dock and the announcement are one sentence, and it is said once.
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(offer?.message);
  });

  it('names several bars in one offer', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C', early)] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(view.result.current.follow.offer?.ids).toEqual(['B', 'C']);
    expect(view.result.current.follow.offer?.message).toBe(
      '“B” and 1 other stay where you placed them, before their logic allows.',
    );
  });

  it('raises nothing when no placed bar is newly flagged', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Add link');
    act(() => settle());
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('never offers a bar whose own placement the edit wrote', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Drag B');
    act(() =>
      settle({ rows: [bar('A'), bar('B', { ...early, visualStart: '2026-01-05' }), bar('C')] }),
    );
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('never offers a summary', async () => {
    const { view, settle, planEdit } = setup({
      rows: [bar('A'), bar('B', { type: 'WBS_SUMMARY' })],
    });
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', { type: 'WBS_SUMMARY', ...early })] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('waits for the settle: the flag does not exist until the engine has dated the plan', async () => {
    const { view, state, planEdit } = setup();
    planEdit('Lengthen A');
    state.rows = [bar('A'), bar('B', early), bar('C')];
    view.rerender({ ...state });
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('keeps the FIRST snapshot across a burst, so one offer covers it, bound to the step on top', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Add link');
    const second = planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(view.result.current.follow.offer?.command).toBe(second);
  });

  it('is decided AFTER the overlap resolution, so it binds to the step that resolution recorded', async () => {
    // Two bars share lane 0 once B is stretched: auto-resolve moves it and records its own step. The
    // offer must bind to THAT step, which is on top, or it would be withdrawn the moment it was raised.
    const { view, settle, batchPositions, planEdit } = setup({
      rows: [
        bar('A', {
          laneIndex: 0,
          visualEffectiveStart: '2026-01-01',
          visualEffectiveFinish: '2026-01-05',
        }),
        bar('B', {
          laneIndex: 0,
          visualEffectiveStart: '2026-01-10',
          visualEffectiveFinish: '2026-01-15',
        }),
      ],
    });
    batchPositions.mockImplementation(() =>
      Promise.resolve([bar('A', { laneIndex: 0, version: 2 })]),
    );
    planEdit('Lengthen A');
    act(() =>
      settle({
        rows: [
          bar('A', {
            laneIndex: 0,
            visualEffectiveStart: '2026-01-01',
            visualEffectiveFinish: '2026-01-12',
          }),
          bar('B', {
            laneIndex: 0,
            visualEffectiveStart: '2026-01-10',
            visualEffectiveFinish: '2026-01-15',
            ...early,
          }),
        ],
      }),
    );
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(batchPositions).toHaveBeenCalledTimes(1);
    expect(view.result.current.history.undoLabel).toBe('Move activity clear of an overlap');
    expect(view.result.current.history.isTop(view.result.current.follow.offer!.command)).toBe(true);
  });

  it('is withdrawn when a later edit lands on the stack', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.result.current.history.record(edit('Rename C')));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('is withdrawn by an undo or redo, and does not come back when its step is on top again', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.result.current.follow.noteReplay());
    expect(view.result.current.follow.offer).toBeNull();
    // The replay left the offer's step on top; a derived-only offer would reappear here.
    expect(view.result.current.history.isTop(view.result.current.history.peekUndo()!)).toBe(true);
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('is consumed by Follow logic, which hands back the bars, and does not return', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C', early)] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    let taken: readonly string[] | null = null;
    act(() => {
      taken = view.result.current.follow.take();
    });
    expect(taken).toEqual(['B', 'C']);
    expect(view.result.current.follow.offer).toBeNull();
    // Nothing left to take: a second press cannot write twice.
    act(() => {
      taken = view.result.current.follow.take();
    });
    expect(taken).toBeNull();
  });

  it('is dismissed by Keep it here, and writes nothing', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.result.current.follow.dismiss());
    expect(view.result.current.follow.offer).toBeNull();
    expect(view.result.current.follow.take()).toBeNull();
  });

  it('raises nothing without the pen, and withdraws an offer when the pen goes', async () => {
    const lost = setup({ enabled: false });
    lost.planEdit('Lengthen A');
    act(() => lost.settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(lost.view.result.current.follow.offer).toBeNull();

    const { view, state, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.rerender({ ...state, enabled: false }));
    expect(view.result.current.follow.offer).toBeNull();
    act(() => view.rerender({ ...state, enabled: true }));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('waits out a write in flight rather than reading a cache that may hold half an edit', async () => {
    const { view, state, settle, planEdit } = setup();
    planEdit('Lengthen A');
    state.writing = true;
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    state.writing = false;
    // The hooks read `isWriting` from the latest render's props, so the write finishing is a render.
    view.rerender({ ...state });
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull(), { timeout: 2000 });
  });

  it('raises nothing for an edit that recorded no step: an offer bound to nothing would outlive it', async () => {
    const { view, settle } = setup();
    act(() => {
      view.result.current.resolve.begin(['B']);
      view.result.current.follow.begin();
    });
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });
});
