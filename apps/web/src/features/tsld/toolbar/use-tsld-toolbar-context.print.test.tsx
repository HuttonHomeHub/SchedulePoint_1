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
 * The `useTsldToolbarContext` Browser-Print wiring (spec `docs/specs/export-print/` §Milestone 4,
 * feature-spec §4 **CQ-4** — the image path): the builder produces the WHOLE off-screen PNG (reusing the
 * M2 path), mounts it via `printDiagramImage` (the `PrintSurface` + print stylesheet), announces, and
 * guards re-entry while the async image build is in flight — surfacing a user-safe error (never a throw)
 * when the build fails. The off-screen renderer, the print-surface mount, and the announcer are mocked so
 * this proves the wiring (which seam is called, the guard, the failure copy) without a real 2D context or
 * a real print dialog.
 */

// Flag ON so the wired `printDiagram` command runs (it is gated on `EXPORT_PRINT_ENABLED`).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EXPORT_PRINT_ENABLED: true,
}));

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

// The print-surface mount/teardown shim — toggled resolve/throw per test. Hoisted so the `vi.mock`
// factory (itself hoisted above the imports) can reference it without a TDZ error.
const printDiagramImage = vi.hoisted(() => vi.fn());
vi.mock('../export/PrintSurface', () => ({ printDiagramImage }));

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

describe('useTsldToolbarContext — Browser Print (M4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    printDiagramImage.mockImplementation(() => undefined);
  });

  it('produces the whole-diagram PNG, mounts it into the print surface, and announces', async () => {
    const { result } = build();
    await act(async () => {
      result.current.printDiagram();
      await Promise.resolve();
    });
    expect(printDiagramImage).toHaveBeenCalledTimes(1);
    const [arg] = printDiagramImage.mock.calls[0] as unknown as [
      { blob: Blob; title: string; subtitle: string },
    ];
    expect(arg.blob).toBeInstanceOf(Blob);
    expect(arg.title).toBe('North Tower');
    // The subtitle carries the plan's data date (formatted), not today's date.
    expect(arg.subtitle).toBe('As of 01 Jan 2026');
    // "Preparing…" is announced synchronously on pick (B3), before the "Printing…" completion message.
    expect(announce).toHaveBeenCalledWith('Preparing the diagram to print…');
    expect(announce).toHaveBeenCalledWith('Printing North Tower.');
  });

  it('surfaces a user-safe VISIBLE error (no throw) when the image build fails', async () => {
    const { renderExportImage } = await import('../export/render-export-image');
    vi.mocked(renderExportImage).mockRejectedValueOnce(new Error('no 2d context'));
    const { result } = build();
    await act(async () => {
      result.current.printDiagram();
      await Promise.resolve();
    });
    expect(printDiagramImage).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(
      'Couldn’t prepare the diagram to print. Please try again.',
    );
    // The failure ALSO sets the visible error surface, not only the sr-only announce (B2).
    expect(result.current.exportError).toBe(
      'Couldn’t prepare the diagram to print. Please try again.',
    );
  });

  it('guards re-entry — a second Print while the image build is in flight is a no-op', async () => {
    // A renderer that never resolves ⇒ the print stays "in flight" for the assertion.
    const { renderExportImage } = await import('../export/render-export-image');
    let resolvePending: ((blob: Blob) => void) | undefined;
    vi.mocked(renderExportImage).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolvePending = resolve;
        }),
    );
    const { result } = build();
    act(() => {
      result.current.printDiagram();
    });
    // Let the (pending) build promise settle its first tick so `printing` is set true.
    await act(async () => {
      await Promise.resolve();
    });
    // A second Print while in flight must not start a second build/mount.
    act(() => {
      result.current.printDiagram();
    });
    await act(async () => {
      resolvePending?.(new Blob(['png'], { type: 'image/png' }));
      await Promise.resolve();
    });
    expect(printDiagramImage).toHaveBeenCalledTimes(1);
  });
});
