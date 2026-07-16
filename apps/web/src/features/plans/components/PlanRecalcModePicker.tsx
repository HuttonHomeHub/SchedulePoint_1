import type { PlanSummary, ProgressRecalcMode } from '@repo/types';
import { useId } from 'react';

import { useSetPlanRecalcMode } from '../api/use-plans';
import { useOptimisticSelect } from '../hooks/use-optimistic-select';
import { PROGRESS_RECALC_MODE_LABELS, PROGRESS_RECALC_MODES } from '../schemas/plan-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/**
 * The plan's **progress recalc mode** (M2, ADR-0035 §1) — how in-progress activities reschedule
 * against their predecessors on the next recalculation: Retained Logic (wait for all), Progress
 * Override (ignore incomplete predecessors), or Actual Dates (drop all ties, run from the data date).
 * Writers (`canEdit`) pick from the three; everyone else sees the assigned mode read-only. Changing it
 * persists immediately (a targeted PATCH); a later Recalculate applies it to the dates.
 *
 * Shares the optimistic/busy/focus-restore machinery with {@link PlanCalendarPicker} via
 * {@link useOptimisticSelect}: the picked value is held locally and shown straight away, the field
 * stays busy until the invalidated plan query refetches the new `version` (closing the optimistic-lock
 * race a rapid re-edit would hit), and focus is restored after the busy state clears.
 */
export function PlanRecalcModePicker({
  orgSlug,
  plan,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  canEdit: boolean;
}): React.ReactElement {
  const setMode = useSetPlanRecalcMode(orgSlug);
  const announce = useAnnounce();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  const { displayed, busy, selectRef, choose, rollback } = useOptimisticSelect<ProgressRecalcMode>({
    serverValue: plan.progressRecalcMode,
    isPending: setMode.isPending,
  });

  if (!canEdit) {
    return (
      <dl className="flex flex-col gap-1 text-sm">
        <dt className="text-muted-foreground">Recalc mode</dt>
        <dd>{PROGRESS_RECALC_MODE_LABELS[plan.progressRecalcMode].label}</dd>
      </dl>
    );
  }

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    if (busy) return;
    const value = event.target.value as ProgressRecalcMode;
    choose(value);
    setMode.mutate(
      { planId: plan.id, version: plan.version, progressRecalcMode: value },
      {
        onSuccess: () =>
          announce(`Recalc mode set to ${PROGRESS_RECALC_MODE_LABELS[value].label}.`),
        // Roll the visible choice back to the server value on failure (the error shows).
        onError: () => rollback(),
      },
    );
  };

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={selectId}>Recalc mode</Label>
      <Select
        ref={selectRef}
        id={selectId}
        value={displayed}
        disabled={busy}
        aria-busy={busy}
        aria-invalid={setMode.isError}
        aria-describedby={setMode.isError ? `${hintId} ${errorId}` : hintId}
        onChange={onChange}
      >
        {PROGRESS_RECALC_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {PROGRESS_RECALC_MODE_LABELS[mode].label}
          </option>
        ))}
      </Select>
      <p id={hintId} className="text-muted-foreground text-sm">
        {busy ? 'Saving…' : PROGRESS_RECALC_MODE_LABELS[displayed].description}
      </p>
      {setMode.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {setMode.error.message}
        </p>
      ) : null}
    </div>
  );
}
