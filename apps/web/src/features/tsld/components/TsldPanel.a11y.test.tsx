import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture live-region announcements.
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import { TsldPanel } from './TsldPanel';

beforeEach(() => announceSpy.mockClear());

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Survey',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const A = activity({ id: 'a1', name: 'Survey' });
const B = activity({
  id: 'b1',
  name: 'Excavate',
  laneIndex: 1,
  isNearCritical: true,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  totalFloat: 2,
});
const DEP_A_DRIVES_B: DependencySummary[] = [
  {
    id: 'e1',
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    isDriving: true,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    predecessor: { id: 'a1', code: null, name: 'Survey' },
    successor: { id: 'b1', code: null, name: 'Excavate' },
  },
];

function renderPanel(activities = [A, B], dependencies = DEP_A_DRIVES_B) {
  const utils = render(
    <TsldPanel activities={activities} dependencies={dependencies} dataDate="2026-01-01" />,
  );
  const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
  fireEvent.focus(listbox); // selects the first activity
  announceSpy.mockClear();
  return { ...utils, listbox };
}

describe('TsldPanel keyboard accessibility (M5 read)', () => {
  it('announces enriched Tier-1 detail (float) when navigating', () => {
    const { listbox } = renderPanel();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B (near-critical, 2 days float)
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringContaining('near-critical, 2 days float'),
    );
  });

  it('] jumps to the driving successor and announces the tie', () => {
    const { listbox } = renderPanel(); // focus on A (Survey)
    fireEvent.keyDown(listbox, { key: ']' });
    expect(announceSpy).toHaveBeenCalledWith('Successor: Excavate, driving.');
    // Selection followed to B.
    expect(screen.getByRole('option', { name: /Excavate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('[ jumps to the driving predecessor; the empty direction is announced', () => {
    const { listbox } = renderPanel();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // → B
    announceSpy.mockClear();
    fireEvent.keyDown(listbox, { key: '[' });
    expect(announceSpy).toHaveBeenCalledWith('Predecessor: Survey, driving.');
    fireEvent.keyDown(listbox, { key: '[' }); // A has no predecessor
    expect(announceSpy).toHaveBeenCalledWith('No predecessors.');
  });

  it('Space announces the Tier-2 logic summary', () => {
    const { listbox } = renderPanel(); // A: 0 preds, drives Excavate
    fireEvent.keyDown(listbox, { key: ' ' });
    expect(announceSpy).toHaveBeenCalledWith('0 predecessors, 1 successor; drives Excavate');
  });

  it('? opens the keyboard shortcuts help, and the toolbar button does too', () => {
    const { listbox } = renderPanel();
    fireEvent.keyDown(listbox, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Diagram keyboard shortcuts' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Diagram keyboard shortcuts' })).toBeInTheDocument();
  });

  it('moves selection to the nearest survivor and announces when the selected bar is deleted', () => {
    const { rerender } = renderPanel([A, B]);
    // A (index 0) is selected. Remove A → selection should reconcile to B and announce.
    rerender(<TsldPanel activities={[B]} dependencies={[]} dataDate="2026-01-01" />);
    expect(announceSpy).toHaveBeenCalledWith('Activity removed.');
    expect(screen.getByRole('option', { name: /Excavate/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
