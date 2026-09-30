import type {
  LevellingApplication,
  LevellingApplicationItem,
  LevellingApplicationNamedActivity,
} from '@repo/types';
import { useMemo, useState } from 'react';

import { useLevellingApplication } from '../api/use-schedule';
import {
  APPLY_LEVELLING_LIMIT,
  APPLY_LEVELLING_TOO_MANY,
  applyLevellingLines,
} from '../model/levelling-application';

import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { FormSection } from '@/components/ui/form-layout';
import { NoticeStrip } from '@/components/ui/notice-strip';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Spinner } from '@/components/ui/spinner';
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

const EMPTY_TITLE = 'Nothing to apply';

function loadErrorLabel(error: unknown): string {
  if (error instanceof ApiFetchError) {
    if (error.status === 429) return 'Too many requests — try again in a moment.';
    if (error.status === 422) return error.error.message;
  }
  return 'Couldn’t work out what levelling would move. Please try again.';
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

const PLACED_COLUMNS: Column<LevellingApplicationItem>[] = [
  ...MOVE_COLUMNS.slice(0, 1),
  {
    header: 'Placed on',
    cell: (item) => formatCalendarDate(item.beforeVisualStart),
    width: 'fit',
  },
  ...MOVE_COLUMNS.slice(1),
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
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  return (
    <FormSection title={title} description={description} aside={String(names.length)}>
      <ul className="flex flex-col gap-1 text-sm">
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
  const [failure, setFailure] = useState<string | null>(null);

  const closeButton = (label: string): React.ReactElement => (
    <Button type="button" variant="outline" onClick={onClose}>
      {label}
    </Button>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner label="Working out what levelling would move…" />
          <span aria-hidden="true">Working out what levelling would move…</span>
        </p>
        <div className="flex justify-end gap-2">{closeButton('Cancel')}</div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <QueryErrorState label={loadErrorLabel(query.error)} onRetry={() => void query.refetch()} />
        <div className="flex justify-end gap-2">{closeButton('Close')}</div>
      </div>
    );
  }

  const application = query.data;
  const count = application.rows.length;

  if (count === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{EMPTY_TITLE}</p>
          <p className="text-muted-foreground text-sm">
            {application.leftToLogic.length > 0
              ? 'Every bar levelling would move is left where its links put it, because moving it would start it before its links allow.'
              : 'Resource levelling has no bar left to move.'}
          </p>
        </div>
        <div className="flex justify-end gap-2">{closeButton('Close')}</div>
      </div>
    );
  }

  if (count > APPLY_LEVELLING_LIMIT) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-destructive-text text-sm">
          {APPLY_LEVELLING_TOO_MANY}
        </p>
        <div className="flex justify-end gap-2">{closeButton('Close')}</div>
      </div>
    );
  }

  const lines = applyLevellingLines(application);
  const byHand = application.items.filter((item) => item.wasPlaced);
  const others = application.items.filter((item) => !item.wasPlaced);
  // A recalculation that lands under the open dialog sweeps the preview's key; until the new list
  // arrives the one on screen is about to be replaced, so it is not offered for confirmation.
  const refreshing = query.isFetching;

  const apply = async (): Promise<void> => {
    setPending(true);
    setConflict(null);
    setFailure(null);
    try {
      const outcome = await onApply(application);
      if (outcome.applied || outcome.lostPen) {
        onClose();
        return;
      }
      setConflict(outcome.conflict);
    } catch {
      setFailure(
        'Couldn’t apply levelled dates. Nothing was changed that you can see — try again.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {conflict ? (
        <NoticeStrip role="alert" tone="warning" density="comfortable" message={conflict}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setConflict(null);
              void query.refetch();
            }}
          >
            Check again
          </Button>
        </NoticeStrip>
      ) : null}
      {failure ? <NoticeStrip role="alert" tone="warning" message={failure} /> : null}

      <ul className="flex flex-col gap-1 text-sm">
        {lines.map((line) => (
          <li key={line.key} data-line={line.key}>
            {line.text}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-5">
        {others.length > 0 ? (
          <FormSection title="Will move" aside={String(others.length)}>
            <MoveTable caption="Activities that will move" columns={MOVE_COLUMNS} items={others} />
          </FormSection>
        ) : null}
        {byHand.length > 0 ? (
          <FormSection
            title="Placed by hand"
            description="You placed these bars yourself. Applying replaces that placement."
            aside={String(byHand.length)}
          >
            <MoveTable
              caption="Hand-placed activities that will move"
              columns={PLACED_COLUMNS}
              items={byHand}
            />
          </FormSection>
        ) : null}
        {application.leftToLogic.length > 0 ? (
          <NameList
            title="Left where their links put them"
            description="Levelling would start these before their links allow, so they are not moved."
            names={application.leftToLogic}
          />
        ) : null}
        {application.conflictingPlaced.length > 0 ? (
          <NameList
            title="Will start earlier than their links allow"
            description="You placed these by hand, and they will clash with their links once the others move."
            names={application.conflictingPlaced}
          />
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">
        Undo reverses all of it in one step. Undo is lost if you reload the page.
      </p>

      <div className="flex justify-end gap-2">
        {closeButton('Cancel')}
        <Button
          type="button"
          aria-disabled={pending || refreshing}
          aria-busy={pending}
          onClick={(event) => {
            if (pending || refreshing) {
              event.preventDefault();
              return;
            }
            void apply();
          }}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          {pending
            ? 'Applying…'
            : `Apply to ${String(count)} ${count === 1 ? 'activity' : 'activities'}`}
        </Button>
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
