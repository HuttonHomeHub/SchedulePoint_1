import { useId, useState } from 'react';

import {
  choosePrompt,
  MOVE_BUTTON_LABEL,
  MOVE_TO_SWIMLANE_FIELD,
  movedStatus,
  moveToSwimlaneStatus,
  NOT_MOVED_REASON,
  SWIMLANE_MOVE_FAILED,
  swimlaneAssignedAnnouncement,
  withReload,
  type SwimlaneAssignment,
} from '../model/swimlane-assignment';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { usePopoverClose } from '@/components/ui/toolbar/popover-close';

/** The placeholder's value: nothing chosen yet, so Move says what is missing instead of guessing. */
const UNCHOSEN = '';
/** "No swimlane" cannot ride in a DOM value as `null`, so it has one of its own. */
const NONE_VALUE = '__none__';

/**
 * **Move to swimlane…**, the one control behind every place a planner assigns work to a swimlane
 * (swimlanes ui-architecture C10): a `SelectField` and a Move button, the shape `WbsBulkAssignBar`
 * already uses for the same job. A flat menu of up to 100 swimlanes has no typeahead and a submenu is
 * not in the `Menu` primitive; a native select brings its own.
 *
 * It renders inside a popover on the selection bars and inline in the activity editor, so it neither
 * opens nor positions itself: `onDone` is how the host learns the move landed, and a popover's close
 * is picked up from context as the toolbar popovers do.
 *
 * **`aria-disabled` on Move, never the native attribute**, for the reason every bar in this family
 * gives: a natively disabled button blurs to `<body>` the instant it flips, and this one flips under
 * the planner's own focus when the write starts. One status line carries the pen's reason, or what
 * pressing Move will do, and the select and the button both point at it.
 */
export function MoveToSwimlaneControl({
  assignment,
  ids,
  names,
  gate,
  onDone,
  fieldLabel = MOVE_TO_SWIMLANE_FIELD,
  hint,
  selectRef,
  quietStatus = false,
}: {
  assignment: SwimlaneAssignment;
  /** The activities to move. */
  ids: readonly string[];
  /** Their names, in the same order, for the one-bar announcement. */
  names: readonly string[];
  gate: { writable: boolean; reason: string | null };
  /** Told when a move landed; the host decides what to clear or focus. */
  onDone?: () => void;
  fieldLabel?: string;
  /**
   * A standing sentence the field and the button are described by, for a host that must say
   * something that is true whatever is chosen (the editor: it is saved apart from the tab).
   */
  hint?: React.ReactNode;
  selectRef?: React.Ref<HTMLSelectElement>;
  /**
   * The status line stays on the page and still describes the field and the button, but is not a live
   * region. For a host that sits beside another bar's live region over the same selection, so one
   * region speaks at a time; the move's own announcement and any refusal alert are unaffected.
   */
  quietStatus?: boolean;
}): React.ReactElement {
  const announce = useAnnounce();
  const closePopover = usePopoverClose();
  const selectId = useId();
  const statusId = useId();
  const hintId = useId();
  const noteId = useId();
  const note = assignment.note;
  const described = [statusId, note ? noteId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');
  const [value, setValue] = useState(UNCHOSEN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The swimlane the last move landed in, until the choice changes: the status then says so. */
  const [movedTo, setMovedTo] = useState<string | null>(null);

  const target = value === UNCHOSEN ? undefined : value === NONE_VALUE ? null : value;
  const targetChoice =
    target === undefined ? undefined : assignment.choices.find((c) => c.id === target);
  const willMove =
    target === undefined ? 0 : ids.filter((id) => assignment.currentOf(id) !== target).length;
  const blocked = !gate.writable || busy || target === undefined || willMove === 0;

  const move = (): void => {
    if (blocked || target === undefined || targetChoice === undefined) return;
    setError(null);
    setBusy(true);
    assignment.assign(ids, target).then(
      (outcome) => {
        setBusy(false);
        if (!outcome.applied) {
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
            names,
            count: outcome.moved ?? willMove,
            target: targetChoice.name,
            landed: outcome.landed,
          }),
        );
        // The choice stays, so the status can say where it went; the live region has already said so
        // once, and the status line is switched off for that moment rather than repeating it.
        setMovedTo(targetChoice.name);
        closePopover?.();
        onDone?.();
      },
      (err: unknown) => {
        setBusy(false);
        setError(err instanceof Error ? err.message : SWIMLANE_MOVE_FAILED);
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        ref={selectRef}
        label={fieldLabel}
        id={selectId}
        value={value}
        onChange={(event) => {
          setError(null);
          setMovedTo(null);
          setValue(event.target.value);
        }}
        // `reason: null` because the status line below already carries the pen's reason and the
        // select points at it: one node, N references (ADR-0083 D4).
        gate={{ writable: gate.writable, reason: null }}
        aria-describedby={described}
      >
        <option value={UNCHOSEN}>Choose a swimlane</option>
        {assignment.choices.map((choice) => (
          <option key={choice.id ?? NONE_VALUE} value={choice.id ?? NONE_VALUE}>
            {choice.name}
          </option>
        ))}
      </SelectField>
      <Button
        type="button"
        size="sm"
        aria-disabled={blocked}
        aria-busy={busy}
        aria-describedby={described}
        onClick={(event) => {
          if (blocked) {
            event.preventDefault();
            return;
          }
          move();
        }}
        className="self-start aria-busy:pointer-events-none"
      >
        {busy ? 'Moving…' : MOVE_BUTTON_LABEL}
      </Button>
      {note ? (
        <p id={noteId} className="text-muted-foreground text-sm">
          {note}
        </p>
      ) : null}
      {hint ? (
        <div id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </div>
      ) : null}
      <p
        id={statusId}
        {...(quietStatus ? {} : { role: 'status' })}
        // Off while it repeats what the live region has just announced (no double speech).
        aria-live={movedTo !== null ? 'off' : undefined}
        className="text-muted-foreground text-sm"
      >
        {!gate.writable
          ? (gate.reason ?? 'You can’t change swimlanes here.')
          : movedTo !== null
            ? movedStatus(movedTo)
            : targetChoice === undefined
              ? choosePrompt(ids.length)
              : moveToSwimlaneStatus({
                  selected: ids.length,
                  willMove,
                  target: targetChoice.name,
                })}
      </p>
      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
