import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { MoveToSwimlaneControl } from '@/features/tsld/components/MoveToSwimlaneControl';
import type { SwimlaneAssignment } from '@/features/tsld/model/swimlane-assignment';

const selectedCount = (n: number): string =>
  n === 1 ? '1 activity selected' : `${String(n)} activities selected`;

/**
 * Bulk **assign to a swimlane** for the Activities table's selection (swimlanes M4-T1): the same
 * `MoveToSwimlaneControl` the selection bars and the editor use, so the table cannot plan or word the
 * write a fourth way. `assignment.assign` is the host's one all-or-nothing write and one undo step.
 *
 * Like `WbsBulkAssignBar` it renders whenever something is selected, **including** for a reader who
 * cannot write: the control is shaded (`aria-disabled`, never native `disabled`) and its status line
 * says why, because the ticked rows are the only way to reach that explanation (ADR-0063 §10.2,
 * ADR-0204).
 */
export function SwimlaneBulkAssignBar({
  assignment,
  ids,
  names,
  gate,
  onDone,
  onClear,
  companion = false,
}: {
  assignment: SwimlaneAssignment;
  /** The ticked activity ids; the bar renders nothing when empty. */
  ids: readonly string[];
  /** Their names, in the same order, for the one-activity announcement. */
  names: readonly string[];
  /** May the caller write, and — when not — why. */
  gate: { writable: boolean; reason: string | null };
  /** A move landed: the host clears its selection and returns focus. */
  onDone: () => void;
  /** The user dismissed the selection without moving. */
  onClear: () => void;
  /**
   * Another bar over the same selection already states the count and offers Clear selection (the WBS
   * assign bar, when the plan has summaries), so this one leaves both out rather than say them twice.
   */
  companion?: boolean;
}): React.ReactElement | null {
  const headingId = useId();
  if (ids.length === 0) return null;
  return (
    <div
      role="group"
      {...(companion ? { 'aria-label': 'Swimlane' } : { 'aria-labelledby': headingId })}
      className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-3"
    >
      {companion ? null : (
        <p id={headingId} className="text-foreground text-sm">
          {selectedCount(ids.length)}
        </p>
      )}
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={ids}
        names={names}
        gate={gate}
        onDone={onDone}
        fieldLabel="Move to swimlane"
        hint={
          assignment.shown ? undefined : (
            <p>Swimlanes aren’t shown on the diagram. Turn on Swimlanes in View to see them.</p>
          )
        }
      />
      {companion ? null : (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear selection
          </Button>
        </div>
      )}
    </div>
  );
}
