import type { ImportCalendarScope } from '@repo/interchange';

import { firstFreeImportedName, isImportedVariantOf } from './imported-name';

/** A stored calendar an import may reuse, reduced to what the decision reads. */
export interface ReuseCandidate {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  /** {@link calendarIdentityKey} of the stored rows. */
  readonly identityKey: string;
}

/** A calendar the file carries, with the identity of what the import WOULD write for it. */
export interface SourceCalendar {
  readonly key: string;
  readonly name: string;
  readonly scope: ImportCalendarScope;
  readonly identityKey: string;
}

export type CalendarResolution =
  | { readonly kind: 'reuse'; readonly id: string; readonly existingName: string }
  | { readonly kind: 'create'; readonly name: string };

/**
 * Decide, for each calendar in the file, whether the import reuses an existing one or creates its
 * own (ADR-0208 D1–D2). Pure: the dry-run and the commit hand it the same shapes, so they cannot
 * disagree about a candidate neither of them has seen change.
 *
 * - A candidate must be of the source's tier (the caller supplies candidates per tier), carry the
 *   same identity, and have the source's name or the importer's own variant of it.
 * - Exact name is preferred, then the oldest variant (`createdAt`, then id, so ties are stable).
 * - One existing calendar is claimed by at most one source calendar per import, in file order, so the
 *   file's calendar count is kept and calendars inside one file are never merged.
 * - A source that matches nothing is created under the first free name, exactly as before ADR-0208.
 *   Its name is claimed in `taken`, so a second source of the same name gets the next variant.
 */
export function resolveCalendarReuse(params: {
  readonly calendars: readonly SourceCalendar[];
  readonly candidatesByScope: ReadonlyMap<ImportCalendarScope, readonly ReuseCandidate[]>;
  /** Mutated: names claimed by created calendars are added. */
  readonly takenByScope: Map<ImportCalendarScope, Set<string>>;
  readonly today: string;
  readonly maxNameLength: number;
  /** Raised when no free name exists, which the bound in {@link firstFreeImportedName} prevents. */
  readonly onNoFreeName: () => never;
}): Map<string, CalendarResolution> {
  const resolutions = new Map<string, CalendarResolution>();
  const claimed = new Set<string>();

  for (const source of params.calendars) {
    const matches = (params.candidatesByScope.get(source.scope) ?? [])
      .filter(
        (candidate) =>
          !claimed.has(candidate.id) &&
          candidate.identityKey === source.identityKey &&
          isImportedVariantOf(candidate.name, source.name, params.maxNameLength),
      )
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    const exact = matches.find((candidate) => candidate.name === source.name);
    const chosen = exact ?? matches[0];
    if (chosen !== undefined) {
      claimed.add(chosen.id);
      resolutions.set(source.key, { kind: 'reuse', id: chosen.id, existingName: chosen.name });
      continue;
    }

    const taken = params.takenByScope.get(source.scope) ?? new Set<string>();
    const name =
      firstFreeImportedName(source.name, taken, params.today, params.maxNameLength) ??
      params.onNoFreeName();
    taken.add(name);
    params.takenByScope.set(source.scope, taken);
    resolutions.set(source.key, { kind: 'create', name });
  }
  return resolutions;
}
