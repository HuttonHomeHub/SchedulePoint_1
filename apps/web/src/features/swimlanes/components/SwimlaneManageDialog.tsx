import type { SwimlaneSummary } from '@repo/types';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';

import { swimlaneNameProblem } from '../model/swimlane-names';
import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';

export interface SwimlaneManageDialogProps {
  open: boolean;
  onClose: () => void;
  /** The plan's active swimlanes in display order. */
  swimlanes: readonly SwimlaneSummary[];
  /** Activities per swimlane id; a swimlane nobody is in is absent. */
  memberCounts: ReadonlyMap<string, number>;
  actions: SwimlaneActions;
  gate: { writable: boolean; reason: string | null };
  /** Open the rename / delete-confirmation dialogs the host stacks above this one. */
  onRename: (swimlaneId: string) => void;
  onDelete: (swimlaneId: string) => void;
}

/**
 * **Swimlanes** — add, rename, reorder and delete (swimlanes M2-T9, feature-spec US-2). Every change
 * applies at once and is one undo step; there is no Save, so the dialog's only button is Close.
 *
 * The row actions are icon buttons named for their row ("Move Mechanical up") — ADR-0117 — and are
 * shaded with `aria-disabled` rather than hidden or natively disabled when the pen is not held or a
 * move has nowhere to go, so the reason stays reachable (ADR-0204).
 */
export function SwimlaneManageDialog(props: SwimlaneManageDialogProps): React.ReactElement {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Swimlanes"
      description="Changes apply at once. Each is one step you can undo."
      size="lg"
    >
      <ManageBody {...props} />
    </Dialog>
  );
}

function ManageBody({
  onClose,
  swimlanes,
  memberCounts,
  actions,
  gate,
  onRename,
  onDelete,
}: SwimlaneManageDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const reasonId = useId();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // A move re-orders the rows and React may move the focused button to do it; the control that asked
  // takes focus back once the order has changed.
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;
    listRef.current?.querySelector<HTMLElement>(`[data-row-action="${target}"]`)?.focus();
  }, [swimlanes]);

  const shut = !gate.writable;

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (busy || shut) return;
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const add = (): Promise<void> => {
    const trouble = swimlaneNameProblem(
      name,
      swimlanes.map((s) => s.name),
    );
    if (trouble !== null) {
      setProblem(trouble);
      return Promise.resolve();
    }
    return run(async () => {
      const [created] = await actions.add([name.trim()]);
      setName('');
      setProblem(null);
      announce(`Swimlane ${created?.name ?? name.trim()} added.`);
      nameRef.current?.focus();
    });
  };

  const move = (swimlane: SwimlaneSummary, delta: -1 | 1): Promise<void> =>
    run(async () => {
      refocus.current = `${swimlane.id}:${delta === -1 ? 'up' : 'down'}`;
      const moved = await actions.move(swimlanes, swimlane.id, delta);
      if (!moved) {
        refocus.current = null;
        return;
      }
      const position = swimlanes.findIndex((s) => s.id === swimlane.id) + delta + 1;
      announce(
        `${swimlane.name} moved to position ${String(position)} of ${String(swimlanes.length)}.`,
      );
    });

  return (
    <div className="flex flex-col gap-4">
      {shut && gate.reason ? (
        <p id={reasonId} className="text-muted-foreground text-sm">
          {gate.reason}
        </p>
      ) : null}
      {swimlanes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No swimlanes yet. Add one below; every activity stays under “No swimlane” until you place
          it.
        </p>
      ) : (
        <ul
          ref={listRef}
          aria-label="Swimlanes"
          className="border-border divide-border divide-y rounded-md border"
        >
          {swimlanes.map((s, index) => {
            const count = memberCounts.get(s.id) ?? 0;
            const guard = (): boolean => busy || shut;
            return (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm" title={s.name}>
                  {s.name}
                </span>
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {count === 1 ? '1 activity' : `${String(count)} activities`}
                </span>
                <RowButton
                  label={`Rename ${s.name}`}
                  action={`${s.id}:rename`}
                  icon={<Pencil aria-hidden="true" className="size-4" />}
                  shut={shut}
                  describedBy={shut ? reasonId : undefined}
                  onPress={() => {
                    if (!guard()) onRename(s.id);
                  }}
                />
                <RowButton
                  label={`Move ${s.name} up`}
                  action={`${s.id}:up`}
                  icon={<ArrowUp aria-hidden="true" className="size-4" />}
                  shut={shut || index === 0}
                  describedBy={shut ? reasonId : undefined}
                  endReason={index === 0 ? `${s.name} is already first.` : undefined}
                  onPress={() => {
                    if (!guard() && index > 0) void move(s, -1);
                  }}
                />
                <RowButton
                  label={`Move ${s.name} down`}
                  action={`${s.id}:down`}
                  icon={<ArrowDown aria-hidden="true" className="size-4" />}
                  shut={shut || index === swimlanes.length - 1}
                  describedBy={shut ? reasonId : undefined}
                  endReason={
                    index === swimlanes.length - 1 ? `${s.name} is already last.` : undefined
                  }
                  onPress={() => {
                    if (!guard() && index < swimlanes.length - 1) void move(s, 1);
                  }}
                />
                <RowButton
                  label={`Delete ${s.name}`}
                  action={`${s.id}:delete`}
                  icon={<Trash2 aria-hidden="true" className="size-4" />}
                  shut={shut}
                  describedBy={shut ? reasonId : undefined}
                  onPress={() => {
                    if (!guard()) onDelete(s.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form
        noValidate
        className="flex items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="min-w-0 flex-1">
          <TextField
            ref={nameRef}
            label="New swimlane"
            value={name}
            onChange={(event) => {
              setProblem(null);
              setName(event.target.value);
            }}
            error={problem ?? undefined}
            gate={{ writable: gate.writable, reason: null }}
            aria-describedby={shut ? reasonId : undefined}
          />
        </div>
        <Button
          type="submit"
          className="mt-6"
          aria-disabled={busy || shut}
          aria-busy={busy}
          aria-describedby={shut ? reasonId : undefined}
        >
          Add swimlane
        </Button>
      </form>
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** One row action: an icon button named for its row, shaded rather than disabled (ADR-0204). */
function RowButton({
  label,
  action,
  icon,
  shut,
  describedBy,
  endReason,
  onPress,
}: {
  label: string;
  action: string;
  icon: React.ReactNode;
  shut: boolean;
  /** The id of the dialog's one pen sentence, when the pen is why every action is shut. */
  describedBy: string | undefined;
  /** Why a move has nowhere to go; this action's own sentence, read as a description. */
  endReason?: string | undefined;
  onPress: () => void;
}): React.ReactElement {
  const endId = useId();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-row"
        aria-label={label}
        aria-disabled={shut || undefined}
        aria-describedby={
          [describedBy, endReason ? endId : undefined].filter(Boolean).join(' ') || undefined
        }
        data-row-action={action}
        onClick={() => {
          if (!shut) onPress();
        }}
      >
        {icon}
      </Button>
      {endReason ? (
        <span id={endId} className="sr-only">
          {endReason}
        </span>
      ) : null}
    </>
  );
}
