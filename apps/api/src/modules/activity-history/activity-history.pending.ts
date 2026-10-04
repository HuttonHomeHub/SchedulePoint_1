import type { ActivityHistoryLinkEnd, ActivityHistoryResourceRef } from '@repo/types';

import type { StoredChanges } from './activity-history.types';

/**
 * **A write's changes, with their names still to be read.** A history item carries the name of the
 * calendar, WBS parent, resource or link end it mentions, as that name is now. Reading those names
 * one query at a time cost a round trip each inside the write's transaction, so the recorder reads
 * them in the same statement that finds the latest entry (ADR-0174 D4, round trips measured in
 * `implementation-plan.md` M1-T7). A caller therefore describes what changed and which names it
 * needs, and the recorder supplies the names once it holds the history lock.
 *
 * What is decided without a name — whether there is anything to record at all, and under which
 * keys — is `keys`, so a write that changes nothing still takes no lock and issues no statement.
 */
export interface PendingChanges {
  /** The item keys {@link PendingChanges.build} will return, known without any name. */
  readonly keys: readonly string[];
  /** The ids whose names the items carry. */
  readonly refs: NameRefs;
  build(names: ResolvedNames): StoredChanges;
}

export interface NameRefs {
  readonly calendarIds: readonly string[];
  readonly parentIds: readonly string[];
  readonly resourceIds: readonly string[];
}

/** Names read under the history lock. */
export interface ResolvedNames {
  readonly calendars: ReadonlyMap<string, string>;
  readonly parents: ReadonlyMap<string, string>;
  readonly resources: ReadonlyMap<string, ActivityHistoryResourceRef>;
  /** The activities the write records — a link end names the other end from here. */
  readonly activities: ReadonlyMap<string, ActivityHistoryLinkEnd>;
}

const NO_REFS: NameRefs = { calendarIds: [], parentIds: [], resourceIds: [] };

/** Nothing to record: used where one part of a combined write has no change. */
export function noChanges(): PendingChanges {
  return { keys: [], refs: NO_REFS, build: () => ({}) };
}

/** Items that need no name, such as a plain field change. */
export function fixedChanges(changes: StoredChanges): PendingChanges {
  return { keys: Object.keys(changes), refs: NO_REFS, build: () => changes };
}

/** The union of several parts of one write; a later part's item wins on a key both carry. */
export function combineChanges(...parts: readonly PendingChanges[]): PendingChanges {
  const union = (pick: (refs: NameRefs) => readonly string[]): string[] => [
    ...new Set(parts.flatMap((p) => pick(p.refs))),
  ];
  return {
    keys: [...new Set(parts.flatMap((p) => p.keys))],
    refs: {
      calendarIds: union((r) => r.calendarIds),
      parentIds: union((r) => r.parentIds),
      resourceIds: union((r) => r.resourceIds),
    },
    build: (names) => Object.assign({}, ...parts.map((p) => p.build(names))) as StoredChanges,
  };
}
