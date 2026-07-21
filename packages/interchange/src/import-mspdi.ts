import { importGraphSchema, type ImportGraph } from './import-graph.js';
import {
  MAX_ACTIVITIES,
  MAX_ASSIGNMENTS,
  MAX_DEPENDENCIES,
  MAX_RESOURCES,
  type ImportError,
} from './import-xer.js';
import { mapCanonicalToImportGraph } from './mapper.js';
import { adaptMspdiToCanonical } from './mspdi-adapter.js';
import { parseMspdi, type MspdiParseCaps } from './mspdi-parser.js';
import type { InterchangeReport, ReportFinding } from './report.js';
import { validateAndRepair } from './validate.js';

/**
 * The top-level **`importMspdi` orchestrator** (ADR-0050, Task 3.3): the one entry point that runs the
 * whole pure pipeline — **detect → parse → adapt → map → validate/repair → report** — over an untrusted
 * MSPDI `.xml` file and returns either a domain-valid {@link ImportGraph} plus a fully-populated
 * {@link InterchangeReport}, or a typed, user-safe {@link ImportError}.
 *
 * It is the exact structural twin of `importXer`: the **only** MSPDI-specific stages are the parser and
 * the adapter; from the canonical model onward it reuses the **same** mapper, ceiling checks, validate/
 * repair step and report shape (ADR-0050's whole point — a new format is a new parser + adapter, not a
 * second pipeline). Hard rejection ({ ok: false }) is reserved for structural impossibilities: a
 * non-MSPDI / `.mpp` / malformed / oversized file (from the parser) or a file with no data date (from the
 * adapter). Every other deviation is repaired and reported. Pure + deterministic: no I/O, clock or randomness.
 */

export interface ImportMspdiInput {
  /** The raw uploaded file (bytes preferred so the parser can honour the XML/BOM encoding) or its text. */
  readonly content: Uint8Array | string;
  /** The original upload filename, for the report only — never used as a filesystem path. */
  readonly filename?: string | null;
  /** Optional parser safety caps (byte / node limits); defaults are applied when omitted. */
  readonly caps?: Partial<MspdiParseCaps>;
}

export type ImportMspdiResult =
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

export function importMspdi(input: ImportMspdiInput): ImportMspdiResult {
  const filename = input.filename ?? null;

  // 1. Detect + parse. Non-MSPDI / .mpp / malformed / oversized → hard reject.
  const parsed = parseMspdi(
    input.content,
    input.caps === undefined ? undefined : { caps: input.caps },
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: { stage: 'parse', code: parsed.error.code, message: parsed.error.message },
    };
  }

  // 2. Adapt MSPDI → canonical. No data date → hard reject.
  const adapted = adaptMspdiToCanonical(parsed.document, filename);
  if (!adapted.ok) {
    return {
      ok: false,
      error: { stage: 'adapt', code: adapted.error.code, message: adapted.error.message },
    };
  }

  // 3. Map canonical → SchedulePoint import graph (the SAME mapper as the XER path).
  const mapped = mapCanonicalToImportGraph(adapted.model);

  // 3a. Hard graph-size ceiling (the SAME caps as the XER path), enforced BEFORE validate/repair and any
  // commit — never hang the event loop / blow the transaction budget on a hostile file.
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
  if (mapped.graph.resources.length > MAX_RESOURCES) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_RESOURCES',
        message: `This schedule has ${mapped.graph.resources.length} resources, above the ${MAX_RESOURCES}-resource import limit.`,
      },
    };
  }
  if (mapped.graph.assignments.length > MAX_ASSIGNMENTS) {
    return {
      ok: false,
      error: {
        stage: 'limit',
        code: 'TOO_MANY_ASSIGNMENTS',
        message: `This schedule has ${mapped.graph.assignments.length} resource assignments, above the ${MAX_ASSIGNMENTS}-assignment import limit.`,
      },
    };
  }

  // 4. Validate / repair the graph (the SAME reject/repair/report step as the XER path).
  const validated = validateAndRepair(mapped.graph);

  // 4a. Defence-in-depth: the validated graph must satisfy the strict import-graph schema before it can
  // reach the persistence layer. The adapter/mapper are the trust boundary for attacker-controlled bytes;
  // a residual bug there is caught HERE as a typed reject rather than an opaque Prisma error at commit.
  const graphCheck = importGraphSchema.safeParse(validated.graph);
  if (!graphCheck.success) {
    return {
      ok: false,
      error: {
        stage: 'adapt',
        code: 'INCONSISTENT_GRAPH',
        message: 'The imported schedule could not be mapped to a consistent SchedulePoint graph.',
      },
    };
  }

  // 5. Build the report from the union of every stage's findings + the final mapped counts.
  const { approximations, repairs, drops } = bucketFindings([
    ...adapted.findings,
    ...mapped.findings,
    ...validated.findings,
  ]);

  const g = validated.graph;
  const wbsSummaries = g.activities.filter((a) => a.type === 'WBS_SUMMARY').length;
  const constraints = g.activities.reduce(
    (n, a) =>
      n + (a.constraintType !== null ? 1 : 0) + (a.secondaryConstraintType !== null ? 1 : 0),
    0,
  );

  const report: InterchangeReport = {
    detectedFormat: adapted.model.source.format,
    sourceVersion: adapted.model.source.version,
    sourceFilename: adapted.model.source.filename,
    mapped: {
      activities: g.activities.length - wbsSummaries,
      relationships: g.dependencies.length,
      calendars: g.calendars.length,
      ...(wbsSummaries > 0 ? { wbsSummaries } : {}),
      ...(constraints > 0 ? { constraints } : {}),
      ...(g.resources.length > 0 ? { resources: g.resources.length } : {}),
      ...(g.assignments.length > 0 ? { assignments: g.assignments.length } : {}),
    },
    approximations,
    repairs,
    drops,
  };

  return { ok: true, graph: validated.graph, report };
}
