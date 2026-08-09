/**
 * Normalising a browser's CSP violation report into one shape.
 *
 * **There are two wire formats and this app must accept both, because neither is universal.**
 *
 * - **Legacy `report-uri`** — `Content-Type: application/csp-report`, a single object wrapped in a
 *   `"csp-report"` key, with hyphenated field names (`violated-directive`, `blocked-uri`). It is
 *   deprecated and it is still the only mechanism several engines implement.
 * - **Reporting API `report-to`** — `Content-Type: application/reports+json`, an **array** of
 *   envelopes each carrying `type` and a `body` with camelCase names (`effectiveDirective`,
 *   `blockedURL`). Current, and the one being standardised on.
 *
 * **Which browser sends which is deliberately not asserted here**, because this file cannot
 * establish it and a comment claiming otherwise would be exactly the ADR-0076 Class 2 failure this
 * repository keeps recording. The practical answer is to emit both directives and accept both
 * bodies; `apps/web/e2e-csp` is where the question gets an observed answer, by driving a real
 * violation in a real browser and seeing what arrives.
 *
 * Field names differ across versions of the Reporting API too — `blockedURL` was `blockedUrl` and
 * `documentURL` was `documentUrl` in earlier drafts — so each field is read through a list of
 * candidates rather than one name. That is not defensive coding for its own sake: the input is an
 * unauthenticated POST from software we do not control, and a missed rename shows up as a table
 * full of `unknown`, which reads as "no violations" to the person deciding whether to enforce.
 */

/** One violation, in the shape the table stores. */
export interface NormalisedCspReport {
  /** The directive NAME only, e.g. `script-src-elem` — see {@link directiveNameOf}. */
  readonly effectiveDirective: string;
  /** What was blocked. Often a URL; often a keyword like `inline` or `eval`. */
  readonly blockedUri: string;
  /** The document the violation happened in. */
  readonly documentUri: string;
  /**
   * `enforce` when the policy was live, `report` during a report-only window, **`null` when the
   * reporter did not say**.
   *
   * Null rather than a default, and that is the correction that matters most here. The field is
   * absent **by format** — the Reporting API body carries it, the legacy body does not in every
   * engine — so defaulting invents the answer, and defaulting to `report` invents it in the
   * direction that reads a real, user-facing block as hypothetical. That inverts the one
   * distinction this column exists to make.
   */
  readonly disposition: string | null;
  /**
   * Where in the bundle it happened, when the reporter says.
   *
   * Added on ADR-0074's own experience: the violation its report-only window found came from Zod's
   * `allowsEval()` probe — code in a **dependency**, absent from `apps/web/src` entirely — so
   * `blocked_uri = 'eval'` named what broke and nothing about what to change.
   */
  readonly sourceFile: string | null;
  readonly lineNumber: number | null;
  readonly columnNumber: number | null;
}

/** Caps applied before anything reaches the database. Attacker-controlled input, so bounded here. */
export const MAX_FIELD_LENGTH = 1_024;
/** Ignore anything past this many reports in one batch — a batch is normally one or two. */
export const MAX_REPORTS_PER_REQUEST = 20;

/** What we call a field we could not find. Never null: the dedup key is three NOT NULL columns. */
export const UNKNOWN = 'unknown';

/**
 * The directive **name**, never its value.
 *
 * `effective-directive` is already a bare name; `violated-directive` — the fallback several engines
 * are the only ones to send — carries the whole serialised directive, `script-src 'self'`. Stored
 * verbatim, the same violation keys differently per engine and one problem reads as two.
 *
 * It is also a **hard** requirement rather than tidiness: `ck_csp_reports_directive_shape` refuses
 * anything but `^[a-z][a-z0-9-]{0,63}$`, and this endpoint swallows its write failures — so without
 * the split, legacy-shaped reports are refused by the database and dropped in silence, which on a
 * table whose whole job is to tell us what we did not anticipate is the worst possible failure.
 */
export function directiveNameOf(value: string): string {
  return (value.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

/** Clamp to something Postgres can store as `int4` — an out-of-range JSON number fails at CAST time, before any CHECK sees it. */
function safeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.trunc(value);
  if (rounded < 0 || rounded > 2_147_483_647) return null;
  return rounded;
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/**
 * Cap a field, and **strip the query string from anything URL-shaped**.
 *
 * A violation's value is often a URL from a page the reporter was on, and a query string is where
 * identifiers live — a share token, a search term, an email in a redirect. The path is what
 * identifies the violation; the query is noise that would make this table a low-grade access log
 * with better retention than the one the reporter agreed to.
 *
 * Keywords (`inline`, `eval`, `data`) have no `?` and pass through untouched.
 */
function clean(value: string): string {
  const withoutQuery = value.split('?')[0] ?? value;
  const withoutFragment = withoutQuery.split('#')[0] ?? withoutQuery;
  return withoutFragment.slice(0, MAX_FIELD_LENGTH);
}

function fromViolationFields(body: Record<string, unknown>): NormalisedCspReport {
  // `effective-directive` is the precise one; `violated-directive` is its older, coarser sibling
  // and is all some engines send. Preferring the precise one and falling back keeps the dedup key
  // as specific as the reporter allowed.
  const directive =
    firstString(body, ['effectiveDirective', 'effective-directive']) ??
    firstString(body, ['violatedDirective', 'violated-directive']);
  const blocked = firstString(body, ['blockedURL', 'blockedUrl', 'blocked-uri', 'blockedURI']);
  const document = firstString(body, ['documentURL', 'documentUrl', 'document-uri', 'documentURI']);
  const disposition = firstString(body, ['disposition']);
  const source = firstString(body, ['sourceFile', 'source-file']);

  const name = directiveNameOf(directive ?? '');

  return {
    // `UNKNOWN` only when nothing usable arrived — and it satisfies the directive-shape CHECK, which
    // a raw `violated-directive` value would not.
    effectiveDirective: name === '' ? UNKNOWN : name.slice(0, 64),
    blockedUri: clean(blocked ?? UNKNOWN),
    documentUri: clean(document ?? UNKNOWN),
    // Passed through as null when absent — see the interface for why defaulting is wrong here.
    disposition: disposition === null ? null : clean(disposition).slice(0, 32),
    sourceFile: source === null ? null : clean(source),
    lineNumber: safeInt(body['lineNumber'] ?? body['line-number']),
    columnNumber: safeInt(body['columnNumber'] ?? body['column-number']),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse either wire format into zero or more normalised reports.
 *
 * **Never throws, and returns `[]` for anything unrecognised.** The endpoint answers 204 regardless
 * — a report endpoint that returns errors tells an attacker their probe was interesting, and there
 * is no caller to inform: a browser sending a violation report does not read the response and
 * cannot act on it. So malformed input is dropped, not rejected.
 */
export function normaliseCspReports(payload: unknown): NormalisedCspReport[] {
  // Reporting API: an array of envelopes, each `{ type, url, body }`.
  if (Array.isArray(payload)) {
    return (
      payload
        .slice(0, MAX_REPORTS_PER_REQUEST)
        .filter(isRecord)
        // Other report types (`deprecation`, `intervention`, `crash`) arrive on the same endpoint
        // when a group is shared. This table is about the policy, so anything else is dropped —
        // and a missing `type` is treated as a violation, because the earliest drafts omitted it.
        .filter((entry) => {
          const type = entry['type'];
          return type === undefined || type === 'csp-violation';
        })
        .map((entry) => (isRecord(entry['body']) ? entry['body'] : {}))
        .map(fromViolationFields)
    );
  }

  if (!isRecord(payload)) return [];

  // Legacy: `{ "csp-report": { … } }`.
  const legacy = payload['csp-report'];
  if (isRecord(legacy)) return [fromViolationFields(legacy)];

  // A bare violation object with no wrapper. Not a format any specification defines, and accepted
  // because it costs one branch and the alternative is silently discarding a real violation over a
  // wrapper — this endpoint's job is to collect evidence, not to grade conformance.
  if (firstString(payload, ['effectiveDirective', 'violated-directive', 'blocked-uri']) !== null) {
    return [fromViolationFields(payload)];
  }

  return [];
}
