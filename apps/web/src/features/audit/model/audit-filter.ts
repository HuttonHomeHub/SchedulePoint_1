// `AuditSurface` is re-exported so consumers of this model keep one import; the type itself lives
// in `@repo/types` beside the vocabulary it belongs to.
export type { AuditSurface } from '@repo/types';

import {
  AUDIT_CATEGORIES,
  AUDIT_OUTCOMES,
  auditActionsForCategories,
  type AuditAction,
  type AuditCategory,
  type AuditOutcome,
  type AuditSurface,
} from '@repo/types';

import { searchString } from '@/lib/router/search-string';

/**
 * The filter as the URL carries it — **all strings**, because `useUrlFilterState` is typed
 * `Record<string, string>` and a search param is a string whatever we wish it were.
 *
 * Categories are a comma-separated list rather than a repeated param so the whole filter is one
 * key per concept, which is what makes "is anything filtered?" answerable by looking at the URL.
 */
export interface AuditFilterState extends Record<string, string> {
  /** Comma-separated {@link AuditCategory} ids. Empty string means every category. */
  categories: string;
  /** One {@link AuditOutcome}, or the empty string for every outcome. */
  outcome: string;
  /** `YYYY-MM-DD`, or empty. Rendered by a native date input, widened to an instant on the wire. */
  from: string;
  to: string;
}

/**
 * Every filter empty. Passed to `useUrlFilterState` as the defaults, which is what keeps an
 * untouched screen's URL clean: a value equal to its default is deleted rather than serialised.
 */
export const EMPTY_AUDIT_FILTER: AuditFilterState = {
  categories: '',
  outcome: '',
  from: '',
  to: '',
};

/** True when nothing is narrowed — the two empty states hang off this, and so does "Clear". */
export function isAuditFilterEmpty(filter: AuditFilterState): boolean {
  return (
    filter.categories === '' && filter.outcome === '' && filter.from === '' && filter.to === ''
  );
}

/**
 * Read the filter out of raw search params.
 *
 * **Unknown values are dropped, not rejected.** A URL is pasted, edited by hand and outlives
 * deployments, so a category we no longer recognise should narrow the view slightly differently
 * rather than break the screen — the opposite of the API's rule, and deliberately so: the API is a
 * contract whose caller can be told it is wrong, and a URL bar is not.
 */
export function parseAuditFilter(raw: Record<string, unknown>): AuditFilterState {
  const categories = splitCategories(raw['categories']).join(',');
  const outcome = asString(raw['outcome']);
  return {
    categories,
    outcome: (AUDIT_OUTCOMES as readonly string[]).includes(outcome) ? outcome : '',
    from: asIsoDate(raw['from']),
    to: asIsoDate(raw['to']),
  };
}

/** The chosen categories, in vocabulary order so the URL is stable however the chips were clicked. */
export function selectedCategories(filter: AuditFilterState): AuditCategory[] {
  const chosen = new Set(splitCategories(filter.categories));
  return AUDIT_CATEGORIES.filter((category) => chosen.has(category));
}

/** Toggle one category, returning the patch to hand to the URL setter. */
export function toggleCategory(
  filter: AuditFilterState,
  category: AuditCategory,
  next: boolean,
): Partial<AuditFilterState> {
  const chosen = new Set(selectedCategories(filter));
  if (next) chosen.add(category);
  else chosen.delete(category);
  return { categories: AUDIT_CATEGORIES.filter((c) => chosen.has(c)).join(',') };
}

/** The query the hook should send. Every key is omitted when its filter is empty. */
export interface AuditQueryFilter {
  action?: AuditAction[];
  outcome?: AuditOutcome[];
  from?: string;
  to?: string;
}

/**
 * Turn the URL state into request parameters.
 *
 * Two conversions matter. Categories are **expanded to actions here**, because the API takes one
 * vocabulary and it is the action list (ADR-0073) — and the expansion is surface-aware, so an
 * organisation request can never carry an `auth.*` action the endpoint refuses. And the two dates
 * become **instants covering the whole local day**: a planner picking "4 August" for `to` means
 * the end of the 4th, and sending midnight would silently drop everything that happened that day,
 * which is the class of quiet wrongness this feature exists to remove.
 */
export function toAuditQuery(filter: AuditFilterState, surface: AuditSurface): AuditQueryFilter {
  const actions = auditActionsForCategories(selectedCategories(filter), surface);
  return {
    ...(actions.length > 0 ? { action: [...actions] } : {}),
    ...(filter.outcome === '' ? {} : { outcome: [filter.outcome as AuditOutcome] }),
    ...(filter.from === '' ? {} : { from: startOfLocalDay(filter.from) }),
    ...(filter.to === '' ? {} : { to: endOfLocalDay(filter.to) }),
  };
}

function asString(value: unknown): string {
  return searchString(value) ?? '';
}

/** `YYYY-MM-DD` or nothing. A malformed date is dropped rather than sent to be 422'd. */
function asIsoDate(value: unknown): string {
  const raw = asString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : '';
}

function splitCategories(value: unknown): AuditCategory[] {
  const known = new Set<string>(AUDIT_CATEGORIES);
  return asString(value)
    .split(',')
    .filter((part): part is AuditCategory => known.has(part));
}

function startOfLocalDay(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function endOfLocalDay(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
