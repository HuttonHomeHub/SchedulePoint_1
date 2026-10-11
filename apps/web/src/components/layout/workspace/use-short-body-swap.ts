import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { CANVAS_MIN_HEIGHT, isShortBody } from './use-activity-panel-prefs';

import type { TsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';

/**
 * **The short-body swap** (`docs/specs/short-screen-vertical-budget`, ADR-0180), lifted out of
 * `plan-workspace-toolbar.tsx` (`docs/TECH_DEBT.md` #469): the hysteresis that decides it, the drawing
 * tool it puts away, the quiet collapse a command takes first, and the focus it would otherwise strand.
 *
 * When the body cannot give the panel three rows beside the diagram's minimum, an expanded panel takes
 * the whole body and the diagram row is hidden — `display: none`, still mounted, so the canvas keeps its
 * viewport and selection.
 *
 * **What this hook does not own, deliberately.** `withDiagram` also serves the dock squeeze (a dock so
 * wide it takes the row), `closeAllDocks` and `expandPanel` are dock logic, and `dockSqueezed` and its
 * disarm read the docks — so they stay in the toolbar and consume {@link ShortBodySwap.swapped} and
 * {@link ShortBodySwap.collapseQuietly}. A hook named for the swap that also owned the dock rule would
 * misname both.
 *
 * The two render-phase adjustments below (`wasShort`, `toolPutAway`) must stay render-phase: the swap
 * must not lag the measurement by a frame, and moving either into an effect brings that frame back.
 */
export interface ShortBodySwap {
  /** The panel owns the body and the diagram row is hidden. */
  swapped: boolean;
  /** The panel note's "Drawing tool put away." for this opening; clears when the swap ends. */
  toolPutAway: boolean;
  /** Collapse the panel without taking focus from the control the planner just pressed. */
  collapseQuietly: () => void;
  /** Attach to the panel's box, so the quiet collapse can tell whether focus is inside it. */
  panelBoxRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the panel's collapse button: where stranded focus goes. */
  collapseButtonRef: React.RefObject<HTMLButtonElement | null>;
  /** Focus handlers for the diagram row and the panel's resizer, the two places the swap strands focus. */
  trackFocusIn: () => void;
  trackFocusOut: (event: React.FocusEvent<HTMLElement>) => void;
}

export function useShortBodySwap(params: {
  bodyHeight: number;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  setInteracted: (interacted: boolean) => void;
  canvasUi: Pick<TsldCanvasUiState, 'mode' | 'setMode'>;
  anyRightDockActive: boolean;
}): ShortBodySwap {
  const { bodyHeight, collapsed, setCollapsed, setInteracted, canvasUi, anyRightDockActive } =
    params;

  // `wasShort` is the hysteresis memory; it is adjusted during render (the documented derived-state
  // pattern) because the swap must not lag the measurement by a frame. It uses the canvas reserve
  // alone: an open dock and an expanded panel never coexist on a body this short (`expandPanel` closes
  // the dock, the effect below collapses the panel).
  const [wasShort, setWasShort] = useState(false);
  const short = isShortBody(bodyHeight, CANVAS_MIN_HEIGHT, wasShort);
  if (short !== wasShort) setWasShort(short);
  const swapped = !collapsed && short;

  // Entering the swap puts an armed drawing tool away: a tool armed while the diagram is hidden has
  // no target, and Escape in the table must never have a tool to reach. `canvasUi` is the workspace's
  // own state, and `setMode('select')` is the same disarm `TsldPanel`'s `exitAddMode` makes and a plan
  // switch already makes (`useTsldCanvasUiState`), so the panel's mode effects announce it and release
  // the LOE pick as they do for any other disarm. The flag is the panel note's "Drawing tool put
  // away." for this opening; it clears when the swap ends.
  const [toolPutAway, setToolPutAway] = useState(false);
  if (swapped && !toolPutAway && canvasUi.mode !== 'select') {
    setToolPutAway(true);
    canvasUi.setMode('select');
  } else if (!swapped && toolPutAway) {
    setToolPutAway(false);
  }

  // **Collapse-first for a command that acts on the diagram** (A1, spec §2 "Commands while the
  // diagram is hidden"). Quiet — `interacted` is cleared — so the collapsed bar does not take focus
  // from the toolbar control the planner just pressed. The exception is focus INSIDE the panel (a
  // wrapped command reached from the table's own keys): that control is about to unmount, so the
  // collapsed bar takes it rather than leaving it on <body>. The next animation frame is what lets
  // the un-hidden canvas lay out before the command reads its size; `measure()` ignores the 0 x 0
  // rectangle in between, so the viewport it measured last is still the one the command acts on.
  const panelBoxRef = useRef<HTMLDivElement>(null);
  const collapseQuietly = useCallback(() => {
    setInteracted(panelBoxRef.current?.contains(document.activeElement) ?? false);
    setCollapsed(true);
  }, [setInteracted, setCollapsed]);

  // The other half of "the later request wins": a dock that opens (or survives a live resize) while
  // the diagram is hidden collapses the panel. A layout effect, not a render-time adjustment like
  // `wasShort`, because the quiet collapse reads where focus is (a ref and the DOM); it still runs
  // before paint, so the dock is never invisible for a frame.
  useLayoutEffect(() => {
    if (swapped && anyRightDockActive) collapseQuietly();
  }, [swapped, anyRightDockActive, collapseQuietly]);

  // Focus the swap would strand: inside the diagram row (its docks included) or on the panel's
  // resizer, which is unmounted rather than hidden and so fires no blur of its own. A press of
  // Expand is covered by `focusCollapseOnMount`; a live resize across the threshold is not.
  const focusInHiddenRef = useRef(false);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const trackFocusIn = useCallback(() => {
    focusInHiddenRef.current = true;
  }, []);
  const trackFocusOut = useCallback((event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) focusInHiddenRef.current = false;
  }, []);
  useLayoutEffect(() => {
    if (!swapped || !focusInHiddenRef.current) return;
    focusInHiddenRef.current = false;
    collapseButtonRef.current?.focus();
  }, [swapped]);

  return {
    swapped,
    toolPutAway,
    collapseQuietly,
    panelBoxRef,
    collapseButtonRef,
    trackFocusIn,
    trackFocusOut,
  };
}
