import type { EditedField, ResourceAssignmentSummary } from '@repo/types';

/**
 * One assignment write, as the surface that made it reports it to a host that wants to record it
 * (undo-redo M3). The resources feature does not know the undo history exists; it says what happened,
 * with the rows on either side of it, and the host decides what to do — the `onAdded / onRemoved /
 * onEdited` precedent the Logic tab set.
 *
 * `resourceName` is carried because an assignment row holds only a resource id, and a step that is
 * later set aside has to name what it was about.
 *
 * `displaced` is the driver a write took over from, as it stood before: making a resource the driver
 * moves the previous one off in the same request, and reversing the write has to put it back.
 */
export type AssignmentEdit =
  | {
      kind: 'added';
      assignment: ResourceAssignmentSummary;
      resourceName: string;
      displaced?: ResourceAssignmentSummary;
    }
  | {
      kind: 'edited';
      before: ResourceAssignmentSummary;
      after: ResourceAssignmentSummary;
      resourceName: string;
      /** The triad quantity the write named, which the server recomputes the dependent from (ADR-0040). */
      editedField?: EditedField;
      displaced?: ResourceAssignmentSummary;
    }
  | { kind: 'removed'; assignment: ResourceAssignmentSummary; resourceName: string };

export type OnAssignmentEdited = (edit: AssignmentEdit) => void;
