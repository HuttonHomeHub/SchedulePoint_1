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
  const context: TsldToolbarContext = {
    // Frame / navigate
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    canvasActive: true,
    // Replaced below by a value DERIVED from `canEditSchedule` unless the caller overrode it — see
    // the note at the bottom of this function. Present here only so the literal is complete.
    scheduleRefusal: () => null,
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    goToDate: vi.fn(),
    todayIso: '2026-07-19',
    // Lens / display
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    planView: 'tsld',
    setPlanView: vi.fn(),
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
    isLoeSpanning: false,
    toggleLoeSpanMode: vi.fn(),
    loeStartPicked: false,
    loeSpanActivityCount: 2,
    isMarqueeSelecting: false,
    toggleMarqueeMode: vi.fn(),
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
    canShare: true,
    openShare: vi.fn(),
    editPlan: vi.fn(),
    // Resource-view lens (VITE_CANVAS_RESOURCE_VIEW, ADR-0049)
    resourceViewOpen: false,
    toggleResourceView: vi.fn(),
    // Over-allocation highlight (VITE_CANVAS_RESOURCE_VIEW, Stage E M2)
    overAllocationHighlight: false,
    toggleOverAllocation: vi.fn(),
    hasOverAllocation: true,
    // Help
    openShortcuts: vi.fn(),
    legendOpen: false,
    toggleLegend: vi.fn(),
    // Summary + finish chip
    summaryContent: <div data-testid="summary-body">summary</div>,
    projectFinishContent: <span data-testid="finish-chip-body">Finish 12 Mar 2026</span>,
    // Visibility gates
    hasDiagram: true,
    // Toolbar quick-wins
    selectedActivityId: null,
    selectedActivity: undefined,
    revealComments: vi.fn(),
    notesOpen: false,
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
    activityCount: 0,
    floatPathsOpen: false,
    toggleFloatPaths: vi.fn(),
    currentConflict: null,
    goToNextConflict: vi.fn(),
    searchStatus: null,
    goToMatch: vi.fn(),
    escapeSearchField: vi.fn(),
    zoomToSelection: vi.fn(),
    matchedIds: new Set<string>(),
    currentMatchId: null,
    snapToGrid: false,
    toggleSnapToGrid: vi.fn(),
    // Export & print
    exportScheduleCsv: vi.fn(),
    exportDiagramPng: vi.fn(),
    exportDiagramPdf: vi.fn(),
    pdfExporting: false,
    printDiagram: vi.fn(),
    filterActive: false,
    matchingCount: 0,
    exportError: null,
    dismissExportError: vi.fn(),
    // Schedule interchange export (VITE_SCHEDULE_INTERCHANGE + interchange:export) — off by default so
    // the "Interchange" Export-menu group doesn't leak into the other suites' assertions; the interchange
    // suite opts in via `canInterchangeExport: true`.
    canInterchangeExport: false,
    exportInterchange: vi.fn(),
    interchangeExporting: false,
    exportNotice: null,
    dismissExportNotice: vi.fn(),
    ...overrides,
  };
  // `canEditSchedule` and `scheduleRefusal` are two halves of ONE fact, and in the real app both
  // come from the model — so an un-writable context that also reports "nothing is refused" is a
  // state the product cannot reach. Deriving the default here means a test cannot accidentally
  // build one and then assert about it; a test that wants a specific sentence still overrides.
  if (!('scheduleRefusal' in overrides)) {
    context.scheduleRefusal = (action: string) =>
      context.canEditSchedule ? null : `Start editing to ${action}.`;
  }
  return context;
}
