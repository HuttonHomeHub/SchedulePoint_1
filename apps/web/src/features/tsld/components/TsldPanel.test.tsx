import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TsldPanel } from './TsldPanel';

function activity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    laneIndex: 0,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    isCritical: true,
    isNearCritical: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NO_DEPS: DependencySummary[] = [];

describe('TsldPanel', () => {
  it('shows an empty state when the plan has no activities', () => {
    render(<TsldPanel activities={[]} dependencies={NO_DEPS} dataDate="2026-01-01" />);
    expect(screen.getByText(/No activities to diagram yet/)).toBeInTheDocument();
  });

  it('prompts to recalculate when the schedule is not yet computed', () => {
    const uncomputed = activity({ earlyStart: null, earlyFinish: null });
    render(<TsldPanel activities={[uncomputed]} dependencies={NO_DEPS} dataDate="2026-01-01" />);
    expect(screen.getByText(/Recalculate the schedule to plot/)).toBeInTheDocument();
    expect(screen.getByText(/appears once the schedule has been calculated/)).toBeInTheDocument();
  });

  it('renders the accessible listbox mirroring the diagram, with a Fit control', () => {
    render(
      <TsldPanel
        activities={[activity(), activity({ id: 'a2', code: 'A200', name: 'Pour slab' })]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    expect(listbox).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    // Each option describes the activity's schedule (dates + criticality) for AT.
    expect(options[0]).toHaveTextContent(/A100 Excavate/);
    expect(options[0]).toHaveTextContent(/critical/);
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toBeInTheDocument();
  });

  it('stays read-only (no editing toolbar) when the M2 flag is off, even for a writer', () => {
    render(
      <TsldPanel
        activities={[activity()]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={() => Promise.resolve({ recalcConflict: null })}
      />,
    );
    // VITE_TSLD_EDITING is unset in tests → editing gated off → M1 surface (plain Fit only).
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit to plan' })).toBeInTheDocument();
  });

  it('selects an activity via keyboard (arrow keys) and marks it in the listbox', () => {
    render(
      <TsldPanel
        activities={[activity(), activity({ id: 'a2', name: 'Pour slab' })]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    // First ArrowDown from focus selects the first option (focus set it), then advances.
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
  });
});
