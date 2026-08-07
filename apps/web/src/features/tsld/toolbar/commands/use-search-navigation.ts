import { useCallback, useMemo } from 'react';

import type { TsldToolbarContext } from '../tsld-toolbar-context';

import { CANVAS_SEARCH_NAV_ENABLED } from '@/config/env';
import type { TsldCanvasHandle } from '@/features/tsld/components/TsldCanvas';
import type { FilterAttr } from '@/features/tsld/render/lenses';
import {
  type MatchHit,
  orderedMatches,
  type SearchableActivity,
  stepMatchIndex,
} from '@/features/tsld/render/search-matches';

/**
 * Search that navigates (`docs/specs/canvas-search-navigation/` M1, `VITE_CANVAS_SEARCH_NAV`).
 *
 * Deliberately the same shape as `use-conflict-navigation.ts`, one module along: an ordered list, a
 * cursor, and a jump that centres, selects and announces. The two are the same interaction with
 * different predicates, and a planner who has learnt Next-conflict already knows this. They share
 * the walk (`render/ordering.ts`), so the two cycles cannot disagree about the order of a plan.
 *
 * The ref is read inside the **jump callback** — it runs on Enter, never during render — which is
 * the ADR-0078 §3b rule applied to new code rather than retrofitted: this hook exists as its own
 * module from the start, so no `react-hooks/refs` suppression is ever needed for it.
 */

/** A stable empty list, so the flag-off and inactive-search paths allocate nothing per render. */
const EMPTY_MATCHES: MatchHit[] = [];

export interface SearchNavigation {
  /** The ordered match set, empty when the search is inactive or the flag is off. */
  readonly matchHits: readonly MatchHit[];
  /** The read-out the visible status chip renders; null while it is hidden. */
  readonly searchStatus: TsldToolbarContext['searchStatus'];
  /** Jump to the next / previous match: centre, select, announce. */
  readonly goToMatch: TsldToolbarContext['goToMatch'];
  /** The matched ids as a set — the shape both views consume (M4). Derived from `matchHits`, so it
   *  cannot disagree with what Enter walks. */
  readonly matchedIds: ReadonlySet<string>;
}

export function useSearchNavigation(args: {
  activities: readonly SearchableActivity[];
  filterQuery: string;
  filterAttrs: ReadonlySet<FilterAttr>;
  searchCursorId: string | null;
  setSearchCursorId: (id: string) => void;
  canvasControlRef: React.RefObject<TsldCanvasHandle | null>;
  requestSelectActivity: (id: string, opts?: { focusListbox?: boolean }) => void;
  announce: (message: string) => void;
}): SearchNavigation {
  const {
    activities,
    filterQuery,
    filterAttrs,
    searchCursorId,
    setSearchCursorId,
    canvasControlRef,
    requestSelectActivity,
    announce,
  } = args;

  // Gated on the flag so flag-off `orderedMatches` never runs and everything downstream degrades to
  // an empty list and a null read-out — the flag's "flag-off ⇒ zero cost" contract, and the same
  // gate `useConflictNavigation` puts on `orderedConflicts`.
  const matchHits = useMemo(
    () =>
      CANVAS_SEARCH_NAV_ENABLED
        ? orderedMatches(activities, filterQuery, filterAttrs)
        : EMPTY_MATCHES,
    [activities, filterQuery, filterAttrs],
  );

  // Null (chip hidden) when the search matches nothing to count — which includes an inactive search,
  // because `orderedMatches` returns nothing for one. `index` stays null until the first Enter, so
  // the chip can say "12 matches" before the planner has started walking them and "3 of 12" after.
  const searchStatus = useMemo<TsldToolbarContext['searchStatus']>(() => {
    if (matchHits.length === 0) return null;
    const at = searchCursorId === null ? -1 : matchHits.findIndex((h) => h.id === searchCursorId);
    return { total: matchHits.length, index: at === -1 ? null : at + 1 };
  }, [matchHits, searchCursorId]);

  const goToMatch = useCallback<TsldToolbarContext['goToMatch']>(
    (direction) => {
      if (matchHits.length === 0) return;
      const index = stepMatchIndex(searchCursorId, matchHits, direction === 'next' ? 1 : -1);
      const hit = matchHits[index];
      if (!hit) return;
      setSearchCursorId(hit.id);
      // Centre first, then lift the selection — the same order `goToNextConflict` uses, so the
      // reveal-on-select pan is a no-op because the bar is already centred. An unscheduled activity
      // has no date to centre on: it is still selected and announced, it just does not pan, which is
      // the honest behaviour rather than a jump to an arbitrary day.
      if (hit.earlyStart) canvasControlRef.current?.centerOnDate(hit.earlyStart);
      // `focusListbox: false` — the planner is still in the search field; moving focus out would end
      // the search after one match (M1 AC: focus never moves).
      requestSelectActivity(hit.id, { focusListbox: false });
      announce(`Match ${index + 1} of ${matchHits.length}: ${hit.name}.`);
    },
    [
      matchHits,
      searchCursorId,
      setSearchCursorId,
      canvasControlRef,
      requestSelectActivity,
      announce,
    ],
  );

  const matchedIds = useMemo(() => new Set(matchHits.map((h) => h.id)), [matchHits]);

  return { matchHits, searchStatus, goToMatch, matchedIds };
}
