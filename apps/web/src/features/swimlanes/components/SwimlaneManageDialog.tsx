import type { ActivitySummary, SwimlaneSummary } from '@repo/types';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { CODE_CHOICE_NOT_READY } from '../model/code-swimlane-copy';
import { swimlaneErrorText } from '../model/swimlane-errors';
import { swimlaneNameProblem } from '../model/swimlane-names';
import { useCodeSourcePicker } from '../model/use-code-source-picker';
import type { SwimlaneActions, SwimlanePlanFacts } from '../model/use-swimlane-actions';

import { SwimlaneSourceFields, type ChosenSource } from './SwimlaneSourceFields';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-layout';
import { RowActionButton } from '@/components/ui/row-action-button';
import { clampWbsLevel, wbsSwimlaneLevels, type WbsSwimlaneLevel } from '@/features/wbs';

export interface SwimlaneManageDialogProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  /** The plan, at the version last read: a change of source is locked on it. */
  plan: SwimlanePlanFacts;
  /** The plan's activities, which the WBS option reads its levels from; `undefined` while they load. */
  activities: readonly ActivitySummary[] | undefined;
  /** The plan's active hand-made swimlanes in display order (kept, but not drawn, while the WBS leads). */
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
 * **Swimlanes** — add, rename, reorder and delete (swimlanes M2-T9, feature-spec US-2), and choose where
 * they come from (M3-T1; a code, p6-activity-codes M4). Every change applies at once and is one undo
 * step; there is no Save.
 *
 * **Switching between by hand, the WBS and a code writes the plan's source and nothing else.** Lanes are
 * stored per basis, so switching back returns the hand-made swimlanes, their members and their lanes as
 * they were. While the WBS or a code leads, the hand-made list is kept but not shown or editable here:
 * its swimlanes are not drawn, and editing a list nobody can see would change a picture that returns
 * later.
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
  orgSlug,
  plan,
  activities,
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

  const run = async (action: string, work: () => Promise<void>): Promise<void> => {
    if (busy || shut) return;
    setFailure(null);
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(swimlaneErrorText(action, error));
    } finally {
      setBusy(false);
    }
  };

  // Where the swimlanes come from. The picker starts on what the plan holds, so an untouched dialog
  // reads "unchanged" and the button has nothing to do.
  const followsWbs = plan.swimlaneSource === 'WBS';
  const followsCode = plan.swimlaneSource === 'ACTIVITY_CODE';
  const current: ChosenSource = followsWbs ? 'WBS' : followsCode ? 'ACTIVITY_CODE' : 'MANUAL';
  const levels = useMemo(() => wbsSwimlaneLevels(activities ?? []), [activities]);
  const [source, setSource] = useState<ChosenSource>(current);
  const [pickedLevel, setPickedLevel] = useState<WbsSwimlaneLevel | null>(null);
  const level = clampWbsLevel(pickedLevel ?? plan.swimlaneWbsLevel, levels);
  const code = useCodeSourcePicker({
    orgSlug,
    planId: plan.id,
    activities,
    current: followsCode ? plan.swimlaneCodeTypeId : null,
    chosen: source === 'ACTIVITY_CODE',
  });
  const codeChoice = code.choices?.find((c) => c.id === code.typeId);
  const currentCodeName = code.choices?.find((c) => c.id === plan.swimlaneCodeTypeId)?.name;
  // Until the codes arrive the button has no code to name or write.
  const codesLoading = source === 'ACTIVITY_CODE' && code.loading;
  const unchanged =
    source === current &&
    (source === 'MANUAL' ||
      (source === 'WBS'
        ? level === plan.swimlaneWbsLevel
        : code.typeId === plan.swimlaneCodeTypeId));
  const unchangedId = useId();

  const switchSource = (): Promise<void> => {
    if (busy || shut || unchanged) return Promise.resolve();
    if (source === 'WBS') {
      if (level === null) return Promise.resolve();
      return run('change where swimlanes come from', async () => {
        await actions.switchSource(plan, { source: 'WBS', level, codeTypeId: null });
        announce(`Swimlanes now follow the WBS at level ${String(level)}.`);
      });
    }
    if (source === 'ACTIVITY_CODE') {
      if (codeChoice === undefined) {
        setFailure(code.cardReason ?? CODE_CHOICE_NOT_READY);
        return Promise.resolve();
      }
      if (codeChoice.reason !== null) {
        // A shaded type reaches the button when it is the one the plan already uses, or after a refetch
        // shaded the choice: say why instead of writing what the server would refuse.
        setFailure(codeChoice.reason);
        return Promise.resolve();
      }
      return run('change where swimlanes come from', async () => {
        await actions.switchSource(plan, {
          source: 'ACTIVITY_CODE',
          level: null,
          codeTypeId: codeChoice.id,
          codeTypeName: codeChoice.name,
        });
        announce(`Swimlanes now follow ${codeChoice.name}.`);
      });
    }
    return run('change where swimlanes come from', async () => {
      await actions.switchSource(plan, { source: 'MANUAL', level: null, codeTypeId: null });
      announce('Swimlanes are now made by hand.');
    });
  };

  const add = (): Promise<void> => {
    // Shut first: a name problem is not worth reporting to a reader who cannot add anyway.
    if (busy || shut) return Promise.resolve();
    const trouble = swimlaneNameProblem(
      name,
      swimlanes.map((s) => s.name),
    );
    if (trouble !== null) {
      setProblem(trouble);
      // The first invalid field takes focus, so the problem is where the caret is.
      nameRef.current?.focus();
      return Promise.resolve();
    }
    return run(`add ${name.trim()}`, async () => {
      const [created] = await actions.add([name.trim()]);
      setName('');
      setProblem(null);
      announce(`Swimlane ${created?.name ?? name.trim()} added.`);
      nameRef.current?.focus();
    });
  };

  const move = (swimlane: SwimlaneSummary, delta: -1 | 1): Promise<void> =>
    run(`move ${swimlane.name}`, async () => {
      const moved = await actions.move(swimlanes, swimlane.id, delta);
      if (!moved) return;
      // Asked for only once the write has landed, so a refused or no-op move leaves nothing armed to
      // steal focus on some later, unrelated change of the list.
      refocus.current = `${swimlane.id}:${delta === -1 ? 'up' : 'down'}`;
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
      <FormSection title="Where swimlanes come from">
        <SwimlaneSourceFields
          source={source}
          onSource={setSource}
          level={level}
          onLevel={setPickedLevel}
          levels={levels}
          loaded={activities !== undefined}
          code={code}
        />
        <p className="text-muted-foreground text-sm">
          {followsWbs || followsCode
            ? 'Choosing here changes nothing until you press the button below.'
            : 'Choosing here changes nothing until you press the button below. Adding, renaming, moving and deleting swimlanes apply as soon as you do them.'}
        </p>
        {unchanged ? (
          <p id={unchangedId} className="text-muted-foreground text-sm">
            Swimlanes already come from this.
          </p>
        ) : null}
        <div>
          {/* `aria-disabled` and a guard, never native `disabled` (ADR-0204): it flips under the
              planner's own focus while the write runs. */}
          <Button
            type="button"
            variant="outline"
            aria-disabled={busy || shut || unchanged || codesLoading}
            aria-busy={busy}
            aria-describedby={
              [shut ? reasonId : undefined, unchanged ? unchangedId : undefined]
                .filter(Boolean)
                .join(' ') || undefined
            }
            onClick={() => void switchSource()}
          >
            {busy
              ? 'Switching…'
              : source === 'WBS'
                ? 'Use WBS groups'
                : source === 'ACTIVITY_CODE'
                  ? codeChoice === undefined
                    ? 'Loading codes…'
                    : `Use ${codeChoice.name}`
                  : 'Make by hand'}
          </Button>
        </div>
      </FormSection>
      {followsWbs || followsCode ? (
        <p className="text-muted-foreground text-sm">
          {followsWbs
            ? `Swimlanes follow the WBS at level ${String(plan.swimlaneWbsLevel ?? level ?? 1)}: one for each summary, in WBS order. Rename or move a summary to change them.`
            : currentCodeName === undefined
              ? 'Loading…'
              : `Swimlanes follow ${currentCodeName}: one for each value in use, in the order set in Codes…. Set an activity’s ${currentCodeName} to move it.`}
          {swimlanes.length > 0
            ? ` The swimlanes you made by hand (${String(swimlanes.length)}) are kept, and come back if you switch back.`
            : ''}
        </p>
      ) : swimlanes.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No swimlanes yet. Add one below; every activity stays under “No swimlane” until you place
          it.
        </p>
      ) : (
        // Tailwind's Preflight strips the list marker, and VoiceOver then drops the list role; the
        // explicit role keeps the count it announces ("list, 3 items") — as HealthOffenderDisclosure's lists do.
        // eslint-disable-next-line jsx-a11y/no-redundant-roles -- the same pattern as HealthOffenderDisclosure.
        <ul
          role="list"
          ref={listRef}
          aria-label="Swimlanes"
          className="border-border divide-border divide-y rounded-md border"
        >
          {swimlanes.map((s, index) => {
            const count = memberCounts.get(s.id) ?? 0;
            const guard = (): boolean => busy || shut;
            return (
              <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm break-words">{s.name}</span>
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {count === 1 ? '1 activity' : `${String(count)} activities`}
                </span>
                <RowActionButton
                  label={`Rename ${s.name}`}
                  action={`${s.id}:rename`}
                  icon={<Pencil aria-hidden="true" className="size-4" />}
                  shut={shut}
                  describedBy={shut ? reasonId : undefined}
                  onPress={() => {
                    if (!guard()) onRename(s.id);
                  }}
                />
                <RowActionButton
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
                <RowActionButton
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
                <RowActionButton
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
      {followsWbs || followsCode ? null : (
        <form
          noValidate
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField
              ref={nameRef}
              label="New swimlane"
              data-new-swimlane
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
            aria-disabled={busy || shut}
            aria-busy={busy}
            aria-describedby={shut ? reasonId : undefined}
          >
            Add swimlane
          </Button>
        </form>
      )}
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
