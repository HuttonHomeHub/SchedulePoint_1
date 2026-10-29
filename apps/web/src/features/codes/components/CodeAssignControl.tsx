import type { ActivitySummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { useCodeTypes } from '../api/use-code-types';
import { useCodeValues } from '../api/use-code-values';
import {
  CODE_ASSIGNMENT_LIMIT,
  codeAssignedAnnouncement,
  codeAssignmentStatus,
  planCodeAssignment,
} from '../model/code-assignment-plan';
import { codeErrorText } from '../model/code-errors';
import { codeValueName } from '../model/code-names';
import { useSetActivityCodes } from '../model/use-set-activity-codes';

import { CodeValuePicker, type CodeValueChoice } from './CodeValuePicker';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form';
import { usePopoverClose } from '@/components/ui/toolbar/popover-close';
import type { Command } from '@/features/undo-redo';

/** The type select's placeholder: nothing chosen yet. */
const UNCHOSEN = '';

export const NO_CODES_FOR_ASSIGN = 'This plan has no codes yet. Add them with Codes…';
export const TOO_MANY_TO_SET = `You can set a code on up to ${CODE_ASSIGNMENT_LIMIT.toLocaleString(undefined)} activities at a time. Untick some and try again.`;

/**
 * **Set <type>…**: one value (or none) for many activities, as one write and one undo step. A code
 * `SelectField`, a value picker, a button that names the type once one is chosen ("Set Area"), and one
 * status line that says what a press will do — the `MoveToSwimlaneControl` shape, which the table's
 * ticked-rows bar uses here and the diagram's selection bars use from T4 (`m3-ui-design.md` §7.3).
 *
 * It plans through `planCodeAssignment`, so the rows that change are counted in one place and an
 * activity that already holds the value is neither sent nor made part of the undo step. It renders in
 * a bar, or inside a popover, so it neither opens nor positions itself: `onDone` is how the host learns
 * the set landed, and a popover's close is picked up from context.
 *
 * **`aria-disabled` on the button, never the native attribute**, for the reason every bar in this
 * family gives: a natively disabled button blurs to `<body>` the instant it flips, and this one flips
 * under the planner's own focus when the write starts. The status line carries the pen's reason, or
 * what a press will do, and the select, the picker and the button all point at it. The write is
 * `aria-busy` while it runs, because a 2,000-row set takes one to three seconds.
 */
export function CodeAssignControl({
  orgSlug,
  planId,
  activities,
  gate,
  record,
  onDone,
  selectRef,
  quietStatus = false,
}: {
  orgSlug: string;
  planId: string;
  /** The activities to set, as the live list holds them now (each row's `version` is what is sent). */
  activities: readonly ActivitySummary[];
  gate: { writable: boolean; reason: string | null };
  /** The workspace's history seam; absent where there is no history. */
  record?: ((command: Command) => void) | undefined;
  /** Told when a set landed; the host decides what to clear or focus. */
  onDone?: () => void;
  selectRef?: React.Ref<HTMLSelectElement>;
  /**
   * The status line stays on the page and still describes the controls, but is not a live region — for
   * a host that sits beside another bar's live region over the same selection.
   */
  quietStatus?: boolean;
}): React.ReactElement {
  const announce = useAnnounce();
  const closePopover = usePopoverClose();
  const selectId = useId();
  const valueId = useId();
  const statusId = useId();
  const types = useCodeTypes(orgSlug, planId);
  const setCodes = useSetActivityCodes(orgSlug, planId, record);
  const [typeId, setTypeId] = useState(UNCHOSEN);
  const [choice, setChoice] = useState<CodeValueChoice>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = types.data?.find((t) => t.id === typeId);
  const values = useCodeValues(orgSlug, planId, type?.id, type !== undefined);
  const valueText = useMemo(() => {
    if (typeof choice !== 'string') return null;
    const found = values.data?.find((v) => v.id === choice);
    return found === undefined ? null : codeValueName(found);
  }, [choice, values.data]);

  const plan = useMemo(
    () =>
      type === undefined || choice === undefined
        ? null
        : planCodeAssignment(activities, new Map([[type.id, choice]])),
    [activities, type, choice],
  );
  const hasTypes = (types.data?.length ?? 0) > 0;
  const blocked =
    !gate.writable ||
    busy ||
    plan === null ||
    plan.willChange === 0 ||
    plan.tooMany ||
    (typeof choice === 'string' && valueText === null);

  const set = (): void => {
    if (blocked || type === undefined || plan === null || choice === undefined) return;
    setError(null);
    setBusy(true);
    const valueNames = new Map((values.data ?? []).map((v) => [v.id, codeValueName(v)] as const));
    setCodes({ plan, typeNames: [type.name], valueNames }).then(
      () => {
        setBusy(false);
        announce(
          codeAssignedAnnouncement({
            typeName: type.name,
            valueName: valueText,
            changed: plan.willChange,
          }),
        );
        closePopover?.();
        onDone?.();
      },
      (err: unknown) => {
        setBusy(false);
        setError(codeErrorText(`set ${type.name}`, err, type.name));
      },
    );
  };

  const statusText = !gate.writable
    ? (gate.reason ?? 'You can’t change codes here.')
    : !hasTypes && !types.isPending
      ? NO_CODES_FOR_ASSIGN
      : types.isError
        ? 'Codes could not be loaded.'
        : type === undefined
          ? `Choose a code type to set on ${activities.length === 1 ? 'this activity' : 'these activities'}.`
          : choice === undefined
            ? `Choose a value for ${type.name}.`
            : plan?.tooMany
              ? TOO_MANY_TO_SET
              : plan === null
                ? ''
                : codeAssignmentStatus({
                    typeName: type.name,
                    valueName: valueText,
                    selected: activities.length,
                    plan,
                  });

  return (
    <div className="flex flex-col gap-3">
      <SelectField
        ref={selectRef}
        label="Code type"
        id={selectId}
        value={typeId}
        onChange={(event) => {
          setError(null);
          setChoice(undefined);
          setTypeId(event.target.value);
        }}
        // `reason: null` because the status line below already carries the pen's reason and the
        // select points at it: one node, N references (ADR-0083 D4).
        gate={{ writable: gate.writable && hasTypes, reason: null }}
        aria-describedby={statusId}
      >
        <option value={UNCHOSEN}>Choose a code type</option>
        {(types.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>
      <CodeValuePicker
        orgSlug={orgSlug}
        planId={planId}
        codeTypeId={type?.id}
        id={valueId}
        label="Value"
        value={choice}
        onChange={(next) => {
          setError(null);
          setChoice(next);
        }}
        eager
        gate={{ writable: gate.writable, reason: null }}
        describedBy={statusId}
        placeholder={type === undefined ? 'Choose a code type first' : 'Choose a value'}
      />
      <Button
        type="button"
        size="sm"
        aria-disabled={blocked}
        aria-busy={busy}
        aria-describedby={statusId}
        onClick={(event) => {
          if (blocked) {
            event.preventDefault();
            return;
          }
          set();
        }}
        className="self-start aria-busy:pointer-events-none"
      >
        {busy ? 'Setting…' : type === undefined ? 'Set code' : `Set ${type.name}`}
      </Button>
      <p
        id={statusId}
        {...(quietStatus ? {} : { role: 'status' })}
        className="text-muted-foreground text-sm"
      >
        {statusText}
      </p>
      {error ? (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
