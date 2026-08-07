import { useMemo } from 'react';

import type { TsldToolbarContext } from '../tsld-toolbar-context';

import { CANVAS_NAV_ENABLED } from '@/config/env';
import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import { nextConflictIndex, orderedConflicts } from '@/features/tsld/render/conflicts';

/**
 * Next-conflict navigation (ADR-0078 S11, `VITE_CANVAS_NAV`).
 *
 * Extracted from `use-tsld-toolbar-context.tsx` verbatim. This is one of the **two** readers of
 * `canvasControlRef` that `docs/TECH_DEBT.md` #85 named — the other is the export commands' image
 * builder — and moving them out of the ~500-line context memo is the whole point of the step: the
 * register's own instruction was _"the fix is to split this memo, not to move the ref reads"_.
 *
 * The `react-hooks/refs` suppression that used to sit on the returned `goToNextConflict` is gone,
 * and its absence is the step's success test: `pnpm lint` staying green here means the ref read
 * genuinely left the oversized memo rather than being silenced in place. If a future change puts
 * it back, the split has been undone.
 *
 * The ref is still read inside a **callback** — it runs on a Next-conflict click, never during
 * render — which is what the rule was protecting all along. What changed is the compiler's ability
 * to see that, not the code's behaviour.
 */

/** A stable empty list, so the flag-off path allocates nothing per render. */
const EMPTY_CONFLICTS: ReturnType<typeof orderedConflicts> = [];

export interface ConflictNavigation {
  /** The plan's flagged activities in stable order (CQ-2). */
  readonly orderedConflictHits: ReturnType<typeof orderedConflicts>;
  /** The readout the visible Next-conflict status chip renders (U2); null while it is hidden. */
  readonly currentConflict: TsldToolbarContext['currentConflict'];
  /** Advance the cursor, centre + select the hit, and announce it. */
  readonly goToNextConflict: () => void;
}

export function useConflictNavigation(args: {
  // Derived from the consumer rather than named: `orderedConflicts` is the only thing that
  // constrains the shape, so taking its parameter type cannot drift from it.
  activities: Parameters<typeof orderedConflicts>[0];
  isolateActive: boolean;
  conflictCursorId: string | null;
  setConflictCursorId: (id: string) => void;
  canvasControlRef: React.RefObject<TsldCanvasHandle | null>;
  requestSelectActivity: (id: string) => void;
  announce: (message: string) => void;
}): ConflictNavigation {
  const {
    activities,
    isolateActive,
    conflictCursorId,
    setConflictCursorId,
    canvasControlRef,
    requestSelectActivity,
    announce,
  } = args;

  // Memoised on the activities only so it never rebuilds per render. Gated on the flag (P-sug1):
  // flag-off ⇒ the stable empty list, so `orderedConflicts` never runs and everything downstream
  // degrades to zero/null — matching the flag's "flag-off ⇒ zero cost" contract.
  const orderedConflictHits = useMemo(
    () => (CANVAS_NAV_ENABLED ? orderedConflicts(activities) : EMPTY_CONFLICTS),
    [activities],
  );

  // Null (chip hidden) until the user starts cycling (no cursor), while isolating, when the
  // cursor's activity is no longer flagged, when there are none, or flag-off (the ordered set is
  // then empty). Kept in step with the polite announcement `goToNextConflict` speaks.
  const currentConflict = useMemo<TsldToolbarContext['currentConflict']>(() => {
    if (isolateActive || conflictCursorId === null) return null;
    const index = orderedConflictHits.findIndex((h) => h.id === conflictCursorId);
    if (index === -1) return null;
    const hit = orderedConflictHits[index];
    if (!hit) return null;
    return {
      index: index + 1,
      total: orderedConflictHits.length,
      name: hit.name,
      reasons: hit.reasons,
    };
  }, [isolateActive, conflictCursorId, orderedConflictHits]);

  const goToNextConflict = useMemo(
    () => (): void => {
      if (orderedConflictHits.length === 0) return;
      const index = nextConflictIndex(conflictCursorId, orderedConflictHits);
      const hit = orderedConflictHits[index];
      if (!hit) return;
      setConflictCursorId(hit.id);
      // Centre the flagged bar (a small centred variant of `goToDate`), then lift the selection to it —
      // the canvas rings it; the reveal-on-select pan is then a no-op since it is already centred.
      const activity = activities.find((a) => a.id === hit.id);
      if (activity?.earlyStart) canvasControlRef.current?.centerOnDate(activity.earlyStart);
      requestSelectActivity(hit.id);
      announce(
        `Conflict ${index + 1} of ${orderedConflictHits.length}: ${hit.name} — ${hit.reasons.join(', ')}.`,
      );
    },
    [
      orderedConflictHits,
      conflictCursorId,
      setConflictCursorId,
      activities,
      canvasControlRef,
      requestSelectActivity,
      announce,
    ],
  );

  return { orderedConflictHits, currentConflict, goToNextConflict };
}
