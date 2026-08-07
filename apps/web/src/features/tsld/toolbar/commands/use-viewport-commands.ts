import { useCallback } from 'react';

import type { TsldToolbarContext } from '../tsld-toolbar-context';

import { useAnnounce } from '@/components/ui/announcer';
import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * The three imperative canvas VIEWPORT commands (ADR-0078 S11).
 *
 * Extracted from `use-tsld-toolbar-context.tsx` verbatim, and the reason is worth recording because
 * it is evidence for `docs/TECH_DEBT.md` #85's own diagnosis rather than a tidy-up. #85 said the two
 * `react-hooks/refs` suppressions existed because the rule's analysis is **budget-bounded** and the
 * context memo had outgrown it. Lifting the conflict navigation and the export image builder out —
 * about 100 lines between them — freed enough budget that the rule immediately reached **a third**
 * `canvasControlRef` read it had never flagged, here, in code nobody had touched.
 *
 * That is the prediction landing: the suppressions were never about these call sites being wrong,
 * and adding a third would have been the wrong response. All three reads are inside **callbacks** —
 * they run on a toolbar click, never during render — which is what the rule protects. So the fix
 * stays the one #85 named: split the memo until the compiler can see that for itself.
 */
export function useViewportCommands(args: {
  canvasControlRef: React.RefObject<TsldCanvasHandle | null>;
  setCanvasZoomPreset: (level: TsldToolbarContext['zoomPreset']) => void;
  /** The current selection, for `zoomToSelection`. Null when nothing is selected. */
  selectedActivityId: string | null;
  selectedActivityName: string | null;
}): Pick<TsldToolbarContext, 'setZoomPreset' | 'stepZoom' | 'goToDate' | 'zoomToSelection'> {
  const { canvasControlRef, setCanvasZoomPreset, selectedActivityId, selectedActivityName } = args;
  const announce = useAnnounce();

  // The zoom PRESET is shared state, not a canvas property: the Gantt derives its scale from it
  // directly (ADR-0059 §2). So it is set here first and the canvas is commanded second —
  // delegating only to the handle would leave the control enabled and silently inert whenever
  // the canvas is unmounted, which is every moment the Gantt is showing.
  const setZoomPreset = useCallback<TsldToolbarContext['setZoomPreset']>(
    (level) => {
      setCanvasZoomPreset(level);
      canvasControlRef.current?.zoomToPreset(level);
    },
    [setCanvasZoomPreset, canvasControlRef],
  );

  // Stepping, fitting and go-to-date are canvas VIEWPORT commands with no Gantt equivalent (its
  // scale comes from the preset and its chart already spans the plan). `canvasActive` shades
  // them with a reason in the Gantt rather than leaving dead buttons.
  const stepZoom = useCallback<TsldToolbarContext['stepZoom']>(
    (factor) => canvasControlRef.current?.stepZoom(factor),
    [canvasControlRef],
  );

  // Go to date (ADR-0033 M2): a pure view pan via the canvas control handle — no fetch, no write,
  // no persisted state (CQ-1). Available to every role; navigating never mutates the plan. It
  // announces the jump (WCAG 4.1.3) since the canvas repaint is otherwise invisible to AT.
  const goToDate = useCallback<TsldToolbarContext['goToDate']>(
    (iso: string) => {
      canvasControlRef.current?.goToDate(iso);
      announce(`Jumped to ${formatCalendarDate(iso)}.`);
    },
    [canvasControlRef, announce],
  );

  // Zoom to selection (`docs/specs/canvas-search-navigation/` M3): the fourth viewport command, and
  // it lives here for the ADR-0078 §3b reason rather than beside the selection it reads. Composed in
  // the context memo first, it tripped `react-hooks/refs` immediately — the rule's report is a signal
  // to split, not to silence, so the command moved to the module that already owns the handle and the
  // selection comes in as two plain values.
  const zoomToSelection = useCallback<TsldToolbarContext['zoomToSelection']>(() => {
    if (selectedActivityId === null) return;
    const framed = canvasControlRef.current?.zoomToActivity(selectedActivityId) ?? false;
    // Announce only what happened. A bar with no computed dates cannot be framed, and claiming it was
    // would be the lit-but-inert defect moved into the spoken channel.
    announce(
      framed
        ? `Zoomed to ${selectedActivityName ?? 'the selected activity'}.`
        : 'Nothing to zoom to — this activity has no calculated dates.',
    );
  }, [selectedActivityId, selectedActivityName, canvasControlRef, announce]);

  return { setZoomPreset, stepZoom, goToDate, zoomToSelection };
}
