import { zodResolver } from '@hookform/resolvers/zod';
import { RESOURCE_CURVE_TYPES, type DurationType } from '@repo/types';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  useAssignments,
  useCreateAssignment,
  useResourceSearch,
  useResources,
} from '../api/use-resources';
import {
  RESOURCE_CURVE_LABELS,
  RESOURCE_KIND_LABELS,
  assignmentFormSchema,
  isMaterialResource,
  isResourceGroup,
  type AssignmentFormValues,
} from '../schemas/resource-schemas';

import { AssignmentRow, DRIVING_HINT, MATERIAL_DRIVING_HINT } from './AssignmentRow';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { CheckboxField, FormErrorSummary, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  DURATION_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
  LIBRARY_SCOPING_ENABLED,
  RESOURCE_CURVES_ENABLED,
} from '@/config/env';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ARCHIVED_BADGE, isArchivedRow } from '@/lib/library-filters';

/**
 * The per-activity resource **surface** (ADR-0039): the activity's assignments (each with a
 * budgeted-units edit, a driving toggle that a MATERIAL resource can never take, and unassign) and —
 * for writers — an assign form. The driving checkbox is disabled with an explanatory hint whenever
 * the chosen/assigned resource is MATERIAL; the API's 422 `MATERIAL_CANNOT_DRIVE` is a server-side
 * backstop. Every query renders its loading / empty / error state.
 *
 * With `VITE_DURATION_TYPES` on, the driving assignment also carries a units/time (rate) — the
 * `Units/Time` term of the ADR-0040 triad — settable here and (with the activity's duration type) able
 * to derive the activity's duration; the assign form takes an optional initial rate.
 *
 * Extracted from `ActivityResourcesDialog` so the dialog and the activity editor's Resources tab
 * render the same surface rather than two that drift.
 */
export function ActivityResourcesPanel({
  orgSlug,
  planId,
  activityId,
  activityDurationType,
  isMilestone = false,
  canWrite,
  enabled = true,
  onRowRemoved,
}: {
  orgSlug: string;
  /** The owning plan (ADR-0044 §3) — threaded to the assignment mutations so an assign / edit /
   * unassign refreshes the plan's resource histogram. Optional so the flag-off / test callers can
   * omit it (the histogram surface is dark by default). */
  planId?: string;
  /** Optional so a host may keep the panel mounted with no subject. */
  activityId?: string;
  /** The owning activity's duration type (ADR-0040), for the driving assignment's derived-duration preview. */
  activityDurationType?: DurationType;
  /** True when the owning activity is a zero-span milestone: the loading-curve picker is hidden then,
   * since a curve has no span to distribute units over (TECH_DEBT #44b). Defaults false. */
  isMilestone?: boolean;
  canWrite: boolean;
  /**
   * Whether this surface is currently showing. False keeps the panel mounted but idle — no library or
   * assignment queries are issued — for a host that mounts it before it is visible. Default true.
   */
  enabled?: boolean;
  /**
   * Where focus goes after an unassign, since the removed row unmounts with focus inside it. The
   * dialog passes its Close button (today's behaviour); a host with no such control — a tab —
   * omits it and the panel focuses its own list region.
   */
  onRowRemoved?: () => void;
}): React.ReactElement {
  // The whole library, for LABELLING the assigned rows (and, flag off, for the picker's options).
  // Behind the flag it asks for archived rows too: an assignment to a since-archived resource keeps
  // scheduling and stays editable (ADR-0053 §4 / US-7), so its row must still show its name.
  const queriesEnabled = enabled && activityId !== undefined;
  const resources = useResources(
    orgSlug,
    LIBRARY_SCOPING_ENABLED ? { archived: 'include' } : {},
    queriesEnabled,
  );
  const assignments = useAssignments(orgSlug, activityId ?? '', queriesEnabled);
  const create = useCreateAssignment(orgSlug, activityId ?? '', planId);
  const announce = useAnnounce();
  // A removed row unmounts, taking focus with it. The host names the target when it has a better
  // one (the dialog's Close button); otherwise focus lands on the panel's own list region.
  const listRef = useRef<HTMLDivElement>(null);
  const resourceSelectId = useId();
  const resourceErrorId = `${resourceSelectId}-error`;
  const curveSelectId = useId();
  const curveHelpId = useId();
  // The loading-curve picker distributes units across the activity's span, so it is meaningless for a
  // zero-span milestone — hidden there (TECH_DEBT #44b), in both the assigned rows and the assign form.
  const showCurve = RESOURCE_CURVES_ENABLED && !isMilestone;

  const resourceById = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const assignedIds = new Set((assignments.data ?? []).map((a) => a.resourceId));
  // A GROUP is a grouping node, not a resource (ADR-0053 §3): the API answers 422
  // GROUP_NOT_ASSIGNABLE, so offering one would only ever produce an error. Deliberately NOT
  // flag-gated — a picker must never offer an option the server rejects — and byte-identical with
  // `VITE_LIBRARY_SCOPING` off, where no group can exist in the first place.
  // An ARCHIVED resource is refused for a NEW assignment (422 `RESOURCE_ARCHIVED`, ADR-0053 §4), so
  // it is likewise never offered. Flag-gated only because flag-off nothing can be archived and the
  // expression must stay byte-for-byte the one that shipped.
  const assignable = (resources.data ?? []).filter(
    (r) =>
      !assignedIds.has(r.id) &&
      !isResourceGroup(r) &&
      !(LIBRARY_SCOPING_ENABLED && isArchivedRow(r)),
  );

  // The picker's SERVER-side search (ADR-0053 §4 / US-8). Unlike the calendar pickers this panel
  // owns its own fetch, and the resource pool is org-global and potentially large — so the term is
  // debounced and pushed to the API (`?q=` over name OR code), one page at a time with an explicit
  // "Load more" for the rest. Idle unless the panel is actually showing for a writer.
  const [resourceQuery, setResourceQuery] = useState('');
  const debouncedResourceQuery = useDebouncedValue(resourceQuery);
  const search = useResourceSearch(
    orgSlug,
    { q: debouncedResourceQuery },
    LIBRARY_SCOPING_ENABLED && queriesEnabled && canWrite,
  );
  // GROUPs and already-assigned rows are dropped from the page client-side: the API has no "not a
  // group" filter, and "already assigned here" is per-activity knowledge the library cannot hold.
  // (Archived rows never arrive — the search defaults to `?archived=exclude`.)
  const searchOptions = useMemo<ComboboxOption[]>(
    () =>
      search.resources
        .filter((r) => !assignedIds.has(r.id) && !isResourceGroup(r))
        .map((r) => ({
          value: r.id,
          label: `${r.name} (${RESOURCE_KIND_LABELS[r.kind]})`,
          ...(isArchivedRow(r) ? { badge: ARCHIVED_BADGE } : {}),
        })),
    // `assignedIds` is rebuilt each render from the assignments query; depending on the query's own
    // data keeps the memo honest without a new identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search.resources, assignments.data],
  );

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
    if (enabled) {
      reset({ resourceId: '', budgetedUnits: 0, isDriving: false, curveType: 'UNIFORM' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on show/target change
  }, [enabled, activityId]);

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
    <FieldGridContainer className="flex flex-col gap-5">
      <FormSection
        title="Assigned"
        aside={
          assignments.isSuccess ? `${(assignments.data ?? []).length} on this activity` : undefined
        }
      >
        <div ref={listRef} tabIndex={-1} className="outline-none">
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
                  planId={planId}
                  activityId={activityId ?? ''}
                  assignment={assignment}
                  resource={resourceById.get(assignment.resourceId)}
                  durationType={activityDurationType}
                  showCurve={showCurve}
                  canWrite={canWrite}
                  onRemoved={() => (onRowRemoved ? onRowRemoved() : listRef.current?.focus())}
                />
              ))}
            </ul>
          )}
        </div>
      </FormSection>

      {canWrite ? (
        <FormSection
          title="Assign a resource"
          description="Units and cost drive the histogram and Earned Value; only the driving resource changes the activity’s calendar."
        >
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
                {LIBRARY_SCOPING_ENABLED ? (
                  <Combobox
                    id={resourceSelectId}
                    value={selectedResourceId}
                    onChange={(value) =>
                      setValue('resourceId', value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    query={resourceQuery}
                    onQueryChange={setResourceQuery}
                    options={searchOptions}
                    // The chosen resource may sit outside the current server page; label it from
                    // the full library so the field never blanks after a fresh search.
                    selectedLabel={resourceById.get(selectedResourceId)?.name}
                    loading={search.isFetching}
                    errored={search.isError}
                    hasMore={search.hasMore}
                    onLoadMore={search.loadMore}
                    invalid={errors.resourceId !== undefined}
                    {...(errors.resourceId ? { describedBy: resourceErrorId } : {})}
                    placeholder="Choose a resource…"
                    toggleLabel="Show resources"
                    emptyMessage="No resources match your search."
                  />
                ) : (
                  <Select
                    id={resourceSelectId}
                    aria-invalid={errors.resourceId ? true : undefined}
                    aria-describedby={errors.resourceId ? resourceErrorId : undefined}
                    {...register('resourceId')}
                  >
                    <option value="">Choose a resource…</option>
                    {assignable.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} ({RESOURCE_KIND_LABELS[resource.kind]})
                      </option>
                    ))}
                  </Select>
                )}
                {/*
                  The error is wired to the control on BOTH branches (`describedBy` /
                  `aria-describedby`): a validation message a screen-reader user never hears
                  while focused on the field fails WCAG 1.3.1 / 4.1.2 — the same idiom every
                  other picker in this epic uses.
                */}
                {errors.resourceId ? (
                  <p id={resourceErrorId} className="text-destructive-text text-sm">
                    {errors.resourceId.message}
                  </p>
                ) : null}
              </div>
              <FieldGrid>
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
                    distributes budgeted units by across the span. Behind the flag and hidden for a
                    zero-span milestone (#44b); UNIFORM is the flat default. Shapes only the
                    histogram, never the dates. */}
                {showCurve ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={curveSelectId}>Loading curve</Label>
                    <Select
                      id={curveSelectId}
                      aria-describedby={curveHelpId}
                      {...register('curveType')}
                    >
                      {RESOURCE_CURVE_TYPES.map((curve) => (
                        <option key={curve} value={curve}>
                          {RESOURCE_CURVE_LABELS[curve]}
                        </option>
                      ))}
                    </Select>
                    <p id={curveHelpId} className="text-muted-foreground text-sm">
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
                      label="Budgeted cost"
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
                      label="Actual cost"
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
                      label="Actual units"
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
              </FieldGrid>
              <div className="flex justify-end">
                <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
                  {create.isPending ? 'Assigning…' : 'Assign resource'}
                </Button>
              </div>
            </form>
          )}
        </FormSection>
      ) : null}
    </FieldGridContainer>
  );
}
