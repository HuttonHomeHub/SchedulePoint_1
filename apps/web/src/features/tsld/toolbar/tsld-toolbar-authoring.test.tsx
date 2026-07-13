import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Canvas-first authoring toolbar items (ADR-0032). The inline timeline start-date control is gated
 * on `VITE_CANVAS_AUTHORING`, so this file pins it on (the flag-off registry is covered by
 * `tsld-toolbar.test.tsx`).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    setPlannedStart: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    isAddingActivity: false,
    toggleAddActivity: vi.fn(),
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

describe('TSLD toolbar — canvas-first authoring items (flag on)', () => {
  it('shows an editable timeline start-date input for a writer and writes on change', () => {
    const setPlannedStart = vi.fn();
    renderToolbar(ctx({ setPlannedStart }));
    const input = screen.getByLabelText('Timeline start');
    expect(input).toHaveValue('2026-01-01');
    fireEvent.change(input, { target: { value: '2026-02-15' } });
    expect(setPlannedStart).toHaveBeenCalledWith('2026-02-15');
  });

  it('renders the start date as static text for a read-only viewer (no setter)', () => {
    renderToolbar(ctx({ setPlannedStart: null }));
    // No editable date input…
    expect(screen.queryByLabelText('Timeline start')).not.toBeInTheDocument();
    // …but the date is shown, labelled, as a read-out.
    expect(screen.getByLabelText(/Timeline start:/)).toBeInTheDocument();
  });

  it('shows "Not set" when the plan has no start date yet', () => {
    renderToolbar(ctx({ plannedStart: null, setPlannedStart: null }));
    expect(screen.getByLabelText('Timeline start: Not set')).toBeInTheDocument();
  });
});
