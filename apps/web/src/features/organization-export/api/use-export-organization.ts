import type { ApiError } from '@repo/types';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE_URL } from '@/config/env';
import { parseContentDispositionFilename } from '@/features/interchange/api/use-export-plan';
import { downloadBlob } from '@/lib/download-blob';

/**
 * The organisation-export download client (ADR-0194, spec `docs/specs/organisation-export/`).
 *
 * **A `fetch` of a POST, not a link or a form.** The route is a POST on purpose (it writes an audit
 * row, and a Lax session cookie rides a cross-site GET), so the browser cannot be pointed at it with
 * an anchor. The bytes are collected here and saved as one `Blob` through the shared download shim.
 * Collecting them is also what lets the page count what has arrived and offer **Cancel** — and what
 * lets a mid-stream failure read as "stopped, nothing saved" instead of a truncated file on disk.
 * The cost is the whole ZIP in browser memory; the trigger to replace this with a navigation-based
 * download is recorded in `docs/TECH_DEBT.md`.
 *
 * It deliberately does not use `apiFetch`, which forces a JSON content type and unwraps a JSON
 * envelope: the success body is a binary stream. Refusals before the first byte are the standard
 * `{ error }` envelope and are read from it; after the first byte the API destroys the connection
 * and no envelope exists, which is the `stopped` branch below.
 */

export type OrganizationExportState =
  | { status: 'idle' }
  | { status: 'busy'; bytes: number }
  | { status: 'done'; filename: string; bytes: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * How often the byte count may change on screen. The status line is a live region, so every update
 * is a possible announcement; two seconds keeps a screen reader from being flooded by a stream that
 * delivers hundreds of chunks a second.
 */
export const PROGRESS_INTERVAL_MS = 2000;

const STOPPED_MESSAGE = 'The download stopped before it finished. Nothing was saved. Try again.';

/**
 * Map a refusal to the copy of spec §2. `EXPORT_BUSY` is the whole server being at its cap and gets
 * its own sentence: telling the reader "this organisation" is already exporting would send them
 * looking for a colleague who is not there. Pure — no DOM or network.
 */
export function organizationExportErrorMessage(status: number, reason?: string): string {
  switch (status) {
    case 0:
      return "Couldn't reach the server. Check your connection and try again.";
    case 401:
      return 'Your session has ended. Sign in again, then try the export again.';
    case 403:
      return "Only an Org Admin can export this organisation's data.";
    case 404:
      return 'This organisation was not found.';
    case 409:
      return reason === 'EXPORT_BUSY'
        ? 'The server is busy with other exports right now. Try again in a few minutes.'
        : 'An export is already being prepared for this organisation. Try again when it finishes.';
    case 429:
      return 'Too many exports in a short time. Try again in a few minutes.';
    default:
      return 'The export could not be prepared. Try again; if it keeps failing, tell your administrator.';
  }
}

/** Read the refusal envelope's machine reason, tolerating a body that is not our envelope. */
async function refusalReason(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => undefined);
  const details = (body as ApiError | undefined)?.error?.details;
  const reason =
    typeof details === 'object' && details !== null
      ? (details as { reason?: unknown }).reason
      : undefined;
  return typeof reason === 'string' ? reason : undefined;
}

/** Why the in-flight request was aborted — the user pressing Cancel, or the page going away. */
type AbortCause = 'cancel' | 'unmount';

export interface UseExportOrganization {
  state: OrganizationExportState;
  start: () => void;
  cancel: () => void;
}

export function useExportOrganization(orgSlug: string): UseExportOrganization {
  const [state, setState] = useState<OrganizationExportState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const causeRef = useRef<AbortCause | null>(null);

  useEffect(
    () => () => {
      causeRef.current = 'unmount';
      controllerRef.current?.abort();
    },
    [],
  );

  const run = useCallback(
    async (controller: AbortController): Promise<void> => {
      let response: Response;
      try {
        response = await fetch(
          `${API_BASE_URL}/organizations/${encodeURIComponent(orgSlug)}/export`,
          {
            method: 'POST',
            credentials: 'include',
            signal: controller.signal,
          },
        );
      } catch (error) {
        if (controller.signal.aborted) throw error;
        setState({ status: 'error', message: organizationExportErrorMessage(0) });
        return;
      }

      if (!response.ok) {
        const reason = response.status === 409 ? await refusalReason(response) : undefined;
        setState({
          status: 'error',
          message: organizationExportErrorMessage(response.status, reason),
        });
        return;
      }

      const chunks: Uint8Array[] = [];
      let bytes = 0;
      let lastShown = Date.now();
      setState({ status: 'busy', bytes: 0 });
      try {
        const reader = response.body?.getReader();
        if (reader === undefined) {
          const whole = new Uint8Array(await response.arrayBuffer());
          chunks.push(whole);
          bytes = whole.byteLength;
        } else {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytes += value.byteLength;
            const now = Date.now();
            if (now - lastShown >= PROGRESS_INTERVAL_MS) {
              lastShown = now;
              setState({ status: 'busy', bytes });
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
        // The API destroys the connection when it fails after the first byte, so the reader
        // rejects here. Saving what arrived would hand over a ZIP with no manifest.
        setState({ status: 'error', message: STOPPED_MESSAGE });
        return;
      }

      const filename = parseContentDispositionFilename(
        response.headers.get('Content-Disposition'),
        `schedulepoint-export-${orgSlug}.zip`,
      );
      downloadBlob(
        new Blob(chunks as BlobPart[], {
          type: response.headers.get('Content-Type') ?? 'application/zip',
        }),
        filename,
      );
      setState({ status: 'done', filename, bytes });
    },
    [orgSlug],
  );

  const start = useCallback((): void => {
    if (controllerRef.current !== null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    causeRef.current = null;
    setState({ status: 'busy', bytes: 0 });
    run(controller)
      .catch(() => {
        // Only an abort reaches here (every other failure is mapped above). A cancel is the user's
        // own act and returns to rest; an unmount has nobody left to tell.
        if (causeRef.current === 'cancel') setState({ status: 'cancelled' });
      })
      .finally(() => {
        controllerRef.current = null;
      });
  }, [run]);

  const cancel = useCallback((): void => {
    if (controllerRef.current === null) return;
    causeRef.current = 'cancel';
    controllerRef.current.abort();
  }, []);

  return { state, start, cancel };
}
