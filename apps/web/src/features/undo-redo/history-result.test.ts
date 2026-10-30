import { describe, expect, it } from 'vitest';

import { calendarDeletedDetail, historyResultMessage } from './history-result';

describe('calendarDeletedDetail (ADR-0201 D4)', () => {
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

describe('a code step whose value was deleted since', () => {
  const setAside = {
    reason: 'value-deleted',
    subjectName: '“Level 1”',
    nextLabel: 'Set Trade on “Pour”',
  } as const;

  it('names the value and the way back, then says the step was skipped', () => {
    expect(
      historyResultMessage({
        direction: 'undo',
        outcome: 'set-aside',
        label: 'Set Area on “Piling”',
        setAside,
      }),
    ).toBe(
      'Couldn’t undo set Area on “Piling” — “Level 1” was deleted. Restore it in Codes… to set it again. That step was skipped. Undo again to continue with set Trade on “Pour”.',
    );
  });

  it('reads as one sentence inside an undo-to-here run', () => {
    expect(
      historyResultMessage({
        direction: 'undo',
        outcome: 'set-aside',
        label: 'Set Area on “Piling”',
        setAside,
        steps: { done: 1, total: 3 },
      }),
    ).toBe(
      'Undid 1 of 3 — stopped at set Area on “Piling”: “Level 1” was deleted. Restore it in Codes… to set it again.',
    );
  });
});
