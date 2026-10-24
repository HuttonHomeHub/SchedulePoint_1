import type { SwimlaneSummary } from '@repo/types';
import { useEffect, useRef, useState } from 'react';

import { swimlaneNameProblem } from '../model/swimlane-names';
import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';

export interface SwimlaneRenameDialogProps {
  open: boolean;
  onClose: () => void;
  /** The swimlane being renamed, or null while the dialog is closed. */
  swimlane: SwimlaneSummary | null;
  /** The plan's other swimlanes' names, for the duplicate check. */
  otherNames: readonly string[];
  actions: SwimlaneActions;
  gate: { writable: boolean; reason: string | null };
}

/** Rename one swimlane (the gutter menu's **Rename…**). One undo step; the change applies at once. */
export function SwimlaneRenameDialog(props: SwimlaneRenameDialogProps): React.ReactElement {
  return (
    <Dialog
      open={props.open && props.swimlane !== null}
      onClose={props.onClose}
      title="Rename swimlane"
    >
      {props.swimlane ? <RenameForm {...props} swimlane={props.swimlane} /> : null}
    </Dialog>
  );
}

function RenameForm({
  onClose,
  swimlane,
  otherNames,
  actions,
  gate,
}: SwimlaneRenameDialogProps & { swimlane: SwimlaneSummary }): React.ReactElement {
  const announce = useAnnounce();
  const [name, setName] = useState(swimlane.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  // A one-field dialog opens with the caret in the field. Not `autoFocus`, which moves focus on every
  // mount of the attribute; this runs once per opening, since the form mounts with the dialog.
  useEffect(() => fieldRef.current?.select(), []);

  const submit = async (): Promise<void> => {
    if (pending || !gate.writable) return;
    const problem = swimlaneNameProblem(name, otherNames);
    if (problem !== null) {
      setError(problem);
      return;
    }
    if (name.trim() === swimlane.name) {
      onClose();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const saved = await actions.rename(swimlane, name.trim());
      announce(`Swimlane renamed to ${saved.name}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
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
      <TextField
        label="Name"
        value={name}
        maxLength={200}
        ref={fieldRef}
        onChange={(event) => {
          setError(null);
          setName(event.target.value);
        }}
        error={error ?? undefined}
        gate={{ writable: gate.writable, reason: gate.reason }}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          aria-disabled={pending || !gate.writable}
          aria-busy={pending}
          className="aria-busy:pointer-events-none"
        >
          {pending ? 'Saving…' : 'Rename'}
        </Button>
      </div>
    </form>
  );
}
