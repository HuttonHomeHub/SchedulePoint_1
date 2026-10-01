import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The three context fields **Apply levelled dates…** reads (`docs/specs/apply-levelled-dates/` T2.1),
 * proven against the real builder so a renamed seam fails here rather than shading the command for
 * everybody.
 *
 * The move count must be **the lens's own count** — the ghosts it would draw — because the command
 * and the lens's "nothing to show" sentence are two readings of one fact; a count derived another
 * way (levelling delay, say) would disagree with the picture on a part-day delay, which has a delay
 * and no ghost.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_NAV_ENABLED: false,
}));
vi.mock('@/features/plans', () => ({
  PLAN_STATUS_LABELS: new Proxy({}, { get: () => 'Active' }),
}));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculateCommand: () => ({ isPending: false, run: vi.fn() }),
  useScheduleSummary: () => ({ isPending: true, data: undefined }),
}));
vi.mock('./plan-summary-panel', () => ({ PlanSummaryPanel: () => null }));

function activity(id: string, over: Partial<ActivitySummary>): ActivitySummary {
  return {
    id,
    version: 1,
    name: id,
    type: 'TASK',
    laneIndex: 0,
    earlyStart: '2026-03-02',
    visualEffectiveStart: '2026-03-02',
    leveledStart: null,
    leveledFinish: null,
    ...over,
  } as unknown as ActivitySummary;
}

const ACTIVITIES = [
  // Moved: levelled start differs from where the bar is drawn.
  activity('moved', { leveledStart: '2026-03-09', leveledFinish: '2026-03-11' }),
  // A participant levelling left alone.
  activity('kept', { leveledStart: '2026-03-02', leveledFinish: '2026-03-04' }),
  // Not a participant at all (no overlay).
  activity('none', {}),
];

function build({
  autoRecalc = {},
  activities = ACTIVITIES,
}: {
  autoRecalc?: Partial<{ isPending: boolean; pendingEdits: number; failed: boolean }>;
  activities?: ActivitySummary[];
} = {}) {
  const openDialog = vi.fn();
  const model = {
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
    undoRedo: {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      undo: vi.fn(),
      redo: vi.fn(),
    },
    autoRecalc: {
      isPending: false,
      flush: vi.fn(),
      notify: vi.fn(),
      pendingEdits: 0,
      failed: false,
      ...autoRecalc,
    },
    variance: { data: undefined, isPending: false, isError: false },
  } as unknown as PlanWorkspaceModel;
  const canvasUi = {
    zoomPreset: 'week',
    canvasControlRef: createRef(),
    requestFit: vi.fn(),
    viewToggles: { ...DEFAULT_VIEW_TOGGLES },
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
      selectSignal: null,
    },
    toggleIsolate: vi.fn(),
    setIsolateMode: vi.fn(),
    setConflictCursorId: vi.fn(),
    requestSelectActivity: vi.fn(),
  } as unknown as TsldCanvasUiState;
  const plan = {
    status: 'ACTIVE',
    plannedStart: '2026-01-01',
    version: 1,
  } as unknown as LoadedPlan;
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model,
      plan,
      canvasUi,
      openDialog,
      legend: { open: false, toggle: vi.fn() },
      minimap: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
    }),
  );
  return { result, openDialog };
}

describe('useTsldToolbarContext — the Apply levelled dates… inputs', () => {
  it('counts the bars the lens would draw a ghost for, and nothing else', () => {
    expect(build().result.current.levelledMoveCount).toBe(1);
  });

  it('counts zero when no activity carries a levelling overlay', () => {
    const { result } = build({ activities: [activity('a', {}), activity('b', {})] });
    expect(result.current.levelledMoveCount).toBe(0);
  });

  it('is not stale when the schedule is current', () => {
    expect(build().result.current.scheduleStale).toBe(false);
  });

  it('is stale while edits are waiting to be calculated', () => {
    expect(build({ autoRecalc: { pendingEdits: 2 } }).result.current.scheduleStale).toBe(true);
  });

  it('is stale while a recalculation is running', () => {
    expect(build({ autoRecalc: { isPending: true } }).result.current.scheduleStale).toBe(true);
  });

  it('is stale after a recalculation failed', () => {
    expect(build({ autoRecalc: { failed: true } }).result.current.scheduleStale).toBe(true);
  });

  it('opens the apply-levelling dialog', () => {
    const { result, openDialog } = build();
    result.current.requestApplyLevelling();
    expect(openDialog).toHaveBeenCalledWith('apply-levelling');
  });
});
