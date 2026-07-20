import type { ActivitySummary } from '@repo/types';

import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
} from '@/features/activities';
import { formatMoney } from '@/lib/format-money';

/**
 * The pure, DOM-free **Schedule CSV** serialiser for the TSLD export deliverables (spec
 * `docs/specs/export-print/`, behind `VITE_EXPORT_PRINT`). Like `render/lenses.ts` it has no canvas,
 * React or data-fetching dependency — it only projects the already-shipped `ActivitySummary` columns
 * the activities table consumes into an Excel-friendly, injection-safe CSV, so it is exhaustively
 * unit-tested. `use-tsld-toolbar-context` wires it into `downloadBlob` + the announcer.
 *
 * Format contract (§2 Validation / §Success criteria): one header row + one row per activity in the
 * activities-table column order; ISO `YYYY-MM-DD` dates; integer floats/durations; booleans `Yes`/`No`;
 * `null` → blank cell; money via `lib/format-money` (blank when the API projected `null` — cost fields
 * are already `null` for non-`cost:read` callers, so the CSV cannot leak them); **RFC-4180** quoting;
 * an **OWASP formula-injection** guard on every cell; and a leading **UTF-8 BOM** so Excel reads UTF-8.
 */

/** Which activity set the export covers (CQ-3): the whole plan, or just the lens-narrowed subset. */
export type ExportScope = 'all' | 'matching';

/** The leading UTF-8 byte-order mark — Excel reads a `.csv` as UTF-8 only when it is present, so
 * non-ASCII activity names don't mojibake (§Success criteria). */
export const CSV_BOM = '\uFEFF';

/** RFC-4180 uses CRLF line endings between records. */
const CSV_NEWLINE = '\r\n';

/** The context a column cell may read beyond the activity itself — the client-side WBS-parent resolver
 * (the parent activity's code/name, looked up from `parentId` by the caller who holds the full list). */
export interface CsvCellContext {
  resolveWbsParent: (parentId: string | null) => string;
}

/** One CSV column: a header plus a pure projection of an activity (and the shared {@link CsvCellContext})
 * to a raw string cell (pre-quoting). */
export interface ScheduleColumn {
  header: string;
  cell: (activity: ActivitySummary, ctx: CsvCellContext) => string;
}

/** An engine-owned integer (float / duration) as a string, or blank when it is `null` (uncalculated). */
function intCell(value: number | null): string {
  return value === null ? '' : String(value);
}

/** An ISO date as-is (already `YYYY-MM-DD`), or blank when it is `null` (uncalculated / unset). */
function dateCell(value: string | null): string {
  return value ?? '';
}

/** A conditionally-projected money amount (minor units): blank when `null` (unset OR the caller lacked
 * `cost:read`, so nothing leaks), else the plain grouped-decimal `format-money` rendering. */
function moneyCell(minorUnits: number | null): string {
  return minorUnits === null ? '' : formatMoney(minorUnits, null);
}

/**
 * The Schedule CSV columns. This is a deliberate **planner/QS-oriented superset** of the responsive
 * `ActivitiesTable.tsx` column set — NOT sourced from it and NOT kept in parity: the table folds or
 * omits columns for on-screen density, whereas the CSV adds the fields a spreadsheet consumer wants
 * regardless (Status, Free float, the Constraint type/date split, the WBS parent, and Budgeted/Actual
 * expense). Treat the two column sets as independent by design — do not "re-sync" the CSV to the table.
 * Each cell is a pure projection of a shipped `ActivitySummary` field. Only the WBS-parent column reads
 * the {@link CsvCellContext}; the rest take one argument (fewer-param functions assign cleanly to the
 * two-param `cell` type).
 */
export const SCHEDULE_COLUMNS: readonly ScheduleColumn[] = [
  { header: 'Code', cell: (a) => a.code ?? '' },
  { header: 'Name', cell: (a) => a.name },
  { header: 'Type', cell: (a) => ACTIVITY_TYPE_LABELS[a.type] },
  { header: 'Duration (days)', cell: (a) => String(a.durationDays) },
  { header: 'Status', cell: (a) => ACTIVITY_STATUS_LABELS[a.status] },
  { header: '% complete', cell: (a) => String(a.percentComplete) },
  { header: 'Early start', cell: (a) => dateCell(a.earlyStart) },
  { header: 'Early finish', cell: (a) => dateCell(a.earlyFinish) },
  { header: 'Late start', cell: (a) => dateCell(a.lateStart) },
  { header: 'Late finish', cell: (a) => dateCell(a.lateFinish) },
  { header: 'Total float', cell: (a) => intCell(a.totalFloat) },
  { header: 'Free float', cell: (a) => intCell(a.freeFloat) },
  { header: 'Critical', cell: (a) => (a.isCritical ? 'Yes' : 'No') },
  {
    header: 'Constraint type',
    cell: (a) => (a.constraintType ? CONSTRAINT_TYPE_LABELS[a.constraintType] : ''),
  },
  { header: 'Constraint date', cell: (a) => dateCell(a.constraintDate) },
  { header: 'WBS parent', cell: (a, ctx) => ctx.resolveWbsParent(a.parentId) },
  { header: 'Budgeted expense', cell: (a) => moneyCell(a.budgetedExpense) },
  { header: 'Actual expense', cell: (a) => moneyCell(a.actualExpense) },
];

/** The characters whose PRESENCE anywhere in a cell forces RFC-4180 quoting. */
const CSV_QUOTE_TRIGGER = /["\n\r,]/;

/** Leading characters that make Excel/Sheets treat the cell as a **formula**, so a crafted activity name
 * like `=cmd|…` could execute on open (OWASP CSV/formula injection). Prefixing a single apostrophe
 * neutralises it — the tools then render the literal text. Includes TAB and CR, which some parsers strip
 * before evaluating, re-exposing a following formula char. */
const CSV_INJECTION_PREFIXES = new Set(['=', '+', '-', '@', '\t', '\r']);

/** A cell whose first NON-whitespace character is a formula trigger (`= + - @`). Excel/Sheets trim
 * leading spaces before evaluating, so `" =1+1"` is still a live formula — the bare first-char check
 * (`CSV_INJECTION_PREFIXES`) would miss it (§2 Validation "trim"). We DETECT the leading-whitespace case
 * (and prefix), but never rewrite the value's whitespace, so no stored data is altered (security S1). */
const CSV_LEADING_FORMULA = /^\s*[=+\-@]/;

/**
 * Turn a raw cell string into a CSV field: **first** neutralise a formula-injection prefix (a leading
 * `= + - @`, TAB or CR — or a `= + - @` after only leading whitespace — gets a single apostrophe),
 * **then** apply RFC-4180 quoting (wrap in double quotes and double any embedded quote when the value
 * contains a quote, comma, CR or LF). Order matters — the apostrophe is added inside the eventual quotes,
 * so `=SUM(A1)` → `'=SUM(A1)` → (no comma/quote) stays unquoted `'=SUM(A1)`, while `a,b` → `"a,b"`.
 */
export function csvCell(value: string): string {
  let cell = value;
  const first = cell.charAt(0);
  if ((first !== '' && CSV_INJECTION_PREFIXES.has(first)) || CSV_LEADING_FORMULA.test(cell)) {
    cell = `'${cell}`;
  }
  if (CSV_QUOTE_TRIGGER.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Join one row's raw cells into an RFC-4180 record (each cell neutralised + quoted). */
function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * Build the Schedule CSV string for a plan's activities. When `scope` is `'matching'` and an `isMatching`
 * predicate is supplied, only the matching (lens-narrowed) activities are written (CQ-3); otherwise every
 * activity is. `resolveWbsParent` resolves the WBS-parent column client-side from the caller's full list.
 * The result leads with the UTF-8 BOM and uses CRLF records — ready to hand straight to a `text/csv` blob.
 */
export function buildScheduleCsv(
  activities: readonly ActivitySummary[],
  options: {
    scope: ExportScope;
    resolveWbsParent: (parentId: string | null) => string;
    /** Predicate marking the lens-narrowed subset; consulted only when `scope` is `'matching'`. */
    isMatching?: ((activity: ActivitySummary) => boolean) | undefined;
  },
): string {
  const { scope, resolveWbsParent, isMatching } = options;
  const rows =
    scope === 'matching' && isMatching ? activities.filter((a) => isMatching(a)) : activities;
  const ctx: CsvCellContext = { resolveWbsParent };

  const lines: string[] = [csvRow(SCHEDULE_COLUMNS.map((column) => column.header))];
  for (const activity of rows) {
    lines.push(csvRow(SCHEDULE_COLUMNS.map((column) => column.cell(activity, ctx))));
  }
  return CSV_BOM + lines.join(CSV_NEWLINE);
}
