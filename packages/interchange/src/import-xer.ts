import type { ImportGraph } from './import-graph.js';
import { mapCanonicalToImportGraph } from './mapper.js';
import type { InterchangeReport, ReportFinding } from './report.js';
import { validateAndRepair } from './validate.js';
import { adaptXerToCanonical } from './xer-adapter.js';
import { parseXer, type XerParseCaps } from './xer-parser.js';

/**
 * The top-level **`importXer` orchestrator** (ADR-0050, Task 1.3 step 4): the one entry point that runs
 * the whole pure pipeline — **detect → parse → adapt → map → validate/repair → report** — over an
 * untrusted `.xer` file and returns either a domain-valid {@link ImportGraph} plus a fully-populated
 * {@link InterchangeReport}, or a typed, user-safe {@link ImportError}. The thin NestJS `interchange`
 * module (Task 1.5) calls this, then adapts the graph to the domain create-DTOs.
 *
 * Hard rejection ({ ok: false }) is reserved for **structural impossibilities**: a non-XER / malformed
 * / oversized file (from the parser) or a file with no PROJECT record / no data date (from the adapter).
 * Every other deviation — dangling/duplicate/cyclic logic, duplicate codes, unit coercions, unmapped
 * kinds, out-of-scope tables, non-expressible calendar detail — is **repaired and reported**, never a
 * silent change and never a rejection. Pure + deterministic: no I/O, clock or randomness.
 */

export interface ImportXerInput {
  /** The raw uploaded file (bytes preferred so the parser can honour the XER encoding hint) or its text. */
  readonly content: Uint8Array | string;
  /** The original upload filename, for the report only — never used as a filesystem path. */
  readonly filename?: string | null;
  /** Optional parser safety caps (byte / row / field limits); defaults are applied when omitted. */
  readonly caps?: Partial<XerParseCaps>;
}

/**
 * Hard graph-size ceiling (ADR-0050, security/perf). The parser's byte/row caps bound the *file*, but a
 * compact tab-delimited file can still map to a very large graph; a graph past this ceiling is
 * **hard-rejected** BEFORE validate/repair (whose cycle repair is bounded by it, B2) and before any
 * persistence (whose single commit transaction is sized by it, B3). The values are generous headroom
 * above the product's ~2,000-activity ceiling (brief §17) while still bounding a hostile file to a graph
 * the pipeline can process well within the interactive-transaction budget.
 */
export const MAX_ACTIVITIES = 5000;
export const MAX_DEPENDENCIES = 10000;

/** A typed, user-safe import rejection. `stage` says where it failed; `code`/`message` never leak internals. */
export interface ImportError {
  readonly stage: 'parse' | 'adapt' | 'limit';
  readonly code: string;
  readonly message: string;
  /** 1-based physical line for a parse error, when attributable. */
  readonly line?: number;
}

export type ImportXerResult =
  { ok: true; graph: ImportGraph; report: InterchangeReport } | { ok: false; error: ImportError };

/** Split a flat findings list into the report's three buckets, preserving order. */
function bucketFindings(findings: readonly ReportFinding[]): {
  approximations: ReportFinding[];
  repairs: ReportFinding[];
  drops: ReportFinding[];
} {
  const approximations: ReportFinding[] = [];
  const repairs: ReportFinding[] = [];
  const drops: ReportFinding[] = [];
  for (const finding of findings) {
    if (finding.kind === 'approximation') approximations.push(finding);
    else if (finding.kind === 'repair') repairs.push(finding);
    else drops.push(finding);
  }
  return { approximations, repairs, drops };
}

export function importXer(input: ImportXerInput): ImportXerResult {
  const filename = input.filename ?? null;

  // 1. Detect + parse (Task 1.2). Non-XER / malformed / oversized → hard reject.
  const parsed = parseXer(
    input.content,
    input.caps === undefined ? undefined : { caps: input.caps },
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        stage: 'parse',
        code: parsed.error.code,
        message: parsed.error.message,
        ...(parsed.error.line === undefined ? {} : { line: parsed.error.line }),
      },
    };
  }

  // 2. Adapt XER → canonical. No PROJECT / no data date → hard reject.
  const adapted = adaptXerToCanonical(parsed.document, filename);
  if (!adapted.ok) {
    return {
      ok: false,
      error: { stage: 'adapt', code: adapted.error.code, message: adapted.error.message },
    };
  }

  // 3. Map canonical → SchedulePoint import graph.
  const mapped = mapCanonicalToImportGraph(adapted.model);

  // 3a. Hard graph-size ceiling. Reject a graph past the documented cap BEFORE validate/repair (its
  // cycle repair is bounded by this, B2) and before any commit (the single persistence transaction is
  // sized by this, B3) — never hang the event loop / blow the transaction budget on a hostile file.
  if (mapped.graph.activities.length > MAX_ACTIVITIES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_ACTIVITIES',
        message: `This schedule has ${mapped.graph.activities.length} activities, above the ${MAX_ACTIVITIES}-activity import limit.`,
      },
    };
  }
  if (mapped.graph.dependencies.length > MAX_DEPENDENCIES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_DEPENDENCIES',
        message: `This schedule has ${mapped.graph.dependencies.length} relationships, above the ${MAX_DEPENDENCIES}-relationship import limit.`,
      },
    };
  }

  // 4. Validate / repair the graph (dangling, duplicate, cyclic, duplicate codes).
  const validated = validateAndRepair(mapped.graph);

  // 5. Build the report from the union of every stage's findings + the final mapped counts.
  const { approximations, repairs, drops } = bucketFindings([
    ...adapted.findings,
    ...mapped.findings,
    ...validated.findings,
  ]);

  const report: InterchangeReport = {
    detectedFormat: adapted.model.source.format,
    sourceVersion: adapted.model.source.version,
    sourceFilename: adapted.model.source.filename,
    mapped: {
      activities: validated.graph.activities.length,
      relationships: validated.graph.dependencies.length,
      calendars: validated.graph.calendars.length,
    },
    approximations,
    repairs,
    drops,
  };

  return { ok: true, graph: validated.graph, report };
}
