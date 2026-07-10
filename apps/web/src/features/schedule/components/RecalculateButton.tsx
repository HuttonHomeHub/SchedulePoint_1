import { useId, useState } from 'react';

import { NO_START_HINT, PLAN_START_REQUIRED, useRecalculate } from '../api/use-schedule';

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
 * only POSTs and lets the mutation refetch the schedule + activities. Every
 * failure surfaces as a visible inline message (not just a screen-reader
 * announcement): a plan with no start date gets a friendly prompt, anything else
 * a generic retry message. Uses `aria-disabled` (not native `disabled`) so focus
 * stays on the button while the request is in flight. Renders nothing for a reader.
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
  const [inlineError, setInlineError] = useState<string | null>(null);
  const errorId = useId();

  if (!canCalculate) return null;

  const onClick = (): void => {
    if (recalculate.isPending) return; // guard: the button stays focusable (aria-disabled)
    setInlineError(null);
    recalculate.mutate(undefined, {
      onSuccess: () => announce('Schedule recalculated.'),
      onError: (error) =>
        setInlineError(
          isPlanStartRequired(error)
            ? NO_START_HINT
            : 'Couldn’t recalculate the schedule. Please try again.',
        ),
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={onClick}
        aria-disabled={recalculate.isPending}
        aria-busy={recalculate.isPending}
        aria-describedby={inlineError ? errorId : undefined}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {recalculate.isPending ? 'Recalculating…' : 'Recalculate'}
      </Button>
      {inlineError ? (
        <p id={errorId} role="alert" className="text-destructive-text max-w-xs text-right text-sm">
          {inlineError}
        </p>
      ) : null}
    </div>
  );
}
