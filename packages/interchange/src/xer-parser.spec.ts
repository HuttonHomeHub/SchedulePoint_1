import { describe, expect, it } from 'vitest';

import {
  DEFAULT_XER_PARSE_CAPS,
  detectXer,
  parseXer,
  type XerDetectResult,
  type XerParseError,
  type XerParseResult,
} from './xer-parser.js';

/**
 * Exhaustive, fixture-driven tests for the pure XER parser + detector (Task 1.2). XER is tab-delimited
 * with NO quoting mechanism, so fixtures are built from explicit tab/newline joins. Covers: valid single-
 * and multi-table files, generic/unknown tables, positional field edge cases, every malformed branch,
 * encoding (CP1252 default, an ERMHDR hint, a UTF-8 BOM) and every safety cap. Domain/mapping semantics
 * are deliberately NOT tested here (that is Task 1.3).
 */

// --- fixture builders --------------------------------------------------------------------------------

/** Join cells into one tab-delimited physical line. */
const t = (...cells: string[]): string => cells.join('\t');
/** Join physical lines into an XER document body. */
const xer = (...lines: string[]): string => lines.join('\n');

const ERMHDR = t(
  'ERMHDR',
  '18.8',
  '2026-01-05',
  'Project',
  'admin',
  'PMDB',
  'dbxDatabaseNoName',
  'Project Management',
  'USD',
);

const VALID_MINIMAL = xer(
  ERMHDR,
  t('%T', 'PROJECT'),
  t('%F', 'proj_id', 'proj_short_name', 'plan_start_date'),
  t('%R', '1001', 'APARTMENTS', '2026-01-05 08:00'),
  t('%T', 'CALENDAR'),
  t('%F', 'clndr_id', 'clndr_name', 'day_hr_cnt'),
  t('%R', '1', 'Standard 5-Day Workweek', '8'),
  t('%T', 'TASK'),
  t('%F', 'task_id', 'task_code', 'task_name', 'task_type', 'target_drtn_hr_cnt'),
  t('%R', '2001', 'A1000', 'Mobilise', 'TT_Task', '40'),
  t('%R', '2002', 'A1010', 'Complete', 'TT_FinMile', '0'),
  t('%T', 'TASKPRED'),
  t('%F', 'task_pred_id', 'task_id', 'pred_task_id', 'pred_type', 'lag_hr_cnt'),
  t('%R', '3001', '2002', '2001', 'PR_FS', '0'),
  '%E',
);

// --- narrowing helpers -------------------------------------------------------------------------------

function expectFailure(result: XerParseResult | XerDetectResult): XerParseError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a failure result');
  return result.error;
}

function expectDocument(result: XerParseResult): Extract<XerParseResult, { ok: true }>['document'] {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
  return result.document;
}

/** Materialise a parsed row (a `Map`, so untrusted column names can't be object keys) for assertions. */
function rowObject(row: ReadonlyMap<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(row ?? new Map<string, string>());
}

// --- CP1252 / UTF-8 byte encoders (for the encoding fixtures) ----------------------------------------

const CP1252_HIGH: Readonly<Record<string, number>> = {
  '’': 0x92, // distinguishes real Windows-1252 from raw Latin-1 (which has no glyph here)
  '£': 0xa3,
  é: 0xe9,
  '€': 0x80,
};

function encodeCp1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    bytes.push(CP1252_HIGH[ch] ?? ch.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
}

function encodeUtf8WithBom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

// =====================================================================================================

describe('detectXer', () => {
  it('recognises a valid XER and extracts version + encoding (string ⇒ UTF-8 default)', () => {
    const result = detectXer(VALID_MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.header.version).toBe('18.8');
    expect(result.header.exportDate).toBe('2026-01-05');
    expect(result.header.encoding).toBe('UTF-8');
    expect(result.header.fields[0]).toBe('18.8');
  });

  it('honours a recognised encoding label in ERMHDR (CP1252) even for a string', () => {
    const withHint = xer(t('ERMHDR', '18.8', '2026-01-05', 'CP1252'), '%E');
    const result = detectXer(withHint);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.header.encoding).toBe('CP1252');
  });

  it('rejects a file whose first line is not ERMHDR', () => {
    expect(expectFailure(detectXer('not an xer file at all\nmore junk')).code).toBe('NOT_XER');
  });

  it('rejects an ERMHDR with no version field', () => {
    expect(expectFailure(detectXer('ERMHDR')).code).toBe('NOT_XER');
    expect(expectFailure(detectXer('ERMHDR\t')).code).toBe('NOT_XER');
  });

  it('rejects an empty / whitespace-only file', () => {
    expect(expectFailure(detectXer('')).code).toBe('EMPTY_FILE');
    expect(expectFailure(detectXer('   \n\t \n')).code).toBe('EMPTY_FILE');
  });
});

describe('parseXer — valid documents', () => {
  it('parses the four M1 core tables into typed rows keyed by field name', () => {
    const doc = expectDocument(parseXer(VALID_MINIMAL));

    expect(doc.header.version).toBe('18.8');
    expect([...doc.tables.keys()]).toEqual(['PROJECT', 'CALENDAR', 'TASK', 'TASKPRED']);

    const task = doc.tables.get('TASK');
    expect(task?.fields).toEqual([
      'task_id',
      'task_code',
      'task_name',
      'task_type',
      'target_drtn_hr_cnt',
    ]);
    expect(task?.rows).toHaveLength(2);
    expect(rowObject(task?.rows[0])).toEqual({
      task_id: '2001',
      task_code: 'A1000',
      task_name: 'Mobilise',
      task_type: 'TT_Task',
      target_drtn_hr_cnt: '40',
    });

    const pred = doc.tables.get('TASKPRED');
    expect(pred?.rows[0]?.get('pred_type')).toBe('PR_FS');
    expect(pred?.rows[0]?.get('lag_hr_cnt')).toBe('0');
  });

  it('parses unknown/future tables generically (not hard-coded to the core four)', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'PROJWBS'),
          t('%F', 'wbs_id', 'wbs_name'),
          t('%R', '9001', 'Substructure'),
          t('%T', 'UDFVALUE'),
          t('%F', 'udf_id', 'udf_text'),
          t('%R', '5', 'custom'),
          '%E',
        ),
      ),
    );
    expect(doc.tables.has('PROJWBS')).toBe(true);
    expect(doc.tables.get('UDFVALUE')?.rows[0]?.get('udf_text')).toBe('custom');
  });

  it('accepts a header-only file (no tables) and a trailing newline after %E', () => {
    const doc = expectDocument(parseXer(xer(ERMHDR, '%E', '')));
    expect(doc.tables.size).toBe(0);
  });

  it('treats an empty cell (consecutive tabs) as an empty-string value', () => {
    const doc = expectDocument(
      parseXer(
        xer(ERMHDR, t('%T', 'TASK'), t('%F', 'task_id', 'task_code'), t('%R', '2001', ''), '%E'),
      ),
    );
    expect(rowObject(doc.tables.get('TASK')?.rows[0])).toEqual({ task_id: '2001', task_code: '' });
  });

  it('pads a short row (fewer values than fields) with empty strings', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'TASK'),
          t('%F', 'task_id', 'task_code', 'task_name'),
          t('%R', '2001'),
          '%E',
        ),
      ),
    );
    expect(rowObject(doc.tables.get('TASK')?.rows[0])).toEqual({
      task_id: '2001',
      task_code: '',
      task_name: '',
    });
  });

  it('treats a double-quote as ordinary data (XER has no quoting)', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'TASK'),
          t('%F', 'task_id', 'task_name'),
          t('%R', '2001', 'Say "hi" now'),
          '%E',
        ),
      ),
    );
    expect(doc.tables.get('TASK')?.rows[0]?.get('task_name')).toBe('Say "hi" now');
  });

  it('reattaches an embedded newline in a field as a continuation line', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'TASK'),
          t('%F', 'task_id', 'notes'),
          t('%R', '2001', 'First line'),
          'Second line',
          '%E',
        ),
      ),
    );
    expect(doc.tables.get('TASK')?.rows[0]?.get('notes')).toBe('First line\nSecond line');
  });

  it('handles CRLF line endings', () => {
    const doc = expectDocument(parseXer(VALID_MINIMAL.replace(/\n/g, '\r\n')));
    expect(doc.tables.get('TASK')?.rows).toHaveLength(2);
  });
});

describe('parseXer — malformed input is rejected with a typed error', () => {
  it('rejects a missing ERMHDR header', () => {
    expect(expectFailure(parseXer(xer(t('%T', 'TASK'), '%E'))).code).toBe('NOT_XER');
  });

  it('rejects an empty file', () => {
    expect(expectFailure(parseXer('')).code).toBe('EMPTY_FILE');
  });

  it('rejects %R before its %F', () => {
    const e = expectFailure(parseXer(xer(ERMHDR, t('%T', 'TASK'), t('%R', '2001', 'x'), '%E')));
    expect(e.code).toBe('MALFORMED_STRUCTURE');
    expect(e.line).toBe(3);
  });

  it('rejects %F before any %T', () => {
    expect(expectFailure(parseXer(xer(ERMHDR, t('%F', 'a', 'b'), '%E'))).code).toBe(
      'MALFORMED_STRUCTURE',
    );
  });

  it('rejects %R before any %T', () => {
    expect(expectFailure(parseXer(xer(ERMHDR, t('%R', '1', '2'), '%E'))).code).toBe(
      'MALFORMED_STRUCTURE',
    );
  });

  it('rejects a %T with no table name', () => {
    expect(expectFailure(parseXer(xer(ERMHDR, '%T', '%E'))).code).toBe('MALFORMED_STRUCTURE');
  });

  it('rejects a row with more values than declared fields', () => {
    const e = expectFailure(
      parseXer(xer(ERMHDR, t('%T', 'TASK'), t('%F', 'task_id'), t('%R', '2001', 'extra'), '%E')),
    );
    expect(e.code).toBe('MALFORMED_STRUCTURE');
  });

  it('rejects an unrecognised record token', () => {
    expect(expectFailure(parseXer(xer(ERMHDR, t('%Q', 'junk'), '%E'))).code).toBe(
      'MALFORMED_STRUCTURE',
    );
  });

  it('rejects garbage content outside any record', () => {
    expect(expectFailure(parseXer(xer(ERMHDR, 'garbage bytes here', '%E'))).code).toBe(
      'MALFORMED_STRUCTURE',
    );
  });

  it('rejects a truncated file with no %E terminator', () => {
    const e = expectFailure(
      parseXer(xer(ERMHDR, t('%T', 'TASK'), t('%F', 'task_id'), t('%R', '2001'))),
    );
    expect(e.code).toBe('MALFORMED_STRUCTURE');
    expect(e.message).toContain('%E');
  });
});

describe('parseXer — safety caps', () => {
  it('rejects input over the byte cap (string path)', () => {
    expect(expectFailure(parseXer(VALID_MINIMAL, { caps: { maxBytes: 10 } })).code).toBe(
      'FILE_TOO_LARGE',
    );
  });

  it('rejects input over the byte cap (bytes path)', () => {
    const bytes = encodeCp1252(VALID_MINIMAL);
    expect(expectFailure(parseXer(bytes, { caps: { maxBytes: 10 } })).code).toBe('FILE_TOO_LARGE');
  });

  it('rejects too many data rows', () => {
    const e = expectFailure(parseXer(VALID_MINIMAL, { caps: { maxRows: 1 } }));
    expect(e.code).toBe('TOO_MANY_ROWS');
  });

  it('rejects a record with too many fields', () => {
    expect(expectFailure(parseXer(VALID_MINIMAL, { caps: { maxFieldsPerRow: 3 } })).code).toBe(
      'TOO_MANY_FIELDS',
    );
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_XER_PARSE_CAPS.maxBytes).toBeGreaterThan(0);
    expect(DEFAULT_XER_PARSE_CAPS.maxRows).toBeGreaterThan(0);
    expect(DEFAULT_XER_PARSE_CAPS.maxFieldsPerRow).toBeGreaterThan(0);
  });
});

describe('parseXer — encoding', () => {
  it('decodes CP1252 high bytes by default for byte input (byte-distinct from Latin-1)', () => {
    const source = xer(
      ERMHDR,
      t('%T', 'TASK'),
      t('%F', 'task_id', 'task_name'),
      t('%R', '2001', 'Café £2m ’24'),
      '%E',
    );
    const doc = expectDocument(parseXer(encodeCp1252(source)));
    expect(doc.header.encoding).toBe('CP1252');
    expect(doc.tables.get('TASK')?.rows[0]?.get('task_name')).toBe('Café £2m ’24');
  });

  it('honours a UTF-8 BOM (decodes multi-byte characters as UTF-8)', () => {
    const source = xer(
      ERMHDR,
      t('%T', 'TASK'),
      t('%F', 'task_id', 'task_name'),
      t('%R', '2001', 'Café résumé'),
      '%E',
    );
    const doc = expectDocument(parseXer(encodeUtf8WithBom(source)));
    expect(doc.header.encoding).toBe('UTF-8');
    expect(doc.tables.get('TASK')?.rows[0]?.get('task_name')).toBe('Café résumé');
  });

  it('honours a UTF-8 ERMHDR hint over the CP1252 default for byte input', () => {
    const header = t('ERMHDR', '18.8', '2026-01-05', 'UTF-8');
    const source = xer(
      header,
      t('%T', 'TASK'),
      t('%F', 'task_id', 'task_name'),
      t('%R', '2001', 'Café'),
      '%E',
    );
    // Encode as real UTF-8 (é = 0xC3 0xA9); a CP1252 mis-decode would yield "Ã©".
    const bytes = new TextEncoder().encode(source);
    const doc = expectDocument(parseXer(bytes));
    expect(doc.header.encoding).toBe('UTF-8');
    expect(doc.tables.get('TASK')?.rows[0]?.get('task_name')).toBe('Café');
  });
});

describe('parseXer — prototype-pollution hardening', () => {
  // A `%F` field list is attacker-controlled. Rows are a `Map`, not a plain object, so a crafted column
  // named `__proto__` (or `constructor` / `prototype`) is stored as an ordinary, inert Map entry and can
  // never reach `Object.prototype` through a keyed object write (remote property injection).
  it('stores a `__proto__` column as an inert Map entry, not a prototype write', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'TASK'),
          t('%F', 'task_id', '__proto__', 'task_name'),
          t('%R', '2001', 'polluted', 'Mobilise'),
          '%E',
        ),
      ),
    );

    const row = doc.tables.get('TASK')?.rows[0];
    expect(row?.get('task_id')).toBe('2001');
    expect(row?.get('task_name')).toBe('Mobilise');
    // The value lives on the Map as a normal entry — never on any object's prototype…
    expect(row?.get('__proto__')).toBe('polluted');
    expect(Object.getPrototypeOf(row?.get('task_id'))).toBe(String.prototype);
    // …and nothing, anywhere, gained a polluted `polluted` property.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('stores `constructor` / `prototype` columns as inert Map entries too', () => {
    const doc = expectDocument(
      parseXer(
        xer(
          ERMHDR,
          t('%T', 'TASK'),
          t('%F', 'task_id', 'constructor', 'prototype'),
          t('%R', '2001', 'x', 'y'),
          '%E',
        ),
      ),
    );

    const row = doc.tables.get('TASK')?.rows[0];
    expect(row?.get('task_id')).toBe('2001');
    expect(row?.get('constructor')).toBe('x');
    expect(row?.get('prototype')).toBe('y');
    // A fresh object's constructor is untouched by the import.
    expect({}.constructor).toBe(Object);
  });
});
