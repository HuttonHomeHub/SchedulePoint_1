import type { ActivitySummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { membershipDiff } from '../model/membership-diff';

import { useAnnounce } from '@/components/ui/announcer';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { useUpdateActivityParents } from '@/features/activities';

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

  /**
   * The rows this panel offers. A summary is never listed — WBS nesting is set from the child's own
   * editor, and offering summaries here would make it possible to build the hierarchy two ways with
   * only one of them checked for cycles.
   */
  const candidates = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return planActivities.filter((a) => {
      if (a.id === summary.id || a.type === 'WBS_SUMMARY') return false;
      if (needle === '') return true;
      return (
        a.name.toLowerCase().includes(needle) || (a.code?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [planActivities, summary.id, term]);

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
    updateParents.mutate(
      { parents: changes },
      {
        onSuccess: () => {
          setBaseline(checked);
          setSaved(true);
          announce(`Membership of “${summary.name}” saved.`);
        },
        onError: (err) => setSaveError(err.message),
      },
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
        {term.trim() === '' ? '' : ' match your search'} · {checked.size} in this summary
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
            <li key={activity.id} className="border-border border-b last:border-b-0">
              <label className="hover:bg-muted flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary size-4 shrink-0"
                  checked={checked.has(activity.id)}
                  onChange={() => toggle(activity.id)}
                  // Shaded, never hidden (ADR-0062 M6): a reader without the pen must still be able
                  // to see what is in the summary. The reason lives on the save bar, which is the
                  // one place it belongs — repeating it on every row would be noise.
                  disabled={!gate.writable}
                />
                <span className="min-w-0 flex-1 truncate">
                  {activity.code ? `${activity.code} · ` : ''}
                  {activity.name}
                </span>
                {/*
                  An activity filed under ANOTHER summary is the case a planner most needs to see
                  before ticking it: ticking moves it, it does not copy it.
                */}
                {activity.parentId !== null && activity.parentId !== summary.id ? (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    in {byId.get(activity.parentId)?.name ?? 'another summary'}
                  </span>
                ) : null}
              </label>
            </li>
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
        dirtyMessage={
          changes.length === 1
            ? '1 activity will move. Saved together — the whole change lands or none of it does.'
            : `${changes.length} activities will move. Saved together — the whole change lands or none of it does.`
        }
        savedMessage="Membership saved. Recalculate to update the summary’s dates."
      />
    </form>
  );
}
