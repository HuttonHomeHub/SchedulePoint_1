import type { ActivitySummary } from '@repo/types';

import { searchString } from '@/lib/router/search-string';

/**
 * **Code columns, as plain data** (P6 activity codes, M3-T2).
 *
 * This lives in `lib/` because three features that may not import one another need one definition of
 * it: `features/codes` builds the columns, and `features/activities` and `features/gantt` draw them,
 * while `features/tsld` lists them in `View ▾`. The structural test in `features/codes` pins that the
 * dependency runs one way, so the shared shape cannot sit in any of them.
 */

/**
 * At most this many code columns are shown in one grid (`m3-ui-design.md` §5.2): ten 96 px columns are
 * already wider than the 1024 px floor, ten value loads are a bounded request cost, and ten 36-character
 * ids keep the URL short.
 */
export const MAX_CODE_COLUMNS = 10;

/** Why the eleventh item is shaded. Stated once so the table's menu and the Gantt's list say it alike. */
export const CODE_COLUMN_CAP_REASON = `Up to ${String(MAX_CODE_COLUMNS)} code columns at a time. Turn one off to show another.`;

/** What the chooser says, in the menu's reason and the Gantt list's text, while it has nothing to offer. */
export const CODE_COLUMNS_LOADING_SENTENCE = 'Codes are loading.';
export const CODE_COLUMNS_FAILED_SENTENCE = 'Codes could not be loaded.';
export const NO_CODES_REASON = 'This plan has no codes yet. Add them with Codes…';

/** What a column reads while its type's values load, and when they could not be loaded. */
export const CODE_CELL_LOADING = 'Loading…';
export const CODE_CELL_UNAVAILABLE = 'Unavailable';

/** One code type drawn as a column. Built by the host from the type and its values. */
export interface CodeColumn {
  /** The code type's id: unique within a grid, and the value the URL carries. */
  readonly key: string;
  /** The type's name, which heads the column. */
  readonly label: string;
  /** `ready` once the type's values are known; the cell reads {@link codeCellText} otherwise. */
  readonly status: 'loading' | 'ready' | 'error';
  /** The value's name for an activity, or an em dash for none. Meaningful only when `ready`. */
  readonly text: (activity: ActivitySummary) => string;
  /** Read this column's values again. Present on every column the host builds; used when `error`. */
  readonly retry?: () => void;
}

export const NO_CODE_COLUMNS: readonly CodeColumn[] = [];

/**
 * What a cell says. **Never an id**: a column whose values are not here yet says so, rather than
 * falling back to the one thing a planner cannot read.
 */
export function codeCellText(column: CodeColumn, activity: ActivitySummary): string {
  if (column.status === 'loading') return CODE_CELL_LOADING;
  if (column.status === 'error') return CODE_CELL_UNAVAILABLE;
  return column.text(activity);
}

/** The one sentence over a grid whose columns could not be read, or `null` when all of them could. */
export function codeColumnsUnavailableSentence(columns: readonly CodeColumn[]): string | null {
  const failed = columns.filter((c) => c.status === 'error').map((c) => c.label);
  if (failed.length === 0) return null;
  return failed.length === 1
    ? `${failed[0] ?? ''}’s values could not be loaded.`
    : `Values for ${joinNames(failed)} could not be loaded.`;
}

/** "Area and Trade", "Area, Trade and Zone". */
function joinNames(names: readonly string[]): string {
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/** Read again every column that failed; the notice's Retry. `false` when nothing offers a retry. */
export function retryFailedCodeColumns(columns: readonly CodeColumn[]): boolean {
  const retries = columns.flatMap((c) => (c.status === 'error' && c.retry ? [c.retry] : []));
  retries.forEach((retry) => retry());
  return retries.length > 0;
}

/** Whether a failed column can be read again, so the notice offers Retry rather than a reload. */
export function canRetryCodeColumns(columns: readonly CodeColumn[]): boolean {
  return columns.some((c) => c.status === 'error' && c.retry !== undefined);
}

/** What the Columns menu and the `View ▾` list need to offer the choice. Plain data, no feature types. */
export interface CodeColumnsChoice {
  /** `ready` once the plan's types are known; `error` when they could not be read. */
  readonly status: 'loading' | 'ready' | 'error';
  /** The plan's live types in order, which is the order their columns are drawn in. */
  readonly types: readonly { readonly id: string; readonly name: string }[];
  /** The types whose columns are shown, in type order. */
  readonly shownIds: readonly string[];
  /** Show exactly these. The host writes them in type order, capped, to the URL. */
  readonly setShown: (ids: readonly string[]) => void;
}

/** A refusal to print: the named types' values could not be loaded (`m3-spec.md` §4.6). */
export class CodeColumnsUnavailableError extends Error {
  readonly typeNames: readonly string[];
  constructor(typeNames: readonly string[]) {
    super(codeColumnsPrintRefusal(typeNames));
    this.name = 'CodeColumnsUnavailableError';
    this.typeNames = typeNames;
  }
}

/** The sentence that replaces a printout whose code columns could not be filled. */
export function codeColumnsPrintRefusal(typeNames: readonly string[]): string {
  const subject =
    typeNames.length === 1
      ? `${typeNames[0] ?? ''}’s values`
      : `The values of ${typeNames.join(', ')}`;
  return `The printout was not made: ${subject} could not be loaded. Try again.`;
}

/** A type id as the URL may carry it: bounded, and nothing a route could mistake for syntax. */
const TYPE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The ids an `acodes`/`gcodes` value names — **total**, like every reader of the Gantt's view state
 * (ADR-0123: a search param arrives as the string it was written as, and a hand-edited URL lands on a
 * working grid). Anything that is not a plain id is dropped, duplicates collapse, and an unreadable
 * value is "none shown", which is also the default.
 */
export function parseCodeColumnIds(value: unknown): readonly string[] {
  const raw = searchString(value);
  if (raw === undefined) return [];
  const ids: string[] = [];
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (TYPE_ID.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The ids that are columns **now**: the requested ones that are still live types, in type order, at
 * most {@link MAX_CODE_COLUMNS}. A deleted type's id drops out here rather than in the URL, so a stale
 * link opens on the columns that still exist.
 */
export function resolveCodeColumnIds(
  requested: readonly string[],
  typeIds: readonly string[],
): readonly string[] {
  return typeIds.filter((id) => requested.includes(id)).slice(0, MAX_CODE_COLUMNS);
}

/** The URL value for a set of shown ids: type order, so the same view is the same URL. */
export function serialiseCodeColumnIds(ids: readonly string[], typeIds: readonly string[]): string {
  return resolveCodeColumnIds(ids, typeIds).join(',');
}
