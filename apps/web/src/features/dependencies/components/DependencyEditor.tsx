import type { ActivitySummary, CalendarSummary, DependencySummary } from '@repo/types';
import type { RefObject } from 'react';

import { ActivityLogicPanel } from './ActivityLogicPanel';

import { Dialog } from '@/components/ui/dialog';

/**
 * The Logic **dialog** — a thin `Dialog` around {@link ActivityLogicPanel}, which owns the
 * predecessors/successors tables and their add/edit/remove flows. The split exists so the same
 * surface can be mounted inside the activity editor's Logic tab without a second implementation.
 *
 * `activity` is optional so the `<dialog>` element stays mounted (toggled by `open`), preserving
 * native focus-restore. `Dialog` renders its children only while open, so the panel — and its
 * queries — come and go with it.
 */
export function DependencyEditor({
  open,
  onClose,
  activity,
  ...panel
}: {
  orgSlug: string;
  planId: string;
  activity?: ActivitySummary;
  /** The plan's activities, for the add picker (self is excluded here). */
  planActivities?: ActivitySummary[];
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  calendars?: CalendarSummary[];
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  planCalendarId?: string;
  canManageLogic?: boolean;
  open: boolean;
  onClose: () => void;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  onAdded?: (dependency: DependencySummary) => void;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  onRemoved?: (dependency: DependencySummary) => void;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  crossPlanSlot?: React.ReactNode;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  notesSlot?: React.ReactNode;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  notesHeadingRef?: RefObject<HTMLHeadingElement | null>;
  /** See {@link ActivityLogicPanel} — forwarded unchanged. */
  revealNotes?: boolean;
}): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={activity ? `Logic for ${activity.name}` : 'Logic'}
      description="The predecessors and successors that link this activity into the schedule."
    >
      <ActivityLogicPanel enabled={open} {...(activity ? { activity } : {})} {...panel} />
    </Dialog>
  );
}
