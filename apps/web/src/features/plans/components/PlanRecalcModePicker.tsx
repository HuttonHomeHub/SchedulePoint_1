import type { PlanSummary, ProgressRecalcMode } from '@repo/types';
import { useEffect, useId, useRef, useState } from 'react';

import { useSetPlanRecalcMode } from '../api/use-plans';
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
 * Mirrors {@link PlanCalendarPicker}'s optimistic pattern: the picked value is held locally and shown
 * straight away, so the control never snaps back to the stale cache mid-save, and the field stays busy
 * until the invalidated plan query refetches the new `version` (closing the optimistic-lock race a
 * rapid re-edit would hit). Focus is restored after the busy state clears.
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
  const selectRef = useRef<HTMLSelectElement>(null);
  const wasBusy = useRef(false);
  // The just-picked value, shown until the refetched plan confirms it (or a failure rolls it back);
  // null means "no pending choice".
  const [optimistic, setOptimistic] = useState<ProgressRecalcMode | null>(null);

  const serverValue = plan.progressRecalcMode;
  // Drop the optimistic value once the server truth catches up — the documented
  // "reset state during render" pattern (no effect, no extra committed render).
  if (optimistic !== null && optimistic === serverValue) setOptimistic(null);

  // Busy from the change until the plan cache reflects the new value (not just until the mutation
  // settles), so a second change can't send a stale version.
  const busy = setMode.isPending || (optimistic !== null && optimistic !== serverValue);
  const displayed = optimistic ?? serverValue;

  // Disabling the focused select drops focus to <body>; restore it once busy clears (WCAG 2.4.3),
  // but only if focus was actually lost (not moved away by the user).
  useEffect(() => {
    if (
      wasBusy.current &&
      !busy &&
      (document.activeElement === document.body || document.activeElement === null)
    ) {
      selectRef.current?.focus();
    }
    wasBusy.current = busy;
  }, [busy]);

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
    setOptimistic(value);
    setMode.mutate(
      { planId: plan.id, version: plan.version, progressRecalcMode: value },
      {
        onSuccess: () =>
          announce(`Recalc mode set to ${PROGRESS_RECALC_MODE_LABELS[value].label}.`),
        // Roll the visible choice back to the server value on failure (the error shows).
        onError: () => setOptimistic(null),
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
