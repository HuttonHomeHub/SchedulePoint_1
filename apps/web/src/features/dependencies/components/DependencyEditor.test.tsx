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
  laneIndex: 0,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  isCritical: false,
  isNearCritical: false,
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
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'b1', code: 'B10', name: 'Pour slab' },
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(predecessors: DependencySummary[], successors: DependencySummary[]) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(dependencyKeys.predecessors('acme', 'b1'), predecessors);
  queryClient.setQueryData(dependencyKeys.successors('acme', 'b1'), successors);
  return render(
    <QueryClientProvider client={queryClient}>
      <DependencyEditor orgSlug="acme" activity={ACTIVITY} open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('DependencyEditor', () => {
  it('shows a predecessor with its type and lag, and an empty successors state', () => {
    renderEditor([link()], []);
    expect(screen.getByRole('heading', { name: /Logic — Pour slab/ })).toBeInTheDocument();
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
});
