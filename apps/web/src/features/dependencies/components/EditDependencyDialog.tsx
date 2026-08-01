import { zodResolver } from '@hookform/resolvers/zod';
import type { ActivitySummary, CalendarSummary, DependencySummary } from '@repo/types';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useUpdateDependency } from '../api/use-dependencies';
import { lagHoursPerDay } from '../model/lag-factor';
import {
  LAG_NEEDS_WHOLE_DAYS,
  lagFieldHelp,
  lagFieldLabel,
  lagInputProps,
  lagWriteFields,
  seedLagText,
} from '../model/lag-field';
import {
  DEPENDENCY_TYPES,
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_DISPLAY_ORDER,
  LAG_CALENDAR_HINT,
  LAG_CALENDAR_LABELS,
  typeAndLagSchema,
  type TypeAndLagValues,
} from '../schemas/dependency-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormErrorSummary, SelectField, TextField } from '@/components/ui/form';

/**
 * Edit a dependency's type and lag (the endpoints are immutable — re-pointing a
 * link means removing it and adding another). PATCHes with the row's `version`;
 * a stale version surfaces as an inline conflict. `dependency` is optional so the
 * dialog stays mounted (toggled by `open`), preserving native focus-restore.
 */
export function EditDependencyDialog({
  orgSlug,
  dependency,
  open,
  onClose,
  calendars = [],
  planCalendarId,
  planActivities = [],
}: {
  orgSlug: string;
  dependency?: DependencySummary;
  open: boolean;
  onClose: () => void;
  /**
   * The route-composed calendar library, used only to read the lag field's working-hours factor
   * (ADR-0070 §5). Absent leaves the field in whole days — the same control the flag-off path draws.
   */
  calendars?: CalendarSummary[];
  /** The plan's own calendar — what `PROJECT_DEFAULT` (and an inheriting endpoint) resolves to. */
  planCalendarId?: string;
  /**
   * The plan's activities, so a `PREDECESSOR`/`SUCCESSOR` lag can resolve **that endpoint's** own
   * calendar. The embedded `DependencyEndpoint` carries only id/code/name, which is why this comes
   * from the host rather than from the row.
   */
  planActivities?: ActivitySummary[];
}): React.ReactElement {
  const update = useUpdateDependency(orgSlug);
  const announce = useAnnounce();

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<TypeAndLagValues>({
    resolver: zodResolver(typeAndLagSchema),
    defaultValues: { type: 'FS', lag: '0', lagCalendar: 'PROJECT_DEFAULT' },
  });

  // The lag unit tracks the chosen calendar (elapsed vs working time); subscribe to just that field
  // so the label, the help line and the day↔minute factor all stay honest as the selection changes.
  const lagCalendar = useWatch({ control, name: 'lagCalendar' });
  const calendarOf = (activityId: string): string | null | undefined =>
    planActivities.find((candidate) => candidate.id === activityId)?.calendarId;
  const hoursPerDay = lagHoursPerDay(lagCalendar, {
    calendars,
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
    ...(dependency
      ? {
          predecessorCalendarId: calendarOf(dependency.predecessor.id),
          successorCalendarId: calendarOf(dependency.successor.id),
        }
      : {}),
  });

  useEffect(() => {
    if (open && dependency) {
      reset({
        type: dependency.type,
        // Seeded on the factor known at open. The lag calendar cannot change before the planner
        // sees this, and changing it is an explicit act with its own visible field — so unlike the
        // activity duration there is nothing here to re-seed asynchronously.
        lag: seedLagText(dependency, hoursPerDay),
        lagCalendar: dependency.lagCalendar,
      });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open/target change
  }, [open, dependency?.id]);

  const onSubmit = handleSubmit((values) => {
    if (!dependency) return;
    // The factor for the calendar this save LEAVES the link on — the watched field, not the stored
    // one, because a planner can switch to 24-hour and retype the lag in the same edit. This mirrors
    // the API, which converts against the `lagCalendar` the same PATCH sets (ADR-0068 §4).
    const lagFields = lagWriteFields(values.lag, hoursPerDay);
    if (lagFields === null) {
      setError('lag', { message: LAG_NEEDS_WHOLE_DAYS }, { shouldFocus: true });
      return;
    }
    update.mutate(
      {
        dependencyId: dependency.id,
        type: values.type,
        ...lagFields,
        lagCalendar: values.lagCalendar,
        version: dependency.version,
      },
      {
        onSuccess: () => {
          announce('Dependency updated.');
          onClose();
        },
      },
    );
  });

  const label = dependency
    ? `${dependency.predecessor.name} → ${dependency.successor.name}`
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit dependency"
      {...(label ? { description: label } : {})}
    >
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
        <FormErrorSummary errors={errors} />
        {update.isError ? (
          <p role="alert" className="text-destructive-text text-sm">
            {update.error.message}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">
          The linked activities are fixed. To connect different activities, remove this link and add
          a new one.
        </p>
        <SelectField label="Type" id="edit-dependency-type" {...register('type')}>
          {DEPENDENCY_TYPES.map((value) => (
            <option key={value} value={value}>
              {DEPENDENCY_TYPE_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Lag calendar"
          id="edit-dependency-lag-calendar"
          hint={LAG_CALENDAR_HINT}
          {...register('lagCalendar')}
        >
          {LAG_CALENDAR_DISPLAY_ORDER.map((value) => (
            <option key={value} value={value}>
              {LAG_CALENDAR_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <TextField
          label={lagFieldLabel(lagCalendar, hoursPerDay)}
          {...lagInputProps(hoursPerDay)}
          {...(lagFieldHelp(lagCalendar, hoursPerDay) === undefined
            ? {}
            : { hint: lagFieldHelp(lagCalendar, hoursPerDay) })}
          error={errors.lag?.message}
          {...register('lag')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending} aria-busy={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
