import { useEffect, useRef, useState } from 'react';

import type { GanttCellGate } from '../model/cell-gate';

import { GanttCell } from './GanttCell';

import { useAnnounce } from '@/components/ui/announcer';
import type { SwimlaneAssignment } from '@/features/tsld';
import {
  NOT_MOVED_REASON,
  swimlaneAssignedAnnouncement,
  withReload,
} from '@/features/tsld/model/swimlane-assignment';

/** "No swimlane" cannot ride in a DOM value as `null`, so it has one of its own. */
const NONE_VALUE = '__none__';

/** Keys that move a closed select's highlight, and in some browsers its value, without opening it. */
const NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const isNavigationKey = (key: string): boolean =>
  NAVIGATION_KEYS.has(key) ||
  key === 'Home' ||
  key === 'End' ||
  key === 'PageUp' ||
  key === 'PageDown';

/**
 * **The Swimlane cell: a list to pick from, written through the host's one assignment** (swimlanes
 * M4-T2, ADR-0095's per-cell write scope).
 *
 * It is the grid's only cell that does not type. It opens like the others (a double-click, which a
 * finger makes as a double-tap) but shows a native `<select>` of the plan's swimlanes, and a pick
 * calls `assignment.assign`, the same plan of the write the table's bulk bar and the editor use: one
 * all-or-nothing positions batch, no `laneIndex`, and one undo step the host records. So it opens no
 * second write path to an activity.
 *
 * ## Why a pick does not always write at once
 *
 * Some browsers change a closed select's value (and fire `change`) on every arrow key. Writing on each
 * would make a keyboard user's browse a string of moves and undo steps, so a change that follows a
 * navigation key is only a **draft** and Enter commits it; a change from a pointer or a finger, or from
 * a pick in the open list, writes immediately.
 *
 * A cell shut by the pen, a role or the WBS source is read-only with its reason (ADR-0083, ADR-0204);
 * `GanttCell` renders that, so this component never decides it.
 */
export function GanttSwimlaneCell({
  activityId,
  activityName,
  text,
  colIndex,
  width,
  gate,
  assignment,
  registerShow,
  onClosed,
}: {
  activityId: string;
  activityName: string;
  /** What the cell reads when shut. */
  text: string;
  colIndex: number;
  width: number;
  gate: GanttCellGate;
  /** Absent under the WBS source, where the cell can only be shut. */
  assignment: SwimlaneAssignment | null;
  registerShow: ((show: (() => void) | null) => void) | undefined;
  /** The cell closed: the host restores focus to the row (WCAG 2.4.3). */
  onClosed: () => void;
}): React.ReactElement {
  const announce = useAnnounce();
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const keyboardNav = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>(NONE_VALUE);

  const currentId = assignment?.currentOf(activityId) ?? null;
  const currentValue = currentId ?? NONE_VALUE;

  useEffect(() => {
    if (open) selectRef.current?.focus();
  }, [open]);

  const close = (restoreFocus: boolean): void => {
    keyboardNav.current = false;
    setError(null);
    setOpen(false);
    if (restoreFocus) onClosed();
  };

  const commit = (value: string): void => {
    if (assignment === null || busy) return;
    if (value === currentValue) {
      close(true);
      return;
    }
    const target = value === NONE_VALUE ? null : value;
    const choice = assignment.choices.find((c) => c.id === target);
    if (choice === undefined) return;
    setError(null);
    setBusy(true);
    assignment.assign([activityId], target).then(
      (outcome) => {
        setBusy(false);
        if (!outcome.applied) {
          // A stay (already there) closes quietly; a refusal keeps the list open beside its reason.
          if (outcome.conflict === null && outcome.moved === 0) {
            close(true);
            return;
          }
          setError(
            outcome.conflict
              ? outcome.refreshable === false
                ? outcome.conflict
                : withReload(outcome.conflict)
              : NOT_MOVED_REASON,
          );
          return;
        }
        announce(
          swimlaneAssignedAnnouncement({
            names: [activityName],
            count: outcome.moved ?? 1,
            target: choice.name,
            landed: outcome.landed,
          }),
        );
        close(true);
      },
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Couldn’t move the activity.');
      },
    );
  };

  const field =
    assignment === null ? null : (
      <select
        ref={selectRef}
        // ADR-0177 D4's coarse list: like the text input, the open list is 24 px (`h-6`) and its
        // large-target route is the activity editor's Swimlane field.
        data-gantt-coarse-exempt="cell-input"
        aria-label={`Swimlane, ${activityName}`}
        aria-busy={busy || undefined}
        aria-invalid={error !== null || undefined}
        value={draft}
        className="bg-field text-field-foreground border-input h-6 w-full rounded border px-1"
        onPointerDown={() => {
          keyboardNav.current = false;
        }}
        onChange={(event) => {
          if (busy) return;
          setError(null);
          setDraft(event.target.value);
          if (!keyboardNav.current) commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commit(draft);
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
          }
          if (isNavigationKey(event.key)) {
            keyboardNav.current = true;
            // The key belongs to the list, not to the grid's row navigation (ADR-0079).
            event.stopPropagation();
          }
        }}
        onBlur={() => {
          if (!busy) close(false);
        }}
      >
        {assignment.choices.map((choice) => (
          <option key={choice.id ?? NONE_VALUE} value={choice.id ?? NONE_VALUE}>
            {choice.name}
          </option>
        ))}
      </select>
    );

  return (
    <GanttCell
      value={text}
      label={`Swimlane, ${activityName}`}
      colIndex={colIndex}
      width={width}
      gate={gate}
      editing={open}
      text={text}
      busy={busy}
      errorMessage={error}
      onBegin={() => {
        if (assignment === null) return;
        setDraft(currentValue);
        setOpen(true);
      }}
      onChange={() => undefined}
      onCommit={() => undefined}
      onCancel={() => close(true)}
      registerShow={registerShow}
      className="text-left"
      field={field}
    />
  );
}
