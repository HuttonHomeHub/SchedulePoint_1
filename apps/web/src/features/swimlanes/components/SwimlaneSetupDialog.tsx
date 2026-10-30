import type { ActivitySummary, SwimlaneSummary } from '@repo/types';
import { useId, useMemo, useRef, useState } from 'react';

import { swimlaneErrorText } from '../model/swimlane-errors';
import { parseSwimlaneNames } from '../model/swimlane-names';
import { useCodeSourcePicker } from '../model/use-code-source-picker';
import type { SwimlaneActions, SwimlanePlanFacts } from '../model/use-swimlane-actions';

import { SwimlaneSourceFields, type ChosenSource } from './SwimlaneSourceFields';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextareaField } from '@/components/ui/form';
import { clampWbsLevel, wbsSwimlaneLevels, type WbsSwimlaneLevel } from '@/features/wbs';

export interface SwimlaneSetupDialogProps {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  /** The plan, at the version last read: the source write is locked on it. */
  plan: SwimlanePlanFacts;
  /** The plan's active swimlanes now, so a name that is taken is named before the server refuses it. */
  swimlanes: readonly SwimlaneSummary[];
  /** The plan's activities, which the WBS option reads its levels from; `undefined` while they load. */
  activities: readonly ActivitySummary[] | undefined;
  actions: SwimlaneActions;
  /** May the caller write, and when not, why. The entry point shades itself, but the pen can be lost while this is open. */
  gate: { writable: boolean; reason: string | null };
}

/**
 * **Set up swimlanes** (swimlanes M2-T9 and M3-T1, feature-spec US-2 and US-4; p6-activity-codes M4):
 * by hand — type the names, one per line — one per WBS group at a level, or one per value of a code.
 * **By hand is the default source**; only the WBS level and the code are preselected (the shallowest
 * level that has two groups, the first code that can be chosen), for a planner who chooses them.
 *
 * Confirming by hand does two writes in order: the swimlanes (appended in the order typed, one undo
 * step), then the plan's source. If the second fails the first stays, and the dialog says so and
 * retries **only** the source — pressing Set up again must not meet the swimlanes it just made as
 * "already exists". Confirming from the WBS, or from a code, is one write — the source with its level
 * or code — and is one undo step: there are no swimlanes to make, they are the summaries or the values.
 *
 * Working state (the text, the error, how far a confirm got) lives for one opening (ADR-0169): the
 * form is the dialog's child, which `Dialog` mounts only while open.
 */
export function SwimlaneSetupDialog(props: SwimlaneSetupDialogProps): React.ReactElement {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Set up swimlanes"
      description="Swimlanes divide the diagram into labelled bands. “No swimlane” always holds everything not yet placed in one."
    >
      <SetupForm {...props} />
    </Dialog>
  );
}

function SetupForm({
  onClose,
  orgSlug,
  plan,
  swimlanes,
  activities,
  actions,
  gate,
}: SwimlaneSetupDialogProps): React.ReactElement {
  const announce = useAnnounce();
  const errorId = useId();
  const reasonId = useId();
  const [source, setSource] = useState<ChosenSource>('MANUAL');
  const [pickedLevel, setPickedLevel] = useState<WbsSwimlaneLevel | null>(null);
  const levels = useMemo(() => wbsSwimlaneLevels(activities ?? []), [activities]);
  const level = clampWbsLevel(pickedLevel, levels);
  const code = useCodeSourcePicker({
    orgSlug,
    planId: plan.id,
    activities,
    current: null,
    chosen: source === 'ACTIVITY_CODE',
  });
  const [text, setText] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // How many were created before a failure, so a retry does not create them twice.
  const [created, setCreated] = useState(0);
  // Swimlanes that already exist on a plan still set to "none" are the same state reached another way:
  // a setup that created them and then failed to switch the plan, closed, and was opened again. There
  // is nothing left to name, only the source to write — so the form offers that and nothing else.
  const sourceOnly = created > 0 || (swimlanes.length > 0 && plan.swimlaneSource === 'NONE');
  const existing = created > 0 ? created : swimlanes.length;
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const submit = async (): Promise<void> => {
    if (pending || !gate.writable) return;
    setFailure(null);
    if (source === 'WBS') {
      if (level === null) {
        setFailure('This plan has no WBS summaries to make swimlanes from.');
        return;
      }
      setProblems([]);
      setPending(true);
      try {
        await actions.switchSource(plan, { source: 'WBS', level, codeTypeId: null });
        announce(`Swimlanes set up: one per WBS group at level ${String(level)}.`);
        onClose();
      } catch (error) {
        setFailure(swimlaneErrorText('set up swimlanes', error));
      } finally {
        setPending(false);
      }
      return;
    }
    if (source === 'ACTIVITY_CODE') {
      const chosen = code.choices?.find((c) => c.id === code.typeId);
      if (chosen === undefined) {
        setFailure(code.cardReason ?? 'Choose a code to make swimlanes from.');
        return;
      }
      if (chosen.reason !== null) {
        setFailure(chosen.reason);
        return;
      }
      setProblems([]);
      setPending(true);
      try {
        await actions.switchSource(plan, {
          source: 'ACTIVITY_CODE',
          level: null,
          codeTypeId: chosen.id,
          codeTypeName: chosen.name,
        });
        announce(`Swimlanes set up: one per value of ${chosen.name}.`);
        onClose();
      } catch (error) {
        setFailure(swimlaneErrorText('set up swimlanes', error));
      } finally {
        setPending(false);
      }
      return;
    }
    const parsed = parseSwimlaneNames(
      text,
      swimlanes.map((s) => s.name),
    );
    if (!sourceOnly) {
      if (parsed.names.length === 0) {
        setProblems(['Enter at least one swimlane name.']);
        fieldRef.current?.focus();
        return;
      }
      if (parsed.problems.length > 0) {
        setProblems(parsed.problems);
        fieldRef.current?.focus();
        return;
      }
    }
    setProblems([]);
    setPending(true);
    // Read once: state set below is not visible to this call, and the failure sentence needs the count.
    let made = existing;
    try {
      if (!sourceOnly) {
        made = (await actions.add(parsed.names)).length;
        setCreated(made);
      }
      // A hand-made plan that lost every swimlane is already on the right source; nothing to write.
      if (plan.swimlaneSource !== 'MANUAL') await actions.setManualSource(plan);
      announce(`${String(made)} ${made === 1 ? 'swimlane' : 'swimlanes'} set up.`);
      onClose();
    } catch (error) {
      setFailure(
        made > 0
          ? `The swimlanes exist, but the plan could not be switched to use them. ${swimlaneErrorText('finish setup', error)} Press Finish setup to try again.`
          : swimlaneErrorText('set up swimlanes', error),
      );
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
      {/* Once the swimlanes of a hand-made setup exist the choice is made: a retry finishes that one. */}
      {created === 0 ? (
        <SwimlaneSourceFields
          source={source}
          onSource={(next) => {
            // A problem with the names belongs to the by-hand form; it must not follow the planner to the WBS.
            setProblems([]);
            setSource(next);
          }}
          level={level}
          onLevel={setPickedLevel}
          levels={levels}
          loaded={activities !== undefined}
          code={code}
        />
      ) : null}
      {source === 'MANUAL' ? (
        <>
          {sourceOnly ? (
            <p className="text-muted-foreground text-sm">
              {`${existing === 1 ? '1 swimlane is' : `${String(existing)} swimlanes are`} already made. Finish setup to switch this plan to use them.`}
            </p>
          ) : null}
          <TextareaField
            ref={fieldRef}
            label="Swimlane names, one per line"
            rows={6}
            value={text}
            readOnly={sourceOnly}
            onChange={(event) => {
              setProblems([]);
              setText(event.target.value);
            }}
            // The problems are one paragraph below, linked here; the field's own `error` slot takes one string.
            aria-describedby={problems.length > 0 ? errorId : undefined}
            aria-invalid={problems.length > 0 ? true : undefined}
            hint="They stack top to bottom in this order, above “No swimlane”."
            gate={{ writable: gate.writable, reason: gate.reason }}
          />
        </>
      ) : (
        // By hand, the pen's reason is on the names field; there is no field to carry it from the WBS or a code.
        !gate.writable &&
        gate.reason !== null && (
          <p id={reasonId} className="text-muted-foreground text-sm">
            {gate.reason}
          </p>
        )
      )}
      {problems.length > 0 ? (
        <ul id={errorId} role="alert" className="text-destructive-text list-disc pl-5 text-sm">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {failure !== null ? (
        <p role="alert" className="text-destructive-text text-sm">
          {failure}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {/* `aria-disabled` and a guard, not native `disabled`: the button flips under the user's own
            focus when the request starts, and a natively disabled one would blur to <body>. */}
        <Button
          type="submit"
          aria-disabled={pending || !gate.writable}
          aria-busy={pending}
          aria-describedby={source !== 'MANUAL' && !gate.writable ? reasonId : undefined}
          className="aria-busy:pointer-events-none"
        >
          {pending
            ? 'Setting up…'
            : sourceOnly && source === 'MANUAL'
              ? 'Finish setup'
              : 'Set up swimlanes'}
        </Button>
      </div>
    </form>
  );
}
