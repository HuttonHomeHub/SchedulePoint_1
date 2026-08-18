import type { DeletedHierarchyItem } from '@repo/types';
import { useState } from 'react';

import type { DeletionGroup } from '../model/group-deletions';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/** How many members are named before the rest are summarised. */
export const ANCESTOR_PREVIEW_LIMIT = 8;

const KIND_LABEL: Record<DeletedHierarchyItem['kind'], string> = {
  client: 'Client',
  project: 'Project',
  plan: 'Plan',
};

/**
 * **The one case grouping cannot dissolve**, and the confirmation it needs.
 *
 * A plan deleted on Monday whose project was deleted on Tuesday are two different cascades.
 * Restoring the plan's group is not enough and never will be — its parent is still deleted, and the
 * parent belongs to a batch of its own.
 *
 * The obvious fix, restoring the ancestor automatically when the reader presses Restore, was
 * **rejected**: the ancestor's batch may hold siblings that are nowhere on the row pressed, so one
 * press would resurrect work nobody asked for and nothing on screen described. Instead this names
 * the ancestor, enumerates what comes back with it, and takes a second deliberate press.
 *
 * `role="dialog"`, not `alertdialog`: restoring destroys nothing. The escalation is for
 * destructive confirmations, and using it here would tell an assistive-technology user this action
 * is dangerous when it is reversible by deleting again.
 */
export function RestoreAncestorDialog({
  open,
  onClose,
  blocked,
  ancestor,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  /** The group the reader actually tried to restore. */
  blocked: DeletionGroup;
  /** The blocker's OWN deletion — what this press brings back. */
  ancestor: DeletionGroup;
  onConfirm: () => void;
}): React.ReactElement {
  const [showAll, setShowAll] = useState(false);

  const rows = [ancestor.root, ...ancestor.members];
  // **Capped, for the same reason the row disclosure is.** A client-rooted cascade can hold
  // hundreds of plans; an uncapped list is a wall of text at the exact moment a reader is deciding.
  // The count is always exact and always shown — the cap changes how much is NAMED, never what is
  // claimed (ADR-0090's "no silent caps").
  const hidden = showAll ? 0 : Math.max(0, rows.length - ANCESTOR_PREVIEW_LIMIT);
  const shown = showAll ? rows : rows.slice(0, ANCESTOR_PREVIEW_LIMIT);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Restore ${ancestor.root.name} first?`}
      description={
        `${KIND_LABEL[blocked.root.kind]} “${blocked.root.name}” sits inside ` +
        `${ancestor.root.name}, which is also deleted. Restoring ${ancestor.root.name} brings back ` +
        `everything deleted with it — then you can restore ${blocked.root.name} separately.`
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium">
            This will restore {rows.length} {rows.length === 1 ? 'item' : 'items'}:
          </p>
          <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
            {shown.map((row) => (
              <li key={`${row.kind}:${row.id}`}>
                <span>{KIND_LABEL[row.kind]}</span>{' '}
                <span className="text-foreground">{row.name}</span>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-muted-foreground hover:text-foreground mt-2 text-sm underline"
            >
              Show {hidden} more
            </button>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* **No in-flight state here, and its absence is the design rather than an omission.**
              The review asked for one (a Confirm that flips twice per save and blurs to <body> is
              the ADR-0060 M6 / ADR-0063 M6 defect). It does not apply: this dialog CLOSES before
              the write starts, so the button unmounts instead of flipping, and the pending state
              lives on the table row the reader is now looking at — where it is `aria-disabled` +
              `aria-busy`, never native `disabled`.

              Closing first is itself deliberate. `Dialog` is a native `<dialog>`, which restores
              focus to its invoker asynchronously on close — and that invoker is the blocked row's
              button, whose label changes the instant this succeeds. Closing first lets the
              browser's restore happen immediately and the explicit focus move win afterwards, on
              success; leaving the dialog open would put the two in a race (ADR-0080, ADR-0095 M6).

              A `pending` prop was written here first and removed: with close-before-write it could
              never be true, and a state that cannot be reached is the lit-but-inert shape this
              register keeps recording. Found by checking the test failed red against the wrong
              implementation, which it did not. */}
          <Button onClick={onConfirm}>Restore {ancestor.root.name}</Button>
        </div>
      </div>
    </Dialog>
  );
}
