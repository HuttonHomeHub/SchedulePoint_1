import type { InterchangeReport } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import {
  exportErrorMessage,
  exportReportFilename,
  fallbackExportFilename,
  parseContentDispositionFilename,
  parseInterchangeReportHeader,
  reportFindingCount,
} from './use-export-plan';

import { ApiFetchError } from '@/lib/api/client';

/**
 * Unit coverage for the **pure** (DOM-free, network-free) parts of the plan export download client
 * (ADR-0050 M4d): the Content-Disposition filename parse (the API's quoted form + defensive unquoted /
 * RFC 5987 / fallback branches), the `X-Interchange-Report` header parse + Zod validation + tolerate-
 * absent, and the small filename derivations. The IO (`fetchPlanExport`) is exercised by the component
 * + Playwright round-trip; these lock the parsing so a header-shape drift surfaces here.
 */

const VALID_REPORT: InterchangeReport = {
  detectedFormat: 'MSPDI',
  sourceVersion: null,
  sourceFilename: 'riverside.xml',
  mapped: { activities: 2, relationships: 1, calendars: 0 },
  approximations: [
    { kind: 'approximation', entity: 'calendar', sourceRef: null, detail: 'coerced to 24/7' },
  ],
  repairs: [],
  drops: [{ kind: 'drop', entity: 'resource', sourceRef: 'R1', detail: 'resources not exported' }],
};

describe('parseContentDispositionFilename', () => {
  it('reads the quoted filename the API sends (attachment; filename="…")', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="riverside.xer"', 'fallback.xer'),
    ).toBe('riverside.xer');
  });

  it('reads a bare unquoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename=plan.xml', 'fallback.xml')).toBe(
      'plan.xml',
    );
  });

  it('prefers and URL-decodes the RFC 5987 filename* form', () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="plan.xer"; filename*=UTF-8\'\'my%20plan.xer',
        'fallback.xer',
      ),
    ).toBe('my plan.xer');
  });

  it('falls back when the header is absent, null, or carries no filename', () => {
    expect(parseContentDispositionFilename(null, 'fallback.xer')).toBe('fallback.xer');
    expect(parseContentDispositionFilename(undefined, 'fallback.xer')).toBe('fallback.xer');
    expect(parseContentDispositionFilename('attachment', 'fallback.xer')).toBe('fallback.xer');
  });
});

describe('parseInterchangeReportHeader', () => {
  it('parses + schema-validates a valid compact-JSON report', () => {
    const parsed = parseInterchangeReportHeader(JSON.stringify(VALID_REPORT));
    expect(parsed).not.toBeNull();
    expect(parsed?.detectedFormat).toBe('MSPDI');
    expect(parsed?.mapped.activities).toBe(2);
  });

  it('tolerates an absent header (null / undefined / empty) → null', () => {
    expect(parseInterchangeReportHeader(null)).toBeNull();
    expect(parseInterchangeReportHeader(undefined)).toBeNull();
    expect(parseInterchangeReportHeader('')).toBeNull();
  });

  it('returns null for malformed JSON rather than throwing', () => {
    expect(parseInterchangeReportHeader('{not json')).toBeNull();
  });

  it('returns null when the JSON is valid but fails the shared schema', () => {
    expect(parseInterchangeReportHeader(JSON.stringify({ detectedFormat: 'nope' }))).toBeNull();
  });
});

describe('reportFindingCount', () => {
  it('sums approximations + repairs + drops', () => {
    expect(reportFindingCount(VALID_REPORT)).toBe(2);
    expect(
      reportFindingCount({ ...VALID_REPORT, approximations: [], repairs: [], drops: [] }),
    ).toBe(0);
  });
});

describe('fallbackExportFilename', () => {
  it('sanitises the plan name and appends the format extension (mspdi → .xml)', () => {
    expect(fallbackExportFilename('River side!', 'xer')).toBe('River-side.xer');
    expect(fallbackExportFilename('River side!', 'mspdi')).toBe('River-side.xml');
  });

  it('defaults a name that sanitises to empty', () => {
    expect(fallbackExportFilename('!!!', 'xer')).toBe('schedule.xer');
  });
});

describe('exportReportFilename', () => {
  it('derives a report-text name from the export filename', () => {
    expect(exportReportFilename('riverside.xer')).toBe('riverside-export-report.txt');
    expect(exportReportFilename('my plan.xml')).toBe('my plan-export-report.txt');
  });
});

describe('exportErrorMessage', () => {
  it('reads a transport failure (status 0) as offline', () => {
    const message = exportErrorMessage(
      new ApiFetchError(0, { code: 'NETWORK_ERROR', message: 'Network request failed.' }),
    );
    expect(message).toBe("Couldn't reach the server. Check your connection and try again.");
  });

  it('maps 403 to a permission message', () => {
    expect(exportErrorMessage(new ApiFetchError(403, { code: 'FORBIDDEN', message: 'nope' }))).toBe(
      "You don't have permission to export this plan.",
    );
  });

  it('maps 404 to a no-longer-available message', () => {
    expect(exportErrorMessage(new ApiFetchError(404, { code: 'NOT_FOUND', message: 'gone' }))).toBe(
      'This plan is no longer available.',
    );
  });

  it('maps 422 to an unsupported-format message', () => {
    expect(
      exportErrorMessage(new ApiFetchError(422, { code: 'UNPROCESSABLE', message: 'bad' })),
    ).toBe("This plan can't be exported to that format.");
  });

  it('falls back to the (user-safe) envelope message for any other API status', () => {
    expect(
      exportErrorMessage(
        new ApiFetchError(500, { code: 'SERVER', message: 'Server had a wobble.' }),
      ),
    ).toBe('Server had a wobble.');
  });

  it('returns a generic message for a non-ApiFetchError throw', () => {
    expect(exportErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
