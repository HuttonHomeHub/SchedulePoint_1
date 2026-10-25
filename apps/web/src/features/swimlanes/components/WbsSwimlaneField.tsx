import type { ActivitySummary } from '@repo/types';
import { useMemo } from 'react';

import { WBS_SWIMLANES_REASON } from '../model/wbs-swimlane-copy';

import { TextField } from '@/components/ui/form';
import { NO_SWIMLANE_LABEL } from '@/features/tsld';
import { wbsSwimlaneInput } from '@/features/wbs';

/**
 * **The activity editor's Swimlane field while the plan's swimlanes follow its WBS** (swimlanes M3-T1,
 * feature-spec US-4): the swimlane the activity is in, shown and not editable, with the reason.
 *
 * It is read-only, not disabled (ADR-0083): the value is the answer to "where is this?", worth
 * selecting and reading with a screen reader's cursor, and the reason is a visible sentence the field
 * is described by. The way to change it is to file the activity under another summary in Breakdown,
 * which the reason says. The label is "Current swimlane" so it does not repeat the section's heading.
 *
 * Its value is read from the same membership the diagram draws (`wbsSwimlaneInput`, one build per data
 * change), so the editor and the picture cannot name different swimlanes.
 */
export function WbsSwimlaneField({
  activities,
  level,
  activityId,
}: {
  activities: readonly ActivitySummary[];
  level: number;
  activityId: string;
}): React.ReactElement {
  const input = useMemo(() => wbsSwimlaneInput(activities, level), [activities, level]);
  const swimlaneId = input.membership.get(activityId) ?? null;
  const name = input.swimlanes.find((s) => s.id === swimlaneId)?.name ?? NO_SWIMLANE_LABEL;
  return (
    <TextField
      label="Current swimlane"
      value={name}
      gate={{ writable: false, reason: WBS_SWIMLANES_REASON }}
    />
  );
}
