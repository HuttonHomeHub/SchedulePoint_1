import { zodResolver } from '@hookform/resolvers/zod';
import { RESOURCE_KINDS, type CalendarSummary, type ResourceSummary } from '@repo/types';
import { useEffect, useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useCreateResource, useUpdateResource } from '../api/use-resources';
import {
  RESOURCE_KIND_LABELS,
  resourceFormSchema,
  type ResourceFormValues,
} from '../schemas/resource-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, TextField, TextareaField } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const INHERIT_CALENDAR_LABEL = 'Plan default (inherit)';

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
}: {
  orgSlug: string;
  open: boolean;
  onClose: () => void;
  resource?: ResourceSummary;
  readOnly?: boolean;
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

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: { name: '', code: '', description: '', kind: 'LABOUR', calendarId: '' },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: resource?.name ?? '',
        code: resource?.code ?? '',
        description: resource?.description ?? '',
        kind: resource?.kind ?? 'LABOUR',
        calendarId: resource?.calendarId ?? '',
      });
      mutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, resource?.id]);

  const calendarId = useWatch({ control, name: 'calendarId' });
  // The seeded calendar isn't in the loaded list (still loading, or it failed): keep it
  // selected under an honest label so the Select never reads blank ("inherit").
  const missingCalendar = Boolean(calendarId) && !calendars.some((c) => c.id === calendarId);

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
      {...(isEdit || readOnly ? {} : { description: 'Add a reusable resource to the library.' })}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {mutation.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {mutation.error.message}
          </p>
        ) : null}
        <TextField
          label="Name"
          autoComplete="off"
          readOnly={readOnly}
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={kindSelectId}>Kind</Label>
          <Select id={kindSelectId} disabled={readOnly} {...register('kind')}>
            {RESOURCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {RESOURCE_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>
        <TextField
          label="Code (optional)"
          autoComplete="off"
          readOnly={readOnly}
          hint="A short natural-key handle, unique in this organisation."
          error={errors.code?.message}
          {...register('code')}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={calendarSelectId}>Calendar (optional)</Label>
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
              <option value={calendarId}>{calendarsLoading ? 'Loading…' : 'Unavailable'}</option>
            ) : null}
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </Select>
          <p id={calendarHelpId} className="text-muted-foreground text-sm">
            The working-time calendar this resource is scheduled on when it drives an activity.
            Inherits the plan’s calendar unless you pick one.
          </p>
          {calendarsError ? (
            <p id={calendarErrorId} role="alert" className="text-destructive-text text-sm">
              Couldn’t load the calendar list, so only “{INHERIT_CALENDAR_LABEL}” is available.
            </p>
          ) : null}
        </div>
        <TextareaField
          label="Description (optional)"
          readOnly={readOnly}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex justify-end gap-2">
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
    </Dialog>
  );
}
