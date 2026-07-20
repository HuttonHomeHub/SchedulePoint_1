import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NavState, TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The canvas-nav (`VITE_CANVAS_NAV`) glue on the REAL builder: `goToNextConflict` must centre the hit,
 * lift the selection, remember the cursor AND announce the exact "<i> of <n>: <name> — <reason>" string
 * (a11y-rec-4), and `currentConflict` must derive the visible-chip descriptor from the cursor + ordered
 * set (U2) — degrading to null while isolating / with no cursor.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_NAV_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
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

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

const CONFLICT = {
  id: 'c1',
  name: 'Excavate',
  earlyStart: '2026-02-10',
  laneIndex: 0,
  constraintViolated: true,
  visualConflict: false,
  externalDriven: false,
  levelingWindowExceeded: false,
  totalFloat: 0,
} as unknown as ActivitySummary;

const spies = {
  centerOnDate: vi.fn(),
  requestSelectActivity: vi.fn(),
  setConflictCursorId: vi.fn(),
};

function makeModel(activities: ActivitySummary[]): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: activities },
    canRecalc: true,
    canEditSchedule: true,
    canWrite: true,
    setEditing: vi.fn(),
    todayIso: '2026-07-19',
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

function makeCanvasUi(navState: Partial<NavState>): TsldCanvasUiState {
  return {
    zoomPreset: 'week',
    canvasControlRef: { current: { centerOnDate: spies.centerOnDate } },
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
      ...navState,
    },
    toggleIsolate: vi.fn(),
    setIsolateMode: vi.fn(),
    setConflictCursorId: spies.setConflictCursorId,
    toggleSnapToGrid: vi.fn(),
    requestSelectActivity: spies.requestSelectActivity,
  } as unknown as TsldCanvasUiState;
}

const PLAN = {
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  schedulingMode: 'EARLY',
  version: 1,
} as unknown as LoadedPlan;

function build(navState: Partial<NavState> = {}, activities: ActivitySummary[] = [CONFLICT]) {
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model: makeModel(activities),
      plan: PLAN,
      canvasUi: makeCanvasUi(navState),
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
    }),
  );
  return result;
}

describe('useTsldToolbarContext — canvas nav (flag on)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('goToNextConflict centres, selects, remembers the cursor and announces the exact string', () => {
    const ctx = build();
    ctx.current.goToNextConflict();
    expect(spies.centerOnDate).toHaveBeenCalledWith('2026-02-10');
    expect(spies.requestSelectActivity).toHaveBeenCalledWith('c1');
    expect(spies.setConflictCursorId).toHaveBeenCalledWith('c1');
    expect(announceSpy).toHaveBeenCalledWith('Conflict 1 of 1: Excavate — constraint conflict.');
  });

  it('exposes hasConflicts / conflictCount from the flagged set', () => {
    const ctx = build();
    expect(ctx.current.hasConflicts).toBe(true);
    expect(ctx.current.conflictCount).toBe(1);
  });

  it('derives currentConflict from the cursor for the visible chip (U2)', () => {
    const ctx = build({ conflictCursorId: 'c1' });
    expect(ctx.current.currentConflict).toEqual({
      index: 1,
      total: 1,
      name: 'Excavate',
      reasons: ['constraint conflict'],
    });
  });

  it('currentConflict is null before any cycle (no cursor)', () => {
    expect(build({ conflictCursorId: null }).current.currentConflict).toBeNull();
  });

  it('currentConflict is null while isolating (chip hidden during isolate)', () => {
    expect(
      build({ conflictCursorId: 'c1', isolateActive: true }).current.currentConflict,
    ).toBeNull();
  });
});
