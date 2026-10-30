import type { ActivitySummary } from '@repo/types';
import { useId } from 'react';

import { CodeAssignControl } from './CodeAssignControl';

import { Button } from '@/components/ui/button';
import type { Command } from '@/features/undo-redo';

const selectedCount = (n: number): string =>
  n === 1 ? '1 activity selected' : `${String(n)} activities selected`;

/**
 * Bulk **Set <type>** for the Activities table's ticked rows (`m3-ui-design.md` §7.3): the same
 * {@link CodeAssignControl} the diagram's selection bars use (T4), so the table cannot plan or word the
 * write a different way. Its one write is one request and one undo step.
 *
 * Like the swimlane bar it renders whenever something is ticked, **including** for a reader who cannot
 * write: the control is shaded (`aria-disabled`, never native `disabled`) and its status line says why,
 * because the ticked rows are the only way to reach that explanation (ADR-0063 §10.2, ADR-0204).
 * Summaries have no tick box in the table, so a bulk set never reaches one.
 *
 * `companion` is the swimlane bar's mode: another bar over the same selection already states the count
 * and offers Clear selection, so this one leaves both out rather than say them twice.
 */
export function CodeBulkAssignBar({
  orgSlug,
  planId,
  activities,
  gate,
  record,
  onDone,
  onClear,
  companion = false,
}: {
  orgSlug: string;
  planId: string;
  /** The ticked activities as the live list holds them; the bar renders nothing when empty. */
  activities: readonly ActivitySummary[];
  gate: { writable: boolean; reason: string | null };
  record?: ((command: Command) => void) | undefined;
  /** A set landed: the host clears its selection and returns focus. */
  onDone: () => void;
  /** The user dismissed the selection without setting. */
  onClear: () => void;
  companion?: boolean;
}): React.ReactElement | null {
  const headingId = useId();
  if (activities.length === 0) return null;
  return (
    <div
      role="group"
      {...(companion ? { 'aria-label': 'Codes' } : { 'aria-labelledby': headingId })}
      className={
        companion
          ? 'border-border flex flex-col gap-3 border-t pt-3'
          : 'border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-3'
      }
    >
      {companion ? null : (
        <p id={headingId} className="text-foreground text-sm">
          {selectedCount(activities.length)}
        </p>
      )}
      <CodeAssignControl
        orgSlug={orgSlug}
        planId={planId}
        activities={activities}
        gate={gate}
        record={record}
        onDone={onDone}
        quietStatus={companion}
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
