import type { ActivityCodeAssignment } from '@repo/types';

/** How many activities carry each value, and each type (an activity counts once for a type). */
export interface CodeUsage {
  byValue: ReadonlyMap<string, number>;
  byType: ReadonlyMap<string, number>;
}

/**
 * Counted from the activities already in memory (the workspace loads the whole plan), so the delete
 * sentences name a real number without a request. An activity carries at most one value per type, so a
 * type's count is the number of activities with an entry for it.
 */
export function codeUsage(activities: readonly { codes?: ActivityCodeAssignment[] }[]): CodeUsage {
  const byValue = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const activity of activities) {
    for (const entry of activity.codes ?? []) {
      byValue.set(entry.codeValueId, (byValue.get(entry.codeValueId) ?? 0) + 1);
      byType.set(entry.codeTypeId, (byType.get(entry.codeTypeId) ?? 0) + 1);
    }
  }
  return { byValue, byType };
}

/**
 * What deleting a value does, for the confirmation: who uses it and what they show. True of the
 * server: a deleted value is absent from `codes`, and a restore brings every carrier back. `count` is
 * `undefined` while the plan's activities are still loading, and then the sentence says nothing about
 * how many rather than claiming none.
 */
export function valueDeleteSentence(count: number | undefined, typeName: string): string {
  if (count === undefined) {
    return `Activities that use it will show no ${typeName} until you restore it.`;
  }
  if (count === 0) return 'No activities use it. You can restore it from Deleted values.';
  return count === 1
    ? `1 activity uses it. It will show no ${typeName} until you restore it.`
    : `${String(count)} activities use it. They will show no ${typeName} until you restore it.`;
}

/** The title for the same confirmation: "Delete L1?". */
export const valueDeleteTitle = (shortCode: string): string => `Delete ${shortCode}?`;

/** What deleting a type does: its values go with it, and so does every activity's value of it. */
export function typeDeleteSentence(typeName: string): string {
  return `Activities that use ${typeName} will show no ${typeName} until you restore it. You can do that from Deleted code types.`;
}

/** "Delete Area and its 4 values?", or "Delete Area?" when it has none. */
export function typeDeleteTitle(name: string, valueCount: number): string {
  if (valueCount === 0) return `Delete ${name}?`;
  return `Delete ${name} and its ${valueCount === 1 ? '1 value' : `${String(valueCount)} values`}?`;
}
