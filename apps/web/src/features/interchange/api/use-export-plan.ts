import { interchangeReportSchema, type InterchangeReport } from '@repo/interchange';
import type { ApiError } from '@repo/types';

import { API_BASE_URL } from '@/config/env';
import { ApiFetchError } from '@/lib/api/client';

/**
 * The plan schedule-**export** download client (ADR-0050 M4d, spec `docs/specs/schedule-interchange/`).
 * The read-egress mirror of `use-interchange.ts`'s import mutations: a single `GET` that streams the
 * serialised file as a Blob and rides the fidelity report back on the `X-Interchange-Report` response
 * header (compact JSON), rather than a JSON `{ data }` body. It deliberately does **not** reuse
 * `apiFetch` (which forces a JSON `Content-Type` and unwraps a JSON envelope) — a binary attachment is
 * read via `response.blob()` and the report is a header, not a body.
 *
 * The pure parsing (Content-Disposition filename, the report header) is split out from the IO so it is
 * unit-testable without a DOM or a network, mirroring `report-download.ts`'s pure/IO split. The browser
 * download itself is the shared `downloadBlob` shim, triggered by the caller (the TSLD Export menu).
 */

/** The two foreign formats the export endpoint serialises (mirrors the API `:format` enum). */
export type InterchangeExportFormat = 'xer' | 'mspdi';

/** The file extension each export format streams (`mspdi` → `.xml`, matching the API's filename). */
const EXPORT_EXTENSIONS: Record<InterchangeExportFormat, string> = { xer: 'xer', mspdi: 'xml' };

/** Human labels for the two formats, for announcements + friendly copy (sentence case, no jargon). */
export const EXPORT_FORMAT_LABELS: Record<InterchangeExportFormat, string> = {
  xer: 'Primavera P6',
  mspdi: 'Microsoft Project',
};

/** The successful result of an export fetch: the file bytes, its download name, and the fidelity report
 * (null when the header is absent or malformed — tolerated, the file is still usable). */
export interface PlanExportResult {
  blob: Blob;
  filename: string;
  report: InterchangeReport | null;
}

function exportPath(orgSlug: string, planId: string, format: InterchangeExportFormat): string {
  return `/organizations/${orgSlug}/plans/${planId}/interchange/export/${format}`;
}

/**
 * Parse the download filename out of a `Content-Disposition` header, falling back to `fallback` when the
 * header is absent or carries no usable filename. Handles the RFC 5987 `filename*=UTF-8''…` form (URL-
 * decoded, preferred), a quoted `filename="…"`, and a bare unquoted `filename=…`. Pure — no DOM/network.
 */
export function parseContentDispositionFilename(
  header: string | null | undefined,
  fallback: string,
): string {
  if (!header) return fallback;
  const extended = /filename\*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended?.[1]) {
    const raw = extended[1].trim().replace(/^"|"$/g, '');
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded) return decoded;
    } catch {
      // Malformed percent-encoding — fall through to the plain forms below.
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(header);
  if (quoted && quoted[1]) return quoted[1];
  const unquoted = /filename=\s*([^;]+)/i.exec(header);
  if (unquoted?.[1]) {
    const trimmed = unquoted[1].trim().replace(/^"|"$/g, '');
    if (trimmed) return trimmed;
  }
  return fallback;
}

/**
 * Parse + validate the `X-Interchange-Report` header (compact JSON) against the shared
 * `@repo/interchange` Zod schema. Returns the typed report, or `null` when the header is absent, isn't
 * valid JSON, or fails the schema — the download is not blocked on the report (the file bytes are the
 * deliverable; the report is the honest "what did I lose?" record). Pure — no DOM/network.
 */
export function parseInterchangeReportHeader(
  value: string | null | undefined,
): InterchangeReport | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const result = interchangeReportSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * A stable, filesystem-safe fallback download name — `"<plan>.<ext>"` — used only when the response
 * carries no `Content-Disposition` filename (the API always sets one, so this is a defensive default).
 * Sanitises the plan name the same way `report-download.ts`'s `reportFilename` does. Pure.
 */
export function fallbackExportFilename(planName: string, format: InterchangeExportFormat): string {
  const base = planName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'schedule'}.${EXPORT_EXTENSIONS[format]}`;
}

/** The report-text download name derived from the export filename (`plan.xer` → `plan-export-report.txt`). */
export function exportReportFilename(exportFilename: string): string {
  const base = exportFilename.replace(/\.[^.]+$/, '').replace(/^-+|-+$/g, '');
  return `${base || 'schedule'}-export-report.txt`;
}

/**
 * Map any thrown value from {@link fetchPlanExport} to user-safe copy — never a raw stack or internal
 * code. A 422 (unsupported format) can't arise from our own UI (we only offer `xer`/`mspdi`), but is
 * covered defensively; 403/404 get friendly messages; a transport failure (status 0) reads as offline.
 */
export function exportErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError) {
    if (error.status === 0) {
      return "Couldn't reach the server. Check your connection and try again.";
    }
    if (error.status === 403) {
      return "You don't have permission to export this plan.";
    }
    if (error.status === 404) {
      return 'This plan is no longer available.';
    }
    if (error.status === 422) {
      return "This plan can't be exported to that format.";
    }
    // Any other API error — the envelope message is already user-safe.
    return error.error.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * `GET` the serialised export for `format`, sending cookies (`credentials: 'include'`) so the session +
 * CSRF cookie ride along like every other request. Reads the response as a Blob and lifts the download
 * filename + fidelity report off the headers. Any non-2xx is mapped to {@link ApiFetchError} exactly as
 * `apiFetch` does (so callers branch on `status`); a transport-level failure surfaces as status 0.
 * DOM-free + IO-thin — the browser download is the caller's job (the shared `downloadBlob`).
 */
export async function fetchPlanExport({
  orgSlug,
  planId,
  format,
  fallbackName,
}: {
  orgSlug: string;
  planId: string;
  format: InterchangeExportFormat;
  /** The name to use when the response omits a `Content-Disposition` filename (defensive). */
  fallbackName: string;
}): Promise<PlanExportResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${exportPath(orgSlug, planId, format)}`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch {
    // A transport-level failure (offline, DNS, aborted) never reached the API — surface it as a
    // synthetic envelope so callers branch on it uniformly. Status 0 = "no HTTP response".
    throw new ApiFetchError(0, { code: 'NETWORK_ERROR', message: 'Network request failed.' });
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const error = (body as ApiError | undefined)?.error ?? {
      code: 'UNKNOWN',
      message: 'Something went wrong. Please try again.',
    };
    throw new ApiFetchError(response.status, error);
  }

  const blob = await response.blob();
  const filename = parseContentDispositionFilename(
    response.headers.get('Content-Disposition'),
    fallbackName,
  );
  const report = parseInterchangeReportHeader(response.headers.get('X-Interchange-Report'));
  return { blob, filename, report };
}

/** Total findings in a report (approximations + repairs + drops) — the "N items" of the lossy-export note. */
export function reportFindingCount(report: InterchangeReport): number {
  return report.approximations.length + report.repairs.length + report.drops.length;
}
