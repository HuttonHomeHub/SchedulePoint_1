import type { ActivitySummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { membershipDiff } from '../model/membership-diff';
import type { OnReparented } from '../model/reparented';
import { ancestorIds, nestingRefusal, subtreeSizes } from '../model/wbs-tree';

import { useAnnounce } from '@/components/ui/announcer';
import {
  FieldGateLock,
  FieldGateProvider,
  resolveFieldGate,
  useFieldGate,
} from '@/components/ui/field-gate';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { useUpdateActivityParents } from '@/features/activities';
import { ApiFetchError } from '@/lib/api/client';

/**
 * A WBS summary's **membership**, managed from the summary itself.
 *
 * The shipped WBS (ADR-0038) could only be built one activity at a time, from each child's own
 * editor: filing twenty activities meant opening twenty editors, and nothing anywhere answered
 * "what is actually in this summary?". This panel inverts that — one checklist over the plan, one
 * Save, one all-or-nothing batch.
 *
 * **The checked set is state, not a projection of what is on screen.** The list filters, so a
 * member scrolled out of view or excluded by the search term is still a member; deriving the set
 * from the visible rows would silently unfile everyone the current filter hides, in a batch that
 * would be perfectly valid and atomic. {@link membershipDiff} then sends only genuine changes,
 * because every unnecessary row is another chance for someone else's stale `version` to reject the
 * whole save.
 *
 * **Summaries are listed, and the ones that would make the breakdown circular are explained rather
 * than hidden.** The server walks the resulting tree under the plan lock and refuses a batch that
 * would close a loop (`409 PARENT_CYCLE`), so the tree was never at risk; what a checklist lacked
 * was feedback. A summary that already contains this one is shown shaded with the reason (ADR-0063,
 * Amendment), and `wbs-tree.ts` is the one predicate the Breakdown picker uses too.
 *
 * Filtering is client-side over the plan's already-loaded activities: the plan is bounded at ~2,000
 * (ADR-0021/0038) and the editor has the list in hand, so a server round-trip per keystroke would
 * buy nothing. If that ceiling ever moves this is the seam that changes.
 */
export function ActivityMembersPanel({
  orgSlug,
  planId,
  summary,
  planActivities,
  loading = false,
  error = false,
  gate,
  onReparented,
}: {
  orgSlug: string;
  planId: string;
  /** The summary whose membership this is. */
  summary: ActivitySummary;
  /** Every activity in the plan, at the versions last read from the server. */
  planActivities: readonly ActivitySummary[];
  loading?: boolean;
  error?: boolean;
  /** May the caller write, and — when not — why (ADR-0060 §6). */
  gate: { writable: boolean; reason: string | null };
  /** Told when a save lands, for the host that records it for undo (undo-redo M3). */
  onReparented?: OnReparented;
}): React.ReactElement {
  const announce = useAnnounce();
  const updateParents = useUpdateActivityParents(orgSlug, planId);
  const searchId = useId();
  const countId = useId();

  const [term, setTerm] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Membership as the server currently has it — the baseline every diff is taken against. */
  const persisted = useMemo(
    () => new Set(planActivities.filter((a) => a.parentId === summary.id).map((a) => a.id)),
    [planActivities, summary.id],
  );

  const [checked, setChecked] = useState<ReadonlySet<string>>(persisted);
  /**
   * What the diff is taken against. Normally the persisted set — but a **successful save** advances
   * it immediately, without waiting for the refetch.
   *
   * Diffing against `persisted` alone would leave the bar reading "1 activity will move" for the
   * whole round trip after the move had already happened: a save that succeeded, reported as
   * unsaved work. The refetch then re-seeds both and the two agree again.
   */
  const [baseline, setBaseline] = useState<ReadonlySet<string>>(persisted);
  const [seededFrom, setSeededFrom] = useState(persisted);
  if (seededFrom !== persisted) {
    setSeededFrom(persisted);
    setChecked(persisted);
    setBaseline(persisted);
  }

  const byId = useMemo(() => new Map(planActivities.map((a) => [a.id, a])), [planActivities]);
  /**
   * The rows to send. Diffed against `baseline` so a just-saved change is not re-sent (and an
   * un-tick of one still is); each row's `version` comes from `byId` — the latest the server told
   * us — so a stale copy is never submitted.
   */
  const changes = useMemo(
    () => membershipDiff(summary.id, baseline, checked, byId),
    [summary.id, baseline, checked, byId],
  );
  const dirty = changes.length > 0;

  /** Every summary above this one — filing any of them under it would close a loop. */
  const ancestors = useMemo(() => ancestorIds(summary.id, byId), [summary.id, byId]);
  const sizes = useMemo(() => subtreeSizes(planActivities), [planActivities]);

  // A tick on a row that has since become an ancestor (a peer re-nested the tree and the refetch
  // landed) is dropped, or the next Save would send the same refused move again.
  if ([...checked].some((id) => ancestors.has(id))) {
    setChecked((prev) => new Set([...prev].filter((id) => !ancestors.has(id))));
  }

  /**
   * The rows this panel offers: every other activity, summaries included. Rows that would close a
   * loop stay in the list (shaded, with the reason) so a search never lies about what is there.
   */
  const candidates = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return planActivities.filter((a) => {
      if (a.id === summary.id) return false;
      if (needle === '') return true;
      return (
        a.name.toLowerCase().includes(needle) || (a.code?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [planActivities, summary.id, term]);
  const unavailable = candidates.filter((a) => ancestors.has(a.id)).length;

  /**
   * How many activities ride along with the rows being moved: everything inside a moved summary that
   * is not itself being moved (ticking a summary and one of its children moves the child once).
   */
  const carried = useMemo(() => {
    if (changes.length === 0) return 0;
    const moving = new Set(changes.map((change) => change.id));
    return planActivities.filter(
      (a) => !moving.has(a.id) && [...ancestorIds(a.id, byId)].some((id) => moving.has(id)),
    ).length;
  }, [changes, planActivities, byId]);

  const toggle = (id: string): void => {
    setSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = (): void => {
    if (!gate.writable || !dirty) return;
    setSaveError(null);
    // The rows as they stand now, before the write bumps their versions.
    const before = changes.flatMap((change) => {
      const row = byId.get(change.id);
      return row === undefined ? [] : [row];
    });
    const savedChecked = checked;
    // The promise, not a per-call `onSuccess`: react-query drops those when the observer unmounts, and
    // closing the editor while this saves must not lose the undo record.
    void updateParents.mutateAsync({ parents: changes }).then(
      (after) => {
        setBaseline(savedChecked);
        setSaved(true);
        announce(`Membership of “${summary.name}” saved.`);
        onReparented?.(before, after, `Change members of “${summary.name}”`);
      },
      // The mutation's own settle refetches the plan's activities, which recomputes the shading.
      (err: Error) =>
        setSaveError(
          isParentCycle(err)
            ? `Nothing was moved — the breakdown changed since this list was loaded, and one of the summaries you ticked now contains “${summary.name}”. The list has been refreshed; check it and save again.`
            : err.message,
        ),
    );
  };

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
        <Spinner /> Loading the plan’s activities…
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive-text py-8 text-sm">
        The plan’s activities could not be loaded, so membership cannot be edited. Try again.
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      {/* The pen / role reason, rendered once and pointed at by every row and the Save (ADR-0083 D4). */}
      <FieldGateProvider gate={gate}>
        <SearchField
          id={searchId}
          label="Find an activity"
          value={term}
          onChange={setTerm}
          placeholder="Name or code"
          describedBy={countId}
          clearLabel="Clear activity search"
        />

        {/*
          The settled result count, announced (WCAG 4.1.3) — the ADR-0053 M6 finding. Without it a
          screen-reader user filters a list and is told nothing about what the filter did.
        */}
        <p id={countId} role="status" className="text-muted-foreground text-sm">
          {candidates.length === 1 ? '1 activity' : `${candidates.length} activities`}
          {term.trim() === '' ? '' : ' match your search'}
          {unavailable > 0 ? ` · ${unavailable} can’t be filed here` : ''} · {checked.size} in this
          summary
        </p>

        {candidates.length === 0 ? (
          <p className="text-muted-foreground py-6 text-sm">
            {term.trim() === ''
              ? 'This plan has no activities to file yet. Add activities first, then group them here.'
              : 'No activity matches your search.'}
          </p>
        ) : (
          <ul className="border-border max-h-80 overflow-y-auto rounded-md border">
            {candidates.map((activity) => (
              <MemberRow
                key={activity.id}
                activity={activity}
                summaryName={summary.name}
                checked={checked.has(activity.id)}
                refused={nestingRefusal(activity.id, summary.id, ancestors) !== null}
                carries={sizes.get(activity.id) ?? 0}
                parentName={
                  activity.parentId !== null && activity.parentId !== summary.id
                    ? (byId.get(activity.parentId)?.name ?? 'another summary')
                    : null
                }
                onToggle={() => toggle(activity.id)}
              />
            ))}
          </ul>
        )}

        {saveError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {saveError}
          </p>
        ) : null}

        <ScopeSaveBar
          gate={gate}
          dirty={dirty}
          pending={updateParents.isPending}
          saved={saved}
          label="Save membership"
          dirtyMessage={dirtyMessage(changes.length, carried)}
          savedMessage="Membership saved. Recalculate to update the summary’s dates."
        />
      </FieldGateProvider>
    </form>
  );
}

/** The 409 the server raises when a batch would make the breakdown circular. */
function isParentCycle(err: Error): boolean {
  if (!(err instanceof ApiFetchError) || err.status !== 409) return false;
  const details = err.error.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { reason?: unknown }).reason === 'PARENT_CYCLE'
  );
}

function dirtyMessage(moving: number, carried: number): string {
  const tail = 'Saved together — the whole change lands or none of it does.';
  if (carried === 0) {
    return `${moving === 1 ? '1 activity' : `${moving} activities`} will move. ${tail}`;
  }
  const inside = carried === 1 ? '1 activity' : `${carried} activities`;
  return `${moving} will move, with ${inside} inside ${moving === 1 ? 'it' : 'them'}. ${tail}`;
}

/**
 * One checklist row. A row that would close a loop carries its OWN gate (nearest reason wins,
 * ADR-0083 D4); every other row inherits the panel's pen gate. Either way the box is `aria-disabled`
 * and its `click` is cancelled — which stops pointer and Space alike while keeping the row in the tab
 * order, the mechanism `CheckboxField` uses (ADR-0083 D1). Native `disabled` is for "not loaded yet".
 */
function MemberRow({
  activity,
  summaryName,
  checked,
  refused,
  carries,
  parentName,
  onToggle,
}: {
  activity: ActivitySummary;
  summaryName: string;
  checked: boolean;
  refused: boolean;
  /** Activities inside this one (a summary's contents travel with it). */
  carries: number;
  /** The summary this row is currently filed under, when that is not the one being edited. */
  parentName: string | null;
  onToggle: () => void;
}): React.ReactElement {
  const reasonId = useId();
  const { shut, ownReason, groupReasonId } = resolveFieldGate(
    refused
      ? { writable: false, reason: `Can’t be filed here — “${summaryName}” is inside it.` }
      : undefined,
    useFieldGate(),
  );

  return (
    <li className="border-border border-b last:border-b-0">
      <label
        className={
          shut
            ? 'flex items-center gap-3 px-3 py-2 text-sm'
            : 'hover:bg-muted flex cursor-pointer items-center gap-3 px-3 py-2 text-sm'
        }
      >
        <input
          type="checkbox"
          className="accent-primary size-4 shrink-0"
          checked={checked}
          onChange={() => {
            if (!shut) onToggle();
          }}
          aria-describedby={ownReason ? reasonId : groupReasonId}
          // Shaded, never hidden (ADR-0062 M6): a reader must still be able to see what is in the
          // summary, and reach the row to read why it is shut (ADR-0083 D1).
          {...(shut
            ? {
                'aria-disabled': true,
                onClick: (event: React.MouseEvent<HTMLInputElement>) => {
                  event.preventDefault();
                },
              }
            : {})}
        />
        <span className="min-w-0 flex-1 truncate">
          {activity.code ? `${activity.code} · ` : ''}
          {activity.name}
        </span>
        {shut ? <FieldGateLock /> : null}
        {/*
          Ticking a summary moves everything inside it, and a planner most needs to know that before
          they tick. An activity filed under ANOTHER summary is the same case: ticking moves it, it
          does not copy it.
        */}
        {!refused && carries > 0 ? (
          <span className="text-muted-foreground shrink-0 text-xs">
            Moves with its {carries === 1 ? '1 activity' : `${carries} activities`}
          </span>
        ) : null}
        {parentName !== null ? (
          <span className="text-muted-foreground shrink-0 text-xs">in {parentName}</span>
        ) : null}
      </label>
      {ownReason ? (
        <p id={reasonId} className="text-muted-foreground px-3 pb-2 pl-10 text-sm">
          {ownReason}
        </p>
      ) : null}
    </li>
  );
}
