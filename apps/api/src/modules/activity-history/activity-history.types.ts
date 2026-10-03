import type {
  ActivityHistoryAssignmentState,
  ActivityHistoryLinkEnd,
  ActivityHistoryLinkState,
  ActivityHistoryResourceRef,
  ActivityHistoryScope,
} from '@repo/types';

/**
 * What `activity_history_entries.changes` holds, as the recorder writes it. The response DTO's
 * shapes (`@repo/types`) are this minus what a reader must not see: the description digest, and
 * cost for a reader without `cost:read`.
 */

/** A description is never stored as text, only its length and a truncated SHA-256 (ADR-0174 D3). */
export interface StoredDescription {
  len: number;
  h: string;
}

export type StoredFieldValue =
  string | number | boolean | null | { id: string; name: string } | StoredDescription;

export interface StoredFieldItem {
  from: StoredFieldValue;
  to: StoredFieldValue;
}

export interface StoredLinkItem {
  dir: 'IN' | 'OUT';
  other: ActivityHistoryLinkEnd;
  from: ActivityHistoryLinkState | null;
  to: ActivityHistoryLinkState | null;
}

export interface StoredAssignmentItem {
  resource: ActivityHistoryResourceRef;
  from: ActivityHistoryAssignmentState | null;
  to: ActivityHistoryAssignmentState | null;
}

export type StoredItem = StoredFieldItem | StoredLinkItem | StoredAssignmentItem;

/** One entry's `changes`: an object keyed by item, so merge is "keep `from`, overwrite `to`". */
export type StoredChanges = Record<string, StoredItem>;

/** The latest entry for an activity, as the merge decision needs it. */
export interface LatestEntry {
  id: string;
  actorUserId: string;
  scope: ActivityHistoryScope;
  firstRecordedAt: Date;
  lastRecordedAt: Date;
  editCount: number;
  batchId: string | null;
  changes: StoredChanges;
}
