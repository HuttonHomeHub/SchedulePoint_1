import type { ActivitySummary, DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { dependencyKeys } from '../api/use-dependencies';

import { DependencyEditor } from './DependencyEditor';

const ACTIVITY: ActivitySummary = {
  id: 'b1',
  planId: 'pl1',
  code: 'B10',
  name: 'Pour slab',
  description: null,
  type: 'TASK',
  durationDays: 5,
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
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
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
  visualDriftDays: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function link(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'pl1',
    type: 'FS',
    lagDays: 3,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'b1', code: 'B10', name: 'Pour slab' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(
  predecessors: DependencySummary[],
  successors: DependencySummary[],
  canManageLogic = false,
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(dependencyKeys.predecessors('acme', 'b1'), predecessors);
  queryClient.setQueryData(dependencyKeys.successors('acme', 'b1'), successors);
  return render(
    <QueryClientProvider client={queryClient}>
      <DependencyEditor
        orgSlug="acme"
        planId="pl1"
        activity={ACTIVITY}
        canManageLogic={canManageLogic}
        open
        onClose={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('DependencyEditor', () => {
  it('shows a predecessor with its type and lag, and an empty successors state', () => {
    renderEditor([link()], []);
    expect(screen.getByRole('heading', { name: /Logic for Pour slab/ })).toBeInTheDocument();
    // The predecessors table shows the OTHER end (the predecessor activity).
    expect(screen.getByText('Excavate')).toBeInTheDocument();
    expect(screen.getByText('Finish → Start')).toBeInTheDocument();
    expect(screen.getByText('+3d')).toBeInTheDocument();
    expect(screen.getByText(/No successors/)).toBeInTheDocument();
  });

  it('shows a successor (the other end) and a negative lag as a lead', () => {
    renderEditor(
      [],
      [link({ type: 'SS', lagDays: -2, successor: { id: 'c1', code: null, name: 'Cure' } })],
    );
    expect(screen.getByText('Cure')).toBeInTheDocument();
    expect(screen.getByText('Start → Start')).toBeInTheDocument();
    expect(screen.getByText('−2d')).toBeInTheDocument();
    expect(screen.getByText(/No predecessors/)).toBeInTheDocument();
  });

  it('surfaces the 24-hour (elapsed) lag calendar in the list — the one source that moves dates (M3)', () => {
    renderEditor([link({ lagCalendar: 'TWENTY_FOUR_HOUR' })], []);
    expect(screen.getByText(/24-hour \(elapsed\)/)).toBeInTheDocument();
  });

  it('does not badge Predecessor/Successor lag calendars — they compute like the project calendar until M5 (ADR-0036 §6)', () => {
    renderEditor(
      [link({ lagCalendar: 'PREDECESSOR' })],
      [link({ lagCalendar: 'SUCCESSOR', successor: { id: 'c1', code: null, name: 'Cure' } })],
    );
    expect(screen.queryByText(/Predecessor calendar/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Successor calendar/)).not.toBeInTheDocument();
  });

  it('marks a driving link in text so the cue is not canvas-only (M3, WCAG 1.3.1)', () => {
    renderEditor(
      [link({ isDriving: true })],
      [link({ successor: { id: 'c1', code: null, name: 'Cure' } })],
    );
    // Exactly one row (the driving predecessor) carries a "Driving" badge cell; the
    // non-driving successor's cell is an aria-hidden dash. (Column headers are not cells.)
    expect(screen.getAllByRole('cell', { name: 'Driving' })).toHaveLength(1);
  });

  it('hides write affordances for a reader', () => {
    renderEditor([link()], []);
    expect(screen.queryByRole('button', { name: 'Add predecessor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit link/ })).not.toBeInTheDocument();
  });

  it('shows add/edit/remove affordances for a logic manager', () => {
    renderEditor([link()], [], true);
    expect(screen.getByRole('button', { name: 'Add predecessor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add successor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit link to Excavate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove link to Excavate' })).toBeInTheDocument();
  });
});
