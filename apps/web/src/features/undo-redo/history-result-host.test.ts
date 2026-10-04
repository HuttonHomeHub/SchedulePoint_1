import { describe, expect, it, vi } from 'vitest';

import type { HistoryResult } from './history-result';
import { blockedHistoryResult, historyResultAction } from './history-result-host';

const result = (over: Partial<HistoryResult>): HistoryResult => ({
  id: 1,
  direction: 'undo',
  outcome: 'done',
  label: 'Edit “Excavate”',
  ...over,
});

describe('historyResultAction', () => {
  const undoRedo = { undo: vi.fn(), redo: vi.fn() };

  it('offers the opposite press after a success', () => {
    const a = historyResultAction(result({}), true, undoRedo);
    expect(a?.label).toBe('Redo');
    a?.onClick();
    expect(undoRedo.redo).toHaveBeenCalledOnce();
    expect(historyResultAction(result({ direction: 'redo' }), true, undoRedo)?.label).toBe('Undo');
  });

  it('offers a retry in the same direction after a failure', () => {
    const a = historyResultAction(result({ outcome: 'failed' }), true, undoRedo);
    expect(a?.label).toBe('Try again');
    a?.onClick();
    expect(undoRedo.undo).toHaveBeenCalledOnce();
  });

  it('offers nothing for a conflict or a refusal, or while undo/redo is not live', () => {
    expect(historyResultAction(result({ outcome: 'conflict' }), true, undoRedo)).toBeUndefined();
    expect(historyResultAction(result({ outcome: 'blocked' }), true, undoRedo)).toBeUndefined();
    expect(historyResultAction(result({}), false, undoRedo)).toBeUndefined();
  });
});

describe('blockedHistoryResult', () => {
  const scheduleRefusal = (action: string): string => `Start editing to ${action}.`;

  it('leaves the key alone when there is no step', () => {
    expect(
      blockedHistoryResult({
        direction: 'undo',
        label: null,
        canEditSchedule: false,
        scheduleRefusal,
      }),
    ).toBeNull();
  });

  it('uses the shared pen sentence, naming the step in the phrase', () => {
    expect(
      blockedHistoryResult({
        direction: 'undo',
        label: 'Edit “Excavate”',
        canEditSchedule: false,
        scheduleRefusal,
      }),
    ).toEqual({
      direction: 'undo',
      outcome: 'blocked',
      label: 'Edit “Excavate”',
      reason: 'Start editing to undo edit “Excavate”.',
    });
  });

  it('blames the Late-start overlay when the planner holds the pen', () => {
    expect(
      blockedHistoryResult({
        direction: 'redo',
        label: 'Add “A”',
        canEditSchedule: true,
        scheduleRefusal,
      })?.reason,
    ).toContain('Late-start overlay');
  });
});
