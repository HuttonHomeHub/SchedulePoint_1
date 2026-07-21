import type { InterchangeReport } from '@repo/interchange';
import type { ActivitySummary } from '@repo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import { ApiFetchError } from '@/lib/api/client';

/**
 * The `useTsldToolbarContext` schedule-**interchange** export wiring (ADR-0050 M4d, review B4): the real
 * builder fetches the serialised file via `fetchPlanExport`, downloads it, tracks the `interchangeExporting`
 * loading flag, guards a double-click, announces politely, and — when the export is lossy — sets a VISIBLE,
 * opt-in `exportNotice` (NOT a silent second download) whose "Download report" action serialises the report
 * with EXPORT-direction copy. `fetchPlanExport` + the download shim + the announcer are mocked so this proves
 * the wiring (which seam is called, the loading transitions, the notice, the failure copy) without a network.
 */
const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

// The browser download shim — spied so we can assert the file (and the opt-in report) download without a
// real object URL (jsdom has no `URL.createObjectURL`, so the real shim is a silent no-op).
const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('../export/download', () => ({ downloadBlob }));

// The export fetch — the one seam we drive per test; everything else in the interchange barrel stays real
// (so the notice's `downloadReport` runs the REAL `formatReportText` + `exportReportFilename`).
const fetchPlanExport = vi.hoisted(() => vi.fn());
vi.mock('@/features/interchange', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchPlanExport,
}));

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
    // The new export permission field (review S3 rename) — the export command runs regardless, but the
    // context surfaces `canInterchangeExport` off it.
    canExportSchedule: true,
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

/** A lossy export report (one drop ⇒ one finding) whose header carries the TARGET format, no source file. */
const LOSSY_REPORT: InterchangeReport = {
  detectedFormat: 'MSPDI',
  sourceVersion: null,
  sourceFilename: null,
  mapped: { activities: 2, relationships: 1, calendars: 0 },
  approximations: [],
  repairs: [],
  drops: [{ kind: 'drop', entity: 'resource', sourceRef: 'R1', detail: 'resources not exported' }],
};

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

describe('useTsldToolbarContext — schedule interchange export (M4d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads the file and announces, with NO notice + NO report download, on a clean export', async () => {
    fetchPlanExport.mockResolvedValue({
      blob: new Blob(['<xer>'], { type: 'application/octet-stream' }),
      filename: 'north-tower.xer',
      report: null,
    });
    const { result } = build();
    act(() => {
      result.current.exportInterchange('xer');
    });
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Downloaded north-tower.xer.'));
    // Only the file was downloaded — no second (report) download, and no persistent notice.
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(result.current.exportNotice).toBeNull();
    expect(fetchPlanExport).toHaveBeenCalledWith(
      expect.objectContaining({ orgSlug: 'acme', planId: 'p1', format: 'xer' }),
    );
  });

  it('sets a VISIBLE opt-in notice (no auto report download) on a lossy export, and the button downloads the report with export copy', async () => {
    fetchPlanExport.mockResolvedValue({
      blob: new Blob(['<mspdi>'], { type: 'application/xml' }),
      filename: 'north-tower.xml',
      report: LOSSY_REPORT,
    });
    const { result } = build();
    act(() => {
      result.current.exportInterchange('mspdi');
    });
    await waitFor(() => expect(result.current.exportNotice).not.toBeNull());
    // The lossy announce is polite + short-sentence (S2), and only the FILE was downloaded (no auto report).
    expect(announce).toHaveBeenCalledWith(
      'Downloaded north-tower.xml. Some data was approximated for Microsoft Project. 1 item changed.',
    );
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(result.current.exportNotice?.message).toContain('Download the report');

    // Clicking "Download report" fires the SECOND download — the report text, named for export, with the
    // EXPORT-direction copy (B1) rather than the import heading.
    act(() => {
      result.current.exportNotice?.downloadReport();
    });
    expect(downloadBlob).toHaveBeenCalledTimes(2);
    const [reportBlob, reportName] = downloadBlob.mock.calls[1] as [Blob, string];
    expect(reportName).toBe('north-tower-export-report.txt');
    const text = await reportBlob.text();
    expect(text).toContain('SchedulePoint — schedule export report');
    expect(text).toContain('Target format:   MSPDI');
    expect(text).not.toContain('Source file:');
  });

  it('toggles interchangeExporting true→false around the fetch', async () => {
    let resolve: ((r: unknown) => void) | undefined;
    fetchPlanExport.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result } = build();
    act(() => {
      result.current.exportInterchange('xer');
    });
    expect(result.current.interchangeExporting).toBe(true);
    // A second pick while in flight is a no-op (the double-click guard).
    act(() => {
      result.current.exportInterchange('mspdi');
    });
    expect(fetchPlanExport).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve?.({ blob: new Blob(['x']), filename: 'north-tower.xer', report: null });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.interchangeExporting).toBe(false));
  });

  it('surfaces a user-safe error (setExportError + announce) when the fetch fails', async () => {
    fetchPlanExport.mockRejectedValue(
      new ApiFetchError(404, { code: 'NOT_FOUND', message: 'gone' }),
    );
    const { result } = build();
    act(() => {
      result.current.exportInterchange('xer');
    });
    await waitFor(() =>
      expect(result.current.exportError).toBe('This plan is no longer available.'),
    );
    expect(announce).toHaveBeenCalledWith('This plan is no longer available.');
    // A failed export leaves the loading flag reset and sets no success notice.
    expect(result.current.interchangeExporting).toBe(false);
    expect(result.current.exportNotice).toBeNull();
  });
});
