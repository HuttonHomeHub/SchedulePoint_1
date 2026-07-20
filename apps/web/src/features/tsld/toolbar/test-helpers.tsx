import { vi } from 'vitest';

import { DEFAULT_VIEW_TOGGLES } from '../render/paint';

import type { TsldToolbarContext } from './tsld-toolbar-context';

/**
 * A complete {@link TsldToolbarContext} with every callback a fresh `vi.fn()` and sensible default
 * data, so the seven TSLD-toolbar test suites don't each duplicate the ~60-line context literal
 * (component review C2). Each suite calls this with its per-test overrides (and keeps its own flag
 * mocks); assert on a spy by reading it off the returned context (e.g. `const c = makeTsldToolbarContext();
 * … expect(c.setColourMode).toHaveBeenCalled()`), or pass in a shared spy via the overrides.
 *
 * Defaults describe a computed, writable plan (`hasDiagram: true`, `canEditSchedule: true`) with no
 * active lens/baseline — the neutral starting point each suite narrows via `overrides`.
 */
export function makeTsldToolbarContext(
  overrides: Partial<TsldToolbarContext> = {},
): TsldToolbarContext {
  return {
    // Frame / navigate
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    goToDate: vi.fn(),
    todayIso: '2026-07-19',
    // Lens / display
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    schedulingMode: 'EARLY',
    setSchedulingMode: vi.fn(),
    // Tools / author (pen-gated)
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
    // Object / plan actions
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    openEarnedValue: vi.fn(),
    openResourceHistogram: vi.fn(),
    editPlan: vi.fn(),
    // Help
    openShortcuts: vi.fn(),
    legendOpen: false,
    toggleLegend: vi.fn(),
    // Summary + finish chip
    summaryContent: <div data-testid="summary-body">summary</div>,
    projectFinishContent: <span>Finish: 01 Aug 2026</span>,
    // Visibility gates
    hasDiagram: true,
    // Toolbar quick-wins
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
    // Insight lenses
    filterQuery: '',
    setFilterQuery: vi.fn(),
    filterAttrs: new Set(),
    toggleFilterAttr: vi.fn(),
    colourMode: 'criticality',
    setColourMode: vi.fn(),
    baselineOverlay: false,
    toggleBaselineOverlay: vi.fn(),
    hasActiveBaseline: false,
    varianceLoading: false,
    varianceError: false,
    // Canvas navigation & authoring aids
    isolateActive: false,
    isolateMode: 'full',
    toggleIsolate: vi.fn(),
    setIsolateMode: vi.fn(),
    conflictCount: 0,
    hasConflicts: false,
    currentConflict: null,
    goToNextConflict: vi.fn(),
    snapToGrid: false,
    toggleSnapToGrid: vi.fn(),
    ...overrides,
  };
}
