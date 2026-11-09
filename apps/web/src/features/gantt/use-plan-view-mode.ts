import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { DEFAULT_PLAN_VIEW_MODE, parsePlanViewMode, type PlanViewMode } from '@/lib/plan-view-mode';

/**
 * The plan workspace's current view, backed by `?view=` (ADR-0059 §3).
 *
 * An unrecognised `?view=` value degrades to the TSLD (`parsePlanViewMode`), so a hand-edited URL
 * cannot reach a surface that does not exist.
 *
 * Unlike {@link useUrlFilterState}, switching view **pushes** a history entry instead of replacing
 * one. A filter changes per keystroke and must not bury the previous page under thirty entries; a
 * view switch is one deliberate act, and a planner who hits Back after looking at the Gantt means
 * "put the diagram back", not "leave the plan".
 */
export function usePlanViewMode(): [PlanViewMode, (next: PlanViewMode) => void] {
  const raw: Record<string, unknown> = useSearch({ strict: false });
  const navigate = useNavigate();

  const view = useMemo(() => parsePlanViewMode(raw.view), [raw.view]);

  const setView = useCallback(
    (next: PlanViewMode): void => {
      void navigate({
        to: '.',
        search: (prev: Record<string, string | undefined>) => {
          const out = { ...prev };
          // The default is omitted, not serialised, so an untouched plan keeps a clean URL and a
          // shared link never pins a choice the sharer did not make.
          if (next === DEFAULT_PLAN_VIEW_MODE) delete out.view;
          else out.view = next;
          return out;
        },
      });
    },
    [navigate],
  );

  return [view, setView];
}
