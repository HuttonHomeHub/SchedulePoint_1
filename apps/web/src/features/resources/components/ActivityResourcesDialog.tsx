import { zodResolver } from '@hookform/resolvers/zod';
import {
  RESOURCE_CURVE_TYPES,
  type DurationType,
  type ResourceAssignmentSummary,
  type ResourceCurveType,
  type ResourceSummary,
} from '@repo/types';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useResources,
  useUpdateAssignment,
} from '../api/use-resources';
import {
  formatDurationDays,
  previewDerivedDuration,
  type DurationDerivationPreview,
} from '../schemas/duration-triad';
import {
  RESOURCE_CURVE_LABELS,
  RESOURCE_KIND_LABELS,
  assignmentFormSchema,
  isMaterialResource,
  validateActualUnits,
  validateBudgetedUnits,
  validateMoneyMajor,
  validateUnitsPerHour,
  type AssignmentFormValues,
} from '../schemas/resource-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CheckboxField, FormErrorSummary, TextField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  DURATION_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
  RESOURCE_CURVES_ENABLED,
} from '@/config/env';
import { minorToMajorInput } from '@/lib/format-money';

/** A MATERIAL resource may never drive an activity's dates (ADR-0039). */
const MATERIAL_DRIVING_HINT = 'A material resource can’t drive an activity’s dates.';
/**
 * What the driving flag means for a schedulable (LABOUR/EQUIPMENT) resource — a
 * standing explanation so a planner isn't left guessing, and so this "driving" is
 * not confused with the TSLD's driving *dependency* (a different concept, ADR-0039).
 */
const DRIVING_HINT =
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
  activityId,
  assignment,
  name,
}: {
  orgSlug: string;
  activityId: string;
  assignment: ResourceAssignmentSummary;
  name: string;
}): React.ReactElement {
  const update = useUpdateAssignment(orgSlug);
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
function AssignmentRow({
  orgSlug,
  activityId,
  assignment,
  resource,
  durationType,
  canWrite,
  onRemoved,
}: {
  orgSlug: string;
  activityId: string;
  assignment: ResourceAssignmentSummary;
  resource: ResourceSummary | undefined;
  /** The owning activity's duration type, for the derived-duration preview (ADR-0040). */
  durationType: DurationType | undefined;
  canWrite: boolean;
  /** Called after a successful unassign so the parent can restore focus (the row unmounts). */
  onRemoved: () => void;
}): React.ReactElement {
  const update = useUpdateAssignment(orgSlug);
  const remove = useDeleteAssignment(orgSlug);
  const announce = useAnnounce();
  const unitsId = useId();
  const unitsErrorId = useId();
  const unitsNoteId = useId();
  const rateId = useId();
  const rateErrorId = useId();
  const rateNoteId = useId();
  const curveId = useId();
  // Seeded from the row's persisted value. The parent keys this component by the
  // assignment id (not its version), so a save/driving-toggle refetch keeps the row
  // mounted — focus is preserved — while the persisted-value diff below drives Save.
  const [units, setUnits] = useState(String(assignment.budgetedUnits));
  const [rate, setRate] = useState(
    assignment.unitsPerHour === null ? '' : String(assignment.unitsPerHour),
  );

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
                Behind the flag; UNIFORM is the flat default. Saved immediately on change. */}
            {RESOURCE_CURVES_ENABLED ? (
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
          {/* Cost & actuals (EV4b, ADR-0042) — the EV read's per-assignment inputs, behind the flag. */}
          {EARNED_VALUE_ENABLED ? (
            <AssignmentCostFields
              orgSlug={orgSlug}
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
          {RESOURCE_CURVES_ENABLED && assignment.curveType !== 'UNIFORM'
            ? ` · ${RESOURCE_CURVE_LABELS[assignment.curveType]} curve`
            : ''}
        </p>
      )}
    </li>
  );
}

/**
 * Per-activity resource assignment editor (ADR-0039), opened from the activities row
 * menu. Lists the activity's assignments (each with a budgeted-units edit, a driving
 * toggle that a MATERIAL resource can never take, and unassign) and — for writers —
 * an assign form. The driving checkbox is disabled with an explanatory hint whenever
 * the chosen/assigned resource is MATERIAL; the API's 422 `MATERIAL_CANNOT_DRIVE` is a
 * server-side backstop. Every query renders its loading / empty / error state.
 *
 * With `VITE_DURATION_TYPES` on, the driving assignment also carries a units/time (rate) — the
 * `Units/Time` term of the ADR-0040 triad — settable here and (with the activity's duration type) able
 * to derive the activity's duration; the assign form takes an optional initial rate.
 */
export function ActivityResourcesDialog({
  orgSlug,
  activityId,
  activityName,
  activityDurationType,
  open,
  onClose,
  canWrite,
}: {
  orgSlug: string;
  /** Optional so the dialog can stay mounted (toggled by `open`), preserving focus restore. */
  activityId?: string;
  activityName?: string;
  /** The owning activity's duration type (ADR-0040), for the driving assignment's derived-duration preview. */
  activityDurationType?: DurationType;
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
}): React.ReactElement {
  const resources = useResources(orgSlug);
  const assignments = useAssignments(orgSlug, activityId ?? '');
  const create = useCreateAssignment(orgSlug, activityId ?? '');
  const announce = useAnnounce();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resourceSelectId = useId();
  const curveSelectId = useId();

  const resourceById = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const assignedIds = new Set((assignments.data ?? []).map((a) => a.resourceId));
  const assignable = (resources.data ?? []).filter((r) => !assignedIds.has(r.id));

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: { resourceId: '', budgetedUnits: 0, isDriving: false, curveType: 'UNIFORM' },
  });

  useEffect(() => {
    if (open) {
      reset({ resourceId: '', budgetedUnits: 0, isDriving: false, curveType: 'UNIFORM' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, activityId]);

  const selectedResourceId = useWatch({ control, name: 'resourceId' });
  const selectedIsMaterial = isMaterialResource(resourceById.get(selectedResourceId));
  const wantsDriving = useWatch({ control, name: 'isDriving' });

  // A MATERIAL resource can never drive — force the flag off so a switch from a
  // non-material selection can't submit a stale `true`.
  useEffect(() => {
    if (selectedIsMaterial) setValue('isDriving', false);
  }, [selectedIsMaterial, setValue]);

  const onSubmit = handleSubmit((values) => {
    const isDriving = selectedIsMaterial ? false : values.isDriving;
    create.mutate(
      {
        ...values,
        isDriving,
        // The rate is meaningful only for the driver — drop a stray value entered before un-driving.
        ...(isDriving ? {} : { unitsPerHour: undefined }),
      },
      {
        onSuccess: () => {
          const name = resourceById.get(values.resourceId)?.name ?? 'Resource';
          announce(`“${name}” assigned.`);
          reset({ resourceId: '', budgetedUnits: 0, isDriving: false, curveType: 'UNIFORM' });
        },
      },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Resources"
      {...(activityName ? { description: `Assign resources to “${activityName}”.` } : {})}
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Assigned</h3>
          {assignments.isPending ? (
            <p className="text-muted-foreground text-sm">Loading assignments…</p>
          ) : assignments.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              Couldn’t load assignments. Please try again.
            </p>
          ) : (assignments.data ?? []).length === 0 ? (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No resources assigned yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {(assignments.data ?? []).map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  orgSlug={orgSlug}
                  activityId={activityId ?? ''}
                  assignment={assignment}
                  resource={resourceById.get(assignment.resourceId)}
                  durationType={activityDurationType}
                  canWrite={canWrite}
                  onRemoved={() => closeButtonRef.current?.focus()}
                />
              ))}
            </ul>
          )}
        </section>

        {canWrite ? (
          <section className="border-border border-t pt-6">
            <h3 className="mb-3 text-sm font-semibold">Assign a resource</h3>
            {resources.isError ? (
              <p role="alert" className="text-destructive-text text-sm">
                Couldn’t load the resource library. Please try again.
              </p>
            ) : resources.isPending ? (
              <p className="text-muted-foreground text-sm">Loading resources…</p>
            ) : assignable.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {(resources.data ?? []).length === 0
                  ? 'No resources in the library yet — create one on the Resources screen first.'
                  : 'Every resource in the library is already assigned to this activity.'}
              </p>
            ) : (
              <form
                noValidate
                onSubmit={(event) => void onSubmit(event)}
                className="flex flex-col gap-4"
              >
                <FormErrorSummary errors={errors} />
                {create.isError ? (
                  <p role="alert" className="text-destructive-text text-sm">
                    {create.error.message}
                  </p>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={resourceSelectId}>Resource</Label>
                  <Select
                    id={resourceSelectId}
                    aria-invalid={errors.resourceId ? true : undefined}
                    {...register('resourceId')}
                  >
                    <option value="">Choose a resource…</option>
                    {assignable.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} ({RESOURCE_KIND_LABELS[resource.kind]})
                      </option>
                    ))}
                  </Select>
                  {errors.resourceId ? (
                    <p className="text-destructive-text text-sm">{errors.resourceId.message}</p>
                  ) : null}
                </div>
                <TextField
                  label="Budgeted units"
                  type="number"
                  min={0}
                  step="any"
                  error={errors.budgetedUnits?.message}
                  {...register('budgetedUnits', { valueAsNumber: true })}
                />
                <CheckboxField
                  label="Driving resource"
                  disabled={selectedIsMaterial}
                  hint={selectedIsMaterial ? MATERIAL_DRIVING_HINT : DRIVING_HINT}
                  {...register('isDriving')}
                />
                {/* Loading curve (M7 rung 5, ADR-0044 §3) — the named P6 profile the resource histogram
                    distributes budgeted units by across the span. Behind the flag; UNIFORM is the flat
                    default. Shapes only the histogram, never the dates. */}
                {RESOURCE_CURVES_ENABLED ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={curveSelectId}>Loading curve</Label>
                    <Select id={curveSelectId} {...register('curveType')}>
                      {RESOURCE_CURVE_TYPES.map((curve) => (
                        <option key={curve} value={curve}>
                          {RESOURCE_CURVE_LABELS[curve]}
                        </option>
                      ))}
                    </Select>
                    <p className="text-muted-foreground text-sm">
                      Shapes how this resource’s units spread over the activity — the resource
                      histogram only. It doesn’t move any dates.
                    </p>
                  </div>
                ) : null}
                {/* Units/time (rate) is meaningful only for the driver (ADR-0040 §7) — shown once the
                    driving box is ticked, and only behind the flag. An initial rate is stored inert; the
                    duration derivation happens on a later units/rate edit in the row above. */}
                {DURATION_TYPES_ENABLED && wantsDriving && !selectedIsMaterial ? (
                  <TextField
                    label="Units / time (rate)"
                    type="number"
                    min={0}
                    step="any"
                    hint="Optional. Units of work per working hour, kept with the duration type so units = duration × rate; editing it later can derive the activity’s duration."
                    error={errors.unitsPerHour?.message}
                    {...register('unitsPerHour', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                  />
                ) : null}
                {/* Cost & actuals (EV4b, ADR-0042) — the EV read's inputs, behind the flag. Money in
                    MAJOR units (×100 → minor on submit); budgeted cost is an optional override of the
                    units × rate derivation. */}
                {EARNED_VALUE_ENABLED ? (
                  <>
                    <TextField
                      label="Budgeted cost (optional)"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      hint="Overrides the cost derived from budgeted units × the resource’s rate. Leave blank to derive it."
                      error={errors.budgetedCost?.message}
                      {...register('budgetedCost', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                    <TextField
                      label="Actual cost (optional)"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      hint="The cost booked against this assignment so far, in the plan’s currency."
                      error={errors.actualCost?.message}
                      {...register('actualCost', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                    <TextField
                      label="Actual units (optional)"
                      type="number"
                      min={0}
                      step="any"
                      hint="The quantity of work done so far, feeding the Units earned-value measure."
                      error={errors.actualUnits?.message}
                      {...register('actualUnits', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                  </>
                ) : null}
                <div className="flex justify-end">
                  <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
                    {create.isPending ? 'Assigning…' : 'Assign resource'}
                  </Button>
                </div>
              </form>
            )}
          </section>
        ) : null}

        <div className="flex justify-end">
          <Button ref={closeButtonRef} type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
