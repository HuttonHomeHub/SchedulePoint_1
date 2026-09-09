import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { apiFetch } from '@/lib/api/client';

/** One stored limb, as the panel reads it back. Mirrors `ProbeResultRowDto`. */
export interface ProbeResultRow {
  id: string;
  runId: string;
  /** NULL means this reading was a single press, not that a sitting is missing. */
  sweepId: string | null;
  /** NULL means not recorded — see the column's own docblock in `schema.prisma`. */
  framesPerPhase: number | null;
  recordedAt: string;
  recordedByLabel: string | null;
  scenarioId: string;
  scenarioVersion: number;
  limbId: string;
  limbKind: string;
  preset: string;
  pxPerDay: number;
  activityCount: number;
  edgeCount: number;
  sceneSummary: string;
  samples: unknown[];
  counts: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  idleIntervalMs: number;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  gpuRenderer: string | null;
  userAgent: string;
  reducedMotion: boolean;
  lostFocusDuringRun: boolean;
  machineLabel: string | null;
  appVersion: string;
  apiVersion: string;
}

/** The POST body. Deliberately carries no `runId`, `recordedAt` or `apiVersion` — see `docs/API.md`. */
export interface ProbeResultBody {
  scenarioId: string;
  scenarioVersion: number;
  preset: string;
  /**
   * The sitting this press belongs to, when it belongs to one.
   *
   * Absent means a single press, which is a fact rather than a gap — the server stores NULL and the
   * history reads it back as one. **Client-supplied, unlike `runId`**, because only the client knows
   * that four presses were one sitting: the server holds no state across them.
   */
  sweepId?: string | null;
  /**
   * The frame budget one phase ran for. Absent on a reading taken before the column existed.
   *
   * **Sent from the run's own context, never re-derived here**: it is a property of the protocol
   * that produced the numbers, and inferring it from `samples.length` would write a fact derived
   * from a bundle version into a column readers will trust.
   */
  framesPerPhase?: number | null;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  idleIntervalMs: number;
  hardwareConcurrency?: number | null;
  deviceMemoryGb?: number | null;
  gpuRenderer?: string | null;
  userAgent: string;
  reducedMotion: boolean;
  lostFocusDuringRun: boolean;
  machineLabel?: string | null;
  appVersion: string;
  limbs: ProbeLimbBody[];
}

export interface ProbeLimbBody {
  limbId: string;
  limbKind: 'difference' | 'absolute';
  pxPerDay: number;
  activityCount: number;
  edgeCount: number;
  sceneSummary: string;
  counts: Record<string, number>;
  thresholds: Record<string, number | boolean | string>;
  pairs?: readonly unknown[];
  runs?: readonly unknown[];
}

const KEY = ['staff', 'probe-results'] as const;

/**
 * The readings taken on this installation.
 *
 * Not polled and not refetched on window focus, for the reason every staff read carries: the read
 * is an **audited act**, so a panel that refetched on each tab switch would fill an append-only
 * table with evidence of nothing.
 */
export function useProbeResults(): UseQueryResult<ProbeResultRow[]> {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ProbeResultRow[]>('/staff/probe-results'),
    refetchOnWindowFocus: false,
    retry: false,
  });
}

/**
 * Record a reading.
 *
 * **`retry: false` is deliberate.** A failed POST must reach the panel as a failure, because the
 * verdict is still on screen and the operator can press **Retry recording** — a silent retry would
 * either succeed twice (two runs claiming one press) or spend the operator's attention while
 * looking like nothing had happened. The panel's own copy is what makes a failed store distinct
 * from a refused run, which is the obligation `m4-schema-record.md` records the CHECK constraints
 * depending on.
 */
export function useRecordProbeResult(): UseMutationResult<
  ProbeResultRow[],
  Error,
  ProbeResultBody
> {
  return useMutation({
    mutationFn: (body: ProbeResultBody) =>
      apiFetch<ProbeResultRow[]>('/staff/probe-results', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    retry: false,
    // **No `onSuccess` invalidation, and that is a cost decision rather than tidying.**
    //
    // A sweep POSTs once per step, so invalidating here refetches the history four times for one
    // press — and this read is an AUDITED act, so those are four extra `staff.panel_read` rows in a
    // table that refuses `DELETE` (ADR-0072), recording nothing but the client's own impatience.
    // The refetch moves to `useRefreshProbeResults`, called once when a sitting settles.
    //
    // A single run still refreshes, because a single run IS a one-step sweep and goes through the
    // same completion hook. That is the property to preserve if this is ever changed back: the
    // failure mode is a stored reading the operator cannot see, which reads as a lost measurement.
  });
}

/**
 * Refresh the history once a sitting has settled.
 *
 * Separated from the mutation so the count of refetches is a property of the SITTING rather than of
 * how many rows it happened to write — see the note above.
 */
export function useRefreshProbeResults(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: KEY });
  }, [queryClient]);
}
