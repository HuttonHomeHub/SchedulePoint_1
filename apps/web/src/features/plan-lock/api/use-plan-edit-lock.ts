import type { PlanEditLockReason, PlanEditLockStatus } from '@repo/types';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { classifyLockError } from '../lib/lock-error';

import { API_BASE_URL, PLAN_EDIT_LOCK_ENABLED } from '@/config/env';
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

export function planEditLockQueryOptions(orgSlug: string, planId: string, enabled: boolean) {
  return queryOptions({
    queryKey: planLockKeys.status(orgSlug, planId),
    queryFn: () => apiFetch<PlanEditLockStatus>(lockPath(orgSlug, planId)),
    enabled,
    // Poll only while the pen layer is active; `false` fully stops the interval
    // when flag-off so the disabled feature costs zero network.
    refetchInterval: enabled ? POLL_MS : false,
    refetchOnWindowFocus: true,
    staleTime: 0, // lock status is inherently volatile — never serve it stale on mount
  });
}

/** A plan's edit-lock status (who holds the pen + capability flags). */
export function usePlanEditLock(
  orgSlug: string,
  planId: string,
  enabled: boolean,
): UseQueryResult<PlanEditLockStatus> {
  return useQuery(planEditLockQueryOptions(orgSlug, planId, enabled));
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
 *   `onLost` — the same drop-to-read-only transition as a lost write.
 * - On `visibilitychange → visible`, fire an immediate heartbeat to recover from
 *   background-tab interval throttling (a beat can slip toward 60 s, still < TTL).
 */
export function useLockHeartbeat(
  orgSlug: string,
  planId: string,
  { holding, onLost }: { holding: boolean; onLost: (reason: PlanEditLockReason) => void },
): void {
  const queryClient = useQueryClient();
  const key = planLockKeys.status(orgSlug, planId);

  const heartbeat = useMutation({
    mutationFn: () =>
      apiFetch<PlanEditLockStatus>(`${lockPath(orgSlug, planId)}/heartbeat`, { method: 'POST' }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
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
  /** Is the pen layer active at all (the `VITE_PLAN_EDIT_LOCK` flag). */
  penManaged: boolean;
  status: PlanEditLockStatus | undefined;
  /** The caller currently holds the pen (only ever true when `penManaged`). */
  holdsPen: boolean;
  /** Any acquire/release/request/handoff is in flight. */
  isPending: boolean;
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
 * (ADR-0004 split). When the flag is off, `penManaged` is false and the whole layer
 * is inert (no polling, no heartbeat, no banner).
 */
export function usePlanPen(orgSlug: string, planId: string): PlanPen {
  const penManaged = PLAN_EDIT_LOCK_ENABLED;
  const queryClient = useQueryClient();

  const lockQuery = usePlanEditLock(orgSlug, planId, penManaged);
  const status = lockQuery.data;
  const holdsPen = penManaged && status?.state === 'HELD_BY_ME';

  // The `EditLockBanner`'s own `role="status"` live region announces every state
  // transition (Start/Stop/lost/…), so we deliberately do NOT also fire the shared
  // `useAnnounce()` for these — a second, near-identical utterance per action reads
  // as a double-announcement to AT (a11y review). The banner is the single source.
  const [lostControl, setLostControl] = useState<PlanEditLockReason | null>(null);
  const acknowledgeLost = useCallback((reason: PlanEditLockReason) => setLostControl(reason), []);
  const dismissLost = useCallback(() => setLostControl(null), []);

  const acquire = useAcquireLock(orgSlug, planId);
  const release = useReleaseLock(orgSlug, planId);
  const request = useRequestControl(orgSlug, planId);
  const handoffMutation = useHandoff(orgSlug, planId);

  useLockHeartbeat(orgSlug, planId, { holding: Boolean(holdsPen), onLost: acknowledgeLost });

  const startEditing = useCallback(() => {
    // Re-acquiring clears any lingering lost-control banner.
    acquire.mutate(undefined, { onSuccess: () => setLostControl(null) });
  }, [acquire]);

  const stopEditing = useCallback(() => {
    release.mutate();
  }, [release]);

  const requestControl = useCallback(() => {
    request.mutate();
  }, [request]);

  const handoff = useCallback(() => {
    handoffMutation.mutate();
  }, [handoffMutation]);

  const takeOver = useCallback(() => {
    acquire.mutate({ takeover: true }, { onSuccess: () => setLostControl(null) });
  }, [acquire]);

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
    penManaged,
    status,
    holdsPen: Boolean(holdsPen),
    isPending:
      acquire.isPending || release.isPending || request.isPending || handoffMutation.isPending,
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
