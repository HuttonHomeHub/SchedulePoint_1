import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Scheduling-modes toolbar items (ADR-0033): the Go-to-date navigation jump + the Early | Visual mode
 * selector, both on Row 1 · Look. `SCHEDULING_MODES_ENABLED` requires `CANVAS_AUTHORING_ENABLED`, so
 * both are pinned on here. The persisted data date no longer has a toolbar control (ADR-0031 two-row
 * amendment) — it is edited via *Edit plan*.
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
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    editPlan: vi.fn(),
    openShortcuts: vi.fn(),
    legendContent: null,
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: false,
    ...over,
  };
}

/** Render the Row 1 · Look toolbar (Go-to-date, the mode selector, the View popover live here). */
function renderToolbar(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.look}
      context={context}
      label="View and navigate"
      authoringEnabled={authoringEnabled}
      alignEndGroup="object"
    />,
  );
}

describe('TSLD toolbar — scheduling modes (flag on)', () => {
  it('has no persisted data-date control on the toolbar (moved to Edit plan)', () => {
    renderToolbar(ctx());
    expect(screen.queryByLabelText(/Project start/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Timeline start/)).not.toBeInTheDocument();
  });

  it('offers "Go to date" as a pure view jump — no write, available even without the pen', () => {
    const goToDate = vi.fn();
    // A read-only viewer (authoring off) can still navigate.
    renderToolbar(ctx({ goToDate }), false);
    // It is a disclosure: open it, then pick a date in the panel.
    fireEvent.click(screen.getByRole('button', { name: 'Go to date' }));
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-15' } });
    expect(goToDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('hides "Go to date" until the plan is anchored (no plannedStart)', () => {
    renderToolbar(ctx({ plannedStart: null }));
    expect(screen.queryByRole('button', { name: 'Go to date' })).not.toBeInTheDocument();
  });

  it('offers an Early | Visual mode selector (labelled), marks the active mode, and switches', () => {
    const setSchedulingMode = vi.fn();
    renderToolbar(ctx({ schedulingMode: 'EARLY', setSchedulingMode }));
    const early = screen.getByRole('button', { name: 'Early mode' });
    const visual = screen.getByRole('button', { name: 'Visual mode' });
    // The buttons carry visible text (tier-1), not just an aria-label (ux/a11y: no blank buttons).
    expect(early).toHaveTextContent('Early mode');
    expect(visual).toHaveTextContent('Visual mode');
    expect(early).toHaveAttribute('aria-pressed', 'true');
    expect(visual).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(visual);
    expect(setSchedulingMode).toHaveBeenCalledWith('VISUAL');
  });

  it('keeps the mode selector visible but shaded for a read-only viewer (shade-don’t-hide)', () => {
    const setSchedulingMode = vi.fn();
    renderToolbar(ctx({ setSchedulingMode: null, schedulingMode: 'VISUAL' }));
    const early = screen.getByRole('button', { name: 'Early mode' });
    const visual = screen.getByRole('button', { name: 'Visual mode' });
    // The selector stays on the bar — the mode changes how the diagram reads, so a viewer must see it…
    expect(early).toHaveAttribute('aria-disabled', 'true');
    expect(visual).toHaveAttribute('aria-disabled', 'true');
    // …with the active mode still marked, and operating it is a no-op.
    expect(visual).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(visual);
    expect(setSchedulingMode).not.toHaveBeenCalled();
  });

  it('offers the Late-start overlay toggle in the View popover (M4) and flips it', () => {
    const toggleView = vi.fn();
    renderToolbar(ctx({ toggleView, hasDiagram: true }));
    fireEvent.click(screen.getByRole('button', { name: /View/ }));
    const panel = screen.getByRole('dialog', { name: 'View' });
    fireEvent.click(within(panel).getByLabelText('Late-start overlay'));
    expect(toggleView).toHaveBeenCalledWith('lateOverlay');
  });
});
