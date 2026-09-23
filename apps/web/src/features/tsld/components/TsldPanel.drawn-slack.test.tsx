import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * **The spoken link slack is measured on the picture the canvas draws** (reported 2026-09-23).
 *
 * The `i` summary names the slack on each non-driving tie — the words a screen-reader planner gets
 * for the `Nd` chip the canvas draws on that link (ADR-0054 §5). The chip is computed from the
 * render model, i.e. the DRAWN dates; the spoken number was computed from the API rows' EARLY dates,
 * under a comment calling them "the same computation". For a hand-placed bar they are not: here
 * `Pour` follows `Excavate` directly by logic (no early gap at all) but is placed five days later,
 * so the canvas shows a gap and the sentence said nothing about one.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

function activity(
  id: string,
  name: string,
  laneIndex: number,
  over: Partial<ActivitySummary>,
): ActivitySummary {
  return {
    drivingResourceCalendarId: null,
    id,
    planId: 'p1',
    code: null,
    name,
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualConflictReason: null,
    visualDriftDays: null,
    remainingFloat: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const EXCAVATE = activity('a', 'Excavate', 0, {
  earlyStart: '2026-01-01',
  earlyFinish: '2026-01-03',
  visualEffectiveStart: '2026-01-01',
  visualEffectiveFinish: '2026-01-03',
});
const POUR = activity('b', 'Pour', 1, {
  earlyStart: '2026-01-04',
  earlyFinish: '2026-01-06',
  visualStart: '2026-01-09',
  visualEffectiveStart: '2026-01-09',
  visualEffectiveFinish: '2026-01-11',
});

const TIE: DependencySummary = {
  id: 'e1',
  planId: 'p1',
  type: 'FS',
  lagDays: 0,
  lagMinutes: 0,
  lagCalendar: 'PROJECT_DEFAULT',
  isDriving: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  predecessor: { id: 'a', code: null, name: 'Excavate' },
  successor: { id: 'b', code: null, name: 'Pour' },
};

describe('the spoken link slack', () => {
  it('names the gap the canvas draws for a placed successor, not the network gap', () => {
    render(
      <TsldPanel
        activities={[EXCAVATE, POUR]}
        dependencies={[TIE]}
        dataDate="2026-01-01"
        barDateSource="visual"
        canEdit={false}
        fill
      />,
    );
    const list = screen.getByRole('listbox', { name: /activities in the diagram/i });
    act(() => list.focus());
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    announceSpy.mockClear();
    fireEvent.keyDown(list, { key: 'i' });
    expect(announceSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('slack to Excavate'),
    );
  });
});
