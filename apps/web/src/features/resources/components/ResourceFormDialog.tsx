import { zodResolver } from '@hookform/resolvers/zod';
import {
  ASSIGNABLE_RESOURCE_KINDS,
  RESOURCE_KINDS,
  type CalendarSummary,
  type ResourceSummary,
} from '@repo/types';
import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateResource, useUpdateResource } from '../api/use-resources';
import {
  RESOURCE_KIND_LABELS,
  resourceFormSchema,
  toResourceTreeRows,
  type ResourceFormValues,
} from '../schemas/resource-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import {
  FieldGrid,
  FieldGridContainer,
  FieldGridFull,
  FormSection,
} from '@/components/ui/form-layout';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  EARNED_VALUE_ENABLED,
  LIBRARY_SCOPING_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { calendarScopeErrorMessage } from '@/lib/api/calendar-scope-errors';
import { minorToMajorInput } from '@/lib/format-money';
import { ARCHIVED_BADGE, isArchivedRow, matchesLibraryQuery } from '@/lib/library-filters';

const INHERIT_CALENDAR_LABEL = 'Plan default (inherit)';
const TOP_LEVEL_PARENT_LABEL = 'No group (top level)';

/**
 * Create-or-edit dialog for an organisation resource (ADR-0039). Name and kind are
 * required; code/description/calendar are optional. In edit mode (`resource` given) it
 * PATCHes with the row's optimistic-locking `version`. When `readOnly` (a reader
 * opening a resource) the fields are shown but not editable — every member may read a
 * resource, only Planners/Org Admins may change them.
 *
 * The org calendar library (for the calendar picker) is **supplied by the composing
 * route**, not fetched here — so the resources feature stays dependency-free of the
 * calendars feature (mirroring {@link ActivityFormDialog}). Absent it, the picker still
 * round-trips a seeded `calendarId`.
 */
export function ResourceFormDialog({
  orgSlug,
  open,
  onClose,
  resource,
  readOnly = false,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
  resources = [],
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  resource?: ResourceSummary;
  readOnly?: boolean;
  /**
   * The org's resources, for the parent-group picker's options (ADR-0053 §3, route/table-composed
   * like `calendars`). Only `GROUP` rows are offered, and only behind `VITE_LIBRARY_SCOPING`.
   */
  resources?: ResourceSummary[];
  /** The org's calendars, for the calendar picker's options (route-composed). */
  calendars?: CalendarSummary[];
  /** The calendars list is still loading (its options aren't complete yet). */
  calendarsLoading?: boolean;
  /** The calendars list failed to load — surface it rather than silently offering only "inherit". */
  calendarsError?: boolean;
}): React.ReactElement {
  const isEdit = resource !== undefined;
  const create = useCreateResource(orgSlug);
  const update = useUpdateResource(orgSlug);
  const mutation = isEdit ? update : create;
  const announce = useAnnounce();

  const calendarErrorId = useId();
  const calendarHelpId = useId();
  const kindSelectId = useId();
  const calendarSelectId = useId();
  const parentSelectId = useId();
  const parentHelpId = useId();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      kind: 'LABOUR',
      calendarId: '',
      parentId: '',
      maxUnitsPerHour: undefined,
      costPerUnit: undefined,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: resource?.name ?? '',
        code: resource?.code ?? '',
        description: resource?.description ?? '',
        kind: resource?.kind ?? 'LABOUR',
        calendarId: resource?.calendarId ?? '',
        // Always seed from the row so a stored tree position round-trips even when the picker is
        // hidden (flag off) — an edit then never silently promotes the resource to top level.
        parentId: resource?.parentId ?? '',
        // Always seed from the row so a stored capacity round-trips even when the field is hidden
        // (flag off) — an edit then never silently clears the levelling ceiling. `null` → undefined
        // (blank = uncapped).
        maxUnitsPerHour: resource?.maxUnitsPerHour ?? undefined,
        // Cost rate (EV4b): seed the MAJOR-unit value from the stored minor units so it round-trips
        // even when the field is hidden (flag off) — an edit then never clears the rate. `null` → blank.
        costPerUnit: minorToMajorInput(resource?.costPerUnit),
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, resource?.id]);

  const calendarId = useWatch({ control, name: 'calendarId' });
  // The seeded calendar isn't in the loaded list (still loading, or it failed): keep it
  // selected under an honest label so the Select never reads blank ("inherit").
  const missingCalendar = Boolean(calendarId) && !calendars.some((c) => c.id === calendarId);

  // Resource tree (ADR-0053 §3). A GROUP has no calendar, capacity or cost — those fields are
  // hidden for one rather than shown-and-rejected, and `use-resources` strips any stale value.
  const kind = useWatch({ control, name: 'kind' });
  const isGroup = LIBRARY_SCOPING_ENABLED && kind === 'GROUP';
  const parentId = useWatch({ control, name: 'parentId' });
  // The parent options are the org's GROUPs in tree order (indented), minus this resource's own
  // subtree — nesting a group inside itself is a 409 the picker should never offer. Groups are a
  // small minority of the library, so this stays a cheap client-side derivation.
  const parentOptions = useMemo(() => {
    if (!LIBRARY_SCOPING_ENABLED) return [];
    const excluded = new Set<string>();
    if (resource) {
      excluded.add(resource.id);
      // Walk down from this resource: everything under it is an illegal parent.
      let frontier = [resource.id];
      while (frontier.length > 0) {
        const next = resources
          .filter((r) => r.parentId !== null && frontier.includes(r.parentId))
          .map((r) => r.id)
          .filter((id) => !excluded.has(id));
        for (const id of next) excluded.add(id);
        frontier = next;
      }
    }
    return toResourceTreeRows(resources).filter(
      (row) => row.resource.kind === 'GROUP' && !excluded.has(row.resource.id),
    );
  }, [resources, resource]);
  // ADR-0053 §4 / US-8 — the two comboboxes' search terms. Neither is debounced: both lists are
  // already complete in memory (the calendars are route-composed, the groups come from the library
  // query that pages every row), so filtering is a client-side array pass with nothing to await.
  const [calendarQuery, setCalendarQuery] = useState('');
  const [parentQuery, setParentQuery] = useState('');

  // ORGANISATION calendars only — the resource pool is org-global, so the API hard-rejects a
  // project calendar here (422 `RESOURCE_REQUIRES_ORG_CALENDAR`). That is why this picker has no
  // tier grouping: there is only ever one tier in it.
  const calendarOptions = useMemo<ComboboxOption[]>(() => {
    if (!LIBRARY_SCOPING_ENABLED) return [];
    return calendars
      .filter(
        (calendar) =>
          (!isArchivedRow(calendar) || calendar.id === calendarId) &&
          matchesLibraryQuery(calendarQuery, calendar.name),
      )
      .map((calendar) => ({
        value: calendar.id,
        label: calendar.name,
        ...(isArchivedRow(calendar) ? { badge: ARCHIVED_BADGE } : {}),
      }));
  }, [calendars, calendarId, calendarQuery]);

  // The group picker keeps the tree shape: `depth` is the combobox's indentation, replacing the
  // non-breaking-space padding a native `<option>` needed. A matching search flattens nothing — the
  // depth still shows where each group sits.
  const parentComboboxOptions = useMemo<ComboboxOption[]>(
    () =>
      parentOptions
        .filter(
          (row) =>
            (!isArchivedRow(row.resource) || row.resource.id === parentId) &&
            matchesLibraryQuery(parentQuery, row.resource.name, row.resource.code),
        )
        .map((row) => ({
          value: row.resource.id,
          label: row.resource.name,
          ...(row.depth > 0 ? { depth: row.depth } : {}),
          ...(isArchivedRow(row.resource) ? { badge: ARCHIVED_BADGE } : {}),
        })),
    [parentOptions, parentId, parentQuery],
  );

  const onSubmit = handleSubmit((values) => {
    if (isEdit) {
      update.mutate(
        { resourceId: resource.id, version: resource.version, ...values },
        {
          onSuccess: () => {
            announce(`Resource “${values.name}” saved.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(values, {
        onSuccess: () => {
          announce(`Resource “${values.name}” created.`);
          onClose();
        },
      });
    }
  });

  const title = readOnly ? 'Resource' : isEdit ? 'Edit resource' : 'New resource';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      {...(isEdit || readOnly ? {} : { description: 'Add a reusable resource to the library.' })}
    >
      <FieldGridContainer>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <FormErrorSummary errors={errors} />
          {mutation.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {/* Chiefly the 422 RESOURCE_REQUIRES_ORG_CALENDAR (ADR-0053 §2) — the picker only ever
                offers organisation calendars, so this is defence in depth against a calendar that
                was narrowed to a project after the list loaded. */}
              {calendarScopeErrorMessage(mutation.error) ?? mutation.error.message}
            </p>
          ) : null}

          {/* The sections are consecutive siblings in their own wrapper (ADR-0061): the error
            summary above must not sit between them, or the first section grows a stray rule. */}
          <div className="flex flex-col gap-5">
            <FormSection title="Identity">
              <FieldGrid columns="lead">
                <TextField
                  label="Name"
                  autoComplete="off"
                  readOnly={readOnly}
                  error={errors.name?.message}
                  {...register('name')}
                />
                <TextField
                  label="Code"
                  autoComplete="off"
                  readOnly={readOnly}
                  hint="A short natural-key handle, unique in this organisation."
                  error={errors.code?.message}
                  {...register('code')}
                />
                <FieldGridFull>
                  <TextareaField
                    label="Description"
                    readOnly={readOnly}
                    error={errors.description?.message}
                    {...register('description')}
                  />
                </FieldGridFull>
              </FieldGrid>
            </FormSection>

            <FormSection
              title="Classification"
              description="What this resource is, and where it sits in the library."
            >
              <FieldGrid>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={kindSelectId}>Kind</Label>
                  <Select id={kindSelectId} disabled={readOnly} {...register('kind')}>
                    {/* GROUP is only offered behind the flag (ADR-0053 §3) — with it off the option
                    list is byte-for-byte the three assignable kinds it has always been. */}
                    {(LIBRARY_SCOPING_ENABLED ? RESOURCE_KINDS : ASSIGNABLE_RESOURCE_KINDS).map(
                      (kindOption) => (
                        <option key={kindOption} value={kindOption}>
                          {RESOURCE_KIND_LABELS[kindOption]}
                        </option>
                      ),
                    )}
                  </Select>
                  {isGroup ? (
                    <p className="text-muted-foreground text-sm">
                      A group only organises the library. It can’t be assigned to an activity and
                      has no calendar, capacity or cost of its own.
                    </p>
                  ) : null}
                </div>
                {LIBRARY_SCOPING_ENABLED ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={parentSelectId}>Group</Label>
                    <Combobox
                      id={parentSelectId}
                      value={parentId ?? ''}
                      onChange={(value) =>
                        setValue('parentId', value, { shouldDirty: true, shouldValidate: true })
                      }
                      query={parentQuery}
                      onQueryChange={setParentQuery}
                      options={parentComboboxOptions}
                      // A seeded group no longer on offer stays selected under the combobox's own
                      // "Unavailable" fallback, so the field never silently reads "top level".
                      selectedLabel={
                        parentOptions.find((row) => row.resource.id === parentId)?.resource.name
                      }
                      emptyOption={{ label: TOP_LEVEL_PARENT_LABEL }}
                      disabled={readOnly}
                      describedBy={parentHelpId}
                      toggleLabel="Show groups"
                      emptyMessage="No groups match your search."
                    />
                    <p id={parentHelpId} className="text-muted-foreground text-sm">
                      Nest this resource under a group to keep a large library navigable. Grouping
                      is organisational only — it never changes how anything is scheduled or
                      levelled.
                    </p>
                  </div>
                ) : null}
              </FieldGrid>
            </FormSection>

            {/* A group has no calendar, capacity or cost (ADR-0053 §3) — the fields are hidden rather
            than shown-and-rejected, and `use-resources` strips any value left over from a kind
            switch, so what the form shows and what it sends can never disagree. */}
            {isGroup ? null : (
              <FormSection
                title="Availability &amp; cost"
                description="Drives scheduling, levelling and Earned Value."
              >
                <FieldGrid>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={calendarSelectId}>Calendar</Label>
            {LIBRARY_SCOPING_ENABLED ? (
              <Combobox
                id={calendarSelectId}
                value={calendarId ?? ''}
                onChange={(value) =>
                  setValue('calendarId', value, { shouldDirty: true, shouldValidate: true })
                }
                query={calendarQuery}
                onQueryChange={setCalendarQuery}
                options={calendarOptions}
                selectedLabel={calendars.find((c) => c.id === calendarId)?.name}
                emptyOption={{ label: INHERIT_CALENDAR_LABEL }}
                loading={calendarsLoading}
                errored={calendarsError}
                disabled={readOnly}
                describedBy={
                  calendarsError ? `${calendarHelpId} ${calendarErrorId}` : calendarHelpId
                }
                invalid={calendarsError}
                toggleLabel="Show calendars"
                emptyMessage="No calendars match your search."
              />
            ) : (
              <Select
                id={calendarSelectId}
                disabled={readOnly || calendarsLoading}
                aria-busy={calendarsLoading}
                aria-invalid={calendarsError ? true : undefined}
                aria-describedby={
                  calendarsError ? `${calendarHelpId} ${calendarErrorId}` : calendarHelpId
                }
                {...register('calendarId')}
              >
                <option value="">{INHERIT_CALENDAR_LABEL}</option>
                {missingCalendar ? (
                  <option value={calendarId}>
                    {calendarsLoading ? 'Loading…' : 'Unavailable'}
                  </option>
                ) : null}
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </Select>
            )}
                    <p id={calendarHelpId} className="text-muted-foreground text-sm">
                      The working-time calendar this resource is scheduled on when it drives an
                      activity. Inherits the plan’s calendar unless you pick one.
                      {LIBRARY_SCOPING_ENABLED
                        ? ' Organisation calendars only — the resource pool is shared across every project, so a project’s own calendar can’t be used here.'
                        : null}
                    </p>
                    {calendarsError ? (
                      <p id={calendarErrorId} role="alert" className="text-destructive-text text-sm">
                        Couldn’t load the calendar list, so only “{INHERIT_CALENDAR_LABEL}” is
                        available.
                      </p>
                    ) : null}
                  </div>
                  {RESOURCE_LEVELLING_ENABLED ? (
                    <TextField
                      label="Max units/hour"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      readOnly={readOnly}
                      hint="The most this resource can supply at once. Resource levelling delays activities so demand never exceeds it. Leave blank for uncapped."
                      error={errors.maxUnitsPerHour?.message}
                      {...register('maxUnitsPerHour', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                  ) : null}
                  {EARNED_VALUE_ENABLED ? (
                    <TextField
                      label="Cost per unit"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      readOnly={readOnly}
                      hint="The cost per unit of work this resource does, shown in each plan’s own currency when Earned Value reads it. Earned Value derives an assignment’s budgeted cost from units × this rate. Leave blank for no rate."
                      error={errors.costPerUnit?.message}
                      {...register('costPerUnit', {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                  ) : null}
                </FieldGrid>
              </FormSection>
            )}
          </div>

          <div className="border-border flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {readOnly ? null : (
              <Button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending}>
                {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create resource'}
              </Button>
            )}
          </div>
        </form>
      </FieldGridContainer>
    </Dialog>
  );
}
