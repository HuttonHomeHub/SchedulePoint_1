import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  followEditSentence,
  followSnapshotOf,
  strandedBy,
  type FollowSnapshot,
} from './follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import type { PlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';

const RETRY_MS = 250;
const MAX_RETRIES = 40;

/** What the dock offers after an edit left a bar you placed before its logic allows. */
export interface FollowLogicOffer {
  /** The stranded bars, in the diagram's order. Never a summary. */
  readonly ids: readonly string[];
  /** The sentence the dock shows, and the one announced — one source, so they cannot disagree. */
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
   * burst, bound to the step on top when it settles.
   */
  begin: () => void;
  /** An undo or redo is about to run: drop the snapshot and withdraw the offer (spec, "Undo / redo replays"). */
  noteReplay: () => void;
  /** The settle's decision, called by `useAutoResolveOverlaps` once its own step is recorded. */
  evaluate: () => void;
  offer: FollowLogicOffer | null;
  /** Consume the offer and hand back its bars; the caller writes. `null` when there is none. */
  take: () => readonly string[] | null;
  /** "Keep it here": the offer goes and nothing is written. */
  dismiss: () => void;
}

/**
 * **A bar you placed stays put, and an edit that leaves it behind offers to let it follow**
 * (placed-bar-follows-link M2, ADR-0216 D2 and D4).
 *
 * The trigger is the consequence and not the gesture: when a planner's edit settles with a placed,
 * non-summary bar **newly** flagged `EARLIER_THAN_LOGIC` (see `strandedBy`), the offer is raised, the
 * sentence is announced once through the workspace's polite region, and the offer is bound to the
 * undo step on top. It has **no timer** — the `LayoutResolvedStrip` precedent, not the 15 s
 * `HistoryResultStrip` one — and it is withdrawn when anything else is on top (a later edit, an undo,
 * a redo), when the pen goes, or when it is pressed. A consumed offer does not come back when an undo
 * puts its step on top again: pressing it clears the state, it is not only derived from the stack.
 *
 * The pending snapshot is kept until the schedule has settled and nothing is owed or in flight, for
 * the reason `useAutoResolveOverlaps` states: the flag does not exist until the engine has dated the
 * plan, and a cache holding half an edit would raise an offer about a picture that never existed.
 */
export function useFollowLogicOffer(params: {
  enabled: boolean;
  pendingEdits: number;
  isWriting: () => boolean;
  readActivities: () => readonly ActivitySummary[] | undefined;
  history: PlanEditHistory;
  announce: (message: string) => void;
}): FollowLogicOfferState {
  const pendingRef = useRef<FollowSnapshot | null>(null);
  const paramsRef = useRef(params);
  useEffect(() => {
    paramsRef.current = params;
  });
  const [offer, setOffer] = useState<FollowLogicOffer | null>(null);

  const begin = useCallback((): void => {
    const { enabled, readActivities } = paramsRef.current;
    if (!enabled || pendingRef.current !== null) return;
    pendingRef.current = followSnapshotOf(readActivities() ?? []);
  }, []);

  const noteReplay = useCallback((): void => {
    pendingRef.current = null;
    setOffer(null);
  }, []);

  const retriesRef = useRef(0);
  const evaluateRef = useRef<() => void>(() => undefined);
  const evaluate = useCallback((): void => {
    const before = pendingRef.current;
    if (before === null) return;
    const { enabled, pendingEdits, isWriting, readActivities, history, announce } =
      paramsRef.current;
    if (!enabled) {
      // The pen went between the edit and the settle: no offer (spec §3).
      pendingRef.current = null;
      return;
    }
    // An edit is owed: its settle is coming and decides, against a whole picture.
    if (pendingEdits > 0) return;
    // A write is in flight — the next edit, whose settle will come, or one that never settles, like
    // the pen's heartbeat — so look again shortly (the `useAutoResolveOverlaps` rule), and give up
    // after ten seconds rather than read a cache that may hold half an edit.
    if (isWriting()) {
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        setTimeout(() => evaluateRef.current(), RETRY_MS);
      } else {
        retriesRef.current = 0;
      }
      return;
    }
    retriesRef.current = 0;
    const rows = readActivities();
    if (rows === undefined) return;
    pendingRef.current = null;
    const ids = strandedBy(before, rows);
    const command = history.peekUndo();
    const first = ids[0] === undefined ? undefined : rows.find((row) => row.id === ids[0]);
    // An edit that recorded no step has nothing to bind to, and an offer bound to nothing would
    // outlive the edit it describes (the ADR-0064 §7 defect).
    if (first === undefined || command === undefined) return;
    const message = followEditSentence(first.name, ids.length);
    announce(message);
    setOffer({ ids, message, command });
  }, []);

  useEffect(() => {
    evaluateRef.current = evaluate;
  }, [evaluate]);

  // Without the pen the offer's whole content is a pen-gated offer, so it is withdrawn rather than
  // shaded (ADR-0082's omit clause, the Arrange offer's rule); a held snapshot goes with it. The
  // state is cleared during render, not in an effect, so the offer cannot reappear for a frame when
  // the pen comes back, and the snapshot (a ref) is dropped in the effect.
  const { enabled, history } = params;
  if (!enabled && offer !== null) setOffer(null);
  useEffect(() => {
    if (!enabled) pendingRef.current = null;
  }, [enabled]);

  // Bound to ONE step, derived on render: the history object's identity changes whenever its top does.
  const current = offer !== null && enabled && history.isTop(offer.command) ? offer : null;

  const take = useCallback((): readonly string[] | null => {
    if (current === null) return null;
    setOffer(null);
    return current.ids;
  }, [current]);

  const dismiss = useCallback(() => setOffer(null), []);

  return useMemo(
    () => ({ begin, noteReplay, evaluate, offer: current, take, dismiss }),
    [begin, noteReplay, evaluate, current, take, dismiss],
  );
}
