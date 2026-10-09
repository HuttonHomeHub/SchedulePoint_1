import type { ActivitySummary, DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as diagramImageModule from './commands/use-diagram-image';
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
// The shared zoom-preset setter (`useTsldCanvasUiState`'s own state). The Gantt reads the preset,
// so the toolbar must reach this even when the canvas handle is null.
const setCanvasZoomPreset = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

// Mock the off-screen renderer + the render-model projection so the wiring runs without a real canvas.
vi.mock('../export/render-export-image', () => ({
  renderExportImage: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));
vi.mock('../render/to-render-model', () => ({
  // **`'visual'`, because that is what the real function now returns for every plan** (M-F-T1).
  // Left at `'early'` this mock would describe a world no shipped bundle can produce — the shape
  // ADR-0088 records the base journey's editing specs having been in for months. The value is
  // still mocked rather than real because these suites are about the host, not the resolver;
  // `lib/bar-dates.test.ts` covers the rule itself, which until M-F nothing did.
  barDateSourceFor: () => 'visual',
  toRenderActivities: () => [{ earlyStart: '2026-01-01', earlyFinish: '2026-01-10', laneIndex: 0 }],
  toRenderEdges: () => [],
}));

// The print-surface mount/teardown shim — toggled resolve/throw per test. Hoisted so the `vi.mock`
// factory (itself hoisted above the imports) can reference it without a TDZ error.
const printDiagramImage = vi.hoisted(() => vi.fn());
vi.mock('../export/PrintSurface', () => ({ printDiagramImage }));

// The Gantt print document (ADR-0059 M4). Mocked so this file proves the ROUTING — which surface
// Print reaches for in each view — without rendering a whole programme.
const printGanttSchedule = vi.hoisted(() => vi.fn());
vi.mock('@/features/gantt', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  printGanttSchedule,
}));

vi.mock('@/features/plans', () => ({
  PLAN_STATUS_LABELS: new Proxy({}, { get: () => 'Active' }),
}));
// A SINGLE stable object (not a fresh literal per call): `useTsldToolbarContext`'s context memo
// lists `recalc` (`useRecalculateCommand`'s return), so a mock returning a new `{ isPending, run }`
// pair on every call would invalidate that memo every render for a reason that has nothing to do
// with this file's own identity cases (R8, M0-T4) — masking exactly the defect each exists to
// isolate. `vi.clearAllMocks()` resets `run`'s call history without replacing the reference.
const recalculateCommand = vi.hoisted(() => ({ isPending: false, run: vi.fn() }));
vi.mock('@/features/schedule/api/use-schedule', () => ({
  useRecalculateCommand: () => recalculateCommand,
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

/**
 * The imperative canvas handle. In the app it is either a COMPLETE control or `null` (the canvas is
 * unmounted) — never a partial object, which is why the context calls its methods behind `?.` on
 * the ref rather than on each method.
 */
const canvasHandle = {
  getViewport: () => ({
    view: { pxPerDay: 20, originX: 0, originY: 0 },
    size: { width: 800, height: 600 },
  }),
  zoomToPreset: vi.fn(),
  stepZoom: vi.fn(),
  goToDate: vi.fn(),
  centerOnDate: vi.fn(),
};

function makeCanvasUi(): TsldCanvasUiState {
  return {
    zoomPreset: 'week',
    setZoomPreset: setCanvasZoomPreset,
    // A live viewport the export reads (never mutates) via the control handle.
    canvasControlRef: {
      current: canvasHandle,
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
      selectSignal: null,
    },
    toggleIsolate: vi.fn(),
    setIsolateMode: vi.fn(),
    setConflictCursorId: vi.fn(),
    requestSelectActivity: vi.fn(),
  } as unknown as TsldCanvasUiState;
}

const PLAN = {
  name: 'North Tower',
  status: 'ACTIVE',
  plannedStart: '2026-01-01',
  version: 1,
} as unknown as LoadedPlan;

function build(planView: 'tsld' | 'gantt' = 'tsld', { canvas = true } = {}) {
  const canvasUi = makeCanvasUi();
  if (!canvas) {
    (canvasUi.canvasControlRef as { current: unknown }).current = null;
  }
  return renderHook(() =>
    useTsldToolbarContext({
      model: makeModel(),
      plan: PLAN,
      canvasUi,
      openDialog: vi.fn(),
      legend: { open: false, toggle: vi.fn() },
      minimap: { open: false, toggle: vi.fn() },
      revealComments: vi.fn(),
      planView,
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
    // **The subtitle carries BOTH dates, in one format** (`docs/TECH_DEBT.md` #217). It used to
    // carry the data date alone while the band painted into the image repeated the plan name and
    // printed "As of <iso> · Generated <iso>" — so paper stated the plan's identity twice, six
    // lines apart, in two date formats. The band is now legend-only on this path and the document
    // is the single home for the identity and the dates.
    expect(arg.subtitle).toBe('As of 01 Jan 2026 · Generated 20 Jul 2026');
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

/**
 * Print follows the active view. The diagram path rasterises a canvas; the Gantt is DOM and prints
 * as a document (ADR-0059 M4). Reaching for the wrong one produces a plausible-looking artefact of
 * the *other* view, which a user would not notice until the meeting.
 */
describe('useTsldToolbarContext — Print follows the active view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    printDiagramImage.mockImplementation(() => undefined);
  });

  it('prints the programme document, not a canvas raster, when the Gantt is showing', () => {
    const { result } = build('gantt');
    act(() => {
      result.current.printDiagram();
    });

    expect(printGanttSchedule).toHaveBeenCalledTimes(1);
    expect(printDiagramImage).not.toHaveBeenCalled();

    const [arg] = printGanttSchedule.mock.calls[0] as unknown as [
      { title: string; subtitle: string; activities: readonly unknown[] },
    ];
    expect(arg.title).toBe('North Tower');
    expect(arg.subtitle).toBe('As of 01 Jan 2026');
    expect(arg.activities).toHaveLength(1);
    expect(announce).toHaveBeenCalledWith('Printing North Tower.');
  });

  // Synchronous: there is no image to build, so it must not announce a preparation step that never
  // happens, and it must not leave the re-entry guard latched.
  it('does not announce an image-build step, and stays repeatable', () => {
    const { result } = build('gantt');
    act(() => {
      result.current.printDiagram();
      result.current.printDiagram();
    });
    expect(announce).not.toHaveBeenCalledWith('Preparing the diagram to print…');
    expect(printGanttSchedule).toHaveBeenCalledTimes(2);
  });

  it('still rasterises the diagram when the TSLD is showing', async () => {
    const { result } = build('tsld');
    await act(async () => {
      result.current.printDiagram();
      await Promise.resolve();
    });
    expect(printDiagramImage).toHaveBeenCalledTimes(1);
    expect(printGanttSchedule).not.toHaveBeenCalled();
  });
});

/**
 * Site 3 (`docs/TECH_DEBT.md` #353, `docs/specs/hook-deps-gate/`): the context memo's own
 * dependency list omits `dependencies`, though `printDiagram`'s Gantt branch reads it. A link
 * added since the memo last ran is therefore missing from the printed Predecessors column, even
 * though `model.activities.data` is unchanged (TanStack Query shares unchanged structure, so an
 * added — non-driving — link moves no date and touches no activity row).
 *
 * **`useDiagramImage` is stubbed to a STABLE function** (M0's own finding, `m0-measurement.md`
 * §"E12 is masked, not absent"): its real implementation takes `dependencies` (this file's
 * stabilised local, `use-tsld-toolbar-context.tsx:201`) as a `useCallback` dependency, and
 * `buildDiagramImage` is itself listed on the outer context memo — so ANY change to
 * `model.dependencies?.data` already forces the whole memo (and `printDiagram` with it) to
 * rebuild, via that unrelated wiring, before the fix under test ever runs. Left real, this case
 * would pass identically with or without M1-T1's fix, which is exactly what M0 found when it was
 * first written this way. The stub removes that incidental cover; nothing about the Gantt branch
 * (which never calls `buildDiagramImage`) depends on what the stub returns.
 */
describe('useTsldToolbarContext — the printed Gantt reads the CURRENT links (R8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prints a link added since the last render, with the activities array unchanged', () => {
    vi.spyOn(diagramImageModule, 'useDiagramImage').mockReturnValue(vi.fn(() => null));

    const canvasUi = makeCanvasUi();
    // `dependencies` is a MUTABLE wrapper, mutated in place below — the same object identity,
    // a new `.data` array. That isolates the missing-dependency defect from E13's unrelated
    // churn: `exportMatch` lists the whole `model.dependencies` WRAPPER, so if the wrapper's own
    // reference changed too (as a real refetch's `trackResult` Proxy would), `exportMatch` would
    // recompute for its OWN reason and incidentally carry the context memo along with it,
    // masking this defect rather than isolating it. Holding the wrapper steady and changing only
    // its `.data` is exactly "a new `dependencies.data` array" (M1-T1's own words).
    const dependencies: { data: DependencySummary[] } = { data: [] };
    const model = { ...makeModel(), dependencies } as PlanWorkspaceModel;
    // Every prop the outer memo lists is hoisted and created ONCE, so only `dependencies.data`
    // moves across the re-render — an inline `vi.fn()` inside the render callback would be a NEW
    // function on every call and would (correctly) invalidate the memo for an unrelated reason,
    // masking exactly the defect this case exists to isolate. The three `useTsldToolbarContext`
    // no-op DEFAULTS (`toggleHealthCheck`/`toggleRevisionCompare`/`setPlanView`)
    // are exactly such a source when left implicit — a fresh `() => {}` is minted on every render
    // the prop is omitted from — so all three are passed explicitly here too.
    const openDialog = vi.fn();
    const legend = { open: false, toggle: vi.fn() };
    const minimap = { open: false, toggle: vi.fn() };
    const revealComments = vi.fn();
    const toggleHealthCheck = vi.fn();
    const toggleRevisionCompare = vi.fn();
    const setPlanView = vi.fn();
    const { result, rerender } = renderHook(
      () =>
        useTsldToolbarContext({
          model,
          plan: PLAN,
          canvasUi,
          openDialog,
          legend,
          minimap,
          revealComments,
          toggleHealthCheck,
          toggleRevisionCompare,
          setPlanView,
          planView: 'gantt',
        }),
      {},
    );

    const addedLink = {
      id: 'd1',
      predecessorId: 'a1',
      successorId: 'a2',
    } as unknown as DependencySummary;
    // Same `activities` reference, same `dependencies` WRAPPER reference — only its `.data`
    // moves. A pure logic add that touches no activity row.
    dependencies.data = [addedLink];
    rerender();

    act(() => {
      result.current.printDiagram();
    });

    const [arg] = printGanttSchedule.mock.calls.at(-1) as unknown as [
      { dependencies: readonly DependencySummary[] },
    ];
    expect(arg.dependencies).toEqual([addedLink]);
  });
});

/**
 * E13/M0-T4: `model.dependencies` is a real `useQuery` result, not the `{ data: [] }` literal
 * every other fixture in this file reuses. `useBaseQuery.js:46` hands back a NEW `trackResult`
 * Proxy on every render regardless of whether the cached data changed — so a memo keyed on the
 * whole query-result object (rather than on `.data`) churns every render, and that churn was
 * propagating to the whole toolbar context via `exportMatch` (M1-T1 fixes it to read the
 * stabilised `dependencies` local instead of `model.dependencies`).
 *
 * **Isolated from two OTHER identity confounds M0 found the same way it found E12's mask**
 * (`m0-measurement.md`): the three `useTsldToolbarContext` no-op parameter DEFAULTS
 * (`toggleHealthCheck`/`toggleRevisionCompare`/`setPlanView`), each a fresh
 * `() => {}` on every render the prop is omitted from; and `useRecalculateCommand`'s mock, which
 * returned a new `{ isPending, run }` literal per call. Both are unconditional churn sources —
 * present whether or not E13 exists — so left uncontrolled this case would fail for THREE
 * reasons at once and a fix to `exportMatch` alone could never turn it green. The `dependencies`
 * local (`:201`) itself does not move here (the cached `.data` array is the SAME reference on
 * both renders — only the `trackResult` Proxy wrapping it is new), so `useDiagramImage` needs no
 * stub in this case the way R8's does.
 */
describe('useTsldToolbarContext — context identity against a REAL query result (M0-T4/E13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not change identity across a re-render with nothing changed', async () => {
    const { usePlanDependencies, dependencyKeys } = await import('@/features/dependencies');
    const queryClient = new QueryClient();
    queryClient.setQueryData(dependencyKeys.byPlan('acme', 'p1'), []);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const canvasUi = makeCanvasUi();
    // Every prop besides `dependencies` is hoisted and created ONCE. `usePlanDependencies` is the
    // ONLY thing allowed to differ between the two renders below — an inline `vi.fn()` (or a
    // fresh `makeModel()` call) inside the render callback would itself be a new reference every
    // render and would invalidate the memo for a reason that has nothing to do with E13.
    const baseModel = makeModel();
    const openDialog = vi.fn();
    const legend = { open: false, toggle: vi.fn() };
    const minimap = { open: false, toggle: vi.fn() };
    const revealComments = vi.fn();
    const toggleHealthCheck = vi.fn();
    const toggleRevisionCompare = vi.fn();
    const setPlanView = vi.fn();
    const { result, rerender } = renderHook(
      () => {
        const dependencies = usePlanDependencies('acme', 'p1');
        const model = { ...baseModel, dependencies };
        return useTsldToolbarContext({
          model,
          plan: PLAN,
          canvasUi,
          openDialog,
          legend,
          minimap,
          revealComments,
          toggleHealthCheck,
          toggleRevisionCompare,
          setPlanView,
          planView: 'gantt',
        });
      },
      { wrapper },
    );

    // Let the (already-cached) query settle so `dependencies.data` is populated on the first
    // read, matching the app's steady state rather than its very first loading render.
    await act(async () => {
      await Promise.resolve();
    });

    const first = result.current;
    // An unrelated re-render — nothing about the model's VALUES changes, only that
    // `usePlanDependencies` is called again and (per `useBaseQuery.js:46`) hands back a fresh
    // Proxy wrapper each time.
    act(() => {
      rerender();
    });
    const second = result.current;

    expect(second).toBe(first);
  });
});

/**
 * The zoom PRESET is shared state both views read (ADR-0059 §2), not a canvas property. It has to
 * be settable with the canvas unmounted, or the control sits lit and inert in the Gantt — the
 * failure mode a user cannot distinguish from a slow one.
 */
describe('useTsldToolbarContext — the zoom preset without a canvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the shared preset with no canvas mounted, and does not throw', () => {
    const { result } = build('gantt', { canvas: false });
    act(() => {
      result.current.setZoomPreset('quarter');
    });
    expect(setCanvasZoomPreset).toHaveBeenCalledWith('quarter');
    expect(canvasHandle.zoomToPreset).not.toHaveBeenCalled();
  });

  it('sets it in the diagram too, and still commands the canvas', () => {
    const { result } = build('tsld');
    act(() => {
      result.current.setZoomPreset('year');
    });
    expect(setCanvasZoomPreset).toHaveBeenCalledWith('year');
    expect(canvasHandle.zoomToPreset).toHaveBeenCalledWith('year');
  });

  it('reports the canvas as inactive in the Gantt and active in the diagram', () => {
    expect(build('gantt').result.current.canvasActive).toBe(false);
    expect(build('tsld').result.current.canvasActive).toBe(true);
  });
});
