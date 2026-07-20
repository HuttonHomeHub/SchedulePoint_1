import { interchangeReportSchema, type InterchangeReport } from '@repo/interchange';
import type { ApiError, ApiResponse } from '@repo/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { API_BASE_URL } from '@/config/env';
import { ApiFetchError } from '@/lib/api/client';
import { planKeys } from '@/lib/query/hierarchy-keys';

/**
 * The multipart field name the interchange endpoints read the upload from (mirrors the API's
 * `INTERCHANGE_FILE_FIELD`). The two endpoints (`dry-run`, `commit`) both accept a single `file`.
 */
const FILE_FIELD = 'file';

/**
 * POST a single file as `multipart/form-data` to an interchange endpoint and unwrap the standard
 * `{ data }` envelope, mapping any non-2xx to {@link ApiFetchError} exactly as {@link apiFetch} does.
 *
 * It deliberately does **not** reuse `apiFetch`: that helper forces a JSON `Content-Type`, whereas a
 * multipart upload must let the browser set `multipart/form-data` **with its boundary** (setting the
 * header by hand omits the boundary and the server can't parse the parts). Cookies still flow
 * (`credentials: 'include'`) so the session + CSRF cookie ride along like every other write.
 */
async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(FILE_FIELD, file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
  } catch {
    // A transport-level failure (offline, DNS, aborted) never reached the API — surface it as a
    // synthetic envelope so callers branch on it uniformly (mapped to a friendly "couldn't reach the
    // server" message downstream). Status 0 = "no HTTP response".
    throw new ApiFetchError(0, { code: 'NETWORK_ERROR', message: 'Network request failed.' });
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (body as ApiError | undefined)?.error ?? {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
    };
    throw new ApiFetchError(response.status, error);
  }

  return (body as ApiResponse<T>).data;
}

/** The commit envelope: the new plan id plus the same report the planner reviewed (validated below). */
const commitResultSchema = z
  .object({ planId: z.string().min(1), report: interchangeReportSchema })
  .strict();

/** The successful result of a committed import — a new plan id and its interchange report. */
export type InterchangeCommitResult = z.infer<typeof commitResultSchema>;

function dryRunPath(orgSlug: string, projectId: string): string {
  return `/organizations/${orgSlug}/projects/${projectId}/interchange/dry-run`;
}

function commitPath(orgSlug: string, projectId: string): string {
  return `/organizations/${orgSlug}/projects/${projectId}/interchange/commit`;
}

/**
 * Dry-run an interchange import: upload the picked file and return the parsed {@link InterchangeReport}
 * (mapped counts + approximation / repair / drop findings) **without creating anything**. The response
 * is validated against the shared `@repo/interchange` Zod schema (spec §2) so a shape drift surfaces as
 * a client error rather than a mis-rendered table. A rejected file (422 `UNPARSEABLE_FILE`/`NO_FILE`) or
 * an oversize file (413) throws {@link ApiFetchError}; the dialog maps those to friendly messages.
 */
export function useDryRunImport(orgSlug: string, projectId: string) {
  return useMutation({
    mutationFn: async (file: File): Promise<InterchangeReport> =>
      interchangeReportSchema.parse(await postFile<unknown>(dryRunPath(orgSlug, projectId), file)),
  });
}

/**
 * Commit an interchange import: re-upload the reviewed file so the API re-parses it (deterministic —
 * the graph committed equals the one reviewed) and, in one transaction, creates the plan (calendars +
 * activities + dependencies) and recalculates it, returning `{ planId, report }` (validated against the
 * shared Zod). On success the target project's plans list is invalidated so the new plan appears in the
 * navigator/table. Same 422/413 rejection paths as the dry-run.
 */
export function useCommitImport(orgSlug: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<InterchangeCommitResult> =>
      commitResultSchema.parse(await postFile<unknown>(commitPath(orgSlug, projectId), file)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: planKeys.listByProject(orgSlug, projectId) }),
  });
}
