import { useId, useState } from 'react';

import { useRecalculateCommand } from '../api/use-schedule';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';

/**
 * Trigger a CPM recalculation (Planner/Org Admin). The API is authoritative — this
 * only POSTs and lets the mutation refetch the schedule + activities. Every
 * failure surfaces as a visible inline message (not just a screen-reader
 * announcement): a plan with no start date gets a friendly prompt, anything else
 * a generic retry message. Uses `aria-disabled` (not native `disabled`) so focus
 * stays on the button while the request is in flight. The recalc command itself
 * (mutation + failure taxonomy) is shared with the ADR-0031 toolbar via
 * {@link useRecalculateCommand}. Renders nothing for a reader.
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
  const { isPending, run } = useRecalculateCommand(orgSlug, planId);
  const announce = useAnnounce();
  const [inlineError, setInlineError] = useState<string | null>(null);
  const errorId = useId();

  if (!canCalculate) return null;

  const onClick = (): void => {
    setInlineError(null);
    run({ onSuccess: () => announce('Schedule recalculated.'), onError: setInlineError });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={onClick}
        aria-disabled={isPending}
        aria-busy={isPending}
        aria-describedby={inlineError ? errorId : undefined}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
      >
        {isPending ? 'Recalculating…' : 'Recalculate'}
      </Button>
      {inlineError ? (
        <p id={errorId} role="alert" className="text-destructive-text max-w-xs text-right text-sm">
          {inlineError}
        </p>
      ) : null}
    </div>
  );
}
