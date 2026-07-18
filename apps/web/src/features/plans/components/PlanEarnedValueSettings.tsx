import type { PlanSummary } from '@repo/types';
import { useId, useState } from 'react';

import { useSetPlanScheduleOption } from '../api/use-plans';
import { EAC_METHOD_LABELS, EAC_METHODS, validateCurrencyCode } from '../schemas/plan-schemas';

import { PlanScheduleOptionSelect } from './PlanScheduleOptionSelect';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The plan's ISO-4217 **currency** field (EV4b, ADR-0042): a short text input that persists on Save
 * (a targeted PATCH of just `currencyCode` + `version`, via the shared {@link useSetPlanScheduleOption}).
 * A blank field clears the code to `null` (inherit the org default). Validated as three ASCII letters
 * before the request; the API validates the real code list. Kept a discrete Save (not save-on-change)
 * because a free-text code is only meaningful once fully typed, unlike the adjacent `<select>`.
 */
function PlanCurrencyField({
  orgSlug,
  plan,
}: {
  orgSlug: string;
  plan: PlanSummary;
}): React.ReactElement {
  const setOption = useSetPlanScheduleOption(orgSlug);
  const announce = useAnnounce();
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const seeded = plan.currencyCode ?? '';
  const [value, setValue] = useState(seeded);
  // Re-seed when the server confirms a new code (the invalidated plan refetches) so the field never
  // shows a stale value after a save elsewhere; only when the persisted value actually changed. The
  // React-recommended "adjust state on prop change" pattern (a render-time reset keyed on the previous
  // seed) — no effect, so no cascading-render lint warning.
  const [prevSeeded, setPrevSeeded] = useState(seeded);
  if (seeded !== prevSeeded) {
    setPrevSeeded(seeded);
    setValue(seeded);
  }

  const validation = validateCurrencyCode(value);
  const localError = 'error' in validation ? validation.error : undefined;
  // "Changed" compares the normalised (uppercased / null) result against the stored code, so retyping
  // the same code in a different case isn't a spurious pending save.
  const normalised = 'value' in validation ? validation.value : undefined;
  const changed = localError === undefined && normalised !== (plan.currencyCode ?? null);

  const save = (): void => {
    if (localError !== undefined || !changed) return;
    setOption.mutate(
      { planId: plan.id, version: plan.version, patch: { currencyCode: normalised ?? null } },
      {
        onSuccess: () =>
          announce(normalised ? `Plan currency set to ${normalised}.` : 'Plan currency cleared.'),
      },
    );
  };

  const describedBy =
    [setOption.isError || localError ? errorId : null, hintId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor={inputId}>Currency</Label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={value}
          maxLength={3}
          autoComplete="off"
          spellCheck={false}
          className="w-24 uppercase"
          aria-invalid={localError || setOption.isError ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!changed || setOption.isPending}
          aria-busy={setOption.isPending}
          onClick={save}
        >
          {setOption.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <p id={hintId} className="text-muted-foreground text-sm">
        The ISO-4217 code (e.g. USD, GBP) for this plan’s cost and Earned-Value figures. Leave blank
        to inherit the organisation default.
      </p>
      {localError ? (
        <p id={errorId} className="text-destructive-text text-sm">
          {localError}
        </p>
      ) : setOption.isError ? (
        <p id={errorId} role="alert" className="text-destructive-text text-sm">
          {setOption.error.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The plan's **Earned-Value settings** (EV4b, ADR-0042) — the plan-level cost/EV options a later
 * Earned-Value read (`GET …/schedule/earned-value`) consumes:
 *
 * - **EAC method** (`eacMethod`) — how the EV read forecasts the estimate at completion: CPI (default),
 *   Remaining-at-budget, or CPI × SPI. A targeted optimistic `<select>` (the shared
 *   {@link PlanScheduleOptionSelect}).
 * - **Currency** (`currencyCode`) — the ISO-4217 code all money figures are shown in; blank inherits
 *   the org default.
 *
 * Writers (`canEdit`) edit them; everyone else sees them read-only. Each change persists immediately as
 * a targeted PATCH; it changes no dates — the Earned-Value read applies them. Flagged behind
 * `VITE_EARNED_VALUE` (the API behind it is already live; only the controls are gated).
 */
export function PlanEarnedValueSettings({
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
      // One logical group named for AT without a visible heading (WCAG 1.3.1), matching the sibling
      // levelling/float read-only views.
      <dl className="flex flex-col gap-3 text-sm" aria-label="Earned-Value settings">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">EAC method</dt>
          <dd>{EAC_METHOD_LABELS[plan.eacMethod].label}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Currency</dt>
          <dd>{plan.currencyCode ?? 'Organisation default'}</dd>
        </div>
      </dl>
    );
  }

  return (
    // A `fieldset` groups the related controls for AT (WCAG 1.3.1); the visually-hidden `legend` names
    // the group without a box, matching the sibling settings sections.
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Earned-Value settings</legend>
      <PlanScheduleOptionSelect
        orgSlug={orgSlug}
        plan={plan}
        label="EAC method"
        serverValue={plan.eacMethod}
        options={EAC_METHODS.map((method) => ({
          value: method,
          label: EAC_METHOD_LABELS[method].label,
        }))}
        hint={(value) => EAC_METHOD_LABELS[value].description}
        buildPatch={(value) => ({ eacMethod: value })}
        announceMessage={(value) => `EAC method set to ${EAC_METHOD_LABELS[value].label}.`}
      />
      <PlanCurrencyField orgSlug={orgSlug} plan={plan} />
    </fieldset>
  );
}
