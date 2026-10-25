import type { SwimlaneAssignment } from '@/features/tsld';
import { SWIMLANES_FOLLOW_WBS_REASON } from '@/features/tsld/model/swimlane-assignment';

/**
 * What the Gantt is told about the plan's swimlanes (swimlanes M4-T2). The host composes it, so this
 * feature learns nothing of how a swimlane is stored or written: with hand-made swimlanes it carries the
 * one assignment the table's bulk bar and the editor also use; with swimlanes that follow the WBS the
 * column is shown read-only with its reason (US-4). Absent when the plan has no swimlanes to show, which
 * leaves the grid exactly as it was.
 */
export type GanttSwimlanes =
  { source: 'MANUAL'; assignment: SwimlaneAssignment } | { source: 'WBS' };

/** What a WBS-sourced plan's cell reads: the swimlane is derived, so the cell names the rule. */
export const FOLLOWS_WBS_LABEL = 'Follows the WBS';

/** Why a WBS-sourced plan's cell is read-only. The sentence is the table's, from the same constant. */
export const SWIMLANE_CELL_WBS_REASON = SWIMLANES_FOLLOW_WBS_REASON;

/** The cell's text: the swimlane's name, the WBS rule, or null for none (the column prints a dash). */
export function swimlaneCellLabel(swimlanes: GanttSwimlanes, activityId: string): string | null {
  if (swimlanes.source === 'WBS') return FOLLOWS_WBS_LABEL;
  const id = swimlanes.assignment.currentOf(activityId);
  if (id === null) return null;
  return swimlanes.assignment.choices.find((c) => c.id === id)?.name ?? null;
}
