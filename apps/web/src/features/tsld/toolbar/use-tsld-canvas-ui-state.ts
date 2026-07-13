import type { ActivityType } from '@repo/types';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { TsldCanvasHandle } from '../components/TsldCanvas';
import type { EditMode } from '../interaction/gesture-machine';
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
}

export function useTsldCanvasUiState(): TsldCanvasUiState {
  const [mode, setMode] = useState<EditMode>('select');
  const [viewToggles, setViewToggles] = useState<TsldViewToggles>(DEFAULT_VIEW_TOGGLES);
  const [zoomPreset, setZoomPreset] = useState<ZoomLevel>('week');
  const [fitSignal, setFitSignal] = useState(0);
  const [autoArrangeSignal, setAutoArrangeSignal] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [createType, setCreateType] = useState<ActivityType>('TASK');
  const canvasControlRef = useRef<TsldCanvasHandle>(null);

  const toggleView = useCallback(
    (key: keyof TsldViewToggles): void => setViewToggles((v) => ({ ...v, [key]: !v[key] })),
    [],
  );
  const requestFit = useCallback((): void => setFitSignal((n) => n + 1), []);
  const requestAutoArrange = useCallback((): void => setAutoArrangeSignal((n) => n + 1), []);

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
    ],
  );
}
