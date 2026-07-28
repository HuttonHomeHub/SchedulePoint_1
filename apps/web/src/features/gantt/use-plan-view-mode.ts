import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

import { DEFAULT_PLAN_VIEW_MODE, parsePlanViewMode, type PlanViewMode } from './view-mode';

import { GANTT_VIEW_ENABLED } from '@/config/env';

/**
 * The plan workspace's current view, backed by `?view=` (ADR-0059 §3).
 *
 * **Flag-off it is hard-wired to the TSLD.** The check lives here rather than at each call site so
 * a `?view=gantt` URL — pasted from a flag-on colleague, or left in a bookmark after a rollback —
 * cannot reach a surface that is not built on this deployment. That is the rollback contract: with
 * the flag off the workspace is byte-for-byte today's, whatever the URL says.
 *
 * Unlike {@link useUrlFilterState}, switching view **pushes** a history entry instead of replacing
 * one. A filter changes per keystroke and must not bury the previous page under thirty entries; a
 * view switch is one deliberate act, and a planner who hits Back after looking at the Gantt means
 * "put the diagram back", not "leave the plan".
 */
export function usePlanViewMode(): [PlanViewMode, (next: PlanViewMode) => void] {
  const raw: Record<string, unknown> = useSearch({ strict: false });
  const navigate = useNavigate();

  const view = useMemo(
    () => (GANTT_VIEW_ENABLED ? parsePlanViewMode(raw.view) : DEFAULT_PLAN_VIEW_MODE),
    [raw.view],
  );

  const setView = useCallback(
    (next: PlanViewMode): void => {
      if (!GANTT_VIEW_ENABLED) return;
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
