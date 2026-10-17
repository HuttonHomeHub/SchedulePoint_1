import type { ActivitySummary } from '@repo/types';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { membershipDiff } from '../model/membership-diff';
import type { OnReparented } from '../model/reparented';
import { ancestorIds, subtreeSizes, wouldCloseLoop } from '../model/wbs-tree';

import { useAnnounce } from '@/components/ui/announcer';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { CheckboxField } from '@/components/ui/form';
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
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [term, setTerm] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /** Membership as the server currently has it — the baseline every diff is taken against. */
  const persisted = useMemo(
    () => new Set(planActivities.filter((a) => a.parentId === summary.id).map((a) => a.id)),
    [planActivities, summary.id],
  );

  const byId = useMemo(() => new Map(planActivities.map((a) => [a.id, a])), [planActivities]);
  /** Every summary above this one — filing any of them under it would close a loop. */
  const ancestors = useMemo(() => ancestorIds(summary.id, byId), [summary.id, byId]);

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
    // A refetch **merges**; it does not reset. Every write invalidates the plan's activities, a
    // refused one included, so resetting to the server's membership would wipe the planner's
    // unsaved ticks exactly when the refusal tells them to "check the list and save again". Their
    // edits (ticks and un-ticks against the old baseline) are carried onto the new membership —
    // minus a row that is now an ancestor (it would close a loop) or is gone from the plan.
    const added = [...checked].filter((id) => !baseline.has(id));
    const removed = new Set([...baseline].filter((id) => !checked.has(id)));
    setSeededFrom(persisted);
    setBaseline(persisted);
    setChecked(
      new Set(
        [...persisted, ...added].filter(
          (id) => !removed.has(id) && byId.has(id) && !ancestors.has(id),
        ),
      ),
    );
  }

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

  const sizes = useMemo(() => subtreeSizes(planActivities), [planActivities]);

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
   * is not itself being moved. Summed over the moved rows that sit under no other moved row (their
   * subtrees already hold the rest), less the moved rows those subtrees contain.
   */
  const carried = useMemo(() => {
    const moving = new Set(changes.map((change) => change.id));
    const roots = [...moving].filter(
      (id) => ![...ancestorIds(id, byId)].some((ancestor) => moving.has(ancestor)),
    );
    const inside = roots.reduce((total, id) => total + (sizes.get(id) ?? 0), 0);
    return inside - (moving.size - roots.length);
  }, [changes, byId, sizes]);

  // The alert renders below a list that can be long, while focus stays on Save: bring it into view.
  // `scrollIntoView` is absent in jsdom, hence the guard.
  useEffect(() => {
    if (saveError !== null) errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [saveError]);

  const toggle = (id: string): void => {
    setSaved(false);
    setSaveError(null);
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
            ? `Nothing was moved. The breakdown changed while you were working, and a summary you ticked now contains “${summary.name}”. The list has been refreshed; check it and save again.`
            : err.message,
        ),
    );
  };

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
        <Spinner label="Loading the plan’s activities…" labelOnScreen />
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
                shut={!gate.writable || ancestors.has(activity.id)}
                refused={wouldCloseLoop(activity.id, summary.id, ancestors)}
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
          <p ref={errorRef} id={errorId} role="alert" className="text-destructive-text text-sm">
            {saveError}
          </p>
        ) : null}

        <ScopeSaveBar
          gate={gate}
          dirty={dirty}
          pending={updateParents.isPending}
          saved={saved}
          label="Save membership"
          alsoDescribedBy={saveError ? errorId : undefined}
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
 * One checklist row, through `CheckboxField` so the shading is the primitive's own (ADR-0083 D1/D4):
 * a row that would close a loop carries its OWN gate (nearest reason wins), every other row inherits
 * the panel's pen gate, and either way the box is `aria-disabled` with its `click` cancelled — which
 * stops pointer and Space alike while keeping the row in the tab order.
 */
function MemberRow({
  activity,
  summaryName,
  checked,
  shut,
  refused,
  carries,
  parentName,
  onToggle,
}: {
  activity: ActivitySummary;
  summaryName: string;
  checked: boolean;
  /** The row cannot be changed now — the panel's gate is shut, or the row would close a loop. */
  shut: boolean;
  refused: boolean;
  /** Activities inside this one (a summary's contents travel with it). */
  carries: number;
  /** The summary this row is currently filed under, when that is not the one being edited. */
  parentName: string | null;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <li className="border-border border-b px-3 last:border-b-0">
      <CheckboxField
        density="compact"
        checked={checked}
        onChange={() => {
          if (!shut) onToggle();
        }}
        gate={
          refused
            ? {
                writable: false,
                reason: `Can’t be filed here — “${summaryName}” is already inside it.`,
              }
            : undefined
        }
        label={
          <>
            <span className="min-w-0 flex-1 break-words">
              {activity.code ? `${activity.code} · ` : ''}
              {activity.name}
            </span>{' '}
            {/*
              Ticking a summary moves everything inside it, and a planner most needs to know that
              before they tick. An activity filed under ANOTHER summary is the same case: ticking
              moves it, it does not copy it.
            */}
            {!refused && carries > 0 ? (
              <span className="text-muted-foreground shrink-0 text-xs">
                Moves with its {carries === 1 ? '1 activity' : `${carries} activities`}
              </span>
            ) : null}{' '}
            {parentName !== null ? (
              <span className="text-muted-foreground shrink-0 text-xs">in {parentName}</span>
            ) : null}
          </>
        }
      />
    </li>
  );
}
