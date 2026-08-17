import type { ActivitySummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';

import { commitCell, type UpdateActivityFieldsFn } from './cell-commit';
import {
  IDLE,
  reduceCellEdit,
  type GanttCellKey,
  type GanttCellTarget,
  type GanttGridEditing,
} from './cell-edit';
import { ganttCellGate } from './cell-gate';

import type { ActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import { ganttCellText } from '@/features/gantt/layout/grid-columns';
import type { BarDateSource } from '@/lib/bar-dates';

/**
 * **The host half of in-grid editing: the reducer, the write, the undo record and the reseed.**
 *
 * It takes the workspace's own mutation and undo recorder rather than reaching for either, so the
 * grid inherits the pen's 423, the optimistic 409, the ADR-0048 stack and the ADR-0032 coalesced
 * recalculation without knowing any of them exist (spec F5).
 *
 * **The reseed effect is the part that needs care**, and it is TECH_DEBT #83 in its natural
 * habitat. The activities query refetches on its own schedule; when it does, the open cell's row
 * may have new values. `reduceCellEdit`'s `reseed` compares the current text with the seed rather
 * than a captured dirty flag, so a planner's keystroke can never be overwritten by a response that
 * happened to land first. The effect below simply reports the new value and lets the reducer
 * decide — which is why it can depend on the activity list without racing anything.
 */
export function useGanttGridEditing({
  activities,
  gating,
  hasComputedSchedule,
  barDateSource,
  hoursPerDayFor,
  updateFields,
  announce,
  onCellClosed,
  recordUpdate,
}: {
  activities: readonly ActivitySummary[];
  gating: ActivityEditorGating;
  hasComputedSchedule: boolean;
  /** Which dates the grid is showing — the seed must match what the cell renders. */
  barDateSource: BarDateSource | undefined;
  hoursPerDayFor: (activity: ActivitySummary) => number | undefined;
  updateFields: UpdateActivityFieldsFn;
  /** The shared polite live region. A committed write that says nothing is invisible to AT. */
  announce: (message: string) => void;
  /** Restore focus to the row a cell just closed on (WCAG 2.4.3). */
  onCellClosed: () => void;
  /** ADR-0048. A no-op when `VITE_UNDO_REDO` is off, so this needs no flag of its own. */
  recordUpdate: (before: ActivitySummary, after: ActivitySummary) => void;
}): GanttGridEditing {
  const [state, dispatch] = useReducer(reduceCellEdit, IDLE);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Read straight from the props. An earlier version mirrored `activities` and `state` into refs to
  // keep `commit` stable across renders — a habit borrowed from the canvas, where a new function per
  // frame really does cost something. Here it bought nothing and cost a rule: React reconciles a
  // child by position, not by prop identity, so a fresh `commit` does not remount the input or drop
  // its caret. `eslint-plugin-react-hooks` v7 (which carries the React Compiler's analysis in the
  // linter, whether or not the babel plugin is wired into the build — it is not) refused the
  // render-phase ref writes, and the fix was to delete the reason for them rather than suppress it.
  //
  // The lookup is a **Map**, not a scan. `gateFor` is called once per EDITABLE COLUMN per rendered
  // row, so on a 40-row window that is 160 calls, each of which was an `activities.find` over the
  // whole plan — measured by the M6 performance gate at up to 320,000 comparisons per render, and
  // repeated on every keystroke because the edit state lives above the panel.
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const find = (id: string): ActivitySummary | undefined => byId.get(id);

  // Not memoized, for the same reason `commit` is not: it closes over `activities`, so a dependency
  // array that omitted them would go stale and one that included them would rebuild every
  // recalculation anyway. Nothing downstream is memoized on its identity.
  const gateFor = (key: GanttCellKey, activityId: string) =>
    ganttCellGate({
      key,
      // A row deleted under an open cell: treat it as an ordinary task so the gate is still a gate.
      // The commit then fails on the server, which is the honest place for "that activity is gone".
      activity: find(activityId) ?? { type: 'TASK' },
      gating,
      hasComputedSchedule,
    });

  const begin = useCallback((target: GanttCellTarget, seed: string) => {
    setErrorMessage(null);
    dispatch({ type: 'begin', target, seed });
  }, []);

  const change = useCallback((text: string) => {
    setErrorMessage(null);
    dispatch({ type: 'change', text });
  }, []);

  const cancel = useCallback(() => {
    setErrorMessage(null);
    dispatch({ type: 'cancel' });
    onCellClosed();
  }, [onCellClosed]);

  const commit = async (): Promise<void> => {
    const current = state;
    if (current.status !== 'editing') return;
    const before = find(current.target.activityId);
    if (before === undefined) return;

    // Nothing typed — closing is not a write. Sending an unchanged value would burn a version bump
    // and an undo entry on a cell the planner merely tabbed through.
    if (current.text === current.seed) {
      dispatch({ type: 'cancel' });
      onCellClosed();
      return;
    }

    dispatch({ type: 'commit' });
    const result = await commitCell({
      activity: before,
      key: current.target.key,
      text: current.text,
      hoursPerDay: hoursPerDayFor(before),
      update: updateFields,
    });

    if (result.ok) {
      setErrorMessage(null);
      // One undo entry per committed cell, recorded with the server's post-edit row so the inverse
      // PATCHes a definition that really existed.
      recordUpdate(before, result.activity);
      dispatch({ type: 'resolved' });
      // Announced AND focus-restored. A commit that neither speaks nor moves focus is functionally
      // invisible to a screen-reader user even though it succeeded (WCAG 4.1.3) — `ganttDrag` had
      // announced every move since M3 and this had announced nothing, which is one correct pattern
      // applied to a control and not its neighbour, found by the M6 accessibility gate.
      announce(`${before.name} updated.`);
      onCellClosed();
      return;
    }

    setErrorMessage(result.failure.message);
    dispatch({ type: 'failed', message: result.failure.message });
    // Spoken too: the text stays in the field for correction, but a refusal a planner cannot see
    // (the cell may be off-screen after a recalculation) would otherwise be silent.
    announce(result.failure.message);
  };

  // See the docblock: report the row's CURRENT rendered text and let the reducer decide whether it
  // may be taken. An untouched cell follows the plan; a typed one is never overwritten.
  //
  // It reads through `ganttCellText`, the same resolver the cell renders from. The first version
  // passed `current.seed` back — a reseed to the value already held, i.e. a no-op that looked
  // exactly like a working reseed and would have left an untouched cell showing a stale value after
  // every recalculation, with nothing failing anywhere.
  useEffect(() => {
    const current = state;
    if (current.status !== 'editing') return;
    const row = activities.find((a) => a.id === current.target.activityId);
    if (row === undefined) return;
    const next = ganttCellText(current.target.key, row, barDateSource, hoursPerDayFor(row));
    if (next === null) return;
    dispatch({ type: 'reseed', target: current.target, seed: next });
    // Deliberately NOT `state`: this effect exists to react to the ROW changing, and depending on
    // the edit state would re-run it on every keystroke — harmless, because the reducer refuses a
    // reseed on a dirty cell, but it would make the guard load-bearing for correctness rather than
    // for the race it is actually about. `hoursPerDayFor` is called live inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, barDateSource]);

  return {
    state,
    hasComputedSchedule,
    gateFor,
    begin,
    change,
    commit: () => void commit(),
    cancel,
    errorMessage,
    onCellClosed,
  };
}
