import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useLayoutEffect, useRef, useState } from 'react';

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

function withCount(
  label: string,
  query: { data: readonly unknown[] | undefined; isStale: boolean },
): string {
  return query.data !== undefined && !query.isStale
    ? `${label} (${String(query.data.length)})`
    : label;
}

/**
 * **Deleted code types**, a restore list in the rail. Read only while it is open, and only offered to
 * a reader who can restore (`code:restore`; the server answers 403 otherwise). The content is
 * `hidden` while folded: it holds controls, and a clipped control in the tab order is a focus ring
 * nobody can see (`Disclosure`'s own rule).
 */
export function DeletedCodeTypes(props: Common): React.ReactElement {
  // The toggle names how many are deleted once that is known. It reads the list's own cache without
  // fetching (`enabled: false`), so a closed disclosure still costs no request; an infinite
  // `staleTime` makes `isStale` mean "invalidated", so a count a later write has made wrong is dropped
  // rather than shown.
  const known = useDeletedCodeTypes(props.orgSlug, props.planId, false, Infinity);
  return (
    <Disclosure label={withCount('Deleted code types', known)} collapsed="hidden">
      <DeletedTypesList {...props} />
    </Disclosure>
  );
}

/** **Deleted values** of the open type, the same list in the pane. */
export function DeletedCodeValues(props: Common & { type: CodeTypeSummary }): React.ReactElement {
  const known = useDeletedCodeValues(props.orgSlug, props.planId, props.type.id, false, Infinity);
  return (
    <Disclosure label={withCount('Deleted values', known)} collapsed="hidden">
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
  const rootRef = useRef<HTMLDivElement>(null);
  // The row a restore is taking out of this list and the order it had, so that when the row has gone
  // focus can follow it rather than fall to `<body>` (ADR-0135).
  const leaving = useRef<{ id: string; order: readonly string[] } | null>(null);
  useLayoutEffect(() => {
    const gone = leaving.current;
    if (gone === null || rows.some((row) => row.id === gone.id)) return;
    leaving.current = null;
    // One frame later, so the button that was pressed has finished leaving the DOM first.
    requestAnimationFrame(() => {
      const at = gone.order.indexOf(gone.id);
      const root = rootRef.current;
      if (root === null) return;
      const candidates = [gone.order[at + 1], gone.order[at - 1]].filter(
        (id): id is string => id !== undefined,
      );
      for (const id of candidates) {
        const button = root.querySelector<HTMLElement>(`[data-restore-row="${id}"]`);
        if (button !== null) {
          button.focus();
          return;
        }
      }
      // Nothing left to restore: the toggle that opened this list, which stays on screen.
      const content = root.closest('[id]');
      if (content !== null) {
        document.querySelector<HTMLElement>(`[aria-controls="${content.id}"]`)?.focus();
      }
    });
  }, [rows]);

  const restore = async (row: DeletedRow): Promise<void> => {
    if (busy !== null || !gate.writable) return;
    setFailure(null);
    setBusy(row.id);
    // Armed before the write: the list can refetch before this function resumes.
    leaving.current = { id: row.id, order: rows.map((other) => other.id) };
    try {
      await row.restore();
      announce(row.restoredSentence);
    } catch (cause) {
      leaving.current = null;
      setFailure(codeErrorText(row.failureAction, cause, row.subject));
    } finally {
      setBusy(null);
    }
  };

  let content: React.ReactNode;
  if (query.isPending) {
    content = (
      <LoadingShape label={`Loading deleted ${noun}…`}>
        <Skeleton className="h-8 w-full" />
      </LoadingShape>
    );
  } else if (query.isError) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-destructive-text text-sm">
          {`Deleted ${noun} could not be loaded.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    content = <p className="text-muted-foreground text-sm">Nothing deleted.</p>;
  } else {
    content = (
      <div className="flex flex-col gap-2">
        {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Preflight strips the list marker and VoiceOver then drops the role; the explicit one keeps the count it announces. */}
        <ul role="list" aria-label={`Deleted ${noun}`} className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-sm break-words">{row.label}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-restore-row={row.id}
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
  return <div ref={rootRef}>{content}</div>;
}
