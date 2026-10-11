import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { buildSelectionBarContext } from './build-selection-context';

/**
 * **The bar's context carries the whole conflict, and its lead is the first of it**
 * (conflict-reason-on-object). `conflictKey` drives the remedy and `conflictKeys` the reason line;
 * if they ever disagreed the sentence on the bar would name one conflict beside a remedy for
 * another.
 */
const activity = (over: Partial<ActivitySummary>): ActivitySummary =>
  ({
    id: 'a1',
    name: 'Pour slab',
    type: 'TASK',
    visualStart: null,
    constraintViolated: false,
    visualConflictReason: null,
    levelingWindowExceeded: false,
    ...over,
  }) as ActivitySummary;

function build(a: ActivitySummary) {
  return buildSelectionBarContext({
    canvas: null,
    activities: [a],
    selectedId: a.id,
    selectionCount: 1,
    canEditSchedule: true,
    scheduleRefusal: () => null,
    canReportProgress: true,
    canWriteNotes: true,
    onOpenLogic: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  });
}

describe('buildSelectionBarContext conflict fields', () => {
  const cases: Array<[string, Partial<ActivitySummary>, string[]]> = [
    ['unflagged', {}, []],
    ['constraint', { constraintViolated: true }, ['constraintViolated']],
    [
      'constraint + later than bound',
      { constraintViolated: true, visualConflictReason: 'LATER_THAN_BOUND' },
      ['constraintViolated', 'visualLaterThanBound'],
    ],
    [
      'earlier than logic + levelling',
      { visualConflictReason: 'EARLIER_THAN_LOGIC', levelingWindowExceeded: true },
      ['visualEarlierThanLogic', 'levelingWindowExceeded'],
    ],
  ];

  it.each(cases)(
    '%s: conflictKey is conflictKeys[0] and the list is in flag order',
    (_n, over, keys) => {
      const ctx = build(activity(over));
      expect(ctx?.conflictKeys).toEqual(keys);
      expect(ctx?.conflictKey).toBe(keys[0] ?? null);
    },
  );
});
