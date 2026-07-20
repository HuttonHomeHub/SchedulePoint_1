import type { ActivityType, DependencyType } from '@repo/types';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { TsldCanvasHandle } from '../components/TsldCanvas';
import type { EditMode } from '../interaction/gesture-machine';
import type { ColourMode, FilterAttr } from '../render/lenses';
import type { LogicPathMode } from '../render/logic-path';
import { DEFAULT_VIEW_TOGGLES, type TsldViewToggles } from '../render/paint';
import type { ZoomLevel } from '../render/render-model';

/**
 * The TSLD canvas's **view/interaction UI state** (ADR-0031) — the cluster {@link TsldPanel} used to
 * own privately: the edit mode, the layer toggles, the active zoom preset (reflected from the
 * canvas), the imperative canvas control handle, plus one-shot "signals" for Fit and Auto-arrange
 * and the keyboard-shortcuts dialog. Lifting it into a hook lets a **chromeless** `TsldPanel` and an
 * external `<Toolbar>` share one source of truth: the canvas-first workspace holds this once, feeds
 * it to a bare canvas, and builds the toolbar context from the same object. When `TsldPanel` runs
 * uncontrolled (flag-off / legacy) it calls this itself, so behaviour is byte-for-byte unchanged.
 */
export interface TsldCanvasUiState {
  mode: EditMode;
  setMode: React.Dispatch<React.SetStateAction<EditMode>>;
  viewToggles: TsldViewToggles;
  toggleView: (key: keyof TsldViewToggles) => void;
  zoomPreset: ZoomLevel;
  setZoomPreset: React.Dispatch<React.SetStateAction<ZoomLevel>>;
  /** Bumped to ask the canvas to re-fit; `TsldPanel` re-fits when it changes. */
  fitSignal: number;
  requestFit: () => void;
  /** Bumped to ask `TsldPanel` to open the auto-arrange confirm flow. */
  autoArrangeSignal: number;
  requestAutoArrange: () => void;
  showHelp: boolean;
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
  canvasControlRef: React.RefObject<TsldCanvasHandle | null>;
  /**
   * The activity kind the next canvas draw creates (canvas-first authoring, ADR-0032). Driven by the
   * toolbar's Add split-button; the canvas reads it to collapse milestone draws to a zero-duration
   * point. Defaults to `'TASK'` so flag-off behaviour is unchanged.
   */
  createType: ActivityType;
  setCreateType: React.Dispatch<React.SetStateAction<ActivityType>>;
  /**
   * The dependency kind the two-click Link tool creates (canvas-first authoring, ADR-0032 M5).
   * Driven by the toolbar's link-type control; the canvas reads it when a link is committed.
   * Defaults to `'FS'`.
   */
  linkType: DependencyType;
  setLinkType: React.Dispatch<React.SetStateAction<DependencyType>>;
  /**
   * The **Level of Effort (hammock)** endpoint-pick tool's picked **start driver** id (Stage D,
   * `docs/specs/canvas-activity-types/`, behind `VITE_CANVAS_ACTIVITY_TYPES`) — the SINGLE source of
   * truth for "the picked start", shared by the pointer pick (canvas → `onLoeSpanStep`), the keyboard
   * pick (`TsldPanel`'s listbox Enter), and the toolbar's Add-trigger label. Null when no start is
   * picked; cleared when the tool disarms (`mode` leaves `'loe'`). Inert while the flag/tool is off
   * (`mode` is never `'loe'` then), so it stays null and nothing reads it.
   */
  loeStartId: string | null;
  setLoeStartId: React.Dispatch<React.SetStateAction<string | null>>;
  /**
   * The **insight-lens** view state (spec `docs/specs/canvas-lenses/`, behind `VITE_CANVAS_LENSES`) —
   * the client filter query + attribute toggles, the Colour-by mode, and the Baseline-overlay switch.
   * Pure CLIENT VIEW STATE, exactly like {@link viewToggles}: never server state, never persisted; it
   * re-derives the scene's dimmed-id / colour / ghost maps whenever it or the queries change. Defaults
   * (empty query, no attrs, Criticality, overlay off) produce no dim/fill/ghost ⇒ byte-for-byte parity.
   */
  lensState: LensState;
  setFilterQuery: (query: string) => void;
  toggleFilterAttr: (attr: FilterAttr) => void;
  setColourMode: (mode: ColourMode) => void;
  toggleBaselineOverlay: () => void;
  /**
   * The **canvas navigation & authoring** view state (spec `docs/specs/canvas-nav/`, behind
   * `VITE_CANVAS_NAV`) — the *Isolate logic path* toggle + chain mode, the *Next conflict* cursor, the
   * *Snap to grid* toggle, and a one-shot **select signal** the toolbar uses to drive the canvas
   * selection (for Next-conflict). Pure CLIENT VIEW STATE, exactly like {@link lensState}: never server
   * state, never persisted. Defaults (isolate off, no cursor, snap off, no signal) produce no dim, no
   * snap and no selection command ⇒ byte-for-byte parity.
   */
  navState: NavState;
  /** Toggle the Isolate-logic-path emphasis on/off (session-local). */
  toggleIsolate: () => void;
  /** Set the isolate chain mode AND arm isolate on (a picked mode always means "isolate now"), mirroring
   * the Add split-button's `setCreateType`. */
  setIsolateMode: (mode: LogicPathMode) => void;
  /** Remember the last-visited conflict id (the *Next conflict* cursor). */
  setConflictCursorId: (id: string | null) => void;
  /** Toggle *Snap to grid* on/off (session-local, CQ-3). */
  toggleSnapToGrid: () => void;
  /** Ask the canvas (via `TsldPanel`) to select an activity — the *Next conflict* selection lift. A
   * monotonic `nonce` makes each request distinct so repeated jumps to the same id still fire. */
  requestSelectActivity: (id: string) => void;
}

/** The canvas nav/authoring view-state shape (see {@link TsldCanvasUiState.navState}). */
export interface NavState {
  isolateActive: boolean;
  isolateMode: LogicPathMode;
  conflictCursorId: string | null;
  snapToGrid: boolean;
  /** The pending selection command from the toolbar (Next-conflict), or null. `TsldPanel` applies it and
   * de-dupes by `nonce`. */
  selectSignal: { id: string; nonce: number } | null;
}

/** The lens view-state shape (see {@link TsldCanvasUiState.lensState}). */
export interface LensState {
  filterQuery: string;
  filterAttrs: ReadonlySet<FilterAttr>;
  colourMode: ColourMode;
  baselineOverlay: boolean;
}

/** The lens defaults — the "no lens active" identity (dims nothing, today's fills, overlay off). */
const DEFAULT_LENS_STATE: LensState = {
  filterQuery: '',
  filterAttrs: new Set<FilterAttr>(),
  colourMode: 'criticality',
  baselineOverlay: false,
};

/** The nav defaults — the "no nav active" identity (isolate off, no cursor, snap off, no signal). */
const DEFAULT_NAV_STATE: NavState = {
  isolateActive: false,
  isolateMode: 'full',
  conflictCursorId: null,
  snapToGrid: false,
  selectSignal: null,
};

export function useTsldCanvasUiState(): TsldCanvasUiState {
  const [mode, setMode] = useState<EditMode>('select');
  const [viewToggles, setViewToggles] = useState<TsldViewToggles>(DEFAULT_VIEW_TOGGLES);
  const [zoomPreset, setZoomPreset] = useState<ZoomLevel>('week');
  const [fitSignal, setFitSignal] = useState(0);
  const [autoArrangeSignal, setAutoArrangeSignal] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [createType, setCreateType] = useState<ActivityType>('TASK');
  const [linkType, setLinkType] = useState<DependencyType>('FS');
  const [loeStartId, setLoeStartId] = useState<string | null>(null);
  const [lensState, setLensState] = useState<LensState>(DEFAULT_LENS_STATE);
  const [navState, setNavState] = useState<NavState>(DEFAULT_NAV_STATE);
  const canvasControlRef = useRef<TsldCanvasHandle>(null);

  const toggleView = useCallback(
    (key: keyof TsldViewToggles): void => setViewToggles((v) => ({ ...v, [key]: !v[key] })),
    [],
  );
  const requestFit = useCallback((): void => setFitSignal((n) => n + 1), []);
  const requestAutoArrange = useCallback((): void => setAutoArrangeSignal((n) => n + 1), []);
  const setFilterQuery = useCallback(
    (filterQuery: string): void => setLensState((s) => ({ ...s, filterQuery })),
    [],
  );
  const toggleFilterAttr = useCallback(
    (attr: FilterAttr): void =>
      setLensState((s) => {
        const filterAttrs = new Set(s.filterAttrs);
        if (filterAttrs.has(attr)) filterAttrs.delete(attr);
        else filterAttrs.add(attr);
        return { ...s, filterAttrs };
      }),
    [],
  );
  const setColourMode = useCallback(
    (colourMode: ColourMode): void => setLensState((s) => ({ ...s, colourMode })),
    [],
  );
  const toggleBaselineOverlay = useCallback(
    (): void => setLensState((s) => ({ ...s, baselineOverlay: !s.baselineOverlay })),
    [],
  );
  const toggleIsolate = useCallback(
    (): void => setNavState((s) => ({ ...s, isolateActive: !s.isolateActive })),
    [],
  );
  const setIsolateMode = useCallback(
    // Picking a mode arms isolate on (a pick always means "isolate now"), mirroring `setCreateType`.
    (isolateMode: LogicPathMode): void =>
      setNavState((s) => ({ ...s, isolateMode, isolateActive: true })),
    [],
  );
  const setConflictCursorId = useCallback(
    (conflictCursorId: string | null): void => setNavState((s) => ({ ...s, conflictCursorId })),
    [],
  );
  const toggleSnapToGrid = useCallback(
    (): void => setNavState((s) => ({ ...s, snapToGrid: !s.snapToGrid })),
    [],
  );
  const requestSelectActivity = useCallback(
    (id: string): void =>
      setNavState((s) => ({
        ...s,
        selectSignal: { id, nonce: (s.selectSignal?.nonce ?? 0) + 1 },
      })),
    [],
  );

  // Memoised on its own values (setters/ref are stable), so the object's identity only changes when
  // the canvas view-state actually changes — an unrelated parent re-render (e.g. an activity-panel
  // drag) never churns the downstream toolbar context / `<Toolbar>` remeasure (perf, ADR-0031).
  return useMemo(
    () => ({
      mode,
      setMode,
      viewToggles,
      toggleView,
      zoomPreset,
      setZoomPreset,
      fitSignal,
      requestFit,
      autoArrangeSignal,
      requestAutoArrange,
      showHelp,
      setShowHelp,
      canvasControlRef,
      createType,
      setCreateType,
      linkType,
      setLinkType,
      loeStartId,
      setLoeStartId,
      lensState,
      setFilterQuery,
      toggleFilterAttr,
      setColourMode,
      toggleBaselineOverlay,
      navState,
      toggleIsolate,
      setIsolateMode,
      setConflictCursorId,
      toggleSnapToGrid,
      requestSelectActivity,
    }),
    [
      mode,
      viewToggles,
      toggleView,
      zoomPreset,
      fitSignal,
      requestFit,
      autoArrangeSignal,
      requestAutoArrange,
      showHelp,
      createType,
      linkType,
      loeStartId,
      lensState,
      setFilterQuery,
      toggleFilterAttr,
      setColourMode,
      toggleBaselineOverlay,
      navState,
      toggleIsolate,
      setIsolateMode,
      setConflictCursorId,
      toggleSnapToGrid,
      requestSelectActivity,
    ],
  );
}
