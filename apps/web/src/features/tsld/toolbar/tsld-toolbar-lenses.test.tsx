import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

// The flag-ON insight-lenses registry: the search field goes live and filter / colour-by /
// baseline-overlay swap their placeholders for real controls. The flag-off stubs are covered by
// `tsld-toolbar.test.tsx` (CANVAS_LENSES_ENABLED defaults off in the test env).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_LENSES_ENABLED: true,
}));

const spies = {
  setFilterQuery: vi.fn(),
  toggleFilterAttr: vi.fn(),
  setColourMode: vi.fn(),
  toggleBaselineOverlay: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    goToDate: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    schedulingMode: 'EARLY',
    setSchedulingMode: vi.fn(),
    isAddingActivity: false,
    toggleAddActivity: vi.fn(),
    createType: 'TASK',
    setCreateType: vi.fn(),
    isLinking: false,
    toggleLinkMode: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    canAutoArrange: false,
    requestAutoArrange: vi.fn(),
    canUndo: false,
    canRedo: false,
    undoLabel: null,
    redoLabel: null,
    undo: vi.fn(),
    redo: vi.fn(),
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    openEarnedValue: vi.fn(),
    openResourceHistogram: vi.fn(),
    editPlan: vi.fn(),
    openShortcuts: vi.fn(),
    legendOpen: false,
    toggleLegend: vi.fn(),
    summaryContent: <div>summary</div>,
    projectFinishContent: <span>Finish</span>,
    hasDiagram: true,
    todayIso: '2026-07-19',
    selectedActivityId: null,
    selectedActivity: undefined,
    revealComments: vi.fn(),
    canProgress: true,
    openProgress: vi.fn(),
    canWriteNotes: true,
    openActivityNotes: vi.fn(),
    canEditSchedule: true,
    lateOverlayActive: false,
    clearVisualPlacement: vi.fn(),
    filterQuery: '',
    setFilterQuery: spies.setFilterQuery,
    filterAttrs: new Set(),
    toggleFilterAttr: spies.toggleFilterAttr,
    colourMode: 'criticality',
    setColourMode: spies.setColourMode,
    baselineOverlay: false,
    toggleBaselineOverlay: spies.toggleBaselineOverlay,
    hasActiveBaseline: true,
    varianceLoading: false,
    varianceError: false,
    ...over,
  };
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled
        alignEndGroup="object"
      />
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — insight lenses (flag on)', () => {
  it('renders a live search field that drives the filter query', () => {
    renderRows(ctx());
    const search = screen.getByRole('searchbox', { name: 'Search or filter activities' });
    expect(search).not.toBeDisabled();
    fireEvent.change(search, { target: { value: 'concrete' } });
    expect(spies.setFilterQuery).toHaveBeenCalledWith('concrete');
  });

  it('shades the search field on an empty/uncomputed canvas', () => {
    renderRows(ctx({ hasDiagram: false }));
    expect(screen.getByRole('searchbox', { name: 'Search or filter activities' })).toBeDisabled();
  });

  it('opens the Filter menu and toggles an attribute', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Filter/ }));
    const panel = screen.getByRole('dialog', { name: 'Filter' });
    fireEvent.click(within(panel).getByLabelText('Critical'));
    expect(spies.toggleFilterAttr).toHaveBeenCalledWith('critical');
  });

  it('opens the Colour-by picker and switches mode', () => {
    renderRows(ctx());
    const trigger = screen.getByRole('button', { name: 'Colour by: Criticality' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Total float' }));
    expect(spies.setColourMode).toHaveBeenCalledWith('totalFloat');
  });

  it('reflects the active Colour-by mode on the trigger', () => {
    renderRows(ctx({ colourMode: 'wbs' }));
    expect(screen.getByRole('button', { name: 'Colour by: WBS group' })).toBeInTheDocument();
  });

  it('toggles the Baseline overlay when an active baseline exists', () => {
    renderRows(ctx());
    const overlay = screen.getByRole('button', { name: 'Baseline overlay' });
    expect(overlay).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(overlay);
    expect(spies.toggleBaselineOverlay).toHaveBeenCalledOnce();
  });

  it('disables the Baseline overlay with a reason when there is no active baseline', () => {
    renderRows(ctx({ hasActiveBaseline: false }));
    const overlay = screen.getByRole('button', { name: 'Baseline overlay' });
    expect(overlay).toHaveAttribute('aria-disabled', 'true');
    expect(overlay).toHaveAttribute('title', 'Baseline overlay — No active baseline');
    fireEvent.click(overlay);
    expect(spies.toggleBaselineOverlay).not.toHaveBeenCalled();
  });

  it('disables the Baseline overlay while variance is loading / errored', () => {
    renderRows(ctx({ varianceLoading: true }));
    expect(screen.getByRole('button', { name: 'Baseline overlay' })).toHaveAttribute(
      'title',
      'Baseline overlay — Loading baseline…',
    );
  });
});
