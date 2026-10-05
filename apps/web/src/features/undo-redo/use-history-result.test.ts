import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Command } from './commands';
import {
  historyResultMessage,
  isHistoryFailure,
  type HistoryResult,
  type PostedHistoryResult,
} from './history-result';
import { useHistoryResult } from './use-history-result';
import type { PlanEditHistory } from './use-plan-edit-history';

const step = (label: string): Command => ({
  label,
  subjects: [],
  undo: () => Promise.resolve({ kind: 'applied' }),
  redo: () => Promise.resolve({ kind: 'applied' }),
});

/** A history double whose stack tops the test moves by hand — the hook reads them, never writes. */
function historyWith(state: {
  redoTop?: Command;
  undoTop?: Command;
  tick: number;
}): PlanEditHistory {
  return {
    record: () => undefined,
    isTop: (command) => state.undoTop === command,
    peekUndo: () => state.undoTop,
    peekRedo: () => state.redoTop,
    undo: () => Promise.resolve(null),
    redo: () => Promise.resolve(null),
    clear: () => undefined,
    clearRedo: () => undefined,
    canUndo: state.undoTop !== undefined,
    canRedo: state.redoTop !== undefined,
    // The reactive stand-in the real store moves on every change.
    undoLabel: `u${String(state.tick)}`,
    redoLabel: `r${String(state.tick)}`,
  };
}

describe('useHistoryResult', () => {
  const edit = step('Edit “Excavate”');

  function setup(planId = 'p1') {
    const state: { redoTop?: Command; undoTop?: Command; tick: number } = { tick: 0 };
    const view = renderHook(
      (props: { planId: string; tick: number }) =>
        useHistoryResult(historyWith({ ...state, tick: props.tick }), props.planId),
      { initialProps: { planId, tick: 0 } },
    );
    const move = (patch: Partial<typeof state>): void => {
      Object.assign(state, patch, { tick: state.tick + 1 });
      view.rerender({ planId, tick: state.tick });
    };
    return { view, state, move };
  }

  const done = (direction: 'undo' | 'redo', command: Command): PostedHistoryResult => ({
    direction,
    outcome: 'done',
    label: command.label,
    command,
  });

  it('shows nothing until a result is posted, then gives each post a fresh id', () => {
    const { view, state } = setup();
    expect(view.result.current.result).toBeNull();
    state.redoTop = edit;
    act(() => view.result.current.post(done('undo', edit)));
    const first = view.result.current.result;
    expect(first?.outcome).toBe('done');
    act(() => view.result.current.post(done('undo', edit)));
    expect(view.result.current.result?.id).not.toBe(first?.id);
  });

  it('an undo result lives while its step is on top of the redo stack, and goes when it is not', () => {
    const { view, state, move } = setup();
    state.redoTop = edit;
    act(() => view.result.current.post(done('undo', edit)));
    expect(view.result.current.result).not.toBeNull();
    // A later edit clears the redo branch → the Redo button would belong to nothing.
    delete state.redoTop;
    move({});
    expect(view.result.current.result).toBeNull();
  });

  it('a redo result lives while its step is on top of the undo stack', () => {
    const { view, state, move } = setup();
    state.undoTop = edit;
    act(() => view.result.current.post(done('redo', edit)));
    expect(view.result.current.result).not.toBeNull();
    state.undoTop = step('Move “Pour”');
    move({});
    expect(view.result.current.result).toBeNull();
  });

  it('a failure stays until dismissed, whatever the stacks do', () => {
    const { view, move } = setup();
    act(() =>
      view.result.current.post({
        direction: 'undo',
        outcome: 'blocked',
        label: 'Edit',
        reason: 'x',
      }),
    );
    move({ undoTop: edit });
    expect(view.result.current.result?.outcome).toBe('blocked');
    act(() => view.result.current.dismiss());
    expect(view.result.current.result).toBeNull();
  });

  it('is dropped when the plan changes', () => {
    const { view } = setup('p1');
    act(() => view.result.current.post({ direction: 'undo', outcome: 'failed', label: 'Edit' }));
    expect(view.result.current.result).not.toBeNull();
    view.rerender({ planId: 'p2', tick: 0 });
    expect(view.result.current.result).toBeNull();
  });
});

describe('historyResultMessage', () => {
  const base = { id: 1, label: 'Delete “Excavate”' };
  const message = (over: Partial<HistoryResult>): string =>
    historyResultMessage({ direction: 'undo', outcome: 'done', ...base, ...over });

  it('speaks a success with the shared phrasing and the name’s own capitals', () => {
    expect(message({})).toBe('Undid delete “Excavate”.');
    expect(message({ direction: 'redo' })).toBe('Redid delete “Excavate”.');
  });

  it('a set-aside never tells the reader to refresh — the read that found it already refreshed', () => {
    const setAside = { reason: 'changed', subjectName: 'Excavate', nextLabel: null } as const;
    expect(message({ outcome: 'set-aside', setAside })).not.toMatch(/refresh/i);
  });

  it('a set-aside names the subject, says the step was skipped, and says what the next press runs', () => {
    expect(
      message({
        outcome: 'set-aside',
        setAside: { reason: 'changed', subjectName: 'Excavate', nextLabel: 'Add “Pour”' },
      }),
    ).toBe(
      'Couldn’t undo delete “Excavate” — Excavate was changed after your edit, ' +
        'so that step was skipped. Undo again to continue with add “Pour”.',
    );
  });

  it('a set-aside redo does not promise a next step', () => {
    expect(
      message({
        direction: 'redo',
        outcome: 'set-aside',
        setAside: { reason: 'gone', subjectName: 'Excavate', nextLabel: null },
      }),
    ).toBe(
      'Couldn’t redo delete “Excavate” — Excavate was deleted after your edit, ' +
        'so that step was skipped.',
    );
  });

  it('a refusal carries the host’s own sentence', () => {
    expect(
      message({ outcome: 'blocked', reason: 'Start editing to undo delete “Excavate”.' }),
    ).toBe('Start editing to undo delete “Excavate”.');
  });

  it('only a success is not a failure', () => {
    const outcomes = ['done', 'set-aside', 'failed', 'blocked'] as const;
    expect(
      outcomes.map((outcome) =>
        isHistoryFailure({ id: 1, direction: 'undo', outcome, label: 'x' }),
      ),
    ).toEqual([false, true, true, true]);
  });
});
