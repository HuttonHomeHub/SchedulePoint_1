import type { PlanEditLockReason, PlanEditLockStatus } from '@repo/types';
import {
  isCancelledError,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { shouldAutoAcquire, shouldRetakeAfterLoss, shouldTakeOnFree } from '../lib/auto-acquire';
import { decideBeat } from '../lib/let-go';
import { classifyLockError } from '../lib/lock-error';

import { useUnsavedWorkRegistry } from '@/components/layout/unsaved-work/unsaved-work-provider';
import { API_BASE_URL } from '@/config/env';
import { apiFetch } from '@/lib/api/client';
import { planLockKeys } from '@/lib/query/hierarchy-keys';
import { hasUnsavedWork } from '@/lib/unsaved-work/report';

export { planLockKeys };

/** Status poll cadence — inside the ≤ 20 s propagation target, half the heartbeat. */
const POLL_MS = 15_000;
/** Holder heartbeat cadence (ADR-0028 config; the server enforces the 120 s TTL). */
const HEARTBEAT_MS = 30_000;
/** Every lock verb's mutation carries this key, so a listener can tell the person's own writes from them. */
const LOCK_MUTATION_KEY = ['plan-lock'] as const;

/**
 * What counts as the person using this tab (ADR-0220 D8, R1). Scroll is not one: the app scrolls
 * itself. `focus` is: a capture listener on `window` sees every element's focus as well as the
 * window's own, which is how a person returns to a window or tabs into a page. The app moves focus
 * only in answer to something that happened (a control removed, a dialog closed), and the timers
 * we found in the workspace redraw text (the pen's one-second relative-time tick) or poll the
 * status, which is paused while the tab rests, so we found nothing that keeps a tab awake by
 * moving focus. Chrome can also dispatch a trusted synthetic `pointermove` after a layout shift
 * under a still cursor; that is accepted and would only postpone the rest.
 */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focus'] as const;

const lockPath = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/edit-lock`;

// --- status query ----------------------------------------------------------

/**
 * `resting` is the tab that has let go for idleness (ADR-0220 D8, R5): while it is set the poll
 * pauses, as it already does in a hidden tab, so the view stays as the person left it. TanStack
 * Query reads a `refetchInterval` function again whenever the query updates (a fetch starting or
 * settling) and when the options change, not on every tick, so the poll stops after the read that
 * is already in flight and restarts with the fetch the wake asks for
 * (`@tanstack/query-core`, `queryObserver.js:460-462` and `queryObserver.js:286-288`).
 */
export function planEditLockQueryOptions(
  orgSlug: string,
  planId: string,
  resting?: RefObject<boolean>,
) {
  return queryOptions({
    queryKey: planLockKeys.status(orgSlug, planId),
    queryFn: () => apiFetch<PlanEditLockStatus>(lockPath(orgSlug, planId)),
    refetchInterval: resting ? () => (resting.current ? false : POLL_MS) : POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0, // lock status is inherently volatile — never serve it stale on mount
  });
}

/** A plan's edit-lock status (who holds the pen + capability flags). */
export function usePlanEditLock(
  orgSlug: string,
  planId: string,
  resting?: RefObject<boolean>,
): UseQueryResult<PlanEditLockStatus> {
  return useQuery(planEditLockQueryOptions(orgSlug, planId, resting));
}

// --- mutations (one per verb) ----------------------------------------------

/** Acquire / renew / take-over the pen. `{ takeover: true }` is honoured per server policy. */
export function useAcquireLock(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: (vars?: { takeover?: boolean }) =>
      apiFetch<PlanEditLockStatus>(lockPath(orgSlug, planId), {
        method: 'POST',
        body: JSON.stringify({ takeover: vars?.takeover ?? false }),
      }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Release the pen (holder), or force-release (override). 204, idempotent. */
export function useReleaseLock(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: () => apiFetch<void>(lockPath(orgSlug, planId), { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Request control of a live lock held by another (peer hand-off, ADR-0028 Q-A). */
export function useRequestControl(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/request`, { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/**
 * Withdraw this person's own pending request (#588). 200 with the status, idempotent: the answer may
 * be "you now hold the pen" (a hand-over got there first) or "someone else's request stands", so the
 * tab takes the status rather than guessing.
 */
export function useCancelRequest(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/request`, { method: 'DELETE' }),
    // A read that left before the DELETE could land after it and put the request back in the cache.
    onMutate: () => queryClient.cancelQueries({ queryKey: key }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Hand the pen directly to the pending requester (holder-initiated). */
export function useHandoff(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/handoff`, { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

// --- heartbeat lifecycle ---------------------------------------------------

/**
 * Owns the holder lease's lifecycle: a 30 s heartbeat interval **while holding**,
 * and release-on-leave. Correctness (ADR-0028 / design §5):
 * - The interval is keyed on `holding`; its cleanup `clearInterval`s, so there is
 *   never a heartbeat after Stop / hand-off / unmount. A ref to the latest `mutate`
 *   keeps the interval callback off a stale closure.
 * - Release on **nav-away (unmount)** and **tab close (`pagehide`)** fires a
 *   best-effort **keepalive `fetch` DELETE** — `sendBeacon` is POST-only, release
 *   is DELETE. It only fires while actually holding, so an intentional Stop (which
 *   already released) doesn't double-fire. The 120 s TTL is the backstop, so a
 *   missed release just costs the next Planner up to one TTL, never a stuck lock.
 * - A **423 `PLAN_EDIT_LOCK_LOST`** heartbeat invalidates the status and calls
 *   `onLost` — the same drop-to-read-only transition as a lost write, unless the caller finds the
 *   plan free and takes it back (ADR-0220 D3). `onBeat` reports a beat the server accepted, which is
 *   what proves a retaken lease is live; `onBeatSettled` reports every beat's end, accepted or not.
 * - On `visibilitychange → visible`, fire an immediate heartbeat to recover from
 *   background-tab interval throttling (a beat can slip toward 60 s, still < TTL).
 * - A tab hidden for `HIDDEN_LET_GO_MS` skips its beats (D5) but never releases: a visible
 *   sibling tab of the same person shares the lease and keeps it alive with its own beats. The
 *   hidden time is measured from the `visibilitychange` that hid the tab, not by counting ticks,
 *   because a hidden tab's timers are throttled. The visible-again beat resumes the lease, or meets
 *   the 423 the caller's `onLost` already handles.
 * - A **visible** tab with no input for `IDLE_LET_GO_MS` does the same (D8), unless this tab's
 *   unsaved-work registry holds typed changes (R4). Input is any `pointerdown`, `pointermove`,
 *   `keydown`, `wheel` or `focus` (a capture listener on `window` hears every element's focus), heard once on `window` in the capture phase and
 *   written to a ref, so a mouse move costs no render. The tab then **rests**: `resting` is set (it
 *   also pauses the status poll, R5) and the listeners stay attached, because they are what wake
 *   it. The first input beats at once and asks for a fresh status; `onWake` tells the caller a beat
 *   is in the air so its view can hold still until `onBeatSettled` (R6, R7).
 * - Its refs (last input, resting, hidden-since) are per mount and are not reset when `planId` changes:
 *   the caller mounts it under a key that changes with the plan (`usePlanPen`'s remarks;
 *   `routes/plan-detail.tsx` keys the workspace on `${orgSlug}/${planId}`).
 */
export function useLockHeartbeat(
  orgSlug: string,
  planId: string,
  {
    holding,
    onLost,
    onBeat,
    onBeatSettled,
    onWake,
    resting,
  }: {
    holding: boolean;
    onLost: (reason: PlanEditLockReason) => void;
    onBeat?: () => void;
    onBeatSettled?: () => void;
    onWake?: () => void;
    /** Shared with the status query, which pauses its poll while it is set. */
    resting?: RefObject<boolean>;
  },
): void {
  const queryClient = useQueryClient();
  // Stable across renders: `planLockKeys.status` builds a new array each call, and the effects below
  // list the key as a dependency. A key that changed every render re-attached the input listeners on
  // every render of the host (a one-second timer elsewhere in the workspace is enough).
  const key = useMemo(() => planLockKeys.status(orgSlug, planId), [orgSlug, planId]);
  const registry = useUnsavedWorkRegistry();

  const heartbeat = useMutation({
    mutationKey: LOCK_MUTATION_KEY,
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/heartbeat`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      onBeat?.();
    },
    onError: (err: unknown) => {
      const reason = classifyLockError(err);
      if (reason === 'PLAN_EDIT_LOCK_LOST') {
        void queryClient.invalidateQueries({ queryKey: key });
        onLost(reason);
      }
    },
    onSettled: () => onBeatSettled?.(),
  });

  // Keep the interval/visibility callbacks off a stale `mutate` closure.
  const beatRef = useRef(heartbeat.mutate);
  useEffect(() => {
    beatRef.current = heartbeat.mutate;
  });
  const holdingRef = useRef(holding);
  useEffect(() => {
    holdingRef.current = holding;
  });
  const wakeRef = useRef(onWake);
  useEffect(() => {
    wakeRef.current = onWake;
  });
  const registryRef = useRef(registry);
  useEffect(() => {
    registryRef.current = registry;
  });
  const ownResting = useRef(false);
  const restingRef = resting ?? ownResting;

  // When this tab was hidden, or null while it is visible.
  const hiddenSinceRef = useRef<number | null>(null);
  // The last input in this tab. Written by every pointer move, so it is a ref and nothing else.
  const lastInputAtRef = useRef(0);

  // The heartbeat interval — only while holding.
  useEffect(() => {
    if (!holding) return;
    lastInputAtRef.current = Date.now();
    const id = setInterval(() => {
      const decision = decideBeat({
        now: Date.now(),
        hiddenSince: hiddenSinceRef.current,
        lastInputAt: lastInputAtRef.current,
        hasUnsavedWork: hasUnsavedWork(registryRef.current?.read() ?? []),
      });
      if (decision === 'idle') restingRef.current = true;
      if (decision === 'beat') beatRef.current();
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(id);
      // Resting means "holding and let go for idleness", so it ends with holding. This cleanup runs
      // only when `holding` changes or the host unmounts, never on a re-render, which must not wake a
      // resting tab (the input listeners' own cleanup runs far more often and so cannot do this).
      restingRef.current = false;
    };
  }, [holding, restingRef]);

  // Input in this tab, and the wake it causes in a resting one. Attached for as long as the tab
  // holds, and a resting tab still counts as holding (its poll is paused), so nothing detaches them.
  useEffect(() => {
    if (!holding) return;
    const onInput = (): void => {
      lastInputAtRef.current = Date.now();
      if (!restingRef.current) return;
      restingRef.current = false;
      wakeRef.current?.();
      beatRef.current();
      void queryClient.invalidateQueries({ queryKey: key });
    };
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { capture: true, passive: true });
    }
    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
    };
  }, [holding, queryClient, key, restingRef]);

  // Immediate recovery beat when a backgrounded tab returns to the foreground.
  useEffect(() => {
    if (!holding) return;
    hiddenSinceRef.current = document.visibilityState === 'hidden' ? Date.now() : null;
    const onChange = (): void => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current ??= Date.now();
        return;
      }
      hiddenSinceRef.current = null;
      lastInputAtRef.current = Date.now();
      if (document.visibilityState === 'visible') {
        restingRef.current = false;
        wakeRef.current?.();
        beatRef.current();
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [holding, restingRef]);

  // Release on nav-away (unmount) and tab close — keepalive DELETE, only while holding.
  useEffect(() => {
    const release = (): void => {
      if (!holdingRef.current) return;
      // Fire-and-forget best-effort release; the 120 s TTL is the real backstop, so
      // a failed beacon (offline, unload teardown) must never surface as a rejection.
      void fetch(`${API_BASE_URL}${lockPath(orgSlug, planId)}`, {
        method: 'DELETE',
        credentials: 'include',
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, [orgSlug, planId]);
}

// --- the orchestrator the route consumes -----------------------------------

/** The result of routing a rejected write through {@link PlanPen.onWriteRejected}. */
export type WriteRejection =
  /** A 423 lock error — already handled (read-only + lost-control banner); swallow it. */
  | { kind: 'lock' }
  /** Not a lock error — the caller keeps its existing 409/422 handling. */
  | { kind: 'passthrough' };

export interface PlanPen {
  status: PlanEditLockStatus | undefined;
  /** The caller currently holds the pen. */
  holdsPen: boolean;
  /**
   * Any acquire/release/request/cancel/handoff is in flight, or the app is taking the pen itself (the
   * opening acquire or a silent retake).
   */
  isPending: boolean;
  /**
   * The OPENING acquire: the app is taking the pen on the person's behalf, decided at render from
   * the status so there is no frame in which an enabled Start editing is offered first (ADR-0220 D1).
   * It is what makes the lock view read as loading. A silent retake after a lost lease is not this:
   * it feeds `isPending` only, and `status` keeps showing the last held lease meanwhile.
   */
  autoAcquiring: boolean;
  /** A transient "you just lost the pen" reason (423), until dismissed or re-acquired. */
  lostControl: PlanEditLockReason | null;
  dismissLost: () => void;
  startEditing: () => void;
  stopEditing: () => void;
  requestControl: () => void;
  /** Withdraw this person's own pending request (#588). */
  cancelRequest: () => void;
  /** The last Cancel request failed, so the request still stands; cleared by the next successful action. */
  cancelFailed: boolean;
  handoff: () => void;
  /** Take over a live lock (peer post-grace, or admin immediate — server decides). */
  takeOver: () => void;
  /** A change did not apply because the tab had been away while its hold lapsed (`lockCopy.awayWrite`). */
  awayWrite: boolean;
  dismissAwayWrite: () => void;
  /** Classify + absorb a rejected write; returns whether it was a lock error. */
  onWriteRejected: (err: unknown) => WriteRejection;
}

/**
 * The single composition hook `plan-detail.tsx` consumes. Wires the status query,
 * the mutations, and the heartbeat lifecycle into one `PlanPen`, driving the shared
 * announcer for action results. Server state (the lease) lives entirely in TanStack
 * Query keyed by plan; the only local state is the transient `lostControl` flag
 * (ADR-0004 split).
 *
 * @remarks Its per-opening state (the opening decision, `declined`, the one silent retake, the away-write notice, the resting flag) lives in
 * this hook instance, so it is per **mount**: mount it under a key that changes with the plan, as
 * `routes/plan-detail.tsx` does (`${orgSlug}/${planId}`). Without one, a plan switch would carry
 * the previous plan's "the person pressed Stop" into the next opening.
 */
export function usePlanPen(
  orgSlug: string,
  planId: string,
  currentUserId: string | undefined,
): PlanPen {
  const queryClient = useQueryClient();

  // Set by the heartbeat hook while this tab has let go for idleness; the status poll pauses on it.
  const restingRef = useRef(false);
  const lockQuery = usePlanEditLock(orgSlug, planId, restingRef);
  const status = lockQuery.data;
  const holdsPen = status?.state === 'HELD_BY_ME';

  // The `EditLockBanner`'s own `role="status"` live region announces every state
  // transition (Start/Stop/lost/…), so we deliberately do NOT also fire the shared
  // `useAnnounce()` for these — a second, near-identical utterance per action reads
  // as a double-announcement to AT (a11y review). The banner is the single source.
  const [lostControl, setLostControl] = useState<PlanEditLockReason | null>(null);
  const [awayWrite, setAwayWrite] = useState(false);
  // When the notice was shown: a write accepted after that, and only one submitted after it, ends it.
  const awayAtRef = useRef(0);
  const showAwayWrite = useCallback(() => {
    awayAtRef.current = Date.now();
    setAwayWrite(true);
  }, []);
  const dismissAwayWrite = useCallback(() => setAwayWrite(false), []);
  // The notice is about a change that did not apply: it is over once the person's next write is accepted.
  // Only writes made through a mutation can be seen here; the rest end it by Dismiss or Stop editing.
  // Mutation keys are not scoped to a plan, so a write to THIS plan cannot be told from any other
  // mutation; what can be told is when it was submitted, so one already in flight when the refusal
  // landed (a sibling write, an unrelated save) cannot clear a notice nobody has read yet.
  useEffect(() => {
    if (!awayWrite) return;
    return queryClient.getMutationCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        event.mutation.options.mutationKey?.[0] !== LOCK_MUTATION_KEY[0] &&
        (event.mutation.state.submittedAt ?? 0) > awayAtRef.current
      ) {
        setAwayWrite(false);
      }
    });
  }, [awayWrite, queryClient]);
  // A write was refused while the tab was waking, so the retake in `handleLost` has a change to
  // account for. A ref: the refusal can arrive while a retake started by the beat is already running.
  const writeDroppedRef = useRef(false);
  // The pen was silently taken back and no beat has been accepted since: a write refused just before
  // that was refused for the lapse the retake has already answered (ADR-0220 D8, E4).
  const retookRef = useRef(false);

  // --- the automatic acquire (ADR-0220) ------------------------------------
  // Everything below is per opening: the workspace is keyed per plan, so a reload, a plan switch or a
  // new tab starts again with all of it cleared.
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const onChange = (): void => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  // The opening's one decision: `waiting` until a status read since this mount is on screen in a
  // visible tab, then `taking` (an automatic acquire is to be sent / is in the air) or `done`. A pen
  // that frees up later, while the person is watching, is therefore never grabbed from a poll.
  const [opening, setOpening] = useState<'waiting' | 'taking' | 'done'>('waiting');
  const openingFiredRef = useRef(false); // effect-side guard, so a strict-mode replay cannot send twice
  // The person let go (Stop, hand-over, lost to a peer): nothing takes the pen for them again. Kept
  // in a ref as well so an async continuation reads the current answer rather than its closure's.
  const [declined, setDeclined] = useState(false);
  const declinedRef = useRef(false);
  const decline = useCallback(() => {
    declinedRef.current = true;
    setDeclined(true);
  }, []);
  // Pressing Start editing (or Take over) is the person asking again: a later loss is news to them.
  const resume = useCallback(() => {
    declinedRef.current = false;
    setDeclined(false);
    setLostControl(null);
  }, []);
  // The silent retake after a loss nobody caused is in the air, refetch included.
  const [retaking, setRetaking] = useState(false);
  const retakeInFlightRef = useRef(false); // two refused beats close together must run one retake
  const retakenRef = useRef(false); // one silent retake per loss, until a beat proves the lease live
  // The last lease this person held, so the status can keep showing it while a retake is in flight:
  // the refetch in the middle reads FREE, and a view built from that would announce "checking" and
  // flip Stop editing to Start editing for a retake that is meant to be silent.
  const [lastHeld, setLastHeld] = useState<PlanEditLockStatus | undefined>(undefined);
  if (status?.state === 'HELD_BY_ME' && lastHeld !== status) setLastHeld(status);
  // A beat sent on waking (an input after the tab rested, or a hidden tab returning) is in the air
  // (ADR-0220 D8, R7). Until it settles a read of FREE or EXPIRED must not repaint the pen as free:
  // the beat is about to say whether the lease is still this person's. A ref as well as state, so a
  // rejected write can ask whether the tab is waking without waiting for a render.
  const [waking, setWaking] = useState(false);
  const wakingRef = useRef(false);
  const startWaking = useCallback(() => {
    wakingRef.current = true;
    setWaking(true);
  }, []);
  const endWaking = useCallback(() => {
    wakingRef.current = false;
    setWaking(false);
  }, []);
  // The last status that named another holder, kept for the freed-pen acquire for the same reason:
  // the refetch in the middle reads FREE, and the requester should go from the waiting sentence
  // straight to holding the plan.
  const [lastOther, setLastOther] = useState<PlanEditLockStatus | undefined>(undefined);
  if (status?.state === 'HELD_BY_OTHER' && lastOther !== status) setLastOther(status);

  const acknowledgeLost = useCallback(
    (reason: PlanEditLockReason) => {
      decline();
      setLostControl(reason);
    },
    [decline],
  );
  const dismissLost = useCallback(() => setLostControl(null), []);

  // The holder this tab asked for control (Request control), until the pen is free to take, this tab
  // holds it, or a different holder shows up (ADR-0220 D4: the request was to that person, not to
  // whoever comes next).
  const [requestedOf, setRequestedOf] = useState<string | null>(null);
  const cancel = useCancelRequest(orgSlug, planId);
  const [cancelFailed, setCancelFailed] = useState(false);
  const seenOther = status?.state === 'HELD_BY_OTHER' ? (status.holder?.id ?? null) : null;
  if (requestedOf !== null && (holdsPen || (seenOther !== null && seenOther !== requestedOf))) {
    setRequestedOf(null);
  }
  // The tab's memory follows the server's record while somebody else holds the pen (ADR-0220 D7): a
  // read that names this person as the requester is the request, whether or not this tab pressed the
  // button (a reload), and a read that names nobody or someone else is a request that is gone
  // (withdrawn here or in another tab, or replaced). Only the moment of release stays the tab's own
  // to remember, because that deletes the row and its request with it. Suspended while a cancel is
  // in flight so a read that left the server before it cannot re-arm what the press just forgot.
  if (currentUserId !== undefined && status?.state === 'HELD_BY_OTHER' && !cancel.isPending) {
    const holderId = status.holder?.id ?? null;
    const isMine = status.requestedBy?.id === currentUserId;
    if (isMine && holderId !== null && requestedOf !== holderId) setRequestedOf(holderId);
    else if (!isMine && requestedOf !== null) setRequestedOf(null);
  }
  // The refusal is about a request that stands: once the status shows no request of mine (cancelled
  // elsewhere, handed over, freed), there is nothing left for it to describe.
  if (
    cancelFailed &&
    !(status?.state === 'HELD_BY_OTHER' && status.requestedBy?.id === currentUserId)
  ) {
    setCancelFailed(false);
  }
  // The freed-pen acquire is in flight. Its own mutation, so it never shares an observer with the
  // opening acquire or the silent retake.
  const [takingFreed, setTakingFreed] = useState(false);
  const freedFiredRef = useRef(false); // effect-side guard, so a strict-mode replay cannot send twice

  const acquire = useAcquireLock(orgSlug, planId);
  const freedAcquire = useAcquireLock(orgSlug, planId);
  const autoAcquire = useAcquireLock(orgSlug, planId);
  const release = useReleaseLock(orgSlug, planId);
  const request = useRequestControl(orgSlug, planId);
  const handoffMutation = useHandoff(orgSlug, planId);

  // A cached status from an earlier visit says nothing about now; the decision waits for a read made
  // since this mount.
  const openingStatus = lockQuery.isFetchedAfterMount ? status : undefined;
  const wantsAuto = shouldAutoAcquire({
    status: openingStatus,
    visible,
    declined,
    autoAttempted: opening !== 'waiting',
  });
  // Taking the decision is a state transition made while rendering (React's "adjust state when a
  // value changes" pattern, as `useKeyedIdentity` does in `use-pen-lock-view.ts`), not an effect that
  // sets state after the frame: that is what keeps an enabled Start editing from ever being drawn.
  if (opening === 'waiting' && openingStatus && visible) {
    setOpening(wantsAuto ? 'taking' : 'done');
  }
  const wantsFreed = shouldTakeOnFree({ status, visible, iRequested: requestedOf !== null });
  // The opening acquire reads as loading (one sentence per opening). The freed-pen acquire must not:
  // the requester is already reading "Requested — …", and a "Checking…" in between would be announced
  // twice before "You're editing". It feeds `isPending` and the held-display below instead.
  const autoAcquiring = wantsAuto || opening === 'taking';
  const takingFreedPen = wantsFreed || takingFreed;

  const { mutate: mutateFreed } = freedAcquire;
  // Re-arm the once-only guard whenever the memory is empty, so a request adopted from the server
  // after a cancel, a replacement or a reload can send its own acquire. Not in the effect below: a
  // strict-mode replay of that effect runs while the memory is still set, and must find it spent.
  useEffect(() => {
    if (requestedOf === null) freedFiredRef.current = false;
  }, [requestedOf]);
  useEffect(() => {
    if (!wantsFreed || freedFiredRef.current) return;
    freedFiredRef.current = true;
    setTakingFreed(true);
    setRequestedOf(null);
    // Never `takeover: true`: if a colleague got there first, the refusal is silent and the refetch
    // shows who holds it.
    mutateFreed({ takeover: false }, { onSuccess: resume, onSettled: () => setTakingFreed(false) });
  }, [wantsFreed, mutateFreed, resume]);

  const { mutate: mutateAuto, mutateAsync: mutateAutoAsync } = autoAcquire;
  // This acquire and the retake in `handleLost` share ONE mutation observer (`autoAcquire`), so they
  // must never overlap: a second `mutate` on it would orphan the first's callbacks. They cannot today
  // because the retake only starts from a heartbeat, which needs a held lease the opening has not yet
  // produced; keep it that way.
  useEffect(() => {
    if (opening !== 'taking' || openingFiredRef.current) return;
    openingFiredRef.current = true;
    // Never `takeover: true`. A refusal is not an error to show: 423 HELD means a colleague won the
    // race and the refetch the mutation settles with shows who; anything else leaves today's free
    // view, where Start editing is still on offer.
    mutateAuto(
      { takeover: false },
      { onSuccess: () => setLostControl(null), onSettled: () => setOpening('done') },
    );
  }, [opening, mutateAuto]);

  // Every refused beat invalidates the status query first, and a second invalidation cancels the
  // fetch a first one started — including the one this read joined. A cancelled read says nothing
  // about the lock, so ask again rather than fall through to a banner that may be false.
  const readLatestStatus = useCallback(async (): Promise<PlanEditLockStatus> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await queryClient.fetchQuery({
          ...planEditLockQueryOptions(orgSlug, planId),
          staleTime: 0,
        });
      } catch (err) {
        if (!isCancelledError(err) || attempt >= 2) throw err;
      }
    }
  }, [queryClient, orgSlug, planId]);

  // A heartbeat said the lease is gone. Look before announcing: a lease released by this person's own
  // other tab or by a reload leaves the plan free, and "taken over" would be false.
  const handleLost = useCallback(
    (reason: PlanEditLockReason, { fromWrite = false }: { fromWrite?: boolean } = {}) => {
      if (declinedRef.current) return; // a beat in flight while Stop was pressed
      // After the declined check: a refusal that is not going to be retaken has nothing to report, and
      // the flag would otherwise outlive it and attach to some later, unrelated retake.
      if (fromWrite) writeDroppedRef.current = true;
      if (retakeInFlightRef.current) return; // the beat before this one is already being answered
      retakeInFlightRef.current = true;
      setRetaking(true);
      void (async () => {
        try {
          const latest = await readLatestStatus();
          if (declinedRef.current) return;
          if (shouldRetakeAfterLoss({ status: latest, retakenForThisLoss: retakenRef.current })) {
            retakenRef.current = true;
            await mutateAutoAsync({ takeover: false });
            setLostControl(null);
            retookRef.current = true;
            if (writeDroppedRef.current) {
              showAwayWrite();
            }
            return;
          }
        } catch {
          // Could not look, or the retake was refused: fall through to the honest default.
        } finally {
          retakeInFlightRef.current = false;
          writeDroppedRef.current = false;
          setRetaking(false);
        }
        if (!declinedRef.current) acknowledgeLost(reason);
      })();
    },
    [readLatestStatus, mutateAutoAsync, acknowledgeLost, showAwayWrite],
  );
  // Not reset by the retake's own acquire succeeding, only by an accepted beat: a server that accepts
  // an acquire and then refuses the beat would otherwise be retaken for ever, silently, every 30 s.
  // The cost is that a second real loss inside that 30 s window reads as a loss, which it is.
  const confirmLive = useCallback(() => {
    retakenRef.current = false;
    retookRef.current = false;
  }, []);

  useLockHeartbeat(orgSlug, planId, {
    holding: Boolean(holdsPen),
    onLost: handleLost,
    onBeat: confirmLive,
    onBeatSettled: endWaking,
    onWake: startWaking,
    resting: restingRef,
  });

  const startEditing = useCallback(() => {
    // Re-acquiring clears any lingering lost-control banner.
    acquire.mutate(undefined, { onSuccess: resume });
  }, [acquire, resume]);

  const stopEditing = useCallback(() => {
    setAwayWrite(false);
    decline();
    release.mutate();
  }, [release, decline]);

  const requestControl = useCallback(() => {
    request.mutate(undefined, {
      onSuccess: (data) => {
        const holderId = data.holder?.id ?? null;
        if (data.state !== 'HELD_BY_OTHER' || holderId === null) return;
        setRequestedOf(holderId);
      },
    });
  }, [request]);

  const { mutate: mutateCancel } = cancel;
  const cancelRequest = useCallback(() => {
    // Forget first: a free read that lands while the DELETE is in the air must not hand over a pen
    // the person has just said they no longer want.
    setRequestedOf(null);
    setCancelFailed(false);
    mutateCancel(undefined, {
      // The request still stands on the server, and the memory follows it back (the adopt rule runs
      // as soon as the cancel is no longer pending), so the screen only has to say so (ADR-0217).
      onError: () => setCancelFailed(true),
    });
  }, [mutateCancel]);

  const handoff = useCallback(() => {
    handoffMutation.mutate(undefined, { onSuccess: decline });
  }, [handoffMutation, decline]);

  const takeOver = useCallback(() => {
    acquire.mutate({ takeover: true }, { onSuccess: resume });
  }, [acquire, resume]);

  const onWriteRejected = useCallback(
    (err: unknown): WriteRejection => {
      const reason = classifyLockError(err);
      if (reason) {
        // A write that left in the same instant as the wake beat (ADR-0220 D8, E4) may be refused
        // only because the lease lapsed while the tab rested: look first, as a refused beat does.
        if (wakingRef.current || retakeInFlightRef.current) {
          handleLost(reason, { fromWrite: true });
        } else if (retookRef.current) {
          // The beat's 423 got there first and the retake is done: this write was refused for the same
          // lapse. Confirm the pen is ours before saying so, rather than declining on a stale answer.
          void (async () => {
            try {
              if ((await readLatestStatus()).state === 'HELD_BY_ME') {
                showAwayWrite();
                return;
              }
            } catch {
              // Could not look: fall through to the honest default.
            }
            if (!declinedRef.current) acknowledgeLost(reason);
          })();
        } else {
          acknowledgeLost(reason);
        }
        void queryClient.invalidateQueries({ queryKey: planLockKeys.status(orgSlug, planId) });
        return { kind: 'lock' };
      }
      return { kind: 'passthrough' };
    },
    [acknowledgeLost, handleLost, readLatestStatus, showAwayWrite, queryClient, orgSlug, planId],
  );

  return {
    status:
      // Until the wake's beat and the retake's read have both settled, whatever the status says, the
      // view keeps the last held lease: a colleague's name, then "editing", then the lost sentence is
      // three announcements for what is one event (ADR-0220 D8, R7).
      (retaking || waking) && lastHeld
        ? lastHeld
        : takingFreedPen && lastOther && (status?.state === 'FREE' || status?.state === 'EXPIRED')
          ? lastOther
          : status,
    holdsPen: Boolean(holdsPen),
    isPending:
      acquire.isPending ||
      release.isPending ||
      request.isPending ||
      cancel.isPending ||
      handoffMutation.isPending ||
      autoAcquiring ||
      takingFreedPen ||
      retaking,
    autoAcquiring,
    lostControl,
    dismissLost,
    startEditing,
    stopEditing,
    requestControl,
    cancelRequest,
    cancelFailed,
    awayWrite,
    dismissAwayWrite,
    handoff,
    takeOver,
    onWriteRejected,
  };
}
