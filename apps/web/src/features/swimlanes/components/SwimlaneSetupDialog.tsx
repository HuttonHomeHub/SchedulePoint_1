import type { SwimlaneSummary } from '@repo/types';
import { useId, useState } from 'react';

import { parseSwimlaneNames } from '../model/swimlane-names';
import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/form';

export interface SwimlaneSetupDialogProps {
  open: boolean;
  onClose: () => void;
  /** The plan, at the version last read: the source write is locked on it. */
  plan: { id: string; version: number };
  /** The plan's active swimlanes now, so a name that is taken is named before the server refuses it. */
  swimlanes: readonly SwimlaneSummary[];
  actions: SwimlaneActions;
  /** May the caller write, and when not, why. The entry point shades itself, but the pen can be lost while this is open. */
  gate: { writable: boolean; reason: string | null };
}

/**
 * **Set up swimlanes** (swimlanes M2-T9, feature-spec US-2): by hand — type the names, one per line.
 * The WBS option joins this dialog in M3, so it is a fixed sentence here and not a one-option radio.
 *
 * Confirming does two writes in order: the swimlanes (appended in the order typed, one undo step),
 * then the plan's source. If the second fails the first stays, and the dialog says so and retries
 * **only** the source — pressing Set up again must not meet the swimlanes it just made as "already
 * exists".
 *
 * Working state (the text, the error, how far a confirm got) lives for one opening (ADR-0169): the
 * form is the dialog's child, which `Dialog` mounts only while open.
 */
export function SwimlaneSetupDialog(props: SwimlaneSetupDialogProps): React.ReactElement {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Set up swimlanes"
      description="Swimlanes divide the diagram into labelled bands. “No swimlane” always holds everything not yet placed in one."
    >
      <SetupForm {...props} />
    </Dialog>
  );
}

function SetupForm({
  onClose,
  plan,
  swimlanes,
  actions,
  gate,
}: SwimlaneSetupDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const errorId = useId();
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // How many were created before a failure, so a retry does not create them twice.
  const [created, setCreated] = useState(0);
  const sourceOnly = created > 0;

  const submit = async (): Promise<void> => {
    if (pending || !gate.writable) return;
    setFailure(null);
    const parsed = parseSwimlaneNames(
      text,
      swimlanes.map((s) => s.name),
    );
    if (!sourceOnly) {
      if (parsed.names.length === 0) {
        setProblems(['Enter at least one swimlane name.']);
        return;
      }
      if (parsed.problems.length > 0) {
        setProblems(parsed.problems);
        return;
      }
    }
    setProblems([]);
    setPending(true);
    // Read once: state set below is not visible to this call, and the failure sentence needs the count.
    let made = created;
    try {
      if (!sourceOnly) {
        made = (await actions.add(parsed.names)).length;
        setCreated(made);
      }
      await actions.setManualSource(plan);
      announce(`${String(made)} ${made === 1 ? 'swimlane' : 'swimlanes'} set up.`);
      onClose();
    } catch (error) {
      setFailure(
        made > 0
          ? `The swimlanes were created, but the plan could not be switched to use them: ${message(error)} Press Set up swimlanes to try again.`
          : message(error),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="text-muted-foreground text-sm">
        By hand: you name them and put activities in them.
      </p>
      <TextareaField
        label="Swimlane names, one per line"
        rows={6}
        value={text}
        readOnly={sourceOnly}
        onChange={(event) => {
          setProblems([]);
          setText(event.target.value);
        }}
        // The problems are one paragraph below, linked here; the field's own `error` slot takes one string.
        aria-describedby={problems.length > 0 ? errorId : undefined}
        aria-invalid={problems.length > 0 ? true : undefined}
        hint="They stack top to bottom in this order, above “No swimlane”."
        gate={{ writable: gate.writable, reason: gate.reason }}
      />
      {problems.length > 0 ? (
        <ul id={errorId} role="alert" className="text-destructive-text list-disc pl-5 text-sm">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {/* `aria-disabled` and a guard, not native `disabled`: the button flips under the user's own
            focus when the request starts, and a natively disabled one would blur to <body>. */}
        <Button
          type="submit"
          aria-disabled={pending || !gate.writable}
          aria-busy={pending}
          className="aria-busy:pointer-events-none"
        >
          {pending ? 'Setting up…' : 'Set up swimlanes'}
        </Button>
      </div>
    </form>
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
