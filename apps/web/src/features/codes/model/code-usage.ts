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

const activitiesCount = (count: number): string =>
  count === 1 ? '1 activity' : `${String(count)} activities`;

/**
 * What deleting a value does, for the confirmation: who carries it and what they read as. True of the
 * server: a deleted value is absent from `codes`, and a restore brings every carrier back.
 */
export function valueDeleteSentence(count: number, typeName: string): string {
  if (count === 0) return 'No activity carries it. You can restore it from Deleted values.';
  return count === 1
    ? `1 activity carries it. It will read as having no ${typeName} until you restore it.`
    : `${activitiesCount(count)} carry it. They will read as having no ${typeName} until you restore it.`;
}

/** The title for the same confirmation: "Delete L1?". */
export const valueDeleteTitle = (shortCode: string): string => `Delete ${shortCode}?`;

/** What deleting a type does: its values go with it, and so does every carrier's value of it. */
export function typeDeleteSentence(count: number, typeName: string): string {
  if (count === 0) {
    return `No activity carries a value of ${typeName}. You can restore it from Deleted code types.`;
  }
  return count === 1
    ? `1 activity carries a value of ${typeName}. It will read as having no ${typeName} until you restore it.`
    : `${activitiesCount(count)} carry a value of ${typeName}. They will read as having no ${typeName} until you restore it.`;
}

/** "Delete Area and its 4 values?", or "Delete Area?" when it has none. */
export function typeDeleteTitle(name: string, valueCount: number): string {
  if (valueCount === 0) return `Delete ${name}?`;
  return `Delete ${name} and its ${valueCount === 1 ? '1 value' : `${String(valueCount)} values`}?`;
}
