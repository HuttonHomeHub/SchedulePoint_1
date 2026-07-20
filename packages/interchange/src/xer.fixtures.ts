/**
 * Test-only helpers for building small, well-formed XER files from structured input, so the mapper /
 * validate specs read as data, not as hand-typed tab soup. NOT exported from the package barrel — it is
 * imported directly by the `*.spec.ts` files. Pure string assembly; no I/O.
 */

/** A minimal table spec: a name, its field names, and its rows (each row aligned to the fields). */
export interface XerTableSpec {
  readonly name: string;
  readonly fields: readonly string[];
  readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

/** Assemble an `ERMHDR` + `%T/%F/%R` + `%E` XER document string from table specs. */
export function buildXer(tables: readonly XerTableSpec[], version = '18.8'): string {
  const lines: string[] = [
    `ERMHDR\t${version}\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD`,
  ];
  for (const table of tables) {
    lines.push(`%T\t${table.name}`);
    lines.push(`%F\t${table.fields.join('\t')}`);
    for (const row of table.rows) {
      lines.push(`%R\t${row.join('\t')}`);
    }
  }
  lines.push('%E');
  return lines.join('\n');
}

/**
 * A P6 `clndr_data` blob for a standard Mon–Fri 08:00–16:00 week (P6 day numbering 1=Sun…7=Sat), with an
 * optional list of `{ serial, working }` exceptions (serial = Excel/OLE day-number). A working exception
 * gets an 08:00–12:00 window; a non-working one gets none.
 */
export function standardClndrData(
  exceptions: ReadonlyArray<{ serial: number; working: boolean }> = [],
): string {
  const workDay = (day: number): string => `(0||${day}()( (0||0(s|08:00|f|16:00)) ))`;
  const restDay = (day: number): string => `(0||${day}()())`;
  const days = [
    restDay(1), // Sunday
    workDay(2), // Monday
    workDay(3),
    workDay(4),
    workDay(5),
    workDay(6), // Friday
    restDay(7), // Saturday
  ].join('');
  const exc = exceptions
    .map((e) => (e.working ? `(0||d|${e.serial}(s|08:00|f|12:00))` : `(0||d|${e.serial}()())`))
    .join('');
  return `(0||CalendarData()( (0||DaysOfWeek()( ${days} )) (0||Exceptions()( ${exc} )) ))`;
}
