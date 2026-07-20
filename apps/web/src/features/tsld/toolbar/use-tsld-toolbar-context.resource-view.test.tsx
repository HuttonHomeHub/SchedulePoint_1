import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The resource-view (`VITE_CANVAS_RESOURCE_VIEW`, Stage E) glue on the REAL builder: `hasOverAllocation`
 * must derive from `activities.some(isOverAllocated)` (the engine-owned `levelingWindowExceeded ||
 * selfOverAllocated` flags, ADR-0041 — never a client re-derivation), and the ephemeral open/highlight
 * flags + their toggles must pass straight through from the model. Only this flag is forced on.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_RESOURCE_VIEW_ENABLED: true,
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
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    name: 'Survey',
    earlyStart: '2026-01-02',
    laneIndex: 0,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    totalFloat: 5,
    ...over,
  } as unknown as ActivitySummary;
}

const spies = { toggleResourceView: vi.fn(), toggleOverAllocation: vi.fn() };

function makeModel(activities: ActivitySummary[]): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: activities },
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
    resourceViewOpen: true,
    toggleResourceView: spies.toggleResourceView,
    overAllocationHighlight: true,
    toggleOverAllocation: spies.toggleOverAllocation,
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
    canvasControlRef: { current: null },
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
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  schedulingMode: 'EARLY',
  version: 1,
} as unknown as LoadedPlan;

function build(activities: ActivitySummary[]) {
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model: makeModel(activities),
      plan: PLAN,
      canvasUi: makeCanvasUi(),
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
    }),
  );
  return result;
}

describe('useTsldToolbarContext — resource view (flag on)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hasOverAllocation is true when an activity carries levelingWindowExceeded', () => {
    expect(
      build([activity({ id: 'a1', levelingWindowExceeded: true })]).current.hasOverAllocation,
    ).toBe(true);
  });

  it('hasOverAllocation is true when an activity carries selfOverAllocated', () => {
    expect(build([activity({ id: 'a1', selfOverAllocated: true })]).current.hasOverAllocation).toBe(
      true,
    );
  });

  it('hasOverAllocation is false when no activity carries either engine flag', () => {
    expect(build([activity({ id: 'a1' }), activity({ id: 'a2' })]).current.hasOverAllocation).toBe(
      false,
    );
  });

  it('passes the ephemeral open + highlight flags and their toggles straight through from the model', () => {
    const ctx = build([activity({ id: 'a1', levelingWindowExceeded: true })]).current;
    expect(ctx.resourceViewOpen).toBe(true);
    expect(ctx.overAllocationHighlight).toBe(true);
    ctx.toggleResourceView();
    ctx.toggleOverAllocation();
    expect(spies.toggleResourceView).toHaveBeenCalledOnce();
    expect(spies.toggleOverAllocation).toHaveBeenCalledOnce();
  });
});
