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
  assignmentLagEnabled,
  assignmentLagHelp,
  assignmentLagLabel,
  canAuthorLagDays,
  parseAssignmentLag,
} from '../model/assignment-lag-field';
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
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FieldGateProvider } from '@/components/ui/field-gate';
import { CheckboxField, FormErrorSummary, TextField } from '@/components/ui/form';
import { FieldGrid, FieldGridContainer, FormSection } from '@/components/ui/form-layout';
import { Label } from '@/components/ui/label';
import { ScopeSaveBar } from '@/components/ui/scope-save-bar';
import { Select } from '@/components/ui/select';
import {
  DURATION_TYPES_ENABLED,
  EARNED_VALUE_ENABLED,
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
  activityHoursPerDay,
  isMilestone = false,
  canWrite,
  writeReason,
  canReadCost = true,
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
  /**
   * How many working hours a *day* is worth on the activity's **saved** calendar — the factor the join
   * lag is measured in (ADR-0071 §1 / ADR-0070 §3). Deliberately the saved calendar and not a pending
   * selection: an assignment write does not carry the activity's calendar with it, so converting `2d`
   * against an unsaved choice would store minutes measured on a calendar the activity does not have.
   *
   * `undefined` is a real answer, never a default — the calendar list can be loading, absent or
   * missing the bound row, and after ADR-0068 there is no safe fallback factor. The lag field then
   * keeps hours and minutes (which need none) and refuses days, saying why.
   */
  activityHoursPerDay?: number;
  /** True when the owning activity is a zero-span milestone: the loading-curve picker is hidden then,
   * since a curve has no span to distribute units over (TECH_DEBT #44b). Defaults false. */
  isMilestone?: boolean;
  canWrite: boolean;
  /**
   * Why this member cannot assign resources, when {@link canWrite} is false. Supplying it **shows**
   * the Assign a resource section shaded with the reason (the house shade-with-a-reason rule);
   * omitting it hides the section entirely, which is what the dialog does today and what a Viewer
   * should see. The Logic panel's `manageLogicReason` is the same seam — only a host that can tell
   * role from pen apart should pass one, since a fused boolean cannot and an invented sentence is
   * worse than none (ADR-0060 M6).
   */
  writeReason?: string;
  /**
   * May this member see cost figures. Defaults **true**, which is the dialog's behaviour and today's
   * only reality (`canReadCost === canWrite`, TECH_DEBT #62). A host that derives the two separately
   * — the editor, from its cost scope — passes the real answer, so the money fields follow the same
   * gate the Cost tab does the day those role sets diverge.
   */
  canReadCost?: boolean;
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
  const resources = useResources(orgSlug, { archived: 'include' }, queriesEnabled);
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
  // The join lag delays a resource *within* the activity's span, so a zero-span milestone has nothing
  // for it to sit inside — hidden there for the same reason the loading curve is (#44b), and behind
  // its own flag (ADR-0071 M4).
  const showLag = assignmentLagEnabled() && !isMilestone;

  const resourceById = new Map((resources.data ?? []).map((r) => [r.id, r]));
  const assignedIds = new Set((assignments.data ?? []).map((a) => a.resourceId));
  // A GROUP is a grouping node, not a resource (ADR-0053 §3): the API answers 422
  // GROUP_NOT_ASSIGNABLE, so offering one would only ever produce an error. A picker must never
  // offer an option the server rejects. An ARCHIVED resource is refused for a NEW assignment (422
  // `RESOURCE_ARCHIVED`, ADR-0053 §4), so it is likewise never offered. Both exclusions were
  // written to stay byte-identical with `VITE_LIBRARY_SCOPING` off — a distinction ADR-0088 D3
  // removed with the flag.
  const assignable = (resources.data ?? []).filter(
    (r) => !assignedIds.has(r.id) && !isResourceGroup(r) && !isArchivedRow(r),
  );

  // The picker's SERVER-side search (ADR-0053 §4 / US-8). Unlike the calendar pickers this panel
  // owns its own fetch, and the resource pool is org-global and potentially large — so the term is
  // debounced and pushed to the API (`?q=` over name OR code), one page at a time with an explicit
  // "Load more" for the rest. Idle unless the panel is actually showing for a writer.
  const [resourceQuery, setResourceQuery] = useState('');
  const debouncedResourceQuery = useDebouncedValue(resourceQuery);
  // Shown to anyone who may assign, and to a member the host can explain the refusal to. Without a
  // reason it stays hidden — a shaded form with no explanation is the dead end the house rule
  // forbids, and a Viewer should not see one at all (the `ActivityLogicPanel` precedent).
  const showAssignSection = canWrite || writeReason !== undefined;
  // ONE gate object for the assign form — the fields and the Save read the same one, so they
  // cannot disagree about whether this member may assign (`docs/TECH_DEBT.md` #66).
  const assignGate = { writable: canWrite, reason: writeReason ?? null };
  const search = useResourceSearch(
    orgSlug,
    { q: debouncedResourceQuery },
    queriesEnabled && showAssignSection,
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
    setError,
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      resourceId: '',
      budgetedUnits: 0,
      isDriving: false,
      curveType: 'UNIFORM',
      lagText: '',
    },
  });

  useEffect(() => {
    if (enabled) {
      reset({
        resourceId: '',
        budgetedUnits: 0,
        isDriving: false,
        curveType: 'UNIFORM',
        lagText: '',
      });
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

  // The one factor-dependent rule the zod schema cannot hold (ADR-0070 §3): whether the typed lag
  // can be converted at all. Surfaced beside the field rather than thrown at submit, so a planner who
  // types `2d` before the calendar list lands is told which units are available right now.
  const lagText = useWatch({ control, name: 'lagText' }) ?? '';
  const lagParsed = parseAssignmentLag(lagText, activityHoursPerDay);
  const lagFactorError =
    showLag && !lagParsed.ok && errors.lagText === undefined ? lagParsed.message : undefined;

  const onSubmit = handleSubmit((values) => {
    const isDriving = selectedIsMaterial ? false : values.isDriving;
    // Refuse rather than send a silently wrong number — the same rule `lagWriteFields` follows, and
    // refusing the SAME WAY it does. `AddLinkSection` registers the failure with RHF and moves
    // focus; an earlier version of this guard only `return`ed, which left the form looking untouched:
    // nothing in `errors`, so `FormErrorSummary` (`role="alert"`) had nothing to announce, no focus
    // moved, and the Assign button stayed lit while doing nothing when pressed. A submit that
    // silently does nothing is worse than one that fails loudly.
    const lag = parseAssignmentLag(values.lagText ?? '', activityHoursPerDay);
    if (showLag && !lag.ok) {
      setError('lagText', { message: lag.message }, { shouldFocus: true });
      return;
    }
    create.mutate(
      {
        ...values,
        isDriving,
        // The rate is meaningful only for the driver — drop a stray value entered before un-driving.
        ...(isDriving ? {} : { unitsPerHour: undefined }),
        // Flag off, no lag is sent at all — the create body is byte-identical to the one that ships
        // today, which is what makes the rollback a switch rather than a revert.
        ...(showLag && lag.ok && lag.minutes > 0 ? { lagMinutes: lag.minutes } : {}),
      },
      {
        onSuccess: () => {
          const name = resourceById.get(values.resourceId)?.name ?? 'Resource';
          announce(`“${name}” assigned.`);
          reset({
            resourceId: '',
            budgetedUnits: 0,
            isDriving: false,
            curveType: 'UNIFORM',
            lagText: '',
          });
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
                  showLag={showLag}
                  {...(activityHoursPerDay === undefined
                    ? {}
                    : { hoursPerDay: activityHoursPerDay })}
                  canWrite={canWrite}
                  canReadCost={canReadCost}
                  onRemoved={() => (onRowRemoved ? onRowRemoved() : listRef.current?.focus())}
                />
              ))}
            </ul>
          )}
        </div>
      </FormSection>

      {showAssignSection ? (
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
              {/* **The fields answer to the same gate as the Save** (`docs/TECH_DEBT.md` #66,
                  ADR-0083). Only the Save was gated, so a member who cannot assign could fill in the
                  whole form and meet the refusal at the end of it. The reason is rendered once,
                  above the fields, and every `*Field` beneath it goes read-only — never native
                  `disabled`, which is #64's defect. */}
              <FieldGateProvider gate={assignGate}>
                <FormErrorSummary errors={errors} />
                {create.isError ? (
                  <p role="alert" className="text-destructive-text text-sm">
                    {create.error.message}
                  </p>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={resourceSelectId}>Resource</Label>
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
                  {/* The join lag (ADR-0071 §1) — how far into the activity this resource arrives.
                    Behind its own flag and hidden for a zero-span milestone. The grammar is
                    ADR-0070's; the factor is the activity's SAVED calendar, so `2d` here means the
                    same thing the engine will measure. */}
                  {showLag ? (
                    <TextField
                      label={assignmentLagLabel(activityHoursPerDay)}
                      type="text"
                      inputMode="text"
                      // The placeholder has to follow the same rule as the label and the help: with
                      // no factor, `0d` would be an example in the one unit the field is about to
                      // refuse — a planner typing what the field suggests would be told off for it.
                      placeholder={canAuthorLagDays(activityHoursPerDay) ? '0d' : '0h'}
                      hint={assignmentLagHelp(activityHoursPerDay)}
                      // The schema's syntax error wins when there is one; the factor error is the
                      // second rule, and only reachable once the text itself reads (see the derivation
                      // above). One `error` prop either way, so the field cannot show two messages
                      // that disagree about whether it is valid.
                      error={errors.lagText?.message ?? lagFactorError}
                      {...register('lagText')}
                    />
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
                  {/* Cost & actuals (EV4b, ADR-0042) — the EV read's inputs, behind the flag and the
                    caller's cost-read gate. Money in MAJOR units (×100 → minor on submit); budgeted
                    cost is an optional override of the units × rate derivation. */}
                  {EARNED_VALUE_ENABLED && canReadCost ? (
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
                <ScopeSaveBar
                  gate={assignGate}
                  // A create form is always submittable: what is missing is the field errors' job to
                  // say. The feedback for a successful assign is the new row in the list above, so
                  // neither the dirty nor the saved sentence has anything to add (the AddLinkSection
                  // precedent).
                  dirty
                  dirtyMessage={null}
                  savedMessage={null}
                  pending={create.isPending}
                  label="Assign resource"
                  pendingLabel="Assigning…"
                />
              </FieldGateProvider>
            </form>
          )}
        </FormSection>
      ) : null}
    </FieldGridContainer>
  );
}
