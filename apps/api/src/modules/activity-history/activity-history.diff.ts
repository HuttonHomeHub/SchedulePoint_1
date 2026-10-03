import { createHash } from 'node:crypto';

import type { Activity, ResourceAssignment } from '@prisma/client';
import {
  ACTIVITY_HISTORY_FIELDS,
  ACTIVITY_HISTORY_KEY_PREFIXES,
  activityHistoryItemKind,
  type ActivityHistoryAssignmentState,
  type ActivityHistoryFieldKey,
  type ActivityHistoryFieldKind,
  type ActivityHistoryLinkEnd,
  type ActivityHistoryLinkState,
  type ActivityHistoryResourceRef,
  type ActivityHistoryScope,
} from '@repo/types';

import { formatCalendarDate } from '../../common/validation/calendar-date';

import {
  MAX_KEYED_ITEMS_PER_ENTRY,
  MERGE_MAX_SPAN_MS,
  MERGE_QUIET_GAP_MS,
} from './activity-history.constants';
import type {
  LatestEntry,
  StoredAssignmentItem,
  StoredChanges,
  StoredFieldItem,
  StoredFieldValue,
  StoredItem,
  StoredLinkItem,
} from './activity-history.types';

/**
 * **The recorder's pure half** (ADR-0174): what changed, whether it joins the latest entry, and
 * what the entry then holds. No database, no clock — the caller supplies both — so every rule of
 * the merge is a table test rather than a mounted write.
 */

/** The activity columns the history diffs. Anything else on the row is ignored by construction. */
export type ActivityRecordedRow = Pick<Activity, ActivityHistoryFieldKey>;

/** Names for the two reference fields, resolved by the caller for the ids that changed. */
export interface ReferenceNames {
  calendars: ReadonlyMap<string, string>;
  parents: ReadonlyMap<string, string>;
}

/** A truncated SHA-256: enough to tell two descriptions apart, too short to be a useful digest of one. */
function describe(text: string): { len: number; h: string } {
  return { len: text.length, h: createHash('sha256').update(text).digest('hex').slice(0, 16) };
}

function fieldValue(
  key: ActivityHistoryFieldKey,
  kind: ActivityHistoryFieldKind,
  row: ActivityRecordedRow,
  names: ReferenceNames,
): StoredFieldValue {
  const raw = row[key];
  if (raw === null || raw === undefined) return null;
  switch (kind) {
    case 'description':
      return describe(raw as string);
    case 'date':
      return formatCalendarDate(raw as Date);
    // The two external dates are `timestamptz`, so the instant is the value: a change only in the
    // time of day is a real change, and rendering them as calendar days would call it net-zero.
    case 'instant':
      return (raw as Date).toISOString();
    // Prisma returns BIGINT as a `bigint`, which `JSON.stringify` refuses. The DTO caps money at
    // `MONEY_MINOR_UNITS_MAX`, well inside the safe-integer range.
    case 'money':
      return Number(raw);
    case 'reference': {
      const id = raw as string;
      const table = key === 'calendarId' ? names.calendars : names.parents;
      return { id, name: table.get(id) ?? '' };
    }
    default:
      return raw as string | number | boolean;
  }
}

/** Net-zero's notion of "the same value": references by id, descriptions by length and digest. */
function fieldValuesEqual(
  kind: ActivityHistoryFieldKind,
  a: StoredFieldValue,
  b: StoredFieldValue,
): boolean {
  if (a === null || b === null) return a === b;
  if (kind === 'reference') return (a as { id: string }).id === (b as { id: string }).id;
  if (kind === 'description') {
    const x = a as { len: number; h: string };
    const y = b as { len: number; h: string };
    return x.len === y.len && x.h === y.h;
  }
  return a === b;
}

/**
 * Diff two reads of one activity, by value. Only the recorded inputs are compared, so the engine
 * rewriting an early date, or the derived `status` moving with the percentage, is never a change.
 *
 * A lane change is returned like any other; whether it earns an entry is {@link isLaneOnly}'s and
 * {@link planRecord}'s decision (CQ-4): the diagram's auto-pack moves lanes without the planner having
 * decided anything, so a lane-only save never creates an entry, but one that travels with another
 * recorded change is kept — and a lane-only save joins an entry that already holds a lane item, so the
 * lane going back reads as the same lane and is not left as a stale "1 → 2".
 */
export function diffActivity(
  before: ActivityRecordedRow,
  after: ActivityRecordedRow,
  names: ReferenceNames,
): StoredChanges {
  const changes: StoredChanges = {};
  for (const key of Object.keys(ACTIVITY_HISTORY_FIELDS) as ActivityHistoryFieldKey[]) {
    const { kind } = ACTIVITY_HISTORY_FIELDS[key];
    const from = fieldValue(key, kind, before, names);
    const to = fieldValue(key, kind, after, names);
    if (!fieldValuesEqual(kind, from, to)) changes[key] = { from, to };
  }
  return changes;
}

/** Whether a diff changed only the lane (CQ-4). */
export function isLaneOnly(changes: StoredChanges): boolean {
  const keys = Object.keys(changes);
  return keys.length === 1 && keys[0] === 'laneIndex';
}

/** The ids of the references a diff would name, so the caller reads only those names. */
export function changedReferenceIds(
  before: ActivityRecordedRow,
  after: ActivityRecordedRow,
): { calendarIds: string[]; parentIds: string[] } {
  const ids = (key: 'calendarId' | 'parentId'): string[] =>
    before[key] === after[key]
      ? []
      : [before[key], after[key]].filter((id): id is string => id !== null);
  return { calendarIds: ids('calendarId'), parentIds: ids('parentId') };
}

export function linkState(row: {
  type: ActivityHistoryLinkState['type'];
  lagMinutes: number;
  lagCalendar: ActivityHistoryLinkState['lagCalendar'];
}): ActivityHistoryLinkState {
  return { type: row.type, lagMinutes: row.lagMinutes, lagCalendar: row.lagCalendar };
}

/**
 * An assignment's full client-settable state. The three quantities are canonical fixed-4 strings
 * taken from the database row — never from the DTO's `number`, a float that can disagree with what
 * was stored — so string equality **is** numeric equality and net-zero needs no decimal parsing.
 */
export function assignmentState(
  row: Pick<
    ResourceAssignment,
    | 'budgetedUnits'
    | 'unitsPerHour'
    | 'actualUnits'
    | 'isDriving'
    | 'curveType'
    | 'lagMinutes'
    | 'budgetedCost'
    | 'actualCost'
  >,
): ActivityHistoryAssignmentState {
  return {
    budgetedUnits: row.budgetedUnits.toFixed(4),
    unitsPerHour: row.unitsPerHour === null ? null : row.unitsPerHour.toFixed(4),
    actualUnits: row.actualUnits.toFixed(4),
    isDriving: row.isDriving,
    curveType: row.curveType,
    lagMinutes: row.lagMinutes,
    budgetedCost: row.budgetedCost === null ? null : Number(row.budgetedCost),
    actualCost: Number(row.actualCost),
  };
}

export const linkKey = (id: string): string => `${ACTIVITY_HISTORY_KEY_PREFIXES.link}${id}`;
export const assignmentKey = (id: string): string =>
  `${ACTIVITY_HISTORY_KEY_PREFIXES.assignment}${id}`;

export function linkItem(
  dir: 'IN' | 'OUT',
  other: ActivityHistoryLinkEnd,
  from: ActivityHistoryLinkState | null,
  to: ActivityHistoryLinkState | null,
): StoredLinkItem {
  return { dir, other, from, to };
}

export function assignmentItem(
  resource: ActivityHistoryResourceRef,
  from: ActivityHistoryAssignmentState | null,
  to: ActivityHistoryAssignmentState | null,
): StoredAssignmentItem {
  return { resource, from, to };
}

/**
 * An assignment item for a change, or `undefined` when nothing the planner can set differs — so a
 * write that touched an assignment's version and nothing else records nothing.
 */
export function assignmentChange(
  resource: ActivityHistoryResourceRef,
  from: ActivityHistoryAssignmentState | null,
  to: ActivityHistoryAssignmentState | null,
): StoredAssignmentItem | undefined {
  const item = assignmentItem(resource, from, to);
  return isNetZero(assignmentKey('x'), item) ? undefined : item;
}

/** Plain structural equality for the two state objects (flat, JSON-safe, no names inside). */
export function statesEqual(a: object | null, b: object | null): boolean {
  if (a === null || b === null) return a === b;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const key of keys) if (x[key] !== y[key]) return false;
  return true;
}

/**
 * Whether an item's two sides are the same by value — the CQ-5 test. Names are **never** compared:
 * a link's `other`, an assignment's `resource` and a reference's name are descriptors of the moment.
 * Both sides `null` (a link added, then removed) is net-zero for the same reason.
 */
export function isNetZero(key: string, item: StoredItem): boolean {
  if (activityHistoryItemKind(key) === 'field') {
    const field = ACTIVITY_HISTORY_FIELDS[key as ActivityHistoryFieldKey];
    const { from, to } = item as StoredFieldItem;
    return fieldValuesEqual(field.kind, from, to);
  }
  const { from, to } = item as StoredLinkItem | StoredAssignmentItem;
  return statesEqual(from, to);
}

/**
 * Join an incoming write's items to an existing entry's. An item seen before keeps its **original**
 * `from` and takes the newest `to` (and the newest descriptor, so the entry names the other end as it
 * was at its latest edit); a new item is added. Items that are then net-zero are dropped, so a
 * result of `{}` means the whole entry cancelled out.
 */
export function mergeChanges(existing: StoredChanges, incoming: StoredChanges): StoredChanges {
  const merged: StoredChanges = { ...existing };
  for (const [key, item] of Object.entries(incoming)) {
    const prior = existing[key];
    merged[key] = prior ? ({ ...item, from: prior.from } as StoredItem) : item;
  }
  for (const [key, item] of Object.entries(merged)) {
    if (isNetZero(key, item)) delete merged[key];
  }
  return merged;
}

const keyedCount = (changes: StoredChanges): number =>
  Object.keys(changes).filter((key) => activityHistoryItemKind(key) !== 'field').length;

/**
 * False ⇔ every item is cost-only (a monetary field, or an assignment change whose only difference
 * is in its money sub-fields). The read uses it in the keyset predicate so a reader without
 * `cost:read` never gets a short page for entries that are empty to them.
 */
export function hasNonCostChange(changes: StoredChanges): boolean {
  return Object.entries(changes).some(([key, item]) => {
    const kind = activityHistoryItemKind(key);
    if (kind === 'field') {
      return ACTIVITY_HISTORY_FIELDS[key as ActivityHistoryFieldKey].kind !== 'money';
    }
    if (kind !== 'assignment') return true;
    const { from, to } = item as StoredAssignmentItem;
    if (from === null || to === null) return true;
    const strip = ({ budgetedCost: _b, actualCost: _a, ...rest }: typeof from): object => rest;
    return !statesEqual(strip(from), strip(to));
  });
}

export interface IncomingWrite {
  actorUserId: string;
  scope: ActivityHistoryScope;
  /** True when one write records several activities; batches never merge, either way (spec rule 6). */
  isBatch: boolean;
  changes: StoredChanges;
}

export type RecordPlan =
  | { action: 'none' }
  | { action: 'insert'; changes: StoredChanges; firstRecordedAt: Date }
  | { action: 'merge'; entryId: string; changes: StoredChanges; lastRecordedAt: Date }
  | { action: 'drop'; entryId: string };

/**
 * Decide what one activity's write does to its history. `now` is database time read **under the
 * history lock** by the caller — never this process's clock (ADR-0174 D4).
 *
 * The merge conditions are the six of the spec §2, and actor and scope are compared **after** the
 * lookup of "the latest entry for this activity, whoever made it": looking up by actor and scope
 * would find my older entry behind a colleague's newer one and merge across them.
 *
 * Times stay strictly increasing per activity: a new entry starts one millisecond after the latest
 * ended, so the sort key `(first_recorded_at, id)` never ties and never falls back on a v7 id minted
 * before the lock was held.
 */
export function planRecord(
  latest: LatestEntry | null,
  write: IncomingWrite,
  now: Date,
): RecordPlan {
  if (Object.keys(write.changes).length === 0) return { action: 'none' };

  const joinable =
    latest !== null &&
    latest.batchId === null &&
    !write.isBatch &&
    latest.actorUserId === write.actorUserId &&
    latest.scope === write.scope &&
    now.getTime() - latest.lastRecordedAt.getTime() <= MERGE_QUIET_GAP_MS &&
    now.getTime() - latest.firstRecordedAt.getTime() <= MERGE_MAX_SPAN_MS;

  // A lane-only save never creates an entry (CQ-4); it may only update a lane item an entry already has.
  if (isLaneOnly(write.changes) && !(joinable && 'laneIndex' in latest.changes)) {
    return { action: 'none' };
  }

  if (joinable) {
    const merged = mergeChanges(latest.changes, write.changes);
    if (Object.keys(merged).length === 0) return { action: 'drop', entryId: latest.id };
    if (keyedCount(merged) <= MAX_KEYED_ITEMS_PER_ENTRY) {
      return {
        action: 'merge',
        entryId: latest.id,
        changes: merged,
        lastRecordedAt: new Date(Math.max(now.getTime(), latest.lastRecordedAt.getTime())),
      };
    }
  }

  return {
    action: 'insert',
    changes: write.changes,
    firstRecordedAt: new Date(
      latest === null
        ? now.getTime()
        : Math.max(now.getTime(), latest.lastRecordedAt.getTime() + 1),
    ),
  };
}
