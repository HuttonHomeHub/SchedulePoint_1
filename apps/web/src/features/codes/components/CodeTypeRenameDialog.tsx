import type { CodeTypeSummary } from '@repo/types';
import { useEffect, useRef, useState } from 'react';

import { codeErrorText } from '../model/code-errors';
import { typeNameProblem } from '../model/code-text';
import type { CodesGate } from '../model/codes-gating';
import type { CodeActions } from '../model/use-codes-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';

export interface CodeTypeRenameDialogProps {
  open: boolean;
  onClose: () => void;
  /** The type being renamed, or null while the dialog is closed. */
  type: CodeTypeSummary | null;
  /** The plan's other live type names, for the duplicate check. */
  otherNames: readonly string[];
  actions: CodeActions;
  gate: CodesGate;
}

/** Rename one code type. One undo step; the change applies at once. */
export function CodeTypeRenameDialog(props: CodeTypeRenameDialogProps): React.ReactElement {
  return (
    <Dialog
      open={props.open && props.type !== null}
      onClose={props.onClose}
      title="Rename code type"
    >
      {props.type ? <RenameForm {...props} type={props.type} /> : null}
    </Dialog>
  );
}

function RenameForm({
  onClose,
  type,
  otherNames,
  actions,
  gate,
}: CodeTypeRenameDialogProps & { type: CodeTypeSummary }): React.ReactElement {
  const announce = useAnnounce();
  const [name, setName] = useState(type.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  // A one-field dialog opens with the caret in the field. Deferred one microtask: this child's effect
  // runs BEFORE `Dialog`'s own (which calls `showModal()`, whose focusing steps would move focus to
  // the first control — Close — right after). Not `autoFocus`, which would lose that race the same way.
  useEffect(() => {
    queueMicrotask(() => {
      fieldRef.current?.focus();
      fieldRef.current?.select();
    });
  }, []);

  const submit = async (): Promise<void> => {
    if (pending || !gate.writable) return;
    const problem = typeNameProblem(name, otherNames);
    if (problem !== null) {
      setError(problem);
      fieldRef.current?.focus();
      return;
    }
    if (name.trim() === type.name) {
      onClose();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const saved = await actions.renameType(type, name.trim());
      announce(`Code type renamed to ${saved.name}.`);
      onClose();
    } catch (cause) {
      setError(codeErrorText(`rename ${type.name}`, cause));
      fieldRef.current?.focus();
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
