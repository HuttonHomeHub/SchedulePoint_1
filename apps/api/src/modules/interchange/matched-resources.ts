import type { ImportGraph, MatchedResource } from '@repo/interchange';

import type { LibraryResource, ResourceMatch } from './resource-match';

/**
 * Pure helpers for ADR-0208 D7 (leave out a calendar only matched resources hold): which stored
 * calendars must be read to judge "is the calendar the matched row keeps the file's?", and the
 * per-resource answer the package function consumes. No I/O, so the service reads exactly what
 * {@link libraryCalendarIdsToRead} names and nothing else.
 */

type Kept =
  | { readonly kind: 'library'; readonly row: LibraryResource | undefined }
  | { readonly kind: 'file'; readonly resourceKey: string };

/**
 * The row a matched source resource ends up as. A `file` match points at an earlier row of the same
 * file, whose own decision may be a match again, so the chain is followed to the end (it always ends:
 * a `file` match only ever points backwards).
 */
function keptOf(
  resourceKey: string,
  match: ResourceMatch,
  libraryById: ReadonlyMap<string, LibraryResource>,
): Kept {
  let key = resourceKey;
  for (;;) {
    const decision = match.decisions.get(key);
    if (decision === undefined || decision.kind === 'insert')
      return { kind: 'file', resourceKey: key };
    if (decision.via === 'file') {
      key = decision.fileKey!;
      continue;
    }
    return { kind: 'library', row: libraryById.get(decision.libraryId!) };
  }
}

/** The stored calendars the sameness judgement needs: those of library rows a candidate holder matched. */
export function libraryCalendarIdsToRead(
  graph: ImportGraph,
  library: readonly LibraryResource[],
  match: ResourceMatch,
  candidates: ReadonlySet<string>,
): string[] {
  const libraryById = new Map(library.map((row) => [row.id, row] as const));
  const ids = new Set<string>();
  for (const resource of graph.resources) {
    if (resource.calendarKey === null || !candidates.has(resource.calendarKey)) continue;
    if (match.decisions.get(resource.key)?.kind !== 'match') continue;
    const kept = keptOf(resource.key, match, libraryById);
    if (kept.kind === 'library' && kept.row?.calendarId != null) ids.add(kept.row.calendarId);
  }
  return [...ids];
}

/**
 * Every matched source resource, with whether the calendar its match keeps is the file's own.
 *
 * `keptKeyByCalendarId` is the identity key (ADR-0208 `calendarIdentityKey`) of each stored calendar
 * {@link libraryCalendarIdsToRead} named; an id missing from it (a calendar since deleted or archived)
 * counts as different, as does a matched row with no calendar. `sourceKeyOf` is the identity key of
 * the file's calendar, computed from what the importer would write for it.
 */
export function describeMatchedResources(
  graph: ImportGraph,
  library: readonly LibraryResource[],
  match: ResourceMatch,
  candidates: ReadonlySet<string>,
  keptKeyByCalendarId: ReadonlyMap<string, string>,
  sourceKeyOf: (calendarKey: string) => string | undefined,
): Map<string, MatchedResource> {
  const libraryById = new Map(library.map((row) => [row.id, row] as const));
  const resourceByKey = new Map(
    graph.resources.map((resource) => [resource.key, resource] as const),
  );
  const matched = new Map<string, MatchedResource>();
  for (const resource of graph.resources) {
    if (match.decisions.get(resource.key)?.kind !== 'match') continue;
    let keptCalendarSame = false;
    if (resource.calendarKey !== null && candidates.has(resource.calendarKey)) {
      const ours = sourceKeyOf(resource.calendarKey);
      const kept = keptOf(resource.key, match, libraryById);
      let theirs: string | undefined;
      if (kept.kind === 'library') {
        const calendarId = kept.row?.calendarId;
        theirs = calendarId == null ? undefined : keptKeyByCalendarId.get(calendarId);
      } else {
        const own = resourceByKey.get(kept.resourceKey)?.calendarKey;
        theirs = own == null ? undefined : sourceKeyOf(own);
      }
      keptCalendarSame = ours !== undefined && theirs !== undefined && ours === theirs;
    }
    matched.set(resource.key, { name: resource.name, keptCalendarSame });
  }
  return matched;
}
