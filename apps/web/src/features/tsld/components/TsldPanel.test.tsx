import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

// This file exercises the M1 read-only surface, so it pins the editing flag OFF
// (it now defaults ON in the shipped bundle — config/env.ts). The flags-ON editing
// surface is covered by TsldPanel.editing.test.tsx, which mocks this flag true.
// Canvas-first authoring also defaults ON now (it mounts a drawable canvas in place of
// the empty/recalc-prompt states), so pin it OFF too; its behaviour is covered by
// TsldPanel.authoring.test.tsx.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, TSLD_EDITING_ENABLED: false, CANVAS_AUTHORING_ENABLED: false };
});

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
    calendarId: null,
    laneIndex: 0,
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
    isCritical: true,
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
    ...overrides,
  };
}

const NO_DEPS: DependencySummary[] = [];

describe('TsldPanel', () => {
  it('shows an empty state when the plan has no activities', () => {
    render(<TsldPanel activities={[]} dependencies={NO_DEPS} dataDate="2026-01-01" />);
    expect(screen.getByText(/No activities to diagram yet/)).toBeInTheDocument();
  });

  it('fills its container height in fill mode (canvas-first workspace), boxed otherwise', () => {
    const a = activity();
    const { rerender } = render(
      <TsldPanel activities={[a]} dependencies={NO_DEPS} dataDate="2026-01-01" />,
    );
    // Default: the fixed 480px box, not a fill.
    expect(
      screen.getByRole('region', { name: 'Time-scaled logic diagram' }).className,
    ).not.toContain('h-full');

    rerender(<TsldPanel activities={[a]} dependencies={NO_DEPS} dataDate="2026-01-01" fill />);
    // fill: the section fills the height its workspace region gives it.
    expect(screen.getByRole('region', { name: 'Time-scaled logic diagram' }).className).toContain(
      'h-full',
    );
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

  it('shows a legend distinguishing driving from non-driving links (M3) and the constraint pin', () => {
    render(<TsldPanel activities={[activity()]} dependencies={NO_DEPS} dataDate="2026-01-01" />);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(legend).toHaveTextContent('Driving link');
    expect(legend).toHaveTextContent('Non-driving link');
    expect(legend).toHaveTextContent('Constraint');
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

  it('round-trips a zoom-preset click through the canvas back to the control (aria-pressed)', () => {
    render(
      <TsldPanel
        activities={[activity(), activity({ id: 'a2', code: 'A200', name: 'Pour slab' })]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
      />,
    );
    // Week is the default preset; clicking Year commands the real canvas, whose rAF loop reports
    // the new stop back via onZoomStopChange → the control re-renders with Year pressed. No mocks:
    // this exercises the whole viewport/command seam (TsldViewControls → TsldCanvas → back).
    const year = screen.getByRole('button', { name: 'Year' });
    expect(year).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(year);
    expect(screen.getByRole('button', { name: 'Year' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false');
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
