import { useId } from 'react';

import { Button } from '@/components/ui/button';

export interface RowActionButtonProps {
  /** The button's accessible name, naming its row ("Move Mechanical up"): an icon alone names nothing (ADR-0117). */
  label: string;
  /** A stable marker (`data-row-action`) a host can find the button by to hand focus back to it. */
  action: string;
  icon: React.ReactNode;
  /** The action cannot be taken now. It stays focusable and says why (ADR-0204); it is never natively disabled. */
  shut: boolean;
  /** The id of the dialog's one pen sentence, when the pen is why every action is shut. */
  describedBy: string | undefined;
  /** Why a move has nowhere to go; this action's own sentence, read as a description. */
  endReason?: string | undefined;
  onPress: () => void;
}

/**
 * **One row action in a dialog's list: an icon button named for its row, shaded rather than disabled**
 * (ADR-0204, ADR-0117). Extracted from the Swimlanes dialog when the Codes… dialog became its second
 * user, so the rule it carries — `aria-disabled` with a per-row reason, never native `disabled` —
 * has one implementation and cannot fork.
 *
 * A shaded button keeps focus and still announces its reason: the pen sentence through `describedBy`,
 * and, for a move that has nowhere to go, its own sentence through `endReason`, rendered as
 * screen-reader-only text beside it.
 */
export function RowActionButton({
  label,
  action,
  icon,
  shut,
  describedBy,
  endReason,
  onPress,
}: RowActionButtonProps): React.ReactElement {
  const endId = useId();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-row"
        aria-label={label}
        aria-disabled={shut || undefined}
        aria-describedby={
          [describedBy, endReason ? endId : undefined].filter(Boolean).join(' ') || undefined
        }
        data-row-action={action}
        onClick={() => {
          if (!shut) onPress();
        }}
      >
        {icon}
      </Button>
      {endReason ? (
        <span id={endId} className="sr-only">
          {endReason}
        </span>
      ) : null}
    </>
  );
}
