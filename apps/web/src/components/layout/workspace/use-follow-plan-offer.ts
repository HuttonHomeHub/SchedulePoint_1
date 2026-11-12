import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  FOLLOW_PLAN_LIMIT,
  MOVING_CEILING_MS,
  followLogicDoneSentence,
  followMovingSentence,
  followPlanSentence,
  placedBeforeLogicIn,
} from './follow-logic-offer';
import type { FollowLogicPhase } from './use-follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import type { PlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

/** What the dock offers for the whole plan: every placed bar that sits before its logic. */
export interface FollowPlanOffer {
  readonly count: number;
  readonly phase: FollowLogicPhase;
  /** The sentence the dock shows NOW (the count, the busy line, the failure, or the confirmation). */
  readonly message: string;
  /** True once the bars have moved: the confirmation carries the Undo for the step the write recorded. */
  readonly undoable: boolean;
}

export interface FollowPlanOfferState {
  /** `null` when there is nothing to offer, the pen is not held, or the reader dismissed every counted bar. */
  offer: FollowPlanOffer | null;
  /** More bars qualify than the batch route takes in one write: Follow logic is shaded, never chunked. */
  overLimit: boolean;
  /**
   * The bars a press would move, from `rows` read NOW: eligible and not dismissed. The host reads the
   * rows at press time (the freshest versions the cache holds), so the offer itself depends only on the
   * count and does not change identity on every refetch.
   */
  select: <T extends ActivitySummary>(rows: readonly T[]) => T[];
  /**
   * Follow logic pressed over `ids`: the strip goes busy. `false` when a press is already being
   * answered, so a second one is not a second write. `subject` is the sentence's first name.
   */
  start: (subject: string, ids: readonly string[]) => boolean;
  /** The write landed and `command` is its undo step: "Moving …" until the schedule settles, then the confirmation. */
  succeed: (command: Command) => void;
  /** The write failed in a way the planner can see: `sentence` is shown in the strip, with Try again. */
  fail: (sentence: string) => void;
  /**
   * The pen was lost: the shared pen banner owns the message, so the offer goes back to asking. (A
   * failure was already announced by `fail`; this says nothing more.)
   */
  restore: () => void;
  /**
   * Dismiss: every bar counted now stops being offered, for this plan this session. Works in any
   * phase but a press in flight, so a failed offer can be put away. Nothing is written.
   */
  dismiss: () => void;
  /** "Keep it here" on the edit offer: only the bars that offer was about stop being offered. */
  dismissBars: (ids: readonly string[]) => void;
  /** The confirmation's own dismissal (its 15 s are up, or the planner closed it). */
  closeConfirmation: () => void;
  /**
   * An undo or redo is about to run. A held confirmation must not come back with a redo; and when the
   * step about to be undone is THIS offer's, the bars it moved are not asked about again (the planner
   * just took them back). A failure was already announced when it happened, so nothing is said here.
   */
  noteReplay: () => void;
}

interface Held {
  readonly phase: Exclude<FollowLogicPhase, 'idle'>;
  readonly subject: string;
  readonly ids: readonly string[];
  readonly message: string;
  readonly command: Command | null;
  readonly settledAt: number;
}

type Dismissed = ReadonlyMap<string, ReadonlySet<string>>;
const NONE: ReadonlySet<string> = new Set();

/**
 * **A plan with early-placed bars offers to let all of them follow** (placed-bar-follows-link M3,
 * ADR-0216 D6): a standing condition read from the activities, not an event, so unlike
 * `useFollowLogicOffer` it has no snapshot, no undo-step binding while it asks and no announcement
 * (ADR-0132: it reads the same to somebody arriving five minutes later).
 *
 * **Dismissal is per bar, per session, in memory.** Dismiss puts every bar counted into a set kept
 * under the plan's id, so switching plans and back does not ask again; Keep it here on an edit offer
 * adds only the bars that offer named; undoing this offer's own step adds the bars it moved. The offer
 * therefore returns only when a bar nobody has put away becomes eligible. It is not persisted, so a
 * reload asks again (ADR-0216, a known trade-off: a per-device memory is the owner's call).
 *
 * The write is the workspace's one Follow logic write (`followLogicRowsWrite`), so this holds only
 * what the dock shows: the count, and the press's phases, which are the edit offer's. **The press is
 * held in state, not derived**, because the moment the write lands the cache loses the flags and a
 * purely derived offer would read zero and vanish with no confirmation and no Undo.
 *
 * Omitted rather than shaded without the pen (ADR-0082's omit clause).
 */
export function useFollowPlanOffer(params: {
  enabled: boolean;
  planId: string;
  /** The live activities list. */
  activities: readonly ActivitySummary[] | undefined;
  /** `usePlanAutoRecalc.settled`: counts recalculations that have landed. */
  settled: number;
  pendingEdits: number;
  history: PlanEditHistory;
  announce: (message: string) => void;
}): FollowPlanOfferState {
  const { enabled, planId, activities, settled, pendingEdits, history } = params;
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });
  const [held, setHeldState] = useState<Held | null>(null);
  const heldRef = useRef<Held | null>(null);
  const setHeld = useCallback((next: Held | null): void => {
    heldRef.current = next;
    setHeldState(next);
  }, []);
  const [dismissedByPlan, setDismissedByPlan] = useState<Dismissed>(new Map());
  const dismissedRef = useRef<Dismissed>(dismissedByPlan);
  const dismissedHere = dismissedByPlan.get(planId) ?? NONE;
  const movingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback((): void => {
    if (movingTimerRef.current !== null) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  // A held press belongs to the plan it was made in.
  const [heldPlan, setHeldPlan] = useState(planId);
  if (heldPlan !== planId) {
    setHeldPlan(planId);
    setHeldState(null);
  }
  useEffect(() => {
    heldRef.current = null;
    clearTimer();
  }, [planId, clearTimer]);

  const addDismissed = useCallback((ids: readonly string[]): void => {
    if (ids.length === 0) return;
    const plan = paramsRef.current.planId;
    const next = new Map(dismissedRef.current);
    next.set(plan, new Set([...(next.get(plan) ?? NONE), ...ids]));
    dismissedRef.current = next;
    setDismissedByPlan(next);
  }, []);

  const targets = useMemo(
    () => placedBeforeLogicIn(activities ?? []).filter((row) => !dismissedHere.has(row.id)),
    [activities, dismissedHere],
  );
  const count = targets.length;
  const targetIdsRef = useRef<readonly string[]>([]);
  useEffect(() => {
    targetIdsRef.current = targets.map((row) => row.id);
  });

  const select = useCallback(<T extends ActivitySummary>(rows: readonly T[]): T[] => {
    const away = dismissedRef.current.get(paramsRef.current.planId) ?? NONE;
    return placedBeforeLogicIn(rows).filter((row) => !away.has(row.id));
  }, []);

  const finish = useCallback((): void => {
    const current = heldRef.current;
    if (current === null || current.phase !== 'moving') return;
    clearTimer();
    setHeld({
      ...current,
      phase: 'done',
      message: followLogicDoneSentence(current.subject, current.ids.length),
    });
  }, [clearTimer, setHeld]);

  // The recalculation Follow logic asked for has landed: the bars have moved.
  const movingSince = held?.phase === 'moving' ? held.settledAt : null;
  useEffect(() => {
    if (movingSince !== null && settled > movingSince && pendingEdits === 0) finish();
  }, [movingSince, settled, pendingEdits, finish]);

  // Without the pen the offer is withdrawn, not shaded; the state goes during render so it cannot
  // flash back for a frame when the pen returns.
  if (!enabled && held !== null) setHeldState(null);
  useEffect(() => {
    if (enabled) return;
    heldRef.current = null;
    clearTimer();
  }, [enabled, clearTimer]);

  const start = useCallback(
    (subject: string, ids: readonly string[]): boolean => {
      const current = heldRef.current;
      if (current !== null && (current.phase === 'busy' || current.phase === 'moving'))
        return false;
      setHeld({
        phase: 'busy',
        subject,
        ids,
        message: followMovingSentence(subject, ids.length),
        command: null,
        settledAt: paramsRef.current.settled,
      });
      return true;
    },
    [setHeld],
  );

  const succeed = useCallback(
    (command: Command): void => {
      const current = heldRef.current;
      if (current === null) return;
      setHeld({ ...current, phase: 'moving', command, settledAt: paramsRef.current.settled });
      // A recalculation that never settles must not leave "Moving…" up for ever.
      clearTimer();
      movingTimerRef.current = setTimeout(finish, MOVING_CEILING_MS);
    },
    [clearTimer, finish, setHeld],
  );

  const fail = useCallback(
    (sentence: string): void => {
      const current = heldRef.current;
      if (current === null) return;
      setHeld({ ...current, phase: 'failed', message: sentence });
      paramsRef.current.announce(sentence);
    },
    [setHeld],
  );

  const restore = useCallback((): void => {
    clearTimer();
    setHeld(null);
  }, [clearTimer, setHeld]);

  const dismiss = useCallback((): void => {
    const current = heldRef.current;
    if (current !== null && (current.phase === 'busy' || current.phase === 'moving')) return;
    clearTimer();
    setHeld(null);
    addDismissed(targetIdsRef.current);
  }, [addDismissed, clearTimer, setHeld]);

  const closeConfirmation = useCallback((): void => {
    clearTimer();
    setHeld(null);
  }, [clearTimer, setHeld]);

  const noteReplay = useCallback((): void => {
    const current = heldRef.current;
    if (
      current !== null &&
      current.command !== null &&
      paramsRef.current.history.peekUndo() === current.command
    ) {
      addDismissed(current.ids);
    }
    clearTimer();
    setHeld(null);
  }, [addDismissed, clearTimer, setHeld]);

  // Depends on the COUNT, not the rows: a refetch that changes nothing the strip says must not hand
  // the dock a new offer. The host reads the rows at press time (`select`).
  const offer = useMemo((): FollowPlanOffer | null => {
    if (!enabled) return null;
    if (held !== null) {
      // A step that is no longer on top means something else has happened since: withdrawn.
      if (held.command !== null && !history.isTop(held.command)) return null;
      return {
        count: held.ids.length,
        phase: held.phase,
        message: held.message,
        undoable: held.phase === 'done',
      };
    }
    if (count === 0) return null;
    return { count, phase: 'idle', message: followPlanSentence(count), undoable: false };
  }, [enabled, held, history, count]);

  return useMemo(
    () => ({
      offer,
      overLimit: count > FOLLOW_PLAN_LIMIT,
      select,
      start,
      succeed,
      fail,
      restore,
      dismiss,
      dismissBars: addDismissed,
      closeConfirmation,
      noteReplay,
    }),
    [
      offer,
      count,
      select,
      start,
      succeed,
      fail,
      restore,
      dismiss,
      addDismissed,
      closeConfirmation,
      noteReplay,
    ],
  );
}
