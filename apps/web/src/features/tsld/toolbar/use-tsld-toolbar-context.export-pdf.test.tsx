import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The `useTsldToolbarContext` Diagram-PDF wiring (spec `docs/specs/export-print/` §Milestone 3): the
 * real builder produces the off-screen PNG (M2), embeds it via the lazy `exportDiagramToPdf`, tracks the
 * `pdfExporting` loading flag, guards a double-click, and surfaces a user-safe error when the PDF export
 * fails — leaving CSV/PNG unaffected. The lazy jsPDF shim + the off-screen renderer + the announcer are
 * mocked so this proves the wiring (which seam is called, the loading transitions, the failure copy)
 * without a real 2D context or the real library.
 */
const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

// Mock the off-screen renderer + the render-model projection so the wiring runs without a real canvas.
vi.mock('../export/render-export-image', () => ({
  renderExportImage: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));
vi.mock('../render/to-render-model', () => ({
  barDateSourceFor: () => 'early',
  toRenderActivities: () => [{ earlyStart: '2026-01-01', earlyFinish: '2026-01-10', laneIndex: 0 }],
  toRenderEdges: () => [],
}));

// The lazy PDF shim — toggled between resolve / reject per test. Hoisted so the `vi.mock` factory
// (itself hoisted above the imports) can reference it without a TDZ error.
const exportDiagramToPdf = vi.hoisted(() => vi.fn((): Promise<void> => Promise.resolve()));
vi.mock('../export/pdf', () => ({ exportDiagramToPdf }));

vi.mock('@/features/plans', () => ({
  PLAN_STATUS_LABELS: new Proxy({}, { get: () => 'Active' }),
  useSetPlanSchedulingMode: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => ({ isPending: true, data: undefined }),
}));
vi.mock('./plan-summary-panel', () => ({ PlanSummaryPanel: () => null }));

const ACTIVITY = {
  id: 'a1',
  version: 1,
  name: 'Excavate',
  earlyStart: '2026-01-01',
} as unknown as ActivitySummary;

function makeModel(): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: [ACTIVITY] },
    dependencies: { data: [] },
    canRecalc: true,
    canEditSchedule: true,
    canWrite: true,
    setEditing: vi.fn(),
    todayIso: '2026-07-20',
    selectedActivityId: null,
    selectedActivity: undefined,
    canProgress: true,
    canWriteNotes: true,
    revealActivityNotes: vi.fn(),
    setProgressActivityId: vi.fn(),
    clearVisualPlacement: vi.fn(),
    undoRedo: {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      undo: vi.fn(),
      redo: vi.fn(),
    },
    autoRecalc: { isPending: false, flush: vi.fn(), notify: vi.fn() },
    variance: { data: undefined, isPending: false, isError: false },
  } as unknown as PlanWorkspaceModel;
}

function makeCanvasUi(): TsldCanvasUiState {
  return {
    zoomPreset: 'week',
    // A live viewport the export reads (never mutates) via the control handle.
    canvasControlRef: {
      current: {
        getViewport: () => ({
          view: { pxPerDay: 20, originX: 0, originY: 0 },
          size: { width: 800, height: 600 },
        }),
      },
    } as unknown as TsldCanvasUiState['canvasControlRef'],
    requestFit: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    mode: 'select',
    setMode: vi.fn(),
    requestAutoArrange: vi.fn(),
    setShowHelp: vi.fn(),
    createType: 'TASK',
    setCreateType: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    lensState: {
      filterQuery: '',
      filterAttrs: new Set(),
      colourMode: 'criticality',
      baselineOverlay: false,
    },
    setFilterQuery: vi.fn(),
    toggleFilterAttr: vi.fn(),
    setColourMode: vi.fn(),
    toggleBaselineOverlay: vi.fn(),
    navState: {
      isolateActive: false,
      isolateMode: 'full',
      conflictCursorId: null,
      snapToGrid: false,
      selectSignal: null,
    },
    toggleIsolate: vi.fn(),
    setIsolateMode: vi.fn(),
    setConflictCursorId: vi.fn(),
    toggleSnapToGrid: vi.fn(),
    requestSelectActivity: vi.fn(),
  } as unknown as TsldCanvasUiState;
}

const PLAN = {
  name: 'North Tower',
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  schedulingMode: 'EARLY',
  version: 1,
} as unknown as LoadedPlan;

function build() {
  return renderHook(() =>
    useTsldToolbarContext({
      model: makeModel(),
      plan: PLAN,
      canvasUi: makeCanvasUi(),
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
    }),
  );
}

describe('useTsldToolbarContext — Diagram-PDF export (M3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportDiagramToPdf.mockImplementation(() => Promise.resolve());
  });

  it('produces the PNG then embeds it via the lazy PDF shim, and announces the download', async () => {
    const { result } = build();
    await act(async () => {
      result.current.exportDiagramPdf('whole');
      await Promise.resolve();
    });
    expect(exportDiagramToPdf).toHaveBeenCalledTimes(1);
    const [, meta] = exportDiagramToPdf.mock.calls[0] as unknown as [Blob, { filename: string }];
    expect(meta.filename).toBe('north-tower-diagram-2026-07-20.pdf');
    expect(announce).toHaveBeenCalledWith('Downloaded north-tower-diagram-2026-07-20.pdf.');
    expect(result.current.pdfExporting).toBe(false);
  });

  it('surfaces a user-safe error (no throw) when the PDF export fails, and resets pdfExporting', async () => {
    exportDiagramToPdf.mockImplementation(() => Promise.reject(new Error('offline')));
    const { result } = build();
    await act(async () => {
      result.current.exportDiagramPdf('view');
      await Promise.resolve();
    });
    expect(announce).toHaveBeenCalledWith('Couldn’t load the PDF exporter — try PNG.');
    expect(result.current.pdfExporting).toBe(false);
  });

  it('sets pdfExporting while in flight and guards a concurrent/double export', async () => {
    // A PDF shim that never resolves ⇒ the export stays "in flight" for the assertions.
    let resolvePending: (() => void) | undefined;
    exportDiagramToPdf.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePending = resolve;
        }),
    );
    const { result } = build();
    act(() => {
      result.current.exportDiagramPdf('whole');
    });
    // Let the off-screen PNG promise settle so the flow reaches the (pending) PDF shim.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.pdfExporting).toBe(true);
    expect(exportDiagramToPdf).toHaveBeenCalledTimes(1);
    // A second pick while in flight is a no-op (the double-click guard).
    act(() => {
      result.current.exportDiagramPdf('view');
    });
    expect(exportDiagramToPdf).toHaveBeenCalledTimes(1);
    // Release the in-flight export and confirm the flag clears.
    await act(async () => {
      resolvePending?.();
      await Promise.resolve();
    });
    expect(result.current.pdfExporting).toBe(false);
  });
});
