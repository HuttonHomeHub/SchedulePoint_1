import { describe, expect, it } from 'vitest';

import {
  MAX_FIELD_LENGTH,
  MAX_REPORTS_PER_REQUEST,
  normaliseCspReports,
  UNKNOWN,
} from './csp-report-body';

/**
 * The input here is an **unauthenticated POST from software we do not control**, so most of these
 * assert that hostile or unexpected shapes produce no row rather than an exception — the endpoint
 * answers 204 either way and a throw would become a 500 on a public route.
 *
 * The two real bodies are taken from the specifications rather than invented: the legacy
 * `application/csp-report` object and the Reporting API's `application/reports+json` array. Which
 * engine sends which is deliberately **not** asserted here; `apps/web/e2e-csp` answers that by
 * observation.
 */
describe('normaliseCspReports', () => {
  it('reads the legacy report-uri body', () => {
    const [report] = normaliseCspReports({
      'csp-report': {
        'document-uri': 'https://app.example/plans/42',
        'violated-directive': 'script-src',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'inline',
        disposition: 'report',
      },
    });

    expect(report).toEqual({
      effectiveDirective: 'script-src-elem',
      blockedUri: 'inline',
      documentUri: 'https://app.example/plans/42',
      disposition: 'report',
    });
  });

  it('reads the Reporting API batch', () => {
    const reports = normaliseCspReports([
      {
        type: 'csp-violation',
        url: 'https://app.example/plans/42',
        body: {
          documentURL: 'https://app.example/plans/42',
          effectiveDirective: 'img-src',
          blockedURL: 'data',
          disposition: 'enforce',
        },
      },
    ]);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ effectiveDirective: 'img-src', disposition: 'enforce' });
  });

  it('prefers the precise directive over the coarse one', () => {
    // `effective-directive` names what was actually enforced; `violated-directive` is its older,
    // coarser sibling. Preferring the precise one keeps the dedup key as specific as the reporter
    // allowed, so two different violations do not collapse into one row.
    const [report] = normaliseCspReports({
      'csp-report': {
        'violated-directive': 'script-src',
        'effective-directive': 'script-src-elem',
      },
    });

    expect(report?.effectiveDirective).toBe('script-src-elem');
  });

  it('accepts the earlier field spellings', () => {
    // `blockedURL` was `blockedUrl` and `documentURL` was `documentUrl` in earlier drafts. A missed
    // rename does not throw — it fills the table with `unknown`, which reads as "no violations" to
    // the person deciding whether to enforce. That is the failure this breadth exists to avoid.
    const [report] = normaliseCspReports([
      { type: 'csp-violation', body: { blockedUrl: 'eval', documentUrl: 'https://app.example/' } },
    ]);

    expect(report?.blockedUri).toBe('eval');
    expect(report?.documentUri).toBe('https://app.example/');
  });

  it('strips the query string and fragment from URLs', () => {
    // A query string is where identifiers live — a share token, a search term, an address in a
    // redirect. The path identifies the violation; the query would make this table a low-grade
    // access log with better retention than the one the reporter agreed to.
    const [report] = normaliseCspReports({
      'csp-report': {
        'document-uri': 'https://app.example/share?token=sp_share_secret#frag',
        'blocked-uri': 'https://evil.example/x?a=b',
        'effective-directive': 'script-src',
      },
    });

    expect(report?.documentUri).toBe('https://app.example/share');
    expect(report?.blockedUri).toBe('https://evil.example/x');
  });

  it('caps an enormous field rather than passing it through', () => {
    const [report] = normaliseCspReports({
      'csp-report': { 'blocked-uri': `https://evil.example/${'a'.repeat(50_000)}` },
    });

    expect(report?.blockedUri.length).toBe(MAX_FIELD_LENGTH);
  });

  it('bounds how many reports one request can contribute', () => {
    const batch = Array.from({ length: 500 }, () => ({
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src' },
    }));

    expect(normaliseCspReports(batch)).toHaveLength(MAX_REPORTS_PER_REQUEST);
  });

  it('drops other report types sharing the endpoint', () => {
    // `deprecation`, `intervention` and `crash` arrive here too when a reporting group is shared.
    // This table is about the policy.
    const reports = normaliseCspReports([
      { type: 'deprecation', body: { id: 'x' } },
      { type: 'csp-violation', body: { effectiveDirective: 'font-src' } },
    ]);

    expect(reports).toHaveLength(1);
    expect(reports[0]?.effectiveDirective).toBe('font-src');
  });

  it('defaults a missing disposition to report, not enforce', () => {
    // Guessing the stricter value would make a report-only finding look like something that had
    // already broken for a user, which is the opposite of what the observing window is for.
    const [report] = normaliseCspReports({ 'csp-report': { 'effective-directive': 'style-src' } });

    expect(report?.disposition).toBe('report');
  });

  it('never returns null fields — the dedup key is three NOT NULL columns', () => {
    const [report] = normaliseCspReports({ 'csp-report': {} });

    expect(report).toEqual({
      effectiveDirective: UNKNOWN,
      blockedUri: UNKNOWN,
      documentUri: UNKNOWN,
      disposition: 'report',
    });
  });

  it.each([
    ['null', null],
    ['a string', 'not a report'],
    ['a number', 42],
    ['an empty object', {}],
    ['an empty array', []],
    ['a nested wrapper of the wrong type', { 'csp-report': 'nope' }],
    ['an array of junk', [1, 'two', null]],
  ])('returns nothing for %s, and does not throw', (_label, payload) => {
    // The endpoint answers 204 regardless. A throw here becomes a 500 on a public route, which is
    // both an availability problem and a signal that a probe was interesting.
    expect(() => normaliseCspReports(payload)).not.toThrow();
    expect(normaliseCspReports(payload)).toEqual([]);
  });
});
