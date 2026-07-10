import type { CalendarSummary, PlanSummary } from '@repo/types';

import { useSetPlanCalendar } from '../api/use-plans';

import { useAnnounce } from '@/components/ui/announcer';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

const NONE_LABEL = 'None (all days work)';

/**
 * The plan's default working-day calendar (M5, ADR-0024). Writers (`canEdit`, the
 * plan-update roles) pick from the org's calendar library or clear it; everyone
 * else sees the assigned calendar read-only. Changing it persists immediately (a
 * targeted PATCH) and a later Recalculate applies it to the dates. `calendars` is
 * supplied by the plan view (which may import the calendars feature) so this
 * plan-owned control needs no cross-feature import.
 */
export function PlanCalendarPicker({
  orgSlug,
  plan,
  calendars,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  calendars: CalendarSummary[];
  canEdit: boolean;
}): React.ReactElement {
  const setCalendar = useSetPlanCalendar(orgSlug);
  const announce = useAnnounce();

  const selectedName = plan.calendarId
    ? (calendars.find((calendar) => calendar.id === plan.calendarId)?.name ?? '—')
    : NONE_LABEL;

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-sm">Calendar</span>
        <span className="text-sm">{selectedName}</span>
      </div>
    );
  }

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = event.target.value;
    const calendarId = value === '' ? null : value;
    setCalendar.mutate(
      { planId: plan.id, version: plan.version, calendarId },
      {
        onSuccess: () => {
          const name = calendarId
            ? (calendars.find((calendar) => calendar.id === calendarId)?.name ?? 'calendar')
            : NONE_LABEL;
          announce(`Plan calendar set to ${name}.`);
        },
      },
    );
  };

  return (
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor="plan-calendar">Calendar</Label>
      <Select
        id="plan-calendar"
        value={plan.calendarId ?? ''}
        disabled={setCalendar.isPending}
        onChange={onChange}
      >
        <option value="">{NONE_LABEL}</option>
        {calendars.map((calendar) => (
          <option key={calendar.id} value={calendar.id}>
            {calendar.name}
          </option>
        ))}
      </Select>
      <p className="text-muted-foreground text-sm">
        Recalculate to apply the calendar to the schedule’s dates.
      </p>
      {setCalendar.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {setCalendar.error.message}
        </p>
      ) : null}
    </div>
  );
}
