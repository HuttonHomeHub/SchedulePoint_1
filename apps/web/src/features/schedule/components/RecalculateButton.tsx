import { useState } from 'react';

import { PLAN_START_REQUIRED, useRecalculate } from '../api/use-schedule';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ApiFetchError } from '@/lib/api/client';

/** True when the error is the API's 422 "the plan has no start date" rejection. */
function isPlanStartRequired(error: unknown): boolean {
  return (
    error instanceof ApiFetchError &&
    error.status === 422 &&
    (error.error.details as { reason?: string } | undefined)?.reason === PLAN_START_REQUIRED
  );
}

/**
 * Trigger a CPM recalculation (Planner/Org Admin). The API is authoritative — this
 * only POSTs and lets the mutation refetch the schedule + activities. A plan with
 * no start date (422) surfaces as a friendly inline prompt rather than a raw
 * error; any other failure is announced. Renders nothing for a reader.
 */
export function RecalculateButton({
  orgSlug,
  planId,
  canCalculate,
}: {
  orgSlug: string;
  planId: string;
  canCalculate: boolean;
}): React.ReactElement | null {
  const recalculate = useRecalculate(orgSlug, planId);
  const announce = useAnnounce();
  const [needsStart, setNeedsStart] = useState(false);

  if (!canCalculate) return null;

  const onClick = (): void => {
    setNeedsStart(false);
    recalculate.mutate(undefined, {
      onSuccess: () => announce('Schedule recalculated.'),
      onError: (error) => {
        if (isPlanStartRequired(error)) {
          setNeedsStart(true);
        } else {
          announce('Couldn’t recalculate the schedule. Please try again.');
        }
      },
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={recalculate.isPending} aria-busy={recalculate.isPending}>
        {recalculate.isPending ? 'Recalculating…' : 'Recalculate'}
      </Button>
      {needsStart ? (
        <p role="alert" className="text-destructive-text max-w-xs text-right text-sm">
          Set the plan’s start date first, then recalculate.
        </p>
      ) : null}
    </div>
  );
}
