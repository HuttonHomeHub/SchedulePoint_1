import type { CriticalPathDefinition, PlanSummary, TotalFloatMode } from '@repo/types';
import { useId } from 'react';

import { useSetPlanScheduleOption } from '../api/use-plans';
import { useOptimisticSelect } from '../hooks/use-optimistic-select';
import {
  CRITICAL_PATH_DEFINITION_LABELS,
  CRITICAL_PATH_DEFINITIONS,
  TOTAL_FLOAT_MODE_LABELS,
  TOTAL_FLOAT_MODES,
} from '../schemas/plan-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

/** The two states of the make-open-ends-critical option, as `<select>` values (booleans can't be option values). */
const OPEN_ENDS_OPTIONS = [
  { value: 'off', on: false, label: 'Off' },
  { value: 'on', on: true, label: 'On' },
] as const;

type OpenEndsValue = (typeof OPEN_ENDS_OPTIONS)[number]['value'];

/** The partial patch this settings block sends — one or more of the three float/critical fields. */
type ScheduleOptionPatch = Partial<
  Pick<PlanSummary, 'criticalPathDefinition' | 'totalFloatMode' | 'makeOpenEndsCritical'>
>;

/**
 * The plan's **float & critical scheduling settings** (M6, ADR-0035 §17/§18/§20) — three options
 * governing how the engine's critical path is decided and how total float is measured:
 *
 * - **Critical-path definition** (`criticalPathDefinition`, ADR-0035 §17) — Total float (critical when
 *   total float is at/below the threshold, the P6 default) vs Longest path (critical along the longest
 *   chain of driving relationships to the finish).
 * - **Total-float measure** (`totalFloatMode`, ADR-0035 §18) — Finish float (late finish − early finish,
 *   the P6 default), Start float (late start − early start), or Smallest (the lesser of the two).
 * - **Open-ends criticality** (`makeOpenEndsCritical`, ADR-0035 §20) — when on, activities with no
 *   predecessor or no successor are always flagged critical. Off by default.
 *
 * Writers (`canEdit`) edit the three; everyone else sees them read-only. Each change persists immediately
 * (a targeted PATCH of just that field + `version`); it changes no dates itself — a later **Recalculate**
 * applies the new definition/measure to the computed critical path. Flagged behind
 * `VITE_FLOAT_CRITICAL_SETTINGS` (the API/engine behind it is already live; only the picker is gated).
 *
 * Each control shares the optimistic/busy/focus-restore machinery of {@link PlanRecalcModePicker} /
 * {@link PlanExpectedFinishToggle} via {@link useOptimisticSelect} + the shared
 * {@link useSetPlanScheduleOption} mutation, keyed on its own server value so it stays busy until the
 * refetched plan confirms the new `version` (closing the optimistic-lock race a rapid re-edit hits).
 */
export function PlanScheduleSettings({
  orgSlug,
  plan,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  canEdit: boolean;
}): React.ReactElement {
  if (!canEdit) {
    return (
      // The three settings are one logical group (WCAG 1.3.1) — `aria-label` names it for AT without
      // a visible heading, avoiding a lone sub-heading the sibling settings above don't have.
      <dl className="flex flex-col gap-3 text-sm" aria-label="Float & critical settings">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Critical-path definition</dt>
          <dd>{CRITICAL_PATH_DEFINITION_LABELS[plan.criticalPathDefinition].label}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Total-float measure</dt>
          <dd>{TOTAL_FLOAT_MODE_LABELS[plan.totalFloatMode].label}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Open-ends criticality</dt>
          <dd>{plan.makeOpenEndsCritical ? 'On' : 'Off'}</dd>
        </div>
      </dl>
    );
  }

  return (
    // A `fieldset` groups the three related controls for AT (WCAG 1.3.1); the `legend` is the group's
    // accessible name, visually hidden so the section keeps its flat look (the sibling settings above
    // aren't grouped visually — a section-wide heading pass is tracked separately in TECH_DEBT).
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Float & critical settings</legend>
      <OptionSelect<CriticalPathDefinition>
        orgSlug={orgSlug}
        plan={plan}
        label="Critical-path definition"
        serverValue={plan.criticalPathDefinition}
        options={CRITICAL_PATH_DEFINITIONS.map((value) => ({
          value,
          label: CRITICAL_PATH_DEFINITION_LABELS[value].label,
        }))}
        hint={(value) => CRITICAL_PATH_DEFINITION_LABELS[value].description}
        buildPatch={(value) => ({ criticalPathDefinition: value })}
        announceMessage={(value) =>
          `Critical-path definition set to ${CRITICAL_PATH_DEFINITION_LABELS[value].label}.`
        }
      />
      <OptionSelect<TotalFloatMode>
        orgSlug={orgSlug}
        plan={plan}
        label="Total-float measure"
        serverValue={plan.totalFloatMode}
        options={TOTAL_FLOAT_MODES.map((value) => ({
          value,
          label: TOTAL_FLOAT_MODE_LABELS[value].label,
        }))}
        hint={(value) => TOTAL_FLOAT_MODE_LABELS[value].description}
        buildPatch={(value) => ({ totalFloatMode: value })}
        announceMessage={(value) =>
          `Total-float measure set to ${TOTAL_FLOAT_MODE_LABELS[value].label}.`
        }
      />
      <OptionSelect<OpenEndsValue>
        orgSlug={orgSlug}
        plan={plan}
        label="Open-ends criticality"
        serverValue={plan.makeOpenEndsCritical ? 'on' : 'off'}
        options={OPEN_ENDS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        hint={() =>
          'When on, activities with no predecessor or no successor are always flagged critical.'
        }
        buildPatch={(value) => ({ makeOpenEndsCritical: value === 'on' })}
        announceMessage={(value) =>
          `Open-ends criticality turned ${value === 'on' ? 'on' : 'off'}.`
        }
      />
    </fieldset>
  );
}

/**
 * One optimistic `<select>` control for a single plan schedule option — the shared boilerplate the
 * three settings above reuse. Keeps each control's optimistic/busy/aria behaviour byte-identical to
 * {@link PlanRecalcModePicker}: its own {@link useOptimisticSelect} (keyed on its server value) and its
 * own {@link useSetPlanScheduleOption} mutation instance, so a save on one control never marks the
 * others busy or invalid. `T` is the option value (an enum member, or `'on'`/`'off'` for a boolean).
 */
function OptionSelect<T extends string>({
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
  buildPatch: (value: T) => ScheduleOptionPatch;
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
