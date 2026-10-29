import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useState } from 'react';

import { useDeletedCodeTypes } from '../api/use-code-types';
import { useDeletedCodeValues } from '../api/use-code-values';
import { codeErrorText } from '../model/code-errors';
import { codeValueOptionLabel } from '../model/code-names';
import type { CodesGate } from '../model/codes-gating';
import type { CodeActions } from '../model/use-codes-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { useFieldGate } from '@/components/ui/field-gate';
import { LoadingShape } from '@/components/ui/page/loading-shape';
import { Skeleton } from '@/components/ui/page/skeleton';

interface Common {
  orgSlug: string;
  planId: string;
  actions: CodeActions;
  gate: CodesGate;
}

/**
 * **Deleted code types**, a restore list in the rail. Read only while it is open, and only offered to
 * a reader who can restore (`code:restore`; the server answers 403 otherwise). The content is
 * `hidden` while folded: it holds controls, and a clipped control in the tab order is a focus ring
 * nobody can see (`Disclosure`'s own rule).
 */
export function DeletedCodeTypes(props: Common): React.ReactElement {
  return (
    <Disclosure label="Deleted code types" collapsed="hidden">
      <DeletedTypesList {...props} />
    </Disclosure>
  );
}

/** **Deleted values** of the open type, the same list in the pane. */
export function DeletedCodeValues(props: Common & { type: CodeTypeSummary }): React.ReactElement {
  return (
    <Disclosure label="Deleted values" collapsed="hidden">
      <DeletedValuesList {...props} />
    </Disclosure>
  );
}

function DeletedTypesList({ orgSlug, planId, actions, gate }: Common): React.ReactElement {
  const deleted = useDeletedCodeTypes(orgSlug, planId, true);
  return (
    <DeletedList
      noun="code types"
      query={deleted}
      gate={gate}
      rows={(deleted.data ?? []).map((type) => ({
        id: type.id,
        label: type.name,
        restore: () => actions.restoreType(type),
        restoredSentence: `Code type ${type.name} restored.`,
        failureAction: `restore ${type.name}`,
        subject: undefined,
      }))}
    />
  );
}

function DeletedValuesList({
  orgSlug,
  planId,
  type,
  actions,
  gate,
}: Common & { type: CodeTypeSummary }): React.ReactElement {
  const deleted = useDeletedCodeValues(orgSlug, planId, type.id, true);
  return (
    <DeletedList
      noun="values"
      query={deleted}
      gate={gate}
      rows={(deleted.data ?? []).map((value: CodeValueSummary) => ({
        id: value.id,
        label: codeValueOptionLabel(value),
        restore: () => actions.restoreValue(type, value),
        restoredSentence: `Value ${value.shortCode} restored.`,
        failureAction: `restore ${value.shortCode}`,
        subject: type.name,
      }))}
    />
  );
}

interface DeletedRow {
  id: string;
  label: string;
  restore: () => Promise<void>;
  restoredSentence: string;
  failureAction: string;
  /** The name a refusal may need ("Restore Area first."). */
  subject: string | undefined;
}

function DeletedList({
  noun,
  query,
  rows,
  gate,
}: {
  noun: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  rows: DeletedRow[];
  gate: CodesGate;
}): React.ReactElement {
  const announce = useAnnounce();
  const reasonId = useFieldGate()?.reasonId;
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const restore = async (row: DeletedRow): Promise<void> => {
    if (busy !== null || !gate.writable) return;
    setFailure(null);
    setBusy(row.id);
    try {
      await row.restore();
      announce(row.restoredSentence);
    } catch (cause) {
      setFailure(codeErrorText(row.failureAction, cause, row.subject));
    } finally {
      setBusy(null);
    }
  };

  if (query.isPending) {
    return (
      <LoadingShape label={`Loading deleted ${noun}…`}>
        <Skeleton className="h-8 w-full" />
      </LoadingShape>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-destructive-text text-sm">
          {`Deleted ${noun} could not be loaded.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">Nothing deleted.</p>;
  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Preflight strips the list marker and VoiceOver then drops the role; the explicit one keeps the count it announces. */}
      <ul role="list" aria-label={`Deleted ${noun}`} className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm break-words">
              {row.label}
              <span className="text-muted-foreground"> · Deleted</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={busy !== null || !gate.writable || undefined}
              aria-label={`Restore ${row.label}`}
              aria-busy={busy === row.id}
              aria-describedby={!gate.writable ? reasonId : undefined}
              onClick={() => void restore(row)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
