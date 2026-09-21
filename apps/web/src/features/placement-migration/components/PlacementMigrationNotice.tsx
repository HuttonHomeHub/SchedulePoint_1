import type { PlacementMigrationRow } from '@repo/types';
import { X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { formatCalendarDate } from '@/lib/format-date';

export interface PlacementMigrationNoticeProps {
  /** How many constraints the migration converted on this plan. Never rendered when zero. */
  count: number;
  rows: readonly PlacementMigrationRow[];
  onDismiss: () => void;
  /**
   * Hand focus somewhere stable after the strip unmounts itself.
   *
   * The Dismiss button is a child of the thing it removes, so pressing it destroys the focused
   * element and focus falls to `<body>` — WCAG 2.4.3, and on this workspace it also silently
   * disables every keyboard accelerator, because they are a React `onKeyDown` on the workspace
   * root. The host supplies the target because only it knows which surface is mounted; it is the
   * same contract `SelectionActionsBar` states, for the same reason, and must be referentially
   * stable for the same reason too.
   *
   * Optional so a caller with nothing to return to is not forced to invent an anchor — both
   * production hosts pass one.
   */
  restoreFocus?: (() => void) | undefined;
}

const COLUMNS: Column<PlacementMigrationRow>[] = [
  {
    header: 'Activity',
    cell: (row) =>
      row.activityCode === null ? row.activityName : `${row.activityCode} — ${row.activityName}`,
    width: 'bounded',
  },
  {
    header: 'Was a constraint on',
    // Through the shared formatter, like every other date in the product. It printed the raw ISO
    // string until the M-J gate pass — on the one screen whose own docblock calls it the only place
    // the product explains an irreversible act, in the one column a planner is most likely to read.
    cell: (row) => formatCalendarDate(row.priorConstraintDate),
    width: 'fit',
  },
];

/**
 * What the one-time placement migration did to this plan (one-planning-surface M-I).
 *
 * **It is the only thing in the product that can say so.** The strip removed constraints, the act
 * is irreversible, and `PATCH …/activities/:activityId` is classified `PLAN_CONTENT` in the audit
 * census — permanently excluded under ADR-0073 — so nothing in `audit_events` will ever record it.
 *
 * **The sentence names the consequence and does not stop at the count**, because the count alone
 * invites the wrong conclusion. A planner who reads "3 constraints were removed" and then sees
 * their float figures change will reasonably think the schedule slipped. It did not: the bars are
 * where they were, and the float moved because a constraint was holding successors that a
 * placement does not hold. That is the whole difference between a basis change and slippage, and
 * this strip is where it gets said.
 *
 * **It says "will show more float once this plan is next recalculated", in the future tense, and
 * the tense is a correction rather than a hedge.** The first version said "may now show more
 * float", which is false at the moment it is read: the migration writes `visual_start` and clears
 * the constraint, and it cannot touch `early_start`, `total_float` or `is_critical` — the engine
 * is TypeScript, a SQL migration cannot call it, and a write-on-read would need the ADR-0028 pen.
 * Nothing in the product recalculates because a migration changed the inputs, and this notice
 * appears the FIRST time the plan is opened, which is before any recalculation. So a planner who
 * read the old sentence and went looking for the float would find it unchanged and conclude the
 * notice was wrong — on the one screen in the product that explains an irreversible act. Caught by
 * the `database-architect` review of the migration, which derived the intermediate state from
 * `compute.ts` rather than from this file's own claim about it.
 *
 * **It says nothing about constraints the migration LEFT ALONE**, which is a decision rather than
 * an omission. Three classes were left — inert, unclassified, and any activity already carrying a
 * hand-placement — and nothing happened to any of them, so there is no change to report; a
 * constraint still in place is still a constraint doing its job. It also avoids the trap the
 * feature spec names: one of the two ways the unclassified class arises **never clears** (a started
 * activity's actual start bypasses the clamp), so any sentence hinting that they will resolve on
 * the next recalculation would be false for half of them.
 *
 * Rendered through `CanvasDock`, so it costs the diagram **0 px** (ADR-0092) — and it is dismissed
 * per user per plan, so a planner who has read it once never sees it again on that plan.
 */
export function PlacementMigrationNotice({
  count,
  rows,
  onDismiss,
  restoreFocus,
}: PlacementMigrationNoticeProps): React.ReactElement {
  const [listOpen, setListOpen] = useState(false);
  const noun = count === 1 ? 'constraint' : 'constraints';
  const verb = count === 1 ? 'became a hand-placement' : 'became hand-placements';

  return (
    <>
      {/*
        **No `role`, and that is ADR-0132's rule rather than a preference.** Its discriminator is
        "would this sentence read the same to somebody who arrived five minutes later and did
        nothing?" — and it would, identically: a migration ran on a deploy, before the reader opened
        the plan. That makes it a `condition`, and a condition renders **no live-region role at
        all**. `role="status"` is still an event-shaped announcement, merely a polite one.

        This shipped as `role="status"` and the M-J accessibility review caught it, which is the
        sharper half: the test below invoked ADR-0132's discriminator by name, reached the right
        classification, and then chose between `alert` and `status` rather than between a role and
        none. It also reproduced the mechanical failure that ADR records for this shape — the strip
        mounts only once the query settles, so the region and its content enter the DOM together,
        which is the unreliable case for a live region rather than the silent one.
      */}
      <NoticeStrip
        tone="info"
        density="comfortable"
        messageFit="grow"
        message={
          <>
            {count} start {noun} on this plan {verb} when placement replaced scheduling modes. The
            bars did not move. Activities after them will show more float once this plan is next
            recalculated, because a constraint was holding them and a placement does not.
          </>
        }
      >
        <Button variant="outline" size="sm" onClick={() => setListOpen(true)}>
          See which
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            onDismiss();
            // AFTER, not before: `onDismiss` is what unmounts this button, so focus has to be sent
            // somewhere that still exists once it has. See `restoreFocus`'s docblock for why
            // `<body>` is not merely untidy on this workspace.
            restoreFocus?.();
          }}
          aria-label="Dismiss this notice"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </NoticeStrip>
      <Dialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        title="Constraints that became placements"
        description="Each of these activities kept its dates. The constraint that used to hold it there was removed, and the date it carried is now the activity's hand-placed start."
      >
        <DataTable
          caption="Constraints the placement migration converted, oldest first"
          columns={COLUMNS}
          query={{ isPending: false, isError: false, data: [...rows], refetch: () => undefined }}
          getRowKey={(row) => row.id}
          empty="No constraints were converted on this plan."
          loadingLabel="Loading"
        />
      </Dialog>
    </>
  );
}
