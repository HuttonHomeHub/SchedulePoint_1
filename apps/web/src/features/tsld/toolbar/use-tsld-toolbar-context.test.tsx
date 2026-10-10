import type { ActivitySummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TsldCanvasUiState } from './use-tsld-canvas-ui-state';
import { useTsldToolbarContext } from './use-tsld-toolbar-context';

import type {
  LoadedPlan,
  PlanWorkspaceModel,
} from '@/components/layout/workspace/use-plan-workspace-model';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * The `useTsldToolbarContext` glue (T3): the selection-aware quick-wins openers must call the model
 * seams they claim to — `openActivityNotes`
 * → `revealActivityNotes(selectedActivity)` (the U4 reveal-notes intent) — and the read-only Late overlay
 * must surface on the context so the Clear-visual item can explain an overlay-disabled state (A1). Proven
 * against the REAL builder (mocking only the leaf query hooks), so a renamed seam would fail.
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
const announce = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

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

function build(
  lateOverlay = false,
  extra: Partial<Parameters<typeof useTsldToolbarContext>[0]> = {},
  canvasUi: TsldCanvasUiState = makeCanvasUi(lateOverlay),
) {
  const model = makeModel();
  const { result } = renderHook(() =>
    useTsldToolbarContext({
      model,
      plan: PLAN,
      canvasUi,
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      minimap: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
      ...extra,
    }),
  );
  return result;
}

describe('useTsldToolbarContext — quick-wins glue', () => {
  beforeEach(() => vi.clearAllMocks());

  /*
   * **`openActivityNotes` was the subject here and no longer exists**
   * (`docs/specs/object-bar-defects/` M2). The command surface's Add note moved to the object bar
   * as `Notes`, so this hook stopped assembling a notes opener; `revealActivityNotes` is passed to
   * the bar directly by `plan-workspace-toolbar`, and what it does is covered where it is defined.
   */

  it('lateOverlayActive tracks the Late-start overlay view toggle (A1)', () => {
    expect(build(false).current.lateOverlayActive).toBe(false);
    expect(build(true).current.lateOverlayActive).toBe(true);
  });

  it('computes NO conflicts while VITE_CANVAS_NAV is off, even with a flagged activity + cursor (P-sug1)', () => {
    // This suite leaves CANVAS_NAV at its default (off): `orderedConflicts` must not run, so the whole
    // conflict surface degrades to zero/null regardless of the flags/cursor in state.
    const model = makeModel();
    model.activities.data = [{ ...SELECTED, constraintViolated: true, earlyStart: '2026-01-01' }];
    const canvasUi = makeCanvasUi();
    (canvasUi as { navState: unknown }).navState = {
      isolateActive: false,
      isolateMode: 'full',
      conflictCursorId: 'a1',
      selectSignal: null,
    };
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
    expect(result.current.conflictCount).toBe(0);
    expect(result.current.hasConflicts).toBe(false);
    expect(result.current.currentConflict).toBeNull();
  });
});

describe('useTsldToolbarContext — the promotion ladder (toolbar-redesign M5)', () => {
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  /** A viewport of `px` pixels at a 16 px root, with a mouse or a finger. */
  function viewport(px: number, coarse = false): void {
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      const rem = /min-width:\s*([\d.]+)rem/.exec(query)?.[1];
      return {
        matches: rem === undefined ? coarse : px >= Number(rem) * 16,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
    });
  }

  it('reads the viewport stage and the pointer once, onto the context both the bar and the menus read', () => {
    viewport(1440);
    expect(build().current.promotion).toEqual({ stage: 2, pointer: 'fine' });
    viewport(2560, true);
    expect(build().current.promotion).toEqual({ stage: 6, pointer: 'coarse' });
  });

  it('is stage 0 with no matchMedia: every unit test sees the unpromoted deck', () => {
    expect(build().current.promotion).toEqual({ stage: 0, pointer: 'fine' });
  });

  it('carries the two dock facts the promoted toggles are pressed from', () => {
    expect(build().current.healthOpen).toBe(false);
    expect(build(false, { healthOpen: true, revisionsOpen: true }).current).toMatchObject({
      healthOpen: true,
      revisionsOpen: true,
    });
  });

  it('says a colour change as well as showing it, and says nothing for the mode already chosen', () => {
    const canvasUi = makeCanvasUi();
    const result = build(false, {}, canvasUi);
    result.current.setColourMode('totalFloat');
    expect(canvasUi.setColourMode).toHaveBeenCalledWith('totalFloat');
    expect(announce).toHaveBeenCalledWith('Bars coloured by total float.');
    announce.mockClear();
    vi.mocked(canvasUi.setColourMode).mockClear();
    result.current.setColourMode('criticality');
    expect(canvasUi.setColourMode).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });
});
