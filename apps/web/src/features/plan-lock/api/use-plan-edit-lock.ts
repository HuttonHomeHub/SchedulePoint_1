import type { PlanEditLockReason, PlanEditLockStatus } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { shouldAutoAcquire, shouldRetakeAfterLoss } from '../lib/auto-acquire';
import { classifyLockError } from '../lib/lock-error';

import { API_BASE_URL } from '@/config/env';
import { apiFetch } from '@/lib/api/client';
import { planLockKeys } from '@/lib/query/hierarchy-keys';

export { planLockKeys };

/** Status poll cadence — inside the ≤ 20 s propagation target, half the heartbeat. */
const POLL_MS = 15_000;
/** Holder heartbeat cadence (ADR-0028 config; the server enforces the 120 s TTL). */
const HEARTBEAT_MS = 30_000;

const lockPath = (orgSlug: string, planId: string): string =>
  `/organizations/${orgSlug}/plans/${planId}/edit-lock`;

// --- status query ----------------------------------------------------------

export function planEditLockQueryOptions(orgSlug: string, planId: string) {
  return queryOptions({
    queryKey: planLockKeys.status(orgSlug, planId),
    queryFn: () => apiFetch<PlanEditLockStatus>(lockPath(orgSlug, planId)),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0, // lock status is inherently volatile — never serve it stale on mount
  });
}

/** A plan's edit-lock status (who holds the pen + capability flags). */
export function usePlanEditLock(
  orgSlug: string,
  planId: string,
): UseQueryResult<PlanEditLockStatus> {
  return useQuery(planEditLockQueryOptions(orgSlug, planId));
}

// --- mutations (one per verb) ----------------------------------------------

/** Acquire / renew / take-over the pen. `{ takeover: true }` is honoured per server policy. */
export function useAcquireLock(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
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
    mutationFn: () => apiFetch<void>(lockPath(orgSlug, planId), { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Request control of a live lock held by another (peer hand-off, ADR-0028 Q-A). */
export function useRequestControl(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/request`, { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Hand the pen directly to the pending requester (holder-initiated). */
export function useHandoff(orgSlug: string, planId: string) {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);
  return useMutation({
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
 *   what proves a retaken lease is live.
 * - On `visibilitychange → visible`, fire an immediate heartbeat to recover from
 *   background-tab interval throttling (a beat can slip toward 60 s, still < TTL).
 */
export function useLockHeartbeat(
  orgSlug: string,
  planId: string,
  {
    holding,
    onLost,
    onBeat,
  }: {
    holding: boolean;
    onLost: (reason: PlanEditLockReason) => void;
    onBeat?: () => void;
  },
): void {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);

  const heartbeat = useMutation({
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

  // The heartbeat interval — only while holding.
  useEffect(() => {
    if (!holding) return;
    const id = setInterval(() => beatRef.current(), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [holding]);

  // Immediate recovery beat when a backgrounded tab returns to the foreground.
  useEffect(() => {
    if (!holding) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') beatRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [holding]);

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
  /** Any acquire/release/request/handoff is in flight, or the app is about to take the pen itself. */
  isPending: boolean;
  /**
   * The app is taking the pen on the person's behalf — decided at render from the status, so there
   * is no frame in which an enabled Start editing is offered first (ADR-0220 D1).
   */
  autoAcquiring: boolean;
  /** A transient "you just lost the pen" reason (423), until dismissed or re-acquired. */
  lostControl: PlanEditLockReason | null;
  dismissLost: () => void;
  startEditing: () => void;
  stopEditing: () => void;
  requestControl: () => void;
  handoff: () => void;
  /** Take over a live lock (peer post-grace, or admin immediate — server decides). */
  takeOver: () => void;
  /** Classify + absorb a rejected write; returns whether it was a lock error. */
  onWriteRejected: (err: unknown) => WriteRejection;
}

/**
 * The single composition hook `plan-detail.tsx` consumes. Wires the status query,
 * the mutations, and the heartbeat lifecycle into one `PlanPen`, driving the shared
 * announcer for action results. Server state (the lease) lives entirely in TanStack
 * Query keyed by plan; the only local state is the transient `lostControl` flag
 * (ADR-0004 split).
 */
export function usePlanPen(orgSlug: string, planId: string): PlanPen {
  const queryClient = useQueryClient();

  const lockQuery = usePlanEditLock(orgSlug, planId);
  const status = lockQuery.data;
  const holdsPen = status?.state === 'HELD_BY_ME';

  // The `EditLockBanner`'s own `role="status"` live region announces every state
  // transition (Start/Stop/lost/…), so we deliberately do NOT also fire the shared
  // `useAnnounce()` for these — a second, near-identical utterance per action reads
  // as a double-announcement to AT (a11y review). The banner is the single source.
  const [lostControl, setLostControl] = useState<PlanEditLockReason | null>(null);

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
  // An automatic acquire (or the retake after a loss nobody caused) is in the air, refetch included.
  const [autoInFlight, setAutoInFlight] = useState(false);
  const retakenRef = useRef(false); // one silent retake per loss, until a beat proves the lease live

  const acknowledgeLost = useCallback(
    (reason: PlanEditLockReason) => {
      decline();
      setLostControl(reason);
    },
    [decline],
  );
  const dismissLost = useCallback(() => setLostControl(null), []);

  const acquire = useAcquireLock(orgSlug, planId);
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
  const autoAcquiring = wantsAuto || opening === 'taking' || autoInFlight;

  const { mutate: mutateAuto, mutateAsync: mutateAutoAsync } = autoAcquire;
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

  // A heartbeat said the lease is gone. Look before announcing: a lease released by this person's own
  // other tab or by a reload leaves the plan free, and "taken over" would be false.
  const handleLost = useCallback(
    (reason: PlanEditLockReason) => {
      if (declinedRef.current) return; // a beat in flight while Stop was pressed
      setAutoInFlight(true);
      void (async () => {
        try {
          const latest = await queryClient.fetchQuery({
            ...planEditLockQueryOptions(orgSlug, planId),
            staleTime: 0,
          });
          if (declinedRef.current) return;
          if (shouldRetakeAfterLoss({ status: latest, retakenForThisLoss: retakenRef.current })) {
            retakenRef.current = true;
            await mutateAutoAsync({ takeover: false });
            setLostControl(null);
            return;
          }
        } catch {
          // Could not look, or the retake was refused: fall through to the honest default.
        } finally {
          setAutoInFlight(false);
        }
        if (!declinedRef.current) acknowledgeLost(reason);
      })();
    },
    [queryClient, orgSlug, planId, mutateAutoAsync, acknowledgeLost],
  );
  const confirmLive = useCallback(() => {
    retakenRef.current = false;
  }, []);

  useLockHeartbeat(orgSlug, planId, {
    holding: Boolean(holdsPen),
    onLost: handleLost,
    onBeat: confirmLive,
  });

  const startEditing = useCallback(() => {
    // Re-acquiring clears any lingering lost-control banner.
    acquire.mutate(undefined, { onSuccess: resume });
  }, [acquire, resume]);

  const stopEditing = useCallback(() => {
    decline();
    release.mutate();
  }, [release, decline]);

  const requestControl = useCallback(() => {
    request.mutate();
  }, [request]);

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
        acknowledgeLost(reason);
        void queryClient.invalidateQueries({ queryKey: planLockKeys.status(orgSlug, planId) });
        return { kind: 'lock' };
      }
      return { kind: 'passthrough' };
    },
    [acknowledgeLost, queryClient, orgSlug, planId],
  );

  return {
    status,
    holdsPen: Boolean(holdsPen),
    isPending:
      acquire.isPending ||
      release.isPending ||
      request.isPending ||
      handoffMutation.isPending ||
      autoAcquiring,
    autoAcquiring,
    lostControl,
    dismissLost,
    startEditing,
    stopEditing,
    requestControl,
    handoff,
    takeOver,
    onWriteRejected,
  };
}
