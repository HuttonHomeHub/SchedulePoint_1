import type { PlanSummary } from '@repo/types';
import { useId } from 'react';

import { useSetPlanScheduleOption, type PlanScheduleOptionPatch } from '../api/use-plans';
import { useOptimisticSelect } from '../hooks/use-optimistic-select';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * One optimistic `<select>` control for a single plan schedule option — the shared boilerplate the
 * float/critical settings ({@link PlanScheduleSettings}) and the levelling settings
 * ({@link PlanLevellingSettings}) reuse. Each control gets its own {@link useOptimisticSelect} (keyed on
 * its server value) and its own {@link useSetPlanScheduleOption} mutation instance, so a save on one
 * control never marks the others busy or invalid, and it stays busy until the refetched plan confirms
 * the new `version` (closing the optimistic-lock race a rapid re-edit hits). `T` is the option value
 * (an enum member, or `'on'`/`'off'` for a boolean).
 */
export function PlanScheduleOptionSelect<T extends string>({
  orgSlug,
  plan,
  label,
  serverValue,
  options,
  hint,
  buildPatch,
  announceMessage,
}: {
  orgSlug: string;
  plan: PlanSummary;
  label: string;
  serverValue: T;
  options: readonly { value: T; label: string }[];
  hint: (value: T) => string;
  buildPatch: (value: T) => PlanScheduleOptionPatch;
  announceMessage: (value: T) => string;
}): React.ReactElement {
  const setOption = useSetPlanScheduleOption(orgSlug);
  const announce = useAnnounce();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  const { displayed, busy, selectRef, choose, rollback } = useOptimisticSelect<T>({
    serverValue,
    isPending: setOption.isPending,
  });

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    if (busy) return;
    const value = event.target.value as T;
    choose(value);
    setOption.mutate(
      { planId: plan.id, version: plan.version, patch: buildPatch(value) },
      {
        onSuccess: () => announce(announceMessage(value)),
        // Roll the visible choice back to the server value on failure (the error shows).
        onError: () => rollback(),
      },
    );
  };

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={selectId}>{label}</Label>
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p id={hintId} className="text-muted-foreground text-sm">
        {busy ? 'Saving…' : hint(displayed)}
      </p>
      {setOption.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {setOption.error.message}
        </p>
      ) : null}
    </div>
  );
}

/** The two states of a boolean plan option, as `<select>` values (booleans can't be option values). */
export const ON_OFF_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
] as const;

/** A boolean plan option's `<select>` value: `'on'` / `'off'`. */
export type OnOffValue = (typeof ON_OFF_OPTIONS)[number]['value'];
