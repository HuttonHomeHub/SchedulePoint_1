import type { ImportCalendarScope } from '@repo/interchange';

import { firstFreeImportedName, isImportedVariantOf } from './imported-name';

/** A stored calendar an import may reuse; its content is read only if it is ever compared. */
export interface ReuseCandidate {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
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

/** Candidates whose content is read per round trip: enough to amortise it, few enough to stop early. */
export const REUSE_CONTENT_CHUNK = 5;

/**
 * Decide, for each calendar in the file, whether the import reuses an existing one or creates its
 * own (ADR-0208 D1–D2). The dry-run and the commit hand it the same inputs, so they cannot disagree
 * about a candidate neither of them has seen change.
 *
 * - A candidate must be of the source's tier (the caller supplies candidates per tier), pass
 *   `couldMatch` (the cheap aggregate rule-out), have the source's name or the importer's own
 *   variant of it, and carry the same identity.
 * - Preference is exact name, then the oldest variant (`createdAt`, then id, so ties are stable).
 * - **Lazy, in that order.** Content is read for one candidate, then `REUSE_CONTENT_CHUNK` at a time, and
 *   the walk stops at the first identical one, so the common case (the most preferred candidate
 *   matches) reads one calendar rather than every variant. The choice is the same one an eager comparison of
 *   all candidates would make, because the first match in preference order IS that choice.
 * - One existing calendar is claimed by at most one source calendar per import, in file order, so the
 *   file's calendar count is kept and calendars inside one file are never merged.
 * - A source that matches nothing is created under the first free name, exactly as before ADR-0208.
 *   Its name is claimed in `taken`, so a second source of the same name gets the next variant.
 */
export async function resolveCalendarReuse(params: {
  readonly calendars: readonly SourceCalendar[];
  readonly candidatesByScope: ReadonlyMap<ImportCalendarScope, readonly ReuseCandidate[]>;
  /** The cheap rule-out (aggregates). It may only exclude candidates whose key could not match. */
  readonly couldMatch: (source: SourceCalendar, candidate: ReuseCandidate) => boolean;
  /** The identity key of each id, read from storage. Called with at most one chunk at a time. */
  readonly loadKeys: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  /** Mutated: names claimed by created calendars are added. */
  readonly takenByScope: Map<ImportCalendarScope, Set<string>>;
  readonly today: string;
  readonly maxNameLength: number;
  /** Raised when no free name exists, which the bound in {@link firstFreeImportedName} prevents. */
  readonly onNoFreeName: () => never;
}): Promise<Map<string, CalendarResolution>> {
  const resolutions = new Map<string, CalendarResolution>();
  const claimed = new Set<string>();
  const keys = new Map<string, string>();

  for (const source of params.calendars) {
    const ordered = (params.candidatesByScope.get(source.scope) ?? [])
      .filter(
        (candidate) =>
          !claimed.has(candidate.id) &&
          params.couldMatch(source, candidate) &&
          isImportedVariantOf(candidate.name, source.name, params.maxNameLength),
      )
      .sort((a, b) => {
        const exact = Number(b.name === source.name) - Number(a.name === source.name);
        if (exact !== 0) return exact;
        return (
          a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        );
      });

    let chosen: ReuseCandidate | undefined;
    // The first chunk is ONE candidate: the most preferred one matches in the common case (an
    // unchanged re-import), and reading five calendars to learn that cost 40 ms at 300 exceptions each.
    let at = 0;
    let size = 1;
    while (at < ordered.length && chosen === undefined) {
      const chunk = ordered.slice(at, at + size);
      at += size;
      size = REUSE_CONTENT_CHUNK;
      const unread = chunk.filter((candidate) => !keys.has(candidate.id)).map((c) => c.id);
      if (unread.length > 0) {
        for (const [id, key] of await params.loadKeys(unread)) keys.set(id, key);
      }
      chosen = chunk.find((candidate) => keys.get(candidate.id) === source.identityKey);
    }

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
