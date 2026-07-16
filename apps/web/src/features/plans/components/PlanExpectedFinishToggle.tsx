import type { PlanSummary } from '@repo/types';
import { useId } from 'react';

import { useSetPlanExpectedFinish } from '../api/use-plans';
import { useOptimisticSelect } from '../hooks/use-optimistic-select';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** The two states of the expected-finish option, as `<select>` values (booleans can't be option values). */
const OPTIONS = [
  { value: 'off', on: false, label: 'Off' },
  { value: 'on', on: true, label: 'On' },
] as const;

type OptionValue = (typeof OPTIONS)[number]['value'];

/**
 * The plan's **Expected-finish scheduling** option (M4, ADR-0035 §9) — when on, the engine's forward
 * pass resizes an incomplete activity's remaining work so its early finish lands on that activity's
 * `expectedFinish` (set per-activity in the editor). Off by default (behaviour-preserving): the engine
 * ignores expected finishes. Writers (`canEdit`) pick On/Off; everyone else sees the state read-only.
 * Changing it persists immediately (a targeted PATCH); a later Recalculate applies it to the dates.
 *
 * Shares the optimistic/busy/focus-restore machinery with {@link PlanRecalcModePicker} via
 * {@link useOptimisticSelect}, keyed on the string option value so the field stays busy until the
 * refetched plan confirms the new `version` (closing the optimistic-lock race a rapid re-edit hits).
 */
export function PlanExpectedFinishToggle({
  orgSlug,
  plan,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  canEdit: boolean;
}): React.ReactElement {
  const setOption = useSetPlanExpectedFinish(orgSlug);
  const announce = useAnnounce();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  const serverValue: OptionValue = plan.useExpectedFinishDates ? 'on' : 'off';
  const { displayed, busy, selectRef, choose, rollback } = useOptimisticSelect<OptionValue>({
    serverValue,
    isPending: setOption.isPending,
  });

  if (!canEdit) {
    return (
      <dl className="flex flex-col gap-1 text-sm">
        <dt className="text-muted-foreground">Expected-finish scheduling</dt>
        <dd>{plan.useExpectedFinishDates ? 'On' : 'Off'}</dd>
      </dl>
    );
  }

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    if (busy) return;
    const value = event.target.value as OptionValue;
    const on = value === 'on';
    choose(value);
    setOption.mutate(
      { planId: plan.id, version: plan.version, useExpectedFinishDates: on },
      {
        onSuccess: () => announce(`Expected-finish scheduling turned ${on ? 'on' : 'off'}.`),
        onError: () => rollback(),
      },
    );
  };

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={selectId}>Expected-finish scheduling</Label>
      <Select
        ref={selectRef}
        id={selectId}
        value={displayed}
        disabled={busy}
        aria-busy={busy}
        aria-invalid={setOption.isError}
        aria-describedby={setOption.isError ? `${hintId} ${errorId}` : hintId}
        onChange={onChange}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p id={hintId} className="text-muted-foreground text-sm">
        {busy
          ? 'Saving…'
          : 'When on, an activity with an expected-finish date has its remaining work resized so it finishes on that date.'}
      </p>
      {setOption.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {setOption.error.message}
        </p>
      ) : null}
    </div>
  );
}
