import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/api/client';

/** One stored limb, as the panel reads it back. Mirrors `ProbeResultRowDto`. */
export interface ProbeResultRow {
  id: string;
  runId: string;
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProbeResultBody) =>
      apiFetch<ProbeResultRow[]>('/staff/probe-results', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
