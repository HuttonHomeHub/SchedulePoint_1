import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMMAND_CLASS, type WithDiagram } from './canvas-directed-commands';
import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * **Every canvas-directed command on the toolbar context is wrapped in `withDiagram`**
 * (`docs/specs/short-screen-vertical-budget`, M-A3). The rule is applied at the context, so a `render`
 * item and a plain button get it alike, and a new command has to choose a class
 * (`COMMAND_CLASS`) before this suite — or the typecheck, which is a `Record` over the interface's
 * function keys — lets it through. Proven against the REAL builder, mocking only the leaf queries.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  // Pin canvas nav OFF here: this suite proves the flag-off conflict gate (P-sug1) — `orderedConflicts`
  // must not run, so the conflict surface degrades to zero/null. The flag-on conflict derivation is
  // covered in use-tsld-toolbar-context-canvas-nav.test.tsx.
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

const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

const spies = {
  onProgressActivity: vi.fn(),
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
    onProgressActivity: spies.onProgressActivity,
    clearVisualPlacement: spies.clearVisualPlacement,
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
    },
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
}

const PLAN = {
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  version: 1,
} as unknown as LoadedPlan;

function buildWrapped() {
  const wrapped = new WeakSet<object>();
  const withDiagram: WithDiagram = (command) => {
    const marked = (...args: Parameters<typeof command>): void => command(...args);
    wrapped.add(marked);
    return marked;
  };
  const model = makeModel();
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model,
      plan: PLAN,
      canvasUi: makeCanvasUi(),
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      minimap: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
      withDiagram,
    }),
  );
  return { ctx: result.current as unknown as Record<string, unknown>, wrapped };
}

describe('useTsldToolbarContext — canvas-directed commands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('classifies every function the built context carries', () => {
    const { ctx } = buildWrapped();
    const unclassified = Object.keys(ctx).filter(
      (key) => typeof ctx[key] === 'function' && !(key in COMMAND_CLASS),
    );
    expect(unclassified).toEqual([]);
  });

  it('wraps exactly the commands classified as acting on the diagram', () => {
    const { ctx, wrapped } = buildWrapped();
    const unwrapped: string[] = [];
    const overWrapped: string[] = [];
    for (const [key, commandClass] of Object.entries(COMMAND_CLASS)) {
      const value = ctx[key];
      // The partial model supplies only some of the model-sourced functions; those are all
      // `unaffected`, so absence only matters for a command that is meant to be wrapped.
      if (commandClass === 'unaffected' && typeof value !== 'function') continue;
      expect(typeof value, `${key} is on the context`).toBe('function');
      const isWrapped = wrapped.has(value as object);
      if (commandClass !== 'unaffected' && !isWrapped) unwrapped.push(key);
      if (commandClass === 'unaffected' && isWrapped) overWrapped.push(key);
    }
    expect(unwrapped, 'canvas-directed but not wrapped in withDiagram').toEqual([]);
    expect(overWrapped, 'wrapped but classified as unaffected').toEqual([]);
  });

  it('runs every command in place when the host supplies no swap', () => {
    const model = makeModel();
    const canvasUi = makeCanvasUi();
    const { result } = renderHook(() =>
      useTsldToolbarContext({
        model,
        plan: PLAN,
        canvasUi,
        openDialog: vi.fn(),
        legend: { open: false, toggle: vi.fn() },
        minimap: { open: false, toggle: vi.fn() },
        revealComments: vi.fn(),
      }),
    );
    result.current.fit();
    expect(canvasUi.requestFit).toHaveBeenCalledTimes(1);
  });
});
