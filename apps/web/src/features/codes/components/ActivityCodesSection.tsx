import type { ActivitySummary } from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';

import { useCodeTypes } from '../api/use-code-types';
import { useCodeValueNames, type ResolvedCodeValue } from '../api/use-code-value-names';
import { planCodeAssignment } from '../model/code-assignment-plan';
import { codeErrorText } from '../model/code-errors';
import { codeValueName, codeValueOptionLabel } from '../model/code-names';
import { useSetActivityCodes } from '../model/use-set-activity-codes';

import { CodeValuePicker, NO_VALUE_LABEL } from './CodeValuePicker';

import { useAnnounce } from '@/components/ui/announcer';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { FieldGrid, FormSection } from '@/components/ui/form-layout';
import { LoadingShape, Skeleton } from '@/components/ui/page';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import type { Command } from '@/features/undo-redo';
import { codeKeys } from '@/lib/query/hierarchy-keys';

export const NO_CODES_WRITER =
  'This plan has no codes yet. Add them with Codes… in the Activities panel.';
export const NO_CODES_READER = 'This plan has no codes.';

/**
 * What the editor's session hands this section. Declared here, structurally, because the editor must
 * not import this feature and this feature must not import the editor: the host passes the one to the
 * other, and the compiler checks the join where the host composes them.
 */
export interface ActivityCodesSectionState {
  activity: ActivitySummary;
  gate: { writable: boolean; reason: string | null; roleDenied?: true };
  draft: Readonly<Record<string, string | null>>;
  choose: (codeTypeId: string, value: string | null) => void;
  dirty: boolean;
  saving: boolean;
  otherSaveInFlight: boolean;
  saved: boolean;
  error: string | null;
  begin: () => void;
  succeeded: (sent: ReadonlyMap<string, string | null>) => void;
  failed: (message: string) => void;
}

/**
 * **The editor's Codes section** (`m3-ui-design.md` §7.2): one picker per code type, under General, with
 * a Save of its own — **Save codes**.
 *
 * It is its own write scope, not a field of "Save general" (ADR-0060 §3): codes are written by
 * `PATCH …/activities/codes`, and one button over two endpoints that bump the same `version` is the
 * two-phase write that ADR refuses. The Save sends **only the types the planner changed**, at the
 * activity's `version` as it is when the button is pressed, and waits for the list to refetch, so the
 * other scopes then hold the version it produced. The session owns the working state; this section
 * draws it and does the write.
 *
 * The current value of **every** type is named by one request (`GET code-values?id=`), so opening the
 * editor costs one read however many types the plan has; a type's values load only when its picker is
 * first opened (`CodeValuePicker`). A role that can never write sees a read-only list (ADR-0083 D5); a
 * Planner without the pen sees the same pickers shaded in place, and one sentence they all point to.
 * A WBS summary shows and edits codes like any other activity: the server accepts the write.
 */
export function ActivityCodesSection({
  orgSlug,
  planId,
  state,
  record,
}: {
  orgSlug: string;
  planId: string;
  state: ActivityCodesSectionState;
  /** The workspace's history seam; absent where there is no history. */
  record?: ((command: Command) => void) | undefined;
}): React.ReactElement {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const errorId = `${baseId}-error`;
  const types = useCodeTypes(orgSlug, planId);
  const savedIds = (state.activity.codes ?? []).map((c) => c.codeValueId);
  const names = useCodeValueNames(orgSlug, planId, savedIds);
  const setCodes = useSetActivityCodes(orgSlug, planId, record);
  const { activity, gate, draft } = state;

  // Whether this section is still on screen when a save settles: a failure after the planner has moved
  // to another tab has no alert to land in, so it is announced instead.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const heldOf = (codeTypeId: string): string | null =>
    activity.codes?.find((c) => c.codeTypeId === codeTypeId)?.codeValueId ?? null;
  const resolved = (valueId: string): ResolvedCodeValue | undefined => names.data?.get(valueId);
  const savedLabel = (valueId: string | null): string | undefined => {
    if (valueId === null) return undefined;
    if (names.isPending) return 'Loading…';
    const found = resolved(valueId);
    return found === undefined ? undefined : codeValueOptionLabel(found);
  };
  const choiceOf = (codeTypeId: string): string | null =>
    codeTypeId in draft ? (draft[codeTypeId] ?? null) : heldOf(codeTypeId);

  const save = (): void => {
    const live = types.data ?? [];
    const targets = new Map<string, string | null>();
    for (const type of live) {
      if (type.id in draft && heldOf(type.id) !== (draft[type.id] ?? null)) {
        targets.set(type.id, draft[type.id] ?? null);
      }
    }
    if (targets.size === 0) return;
    // Read at the press, not captured: a General save that finished a moment ago bumped it.
    const plan = planCodeAssignment(
      [{ id: activity.id, name: activity.name, version: activity.version, codes: activity.codes }],
      targets,
    );
    // Names for the undo step's set-aside sentence: the values being left (named above) and the ones
    // being set (their type's list is cached, because the planner chose them from it).
    const valueNames = new Map<string, string>();
    for (const row of names.data?.values() ?? []) valueNames.set(row.id, codeValueName(row));
    for (const type of live) {
      const list = queryClient.getQueryData<
        { id: string; shortCode: string; description: string | null }[]
      >(codeKeys.values(orgSlug, planId, type.id));
      for (const value of list ?? []) valueNames.set(value.id, codeValueName(value));
    }
    state.begin();
    setCodes({
      plan,
      typeNames: live.filter((t) => targets.has(t.id)).map((t) => t.name),
      valueNames,
    }).then(
      () => {
        state.succeeded(targets);
        announce('Codes saved.');
      },
      (err: unknown) => {
        const message = codeErrorText('save codes', err);
        state.failed(message);
        if (!mounted.current) announce(message);
      },
    );
  };

  const body = ((): React.ReactElement => {
    if (types.isPending) {
      return (
        <LoadingShape label="Loading codes…">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </LoadingShape>
      );
    }
    if (types.isError || names.isError) {
      return (
        <QueryErrorState
          label="Codes could not be loaded."
          onRetry={() => {
            void types.refetch();
            void names.refetch();
          }}
        />
      );
    }
    const list = types.data;
    if (list.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          {gate.roleDenied ? NO_CODES_READER : NO_CODES_WRITER}
        </p>
      );
    }
    // A role that can never write reads a list: shaded pickers would promise an edit that no pen
    // hand-off will ever allow (ADR-0083 D5).
    if (gate.roleDenied) {
      return (
        <dl className="flex flex-col gap-1.5 text-sm">
          {list.map((type) => {
            const held = heldOf(type.id);
            const found = held === null ? undefined : resolved(held);
            return (
              <div key={type.id} className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">{type.name}:</dt>
                <dd>
                  {held === null
                    ? NO_VALUE_LABEL
                    : names.isPending
                      ? 'Loading…'
                      : found === undefined
                        ? 'Deleted value'
                        : codeValueName(found)}
                </dd>
              </div>
            );
          })}
        </dl>
      );
    }
    return (
      <form
        noValidate
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          // Enter in a picker with its list open and nothing highlighted falls through to implicit
          // submission (the `Combobox` leaves the key alone then). Only the Save button saves.
          if (!event.nativeEvent.submitter) return;
          if (!gate.writable || !state.dirty || state.saving || state.otherSaveInFlight) return;
          save();
        }}
        className="flex flex-col gap-4"
      >
        {state.error ? (
          <p id={errorId} role="alert" className="text-destructive-text text-sm">
            {state.error}
          </p>
        ) : null}
        <FieldGateProvider gate={gate}>
          <FieldGrid>
            {list.map((type) => (
              <CodeValuePicker
                key={type.id}
                orgSlug={orgSlug}
                planId={planId}
                codeTypeId={type.id}
                id={`${baseId}-${type.id}`}
                label={type.name}
                value={choiceOf(type.id)}
                selectedLabel={savedLabel(choiceOf(type.id))}
                onChange={(next) => state.choose(type.id, next)}
              />
            ))}
          </FieldGrid>
          <ScopeSaveBar
            gate={gate}
            dirty={state.dirty}
            pending={state.saving || state.otherSaveInFlight}
            saved={state.saved}
            label="Save codes"
            {...(state.error ? { alsoDescribedBy: errorId } : {})}
            {...(state.otherSaveInFlight && !state.saving
              ? { dirtyMessage: 'Another save is finishing.' }
              : {})}
          />
        </FieldGateProvider>
      </form>
    );
  })();

  return (
    <FormSection title="Codes" titleId={titleId}>
      {body}
    </FormSection>
  );
}
