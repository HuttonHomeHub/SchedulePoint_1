/**
 * Money formatting + form-input conversion for the Earned-Value surface (EV4b, ADR-0042).
 *
 * Money on the wire is **integer minor units** (the smallest unit of the currency) in a plan's
 * `currencyCode`. Display and form entry are in **major units** (e.g. dollars, not cents).
 *
 * LIMITATION — 2-decimal currencies only. We assume every currency has exactly two minor digits
 * (`÷100` / `×100`), which is true for the overwhelming majority (USD, EUR, GBP, …) but not all:
 * zero-decimal currencies (JPY, KRW) and three-decimal ones (BHD, KWD) are shown/entered off by a
 * factor. Handling per-currency minor units (`Intl.NumberFormat().resolvedOptions().maximumFractionDigits`)
 * is a later refinement; until then a plan should use a 2-decimal currency for accurate figures.
 */

/** Minor units per major unit under the 2-decimal assumption (see the file limitation). */
export const MINOR_UNITS_PER_MAJOR = 100;

// Building an `Intl.NumberFormat` is not free, and the EV table formats money per cell across many
// rows, so the per-currency formatters are memoised. A `null` currency (unset — inherit the org
// default at read time) uses a plain grouped-decimal formatter with no currency symbol.
const currencyFormatters = new Map<string, Intl.NumberFormat>();
let plainFormatter: Intl.NumberFormat | undefined;

function currencyFormatter(currencyCode: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currencyCode);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: currencyCode,
        // `narrowSymbol` renders the bare symbol ("$1,234.56") rather than the locale-disambiguated
        // form ("US$1,234.56") en-GB uses by default — the figure reads as its own currency, and the
        // output is stable across ICU builds (which vary the default symbol form).
        currencyDisplay: 'narrowSymbol',
      });
    } catch {
      // An unrecognised code (never validated here) shouldn't throw at the display boundary — fall
      // back to a plain grouped number so a figure is still legible.
      formatter = plainNumberFormatter();
    }
    currencyFormatters.set(currencyCode, formatter);
  }
  return formatter;
}

function plainNumberFormatter(): Intl.NumberFormat {
  plainFormatter ??= new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return plainFormatter;
}

/**
 * Format an integer **minor-units** amount for display in major units. `null` (unset, or the caller
 * lacked `cost:read`) renders as an em dash. With a `currencyCode` the amount is shown in that
 * currency's style (symbol + grouping); without one (`null`) it's a plain grouped decimal so a figure
 * is still readable before a plan currency is chosen.
 */
export function formatMoney(minorUnits: number | null, currencyCode: string | null): string {
  if (minorUnits === null) return '—';
  const major = minorUnits / MINOR_UNITS_PER_MAJOR;
  return currencyCode
    ? currencyFormatter(currencyCode).format(major)
    : plainNumberFormatter().format(major);
}

/**
 * Seed a money form field from a stored **minor-units** value: divide to major units for entry, or
 * `undefined` when the value is `null` (unset / not-permitted) so the field renders blank. The `×100`
 * inverse ({@link majorInputToMinor}) is applied on submit, so an untouched field round-trips exactly.
 */
export function minorToMajorInput(minorUnits: number | null | undefined): number | undefined {
  return minorUnits === null || minorUnits === undefined
    ? undefined
    : minorUnits / MINOR_UNITS_PER_MAJOR;
}

/**
 * Convert a major-unit form value to integer **minor units** for the wire (`×100`, rounded to the
 * nearest minor unit so floating-point entry like `1234.56 × 100 = 123455.99…` lands on `123456`).
 * `undefined` (a blank field) stays `undefined` so the caller can omit it / send `null`.
 */
export function majorInputToMinor(major: number | undefined): number | undefined {
  return major === undefined ? undefined : Math.round(major * MINOR_UNITS_PER_MAJOR);
}
