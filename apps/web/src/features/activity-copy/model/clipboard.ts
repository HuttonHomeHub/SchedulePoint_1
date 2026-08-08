import type { ActivitySummary } from '@repo/types';

/**
 * The app clipboard for activities (`docs/specs/activity-copy-paste/` M3-T1).
 *
 * **It stores ids, not rows.** A snapshot of `ActivitySummary` objects taken at copy time would go
 * stale the instant anything changed — a duration edited, a recalculation moving the dates, the
 * activity renamed — and the paste would silently recreate the plan as it was minutes ago. Ids are
 * resolved against the **live** list at paste time, so a copy always pastes what those activities
 * are now, and an activity that has since been deleted is **reported** rather than skipped.
 *
 * **Its lifetime mirrors the ADR-0048 undo history deliberately** — cleared on plan switch and on
 * pen release. Not because a clipboard strictly needs the pen (holding one is a read), but because
 * the two are the same mental object to a planner: "the things I am in the middle of doing to this
 * plan". Two different lifetimes would mean an undo stack that had been cleared while a clipboard
 * survived, and a paste that lands work the planner can no longer undo in one step.
 *
 * Per session and in memory: nothing is written to the system clipboard. Reading the OS clipboard
 * requires a permission prompt, writing to it would clobber whatever text the planner had there,
 * and neither buys anything — a copy is only meaningful inside a plan, and cross-plan paste is not
 * in this epic's scope.
 */
export interface ClipboardContents {
  /** The source plan. A paste into a different plan is refused rather than translated. */
  readonly planId: string;
  readonly activityIds: readonly string[];
}

/** What a paste found when it resolved the clipboard against the live plan. */
export interface ResolvedClipboard {
  /** The activities that still exist, in the clipboard's order. */
  readonly present: readonly ActivitySummary[];
  /**
   * How many copied activities have since been deleted. Reported rather than swallowed: a planner
   * who copies six and pastes four has been told something false by silence.
   */
  readonly missingCount: number;
}

/**
 * Resolve a clipboard against the plan as it is now.
 *
 * Order follows the **clipboard**, not the live list, so a paste of a chain the planner selected in
 * a particular order recreates it in that order — and so two pastes of one clipboard are identical.
 */
export function resolveClipboard(
  contents: ClipboardContents,
  live: readonly ActivitySummary[],
): ResolvedClipboard {
  const byId = new Map(live.map((a) => [a.id, a]));
  const present: ActivitySummary[] = [];
  let missingCount = 0;
  for (const id of contents.activityIds) {
    const row = byId.get(id);
    if (row === undefined) missingCount += 1;
    else present.push(row);
  }
  return { present, missingCount };
}

/**
 * What the planner is told when some of what they copied is no longer there.
 *
 * Empty string when nothing is missing, so a caller can concatenate unconditionally — the same
 * shape the M4 skipped-assignment note uses, and for the same reason: these ride the **success**
 * announcement rather than a second live-region write, which would collapse to whichever landed
 * last (TECH_DEBT #104).
 */
export function missingNote(missingCount: number): string {
  if (missingCount === 0) return '';
  return missingCount === 1
    ? ' 1 copied activity no longer exists and was not pasted.'
    : ` ${String(missingCount)} copied activities no longer exist and were not pasted.`;
}
