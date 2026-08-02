import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_FLOAT_PATHS,
  MAX_FLOAT_PATHS,
  isPlanNotScheduled,
  isTargetMissing,
  useFloatPaths,
} from '../api/use-float-paths';

import {
  buildFloatPathRows,
  floatPathEmphasisIds,
  type FloatPathsViewModel,
} from './float-path-rows';

import { FLOAT_PATHS_ENABLED } from '@/config/env';
import { effectiveHoursPerDay } from '@/lib/effective-hours-per-day';

export interface UseFloatPathsPanelInput {
  orgSlug: string;
  planId: string;
  activities: readonly ActivitySummary[];
  planCalendarId: string | null;
  calendars: readonly CalendarSummary[];
  /** The workspace's current canvas/Gantt selection — the panel's *suggestion*, never its target. */
  selectedActivityId: string | null;
}

export interface FloatPathsPanelState {
  open: boolean;
  /** The activity the analysis runs into. **Sticky**: it does not follow the selection. */
  targetId: string | null;
  selectedPathIndex: number | null;
  maxPaths: number;
  /** Null until a response arrives — the panel's own states cover loading, empty and failure. */
  model: FloatPathsViewModel | null;
  isPending: boolean;
  isError: boolean;
  /** The plan has never been scheduled (422) — a state to explain, not an error to report. */
  planNotScheduled: boolean;
  /** The sticky target is no longer in the plan (404). */
  targetMissing: boolean;
  /** Exactly the selected path's members. Empty (and identity-stable) when nothing is selected. */
  emphasisIds: ReadonlySet<string>;
  /** True while the analysis is showing fewer paths than exist AND more can be asked for. */
  canShowMore: boolean;
  /**
   * The workspace selection, when it is something the target is **not** already — what the panel's
   * "Use selected activity" affordance offers (CQ-2). Null when nothing is selected or the selection
   * already IS the target, which is what keeps the affordance from offering a no-op.
   */
  suggestedTargetId: string | null;
}

export interface FloatPathsPanelActions {
  openWith: (targetId: string) => void;
  close: () => void;
  setTarget: (targetId: string) => void;
  selectPath: (index: number | null) => void;
  showMore: () => void;
  retry: () => void;
}

export type UseFloatPathsPanelResult = FloatPathsPanelState & FloatPathsPanelActions;

/**
 * The Float paths panel's host state, owned by the plan workspace (audit F4, M2.1).
 *
 * It lives **above** both views rather than inside either, for the ADR-0063 `wbs-band-source`
 * reason: the emphasis id-set is derived exactly once here and handed to the canvas and the Gantt,
 * so the two cannot disagree about which activities are on the path — a disagreement that would be
 * invisible until someone compared a screenshot with a printed programme.
 *
 * The target is **sticky**. It is set when the panel is opened (from the current selection) and by
 * an explicit "Use selected activity", and by nothing else. Following the canvas selection would run
 * a CPM computation on every click, and would silently change the question the planner asked.
 */
export function useFloatPathsPanel({
  orgSlug,
  planId,
  activities,
  planCalendarId,
  calendars,
  selectedActivityId,
}: UseFloatPathsPanelInput): UseFloatPathsPanelResult {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [maxPaths, setMaxPaths] = useState(DEFAULT_FLOAT_PATHS);

  // Switching plan clears everything: a target id from one plan is meaningless in another, and a
  // sticky target that survived the switch would 404 against a plan the planner just opened.
  const previousPlanId = useRef(planId);
  useEffect(() => {
    if (previousPlanId.current === planId) return;
    previousPlanId.current = planId;
    setOpen(false);
    setTargetId(null);
    setSelectedPathIndex(null);
    setMaxPaths(DEFAULT_FLOAT_PATHS);
  }, [planId]);

  const query = useFloatPaths(
    orgSlug,
    planId,
    targetId ?? '',
    maxPaths,
    FLOAT_PATHS_ENABLED && open && targetId !== null,
  );

  // The day factor is the TARGET's (CQ-3 option A): relative float is a difference measured across
  // possibly-different calendars, and the panel renders it on the calendar of the activity the
  // planner asked the question about, disclosing the mix rather than suppressing the number.
  const targetActivity = useMemo(
    () => activities.find((activity) => activity.id === targetId),
    [activities, targetId],
  );
  const targetHoursPerDay = useMemo(
    () =>
      effectiveHoursPerDay([...calendars], {
        activityCalendarId: targetActivity?.calendarId ?? '',
        ...(planCalendarId === null ? {} : { planCalendarId }),
      }),
    [calendars, targetActivity, planCalendarId],
  );

  const model = useMemo<FloatPathsViewModel | null>(() => {
    const data = query.data;
    if (data === undefined) return null;
    return buildFloatPathRows({
      paths: data.paths,
      targetActivityId: data.targetActivityId,
      hasMorePaths: data.hasMorePaths,
      activities,
      planCalendarId,
      targetHoursPerDay,
    });
  }, [query.data, activities, planCalendarId, targetHoursPerDay]);

  // Keyed on the RESPONSE, never on `model` — see `floatPathEmphasisIds`'s docblock. `model` is
  // joined against `activities`, whose reference react-query replaces on every recalculation, so a
  // set memoised on it would re-identify each recalc and churn both views' dim memos.
  const emphasisIds = useMemo(
    () => floatPathEmphasisIds(query.data?.paths, selectedPathIndex),
    [query.data, selectedPathIndex],
  );

  const openWith = useCallback((next: string) => {
    setTargetId(next);
    setSelectedPathIndex(null);
    setMaxPaths(DEFAULT_FLOAT_PATHS);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // The path selection is dropped, so the emphasis cannot outlive the panel that explains it —
    // a dimmed diagram with nothing on screen saying why reads as breakage (WCAG 1.4.1's spirit).
    setSelectedPathIndex(null);
  }, []);

  const setTarget = useCallback((next: string) => {
    setTargetId(next);
    setSelectedPathIndex(null);
    setMaxPaths(DEFAULT_FLOAT_PATHS);
  }, []);

  const showMore = useCallback(() => {
    setMaxPaths(MAX_FLOAT_PATHS);
  }, []);

  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    open,
    targetId,
    selectedPathIndex,
    maxPaths,
    model,
    isPending: query.isPending && query.fetchStatus !== 'idle',
    isError: query.isError,
    planNotScheduled: isPlanNotScheduled(query.error),
    targetMissing: isTargetMissing(query.error),
    emphasisIds,
    canShowMore: (model?.hasMorePaths ?? false) && maxPaths < MAX_FLOAT_PATHS,
    suggestedTargetId:
      selectedActivityId !== null && selectedActivityId !== targetId ? selectedActivityId : null,
    openWith,
    close,
    setTarget,
    selectPath: setSelectedPathIndex,
    showMore,
    retry,
  };
}
