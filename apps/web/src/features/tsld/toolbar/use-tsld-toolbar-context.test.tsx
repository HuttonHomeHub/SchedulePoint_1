import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The `useTsldToolbarContext` glue (T3): the selection-aware quick-wins openers must call the model
 * seams they claim to — `openProgress` → `setProgressActivityId(selectedActivityId)`, `openActivityNotes`
 * → `revealActivityNotes(selectedActivity)` (the U4 reveal-notes intent) — and the read-only Late overlay
 * must surface on the context so the Clear-visual item can explain an overlay-disabled state (A1). Proven
 * against the REAL builder (mocking only the leaf query hooks), so a renamed seam would fail.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
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

const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

const spies = {
  setProgressActivityId: vi.fn(),
  revealActivityNotes: vi.fn(),
  clearVisualPlacement: vi.fn(),
};

function makeModel(): PlanWorkspaceModel {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: [SELECTED] },
    canRecalc: true,
    canEditSchedule: true,
    canWrite: true,
    setEditing: vi.fn(),
    todayIso: '2026-07-19',
    selectedActivityId: 'a1',
    selectedActivity: SELECTED,
    canProgress: true,
    canWriteNotes: true,
    revealActivityNotes: spies.revealActivityNotes,
    setProgressActivityId: spies.setProgressActivityId,
    clearVisualPlacement: spies.clearVisualPlacement,
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

function makeCanvasUi(lateOverlay = false): TsldCanvasUiState {
  return {
    zoomPreset: 'week',
    canvasControlRef: createRef(),
    requestFit: vi.fn(),
    viewToggles: { ...DEFAULT_VIEW_TOGGLES, lateOverlay },
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
  } as unknown as TsldCanvasUiState;
}

const PLAN = {
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  schedulingMode: 'VISUAL',
  version: 1,
} as unknown as LoadedPlan;

function build(lateOverlay = false) {
  const model = makeModel();
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model,
      plan: PLAN,
      canvasUi: makeCanvasUi(lateOverlay),
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
    }),
  );
  return result;
}

describe('useTsldToolbarContext — quick-wins glue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('openProgress sets the progress target to the current selection (F3)', () => {
    const ctx = build();
    ctx.current.openProgress();
    expect(spies.setProgressActivityId).toHaveBeenCalledWith('a1');
  });

  it('openActivityNotes reveals the selected activity notes (F4/U4 intent)', () => {
    const ctx = build();
    ctx.current.openActivityNotes();
    expect(spies.revealActivityNotes).toHaveBeenCalledWith(SELECTED);
  });

  it('lateOverlayActive tracks the Late-start overlay view toggle (A1)', () => {
    expect(build(false).current.lateOverlayActive).toBe(false);
    expect(build(true).current.lateOverlayActive).toBe(true);
  });
});
