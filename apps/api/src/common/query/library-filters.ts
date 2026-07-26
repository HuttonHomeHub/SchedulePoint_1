import { ARCHIVED_FILTERS, LIBRARY_SEARCH_MAX_LENGTH, type ArchivedFilter } from '@repo/types';

/**
 * The two filter primitives the shared libraries (calendars, resources) have in common
 * (ADR-0053 §4 / US-8): the tri-state **archived** filter and the free-text **`q`** search.
 *
 * They live here rather than in either module because the two libraries must behave
 * IDENTICALLY — "Show archived" and typing a search term mean one thing everywhere, in the
 * library screen and in every picker. Each repository translates the result into its own
 * `Prisma.…WhereInput`; the semantics are decided once, here.
 *
 * Both are **usability** controls, never authorisation boundaries (the M1 `scope` filter's
 * doc comment makes the same point): the security controls are the write-time rejects
 * (`assertCalendarUsableBy`, `RESOURCE_ARCHIVED`), enforced server-side whatever a list returns.
 */

export { ARCHIVED_FILTERS, LIBRARY_SEARCH_MAX_LENGTH };
export type { ArchivedFilter };

/**
 * The `archived_at` term for a tri-state filter:
 * - `exclude` (the default everywhere) ⇒ `archived_at IS NULL` — today's result set, since no
 *   row is archived until someone archives one. This is what keeps every existing list and
 *   picker byte-identical.
 * - `include` ⇒ **no term at all** (active and archived rows together).
 * - `only` ⇒ `archived_at IS NOT NULL` — the "Archived" view.
 *
 * Returned as a spreadable fragment (`{}` for `include`) so a caller composes it into a
 * `where` without a conditional. Deliberately NOT a partial-index predicate: because the
 * filter is tri-state, an index could serve only one of the three branches — see the
 * `20260725140000_library_archive_lifecycle` migration's decision (2) for why the existing
 * org composites are left alone.
 */
export function archivedFilterWhere(filter: ArchivedFilter): {
  archivedAt?: null | { not: null };
} {
  switch (filter) {
    case 'exclude':
      return { archivedAt: null };
    case 'only':
      return { archivedAt: { not: null } };
    case 'include':
      return {};
  }
}

/**
 * Normalise a raw `?q=` term to the value the repository should match, or `undefined` when
 * there is effectively no search. Trims (a term of only whitespace is no search at all) and
 * truncates at {@link LIBRARY_SEARCH_MAX_LENGTH} as defence in depth behind the DTO's
 * `@MaxLength` — the search compiles to a leading-wildcard `ILIKE`, which no index can serve
 * (migration decision (3)), so the term's length is a cost the server bounds itself.
 */
export function normaliseSearchTerm(q: string | undefined): string | undefined {
  if (q === undefined) return undefined;
  const trimmed = q.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, LIBRARY_SEARCH_MAX_LENGTH);
}
