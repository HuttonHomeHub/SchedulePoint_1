import {
  ACTIVITY_HISTORY_FIELDS,
  activityHistoryItemKind,
  type ActivityHistoryAssignmentChange,
  type ActivityHistoryAssignmentState,
  type ActivityHistoryChange,
  type ActivityHistoryFieldKey,
  type ActivityHistoryFieldChange,
} from '@repo/types';

import type {
  StoredAssignmentItem,
  StoredChanges,
  StoredFieldItem,
  StoredLinkItem,
} from './activity-history.types';

/**
 * **What a reader is allowed to see of one stored entry** (ADR-0174 D7). Pure, so the whole policy is
 * a table test:
 *
 * - A description is only ever "changed" — the length and digest never leave the server.
 * - Without `cost:read`, a monetary field item is dropped, an assignment's money sub-fields are
 *   stripped, and an assignment *change* that differed only in money is dropped. An assignment **add
 *   or remove** stays — a Viewer sees "Resource added: Tower crane — 40 h", just no money.
 * - A key the vocabulary no longer names is skipped rather than guessed at: it cannot be rendered, and
 *   whether it was cost is unknowable.
 *
 * Returns `null` when nothing is left. The read's keyset predicate already excludes entries that are
 * cost-only for a non-cost reader, so `null` there means the entry held only a skipped key.
 */
export function redactChanges(
  changes: StoredChanges,
  canReadCost: boolean,
): Record<string, ActivityHistoryChange> | null {
  const out: Record<string, ActivityHistoryChange> = {};
  for (const [key, item] of Object.entries(changes)) {
    const kind = activityHistoryItemKind(key);
    if (kind === 'field') {
      const field = ACTIVITY_HISTORY_FIELDS[key as ActivityHistoryFieldKey] as
        { kind: string; cost?: true } | undefined;
      if (!field) continue;
      if (field.cost && !canReadCost) continue;
      out[key] =
        field.kind === 'description'
          ? { changed: true }
          : (item as StoredFieldItem as ActivityHistoryFieldChange);
    } else if (kind === 'assignment') {
      const redacted = redactAssignment(item as StoredAssignmentItem, canReadCost);
      if (redacted) out[key] = redacted;
    } else {
      out[key] = item as StoredLinkItem;
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

function stripMoney(
  state: ActivityHistoryAssignmentState | null,
): ActivityHistoryAssignmentState | null {
  if (state === null) return null;
  const { budgetedCost: _budgeted, actualCost: _actual, ...rest } = state;
  return rest;
}

function redactAssignment(
  item: StoredAssignmentItem,
  canReadCost: boolean,
): ActivityHistoryAssignmentChange | null {
  if (canReadCost) return item;
  const from = stripMoney(item.from);
  const to = stripMoney(item.to);
  if (from !== null && to !== null && JSON.stringify(from) === JSON.stringify(to)) return null;
  return { resource: item.resource, from, to };
}
