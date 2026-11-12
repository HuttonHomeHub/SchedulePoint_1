import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  FOLLOW_PLAN_LIMIT,
  followLogicDoneSentence,
  followMovingSentence,
  followPlanSentence,
  placedBeforeLogicIn,
} from './follow-logic-offer';
import type { FollowLogicPhase } from './use-follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import type { PlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

/** How long the strip waits for the recalculation after a successful write before it reports done. */
const MOVING_CEILING_MS = 8000;

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
  /** `null` when there is nothing to offer, the pen is not held, or the reader dismissed it. */
  offer: FollowPlanOffer | null;
  /** More bars qualify than the batch route takes in one write: Follow logic is shaded, never chunked. */
  overLimit: boolean;
  /**
   * Follow logic pressed: the strip goes busy. `false` when a press is already being answered, so a
   * second one is not a second write. `subject` and `count` are the sentence's, from the rows the
   * host is about to write.
   */
  start: (subject: string, count: number) => boolean;
  /** The write landed and `command` is its undo step: "Moving …" until the schedule settles, then the confirmation. */
  succeed: (command: Command) => void;
  /** The write failed in a way the planner can see: `sentence` is shown in the strip, with Try again. */
  fail: (sentence: string) => void;
  /** The pen was lost: the shared pen banner owns the message, so the offer goes back to asking. */
  restore: () => void;
  /** Dismiss: gone for this plan, for this session. Nothing is written. */
  dismiss: () => void;
  /** The confirmation's own dismissal (its 15 s are up, or the planner closed it). */
  closeConfirmation: () => void;
  /** An undo or redo is about to run: a held confirmation must not come back with a redo. */
  noteReplay: () => void;
}

interface Held {
  readonly phase: Exclude<FollowLogicPhase, 'idle'>;
  readonly subject: string;
  readonly count: number;
  readonly message: string;
  readonly command: Command | null;
  readonly settledAt: number;
}

/**
 * **A plan with early-placed bars offers to let all of them follow** (placed-bar-follows-link M3,
 * ADR-0216 D6): a standing condition read from the activities, not an event, so unlike
 * `useFollowLogicOffer` it has no snapshot, no undo-step binding while it asks and no announcement
 * (ADR-0132: it reads the same to somebody arriving five minutes later). It is dismissible for the
 * session, **not persisted** — the Arrange offer's rule, and per plan because it is keyed on `planId`.
 *
 * The write is the workspace's one Follow logic write (`followLogicRowsWrite`), so this holds only
 * what the dock shows: the count, and the press's phases, which are the edit offer's (busy while the
 * write and the recalculation run, failed with Try again, a confirmation with Undo). **The press is
 * held in state, not derived**, because the moment the write lands the cache loses the flags and a
 * purely derived offer would read zero and vanish with no confirmation and no Undo.
 *
 * Omitted rather than shaded without the pen (ADR-0082's omit clause): its whole content is an offer
 * to press a pen-gated command.
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
  const [dismissedPlan, setDismissedPlan] = useState<string | null>(null);
  const movingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useCallback((): void => {
    if (movingTimerRef.current !== null) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = null;
  }, []);
  useEffect(() => clearTimer, [clearTimer]);

  const targets = useMemo(() => placedBeforeLogicIn(activities ?? []), [activities]);

  const finish = useCallback((): void => {
    const current = heldRef.current;
    if (current === null || current.phase !== 'moving') return;
    clearTimer();
    setHeld({
      ...current,
      phase: 'done',
      message: followLogicDoneSentence(current.subject, current.count),
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
    (subject: string, count: number): boolean => {
      const current = heldRef.current;
      if (current !== null && (current.phase === 'busy' || current.phase === 'moving'))
        return false;
      setHeld({
        phase: 'busy',
        subject,
        count,
        message: followMovingSentence(subject, count),
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
    setDismissedPlan(paramsRef.current.planId);
  }, []);

  const closeConfirmation = useCallback((): void => {
    clearTimer();
    setHeld(null);
  }, [clearTimer, setHeld]);

  const noteReplay = useCallback((): void => {
    clearTimer();
    setHeld(null);
  }, [clearTimer, setHeld]);

  const offer = useMemo((): FollowPlanOffer | null => {
    if (!enabled) return null;
    if (held !== null) {
      // A step that is no longer on top means something else has happened since: withdrawn.
      if (held.command !== null && !history.isTop(held.command)) return null;
      return {
        count: held.count,
        phase: held.phase,
        message: held.message,
        undoable: held.phase === 'done',
      };
    }
    if (dismissedPlan === planId || targets.length === 0) return null;
    return {
      count: targets.length,
      phase: 'idle',
      message: followPlanSentence(targets.length),
      undoable: false,
    };
  }, [enabled, held, history, dismissedPlan, planId, targets]);

  return useMemo(
    () => ({
      offer,
      overLimit: targets.length > FOLLOW_PLAN_LIMIT,
      start,
      succeed,
      fail,
      restore,
      dismiss,
      closeConfirmation,
      noteReplay,
    }),
    [offer, targets, start, succeed, fail, restore, dismiss, closeConfirmation, noteReplay],
  );
}
