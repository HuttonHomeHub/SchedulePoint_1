import { ArrowRight, RotateCcw } from 'lucide-react';
import { useId } from 'react';

import type { ChainCandidate, ChainRefusal } from '../model/chain-order';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeStrip } from '@/components/ui/notice-strip';

/**
 * Preview a chain before writing it (`docs/specs/canvas-multi-select/` M4-T6).
 *
 * **This dialog exists because of one bug report.** ADR-0064 was opened on a planner saying a link
 * had been recorded the wrong way round; that turned out to be an unarmed tool rather than a
 * reversed edge, but the class of failure is real and a chain makes it N times worse. A wrong
 * single link is one right-click to fix; a wrong chain of twelve is a programme that reads
 * backwards and a planner unpicking it by hand.
 *
 * So the order is shown **with names and arrows, before anything is written**, with a Reverse that
 * flips the whole sequence rather than offering a second ordering rule. What the planner confirms
 * is what gets written, in the order they can see.
 *
 * A refusal keeps the preview rather than replacing it: "this would create a loop" with the chain
 * hidden leaves them guessing at which two activities closed it.
 */
function refusalMessage(refusal: ChainRefusal): string {
  switch (refusal.kind) {
    case 'tooFew':
      return 'Select at least two activities to link them in sequence.';
    case 'tooMany':
      // The number, not "too many": a planner who has swept 300 bars needs to know what would fit.
      return `That would create ${refusal.requested} links; the most one action can create is ${refusal.limit}. Select fewer activities.`;
    case 'cycle':
      return 'That sequence would create a circular dependency. Reverse it, or leave out the activity that already comes later.';
  }
}

export function LinkChainDialog({
  open,
  onClose,
  ordered,
  refusal,
  reversed,
  onToggleReverse,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  /** The sequence as it would be written, already ordered (and reversed if asked). */
  ordered: readonly ChainCandidate[];
  refusal: ChainRefusal | null;
  reversed: boolean;
  onToggleReverse: () => void;
  onConfirm: () => void;
  pending: boolean;
  /** A failure from the write loop. The chain is rolled back, so this reports rather than warns. */
  error: string | null;
}): React.ReactElement {
  const linkCount = Math.max(0, ordered.length - 1);
  const blocked = refusal !== null || pending;
  // The Confirm button is shaded whenever a refusal or an error is on screen, so it points at
  // whichever one is rendered — adjacency is association for a sighted reader and nothing at all
  // in the accessibility tree.
  const noticeId = useId();
  const describedBy = refusal !== null || error !== null ? noticeId : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Link in sequence"
      description={
        refusal
          ? 'Review the order below.'
          : `This will create ${linkCount} finish-to-start ${linkCount === 1 ? 'link' : 'links'}, in the order shown.`
      }
    >
      <div className="flex flex-col gap-4">
        {/*
          `role="alert"` on both: `NoticeStrip` deliberately does not derive a role from its tone
          ("the role is the caller's"), so without this the refusal and the write failure are plain
          divs — on screen and silent to assistive tech. Every sibling failure surface in the
          product passes it (`EditConflictBanner`, `WbsBulkAssignBar`, `ConfirmDialog`'s error
          path); these two were the exception until the UX review over this epic's diff.
        */}
        {refusal ? (
          <NoticeStrip
            id={noticeId}
            role="alert"
            tone="warning"
            message={refusalMessage(refusal)}
          />
        ) : null}
        {error ? <NoticeStrip id={noticeId} role="alert" tone="warning" message={error} /> : null}

        {/*
          An ordered list, not a paragraph of arrows: the sequence IS the thing being confirmed, and
          a screen-reader user gets "list, 12 items, item 1 of 12" rather than one long sentence
          they have to hold in their head to check.
        */}
        <ol
          data-testid="chain-preview"
          className="border-border flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border p-3 text-sm"
        >
          {ordered.map((candidate, index) => (
            <li key={candidate.id} className="flex items-center gap-2">
              <span className="text-muted-foreground tabular-nums">{index + 1}.</span>
              <span className="min-w-0 truncate">{candidate.name}</span>
              {index < ordered.length - 1 ? (
                <ArrowRight aria-hidden="true" className="text-muted-foreground size-3 shrink-0" />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onToggleReverse}>
            <RotateCcw aria-hidden="true" className="size-4" />
            {reversed ? 'Use earliest first' : 'Reverse the order'}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              aria-disabled={blocked}
              aria-busy={pending}
              {...(describedBy ? { 'aria-describedby': describedBy } : {})}
              onClick={(event) => {
                if (blocked) {
                  event.preventDefault();
                  return;
                }
                onConfirm();
              }}
              className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
            >
              {pending ? 'Linking…' : `Create ${linkCount} ${linkCount === 1 ? 'link' : 'links'}`}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
