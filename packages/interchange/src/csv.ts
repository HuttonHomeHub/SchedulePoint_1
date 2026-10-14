/**
 * The CSV cell guard, shared by the browser's Schedule CSV and the organisation export (ADR-0194).
 * Pure and DOM-free so both sides apply one formula-injection rule rather than two that drift.
 */

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
