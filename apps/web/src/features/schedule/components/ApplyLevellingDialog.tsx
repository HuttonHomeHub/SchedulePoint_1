import type {
  LevellingApplication,
  LevellingApplicationItem,
  LevellingApplicationNamedActivity,
} from '@repo/types';
import { Loader2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { useLevellingApplication } from '../api/use-schedule';
import {
  APPLY_LEVELLING_LIMIT,
  applyLevellingLines,
  applyLevellingSummary,
  applyLevellingTooMany,
  FOLLOWING_SECTION_DESCRIPTION,
  FOLLOWING_SECTION_TITLE,
  levellingReasonText,
} from '../model/levelling-application';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { FormSection } from '@/components/ui/form-layout';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { ApiFetchError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * **Apply levelled dates… — review every move, then confirm** (`docs/specs/apply-levelled-dates/`
 * US-1 to US-5, T2.2).
 *
 * The list is the preview's, **read from the server**: which bars move, where, and what that does to
 * the rest of the plan are decided by the engine (spec §4.6), so this component describes a response
 * and never derives one. Nothing is written until the planner presses Apply, and what is sent is the
 * response's `rows` unchanged.
 *
 * **Mounted fresh on every opening** (the inner body exists only while `open`), so a conflict
 * sentence, a pending flag or a previous list never carries over — and the preview is only fetched
 * while it is open, because the route runs the engine twice.
 *
 * **Apply is `aria-disabled`, never native `disabled`** (ADR-0145, the `MakeMilestoneDialog`
 * precedent): a native `disabled` would blur focus to `<body>` the moment the write starts. It is
 * also refused while the preview is being re-fetched, because a recalculation that lands under an
 * open dialog sweeps the preview's key and the list on screen is then the one about to be replaced.
 */
export interface ApplyLevellingDialogProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  planId: string;
  /**
   * Write the preview. Resolves with what happened rather than throwing for the two refusals a
   * planner can do something about: a stale version (`conflict`, the sentence to show) and a lost
   * pen (`lostPen`, which the pen's own surface explains). Anything else rejects.
   */
  onApply: (
    application: LevellingApplication,
  ) => Promise<{ applied: boolean; conflict: string | null; lostPen: boolean }>;
}

/** A list longer than this is windowed inside a fixed-height region (ADR-0165); shorter ones are plain. */
const WINDOWED_FROM = 8;

const EMPTY_TITLE = 'Nothing left to apply.';
const REFRESH_NOTE_ID = 'apply-levelling-refresh-note';
const CHECKED_UNCHANGED_TEXT = 'List checked, no changes.';
const STALE_TEXT =
  'The plan was recalculated since this list was made. Here is the up-to-date list — check it and apply again.';
const LOADING_TEXT = 'Working out what levelling would move…';

function loadErrorLabel(error: unknown): string {
  if (error instanceof ApiFetchError) {
    if (error.status === 429) return 'Too many requests — try again in a moment.';
    if (error.status === 422) return error.error.message;
  }
  return 'Couldn’t work out what levelling would move. Please try again.';
}

function activityCount(count: number): string {
  return `${String(count)} ${count === 1 ? 'activity' : 'activities'}`;
}

function activityLabel(item: { name: string; code: string | null }): string {
  return item.code ? `${item.code} · ${item.name}` : item.name;
}

const MOVE_COLUMNS: Column<LevellingApplicationItem>[] = [
  { header: 'Activity', cell: (item) => activityLabel(item), width: 'bounded' },
  { header: 'Starts now', cell: (item) => formatCalendarDate(item.beforeDrawnStart), width: 'fit' },
  {
    header: 'Moves to',
    cell: (item) =>
      item.roundedToNextDay
        ? `${formatCalendarDate(item.targetStart)} (next working day)`
        : formatCalendarDate(item.targetStart),
    width: 'fit',
  },
];

/**
 * Only this table carries "Why it moves", and that is not an omission: an unplaced bar's reason is
 * always RESOURCE (a knock-on with no placement of its own is a follower and gets no row, CQ-1 (a)),
 * so a column of identical cells would say nothing. The model's tests assert that invariant.
 */
const PLACED_COLUMNS: Column<LevellingApplicationItem>[] = [
  ...MOVE_COLUMNS.slice(0, 1),
  {
    header: 'Placed on',
    cell: (item) => formatCalendarDate(item.beforeVisualStart),
    width: 'fit',
  },
  ...MOVE_COLUMNS.slice(1),
  { header: 'Why it moves', cell: (item) => levellingReasonText(item.reason), width: 'bounded' },
];

function MoveTable({
  caption,
  columns,
  items,
}: {
  caption: string;
  columns: Column<LevellingApplicationItem>[];
  items: LevellingApplicationItem[];
}): React.ReactElement {
  // Adapted to the `DataTable` query contract so it renders its own states; the data is already here.
  const query = useMemo(
    () => ({ isPending: false as const, isError: false as const, data: items, refetch: () => {} }),
    [items],
  );
  const common = {
    caption,
    columns,
    query,
    getRowKey: (item: LevellingApplicationItem) => item.id,
    empty: null,
    loadingLabel: 'Loading the list…',
  };
  return items.length > WINDOWED_FROM ? (
    <div className="flex h-56 min-h-0 flex-col">
      <DataTable {...common} scroll="contained" windowed />
    </div>
  ) : (
    <DataTable {...common} />
  );
}

/** The most names a "named, not moved" list prints before it says how many more there are. */
const NAMES_SHOWN = 10;

function NameList({
  title,
  description,
  names,
}: {
  title: string;
  description: string;
  names: LevellingApplicationNamedActivity[];
}): React.ReactElement {
  const titleId = useId();
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  return (
    <FormSection
      title={title}
      description={description}
      aside={activityCount(names.length)}
      titleId={titleId}
    >
      <ul aria-labelledby={titleId} className="flex flex-col gap-1 text-sm">
        {shown.map((named) => (
          <li key={named.id}>{named.name}</li>
        ))}
        {more > 0 ? (
          <li className="text-muted-foreground">
            and {more} more {more === 1 ? 'activity' : 'activities'}
          </li>
        ) : null}
      </ul>
    </FormSection>
  );
}

function ApplyLevellingBody({
  onClose,
  orgSlug,
  planId,
  onApply,
}: Omit<ApplyLevellingDialogProps, 'open'>): React.ReactElement {
  const query = useLevellingApplication(orgSlug, planId, true);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Set when confirming found the schedule recalculated since the list on screen was made.
  const [stale, setStale] = useState(false);
  // Set only when a re-read returns the list unchanged: the summary sentence is then identical, so
  // the status region would stay silent and a screen-reader user could not tell the check finished.
  const [unchangedNote, setUnchangedNote] = useState('');
  // Where focus goes when the conflict strip (and the "Check again" button the planner was on) is
  // removed: a stable container that outlives every state of the dialog (ADR-0135, WCAG 2.4.3).
  const contentRef = useRef<HTMLDivElement>(null);

  const application = query.data;
  const count = application?.rows.length ?? 0;
  const lines = application ? applyLevellingLines(application) : [];
  // A recalculation that lands under the open dialog sweeps the preview's key; until the new list
  // arrives the one on screen is about to be replaced, so it is not offered for confirmation.
  const refreshing = query.isFetching && !query.isPending;

  const apply = async (): Promise<void> => {
    if (!application) return;
    setPending(true);
    setUnchangedNote('');
    setConflict(null);
    setFailure(null);
    setStale(false);
    try {
      // The client holds no copy of the plan's `scheduleComputedAt` (only this response carries it),
      // so the list is re-read at the moment of confirming and compared with the one the planner
      // checked. A recalculation by anybody else in between makes the list on screen a different
      // answer, and it is shown again rather than written (plan T2.2).
      const reread = await query.refetch();
      if (reread.isError || !reread.data) {
        setFailure(
          'Couldn’t check the list is still up to date. Nothing was changed. Try again, and if it keeps failing, reload the page.',
        );
        return;
      }
      if (
        reread.data.computedFrom.scheduleComputedAt !== application.computedFrom.scheduleComputedAt
      ) {
        setStale(true);
        contentRef.current?.focus();
        return;
      }
      const outcome = await onApply(reread.data);
      if (outcome.applied || outcome.lostPen) {
        onClose();
        return;
      }
      setConflict(outcome.conflict);
    } catch {
      // The batch is all-or-nothing on the server (`updatePlacements`, one transaction), so no bar
      // has moved.
      setFailure(
        'Couldn’t apply the new dates. Nothing was changed. Try again, and if it keeps failing, reload the page.',
      );
    } finally {
      setPending(false);
    }
  };

  const checkAgain = async (): Promise<void> => {
    setChecking(true);
    setUnchangedNote('');
    try {
      const result = await query.refetch();
      // TanStack Query keeps the same object when a refetch returns equal data (structural sharing).
      if (result.data === application) setUnchangedNote(CHECKED_UNCHANGED_TEXT);
    } finally {
      // Focus moves off the button before the strip that holds it goes, so it is never dropped.
      contentRef.current?.focus();
      setConflict(null);
      setChecking(false);
    }
  };

  let status = '';
  let content: React.ReactNode = null;
  let closeLabel = 'Cancel';
  if (query.isPending) {
    status = LOADING_TEXT;
    content = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-hidden="true">
        {/* Not `Spinner`: it carries its own role=status, which would duplicate the persistent
            status region below. */}
        <Loader2 className="size-5 animate-spin" />
        {LOADING_TEXT}
      </p>
    );
  } else if (query.isError || !application) {
    closeLabel = 'Close';
    content = (
      <QueryErrorState label={loadErrorLabel(query.error)} onRetry={() => void query.refetch()} />
    );
  } else if (count === 0) {
    closeLabel = 'Close';
    const why =
      application.leftToLogic.length > 0
        ? 'Every bar levelling would move is left where its links put it, because moving it would start it before its links allow.'
        : 'Resource levelling has no bar left to move.';
    status = `${EMPTY_TITLE} ${why}`;
    content = (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{EMPTY_TITLE}</p>
        <p className="text-muted-foreground text-sm">{why}</p>
      </div>
    );
  } else if (count > APPLY_LEVELLING_LIMIT) {
    closeLabel = 'Close';
    status = applyLevellingTooMany(count);
    content = (
      <NoticeStrip
        role="alert"
        aria-label="Too many activities"
        tone="destructive"
        density="comfortable"
        messageFit="grow"
        message={status}
      />
    );
  } else {
    const byHand = application.items.filter((item) => item.wasPlaced);
    const others = application.items.filter((item) => !item.wasPlaced);
    const conflicting = application.conflictingPlaced.length;
    status = applyLevellingSummary(lines);
    content = (
      <>
        <ul className="flex flex-col gap-1 text-sm">
          {lines.map((line) => (
            <li key={line.key} data-line={line.key}>
              {line.text}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-5">
          {byHand.length > 0 ? (
            <FormSection
              title="Placed by hand"
              description="You placed these bars yourself. Applying replaces where you put them. Undo puts them back."
              aside={activityCount(byHand.length)}
            >
              <MoveTable
                caption="Hand-placed activities that will move"
                columns={PLACED_COLUMNS}
                items={byHand}
              />
            </FormSection>
          ) : null}
          {others.length > 0 ? (
            <FormSection
              title={byHand.length > 0 ? 'Other bars that will move' : 'Bars that will move'}
              aside={activityCount(others.length)}
            >
              <MoveTable
                caption="Activities that will move"
                columns={MOVE_COLUMNS}
                items={others}
              />
            </FormSection>
          ) : null}
          {application.followingLinks.length > 0 ? (
            <NameList
              title={FOLLOWING_SECTION_TITLE}
              description={FOLLOWING_SECTION_DESCRIPTION}
              names={application.followingLinks}
            />
          ) : null}
          {application.leftToLogic.length > 0 ? (
            <NameList
              title="Left where their links put them"
              description="Levelling would start these before their links allow. They are not moved."
              names={application.leftToLogic}
            />
          ) : null}
          {conflicting > 0 ? (
            <NameList
              title="Will start earlier than their links allow"
              description={`${conflicting === 1 ? '1 bar you placed by hand will start earlier than its links allow' : `${String(conflicting)} bars you placed by hand will start earlier than their links allow`} once the others move.`}
              names={application.conflictingPlaced}
            />
          ) : null}
        </div>

        <p className="text-muted-foreground text-sm">
          One Undo puts every bar back. You can’t undo after reloading the page.
        </p>
      </>
    );
  }

  if (unchangedNote && application && count > 0) status = unchangedNote;

  const canApply = application !== undefined && count > 0 && count <= APPLY_LEVELLING_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      {/* Mounted before anything in it changes, so the settled result is announced (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {status}
      </p>

      {conflict ? (
        <NoticeStrip role="alert" tone="warning" density="comfortable" message={conflict}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={checking}
            className="aria-disabled:pointer-events-none"
            onClick={() => {
              if (checking) return;
              void checkAgain();
            }}
          >
            {checking ? 'Checking…' : 'Check again'}
          </Button>
        </NoticeStrip>
      ) : null}
      {stale ? (
        <NoticeStrip
          role="alert"
          tone="warning"
          density="comfortable"
          message={STALE_TEXT}
          aria-label="List out of date"
        />
      ) : null}
      {failure ? <NoticeStrip role="alert" tone="warning" message={failure} /> : null}

      <div
        ref={contentRef}
        tabIndex={-1}
        role="group"
        aria-label="Levelled dates"
        className="focus-visible:ring-ring flex flex-col gap-4 rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        {content}
      </div>

      <div className="flex items-center justify-end gap-2">
        {refreshing ? (
          <p id={REFRESH_NOTE_ID} className="text-muted-foreground mr-auto text-sm">
            Checking the list again…
          </p>
        ) : null}
        <Button type="button" variant="outline" onClick={onClose}>
          {closeLabel}
        </Button>
        {canApply ? (
          <Button
            type="button"
            aria-disabled={pending || refreshing}
            aria-busy={pending}
            aria-describedby={refreshing ? REFRESH_NOTE_ID : undefined}
            onClick={(event) => {
              if (pending || refreshing) {
                event.preventDefault();
                return;
              }
              void apply();
            }}
            className="aria-disabled:pointer-events-none"
          >
            {pending ? 'Applying…' : `Apply to ${activityCount(count)}`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ApplyLevellingDialog({
  open,
  onClose,
  orgSlug,
  planId,
  onApply,
}: ApplyLevellingDialogProps): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apply levelled dates"
      description="Move each bar that resource levelling would move onto its levelled date, in one step."
      size="lg"
    >
      <ApplyLevellingBody onClose={onClose} orgSlug={orgSlug} planId={planId} onApply={onApply} />
    </Dialog>
  );
}
