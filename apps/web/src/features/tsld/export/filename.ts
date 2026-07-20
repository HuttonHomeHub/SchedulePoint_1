/**
 * Pure filename helpers for the TSLD **export & print** deliverables (spec `docs/specs/export-print/`,
 * behind `VITE_EXPORT_PRINT`). No DOM, canvas, React or `Date.now()` at module scope — the caller
 * supplies the date (the toolbar passes its local `todayIso`), so the whole module is deterministic and
 * exhaustively unit-testable. `download.ts` names the download from {@link buildExportFilename}.
 */

/** The kind of artefact an export produces — the middle token of the filename. */
export type ExportKind = 'schedule' | 'diagram';

/** The file extension an export writes — the trailing token of the filename. */
export type ExportExtension = 'csv' | 'png' | 'pdf';

/** Maximum slug length (§2 Validation) — a plan name is capped so the whole filename stays a sane length
 * and can't blow a filesystem name limit. Trailing dashes left by the cut are re-trimmed. */
export const MAX_SLUG_LENGTH = 64;

/** The fallback slug for an empty / punctuation-only / non-Latin plan name (§2 Validation / §3 Security). */
export const FALLBACK_SLUG = 'plan';

/** Combining diacritical marks (U+0300–U+036F) that NFKD splits an accented letter into — stripped so
 * `é`→`e`, `ü`→`u` rather than becoming a dash. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Turn an arbitrary string (a plan name) into a safe, lower-case URL/file slug of `[a-z0-9-]` only:
 * decompose accents to their ASCII base (`Café` → `cafe`), lower-case, replace every run of
 * non-alphanumerics with a single `-`, trim leading/trailing dashes, and cap the length. An empty result
 * — an empty string, punctuation-only, or a non-Latin script that decomposes to nothing — falls back to
 * {@link FALLBACK_SLUG} so a filename never starts with a dot, a separator, or nothing at all.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    // Any run of non-alphanumerics (spaces, punctuation, symbols, remaining non-Latin) → one dash.
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse dash runs and trim leading/trailing dashes.
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // The length cut can leave a trailing dash — trim it again.
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

/**
 * Build an export filename: `{plan-slug}-{kind}[-{variant}]-{YYYY-MM-DD}.{ext}` (e.g.
 * `north-tower-schedule-2026-07-20.csv`, or with a variant `north-tower-diagram-whole-2026-07-20.png`).
 * The optional `variant` distinguishes two exports of the same `kind` that would otherwise collide — the
 * diagram PNG/PDF ship in two extents (`whole` plan vs current `view`), so without it the two downloads
 * would share one name and silently overwrite (UX review B1). The `date` is supplied by the caller (the
 * toolbar passes its local `todayIso`) so the function is pure and deterministic; when omitted it falls
 * back to today's local calendar day, computed at call time (never at module scope).
 */
export function buildExportFilename({
  planName,
  kind,
  variant,
  ext,
  date,
}: {
  planName: string;
  kind: ExportKind;
  /** An extent/discriminator token inserted between `kind` and `date` (e.g. `whole` / `view`), so two
   * exports of the same kind produce distinct filenames. Slugified; omitted when absent/blank. */
  variant?: string;
  ext: ExportExtension;
  date?: string;
}): string {
  const variantSlug = variant ? `-${slugify(variant)}` : '';
  return `${slugify(planName)}-${kind}${variantSlug}-${date ?? localTodayIso()}.${ext}`;
}

/** Today's LOCAL calendar day as `YYYY-MM-DD` (not UTC), for the `buildExportFilename` date fallback.
 * Computed at call time so nothing reads the clock at module scope (keeps the module import-pure). */
function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
