import type { CodeValueSummary } from '@repo/types';
import { useEffect, useRef, useState } from 'react';

import { codeErrorText } from '../model/code-errors';
import { hasValueProblem, valueProblems, type ValueProblems } from '../model/code-text';
import type { CodesGate } from '../model/codes-gating';
import type { CodeActions } from '../model/use-codes-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';

export interface CodeValueEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** The value being edited, or null while the dialog is closed. */
  value: CodeValueSummary | null;
  /** The type's name, for the duplicate sentence. */
  typeName: string;
  /** The type's other live short codes, for the duplicate check. */
  otherShortCodes: readonly string[];
  actions: CodeActions;
  gate: CodesGate;
}

/** Edit one value's short code and description. One undo step; the change applies at once. */
export function CodeValueEditDialog(props: CodeValueEditDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open && props.value !== null} onClose={props.onClose} title="Edit value">
      {props.value ? <EditForm {...props} value={props.value} /> : null}
    </Dialog>
  );
}

const NO_PROBLEMS: ValueProblems = { shortCode: null, description: null };

function EditForm({
  onClose,
  value,
  typeName,
  otherShortCodes,
  actions,
  gate,
}: CodeValueEditDialogProps & { value: CodeValueSummary }): React.ReactElement {
  const announce = useAnnounce();
  const [shortCode, setShortCode] = useState(value.shortCode);
  const [description, setDescription] = useState(value.description ?? '');
  const [problems, setProblems] = useState<ValueProblems>(NO_PROBLEMS);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const shortCodeRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  // Opens with the caret in the first field; deferred for the reason `CodeTypeRenameDialog` records.
  useEffect(() => {
    queueMicrotask(() => {
      shortCodeRef.current?.focus();
      shortCodeRef.current?.select();
    });
  }, []);

  const submit = async (): Promise<void> => {
    if (pending || !gate.writable) return;
    const found = valueProblems({ shortCode, description }, otherShortCodes, typeName);
    if (hasValueProblem(found)) {
      setProblems(found);
      // The first invalid field takes focus, so the problem is where the caret is.
      (found.shortCode !== null ? shortCodeRef : descriptionRef).current?.focus();
      return;
    }
    const unchanged =
      shortCode.trim() === value.shortCode &&
      (description.trim() === '' ? null : description.trim()) === value.description;
    if (unchanged) {
      onClose();
      return;
    }
    setFailure(null);
    setPending(true);
    try {
      const saved = await actions.editValue(value, { shortCode, description });
      announce(`Value ${saved.shortCode} updated.`);
      onClose();
    } catch (cause) {
      setFailure(codeErrorText(`edit ${value.shortCode}`, cause, typeName));
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
        label="Short code"
        value={shortCode}
        ref={shortCodeRef}
        onChange={(event) => {
          setProblems(NO_PROBLEMS);
          setShortCode(event.target.value);
        }}
        error={problems.shortCode ?? undefined}
        gate={{ writable: gate.writable, reason: gate.reason }}
      />
      <TextField
        label="Description"
        hint="Optional. A longer name, used wherever the value is shown by name."
        value={description}
        ref={descriptionRef}
        onChange={(event) => {
          setProblems(NO_PROBLEMS);
          setDescription(event.target.value);
        }}
        error={problems.description ?? undefined}
        gate={{ writable: gate.writable, reason: gate.reason }}
      />
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
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
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
