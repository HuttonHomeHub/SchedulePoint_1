import {
  DEFAULT_GANTT_SORT,
  GANTT_SORT_KEYS,
  type GanttSort,
  type GanttSortDirection,
  type GanttSortKey,
} from '../layout/row-model';

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
 * `docs/TECH_DEBT.md` **#96**: TanStack Router's default `parseSearch` is
 * `parseSearchWith(JSON.parse)`, so `?gsort=1` arrives as the **number** `1`, `?x=true` as a
 * boolean, and a repeated param as an array. ADR-0074 M5 shipped a live defect from exactly this —
 * a `typeof === 'string'` test discarded a verification that had succeeded — and it was invisible
 * to every unit test, because those mock `useSearch` and never cross the parser.
 *
 * So each parser takes `unknown`, coerces what it can and degrades to the default otherwise. A
 * hand-edited URL lands the planner on a working chart, never an error boundary.
 *
 * ## What is NOT here, and why
 *
 * **Grid width.** The plan lists it; the grid has no resize handle, so nothing can set it. Storing
 * a value no control produces is the lit-but-inert shape inverted — state that claims a capability
 * the surface does not have. It returns when the grid becomes resizable.
 */

/** Columns the chooser may hide. `name` is deliberately absent — see {@link HIDEABLE_COLUMNS}. */
export type GanttColumnKey = GanttSortKey | 'predecessors';

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
];

/**
 * Columns hidden when the URL says nothing.
 *
 * `predecessors` is off by default: it is the widest column and the newest, and a chart that grew
 * a column overnight for every existing user is a change nobody asked for. The other five have
 * been visible since ADR-0059 and stay that way.
 */
export const DEFAULT_HIDDEN_COLUMNS: readonly GanttColumnKey[] = ['predecessors'];

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
  hiddenColumns: ReadonlySet<GanttColumnKey>;
  collapsed: ReadonlySet<string>;
}

/** The search-param names, in one place so the hook and the tests cannot disagree. */
export const GANTT_VIEW_PARAMS = {
  sort: 'gsort',
  hidden: 'ghide',
  collapsed: 'gcollapsed',
} as const;

/**
 * Coerce a search value to a string, or null.
 *
 * The single place the #96 trap is handled: a number, a boolean and a one-element array all become
 * their string form, because a planner who typed `?gsort=1` meant the text `1` and should get the
 * default rather than a crash. Anything else (an object, an empty array) is null.
 */
function asSearchString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.length > 0) return asSearchString(value[0]);
  return null;
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
 * A comma-separated list of hidden columns.
 *
 * **Hidden rather than shown**, which is the load-bearing choice: a column added to the product
 * later is *visible* to somebody holding an old URL, instead of silently absent. A shown-list
 * would make every stored view a snapshot that quietly withholds anything new — the failure being
 * invisible, because the reader has no way to know a column exists.
 */
export function parseHiddenColumns(value: unknown): ReadonlySet<GanttColumnKey> {
  const raw = asSearchString(value);
  if (raw === null) return new Set(DEFAULT_HIDDEN_COLUMNS);
  // `none` (and, read permissively, an empty string) means "hide nothing", which is NOT the default
  // and must survive the round trip — otherwise a planner who switches `predecessors` on cannot
  // express it. See {@link HIDE_NOTHING} for why the empty string alone could not carry it.
  if (raw === HIDE_NOTHING) return new Set();
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return new Set(
    parts.filter((p): p is GanttColumnKey => HIDEABLE_COLUMNS.includes(p as GanttColumnKey)),
  );
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
  return {
    sort: parseSort(raw[GANTT_VIEW_PARAMS.sort]),
    hiddenColumns: parseHiddenColumns(raw[GANTT_VIEW_PARAMS.hidden]),
    collapsed: parseCollapsed(raw[GANTT_VIEW_PARAMS.collapsed]),
  };
}

/**
 * The values an untouched chart produces, so `useUrlFilterState` can delete rather than serialise
 * them. Derived from the same constants the parsers use — a hand-written literal here would be a
 * second definition of "default", and the two would drift the first time one changed.
 */
export const GANTT_VIEW_DEFAULTS: Record<string, string> = {
  [GANTT_VIEW_PARAMS.sort]: serialiseSort(DEFAULT_GANTT_SORT),
  [GANTT_VIEW_PARAMS.hidden]: serialiseHiddenColumns(new Set(DEFAULT_HIDDEN_COLUMNS)),
  [GANTT_VIEW_PARAMS.collapsed]: '',
};
