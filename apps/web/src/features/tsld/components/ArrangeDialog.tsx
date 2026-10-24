import { useId, useState } from 'react';

import type { LayoutObjective } from '../render/layout-objective';

import {
  useArrangeSearch,
  type ArrangeChoice,
  type ArrangeOutcome,
  type ArrangeSearchInput,
  type ArrangeSearchState,
} from './use-arrange-search';

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
 * **While swimlanes are shown** (`withinSwimlanes`, derived by {@link ArrangeSearchDialog} from the
 * search input's `swimlanes`) the description adds {@link WITHIN_SWIMLANES}: both options keep every
 * activity in its own swimlane (swimlanes M2-T6, owner decision 2026-10-24) and the diagram can get
 * taller, because swimlanes cannot share a row. The two cards stop promising what is false there —
 * Tidy no longer says it "never adds lanes" and Re-layout says it may add lanes inside a swimlane — and
 * the figure that counts display rows is labelled "Rows", not "Lanes".
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
  /** True while swimlanes are shown: both options work inside each swimlane. */
  withinSwimlanes?: boolean;
}

/** What Tidy and Re-layout promise while swimlanes are shown (feature-spec §4.5). */
export const WITHIN_SWIMLANES =
  'Both options work within each swimlane, and no activity changes swimlane. Swimlanes cannot share a row, so the diagram can get taller.';

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

export function arrangeFigures(
  outcome: ArrangeOutcome,
  withinSwimlanes = false,
): RadioCardFigure[] {
  const b: LayoutObjective = outcome.before;
  const a: LayoutObjective = outcome.after;
  return [
    { label: 'Activities moved', value: String(outcome.changes.length) },
    { label: withinSwimlanes ? 'Rows' : 'Lanes', value: change(b.rows, a.rows) },
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
  withinSwimlanes = false,
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
      description={`Choose how to rearrange the lanes. Dates do not change, only which lane each activity is drawn in.${withinSwimlanes ? ` ${WITHIN_SWIMLANES}` : ''}`}
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
            {count(search.evaluations, 'layout', 'layouts')} tried
            {search.starts > 1 ? ` across ${String(search.starts)} starting layouts` : ''}.
          </p>
        ) : null}
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {search.kind === 'computing'
            ? search.starts > 1
              ? 'Trying several starting layouts. On a large plan this can take up to about half a minute. You can cancel.'
              : 'Working out the layouts…'
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
              description: withinSwimlanes
                ? 'Improve the lanes you have, in this order: remove overlaps, then links hidden behind bars, then crossings.'
                : 'Improve the lanes you have, in this order: remove overlaps, then links hidden behind bars, then crossings. It never adds lanes.',
              figures: ready?.tidy ? arrangeFigures(ready.tidy, withinSwimlanes) : null,
              disabled: bounded !== null,
              disabledReason: bounded
                ? `This plan draws ${String(bounded.drawn)} activities. Tidy is offered on plans of up to ${String(bounded.limit)}, because above that it takes too long to work out. Re-layout still packs the lanes.`
                : null,
            },
            {
              value: 'relayout',
              title: 'Re-layout',
              description: bounded
                ? 'Pack the lanes again by time, so no two activities overlap in a lane.'
                : `Tries several fresh starting layouts and keeps the best, improving each in the same order as Tidy. ${withinSwimlanes ? 'It may add lanes inside a swimlane.' : 'It may use as many lanes as the diagram has now.'} On a large plan it can take noticeably longer than Tidy.`,
              figures: ready ? arrangeFigures(ready.relayout, withinSwimlanes) : null,
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
            className="aria-busy:pointer-events-none"
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

/**
 * **The dialog with its search**, so the search's state lives in this subtree. A progress tick
 * arrives every 25 evaluations, about every 60 ms on a 144-activity plan, and each one is a
 * `setState`; held by `TsldPanel` it re-rendered the whole panel ~16 times a second for the length
 * of the search (M6 performance review). Held here it re-renders the dialog and nothing else.
 */
export function ArrangeSearchDialog({
  input,
  ...rest
}: Omit<ArrangeDialogProps, 'open' | 'search'> & {
  input: ArrangeSearchInput | null;
}): React.ReactElement {
  const search = useArrangeSearch(input !== null, input);
  return (
    <ArrangeDialog
      open={input !== null}
      search={search}
      withinSwimlanes={input?.swimlanes !== undefined}
      {...rest}
    />
  );
}
