import { ApiFetchError } from '@/lib/api/client';

/**
 * The client-side upload **size hint** — matches the API's authoritative 16 MiB boundary cap
 * (`INTERCHANGE_MAX_UPLOAD_BYTES`). The dialog uses it to fail fast with a friendly message before a
 * doomed upload; the server cap is the real gate (a race or a spoofed size still returns 413).
 */
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

/** Human label for {@link MAX_UPLOAD_BYTES}, for copy ("larger than the 16 MiB limit"). */
export const MAX_UPLOAD_LABEL = '16 MiB';

/**
 * A classified, UI-ready import failure. `kind` lets the dialog react (e.g. keep the file picker
 * focused for a re-pick on `oversize`/`unparseable`), and `message` is always safe to render verbatim.
 */
export interface ImportError {
  kind: 'oversize' | 'unparseable' | 'no-file' | 'network' | 'unknown';
  message: string;
}

/** Read `error.details.reason` (the domain reason code) defensively — `details` is typed `unknown`. */
function reasonOf(error: ApiFetchError): string | undefined {
  const details: unknown = error.error.details;
  if (details !== null && typeof details === 'object' && 'reason' in details) {
    const { reason } = details;
    return typeof reason === 'string' ? reason : undefined;
  }
  return undefined;
}

/**
 * Map any thrown value from the dry-run / commit mutations to a typed {@link ImportError} with
 * user-safe copy. Covers the two documented rejections (413 oversize, 422 `UNPARSEABLE_FILE`/`NO_FILE`),
 * a synthetic transport failure (status 0, from the multipart poster), and an unknown fallback — never
 * leaking a raw stack or an internal code to the planner.
 */
export function toImportError(error: unknown): ImportError {
  if (error instanceof ApiFetchError) {
    if (error.status === 413) {
      return {
        kind: 'oversize',
        message: `That file is larger than the ${MAX_UPLOAD_LABEL} limit. Choose a smaller file.`,
      };
    }
    if (error.status === 0) {
      return {
        kind: 'network',
        message: "Couldn't reach the server. Check your connection and try again.",
      };
    }
    if (error.status === 422) {
      const reason = reasonOf(error);
      if (reason === 'NO_FILE') {
        return { kind: 'no-file', message: 'Choose a file to import.' };
      }
      if (reason === 'UNPARSEABLE_FILE') {
        return {
          kind: 'unparseable',
          message: "This doesn't look like a Primavera XER file. Check the file and try again.",
        };
      }
      // A parseable-but-invalid case the server described itself — trust its message.
      return { kind: 'unparseable', message: error.error.message };
    }
    // Any other API error (403/404/409/500…) — the envelope message is already user-safe.
    return { kind: 'unknown', message: error.error.message };
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

/**
 * Client-side size guard used before the dry-run upload. Returns a friendly `oversize` error when the
 * file exceeds {@link MAX_UPLOAD_BYTES}, else `null`. Advisory only — the server cap is authoritative.
 */
export function checkUploadSize(file: File): ImportError | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      kind: 'oversize',
      message: `That file is larger than the ${MAX_UPLOAD_LABEL} limit. Choose a smaller file.`,
    };
  }
  return null;
}
