import type { ActivitySummary } from '@repo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoResolveOverlaps } from './use-auto-resolve-overlaps';

import { usePlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

/** A row with only the fields the snapshot reads; the early/late dates are deliberately wrong. */
function row(id: string, laneIndex: number, start: string, finish: string): ActivitySummary {
  return {
    id,
    name: id,
    laneIndex,
    version: 1,
    earlyStart: '2000-01-01',
    earlyFinish: '2000-01-02',
    lateStart: '2099-01-01',
    lateFinish: '2099-01-02',
    visualEffectiveStart: start,
    visualEffectiveFinish: finish,
  } as ActivitySummary;
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
    rows: [row('C', 0, '2026-01-01', '2026-01-05'), row('D', 0, '2026-01-10', '2026-01-15')],
    enabled: true,
    settled: 0,
    pendingEdits: 0,
    writing: false,
    ...initial,
  };
  const batchPositions = vi.fn(
    (input: { positions: { id: string; laneIndex: number; version: number }[] }) =>
      Promise.resolve(
        input.positions.map((p) => ({ ...row(p.id, p.laneIndex, '', ''), version: p.version + 1 })),
      ),
  );
  const announce = vi.fn();
  const onWriteRejected = vi.fn();
  const view = renderHook(
    (props: Harness) => {
      const history = usePlanEditHistory('p1');
      const resolve = useAutoResolveOverlaps({
        enabled: props.enabled,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        readActivities: () => props.rows,
        isWriting: () => props.writing,
        batchPositions,
        history,
        announce,
        onWriteRejected,
      });
      return { history, resolve };
    },
    // A COPY, never `state` itself: a first render handed the live object would give every stale
    // closure fresh values, and the "waits out a write" case could not tell a stale `isWriting` from
    // a live one — it passed against exactly that defect until this line changed.
    { initialProps: { ...state } },
  );
  const settle = (next: Partial<Harness> = {}) => {
    Object.assign(state, next, { settled: state.settled + 1 });
    view.rerender({ ...state });
  };
  return { view, state, settle, batchPositions, announce, onWriteRejected };
}

const stretched = () => [
  row('C', 0, '2026-01-01', '2026-01-12'),
  row('D', 0, '2026-01-10', '2026-01-15'),
];

describe('useAutoResolveOverlaps', () => {
  it('moves the bar the edit stretched, once the schedule settles, as ONE undo step', async () => {
    const { view, settle, batchPositions, announce } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched() }));
    await waitFor(() => expect(batchPositions).toHaveBeenCalledTimes(1));
    expect(batchPositions).toHaveBeenCalledWith({
      positions: [{ id: 'C', laneIndex: 1, version: 1 }],
    });
    await waitFor(() => expect(view.result.current.resolve.notice).not.toBeNull());
    expect(announce).toHaveBeenCalledWith(
      'Moved “C” to lane 2 so it no longer overlaps another activity.',
    );
    // The dock and the announcement are one sentence, so they cannot disagree.
    expect(view.result.current.resolve.notice?.message).toBe(announce.mock.calls[0]?.[0]);
    expect(view.result.current.history.undoLabel).toBe('Move activity clear of an overlap');
  });

  it('does nothing before the schedule settles — the overlap is usually one the engine makes', async () => {
    const { view, state, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    state.rows = stretched();
    view.rerender({ ...state });
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
  });

  it('leaves an overlap that existed before the edit alone', async () => {
    const overlapping = [
      row('C', 0, '2026-01-01', '2026-01-12'),
      row('D', 0, '2026-01-10', '2026-01-15'),
    ];
    const { view, settle, batchPositions } = setup({ rows: overlapping });
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: overlapping }));
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
  });

  it('never resolves against a replay (spec §4.4)', async () => {
    const { view, settle, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => view.result.current.resolve.noteReplay());
    act(() => settle({ rows: stretched() }));
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
  });

  it('writes nothing without the pen, and takes no snapshot without it', async () => {
    const { view, settle, batchPositions } = setup({ enabled: false });
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched(), enabled: true }));
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
  });

  it('drops the snapshot when the pen goes between the edit and the settle', async () => {
    const { view, settle, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched(), enabled: false }));
    await new Promise((done) => setTimeout(done, 20));
    act(() => settle({ enabled: true }));
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
  });

  it('waits for the settle that is still owed rather than resolving half an edit', async () => {
    const { view, settle, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched(), pendingEdits: 1 }));
    await new Promise((done) => setTimeout(done, 20));
    expect(batchPositions).not.toHaveBeenCalled();
    act(() => settle({ pendingEdits: 0 }));
    await waitFor(() => expect(batchPositions).toHaveBeenCalledTimes(1));
  });

  it('waits out a write in flight — which may be one that never settles — then resolves', async () => {
    const { view, state, settle, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched(), writing: true }));
    await new Promise((done) => setTimeout(done, 50));
    expect(batchPositions).not.toHaveBeenCalled();
    state.writing = false;
    view.rerender({ ...state });
    await waitFor(() => expect(batchPositions).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('withdraws the notice once its step is no longer the one Undo would run', async () => {
    const { view, settle } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched() }));
    await waitFor(() => expect(view.result.current.resolve.notice).not.toBeNull());
    act(() =>
      view.result.current.history.record({
        label: 'A later edit',
        undo: () => Promise.resolve(),
        redo: () => Promise.resolve(),
      }),
    );
    // Its Undo would now reverse the later edit, which its sentence does not describe.
    expect(view.result.current.resolve.notice).toBeNull();
  });

  it('reports a refused write and records nothing', async () => {
    const { view, settle, batchPositions, announce, onWriteRejected } = setup();
    batchPositions.mockRejectedValueOnce(new Error('409'));
    act(() => view.result.current.resolve.begin(['C']));
    act(() => settle({ rows: stretched() }));
    await waitFor(() => expect(onWriteRejected).toHaveBeenCalled());
    expect(announce).toHaveBeenCalledWith(
      'An overlap could not be cleared automatically. Arrange can clear it.',
    );
    expect(view.result.current.history.canUndo).toBe(false);
    expect(view.result.current.resolve.notice).toBeNull();
  });

  it('resolveNow resolves a lane-only command, which will never settle', async () => {
    const { view, state, batchPositions } = setup();
    act(() => view.result.current.resolve.begin(['C']));
    state.rows = [row('C', 0, '2026-01-01', '2026-01-05'), row('D', 0, '2026-01-03', '2026-01-08')];
    view.rerender({ ...state });
    act(() => view.result.current.resolve.resolveNow());
    await waitFor(() => expect(batchPositions).toHaveBeenCalledTimes(1));
  });

  it('a create joins the subjects when its id returns (rule 2)', async () => {
    // P is new (not in S0) and S was pushed: both changed, P is the subject, so S moves.
    const { view, settle, batchPositions } = setup({
      rows: [row('S', 0, '2026-01-10', '2026-01-15')],
    });
    act(() => view.result.current.resolve.begin([]));
    act(() => view.result.current.resolve.addSubjects(['P']));
    act(() =>
      settle({
        rows: [row('P', 0, '2026-01-12', '2026-01-16'), row('S', 0, '2026-01-14', '2026-01-19')],
      }),
    );
    await waitFor(() => expect(batchPositions).toHaveBeenCalledTimes(1));
    expect(batchPositions.mock.calls[0]?.[0].positions.map((p) => p.id)).toEqual(['S']);
  });
});
