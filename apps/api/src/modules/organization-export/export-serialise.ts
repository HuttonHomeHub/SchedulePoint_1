import { csvCell } from '@repo/interchange';

import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  csvPath,
  EXCLUDED_MODELS,
  EXPORT_FILES,
  EXPORT_FORMAT_NAME,
  EXPORT_FORMAT_VERSION,
  jsonPath,
  type ColumnKind,
  type ExportColumn,
  type ExportFile,
} from './export-columns';

/**
 * Pure serialisers for the organisation export (ADR-0194): a database row becomes a JSON object
 * or a CSV record, and the manifest and README are built from the registry. Nothing here touches
 * the database, a stream or the clock, so every rule is a unit test.
 *
 * Two rules carry the format's honesty. `BigInt` and `Decimal` are written as decimal **strings** —
 * `JSON.stringify` throws on a `BigInt`, and a `Decimal(18,4)` read as a JS number loses digits.
 * And the CSV formula guard touches `text` columns only: `-5.0000` must stay a number.
 */

/** Prisma's `Decimal`, structurally: the export never imports the decimal library. */
interface DecimalLike {
  toFixed(): string;
}

export type ExportRow = Readonly<Record<string, unknown>>;

/** The JSON value of one cell: strings for bigint, decimal, instants and dates; `null` stays `null`. */
export function jsonValue(kind: ColumnKind, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case 'bigint':
      return (value as bigint).toString();
    case 'decimal':
      // `toFixed()` with no argument is the full-precision, never-exponential decimal string.
      return (value as DecimalLike).toFixed();
    case 'instant':
      return (value as Date).toISOString();
    case 'date':
      return formatCalendarDate(value as Date);
    default:
      return value;
  }
}

/** One row as a JSON object with exactly the registry's columns, in the registry's order. */
export function jsonObject(file: ExportFile, row: ExportRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of file.columns)
    out[column.field] = jsonValue(column.kind, row[column.source ?? column.field]);
  return out;
}

/** One JSON-array element: a compact object on its own line, so a stream can write it row by row. */
export function jsonLine(file: ExportFile, row: ExportRow): string {
  return JSON.stringify(jsonObject(file, row));
}

/** What precedes element `index` of a JSON array: the opening bracket, or the comma after the last. */
export function jsonArrayPrefix(index: number): string {
  return index === 0 ? '[\n' : ',\n';
}

/** What closes a JSON array of `rows` elements. An empty array is `[]`, never a dangling bracket. */
export function jsonArraySuffix(rows: number): string {
  return rows === 0 ? '[]\n' : '\n]\n';
}

/** Excel needs the byte-order mark to read the file as UTF-8. */
export const CSV_BOM = '﻿';

const CSV_EOL = '\r\n';

function csvCellFor(column: ExportColumn, value: unknown): string {
  const cell = jsonValue(column.kind, value);
  if (cell === null) return '';
  // A `json` cell is compact JSON text and meets the formula guard like `text` does (a bare JSON `-5`
  // becomes `'-5`); numbers, dates and the rest never do. The JSON file is authoritative.
  if (column.kind === 'json') return csvCell(JSON.stringify(cell));
  if (column.kind === 'text') return csvCell(cell as string);
  // The rest are strings already (bigint, decimal, instant, date, enum) or a number or boolean.
  return typeof cell === 'string' ? cell : JSON.stringify(cell);
}

/** The CSV header: the same keys as the JSON objects. The BOM leads the first record only. */
export function csvHeader(file: ExportFile): string {
  return `${CSV_BOM}${file.columns.map((c) => c.field).join(',')}${CSV_EOL}`;
}

/** One CSV record, CRLF-terminated. */
export function csvRecord(file: ExportFile, row: ExportRow): string {
  return `${file.columns.map((c) => csvCellFor(c, row[c.source ?? c.field])).join(',')}${CSV_EOL}`;
}

export interface ManifestFileEntry {
  readonly path: string;
  /** The file's stem, as in the registry: `clients` for `json/clients.json`. */
  readonly file: string;
  readonly kind: 'json' | 'csv';
  readonly rows: number;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ManifestInput {
  readonly generatedAt: Date;
  readonly apiVersion: string;
  readonly organization: { readonly id: string; readonly slug: string; readonly name: string };
  readonly exportedBy: { readonly userId: string; readonly name: string };
  readonly files: readonly ManifestFileEntry[];
}

/** What one `excluded` entry in the manifest is about. A closed set: readers may rely on it. */
export type ExclusionScope = 'record-type' | 'column' | 'rows';

/**
 * What the export leaves out and why. `scope` is a stable enumeration; `name` and `reason` are for a
 * person to read and may be reworded. No database table name appears: the layout is not promised.
 */
export function exclusions(): { scope: ExclusionScope; name: string; reason: string }[] {
  const out: { scope: ExclusionScope; name: string; reason: string }[] = EXCLUDED_MODELS.map(
    (m) => ({ scope: 'record-type', name: m.label, reason: m.reason }),
  );
  for (const file of EXPORT_FILES) {
    for (const [field, reason] of Object.entries(file.withheld)) {
      out.push({ scope: 'column', name: `${file.file}.${field}`, reason });
    }
  }
  out.push(
    {
      scope: 'rows',
      name: 'people of other organisations',
      reason: 'Only people who are or were members of this organisation appear in people.',
    },
    {
      scope: 'rows',
      name: 'audit events with no organisation',
      reason: 'Sign-in and account events belong to a person, not to an organisation.',
    },
  );
  return out;
}

function stabilityOf(file: string): ExportFile['stability'] {
  return EXPORT_FILES.find((f) => f.file === file)?.stability ?? 'promised';
}

/** `manifest.json`, written last because it carries the counts and checksums only known at the end. */
export function buildManifest(input: ManifestInput): string {
  return `${JSON.stringify(
    {
      format: EXPORT_FORMAT_NAME,
      formatVersion: EXPORT_FORMAT_VERSION,
      generatedAt: input.generatedAt.toISOString(),
      generator: { product: 'SchedulePoint', apiVersion: input.apiVersion },
      organization: input.organization,
      exportedBy: input.exportedBy,
      snapshot: 'consistent',
      includesDeleted: true,
      files: input.files.map((f) => ({ ...f, stability: stabilityOf(f.file) })),
      excluded: exclusions(),
    },
    null,
    2,
  )}\n`;
}

/**
 * `README.txt`: the same text for every export of a format version, so it can be quoted in the
 * owner's guide. Built from the registry so the file list cannot drift from the files.
 */
export function buildReadme(): string {
  const lines = [
    `SchedulePoint organisation export, format ${EXPORT_FORMAT_VERSION}`,
    '',
    'This archive holds everything your organisation keeps in SchedulePoint, as it stood when the',
    'export was requested: clients, projects, plans, activities, links, calendars, resources,',
    'baselines, notes, history, share links, members and the audit log. Items in the recycle bin,',
    'removed members and withdrawn invitations are included, each with the date it was deleted.',
    '',
    'WHAT IS IN IT',
    '  json/   One JSON file per kind of record. This is the complete, exact copy.',
    '  csv/    The same records for a spreadsheet. The JSON is authoritative; the CSV is a view.',
    '  manifest.json  Lists every file with its row count, size and SHA-256 checksum, and lists',
    '                 what was deliberately left out and why. It is written last.',
    '',
    'HOW VALUES ARE WRITTEN',
    '  Times are ISO 8601 in UTC, for example 2026-10-14T09:30:00.000Z.',
    '  Calendar days are YYYY-MM-DD.',
    '  Money and quantities are decimal strings, never rounded. Money is in the minor unit of the',
    "  plan's currency (cents, pence); a plan with no currency has none stated.",
    '  Durations and lags are in minutes, as stored.',
    '  A missing value is null in JSON and an empty cell in CSV.',
    '  In CSV, text that starts with = + - or @ is prefixed with an apostrophe so a spreadsheet does',
    '  not run it as a formula. The JSON keeps the exact text.',
    '  Every file begins with a header row in CSV and is a JSON array in JSON.',
    '  Names carry their unit: ...Minutes, ...Days. Ids are opaque text; import id columns as text.',
    '  A spreadsheet cell holds at most 32,767 characters; a longer value is complete only in the JSON.',
    '  A CSV text cell may begin with an apostrophe the formula guard added. The JSON is exact.',
    '',
    'WHAT IS NOT IN IT',
    '  Passwords, sign-in sessions, invitation and share-link tokens, live editing locks, other',
    "  organisations' people, and the IP addresses and browser details of audit events. The",
    '  manifest lists each exclusion with its reason.',
    '',
    'The three records-* files are informational: they note what the product once did to the data',
    'and may change or disappear in a later version without notice.',
    '',
    'FILES',
    ...EXPORT_FILES.map(
      (f) =>
        `  ${jsonPath(f)}, ${csvPath(f)}${f.stability === 'informational' ? '  (informational)' : ''}`,
    ),
    '',
    'Readers should ignore files and keys they do not know: a newer format version may add them.',
    'The format is described in full in docs/ORGANISATION_EXPORT_FORMAT.md of the SchedulePoint',
    'repository.',
  ];
  return `${lines.join('\n')}\n`;
}
