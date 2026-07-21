/**
 * The **pure XER serialiser** (ADR-0050 M4, Task 4a.3) — the byte-level inverse of {@link parseXer}. It
 * turns an `ERMHDR` header + a list of typed tables into the tab-delimited `%T`/`%F`/`%R` block text a
 * Primavera XER file is, terminated by `%E`, encoded as UTF-8.
 *
 * **Encoding choice.** Legacy XER is Windows-1252; we deliberately emit **UTF-8** and advertise it in the
 * `ERMHDR` encoding field, so {@link parseXer} (which honours that hint) re-reads it byte-exact and **no
 * character is ever lost to a codepage substitution** — the safe, round-trip-clean choice for arbitrary
 * plan text. Modern P6 reads UTF-8 XER; the mapping contract documents this as a deliberate divergence
 * from the CP1252 tradition.
 *
 * **Sanitisation.** XER has no field quoting: a literal TAB would split a value into extra columns and a
 * newline would break the record. Field values are therefore sanitised — TAB and CR/LF collapse to a
 * single space — so the emitted file is always structurally valid and re-parses cleanly. It is pure and
 * deterministic: no I/O, clock or randomness.
 */

/** One table to emit: its name, its ordered `%F` field names, and its `%R` rows keyed by field name. */
export interface XerTableData {
  readonly name: string;
  readonly fields: readonly string[];
  /** Each row maps a field name to its raw string value; a missing field emits the empty string. */
  readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}

/** Everything needed to serialise a full XER document. */
export interface XerSerialiseInput {
  /** The P6 export/schema version written to `ERMHDR` field 1 (e.g. `"18.8"`). */
  readonly version: string;
  /** The export date written to `ERMHDR` field 2 (a `YYYY-MM-DD`); informational only. */
  readonly exportDate: string;
  /** The tables to emit, in order (PROJECT, CALENDAR, TASK, TASKPRED, … for the core network). */
  readonly tables: readonly XerTableData[];
}

/** Collapse TAB / CR / LF to a single space so a value can never break the tab-delimited record structure. */
function sanitiseField(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ');
}

/**
 * The `ERMHDR` header record. Field 1 is the version, field 2 the export date; the remaining fields are
 * conventional provenance columns with `UTF-8` last so {@link parseXer}'s encoding-hint scan resolves the
 * file as UTF-8. All tokens here are pure ASCII.
 */
function headerLine(version: string, exportDate: string): string {
  return [
    'ERMHDR',
    version,
    exportDate,
    'Project Management',
    'admin',
    'SchedulePoint',
    'SchedulePoint',
    'Project',
    'UTF-8',
  ].join('\t');
}

/** Serialise a header + tables into XER bytes (UTF-8). Pure + deterministic. */
export function serialiseXer(input: XerSerialiseInput): Uint8Array {
  const lines: string[] = [headerLine(input.version, input.exportDate)];

  for (const table of input.tables) {
    lines.push(`%T\t${table.name}`);
    lines.push(`%F\t${table.fields.join('\t')}`);
    for (const row of table.rows) {
      const values = table.fields.map((fieldName) => sanitiseField(row[fieldName] ?? ''));
      lines.push(`%R\t${values.join('\t')}`);
    }
  }

  lines.push('%E');
  // A trailing newline keeps the `%E` on its own terminated line (matches P6's output shape).
  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}
