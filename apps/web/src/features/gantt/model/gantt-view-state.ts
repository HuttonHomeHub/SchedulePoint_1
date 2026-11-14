import {
  DEFAULT_GANTT_SORT,
  GANTT_SORT_KEYS,
  type GanttSort,
  type GanttSortDirection,
  type GanttSortKey,
} from '../layout/row-model';

import { parseCodeColumnIds } from '@/lib/code-columns';
import { searchString } from '@/lib/router/search-string';

/**
 * **The Gantt's view memory** (ADR-0095 M5-T6): sort, hidden columns and the collapse set, as
 * typed URL search params.
 *
 * The chart is the artefact a planner hands over, and until now it forgot everything the moment
 * they reloaded — the sort they chose, the phases they collapsed to make it readable. Those are
 * exactly the state `docs/UX_STANDARDS.md` says belongs in the URL ("Deep-linkable everything"),
 * for the reason the library screens moved theirs there in ADR-0053 M6: a view worth arriving at
 * is a view worth sending to somebody.
 *
 * ## Every reader here is TOTAL, and that is not defensive coding
 *
 * `docs/TECH_DEBT.md` **#96**, and the mechanism corrected: this said the default `parseSearch` is
 * `parseSearchWith(JSON.parse)`, "so `?gsort=1` arrives as the number 1". Half true, and the half it
 * missed is the one that decided the remedy. The **decode** step coerced `"true"`, `"false"` and
 * canonical numeric strings (`qss.js:41-46`) **before** the parser was consulted, and `JSON.parse`
 * (`searchParams.js:18-33`) only ever saw values that were still strings — so replacing the parser
 * alone would have fixed nothing. ADR-0074 M5 shipped a live defect from exactly this, a
 * `typeof === 'string'` test discarding a verification that had succeeded, invisible to every unit
 * test because those mock `useSearch` and never cross the parser.
 *
 * **#96 M4 replaced the codec**, so a value now reaches these readers as the string it was written
 * as. They stay total anyway: `useSearch` is typed `unknown` at every call site, and these are the
 * rollback contract if the two `createRouter` options are ever reverted. A hand-edited URL lands the
 * planner on a working chart, never an error boundary.
 *
 * ## An absent `ghide` is "say nothing", not "the default set"
 *
 * What an absent `ghide` shows depends on the room the Gantt has (`NARROW_DEFAULT_HIDDEN` against
 * `DEFAULT_HIDDEN_COLUMNS`), which only the host can measure. The parser therefore reports whether a
 * choice was **stated** and leaves the resolving to `layout/narrow-default.ts`; a stated value,
 * `none` included, is used as written at every width (`docs/specs/gantt-narrow-default-columns/`).
 *
 * ## What is NOT here, and why
 *
 * **Grid width and column widths.** Neither is in the URL: they are per-device ergonomics, not a view
 * worth sending (a width chosen on a wide monitor is wrong on a laptop). The divider's size lives in
 * `useResizablePanelPrefs` (`schedulepoint:gantt-grid-width`) and each column's width in
 * `useGanttColumnWidths` (`schedulepoint:gantt-column-widths`), both held by the host (ADR-0173 D1).
 * This paragraph said the grid had no resize handle until the 2026-10-04 pass; it had one from
 * Graphite M8.
 */

/** Columns the chooser may hide. `name` is deliberately absent — see {@link HIDEABLE_COLUMNS}. */
export type GanttColumnKey = GanttSortKey | 'predecessors' | 'swimlane';

/**
 * The columns a planner may switch off.
 *
 * **`name` is not one of them.** It identifies the row, carries the de-emphasis marker and the
 * inline editor, and is what a screen-reader user hears when they land — a grid whose rows can be
 * made anonymous is not a shorter grid, it is a broken one. Enforced by this list rather than by a
 * rule in the chooser, so a second entry point cannot forget it.
 */
export const HIDEABLE_COLUMNS: readonly GanttColumnKey[] = [
  'code',
  'duration',
  'earlyStart',
  'earlyFinish',
  'totalFloat',
  'predecessors',
  'swimlane',
];

/**
 * Columns hidden when the URL says nothing **and the Gantt has room**.
 *
 * `predecessors` is off by default: it is the widest column and the newest, and a chart that grew
 * a column overnight for every existing user is a change nobody asked for. The other five have
 * been visible since ADR-0059 and stay that way.
 */
export const DEFAULT_HIDDEN_COLUMNS: readonly GanttColumnKey[] = ['predecessors'];

/**
 * Columns hidden when the URL says nothing **and the Gantt is narrow**: the standard set plus Code
 * and Finish, so the timeline keeps the room (`docs/specs/gantt-narrow-default-columns/`). Which of
 * the two applies is decided where the frame is measured (`layout/narrow-default.ts`), never here:
 * the parser stays pure and total.
 */
export const NARROW_DEFAULT_HIDDEN: readonly GanttColumnKey[] = [
  ...DEFAULT_HIDDEN_COLUMNS,
  'code',
  'earlyFinish',
];

/**
 * "The URL says nothing", as a value the URL's default slot can hold.
 *
 * Once the default depends on the frame, "absent" and "the default set" are no longer one string:
 * a planner on a narrow Gantt who ticks Code and Finish back on writes `predecessors`, which the
 * old default-is-deleted rule removed from the address — and an absent `ghide` then hid them
 * again. This is the trap {@link HIDE_NOTHING} was invented for, one value along.
 * {@link serialiseHiddenColumns} yields a list or `none`, never this, so any chooser change is
 * written and survives; a hand-typed `?ghide=auto` reads as "say nothing" and is harmless.
 */
export const HIDDEN_UNSTATED = 'auto';

/**
 * "Hide nothing", as a value the URL can actually carry.
 *
 * The empty string cannot: `useUrlFilterState` deletes a param whose value is `''` (its
 * defaults-are-omitted rule), so an empty hidden-set round-tripped to *no param at all* — which the
 * parser then correctly read as the DEFAULT, i.e. Predecessors hidden again. Switching that column
 * on was therefore unrepresentable.
 *
 * Found by `e2e-gantt-editing/view-state.spec.ts` on its first run, and invisible to the unit
 * suite: those cases hand the parser `''` directly and never cross the hook that deletes it. The
 * distinction they assert — "hide nothing" is not "say nothing" — was right, and the encoding could
 * not express it.
 */
export const HIDE_NOTHING = 'none';

/** How many collapsed ids the URL will carry. See {@link parseCollapsed}. */
export const MAX_COLLAPSED_IN_URL = 40;

export interface GanttViewState {
  sort: GanttSort;
  /**
   * The columns the URL hides. When {@link hiddenStated} is false this is the standard default and
   * the host may replace it with the narrow one; when true it is the planner's choice at every width.
   */
  hiddenColumns: ReadonlySet<GanttColumnKey>;
  /** Whether the address carried a column choice (`none`, a list, or a list of unknown keys). */
  hiddenStated: boolean;
  collapsed: ReadonlySet<string>;
  /**
   * The code types the planner asked to see as columns (P6 activity codes, M3-T2), **unresolved**: the
   * host drops the ones that are no longer live types and caps the rest, because only it knows the
   * plan's types. A shown-list where `hiddenColumns` is a hidden-list, deliberately — "off by default"
   * means a type added later must not appear for a planner holding an old URL.
   */
  codeColumnIds: readonly string[];
}

/** The search-param names, in one place so the hook and the tests cannot disagree. */
export const GANTT_VIEW_PARAMS = {
  sort: 'gsort',
  hidden: 'ghide',
  collapsed: 'gcollapsed',
  codes: 'gcodes',
} as const;

/**
 * Coerce a search value to a string, or null.
 *
 * **Was** "the single place the #96 trap is handled", and it was one of four — which is what #96 M1
 * closes. The rule now lives in `lib/router/search-string.ts`; this keeps its own name and
 * `string | null` return so no consumer here changes.
 */
function asSearchString(value: unknown): string | null {
  return searchString(value) ?? null;
}

/**
 * `key:direction` — one param rather than two, so an untouched view omits ONE thing and a
 * half-specified URL (`?gsortdir=desc` with no key) cannot exist to be reasoned about.
 */
export function parseSort(value: unknown): GanttSort {
  const raw = asSearchString(value);
  if (raw === null) return DEFAULT_GANTT_SORT;
  const [key, direction] = raw.split(':');
  if (!GANTT_SORT_KEYS.includes(key as GanttSortKey)) return DEFAULT_GANTT_SORT;
  return {
    key: key as GanttSortKey,
    // A missing or unrecognised direction is `asc` rather than the default sort's direction:
    // `?gsort=duration` is a legible thing to type by hand and should mean "by duration", not
    // "ignored because you did not say which way".
    direction: (direction === 'desc' ? 'desc' : 'asc') satisfies GanttSortDirection,
  };
}

export function serialiseSort(sort: GanttSort): string {
  return `${sort.key}:${sort.direction}`;
}

/**
 * What the address says about hidden columns: a choice (`stated`), or nothing.
 *
 * Tagged rather than defaulted here, because the default depends on the room the Gantt has and the
 * parser knows nothing of that (`docs/specs/gantt-narrow-default-columns/` §4.2).
 */
export type ParsedHiddenColumns =
  { stated: true; hidden: ReadonlySet<GanttColumnKey> } | { stated: false };

/**
 * A comma-separated list of hidden columns.
 *
 * **Hidden rather than shown**, which is the load-bearing choice: a column added to the product
 * later is *visible* to somebody holding an old URL, instead of silently absent. A shown-list
 * would make every stored view a snapshot that quietly withholds anything new — the failure being
 * invisible, because the reader has no way to know a column exists.
 */
export function parseHiddenColumns(value: unknown): ParsedHiddenColumns {
  const raw = asSearchString(value);
  if (raw === null || raw === HIDDEN_UNSTATED) return { stated: false };
  // `none` (and, read permissively, an empty string) means "hide nothing", which is NOT the default
  // and must survive the round trip — otherwise a planner who switches `predecessors` on cannot
  // express it. See {@link HIDE_NOTHING} for why the empty string alone could not carry it.
  if (raw === HIDE_NOTHING) return { stated: true, hidden: new Set() };
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return {
    stated: true,
    hidden: new Set(
      parts.filter((p): p is GanttColumnKey => HIDEABLE_COLUMNS.includes(p as GanttColumnKey)),
    ),
  };
}

export function serialiseHiddenColumns(hidden: ReadonlySet<GanttColumnKey>): string {
  // Serialised in HIDEABLE_COLUMNS order, not set-insertion order, so the same view produces the
  // same URL whichever order the planner switched things off in — a URL that differs by history is
  // a URL nobody can compare.
  const list = HIDEABLE_COLUMNS.filter((key) => hidden.has(key)).join(',');
  return list === '' ? HIDE_NOTHING : list;
}

/**
 * The collapsed summaries, capped.
 *
 * Ids are 36 characters each, so an uncapped list on a programme with a hundred phases builds a
 * URL browsers and proxies start truncating — and a truncated id list is worse than none, because
 * it half-restores a view and looks deliberate. The cap is applied on the way OUT (see
 * {@link serialiseCollapsed}); reading is permissive, since a URL from a future cap should still
 * open.
 */
export function parseCollapsed(value: unknown): ReadonlySet<string> {
  const raw = asSearchString(value);
  if (raw === null) return new Set();
  return new Set(
    raw
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0),
  );
}

/**
 * @returns the serialised list, and whether the cap dropped anything — reported rather than
 * silently truncated, because "your collapse state did not all fit" is a fact the caller may want
 * to act on and an absence the planner cannot otherwise explain.
 */
export function serialiseCollapsed(collapsed: ReadonlySet<string>): {
  value: string;
  withheld: number;
} {
  const ids = [...collapsed];
  const kept = ids.slice(0, MAX_COLLAPSED_IN_URL);
  return { value: kept.join(','), withheld: Math.max(0, ids.length - kept.length) };
}

/** Read the whole view state out of the router's raw search object. */
export function parseGanttViewState(raw: Record<string, unknown>): GanttViewState {
  const hidden = parseHiddenColumns(raw[GANTT_VIEW_PARAMS.hidden]);
  return {
    sort: parseSort(raw[GANTT_VIEW_PARAMS.sort]),
    hiddenColumns: hidden.stated ? hidden.hidden : new Set(DEFAULT_HIDDEN_COLUMNS),
    hiddenStated: hidden.stated,
    collapsed: parseCollapsed(raw[GANTT_VIEW_PARAMS.collapsed]),
    codeColumnIds: parseCodeColumnIds(raw[GANTT_VIEW_PARAMS.codes]),
  };
}

/**
 * The values an untouched chart produces, so `useUrlFilterState` can delete rather than serialise
 * them. Derived from the same constants the parsers use — a hand-written literal here would be a
 * second definition of "default", and the two would drift the first time one changed.
 */
export const GANTT_VIEW_DEFAULTS: Record<string, string> = {
  [GANTT_VIEW_PARAMS.sort]: serialiseSort(DEFAULT_GANTT_SORT),
  [GANTT_VIEW_PARAMS.hidden]: HIDDEN_UNSTATED,
  [GANTT_VIEW_PARAMS.collapsed]: '',
  [GANTT_VIEW_PARAMS.codes]: '',
};
