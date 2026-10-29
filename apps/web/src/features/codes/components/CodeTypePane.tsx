import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { useCodeValues } from '../api/use-code-values';
import { codeErrorText } from '../model/code-errors';
import { hasValueProblem, valueProblems, type ValueProblems } from '../model/code-text';
import type { CodeUsage } from '../model/code-usage';
import type { CodesGate } from '../model/codes-gating';
import { focusAfterRemoval, type RemovedRow } from '../model/focus-after-removal';
import type { CodeActions } from '../model/use-codes-actions';

import { DeletedCodeValues } from './DeletedCodesDisclosure';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { useFieldGate } from '@/components/ui/field-gate';
import { TextField } from '@/components/ui/form';
import { RowActionButton } from '@/components/ui/row-action-button';

/** Above this many values the table renders only the rows in view (ADR-0165). */
const WINDOW_ABOVE = 100;

export interface CodeTypePaneProps {
  orgSlug: string;
  planId: string;
  type: CodeTypeSummary;
  /** Where the type is in the list, for "Move up / down" and their end sentences. */
  position: { index: number; count: number };
  usage: CodeUsage;
  actions: CodeActions;
  gate: CodesGate;
  onRenameType: () => void;
  onDeleteType: () => void;
  onEditValue: (value: CodeValueSummary, others: readonly string[]) => void;
  onDeleteValue: (value: CodeValueSummary, order: readonly string[]) => void;
  onMoveType: (delta: -1 | 1) => void;
  /** Set by the host when a value delete has landed; this pane moves focus once the row has left. */
  removedRowRef: RefObject<RemovedRow | null>;
  /** Set by the host to a type's id when that type has just been added: its pane focuses Add value once it can. */
  addValueOnRef: RefObject<string | null>;
}

const NO_PROBLEMS: ValueProblems = { shortCode: null, description: null };

/**
 * **One code type**: its heading and actions, its values, the Add value form and the Deleted values
 * list (`m3-ui-design.md` §5.1). The values are read when this pane mounts, which is when its tab is
 * selected — one request of at most 1,000 rows, cached per type — and never for any other type.
 *
 * **A reorder sends every live value with its current version**, which is why the whole list is
 * loaded before any Move button works. A write control is shaded in place rather than hidden when the
 * pen is not held, and omitted when the caller's role can never write (ADR-0083 D5, ADR-0204).
 */
export function CodeTypePane({
  orgSlug,
  planId,
  type,
  position,
  usage,
  actions,
  gate,
  onRenameType,
  onDeleteType,
  onEditValue,
  onDeleteValue,
  onMoveType,
  removedRowRef,
  addValueOnRef,
}: CodeTypePaneProps): React.ReactElement {
  const announce = useAnnounce();
  const headingId = useId();
  const reasonId = useFieldGate()?.reasonId;
  const values = useCodeValues(orgSlug, planId, type.id);
  const rows = useMemo(() => values.data ?? [], [values.data]);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shortCodeRef = useRef<HTMLInputElement>(null);
  const paneRef = useRef<HTMLElement>(null);
  // A move re-orders the rows and React may move the focused button to do it; the control that asked
  // takes focus back once the order has changed.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;
    paneRef.current?.querySelector<HTMLElement>(`[data-row-action="${target}"]`)?.focus();
  }, [rows]);
  // After a delete, once the row has left the list (and one frame later, so the dialog's own focus
  // restore has run first and cannot overwrite this).
  const fetching = values.isFetching;
  useLayoutEffect(() => {
    const removed = removedRowRef.current;
    if (removed === null) return;
    if (rows.some((row) => row.id === removed.id)) {
      // Still listed once the refetch has finished: the delete did not take this row out (it was
      // restored, or the write was refused after arming), so nothing is owed and nothing stays armed
      // to steal focus on some later, unrelated change of the list.
      if (!fetching) removedRowRef.current = null;
      return;
    }
    removedRowRef.current = null;
    requestAnimationFrame(() => {
      focusAfterRemoval(removed, paneRef.current ?? document);
    });
  }, [rows, fetching, removedRowRef]);

  // A type just added: the next thing to type is a value (focus rule 2). The Add form exists once the
  // values have loaded, so this waits for them.
  const addFormReady = values.isSuccess && !gate.roleDenied;
  useEffect(() => {
    if (!addFormReady || addValueOnRef.current !== type.id) return;
    addValueOnRef.current = null;
    shortCodeRef.current?.focus();
  }, [addFormReady, addValueOnRef, type.id]);

  // A row action that held focus, kept so that if a refetch drops its row — a colleague deleted it —
  // focus is handed to the same action on the neighbouring row rather than falling to `<body>`
  // (ADR-0135). A blur to another element ends it; a blur to nothing is how a removal looks.
  const focusedRow = useRef<RemovedRow | null>(null);
  useLayoutEffect(() => {
    const held = focusedRow.current;
    if (held === null) return;
    if (rows.some((row) => row.id === held.id)) {
      focusedRow.current = { ...held, order: rows.map((row) => row.id) };
      return;
    }
    focusedRow.current = null;
    const active = document.activeElement;
    if (active === null || active === document.body) {
      focusAfterRemoval(held, paneRef.current ?? document);
    }
  }, [rows]);

  const shut = !gate.writable;
  const guard = (): boolean => busy || shut;
  const shortCodes = rows.map((row) => row.shortCode);
  const valueCount = rows.length;
  const countText = values.isSuccess
    ? `${String(valueCount)} ${valueCount === 1 ? 'value' : 'values'}`
    : null;

  const run = async (action: string, work: () => Promise<void>): Promise<void> => {
    if (guard()) return;
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (cause) {
      setFailure(codeErrorText(action, cause, type.name));
    } finally {
      setBusy(false);
    }
  };

  const move = (value: CodeValueSummary, delta: -1 | 1): Promise<void> =>
    run(`move ${value.shortCode}`, async () => {
      const moved = await actions.moveValue(rows, type.id, value.id, delta);
      if (!moved) return;
      // Asked for only once the write has landed, so a refused or no-op move leaves nothing armed to
      // steal focus on some later, unrelated change of the list.
      refocus.current = `${value.id}:${delta === -1 ? 'up' : 'down'}`;
      const place = rows.findIndex((row) => row.id === value.id) + delta + 1;
      announce(`${value.shortCode} moved to position ${String(place)} of ${String(rows.length)}.`);
    });

  const buildColumns = (): Column<CodeValueSummary>[] => {
    const order = rows.map((row) => row.id);
    const last = rows.length - 1;
    const list: Column<CodeValueSummary>[] = [
      { header: 'Short code', cell: (value) => value.shortCode, wrap: 'anywhere' },
      {
        header: 'Description',
        cell: (value) => value.description ?? '—',
        width: 'bounded',
      },
      {
        header: 'Activities',
        cell: (value) => String(usage.byValue.get(value.id) ?? 0),
        width: 'fit',
        sample: '120',
      },
    ];
    if (!gate.roleDenied) {
      list.push({
        header: 'Actions',
        srHeader: true,
        width: 'fit',
        cell: (value) => {
          const index = order.indexOf(value.id);
          return (
            <div className="flex items-center justify-end gap-1">
              <RowActionButton
                label={`Edit ${value.shortCode}`}
                action={`${value.id}:edit`}
                icon={<Pencil aria-hidden="true" className="size-4" />}
                shut={shut}
                describedBy={reasonId}
                onPress={() => {
                  if (!guard())
                    onEditValue(
                      value,
                      shortCodes.filter((c) => c !== value.shortCode),
                    );
                }}
              />
              <RowActionButton
                label={`Move ${value.shortCode} up`}
                action={`${value.id}:up`}
                icon={<ArrowUp aria-hidden="true" className="size-4" />}
                shut={shut || index === 0}
                describedBy={reasonId}
                endReason={index === 0 ? `${value.shortCode} is already first.` : undefined}
                onPress={() => {
                  if (!guard() && index > 0) void move(value, -1);
                }}
              />
              <RowActionButton
                label={`Move ${value.shortCode} down`}
                action={`${value.id}:down`}
                icon={<ArrowDown aria-hidden="true" className="size-4" />}
                shut={shut || index === last}
                describedBy={reasonId}
                endReason={index === last ? `${value.shortCode} is already last.` : undefined}
                onPress={() => {
                  if (!guard() && index < last) void move(value, 1);
                }}
              />
              <RowActionButton
                label={`Delete ${value.shortCode}`}
                action={`${value.id}:delete`}
                icon={<Trash2 aria-hidden="true" className="size-4" />}
                shut={shut}
                describedBy={reasonId}
                onPress={() => {
                  if (!guard()) onDeleteValue(value, order);
                }}
              />
            </div>
          );
        },
      });
    }
    return list;
  };
  const columns = buildColumns();

  const table = values.isSuccess && rows.length > WINDOW_ABOVE;
  const tableProps = {
    caption: `${type.name} values`,
    columns,
    query: values,
    getRowKey: (value: CodeValueSummary) => value.id,
    loadingLabel: `Loading ${type.name}’s values…`,
    errorLabel: `${type.name}’s values could not be loaded.`,
    empty: <p>{`${type.name} has no values yet.${gate.roleDenied ? '' : ' Add one below.'}`}</p>,
  };

  return (
    <section
      ref={paneRef}
      aria-labelledby={headingId}
      // `relative`: the rows carry `sr-only` spans, which are `position: absolute`. With no positioned
      // ancestor below the dialog they escape the tab panel's scroller and stretch the dialog's own
      // scroll height, so the dialog scrolls under its panes (measured: 1,497 px against 536).
      className="relative flex flex-col gap-4 p-4"
      onFocusCapture={(event) => {
        const marker = event.target.getAttribute('data-row-action');
        const [id, verb] = marker?.split(':') ?? [];
        if (id !== undefined && verb !== undefined) {
          focusedRow.current = { id, verb, order: rows.map((row) => row.id) };
        }
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget !== null) focusedRow.current = null;
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold break-words">
          {countText === null ? type.name : `${type.name} · ${countText}`}
        </h3>
        {gate.roleDenied ? null : (
          <div className="flex flex-wrap items-center gap-1">
            <PaneButton shut={shut} reasonId={reasonId} onPress={onRenameType}>
              Rename…
            </PaneButton>
            <PaneButton
              shut={shut || position.index === 0}
              reasonId={reasonId}
              endReason={position.index === 0 ? `${type.name} is already first.` : undefined}
              onPress={() => onMoveType(-1)}
            >
              Move up
            </PaneButton>
            <PaneButton
              shut={shut || position.index === position.count - 1}
              reasonId={reasonId}
              endReason={
                position.index === position.count - 1 ? `${type.name} is already last.` : undefined
              }
              onPress={() => onMoveType(1)}
            >
              Move down
            </PaneButton>
            <PaneButton shut={shut} reasonId={reasonId} onPress={onDeleteType}>
              Delete…
            </PaneButton>
          </div>
        )}
      </div>
      {/* One parent whichever way the table goes, so adding the 101st value does not remount it and
          drop the focus on the row the reader was using. A windowed table needs a bounded scroller to
          window against (ADR-0165), so it gets a fixed band; a short list sits in the pane's own flow
          and the pane scrolls. */}
      <div className={table ? 'flex h-80 flex-col' : undefined}>
        {table ? (
          <DataTable {...tableProps} windowed scroll="contained" />
        ) : (
          <DataTable {...tableProps} />
        )}
      </div>
      {values.isSuccess && !gate.roleDenied ? (
        <AddValueForm
          type={type}
          shortCodes={shortCodes}
          gate={gate}
          reasonId={reasonId}
          inputRef={shortCodeRef}
          guard={guard}
          busy={busy}
          run={run}
          actions={actions}
        />
      ) : null}
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
      {gate.canRestore ? (
        <DeletedCodeValues
          orgSlug={orgSlug}
          planId={planId}
          type={type}
          actions={actions}
          gate={gate}
        />
      ) : null}
    </section>
  );
}

/** A pane-level action: shaded with a reason rather than disabled (ADR-0204), so it stays reachable. */
function PaneButton({
  shut,
  reasonId,
  endReason,
  onPress,
  children,
}: {
  shut: boolean;
  reasonId: string | undefined;
  endReason?: string | undefined;
  onPress: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const endId = useId();
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={shut || undefined}
        aria-describedby={
          [reasonId, endReason ? endId : undefined].filter(Boolean).join(' ') || undefined
        }
        onClick={() => {
          if (!shut) onPress();
        }}
      >
        {children}
      </Button>
      {endReason ? (
        <span id={endId} className="sr-only">
          {endReason}
        </span>
      ) : null}
    </>
  );
}

interface AddValueFormProps {
  type: CodeTypeSummary;
  shortCodes: readonly string[];
  gate: CodesGate;
  reasonId: string | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  guard: () => boolean;
  busy: boolean;
  run: (action: string, work: () => Promise<void>) => Promise<void>;
  actions: CodeActions;
}

/**
 * The Add value form. Its draft lives here and not in the pane, so a keystroke re-renders this form
 * alone: the table above it, up to 1,000 rows of buttons, is not touched by typing.
 */
function AddValueForm({
  type,
  shortCodes,
  gate,
  reasonId,
  inputRef,
  guard,
  busy,
  run,
  actions,
}: AddValueFormProps): React.ReactElement {
  const announce = useAnnounce();
  const [shortCode, setShortCode] = useState('');
  const [description, setDescription] = useState('');
  const [problems, setProblems] = useState<ValueProblems>(NO_PROBLEMS);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const shut = !gate.writable;

  const add = (): Promise<void> => {
    // Shut first: a field problem is not worth reporting to a reader who cannot add anyway.
    if (guard()) return Promise.resolve();
    const found = valueProblems({ shortCode, description }, shortCodes, type.name);
    if (hasValueProblem(found)) {
      setProblems(found);
      (found.shortCode !== null ? inputRef : descriptionRef).current?.focus();
      return Promise.resolve();
    }
    return run(`add ${shortCode.trim()}`, async () => {
      const created = await actions.addValue(type, { shortCode, description });
      setShortCode('');
      setDescription('');
      setProblems(NO_PROBLEMS);
      announce(`Value ${created.shortCode} added to ${type.name}.`);
      inputRef.current?.focus();
    });
  };

  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <div className="min-w-32 flex-1">
        <TextField
          ref={inputRef}
          label="Short code"
          data-new-code-value
          value={shortCode}
          onChange={(event) => {
            setProblems(NO_PROBLEMS);
            setShortCode(event.target.value);
          }}
          error={problems.shortCode ?? undefined}
          gate={{ writable: gate.writable, reason: null }}
          aria-describedby={reasonId}
        />
      </div>
      <div className="min-w-40 flex-[2]">
        <TextField
          ref={descriptionRef}
          label="Description (optional)"
          value={description}
          onChange={(event) => {
            setProblems(NO_PROBLEMS);
            setDescription(event.target.value);
          }}
          error={problems.description ?? undefined}
          gate={{ writable: gate.writable, reason: null }}
          aria-describedby={reasonId}
        />
      </div>
      <Button
        type="submit"
        // Aligned to the fields, not their labels: the labels sit above the controls.
        className="self-end"
        aria-disabled={busy || shut}
        aria-busy={busy}
        aria-describedby={reasonId}
      >
        Add value
      </Button>
    </form>
  );
}
