import type { ActivitySummary, CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useCodeTypes } from '../api/use-code-types';
import { useCodeValues } from '../api/use-code-values';
import { codeErrorText } from '../model/code-errors';
import { typeNameProblem } from '../model/code-text';
import {
  codeUsage,
  typeDeleteSentence,
  typeDeleteTitle,
  valueDeleteSentence,
  valueDeleteTitle,
  type CodeUsage,
} from '../model/code-usage';
import type { CodesGate } from '../model/codes-gating';
import { neighbourOf, type RemovedRow } from '../model/focus-after-removal';
import { useCodesActions, type CodeActions } from '../model/use-codes-actions';

import { CodeDeleteDialog } from './CodeDeleteDialog';
import { CodeTypePane } from './CodeTypePane';
import { CodeTypeRenameDialog } from './CodeTypeRenameDialog';
import { CodeValueEditDialog } from './CodeValueEditDialog';
import { DeletedCodeTypes } from './DeletedCodesDisclosure';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { useFieldGate } from '@/components/ui/field-gate';
import { TextField } from '@/components/ui/form';
import { LoadingShape } from '@/components/ui/page/loading-shape';
import { Skeleton } from '@/components/ui/page/skeleton';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Tabs, type TabDescriptor } from '@/components/ui/tabs';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';
import type { Command } from '@/features/undo-redo';
import { ApiFetchError } from '@/lib/api/client';

export interface CodesDialogProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  planId: string;
  /** The plan's activities, which the delete sentences count carriers from; `undefined` while they load. */
  activities: readonly ActivitySummary[] | undefined;
  gate: CodesGate;
  /** The workspace's undo history seam. */
  record?: ((command: Command) => void) | undefined;
}

/** The stacked dialogs, one at a time, each over Codes…; they hold ids, never copies of a row. */
type Stacked =
  | { kind: 'rename-type'; typeId: string }
  | { kind: 'delete-type'; typeId: string; order: readonly string[] }
  | { kind: 'edit-value'; typeId: string; valueId: string; others: readonly string[] }
  | { kind: 'delete-value'; typeId: string; valueId: string; order: readonly string[] };

const NO_TYPES: readonly CodeTypeSummary[] = [];
const NO_USAGE: CodeUsage = { byValue: new Map(), byType: new Map() };

/**
 * **Codes…** — add, rename, reorder, delete and restore a plan's code types and their values
 * (P6 activity codes, M3-T1; `m3-ui-design.md` §5.1). Every change applies at once and is one undo
 * step; there is no Save.
 *
 * It is two panes in the editor's rail-and-pane shape (ADR-0061 §3): a vertical `Tabs` rail of the
 * types, and the selected type's values beside it. **Only the selected type's values are ever read**,
 * so opening the dialog costs two requests (the types, then the first type's values) and arrowing
 * through the rail costs one per type not read in the last 30 s.
 *
 * Rename, Edit and Delete stack above this dialog as their own dialogs, mounted as its siblings; the
 * state that opens them lives here and is cleared when this one closes (ADR-0169).
 */
export function CodesDialog(props: CodesDialogProps): React.ReactElement {
  const { open, onClose, orgSlug, planId, activities, gate, record } = props;
  const actions = useCodesActions(orgSlug, planId, record);
  const types = useCodeTypes(orgSlug, planId, open);
  const list = types.data ?? NO_TYPES;
  const [picked, setPicked] = useState<string | null>(null);
  const [stacked, setStacked] = useState<Stacked | null>(null);
  // Hand-offs armed by a delete and carried out once the row has left the list (see the pane).
  const removedRowRef = useRef<RemovedRow | null>(null);
  const removedTypeRef = useRef<string | null>(null);
  const addValueOnRef = useRef<string | null>(null);
  // The body publishes "focus the selected tab" here, for a type delete to call as soon as it lands.
  const focusTabRef = useRef<(() => void) | null>(null);

  const usage = useMemo(() => (open ? codeUsage(activities ?? []) : NO_USAGE), [open, activities]);

  const close = (): void => {
    setStacked(null);
    setPicked(null);
    onClose();
  };

  const stackedType = stacked ? (list.find((type) => type.id === stacked.typeId) ?? null) : null;
  const valueStack = stacked?.kind === 'edit-value' || stacked?.kind === 'delete-value';
  const stackedValues = useCodeValues(
    orgSlug,
    planId,
    valueStack ? stacked.typeId : undefined,
    open && valueStack,
  );
  const stackedValue =
    valueStack && stackedValues.data
      ? (stackedValues.data.find((value) => value.id === stacked.valueId) ?? null)
      : null;
  const shutStacked = (): void => setStacked(null);
  // A colleague can delete the very thing a stacked editor is open on. The editor stays open and says
  // so, rather than closing under the reader; "gone" is only claimed once the list has been read.
  const typeGone = types.isSuccess && stackedType === null;
  const valueGone =
    stacked?.kind === 'edit-value' &&
    (typeGone || (stackedValues.isSuccess && stackedValue === null));

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="Codes"
        description="Labels such as Area or Trade that you give to activities (P6 activity codes). Changes apply at once, and each one can be undone."
        size="xl"
        body="flush"
      >
        <FieldGateProvider gate={gate} className="px-6 pb-3">
          <CodesBody
            orgSlug={orgSlug}
            planId={planId}
            types={types}
            list={list}
            picked={picked}
            onPick={setPicked}
            usage={usage}
            actions={actions}
            gate={gate}
            onClose={close}
            onStack={setStacked}
            removedRowRef={removedRowRef}
            removedTypeRef={removedTypeRef}
            addValueOnRef={addValueOnRef}
            focusTabRef={focusTabRef}
          />
        </FieldGateProvider>
      </Dialog>
      <CodeTypeRenameDialog
        open={stacked?.kind === 'rename-type'}
        onClose={shutStacked}
        type={stacked?.kind === 'rename-type' ? stackedType : null}
        gone={stacked?.kind === 'rename-type' && typeGone}
        otherNames={list.filter((type) => type.id !== stackedType?.id).map((type) => type.name)}
        actions={actions}
        gate={gate}
      />
      <CodeValueEditDialog
        open={stacked?.kind === 'edit-value'}
        onClose={shutStacked}
        value={stacked?.kind === 'edit-value' ? stackedValue : null}
        gone={valueGone}
        typeName={stackedType?.name ?? ''}
        otherShortCodes={stacked?.kind === 'edit-value' ? stacked.others : []}
        actions={actions}
        gate={gate}
      />
      <CodeDeleteDialog
        open={stacked?.kind === 'delete-type' || stacked?.kind === 'delete-value'}
        onClose={shutStacked}
        title={deleteTitle(stacked, stackedType, stackedValue)}
        description={deleteDescription(
          stacked,
          stackedType,
          stackedValue,
          activities ? usage : null,
        )}
        confirmLabel={stacked?.kind === 'delete-value' ? 'Delete value' : 'Delete code type'}
        failureAction={deleteAction(stacked, stackedType, stackedValue)}
        describeFailure={(action, cause) => codeErrorText(action, cause, stackedType?.name)}
        onConfirm={async () => {
          if (stacked?.kind === 'delete-type' && stackedType) {
            await actions.removeType(stackedType);
            return `Code type ${stackedType.name} deleted. Undo brings it back.`;
          }
          if (stacked?.kind === 'delete-value' && stackedValue) {
            await actions.removeValue(stackedValue);
            return `Value ${stackedValue.shortCode} deleted. Undo brings it back.`;
          }
          // Deleted by a colleague between opening this and pressing Delete: reads as any other stale write.
          throw new ApiFetchError(404, {
            code: 'NOT_FOUND',
            message: 'That row is no longer there.',
          });
        }}
        onDeleted={() => {
          if (stacked?.kind === 'delete-type') {
            // Selects the neighbouring tab, and has focus follow once the removed one has left.
            removedTypeRef.current = stacked.typeId;
            setPicked(neighbourOf(stacked.order, stacked.typeId) ?? null);
            // At once, not after the refetch: the pane that held the Delete button this dialog
            // returns to is keyed by the type, so it is already gone, and focus would sit on `<body>`
            // for as long as the refetch takes. One frame later, so the dialog's own restore has run.
            requestAnimationFrame(() => focusTabRef.current?.());
          } else if (stacked?.kind === 'delete-value') {
            removedRowRef.current = { id: stacked.valueId, order: stacked.order, verb: 'delete' };
          }
        }}
      />
    </>
  );
}

function deleteTitle(
  stacked: Stacked | null,
  type: CodeTypeSummary | null,
  value: CodeValueSummary | null,
): string | null {
  if (stacked?.kind === 'delete-type' && type)
    return typeDeleteTitle(type.name, type.valueCount ?? 0);
  if (stacked?.kind === 'delete-value' && value) return valueDeleteTitle(value.shortCode);
  return null;
}

function deleteDescription(
  stacked: Stacked | null,
  type: CodeTypeSummary | null,
  value: CodeValueSummary | null,
  usage: CodeUsage | null,
): string {
  if (stacked?.kind === 'delete-type' && type) return typeDeleteSentence(type.name);
  if (stacked?.kind === 'delete-value' && value && type) {
    // No counts yet is not "no carriers": the sentence must not claim what it has not read.
    return valueDeleteSentence(usage ? (usage.byValue.get(value.id) ?? 0) : undefined, type.name);
  }
  return '';
}

function deleteAction(
  stacked: Stacked | null,
  type: CodeTypeSummary | null,
  value: CodeValueSummary | null,
): string {
  if (stacked?.kind === 'delete-type') return `delete ${type?.name ?? 'the code type'}`;
  return `delete ${value?.shortCode ?? 'the value'}`;
}

interface BodyProps {
  orgSlug: string;
  planId: string;
  types: ReturnType<typeof useCodeTypes>;
  list: readonly CodeTypeSummary[];
  picked: string | null;
  onPick: (id: string | null) => void;
  usage: CodeUsage;
  actions: CodeActions;
  gate: CodesGate;
  onClose: () => void;
  onStack: (next: Stacked) => void;
  removedRowRef: React.RefObject<RemovedRow | null>;
  removedTypeRef: React.RefObject<string | null>;
  addValueOnRef: React.RefObject<string | null>;
  focusTabRef: React.RefObject<(() => void) | null>;
}

function CodesBody({
  orgSlug,
  planId,
  types,
  list,
  picked,
  onPick,
  usage,
  actions,
  gate,
  onClose,
  onStack,
  removedRowRef,
  removedTypeRef,
  addValueOnRef,
  focusTabRef,
}: BodyProps): React.ReactElement {
  const announce = useAnnounce();
  const reasonId = useFieldGate()?.reasonId;
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  // "Is focus inside the dialog's body" for the hand-off below; the target is only used when the
  // whole body unmounts, which is the dialog closing, and then nothing needs to be handed on.
  const { wrapperProps, focusWasInside } = useContainerUnmountHandoff({ target: () => null });

  const ids = list.map((type) => type.id);
  const idKey = ids.join(',');
  // If the selected type disappears for a reason this reader did not cause (a colleague deleted it), the
  // neighbouring one is selected rather than the first. Adjusting state while rendering, not in an
  // effect: https://react.dev/learn/you-might-not-need-an-effect
  const [seen, setSeen] = useState<string[]>(ids);
  const [fallback, setFallback] = useState<string | null>(null);
  if (seen.join(',') !== idKey) {
    setSeen(ids);
    if (picked !== null && !ids.includes(picked)) setFallback(neighbourOf(seen, picked) ?? null);
  }
  const active =
    list.find((type) => type.id === picked) ?? list.find((type) => type.id === fallback) ?? list[0];
  const activeIndex = active ? list.indexOf(active) : -1;

  const selectedTab = (): HTMLElement | null =>
    railRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null;
  useLayoutEffect(() => {
    focusTabRef.current = () => selectedTab()?.focus();
    return () => {
      focusTabRef.current = null;
    };
  });

  // Opening focuses the selected tab, or the Add form when there are no types (focus rule 1). Once the
  // types have arrived, and one frame later so `Dialog`'s own `showModal()` focusing has run first.
  const focusedOnOpen = useRef(false);
  useEffect(() => {
    if (focusedOnOpen.current || !types.isSuccess) return;
    focusedOnOpen.current = true;
    requestAnimationFrame(() => {
      (selectedTab() ?? nameRef.current)?.focus();
    });
  }, [types.isSuccess]);

  // Focus after a type has left the list (focus rule 5, and rule 6 when it was a colleague who removed
  // it): to the selected tab, which `onPick` has already moved to the neighbour. Only if focus was
  // inside this body and has been dropped, so a reader who moved on is never pulled back.
  const previousActive = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const before = previousActive.current;
    const own = removedTypeRef.current;
    const gone = before !== undefined && !ids.includes(before);
    if (!gone && own === null) return;
    if (own !== null && ids.includes(own)) return;
    removedTypeRef.current = null;
    const dropped =
      document.activeElement === null ||
      document.activeElement === document.body ||
      !document.activeElement.isConnected;
    if (own === null && !(focusWasInside() && dropped)) return;
    requestAnimationFrame(() => {
      (selectedTab() ?? nameRef.current)?.focus();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids; `ids` is rebuilt every render.
  }, [idKey]);
  // Remembered on every commit (not only when the ids change), so the effect above compares against
  // the type that was selected a moment ago and not the one selected when the list last changed.
  useLayoutEffect(() => {
    previousActive.current = active?.id;
  });

  const shut = !gate.writable;
  const run = async (action: string, work: () => Promise<void>): Promise<void> => {
    if (busy || shut) return;
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (cause) {
      setFailure(codeErrorText(action, cause));
    } finally {
      setBusy(false);
    }
  };

  const moveType = (type: CodeTypeSummary, delta: -1 | 1): void => {
    void run(`move ${type.name}`, async () => {
      const moved = await actions.moveType(list, type.id, delta);
      if (!moved) return;
      const place = list.findIndex((t) => t.id === type.id) + delta + 1;
      announce(`${type.name} moved to position ${String(place)} of ${String(list.length)}.`);
    });
  };

  const tabs: TabDescriptor<string>[] = list.map((type) => ({ id: type.id, label: type.name }));
  const names = list.map((type) => type.name);
  const onTypeAdded = (created: CodeTypeSummary): void => {
    // Selects the new tab, and arms the pane's Add value field: the next thing to type is a value
    // (focus rule 2). The list has refetched by now, so the type exists to be selected.
    addValueOnRef.current = created.id;
    onPick(created.id);
    announce(`Code type ${created.name} added.`);
  };
  let main: React.ReactNode;
  if (types.isPending) {
    // The settled shape (ADR-0202): a three-tab rail beside an empty pane, and one sentence.
    main = (
      <LoadingShape label="Loading codes…" className="flex min-h-0 flex-1">
        <div className="bg-muted border-border flex h-full w-52 flex-col gap-1 border-r p-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </LoadingShape>
    );
  } else if (types.isError) {
    main = (
      <div className="px-6 pb-4">
        <QueryErrorState label="Codes could not be loaded." onRetry={() => void types.refetch()} />
      </div>
    );
  } else if (active === undefined) {
    main = (
      <p className="text-muted-foreground px-6 pb-4 text-sm">
        {gate.roleDenied
          ? 'This plan has no codes yet.'
          : 'This plan has no codes yet. Add a code type, such as Area or Trade.'}
      </p>
    );
  } else {
    main = (
      <div ref={railRef} className="border-border flex min-h-0 flex-1 border-t">
        <Tabs
          label="Code types"
          orientation="vertical"
          className="min-h-0 flex-1"
          tabs={tabs}
          active={active.id}
          onChange={onPick}
        >
          {() => (
            <CodeTypePane
              key={active.id}
              orgSlug={orgSlug}
              planId={planId}
              type={active}
              position={{ index: activeIndex, count: list.length }}
              usage={usage}
              actions={actions}
              gate={gate}
              onRenameType={() => onStack({ kind: 'rename-type', typeId: active.id })}
              onDeleteType={() => onStack({ kind: 'delete-type', typeId: active.id, order: ids })}
              onMoveType={(delta) => moveType(active, delta)}
              onEditValue={(value, others) =>
                onStack({ kind: 'edit-value', typeId: active.id, valueId: value.id, others })
              }
              onDeleteValue={(value, order) =>
                onStack({ kind: 'delete-value', typeId: active.id, valueId: value.id, order })
              }
              removedRowRef={removedRowRef}
              addValueOnRef={addValueOnRef}
            />
          )}
        </Tabs>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" {...wrapperProps}>
      {main}
      <div className="border-border flex min-h-0 border-t">
        {/* The rail's foot sits under the tabs in the rail's own column, so it is exactly as wide as
            the rail: `w-52` here and in `Tabs`' vertical rail are one number, pinned together by a
            test, and moving one without the other leaves a step in the dialog's left edge. It scrolls
            by itself, so a long list of deleted types cannot push the form out of a 600 px window.
            The Add form leads because it is the common act, and the height is reserved from the first
            frame so the cell does not grow under the pointer when the types arrive. */}
        <div
          data-codes-rail-foot
          className={`bg-muted border-border flex max-h-64 w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r p-2 ${gate.roleDenied ? '' : 'min-h-44'}`}
        >
          {types.isSuccess && !gate.roleDenied ? (
            <AddTypeForm
              names={names}
              gate={gate}
              reasonId={reasonId}
              inputRef={nameRef}
              busy={busy}
              run={run}
              actions={actions}
              onAdded={onTypeAdded}
            />
          ) : null}
          {types.isSuccess && gate.canRestore ? (
            <DeletedCodeTypes orgSlug={orgSlug} planId={planId} actions={actions} gate={gate} />
          ) : null}
        </div>
        <div className="flex flex-1 flex-col items-end justify-end gap-2 p-2">
          {failure !== null ? (
            <p role="alert" className="text-destructive-text self-start text-sm">
              {failure}
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

interface AddTypeFormProps {
  names: readonly string[];
  gate: CodesGate;
  reasonId: string | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  busy: boolean;
  run: (action: string, work: () => Promise<void>) => Promise<void>;
  actions: CodeActions;
  onAdded: (created: CodeTypeSummary) => void;
}

/**
 * The Add code type form. Its draft lives here and not in the body, so typing re-renders this form
 * and nothing else: the pane and its (up to 1,000) value rows are not touched by a keystroke.
 */
function AddTypeForm({
  names,
  gate,
  reasonId,
  inputRef,
  busy,
  run,
  actions,
  onAdded,
}: AddTypeFormProps): React.ReactElement {
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const shut = !gate.writable;

  const add = (): Promise<void> => {
    // Shut first: a name problem is not worth reporting to a reader who cannot add anyway.
    if (busy || shut) return Promise.resolve();
    const trouble = typeNameProblem(name, names);
    if (trouble !== null) {
      setProblem(trouble);
      // The first invalid field takes focus, so the problem is where the caret is.
      inputRef.current?.focus();
      return Promise.resolve();
    }
    return run(`add ${name.trim()}`, async () => {
      const created = await actions.addType(name.trim());
      setName('');
      setProblem(null);
      onAdded(created);
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <TextField
        ref={inputRef}
        label="New code type"
        data-new-code-type
        value={name}
        onChange={(event) => {
          setProblem(null);
          setName(event.target.value);
        }}
        error={problem ?? undefined}
        gate={{ writable: gate.writable, reason: null }}
        aria-describedby={reasonId}
      />
      <Button
        type="submit"
        aria-disabled={busy || shut}
        aria-busy={busy}
        aria-describedby={reasonId}
      >
        Add code type
      </Button>
    </form>
  );
}
