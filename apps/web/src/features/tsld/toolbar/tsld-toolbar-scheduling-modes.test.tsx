import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Scheduling-modes toolbar items (ADR-0033 M2): the de-overloaded date split. `SCHEDULING_MODES_ENABLED`
 * requires `CANVAS_AUTHORING_ENABLED`, so both are pinned on here — flag-off behaviour (the single
 * "Timeline start" control) is covered by `tsld-toolbar-authoring.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    setPlannedStart: vi.fn(),
    goToDate: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    schedulingMode: 'EARLY',
    setSchedulingMode: vi.fn(),
    isAddingActivity: false,
    toggleAddActivity: vi.fn(),
    createType: 'TASK',
    setCreateType: vi.fn(),
    canLink: true,
    isLinking: false,
    toggleLinkMode: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    canAutoArrange: false,
    requestAutoArrange: vi.fn(),
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    openPlanDetails: vi.fn(),
    editPlan: vi.fn(),
    openShortcuts: vi.fn(),
    legendContent: null,
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: false,
    ...over,
  };
}

function renderToolbar(context: TsldToolbarContext) {
  return render(
    <Toolbar
      items={buildTsldToolbarItems()}
      context={context}
      label="Plan toolbar"
      authoringEnabled
    />,
  );
}

describe('TSLD toolbar — scheduling-modes date split (flag on)', () => {
  it('replaces the single "Timeline start" with a labelled "Project start" data control', () => {
    renderToolbar(ctx());
    expect(screen.queryByLabelText('Timeline start')).not.toBeInTheDocument();
    const projectStart = screen.getByLabelText('Project start');
    expect(projectStart).toHaveValue('2026-01-01');
  });

  it('writes plannedStart from the Project start control (still the persisted anchor)', () => {
    const setPlannedStart = vi.fn();
    renderToolbar(ctx({ setPlannedStart }));
    fireEvent.change(screen.getByLabelText('Project start'), { target: { value: '2026-03-01' } });
    expect(setPlannedStart).toHaveBeenCalledWith('2026-03-01');
  });

  it('shows Project start as a static read-out for a read-only viewer', () => {
    renderToolbar(ctx({ setPlannedStart: null }));
    expect(screen.queryByLabelText('Project start')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Project start:/)).toBeInTheDocument();
  });

  it('offers "Go to date" as a pure view jump — no write, available even without the pen', () => {
    const goToDate = vi.fn();
    const setPlannedStart = vi.fn();
    // A read-only viewer (no setter) can still navigate.
    renderToolbar(ctx({ goToDate, setPlannedStart: null }));
    // It is a disclosure: open it, then pick a date in the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    expect(goToDate).toHaveBeenCalledWith('2026-06-15');
    expect(setPlannedStart).not.toHaveBeenCalled();
  });

  it('hides "Go to date" until the plan is anchored (no plannedStart)', () => {
    renderToolbar(ctx({ plannedStart: null, setPlannedStart: null }));
    expect(screen.queryByRole('button', { name: 'Go to date' })).not.toBeInTheDocument();
  });

  it('offers an Early | Visual mode selector, marks the active mode, and switches on click', () => {
    const setSchedulingMode = vi.fn();
    renderToolbar(ctx({ schedulingMode: 'EARLY', setSchedulingMode }));
    const early = screen.getByRole('button', { name: 'Early start' });
    const visual = screen.getByRole('button', { name: 'Visual planning' });
    expect(early).toHaveAttribute('aria-pressed', 'true');
    expect(visual).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(visual);
    expect(setSchedulingMode).toHaveBeenCalledWith('VISUAL');
  });

  it('hides the mode selector for a read-only viewer (no setter)', () => {
    renderToolbar(ctx({ setSchedulingMode: null }));
    expect(screen.queryByRole('button', { name: 'Early start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Visual planning' })).not.toBeInTheDocument();
  });
});
