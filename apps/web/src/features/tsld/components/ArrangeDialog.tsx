import { useId, useState } from 'react';

import type { LayoutObjective } from '../render/layout-objective';

import type { ArrangeChoice, ArrangeOutcome, ArrangeSearchState } from './use-arrange-search';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { RadioCardGroup, type RadioCardFigure } from '@/components/ui/radio-card-group';

/**
 * **Arrange: choose Tidy or Re-layout, having seen what each would do** (NetPoint-layout M5,
 * spec §4.8, ADR-0152).
 *
 * The figures on each option come from the same search result the confirm writes, so a planner
 * never confirms a number that was worked out separately. The dialog's states follow
 * `LinkChainDialog`: **computing** (a polite progress sentence, Confirm shaded), **ready**, **error**
 * (an alert, Confirm shaded), and within ready, **nothing to move** for an option whose layout is
 * already its best, and **bounded** when the plan is over the size the search is offered at, where
 * Tidy is shaded with the reason and Re-layout is preselected instead.
 *
 * Confirm is `aria-disabled` with its reason linked, never native `disabled` (ADR-0145). Focus is
 * the caller's to return (ADR-0149 D8). The caller mounts it with a fresh `key` per opening, so the
 * planner's pick never carries over from a previous run.
 */
export interface ArrangeDialogProps {
  open: boolean;
  onClose: () => void;
  search: ArrangeSearchState;
  onConfirm: (choice: ArrangeChoice, outcome: ArrangeOutcome) => void;
  pending: boolean;
  error: string | null;
}

/**
 * The positions batch accepts at most this many rows in one write
 * (`apps/api/src/modules/activities/dto/update-positions.dto.ts`, `@ArrayMaxSize(2000)`), so an
 * option that would move more is shaded with the reason rather than sent to fail.
 */
export const ARRANGE_BATCH_MAX = 2000;

const count = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

function change(before: number, after: number): string {
  return before === after ? String(after) : `${String(before)} → ${String(after)}`;
}

export function arrangeFigures(outcome: ArrangeOutcome): RadioCardFigure[] {
  const b: LayoutObjective = outcome.before;
  const a: LayoutObjective = outcome.after;
  return [
    { label: 'Activities moved', value: String(outcome.changes.length) },
    { label: 'Rows', value: change(b.rows, a.rows) },
    { label: 'Overlaps', value: change(b.overlaps, a.overlaps) },
    { label: 'Links behind bars', value: change(b.occluded, a.occluded) },
    { label: 'Crossings', value: change(b.crossings, a.crossings) },
  ];
}

export function ArrangeDialog({
  open,
  onClose,
  search,
  onConfirm,
  pending,
  error,
}: ArrangeDialogProps): React.ReactElement {
  // Only an explicit pick is held; the caller remounts the dialog per opening, so it starts empty.
  const [picked, setPicked] = useState<ArrangeChoice | null>(null);
  const reasonId = useId();
  const bounded = search.kind === 'ready' ? search.bounded : null;
  // Tidy is preselected unless it is bounded, in which case the option that can run is.
  const choice: ArrangeChoice = bounded ? 'relayout' : (picked ?? 'tidy');

  const ready = search.kind === 'ready' ? search : null;
  const outcome = ready ? (choice === 'tidy' ? ready.tidy : ready.relayout) : null;
  const moves = outcome?.changes.length ?? 0;
  // An already-arranged diagram: said once, in the status, rather than as two options each saying
  // "nothing would move" and leaving the planner to work out that the dialog has nothing for them.
  const nothingToDo =
    ready !== null &&
    (ready.tidy?.changes.length ?? 0) === 0 &&
    ready.relayout.changes.length === 0;

  const shadeReason =
    search.kind === 'computing'
      ? 'Working out the layouts.'
      : search.kind === 'error'
        ? 'The layouts could not be worked out.'
        : pending
          ? null
          : outcome === null
            ? 'This option is not available for this plan.'
            : moves === 0
              ? 'Nothing would move.'
              : moves > ARRANGE_BATCH_MAX
                ? `This would move ${String(moves)} activities, and one arrangement can move at most ${String(ARRANGE_BATCH_MAX)}.`
                : null;
  const blocked = shadeReason !== null || pending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Arrange the diagram"
      description="Choose how to rearrange the rows. Dates do not change, only which row each activity is drawn in."
    >
      <div className="flex flex-col gap-4">
        {search.kind === 'error' ? (
          <NoticeStrip role="alert" tone="warning" message={search.message} />
        ) : null}
        {error ? <NoticeStrip role="alert" tone="warning" message={error} /> : null}
        {/* The live region names the phase and nothing else. The running count changes every
            25 evaluations, i.e. every 60–120 ms, and a polite region queues rather than
            interrupts, so announcing it would leave a screen reader reading stale counts
            seconds after the options were ready (WCAG 4.1.3). The count is shown beside it
            as plain text, outside the region. */}
        {search.kind === 'computing' ? (
          <p className="text-muted-foreground text-sm" aria-hidden="true">
            {count(search.evaluations, 'layout', 'layouts')} tried.
          </p>
        ) : null}
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {search.kind === 'computing'
            ? 'Working out the layouts…'
            : search.kind === 'ready'
              ? nothingToDo
                ? bounded
                  ? 'Already packed: Re-layout would move nothing.'
                  : 'Already arranged: neither option would move anything.'
                : bounded
                  ? 'Re-layout is ready.'
                  : 'Both options are ready.'
              : ''}
        </p>

        <RadioCardGroup<ArrangeChoice>
          label="How to arrange"
          value={choice}
          onChange={setPicked}
          options={[
            {
              value: 'tidy',
              title: 'Tidy',
              description:
                'Improve the rows you have, in this order: remove overlaps, then links hidden behind bars, then crossings. It never adds rows.',
              figures: ready?.tidy ? arrangeFigures(ready.tidy) : null,
              disabled: bounded !== null,
              disabledReason: bounded
                ? `This plan draws ${String(bounded.drawn)} activities. Tidy is offered on plans of up to ${String(bounded.limit)}, because above that it takes too long to work out. Re-layout still packs the rows.`
                : null,
            },
            {
              value: 'relayout',
              title: 'Re-layout',
              description: bounded
                ? 'Pack the rows again by time, so no two activities overlap in a row.'
                : 'Start again from rows packed by time, then improve them the same way.',
              figures: ready ? arrangeFigures(ready.relayout) : null,
            },
          ]}
        />

        {shadeReason ? (
          <p id={reasonId} className="text-muted-foreground text-sm">
            {shadeReason}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            aria-disabled={blocked}
            aria-busy={pending}
            {...(shadeReason ? { 'aria-describedby': reasonId } : {})}
            onClick={(event) => {
              if (blocked || outcome === null) {
                event.preventDefault();
                return;
              }
              onConfirm(choice, outcome);
            }}
            className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            {pending
              ? 'Arranging…'
              : `${choice === 'tidy' ? 'Tidy' : 'Re-layout'}${moves > 0 ? `: move ${count(moves, 'activity', 'activities')}` : ''}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
