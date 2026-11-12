import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  followEditSentence,
  followKeptSentence,
  followLogicDoneSentence,
  followMovingSentence,
  followSnapshotOf,
  strandedBy,
  type FollowSnapshot,
} from './follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import type { PlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

const RETRY_MS = 250;
const MAX_RETRIES = 40;
/** How long the strip waits for the recalculation after a successful write before it reports done. */
const MOVING_CEILING_MS = 8000;

/**
 * Where the offer is in its life.
 *
 * - `idle`: asking. `busy`: the write is in flight. `moving`: written, and the recalculation that
 *   moves the bars has not settled. `failed`: the write was refused or broke, and the strip says so
 *   and offers to try again. `done`: the bars have moved; the dock shows the confirmation with Undo.
 */
export type FollowLogicPhase = 'idle' | 'busy' | 'moving' | 'failed' | 'done';

/** What the dock offers after an edit left a bar you placed before its logic allows. */
export interface FollowLogicOffer {
  /** The stranded bars, in the diagram's order. Never a summary. */
  readonly ids: readonly string[];
  readonly subject: string;
  readonly count: number;
  readonly phase: FollowLogicPhase;
  /** False for a confirmation that wrote nothing (no bar was still stranded): it carries no Undo. */
  readonly undoable: boolean;
  /** The sentence the dock shows NOW (the ask, the busy line, the failure, or the confirmation). */
  readonly message: string;
  /** The undo step this offer is about; the offer is withdrawn once it is no longer on top. */
  readonly command: Command;
}

export interface FollowLogicOfferState {
  /**
   * Take the "before" snapshot for a planner's edit. Call it BEFORE the write, beside the layout
   * snapshot (`beginLayoutEdit` fans out to both): a snapshot taken after would already contain the
   * flag the edit raised and the bar would read as one that was always early.
   *
   * A burst of edits before the schedule settles keeps the FIRST snapshot, so one offer covers the
   * burst, bound to the step on top when it settles. A snapshot a settle has already passed over is
   * dropped instead (see `settled`), because a later diff against it would describe two edits.
   */
  begin: () => void;
  /** An undo or redo is about to run: drop the snapshot and withdraw the offer (spec, "Undo / redo replays"). */
  noteReplay: () => void;
  /** The settle's decision, called by `useAutoResolveOverlaps` once its own step is recorded. */
  evaluate: () => void;
  offer: FollowLogicOffer | null;
  /** Announce the offer's sentence once, when the strip is actually on screen (a hidden offer says nothing). */
  announceShown: () => void;
  /** Follow logic pressed: the strip goes busy and hands back the bars. `null` when it cannot start. */
  start: () => readonly string[] | null;
  /** The write landed and `command` is its undo step: the strip stays up as "Moving…" until the schedule settles. */
  succeed: (command: Command) => void;
  /** The write failed in a way the planner can see: `sentence` is shown in the strip, with Try again. */
  fail: (sentence: string) => void;
  /** No bar was still stranded when Try again was pressed: say so in the strip, with no Undo, since nothing was written. */
  settleNothing: (sentence: string) => void;
  /** The pen was lost: the shared pen banner owns the message, so the offer goes back to asking. */
  restore: () => void;
  /** "Keep it here": the offer goes, says so, and nothing is written. */
  keep: () => void;
  /** The confirmation is dismissed (or its 15 s are up), or the offer is withdrawn by something else. */
  dismiss: () => void;
}

/**
 * **A bar you placed stays put, and an edit that leaves it behind offers to let it follow**
 * (placed-bar-follows-link M2, ADR-0216 D2 and D4).
 *
 * The trigger is the consequence and not the gesture: when a planner's edit settles with a placed,
 * non-summary bar **newly** flagged `EARLIER_THAN_LOGIC` (see `strandedBy`), the offer is raised and
 * bound to the undo step on top. It has **no timer** while it asks — the `LayoutResolvedStrip`
 * precedent, not the 15 s `HistoryResultStrip` one — and it is withdrawn when anything else is on
 * top (a later edit, an undo, a redo), when the pen goes, or when it is pressed. A consumed offer
 * does not come back when an undo puts its step on top again: pressing it clears the state, it is
 * not only derived from the stack.
 *
 * **Pressing Follow logic does not consume the offer; the write's outcome does** (UX review, B1 and
 * B2). The strip stays up while the write and the recalculation run, says "Moving …", and ignores
 * further presses; on a failure it stays and says why, with Try again; only success replaces it with
 * the confirmation. An offer consumed before the write would have left a planner who pressed it
 * with no sign that nothing happened.
 *
 * **The sentence is announced when the strip is first on screen**, not when the offer is raised: a
 * higher-ranked strip can be showing at the settle, and announcing something nobody can see is the
 * mirror of the silence this exists to end (ADR-0132; `FollowLogicStrip` calls `announceShown`).
 *
 * The pending snapshot is kept until the schedule has settled and nothing is owed or in flight, for
 * the reason `useAutoResolveOverlaps` states: the flag does not exist until the engine has dated the
 * plan, and a cache holding half an edit would raise an offer about a picture that never existed.
 */
export function useFollowLogicOffer(params: {
  enabled: boolean;
  /** `usePlanAutoRecalc.settled`: counts recalculations that have landed. */
  settled: number;
  pendingEdits: number;
  isWriting: () => boolean;
  readActivities: () => readonly ActivitySummary[] | undefined;
  history: PlanEditHistory;
  announce: (message: string) => void;
}): FollowLogicOfferState {
  const pendingRef = useRef<{ snapshot: FollowSnapshot; settledAt: number } | null>(null);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });
  const [offer, setOfferState] = useState<FollowLogicOffer | null>(null);
  // The latest offer, for the callbacks that run outside a render (a settle, a timer).
  const offerRef = useRef<FollowLogicOffer | null>(null);
  const announcedRef = useRef<Command | null>(null);
  const setOffer = useCallback((next: FollowLogicOffer | null): void => {
    offerRef.current = next;
    setOfferState(next);
  }, []);

  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = useCallback((): void => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    if (movingTimerRef.current !== null) clearTimeout(movingTimerRef.current);
    retryTimerRef.current = null;
    movingTimerRef.current = null;
  }, []);
  // No stray look-again or confirmation after the workspace is left.
  useEffect(() => clearTimers, [clearTimers]);

  const begin = useCallback((): void => {
    const { enabled, readActivities, settled } = paramsRef.current;
    if (!enabled) return;
    // A later edit ends whatever the last one left up, except the write Follow logic itself is making
    // (which calls this too). Without it a moving, failed or confirmed offer stays in state bound to
    // its step, and an undo of the later edit puts that step back on top and the stale strip with it.
    const shown = offerRef.current;
    if (shown !== null && shown.phase !== 'busy') {
      clearTimers();
      setOffer(null);
    }
    const held = pendingRef.current;
    // A snapshot a settle has passed over was never decided (a skipped resolution, a read that came
    // back empty): diffing a later settle against it would offer bars for two edits.
    if (held !== null && held.settledAt === settled) return;
    pendingRef.current = { snapshot: followSnapshotOf(readActivities() ?? []), settledAt: settled };
  }, [clearTimers, setOffer]);

  const noteReplay = useCallback((): void => {
    pendingRef.current = null;
    clearTimers();
    setOffer(null);
  }, [clearTimers, setOffer]);

  const finish = useCallback((): void => {
    const held = offerRef.current;
    if (held === null || held.phase !== 'moving') return;
    if (movingTimerRef.current !== null) clearTimeout(movingTimerRef.current);
    movingTimerRef.current = null;
    setOffer({
      ...held,
      phase: 'done',
      message: followLogicDoneSentence(held.subject, held.count),
    });
  }, [setOffer]);

  const evaluateRef = useRef<() => void>(() => undefined);
  const evaluate = useCallback((): void => {
    const pending = pendingRef.current;
    const moving = offerRef.current?.phase === 'moving';
    if (pending === null && !moving) return;
    const { enabled, pendingEdits, isWriting, readActivities, history } = paramsRef.current;
    if (!enabled) {
      // The pen went between the edit and the settle: no offer (spec §3).
      pendingRef.current = null;
      return;
    }
    // An edit is owed: its settle is coming and decides, against a whole picture.
    if (pendingEdits > 0) return;
    // A write is in flight — the next edit, whose settle will come, or one that never settles, like
    // the pen's heartbeat — so look again shortly (the `useAutoResolveOverlaps` rule), and give up
    // after ten seconds rather than read a cache that may hold half an edit. Giving up drops the
    // snapshot: it can no longer be diffed against a settled picture.
    if (isWriting()) {
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => evaluateRef.current(), RETRY_MS);
      } else {
        retriesRef.current = 0;
        pendingRef.current = null;
      }
      return;
    }
    retriesRef.current = 0;
    // The recalculation Follow logic asked for has landed: the bars have moved.
    finish();
    if (pending === null) return;
    const rows = readActivities();
    if (rows === undefined) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = null;
    const ids = strandedBy(pending.snapshot, rows);
    const command = history.peekUndo();
    const first = ids[0] === undefined ? undefined : rows.find((row) => row.id === ids[0]);
    // An edit that recorded no step has nothing to bind to, and an offer bound to nothing would
    // outlive the edit it describes (the ADR-0064 §7 defect).
    if (first === undefined || command === undefined) return;
    setOffer({
      ids,
      subject: first.name,
      count: ids.length,
      phase: 'idle',
      undoable: true,
      message: followEditSentence(first.name, ids.length),
      command,
    });
  }, [finish, setOffer]);

  useEffect(() => {
    evaluateRef.current = evaluate;
  }, [evaluate]);

  // Without the pen the offer's whole content is a pen-gated offer, so it is withdrawn rather than
  // shaded (ADR-0082's omit clause, the Arrange offer's rule); a held snapshot goes with it. The
  // state is cleared during render, not in an effect, so the offer cannot reappear for a frame when
  // the pen comes back, and the snapshot (a ref) is dropped in the effect.
  const { enabled, history } = params;
  if (!enabled && offer !== null) setOfferState(null);
  useEffect(() => {
    if (enabled) return;
    pendingRef.current = null;
    offerRef.current = null;
  }, [enabled]);

  // Bound to ONE step, derived on render: the history object's identity changes whenever its top does.
  const current = offer !== null && enabled && history.isTop(offer.command) ? offer : null;

  const announceShown = useCallback((): void => {
    const held = offerRef.current;
    if (held === null || held.phase !== 'idle' || announcedRef.current === held.command) return;
    announcedRef.current = held.command;
    paramsRef.current.announce(held.message);
  }, []);

  const start = useCallback((): readonly string[] | null => {
    const held = offerRef.current;
    if (held === null || (held.phase !== 'idle' && held.phase !== 'failed')) return null;
    setOffer({ ...held, phase: 'busy', message: followMovingSentence(held.subject, held.count) });
    return held.ids;
  }, [setOffer]);

  const succeed = useCallback(
    (command: Command): void => {
      const held = offerRef.current;
      if (held === null) return;
      setOffer({ ...held, phase: 'moving', command });
      // A recalculation that never settles must not leave "Moving…" up for ever.
      if (movingTimerRef.current !== null) clearTimeout(movingTimerRef.current);
      movingTimerRef.current = setTimeout(finish, MOVING_CEILING_MS);
    },
    [finish, setOffer],
  );

  const fail = useCallback(
    (sentence: string): void => {
      const held = offerRef.current;
      if (held === null) return;
      setOffer({ ...held, phase: 'failed', message: sentence });
      paramsRef.current.announce(sentence);
    },
    [setOffer],
  );

  const settleNothing = useCallback(
    (sentence: string): void => {
      const held = offerRef.current;
      if (held === null) return;
      setOffer({ ...held, phase: 'done', undoable: false, message: sentence });
      paramsRef.current.announce(sentence);
    },
    [setOffer],
  );

  const restore = useCallback((): void => {
    const held = offerRef.current;
    if (held === null) return;
    setOffer({ ...held, phase: 'idle', message: followEditSentence(held.subject, held.count) });
  }, [setOffer]);

  const keep = useCallback((): void => {
    const held = offerRef.current;
    setOffer(null);
    if (held !== null) paramsRef.current.announce(followKeptSentence(held.subject, held.count));
  }, [setOffer]);

  const dismiss = useCallback((): void => {
    clearTimers();
    setOffer(null);
  }, [clearTimers, setOffer]);

  return useMemo(
    () => ({
      begin,
      noteReplay,
      evaluate,
      offer: current,
      announceShown,
      start,
      succeed,
      fail,
      settleNothing,
      restore,
      keep,
      dismiss,
    }),
    [
      begin,
      noteReplay,
      evaluate,
      current,
      announceShown,
      start,
      succeed,
      fail,
      settleNothing,
      restore,
      keep,
      dismiss,
    ],
  );
}
