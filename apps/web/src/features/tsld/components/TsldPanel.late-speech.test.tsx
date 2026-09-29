import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * **The Late-Start overlay's sentences read the late dates the overlay draws** (#402).
 *
 * `optionDescriptions` called `describeActivity` without the panel's `barDateSource`, so the
 * sentence fell back to `'visual'` while the painter drew late-dated bars: a member with the
 * overlay on saw one span and heard another.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const ACTIVITY: ActivitySummary = {
  drivingResourceCalendarId: null,
  resourceAssignmentCount: null,
  id: 'a',
  planId: 'p1',
  code: null,
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 3,
  durationMinutes: 1440,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
  laneIndex: 0,
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
  lateStart: '2026-02-10',
  lateFinish: '2026-02-12',
  totalFloat: 40,
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
  visualEffectiveStart: '2026-01-01',
  visualEffectiveFinish: '2026-01-03',
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
};

function rowText(barDateSource: 'visual' | 'late'): string {
  render(
    <TsldPanel
      activities={[ACTIVITY]}
      dependencies={[]}
      dataDate="2026-01-01"
      barDateSource={barDateSource}
      canEdit={false}
      fill
    />,
  );
  return screen.getByRole('option', { name: /Excavate/ }).textContent ?? '';
}

describe('the listbox sentence follows the drawn date source', () => {
  it('speaks the late dates while the Late overlay is on', () => {
    const text = rowText('late');
    expect(text).toContain('late dates 10 Feb 2026 to 12 Feb 2026');
    expect(text).not.toContain('Jan 2026');
  });

  it('speaks the placed dates otherwise', () => {
    const text = rowText('visual');
    expect(text).toContain('01 Jan 2026 to 03 Jan 2026');
    expect(text).not.toContain('late dates');
  });
});

describe('switching the Late overlay is announced', () => {
  const panel = (barDateSource: 'visual' | 'late') => (
    <TsldPanel
      activities={[ACTIVITY]}
      dependencies={[]}
      dataDate="2026-01-01"
      barDateSource={barDateSource}
      canEdit={false}
      fill
    />
  );
  const lateCalls = () =>
    announceSpy.mock.calls.map((c) => c[0]).filter((m) => /dates shown/.test(String(m)));

  it('says nothing on first render, then speaks each switch', () => {
    announceSpy.mockClear();
    const { rerender } = render(panel('visual'));
    expect(lateCalls()).toEqual([]);
    rerender(panel('late'));
    expect(lateCalls()).toEqual(['Late dates shown. This view is read-only.']);
    rerender(panel('visual'));
    expect(lateCalls()).toHaveLength(2);
    expect(lateCalls()[1]).toBe('Placed dates shown.');
  });

  it('does not announce when opened with the overlay already on', () => {
    announceSpy.mockClear();
    render(panel('late'));
    expect(lateCalls()).toEqual([]);
  });
});
