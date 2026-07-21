import { importMspdi, type ImportMspdiResult } from './import-mspdi.js';
import { importXer, type ImportXerResult } from './import-xer.js';
import { detectMspdi } from './mspdi-parser.js';
import { detectXer } from './xer-parser.js';

/**
 * The **format-agnostic import entry point** (ADR-0050). The thin persisting layer hands untrusted bytes
 * here without caring which tool produced them: this detects the interchange format (Primavera P6 **XER**
 * vs Microsoft Project **MSPDI** XML) from the content and routes to the matching orchestrator. Both
 * produce the *same* {@link ImportGraph} + {@link InterchangeReport}, so the caller stays format-blind —
 * adding a format is a new parser, never a second call site.
 */
export interface ImportScheduleInput {
  /** The raw uploaded file (bytes preferred so each parser can honour its own encoding) or its text. */
  readonly content: Uint8Array | string;
  /** The original upload filename, for the report only — never used as a filesystem path. */
  readonly filename?: string | null;
  /** The HTTP-boundary byte cap, forwarded to whichever format parser handles the file. */
  readonly maxBytes?: number;
}

/** Identical union to each orchestrator's result — a domain-valid graph + report, or a typed rejection. */
export type ImportScheduleResult = ImportXerResult | ImportMspdiResult;

/**
 * Detect + route. XER is probed first (a cheap `ERMHDR` header check), then MSPDI (an XML `<Project>` with
 * the MS Project namespace). If neither matches, a single user-safe rejection is returned — it never
 * leaks which format probe failed or any internals.
 */
export function importSchedule(input: ImportScheduleInput): ImportScheduleResult {
  const { content, filename = null, maxBytes } = input;
  // Only attach `caps` when a byte cap was supplied (exactOptionalPropertyTypes forbids `caps: undefined`).
  const capsField = maxBytes === undefined ? {} : { caps: { maxBytes } };

  if (detectXer(content).ok) {
    return importXer({ content, filename, ...capsField });
  }
  if (detectMspdi(content).ok) {
    return importMspdi({ content, filename, ...capsField });
  }
  return {
    ok: false,
    error: {
      stage: 'parse',
      code: 'UNRECOGNISED_FORMAT',
      message:
        'This file is not a recognised schedule file. Import a Primavera P6 .xer or a Microsoft Project MSPDI .xml (export a .mpp to XML from Project first).',
    },
  };
}
