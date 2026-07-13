import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

// This suite covers the **flag-off** registry (plain Add toggle, no timeline-start / Link tool). Now
// that `VITE_CANVAS_AUTHORING` defaults on, pin it off here; the flag-on registry is covered by
// `tsld-toolbar-authoring.test.tsx`.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: false,
}));

const spies = {
  setZoomPreset: vi.fn(),
  stepZoom: vi.fn(),
  fit: vi.fn(),
  toggleView: vi.fn(),
  toggleAddActivity: vi.fn(),
  recalculate: vi.fn(),
  openBaselines: vi.fn(),
  openCalendar: vi.fn(),
  openPlanDetails: vi.fn(),
  editPlan: vi.fn(),
  openShortcuts: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: spies.setZoomPreset,
    stepZoom: spies.stepZoom,
    fit: spies.fit,
    plannedStart: '2026-01-01',
    setPlannedStart: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: spies.toggleView,
    isAddingActivity: false,
    toggleAddActivity: spies.toggleAddActivity,
    createType: 'TASK',
    setCreateType: vi.fn(),
    canLink: false,
    isLinking: false,
    toggleLinkMode: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    canAutoArrange: false,
    requestAutoArrange: vi.fn(),
    canRecalc: true,
    recalcPending: false,
    recalculate: spies.recalculate,
    openBaselines: spies.openBaselines,
    openCalendar: spies.openCalendar,
    openPlanDetails: spies.openPlanDetails,
    editPlan: spies.editPlan,
    openShortcuts: spies.openShortcuts,
    legendContent: <div data-testid="legend-body">legend</div>,
    summaryContent: <div data-testid="summary-body">summary</div>,
    projectFinishContent: <span>Finish: 01 Aug 2026</span>,
    hasDiagram: true,
    ...over,
  };
}

function renderToolbar(context: TsldToolbarContext, authoringEnabled = true) {
  return render(
    <Toolbar
      items={buildTsldToolbarItems()}
      context={context}
      label="Plan toolbar"
      authoringEnabled={authoringEnabled}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar registry', () => {
  it('renders the frame controls and drives the canvas seam', () => {
    renderToolbar(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(spies.setZoomPreset).toHaveBeenCalledWith('month');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(spies.stepZoom).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(spies.fit).toHaveBeenCalledOnce();
  });

  it('marks the active scale preset pressed', () => {
    renderToolbar(ctx({ zoomPreset: 'month' }));
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the View popover and toggles a display layer', () => {
    renderToolbar(ctx());
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    fireEvent.click(within(panel).getByLabelText('Non-working'));
    expect(spies.toggleView).toHaveBeenCalledWith('nonWorking');
  });

  it('pins the Project-finish chip inline (product-owner decision #1)', () => {
    renderToolbar(ctx());
    expect(screen.getByText('Finish: 01 Aug 2026')).toBeInTheDocument();
  });

  it('renders the Summary and Legend popover bodies from the context', () => {
    renderToolbar(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Summary/ }));
    expect(screen.getByTestId('summary-body')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Legend/ }));
    expect(screen.getByTestId('legend-body')).toBeInTheDocument();
  });

  it('pen-gates Add activity: disabled read-only, enabled + wired when authoring', () => {
    const { rerender } = renderToolbar(ctx(), false);
    const add = screen.getByRole('button', { name: 'Add activity' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(add);
    expect(spies.toggleAddActivity).not.toHaveBeenCalled();

    rerender(
      <Toolbar
        items={buildTsldToolbarItems()}
        context={ctx()}
        label="Plan toolbar"
        authoringEnabled
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    expect(spies.toggleAddActivity).toHaveBeenCalledOnce();
  });

  it('disables Recalculate when the model says it cannot recalc', () => {
    renderToolbar(ctx({ canRecalc: false }));
    expect(screen.getByRole('button', { name: 'Recalculate' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('absorbs the plan actions into the ⋯ overflow (Baselines/Calendar/Plan details)', () => {
    renderToolbar(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'More toolbar actions' }));
    const menu = screen.getByRole('menu', { name: 'More toolbar actions' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Baselines/ }));
    expect(spies.openBaselines).toHaveBeenCalledOnce();
  });

  it('hides Edit plan for a non-writer (editPlan null)', () => {
    renderToolbar(ctx({ editPlan: null }));
    fireEvent.click(screen.getByRole('button', { name: 'More toolbar actions' }));
    const menu = screen.getByRole('menu', { name: 'More toolbar actions' });
    expect(within(menu).queryByRole('menuitem', { name: /Edit plan/ })).not.toBeInTheDocument();
  });

  it('hides the view/summary/legend/finish controls on an empty plan (no diagram)', () => {
    renderToolbar(ctx({ hasDiagram: false }));
    expect(screen.queryByRole('button', { name: 'Fit to plan' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /View/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Finish: 01 Aug 2026')).not.toBeInTheDocument();
    // Author + recalc remain reachable.
    expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    renderToolbar(ctx());
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});
