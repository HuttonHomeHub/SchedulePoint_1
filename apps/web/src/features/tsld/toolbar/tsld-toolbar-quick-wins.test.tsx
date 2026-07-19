import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Flag-ON TSLD toolbar quick-wins (spec `docs/specs/toolbar-quick-wins/`). Pins `VITE_TOOLBAR_QUICK_WINS`
 * on — plus the flags the five items compose with (`VITE_NOTES` for Comments/Add-note,
 * `VITE_SCHEDULING_MODES`/canvas authoring for Clear-visual-placement) — and asserts each item's
 * visible/enabled/disabledReason/onActivate against the pen-gating matrix. The flag-OFF byte-for-byte
 * placeholders are covered in `tsld-toolbar.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  NOTES_ENABLED: true,
  UNDO_REDO_ENABLED: false,
  TOOLBAR_QUICK_WINS_ENABLED: true,
}));

/** A stand-in selected activity — only id + version are read by the clear-placement onActivate. */
const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

const spies = {
  goToDate: vi.fn(),
  revealComments: vi.fn(),
  openProgress: vi.fn(),
  openActivityNotes: vi.fn(),
  clearVisualPlacement: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    goToDate: spies.goToDate,
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
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: true,
    todayIso: '2026-07-19',
    selectedActivityId: null,
    selectedActivity: undefined,
    revealComments: spies.revealComments,
    canProgress: true,
    openProgress: spies.openProgress,
    canWriteNotes: true,
    openActivityNotes: spies.openActivityNotes,
    canEditSchedule: true,
    clearVisualPlacement: spies.clearVisualPlacement,
    ...over,
  };
}

/** Render both rows the workspace renders (Row 1 · Look + Row 2 · Do). */
function renderRows(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled={authoringEnabled}
        alignEndGroup="object"
      />
      <Toolbar
        items={rows.do}
        context={context}
        label="Build and manage"
        authoringEnabled={authoringEnabled}
      />
    </div>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar quick-wins (flag on)', () => {
  // --- F1 · Recenter on today ---------------------------------------------------------------
  it('Recenter on today: enabled with a diagram, recenters via goToDate(todayIso)', () => {
    renderRows(ctx());
    const btn = screen.getByRole('button', { name: 'Recenter on today' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToDate).toHaveBeenCalledWith('2026-07-19');
  });

  it('Recenter on today: disabled with a reason when there is no diagram', () => {
    renderRows(ctx({ hasDiagram: false }));
    const btn = screen.getByRole('button', { name: 'Recenter on today' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Recenter on today — Add an activity to recenter');
  });

  it('Recenter on today: works for a read-only viewer (not pen-gated)', () => {
    // authoringEnabled false = no pen. Recenter is view-only, so it stays enabled.
    renderRows(ctx(), false);
    const btn = screen.getByRole('button', { name: 'Recenter on today' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.goToDate).toHaveBeenCalledWith('2026-07-19');
  });

  // --- F2 · Comments ------------------------------------------------------------------------
  it('Comments: visible under VITE_NOTES and reveals the plan notes thread', () => {
    renderRows(ctx());
    const btn = screen.getByRole('button', { name: 'Comments' });
    fireEvent.click(btn);
    expect(spies.revealComments).toHaveBeenCalledOnce();
  });

  // --- F3 · Update progress -----------------------------------------------------------------
  it('Update progress: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivityId: null }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Update progress… — Select an activity first');
  });

  it('Update progress: enabled with a selection + canProgress; opens the dialog (not pen-gated)', () => {
    // authoringEnabled false (no pen) — progress is Contributor+, NOT pen-gated, so it stays enabled.
    renderRows(ctx({ selectedActivityId: 'a1', canProgress: true }), false);
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.openProgress).toHaveBeenCalledOnce();
  });

  it('Update progress: disabled with the role reason for a viewer who cannot report progress', () => {
    renderRows(ctx({ selectedActivityId: 'a1', canProgress: false }));
    const btn = screen.getByRole('button', { name: 'Update progress…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute(
      'title',
      'Update progress… — You don’t have permission to report progress',
    );
  });

  // --- F4 · Add note ------------------------------------------------------------------------
  it('Add note: enabled with a selection + canWriteNotes; opens the activity notes (not pen-gated)', () => {
    renderRows(ctx({ selectedActivityId: 'a1', canWriteNotes: true }), false);
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.openActivityNotes).toHaveBeenCalledOnce();
  });

  it('Add note: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ selectedActivityId: null }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Add note — Select an activity first');
  });

  it('Add note: disabled with the role reason for a viewer who cannot write notes', () => {
    renderRows(ctx({ selectedActivityId: 'a1', canWriteNotes: false }));
    const btn = screen.getByRole('button', { name: 'Add note' });
    expect(btn).toHaveAttribute('title', 'Add note — You don’t have permission to add notes');
  });

  // --- F5 · Clear visual placement ----------------------------------------------------------
  it('Clear visual placement: hidden outside Visual mode', () => {
    renderRows(ctx({ schedulingMode: 'EARLY', selectedActivityId: 'a1' }));
    expect(
      screen.queryByRole('button', { name: 'Clear visual placement' }),
    ).not.toBeInTheDocument();
  });

  it('Clear visual placement: in Visual mode + pen + selection, clears via clearVisualPlacement(id, version)', () => {
    renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
      true,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.clearVisualPlacement).toHaveBeenCalledWith('a1', 7);
  });

  it('Clear visual placement: pen-gated — shaded without the pen even with a selection', () => {
    renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
      false,
    );
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(spies.clearVisualPlacement).not.toHaveBeenCalled();
  });

  it('Clear visual placement: disabled with "Select an activity first" when nothing is selected', () => {
    renderRows(ctx({ schedulingMode: 'VISUAL', selectedActivityId: null }), true);
    const btn = screen.getByRole('button', { name: 'Clear visual placement' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Clear visual placement — Select an activity first');
  });

  it('has no axe violations with the quick-wins live', async () => {
    const { container } = renderRows(
      ctx({ schedulingMode: 'VISUAL', selectedActivityId: 'a1', selectedActivity: SELECTED }),
    );
    expect((await axe(container)).violations).toEqual([]);
  });
});
