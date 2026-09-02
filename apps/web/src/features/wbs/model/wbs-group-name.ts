/**
 * The **one** way a work-breakdown group is named for assistive technology.
 *
 * The comment this carries was moved verbatim from `GanttPanel.tsx`, where the string was an inline
 * template literal, because comments in this repository record decisions rather than restate code:
 *
 * > The count is part of the accessible name, not a decoration beside it: "Unassigned" alone does
 * > not say whether the row is worth expanding.
 *
 * Extracted for `docs/TECH_DEBT.md` #232. The Gantt already named its bucket row this way and the
 * TSLD's WBS band named nothing at all — a screen-reader user learnt that a plan had unfiled work
 * in one view of it and not the other. Two call sites now share this function so they cannot drift
 * into naming the same group two ways, which is a difference only a reader who opened the same plan
 * in both views would ever notice.
 *
 * **What `count` means is the caller's decision and it is not the same everywhere**, which is why
 * this function takes a number rather than a group: the derived "Unassigned" bucket has no nesting,
 * so its members and its subtree are the same set; a real `WBS_SUMMARY` can nest, and the band
 * counts its **whole subtree** (product-owner decision, 2026-09-02) because a phase's size is the
 * work inside it, not how many boxes it was split into at the first level.
 */
export function wbsGroupAccessibleName({ label, count }: { label: string; count: number }): string {
  return `${label}, ${String(count)} ${count === 1 ? 'activity' : 'activities'}`;
}
