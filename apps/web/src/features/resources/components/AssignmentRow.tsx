import {
  RESOURCE_CURVE_TYPES,
  type DurationType,
  type ResourceAssignmentSummary,
  type ResourceCurveType,
  type ResourceSummary,
} from '@repo/types';
import { useId, useState } from 'react';

import { useDeleteAssignment, useUpdateAssignment } from '../api/use-resources';
import {
  assignmentLagHelp,
  assignmentLagLabel,
  formatAssignmentLagRead,
  parseAssignmentLag,
  seedAssignmentLag,
} from '../model/assignment-lag-field';
import {
  formatDurationDays,
  previewDerivedDuration,
  type DurationDerivationPreview,
} from '../schemas/duration-triad';
import {
  RESOURCE_CURVE_LABELS,
  RESOURCE_KIND_LABELS,
  isMaterialResource,
  validateActualUnits,
  validateBudgetedUnits,
  validateMoneyMajor,
  validateUnitsPerHour,
} from '../schemas/resource-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DURATION_TYPES_ENABLED, EARNED_VALUE_ENABLED } from '@/config/env';
import { minorToMajorInput } from '@/lib/format-money';

/** A MATERIAL resource may never drive an activity's dates (ADR-0039). */
export const MATERIAL_DRIVING_HINT = 'A material resource can’t drive an activity’s dates.';
/**
 * What the driving flag means for a schedulable (LABOUR/EQUIPMENT) resource — a
 * standing explanation so a planner isn't left guessing, and so this "driving" is
 * not confused with the TSLD's driving *dependency* (a different concept, ADR-0039).
 */
export const DRIVING_HINT =
  'For a resource-dependent activity, the driving resource’s calendar sets its schedule. Only one resource can drive — choosing this un-drives the current one.';

/**
 * A one-line preview of the duration a units/rate edit will derive (ADR-0040), or its N20 block.
 * Carries an `id` so the editing field can reference it via `aria-describedby`. The **blocked** (N20)
 * message follows the same per-field convention as the units/rate validation errors — no `role="alert"`;
 * the input's `aria-invalid` + `aria-describedby` convey it (matching `TextField`). The **derived**
 * preview appears/updates on typing with no focus change, so it is a polite `role="status"` so a
 * screen-reader user hears it without moving focus.
 */
function DerivedDurationNote({
  id,
  preview,
}: {
  id: string;
  preview: DurationDerivationPreview | null;
}): React.ReactElement | null {
  if (!preview) return null;
  if (preview.kind === 'blocked') {
    return (
      <p id={id} className="text-destructive-text text-sm">
        The rate must be greater than zero to drive this activity’s duration.
      </p>
    );
  }
  return (
    <p id={id} role="status" className="text-muted-foreground text-sm">
      Duration becomes {formatDurationDays(preview.durationMinutes)} (Recalculate to apply).
    </p>
  );
}

/**
 * Seed a MAJOR-unit money text field from a stored minor-units value: blank when unset, else the major
 * amount as a string. Reuses {@link minorToMajorInput} (the shared minor→major conversion) so this
 * inline editor and the RHF dialogs divide by the same minor-units factor.
 */
function seedMoney(minorUnits: number | null): string {
  const major = minorToMajorInput(minorUnits);
  return major === undefined ? '' : String(major);
}

/**
 * The assignment's **cost & actuals** editor (EV4b, ADR-0042), shown behind `VITE_EARNED_VALUE` on a
 * writable row: a budgeted-cost override (blank = derive from budgeted units × the resource rate at EV
 * read time), an actual cost, and actual units of work done — the inputs the Earned-Value read consumes.
 * Money is entered in MAJOR units (e.g. dollars) and stored in minor units. One grouped Save persists
 * all three at once (the fields are a logical set); values seed from the row so an untouched Save
 * round-trips them exactly. It carries no `editedField`, so it never triggers a triad recompute.
 */
function AssignmentCostFields({
  orgSlug,
  planId,
  activityId,
  assignment,
  name,
}: {
  orgSlug: string;
  /** The owning plan, so a cost save refreshes the resource histogram (ADR-0044 §3). */
  planId: string | undefined;
  activityId: string;
  assignment: ResourceAssignmentSummary;
  name: string;
}): React.ReactElement {
  const update = useUpdateAssignment(orgSlug, planId);
  const announce = useAnnounce();
  const budgetedId = useId();
  const budgetedErrorId = useId();
  const actualCostId = useId();
  const actualCostErrorId = useId();
  const actualUnitsId = useId();
  const actualUnitsErrorId = useId();

  const seededBudgeted = seedMoney(assignment.budgetedCost);
  const seededActualCost = seedMoney(assignment.actualCost);
  const seededActualUnits = String(assignment.actualUnits);
  const [budgetedCost, setBudgetedCost] = useState(seededBudgeted);
  const [actualCost, setActualCost] = useState(seededActualCost);
  const [actualUnits, setActualUnits] = useState(seededActualUnits);

  const budgetedValidation = validateMoneyMajor(budgetedCost);
  const actualCostValidation = validateMoneyMajor(actualCost);
  const actualUnitsValidation = validateActualUnits(actualUnits);
  const budgetedError = 'error' in budgetedValidation ? budgetedValidation.error : undefined;
  const actualCostError = 'error' in actualCostValidation ? actualCostValidation.error : undefined;
  const actualUnitsError =
    'error' in actualUnitsValidation ? actualUnitsValidation.error : undefined;
  const hasError = Boolean(budgetedError || actualCostError || actualUnitsError);
  const changed =
    budgetedCost !== seededBudgeted ||
    actualCost !== seededActualCost ||
    actualUnits !== seededActualUnits;

  const save = (): void => {
    if (hasError || !changed) return;
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: assignment.budgetedUnits,
        isDriving: assignment.isDriving,
        // A blank budgeted-cost clears the override (→ null, derive from units × rate); a blank actual
        // cost/units means none (0). All three round-trip a seeded value untouched.
        budgetedCost: (budgetedValidation as { value: number | null }).value,
        actualCost: (actualCostValidation as { value: number | null }).value ?? 0,
        actualUnits: (actualUnitsValidation as { value: number }).value,
      },
      { onSuccess: () => announce(`Cost for “${name}” saved.`) },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={budgetedId}>Budgeted cost</Label>
          <Input
            id={budgetedId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={budgetedCost}
            onChange={(event) => setBudgetedCost(event.target.value)}
            aria-invalid={budgetedError ? true : undefined}
            aria-describedby={budgetedError ? budgetedErrorId : undefined}
            className="w-32"
          />
          {budgetedError ? (
            <p id={budgetedErrorId} className="text-destructive-text text-sm">
              {budgetedError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={actualCostId}>Actual cost</Label>
          <Input
            id={actualCostId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={actualCost}
            onChange={(event) => setActualCost(event.target.value)}
            aria-invalid={actualCostError ? true : undefined}
            aria-describedby={actualCostError ? actualCostErrorId : undefined}
            className="w-32"
          />
          {actualCostError ? (
            <p id={actualCostErrorId} className="text-destructive-text text-sm">
              {actualCostError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={actualUnitsId}>Actual units</Label>
          <Input
            id={actualUnitsId}
            type="number"
            min={0}
            step="any"
            value={actualUnits}
            onChange={(event) => setActualUnits(event.target.value)}
            aria-invalid={actualUnitsError ? true : undefined}
            aria-describedby={actualUnitsError ? actualUnitsErrorId : undefined}
            className="w-28"
          />
          {actualUnitsError ? (
            <p id={actualUnitsErrorId} className="text-destructive-text text-sm">
              {actualUnitsError}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Save cost for ${name}`}
          disabled={!changed || hasError || update.isPending}
          aria-busy={update.isPending}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/**
 * One assignment row: a budgeted-units edit, a units/time (rate) edit for the driving assignment
 * (behind `VITE_DURATION_TYPES`), a driving toggle (disabled for MATERIAL), and unassign. When the
 * duration-types surface is on, a units/rate edit on the driving assignment carries its `editedField`
 * so the server recomputes the triad (ADR-0040), and — for a units-driven `durationType` — a live note
 * previews the duration the edit will derive.
 */
export function AssignmentRow({
  orgSlug,
  planId,
  activityId,
  assignment,
  resource,
  durationType,
  showCurve,
  showLag,
  hoursPerDay,
  canWrite,
  canReadCost = true,
  onRemoved,
}: {
  orgSlug: string;
  /** The owning plan, so units/driving/curve/unassign edits refresh the resource histogram (ADR-0044 §3). */
  planId: string | undefined;
  activityId: string;
  assignment: ResourceAssignmentSummary;
  resource: ResourceSummary | undefined;
  /** The owning activity's duration type, for the derived-duration preview (ADR-0040). */
  durationType: DurationType | undefined;
  /** Whether the loading-curve control is applicable (false for a zero-span milestone, TECH_DEBT #44b). */
  showCurve: boolean;
  /** Whether the join-lag control is applicable — the flag, and not a zero-span milestone (ADR-0071 M4). */
  showLag: boolean;
  /** Working hours per day on the activity's SAVED calendar — see {@link ActivityResourcesPanel}. */
  hoursPerDay?: number;
  canWrite: boolean;
  /** May this member see cost figures (see {@link ActivityResourcesPanel}). Defaults true. */
  canReadCost?: boolean;
  /** Called after a successful unassign so the parent can restore focus (the row unmounts). */
  onRemoved: () => void;
}): React.ReactElement {
  const update = useUpdateAssignment(orgSlug, planId);
  const remove = useDeleteAssignment(orgSlug, planId);
  const announce = useAnnounce();
  const unitsId = useId();
  const unitsErrorId = useId();
  const unitsNoteId = useId();
  const rateId = useId();
  const rateErrorId = useId();
  const rateNoteId = useId();
  const curveId = useId();
  const lagId = useId();
  const lagErrorId = useId();
  const lagHelpId = useId();
  // Seeded from the row's persisted value. The parent keys this component by the
  // assignment id (not its version), so a save/driving-toggle refetch keeps the row
  // mounted — focus is preserved — while the persisted-value diff below drives Save.
  const [units, setUnits] = useState(String(assignment.budgetedUnits));
  const [rate, setRate] = useState(
    assignment.unitsPerHour === null ? '' : String(assignment.unitsPerHour),
  );
  // Seeded from the persisted lag in the grammar the field accepts back, so what is shown is always
  // something that can be handed to the field again (ADR-0071 M4).
  const lagSeeded = seedAssignmentLag(assignment.lagMinutes, hoursPerDay);
  const [lagText, setLagText] = useState(lagSeeded);

  const isMaterial = isMaterialResource(resource);
  const name = resource?.name ?? 'Unknown resource';
  const kindLabel = resource ? RESOURCE_KIND_LABELS[resource.kind] : '—';
  const unitsChanged = units !== String(assignment.budgetedUnits);
  const unitsValidation = validateBudgetedUnits(units);
  const unitsError = 'error' in unitsValidation ? unitsValidation.error : undefined;

  // The units/rate triad (ADR-0040) is meaningful only on the DRIVING assignment, and only behind the
  // flag. A units edit recomputes the dependent (per the activity's durationType) only when a rate is
  // already set — otherwise it is a plain store, the pre-ADR-0040 behaviour.
  const triadOn = DURATION_TYPES_ENABLED && assignment.isDriving;
  const hasRate = assignment.unitsPerHour !== null;
  const rateSeeded = assignment.unitsPerHour === null ? '' : String(assignment.unitsPerHour);
  const rateChanged = rate !== rateSeeded;
  const rateValidation = validateUnitsPerHour(rate);
  const rateError = 'error' in rateValidation ? rateValidation.error : undefined;

  // Live previews of the duration a units-driven type will derive. Only one of these is ever non-null
  // (a given durationType derives on exactly one of the two edits); the other returns null and renders
  // nothing. The units preview needs a rate already set to have something to divide.
  const unitsPreview =
    triadOn && durationType && !unitsError && hasRate
      ? previewDerivedDuration(durationType, 'UNITS', {
          budgetedUnits: (unitsValidation as { value: number }).value,
          unitsPerHour: assignment.unitsPerHour as number,
        })
      : null;
  const ratePreview =
    triadOn && durationType && !rateError
      ? previewDerivedDuration(durationType, 'UNITS_PER_HOUR', {
          budgetedUnits: assignment.budgetedUnits,
          unitsPerHour: (rateValidation as { value: number }).value,
        })
      : null;

  // The note (derived preview or N20 block) shows under a field only once that field has changed.
  const showUnitsNote = unitsChanged && unitsPreview !== null;
  const showRateNote = rateChanged && !rateError && ratePreview !== null;
  // Both the validation error and the N20 "blocked" note are invalid states for the field, and both
  // must be linked via aria-describedby so AT reaches the reason (WCAG 4.1.3 / label-in-name).
  const unitsInvalid = Boolean(unitsError) || unitsPreview?.kind === 'blocked';
  const rateInvalid = Boolean(rateError) || ratePreview?.kind === 'blocked';
  const unitsDescribedBy =
    [unitsError ? unitsErrorId : null, showUnitsNote ? unitsNoteId : null]
      .filter(Boolean)
      .join(' ') || undefined;
  const rateDescribedBy =
    [rateError ? rateErrorId : null, showRateNote ? rateNoteId : null].filter(Boolean).join(' ') ||
    undefined;

  const saveUnits = (): void => {
    if ('error' in unitsValidation) {
      announce(`Budgeted units for “${name}” not saved: ${unitsValidation.error}`);
      return;
    }
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: unitsValidation.value,
        isDriving: assignment.isDriving,
        // Name the edited field only when a recompute can actually happen — a driving assignment that
        // already carries a rate. Otherwise this is a plain store (byte-identical to before ADR-0040).
        ...(triadOn && hasRate ? { editedField: 'UNITS' as const } : {}),
      },
      { onSuccess: () => announce(`Budgeted units for “${name}” saved.`) },
    );
  };

  const saveRate = (): void => {
    if ('error' in rateValidation) {
      announce(`Rate for “${name}” not saved: ${rateValidation.error}`);
      return;
    }
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: assignment.budgetedUnits,
        unitsPerHour: rateValidation.value,
        isDriving: assignment.isDriving,
        editedField: 'UNITS_PER_HOUR',
      },
      { onSuccess: () => announce(`Rate for “${name}” saved.`) },
    );
  };

  const toggleDriving = (next: boolean): void => {
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: assignment.budgetedUnits,
        isDriving: next,
      },
      {
        onSuccess: () =>
          // Setting a driver un-drives whichever assignment previously held it (server-side
          // move); call that out so the other row's silent flip has an explanation.
          announce(
            next
              ? `“${name}” is now the driving resource; any previous driver no longer drives.`
              : `“${name}” no longer drives.`,
          ),
      },
    );
  };

  // Resource loading curve (M7 rung 5, ADR-0044 §3): a plain enum save (like the driving toggle),
  // preserving the other fields; it never triggers a triad recompute (no editedField).
  const changeCurve = (next: ResourceCurveType): void => {
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: assignment.budgetedUnits,
        isDriving: assignment.isDriving,
        curveType: next,
      },
      {
        onSuccess: () =>
          announce(`Loading curve for “${name}” set to ${RESOURCE_CURVE_LABELS[next]}.`),
      },
    );
  };

  // The join lag (ADR-0071 §1): a plain store like the curve, but text-parsed, so it carries its own
  // Save rather than writing on every keystroke. No `editedField` — a lag is not a triad term and
  // must never trigger a duration recompute.
  const lagParsed = parseAssignmentLag(lagText, hoursPerDay);
  const lagChanged = lagText !== lagSeeded;
  const lagError = lagChanged && !lagParsed.ok ? lagParsed.message : undefined;

  const saveLag = (): void => {
    if (!lagParsed.ok) {
      announce(`Join delay for “${name}” not saved: ${lagParsed.message}`);
      return;
    }
    update.mutate(
      {
        assignmentId: assignment.id,
        activityId,
        version: assignment.version,
        budgetedUnits: assignment.budgetedUnits,
        isDriving: assignment.isDriving,
        lagMinutes: lagParsed.minutes,
      },
      {
        onSuccess: () =>
          announce(
            lagParsed.minutes === 0
              ? `“${name}” now joins with the activity.`
              : `“${name}” now joins after ${seedAssignmentLag(lagParsed.minutes, hoursPerDay)}.`,
          ),
      },
    );
  };

  const unassign = (): void => {
    remove.mutate(
      { assignmentId: assignment.id, activityId },
      {
        onSuccess: () => {
          announce(`“${name}” unassigned.`);
          // The row is about to unmount; hand focus back to a stable target.
          onRemoved();
        },
      },
    );
  };

  return (
    <li className="border-border flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground text-sm">{kindLabel}</span>
      </div>
      {update.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {update.error.message}
        </p>
      ) : null}
      {remove.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {remove.error.message}
        </p>
      ) : null}
      {canWrite ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={unitsId}>Budgeted units</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={unitsId}
                  type="number"
                  min={0}
                  step="any"
                  value={units}
                  onChange={(event) => setUnits(event.target.value)}
                  aria-invalid={unitsInvalid ? true : undefined}
                  aria-describedby={unitsDescribedBy}
                  className="w-28"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  // Distinct accessible name — a row can show two "Save" buttons (units + rate).
                  aria-label={`Save budgeted units for ${name}`}
                  disabled={!unitsChanged || unitsInvalid || update.isPending}
                  aria-busy={update.isPending}
                  onClick={saveUnits}
                >
                  Save
                </Button>
              </div>
              {unitsError ? (
                <p id={unitsErrorId} className="text-destructive-text text-sm">
                  {unitsError}
                </p>
              ) : null}
              {unitsChanged ? (
                <DerivedDurationNote id={unitsNoteId} preview={unitsPreview} />
              ) : null}
            </div>
            {/* Units/time (rate) lives on the DRIVING assignment (ADR-0040 §7) — shown only there, and
                only behind the flag. */}
            {triadOn ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={rateId}>Units / time (rate)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={rateId}
                    type="number"
                    min={0}
                    step="any"
                    value={rate}
                    onChange={(event) => setRate(event.target.value)}
                    aria-invalid={rateInvalid ? true : undefined}
                    aria-describedby={rateDescribedBy}
                    className="w-28"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Save rate for ${name}`}
                    disabled={!rateChanged || rateInvalid || update.isPending}
                    aria-busy={update.isPending}
                    onClick={saveRate}
                  >
                    Save
                  </Button>
                </div>
                {rateError ? (
                  <p id={rateErrorId} className="text-destructive-text text-sm">
                    {rateError}
                  </p>
                ) : null}
                {rateChanged && !rateError ? (
                  <DerivedDurationNote id={rateNoteId} preview={ratePreview} />
                ) : null}
              </div>
            ) : null}
            <CheckboxField
              label="Driving resource"
              checked={assignment.isDriving}
              disabled={isMaterial || update.isPending}
              hint={isMaterial ? MATERIAL_DRIVING_HINT : DRIVING_HINT}
              onChange={(event) => toggleDriving(event.target.checked)}
            />
            {/* Loading curve (M7 rung 5, ADR-0044 §3) — shapes the resource histogram, not the dates.
                Behind the flag and hidden for a zero-span milestone (#44b); UNIFORM is the flat
                default. Saved immediately on change. */}
            {showCurve ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={curveId}>Loading curve</Label>
                <Select
                  id={curveId}
                  value={assignment.curveType}
                  disabled={update.isPending}
                  onChange={(event) => changeCurve(event.target.value as ResourceCurveType)}
                  className="w-40"
                >
                  {RESOURCE_CURVE_TYPES.map((curve) => (
                    <option key={curve} value={curve}>
                      {RESOURCE_CURVE_LABELS[curve]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            {/* The join lag (ADR-0071 §1) — how far into the activity this resource arrives. Its own
                Save, like units and rate, because the value is parsed text: writing on every
                keystroke would send `4` on the way to `4h`. */}
            {showLag ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={lagId}>{assignmentLagLabel(hoursPerDay)}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={lagId}
                    type="text"
                    inputMode="text"
                    value={lagText}
                    onChange={(event) => setLagText(event.target.value)}
                    aria-invalid={lagError ? true : undefined}
                    aria-describedby={lagError ? `${lagErrorId} ${lagHelpId}` : lagHelpId}
                    className="w-28"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Save join delay for ${name}`}
                    disabled={!lagChanged || lagError !== undefined || update.isPending}
                    aria-busy={update.isPending}
                    onClick={saveLag}
                  >
                    Save
                  </Button>
                </div>
                {lagError ? (
                  <p id={lagErrorId} className="text-destructive-text text-sm">
                    {lagError}
                  </p>
                ) : null}
                <p id={lagHelpId} className="text-muted-foreground text-sm">
                  {assignmentLagHelp(hoursPerDay)}
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={unassign}
              aria-label={`Unassign ${name}`}
            >
              Unassign
            </Button>
          </div>
          {/* Cost & actuals (EV4b, ADR-0042) — the EV read's per-assignment inputs, behind the
              flag and the caller's cost-read gate. */}
          {EARNED_VALUE_ENABLED && canReadCost ? (
            <AssignmentCostFields
              orgSlug={orgSlug}
              planId={planId}
              activityId={activityId}
              assignment={assignment}
              name={name}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {assignment.budgetedUnits} units
          {DURATION_TYPES_ENABLED && assignment.unitsPerHour !== null
            ? ` · ${assignment.unitsPerHour} units/time`
            : ''}
          {assignment.isDriving ? ' · driving' : ''}
          {showCurve && assignment.curveType !== 'UNIFORM'
            ? ` · ${RESOURCE_CURVE_LABELS[assignment.curveType]} curve`
            : ''}
          {/* A lag of zero appends nothing: "· 0d" reads as a setting somebody chose, when it is
              simply the default every unlagged assignment has. */}
          {showLag ? (formatAssignmentLagRead(assignment.lagMinutes, hoursPerDay) ?? '') : ''}
        </p>
      )}
    </li>
  );
}
