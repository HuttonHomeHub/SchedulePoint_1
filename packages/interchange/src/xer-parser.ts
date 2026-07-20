/**
 * The **pure XER tokeniser + format detector** (ADR-0050, Task 1.2).
 *
 * A Primavera P6 **XER** file is a tab-delimited text table dump: an `ERMHDR` header record on the first
 * line, then repeating table blocks (`%T` table name, `%F` field names, `%R` data rows), terminated by
 * `%E`. This module turns the raw bytes/string of such a file into a typed, format-specific document —
 * `{ header, tables }` — **without** interpreting the domain (that is the mapper, Task 1.3). It hard-rejects
 * anything that is not an XER, and it is hardened against untrusted input with byte/row/field caps.
 *
 * It is **pure and deterministic**: no I/O, no clock, no randomness, and it never evaluates any input as
 * code. Errors are returned as typed, user-safe values (a discriminated `XerParseResult`) — a caller never
 * has to catch a raw exception. Decoding honours the `ERMHDR` encoding hint (a UTF-8 BOM, or a recognised
 * `CP1252`/`UTF-8` field) and otherwise defaults to Windows-1252, XER's traditional codepage.
 */

// ---------------------------------------------------------------------------------------------------------
// Safety caps (untrusted-file input). Exceeding any cap returns a typed error, never an OOM.
// ---------------------------------------------------------------------------------------------------------

/** Tunable limits applied to a single parse. All are inclusive maxima; exceeding one returns an error. */
export interface XerParseCaps {
  /** Maximum decoded/raw input size. Larger input is rejected before any decode/allocation. */
  readonly maxBytes: number;
  /** Maximum total number of `%R` data rows across all tables. */
  readonly maxRows: number;
  /** Maximum tab-separated columns permitted on any single physical line (`%F`/`%R`). */
  readonly maxFieldsPerRow: number;
}

/**
 * Sane defaults tuned to the product's ~2,000-activity ceiling (a real 2k-activity XER is a few MiB and
 * tens of thousands of rows) with generous headroom, while still bounding a hostile file to a safe size.
 *
 * These are **coarse file-shape caps** (raw rows across every table, including out-of-scope ones), not
 * the domain graph ceiling. The authoritative activity/dependency limit is enforced downstream on the
 * mapped graph by `importXer` (`MAX_ACTIVITIES` / `MAX_DEPENDENCIES`, ADR-0050) — a file may parse under
 * `maxRows` yet still be rejected there if it maps to too large a network. `maxRows` therefore stays a
 * generous upper bound; the graph ceiling is the real gate.
 */
export const DEFAULT_XER_PARSE_CAPS: XerParseCaps = {
  maxBytes: 64 * 1024 * 1024, // 64 MiB
  maxRows: 1_000_000,
  maxFieldsPerRow: 1024,
};

// ---------------------------------------------------------------------------------------------------------
// Typed, user-safe errors (returned, never thrown).
// ---------------------------------------------------------------------------------------------------------

/**
 * The class of a parse rejection. Each maps cleanly to a user-facing outcome / HTTP status in the thin
 * NestJS module (e.g. `FILE_TOO_LARGE` → 413; `NOT_XER`/`MALFORMED_STRUCTURE`/`EMPTY_FILE` → 422).
 */
export const XER_PARSE_ERROR_CODES = [
  'EMPTY_FILE',
  'NOT_XER',
  'MALFORMED_STRUCTURE',
  'FILE_TOO_LARGE',
  'TOO_MANY_ROWS',
  'TOO_MANY_FIELDS',
] as const;
export type XerParseErrorCode = (typeof XER_PARSE_ERROR_CODES)[number];

/** A typed, user-safe rejection. `message` never leaks internals/stack; `line` aids diagnostics only. */
export interface XerParseError {
  readonly code: XerParseErrorCode;
  /** A short, user-safe reason (no internals, no stack). */
  readonly message: string;
  /** 1-based physical line number the problem was detected on, when attributable. */
  readonly line?: number;
}

// ---------------------------------------------------------------------------------------------------------
// Parsed document shape.
// ---------------------------------------------------------------------------------------------------------

/** The parsed `ERMHDR` header record. `fields` are the raw tab-separated fields after the `ERMHDR` token. */
export interface XerHeader {
  /** The P6 export/schema version (ERMHDR field 1), e.g. `"18.8"`. Always present on a valid XER. */
  readonly version: string;
  /** The export date field (ERMHDR field 2) verbatim, if present; not parsed into a `Date`. */
  readonly exportDate: string | null;
  /** The encoding actually used to decode the file: `"UTF-8"` or `"CP1252"` (Windows-1252). */
  readonly encoding: 'UTF-8' | 'CP1252';
  /** All ERMHDR fields after the record token, verbatim, for provenance/version reporting. */
  readonly fields: readonly string[];
}

/** One parsed table block: its name, its ordered field names (`%F`), and its data rows (`%R`). */
export interface XerTable {
  readonly name: string;
  readonly fields: readonly string[];
  /** Each row keyed by field name; values are the raw strings (positionally aligned to `fields`). */
  readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}

/**
 * A fully parsed XER document: the header plus every table, keyed by table name. Tables are kept
 * generically (not hard-coded to PROJECT/CALENDAR/TASK/TASKPRED) so unknown/future tables survive as rows.
 */
export interface XerDocument {
  readonly header: XerHeader;
  readonly tables: ReadonlyMap<string, XerTable>;
}

/** A discriminated result — success carries the document, failure carries a typed, user-safe error. */
export type XerParseResult =
  { ok: true; document: XerDocument } | { ok: false; error: XerParseError };

/** A discriminated result for detection only (header without the table body). */
export type XerDetectResult = { ok: true; header: XerHeader } | { ok: false; error: XerParseError };

/** Options for a parse/detect call. Missing caps fall back to {@link DEFAULT_XER_PARSE_CAPS}. */
export interface XerParseOptions {
  readonly caps?: Partial<XerParseCaps>;
}

// ---------------------------------------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------------------------------------

const ERMHDR_TOKEN = 'ERMHDR';
const UTF8_BOM: readonly [number, number, number] = [0xef, 0xbb, 0xbf];

/**
 * Recognised encoding labels (lower-cased) that may appear in `ERMHDR`, mapped to the encoding we decode
 * with. Windows-1252 is a superset of Latin-1/ISO-8859-1, so those aliases resolve to it (the safe choice
 * for legacy XER). Anything unrecognised is ignored and the CP1252 default applies.
 */
const KNOWN_ENCODINGS: Readonly<Record<string, 'UTF-8' | 'CP1252'>> = {
  'utf-8': 'UTF-8',
  utf8: 'UTF-8',
  cp1252: 'CP1252',
  'windows-1252': 'CP1252',
  win1252: 'CP1252',
  '1252': 'CP1252',
  latin1: 'CP1252',
  'latin-1': 'CP1252',
  'iso-8859-1': 'CP1252',
  'iso8859-1': 'CP1252',
};

function err(
  code: XerParseErrorCode,
  message: string,
  line?: number,
): { ok: false; error: XerParseError } {
  return { ok: false, error: line === undefined ? { code, message } : { code, message, line } };
}

function resolveCaps(caps: Partial<XerParseCaps> | undefined): XerParseCaps {
  return {
    maxBytes: caps?.maxBytes ?? DEFAULT_XER_PARSE_CAPS.maxBytes,
    maxRows: caps?.maxRows ?? DEFAULT_XER_PARSE_CAPS.maxRows,
    maxFieldsPerRow: caps?.maxFieldsPerRow ?? DEFAULT_XER_PARSE_CAPS.maxFieldsPerRow,
  };
}

/** Scan header fields for a recognised encoding label; return the resolved encoding or null. */
function encodingHintFromFields(fields: readonly string[]): 'UTF-8' | 'CP1252' | null {
  for (const field of fields) {
    const hit = KNOWN_ENCODINGS[field.trim().toLowerCase()];
    if (hit !== undefined) return hit;
  }
  return null;
}

/** Strip a trailing `\r` (a `\r\n` line ending survived the split-on-`\n`). */
function stripCr(value: string): string {
  return value.endsWith('\r') ? value.slice(0, -1) : value;
}

/** The tab-separated fields of the very first (header) line, for the encoding-hint pre-scan. */
function firstLineFields(text: string): string[] {
  const newlineAt = text.indexOf('\n');
  const firstLine = stripCr(newlineAt === -1 ? text : text.slice(0, newlineAt));
  return firstLine.split('\t');
}

/**
 * Decode raw input to text and resolve the encoding actually used. A `string` is treated as already
 * decoded (Unicode); a `Uint8Array` is decoded honouring a UTF-8 BOM, then the `ERMHDR` encoding hint,
 * then the Windows-1252 default. Header/record tokens and encoding labels are pure ASCII, so a provisional
 * Windows-1252 decode is always safe to read the header from before committing to the final decode.
 */
function decodeInput(
  input: Uint8Array | string,
  caps: XerParseCaps,
): { ok: true; text: string; encoding: 'UTF-8' | 'CP1252' } | { ok: false; error: XerParseError } {
  if (typeof input === 'string') {
    if (input.length > caps.maxBytes) {
      return err('FILE_TOO_LARGE', `File exceeds the maximum size of ${caps.maxBytes} bytes.`);
    }
    // A JS string is already Unicode; the encoding field is informational (default UTF-8).
    const text = input.startsWith('﻿') ? input.slice(1) : input;
    const encoding = encodingHintFromFields(firstLineFields(text)) ?? 'UTF-8';
    return { ok: true, text, encoding };
  }

  if (input.byteLength > caps.maxBytes) {
    return err('FILE_TOO_LARGE', `File exceeds the maximum size of ${caps.maxBytes} bytes.`);
  }

  const hasBom =
    input.byteLength >= 3 &&
    input[0] === UTF8_BOM[0] &&
    input[1] === UTF8_BOM[1] &&
    input[2] === UTF8_BOM[2];
  const body = hasBom ? input.subarray(3) : input;

  // Provisional Windows-1252 decode never throws and is byte-exact for the ASCII header line.
  const provisional = new TextDecoder('windows-1252').decode(body);
  const hint = encodingHintFromFields(firstLineFields(provisional));
  const encoding: 'UTF-8' | 'CP1252' = hasBom ? 'UTF-8' : (hint ?? 'CP1252');
  const text = encoding === 'UTF-8' ? new TextDecoder('utf-8').decode(body) : provisional;
  return { ok: true, text, encoding };
}

/** Parse and validate the `ERMHDR` first line into a header (the format signature check lives here). */
function parseHeader(
  text: string,
  encoding: 'UTF-8' | 'CP1252',
): { ok: true; header: XerHeader } | { ok: false; error: XerParseError } {
  const newlineAt = text.indexOf('\n');
  const firstLine = stripCr(newlineAt === -1 ? text : text.slice(0, newlineAt));
  const parts = firstLine.split('\t');

  if (parts[0] !== ERMHDR_TOKEN) {
    return err('NOT_XER', 'This is not a recognised Primavera XER file.', 1);
  }
  const version = parts[1];
  if (version === undefined || version.trim() === '') {
    return err('NOT_XER', 'This is not a recognised Primavera XER file (missing version).', 1);
  }
  const exportDate = parts[2] !== undefined && parts[2] !== '' ? parts[2] : null;
  return {
    ok: true,
    header: { version, exportDate, encoding, fields: parts.slice(1) },
  };
}

/** Normalise line endings and split into physical lines (a trailing empty line from a final `\n` is kept). */
function toLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

// ---------------------------------------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------------------------------------

/**
 * Detect whether `input` is a Primavera XER and, if so, extract its header (version + encoding). Reads only
 * the `ERMHDR` line — a cheap signature check that never parses the body. Non-XER input is hard-rejected.
 */
export function detectXer(input: Uint8Array | string, options?: XerParseOptions): XerDetectResult {
  const caps = resolveCaps(options?.caps);
  const decoded = decodeInput(input, caps);
  if (!decoded.ok) return decoded;
  if (decoded.text.trim() === '') {
    return err('EMPTY_FILE', 'The file is empty.');
  }
  const header = parseHeader(decoded.text, decoded.encoding);
  if (!header.ok) return header;
  return { ok: true, header: header.header };
}

/**
 * Parse an XER file into a typed `{ header, tables }` document. Tables are parsed generically (every `%T`
 * block, not only the M1 core four) so unknown tables survive as rows for later milestones. All structural
 * problems (missing `ERMHDR`, `%R` before `%F`, an unknown record token, a truncated file with no `%E`,
 * a cap breach) are returned as a typed {@link XerParseError} — the caller never catches a raw exception.
 */
export function parseXer(input: Uint8Array | string, options?: XerParseOptions): XerParseResult {
  const caps = resolveCaps(options?.caps);

  const decoded = decodeInput(input, caps);
  if (!decoded.ok) return decoded;
  if (decoded.text.trim() === '') {
    return err('EMPTY_FILE', 'The file is empty.');
  }

  const headerResult = parseHeader(decoded.text, decoded.encoding);
  if (!headerResult.ok) return headerResult;

  const lines = toLines(decoded.text);

  const tables = new Map<string, XerTable>();
  let currentTable: { name: string; fields: string[]; rows: Array<Record<string, string>> } | null =
    null;
  let currentRow: Record<string, string> | null = null;
  let lastFieldName: string | null = null;
  let totalRows = 0;
  let sawEnd = false;

  // Line 0 is the header, already parsed; the body starts at line index 1.
  for (let i = 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    const lineNo = i + 1;

    if (sawEnd) break; // `%E` terminates the file; ignore any trailing content.
    if (raw === '') continue; // skip blank separator lines.

    const cols = raw.split('\t');
    if (cols.length > caps.maxFieldsPerRow) {
      return err(
        'TOO_MANY_FIELDS',
        `A record exceeds the maximum of ${caps.maxFieldsPerRow} fields.`,
        lineNo,
      );
    }
    const token = cols[0] ?? '';

    if (token === '%T') {
      const name = cols[1];
      if (name === undefined || name === '') {
        return err(
          'MALFORMED_STRUCTURE',
          'A table declaration (%T) is missing its table name.',
          lineNo,
        );
      }
      currentTable = { name, fields: [], rows: [] };
      tables.set(name, currentTable);
      currentRow = null;
      lastFieldName = null;
      continue;
    }

    if (token === '%F') {
      if (currentTable === null) {
        return err(
          'MALFORMED_STRUCTURE',
          'A field list (%F) appeared before any table (%T).',
          lineNo,
        );
      }
      currentTable.fields = cols.slice(1);
      currentRow = null;
      lastFieldName = null;
      continue;
    }

    if (token === '%R') {
      if (currentTable === null) {
        return err(
          'MALFORMED_STRUCTURE',
          'A data row (%R) appeared before any table (%T).',
          lineNo,
        );
      }
      if (currentTable.fields.length === 0) {
        return err(
          'MALFORMED_STRUCTURE',
          'A data row (%R) appeared before its field list (%F).',
          lineNo,
        );
      }
      const values = cols.slice(1);
      if (values.length > currentTable.fields.length) {
        return err(
          'MALFORMED_STRUCTURE',
          'A data row (%R) has more values than declared fields.',
          lineNo,
        );
      }
      totalRows += 1;
      if (totalRows > caps.maxRows) {
        return err(
          'TOO_MANY_ROWS',
          `File exceeds the maximum of ${caps.maxRows} data rows.`,
          lineNo,
        );
      }
      const row: Record<string, string> = {};
      for (let f = 0; f < currentTable.fields.length; f += 1) {
        const fieldName = currentTable.fields[f];
        if (fieldName === undefined) continue;
        row[fieldName] = values[f] ?? '';
      }
      currentTable.rows.push(row);
      currentRow = row;
      lastFieldName = currentTable.fields[currentTable.fields.length - 1] ?? null;
      continue;
    }

    if (token === '%E') {
      sawEnd = true;
      continue;
    }

    if (token.startsWith('%')) {
      return err('MALFORMED_STRUCTURE', `Unrecognised record type "${token}".`, lineNo);
    }

    // A line with no record token is an embedded newline in the previous row's last field (XER has no
    // quoting for multi-line memo fields); reattach it. Anywhere else it is garbage/corruption.
    if (currentRow !== null && lastFieldName !== null) {
      currentRow[lastFieldName] = `${currentRow[lastFieldName] ?? ''}\n${raw}`;
      continue;
    }
    return err('MALFORMED_STRUCTURE', 'Unexpected content outside any record.', lineNo);
  }

  if (!sawEnd) {
    return err('MALFORMED_STRUCTURE', 'The file is truncated (missing the %E end-of-file marker).');
  }

  return { ok: true, document: { header: headerResult.header, tables } };
}
