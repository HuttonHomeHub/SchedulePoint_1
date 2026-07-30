import type { ActivitySummary } from '@repo/types';
import { useId, useState } from 'react';

import { bulkParentChanges } from '../model/membership-diff';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { useUpdateActivityParents } from '@/features/activities';

/** The sentinel `<option>` value for "file these at the top level" — `null` cannot ride in a DOM value. */
const TOP_LEVEL = '';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${String(n)} ${many}`;

/**
 * Bulk **assign** for a table selection: file the ticked activities under one summary, or return
 * them to the top level.
 *
 * This is the second half of the pair the epic's spec calls out (C-1). `ActivityMembersPanel`
 * answers *"what is in this band?"* from the summary; this answers *"where do these go?"* from the
 * list — the same question a planner asks with forty rows on screen, and one the per-child picker
 * could only answer forty dialogs at a time.
 *
 * It deliberately shares the model rather than the markup: {@link bulkParentChanges} and
 * `membershipDiff` both emit the same minimal, version-carrying batch for the same endpoint, so the
 * two surfaces cannot disagree about what a move is.
 *
 * The bar renders whenever something is selected, **including** for a reader who cannot write — the
 * control is shaded and says why (the house rule; a Planner who has not taken the pen is the case
 * that keeps being got wrong). Hiding it would make the checkboxes a dead end with no explanation.
 *
 * There is exactly **one** live region, carrying the selection count and what Assign will do in one
 * sentence. Two — a count and a separate explanation — both fire on every tick, and the second
 * always says something the first already implied.
 */
export function WbsBulkAssignBar({
  orgSlug,
  planId,
  selected,
  planActivities,
  gate,
  onDone,
  onClear,
}: {
  orgSlug: string;
  planId: string;
  /** The ticked activity ids. The bar renders nothing when this is empty. */
  selected: ReadonlySet<string>;
  /** Every activity in the plan, at the versions last read from the server. */
  planActivities: readonly ActivitySummary[];
  /** May the caller write, and — when not — why (ADR-0060 §6). */
  gate: { writable: boolean; reason: string | null };
  /** A batch landed: the host clears its selection and returns focus. */
  onDone: () => void;
  /** The user dismissed the selection without assigning. */
  onClear: () => void;
}): React.ReactElement | null {
  const announce = useAnnounce();
  const updateParents = useUpdateActivityParents(orgSlug, planId);
  const selectId = useId();
  const statusId = useId();
  const [targetId, setTargetId] = useState<string>(TOP_LEVEL);
  const [error, setError] = useState<string | null>(null);

  if (selected.size === 0) return null;

  const summaries = planActivities.filter((a) => a.type === 'WBS_SUMMARY');
  const byId = new Map(planActivities.map((a) => [a.id, a] as const));
  const target = targetId === TOP_LEVEL ? null : targetId;
  const changes = bulkParentChanges(selected, target, byId);
  /** How the destination reads in a sentence — quoted when it is a summary, named when it is not. */
  const destination =
    target === null ? 'the top level' : `“${byId.get(target)?.name ?? 'the summary'}”`;

  /** Nothing to send, no right to send it, or a send already in flight. */
  const blocked = !gate.writable || changes.length === 0 || updateParents.isPending;

  const assign = (): void => {
    if (blocked) return;
    setError(null);
    const moved = changes.length;
    updateParents.mutate(
      { parents: changes },
      {
        onSuccess: () => {
          // Names the destination, not just the count: "5 activities moved" leaves out the one
          // thing the user was choosing.
          announce(`${plural(moved, 'activity', 'activities')} moved to ${destination}.`);
          onDone();
        },
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <div className="border-border bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Assign to"
          id={selectId}
          className="min-w-56"
          value={targetId}
          onChange={(event) => {
            setError(null);
            setTargetId(event.target.value);
          }}
          disabled={!gate.writable}
          aria-describedby={statusId}
        >
          <option value={TOP_LEVEL}>None (top-level)</option>
          {summaries.map((summary) => (
            <option key={summary.id} value={summary.id}>
              {summary.code ? `${summary.code} · ${summary.name}` : summary.name}
            </option>
          ))}
        </SelectField>

        {/*
          `aria-disabled`, not the native attribute — the `ScopeSaveBar` / `RecalculateButton`
          precedent. A natively disabled button is blurred to `<body>` the moment it flips, and this
          one flips under the user's own focus on every assign: once when `isPending` goes true, and
          again when the batch lands and the selection clears. `pointer-events-none` stops the
          mouse; the click guard stops Enter on a focused button.
        */}
        <Button
          type="button"
          aria-disabled={blocked}
          aria-busy={updateParents.isPending}
          aria-describedby={statusId}
          onClick={(event) => {
            if (blocked) {
              event.preventDefault();
              return;
            }
            assign();
          }}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          {updateParents.isPending ? 'Assigning…' : 'Assign'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClear}>
          Clear selection
        </Button>
      </div>

      {/*
        The one status line. Whichever branch applies, the disabled Assign button is never left
        standing there with nothing to say for itself:
        - no write right → the gate's reason;
        - nothing to do → say so, rather than let the reader hunt for the missing tick;
        - otherwise → what pressing it will do, including that it is all-or-nothing.
      */}
      {/*
        `aria-describedby`-linked to Assign above, not merely next to it: proximity is not
        association, and a screen-reader user meeting a button they cannot use with no explanation
        is the exact defect this epic keeps removing.
      */}
      <p id={statusId} role="status" className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">
          {plural(selected.size, 'activity selected', 'activities selected')}
        </span>
        {' — '}
        {!gate.writable
          ? (gate.reason ?? 'You cannot change activity membership here.')
          : changes.length === 0
            ? `every one of them is already at ${destination}.`
            : `${plural(changes.length, 'activity will move', 'activities will move')} to ${destination}. ` +
              'Saved together — the whole change lands or none of it does. Recalculate to update the ' +
              'summary’s dates.'}
      </p>

      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
