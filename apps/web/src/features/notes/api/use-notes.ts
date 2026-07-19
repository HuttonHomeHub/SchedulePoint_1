import type { ActivityNoteCount, NoteSummary, PageMeta } from '@repo/types';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { NoteTarget } from '../schemas/note-schemas';

import { apiFetch, apiFetchEnvelope } from '@/lib/api/client';
import { noteKeys } from '@/lib/query/hierarchy-keys';

export { noteKeys };

/** One fetched page of a thread — the notes plus the cursor state from the `{ data, meta }` envelope. */
export interface NotePage {
  notes: NoteSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

/** The list endpoint for a target — an activity note posts/reads under the activity, else the plan. */
function threadPath(orgSlug: string, target: NoteTarget): string {
  return target.activityId
    ? `/organizations/${orgSlug}/activities/${target.activityId}/notes`
    : `/organizations/${orgSlug}/plans/${target.planId}/notes`;
}

/** The cache key for a target's thread — separate caches per entity (ADR-0046). */
function threadKey(orgSlug: string, target: NoteTarget) {
  return target.activityId
    ? noteKeys.activityThread(orgSlug, target.activityId)
    : noteKeys.planThread(orgSlug, target.planId);
}

async function fetchNotePage(path: string, cursor: string | null): Promise<NotePage> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) query.set('cursor', cursor);
  const { data, meta } = await apiFetchEnvelope<NoteSummary[], PageMeta>(
    `${path}?${query.toString()}`,
  );
  return { notes: data, nextCursor: meta?.nextCursor ?? null, hasMore: meta?.hasMore ?? false };
}

/**
 * A target's note thread — newest-first, cursor-paginated (ADR-0046). The API defaults to `order=desc`
 * so page 1 is the newest notes; "Load more" fetches the next (older) page. `enabled` lets a host keep
 * the query mounted but idle (a closed dialog / the flag off), so nothing fetches until it's shown.
 */
export function useNoteThread(
  orgSlug: string,
  target: NoteTarget,
  enabled = true,
): UseInfiniteQueryResult<{ pages: NotePage[]; pageParams: unknown[] }, Error> {
  const path = threadPath(orgSlug, target);
  const parentId = target.activityId ?? target.planId;
  return useInfiniteQuery({
    queryKey: threadKey(orgSlug, target),
    queryFn: ({ pageParam }) => fetchNotePage(path, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextCursor : undefined),
    enabled: enabled && parentId !== '',
  });
}

/**
 * The batch per-activity note counts for a plan's row badges — ONE grouped query for the whole table
 * (never per-row, so no N+1; ADR-0046). Returns only activities with ≥1 active note; an absent id is
 * zero. `enabled` gates it (off behind the flag).
 */
export function useActivityNoteCounts(
  orgSlug: string,
  planId: string,
  enabled = true,
): UseQueryResult<ActivityNoteCount[]> {
  return useQuery({
    queryKey: noteKeys.activityCounts(orgSlug, planId),
    queryFn: () =>
      apiFetch<ActivityNoteCount[]>(
        `/organizations/${orgSlug}/plans/${planId}/notes/activity-counts`,
      ),
    enabled: enabled && planId !== '',
  });
}

/**
 * The invalidation a note write settles into: the touched thread, plus — for an activity note — the
 * plan's per-activity counts so the row badge tracks (a plan note doesn't move any badge). A single
 * grouped await so `onSettled` callers can wait on it.
 */
function invalidateThread(
  queryClient: QueryClient,
  orgSlug: string,
  target: NoteTarget,
): Promise<unknown> {
  const keys = target.activityId
    ? [threadKey(orgSlug, target), noteKeys.activityCounts(orgSlug, target.planId)]
    : [threadKey(orgSlug, target)];
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Add a note to the target (plan or activity). Contributor upward; not pen-gated (ADR-0046). */
export function useCreateNote(orgSlug: string, target: NoteTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      apiFetch<NoteSummary>(threadPath(orgSlug, target), {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => invalidateThread(queryClient, orgSlug, target),
  });
}

/**
 * Edit a note's body (author-only; the API returns **403** for a non-author and **409** for a stale
 * `version`). The flat `/notes/:noteId` route, but the target is passed so the right thread + counts
 * refresh. Callers branch on the {@link ApiFetchError} status for the 409 "updated elsewhere" path.
 */
export function useUpdateNote(orgSlug: string, target: NoteTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, body, version }: { noteId: string; body: string; version: number }) =>
      apiFetch<NoteSummary>(`/organizations/${orgSlug}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, version }),
      }),
    onSuccess: () => invalidateThread(queryClient, orgSlug, target),
  });
}

/** Soft-delete a note (author-only; **403** for a non-author). Invalidates the thread + counts. */
export function useDeleteNote(orgSlug: string, target: NoteTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      apiFetch<void>(`/organizations/${orgSlug}/notes/${noteId}`, { method: 'DELETE' }),
    onSuccess: () => invalidateThread(queryClient, orgSlug, target),
  });
}
