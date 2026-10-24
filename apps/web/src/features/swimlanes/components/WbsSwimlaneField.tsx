import type { ActivitySummary } from '@repo/types';
import { useMemo } from 'react';

import { WBS_SWIMLANES_REASON } from '../model/wbs-swimlane-copy';

import { TextField } from '@/components/ui/form';
import { NO_SWIMLANE_LABEL } from '@/features/tsld/render/project-swimlanes';
import { wbsSwimlaneInput } from '@/features/wbs';

/**
 * **The activity editor's Swimlane field while the plan's swimlanes follow its WBS** (swimlanes M3-T1,
 * feature-spec US-4): the swimlane the activity is in, shown and not editable, with the reason.
 *
 * It is read-only, not disabled (ADR-0083): the value is the answer to "where is this?", worth
 * selecting and reading with a screen reader's cursor, and the reason is a visible sentence the field
 * is described by. The way to change it is the Breakdown field — filing the activity under another
 * summary — which this field's neighbours already are.
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
      label="Swimlane"
      value={name}
      gate={{ writable: false, reason: WBS_SWIMLANES_REASON }}
    />
  );
}
