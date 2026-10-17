import { describe, expect, it } from 'vitest';

import { calendarDeletedDetail, historyResultMessage } from './history-result';

describe('calendarDeletedDetail (ADR-0200 D4)', () => {
  it.each(['undo', 'redo'] as const)(
    'tells the planner to %s again once the calendar is back',
    (direction) => {
      expect(calendarDeletedDetail(direction, 'Mon-Wed')).toBe(
        `It uses the calendar “Mon-Wed”, which was deleted after your edit. Restore that calendar from Recently deleted, then ${direction} again.`,
      );
    },
  );

  it('still gives the cure for a calendar whose row can no longer be named', () => {
    expect(calendarDeletedDetail('undo', null)).toBe(
      'It uses a calendar that has been deleted. Restore that calendar from Recently deleted, then undo again.',
    );
  });

  it('reads as the strip does: the step label, then the detail', () => {
    expect(
      historyResultMessage({
        direction: 'undo',
        outcome: 'failed',
        label: 'Delete “Pour slab”',
        detail: calendarDeletedDetail('undo', 'Mon-Wed'),
      }),
    ).toBe(
      'Couldn’t undo delete “Pour slab”. It uses the calendar “Mon-Wed”, which was deleted after your edit. Restore that calendar from Recently deleted, then undo again.',
    );
  });
});
