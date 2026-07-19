import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Toolbar quick-wins with `VITE_NOTES` OFF but quick-wins ON (T6): the two notes-dependent items —
 * **Comments** and **Add note** — must be absent (not dead controls), since there is no notes surface
 * to reveal / open. The other three quick-wins (Go-to-today / Update-progress / Clear-visual-placement)
 * are unaffected by `VITE_NOTES`. The flag-on-with-notes matrix lives in `tsld-toolbar-quick-wins.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  NOTES_ENABLED: false,
  UNDO_REDO_ENABLED: false,
  TOOLBAR_QUICK_WINS_ENABLED: true,
}));

const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

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
    schedulingMode: 'VISUAL',
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
    selectedActivityId: 'a1',
    selectedActivity: SELECTED,
    revealComments: vi.fn(),
    canProgress: true,
    openProgress: vi.fn(),
    canWriteNotes: true,
    openActivityNotes: vi.fn(),
    canEditSchedule: true,
    lateOverlayActive: false,
    clearVisualPlacement: vi.fn(),
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

describe('TSLD toolbar quick-wins (VITE_NOTES off)', () => {
  it('hides Comments and Add note when notes are disabled (T6)', () => {
    renderRows(ctx());
    expect(screen.queryByRole('button', { name: 'Comments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });

  it('still offers the notes-independent quick-wins', () => {
    renderRows(ctx());
    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update progress…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear visual placement' })).toBeInTheDocument();
  });
});
