import { expect, type Page } from '@playwright/test';

import { openPlanId, syncClient } from '../e2e-gantt/support';

/**
 * Journey helpers for the cases whose whole subject is **working days** (ADR-0170).
 *
 * A weekend proves nothing on a plan that does not skip it, so these cases bind a Mon–Fri calendar
 * to the plan through the API and **assert it before the case runs** rather than trusting that a
 * fresh plan already has one. (`useEightHourCalendar` in `grid-edit.spec.ts` sends weekdays 1–5,
 * which the API numbers from Monday = 0: that is Tuesday to Saturday, so it was never evidence of a
 * Mon–Fri week and is deliberately not reused here.)
 */

/** Mon–Fri as the API's 7-bit mask (bit 0 = Monday … bit 4 = Friday). */
const MON_FRI_MASK = 0b0011111;

/**
 * Create a Mon–Fri calendar, make it the plan's, and **read both back** — a plan whose calendar is
 * not what the case assumes would make every weekend assertion pass for the wrong reason.
 */
export async function bindMonFriCalendar(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const result = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const created = await fetch(`/api/v1/organizations/${org}/calendars`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Mon-Fri week', workingWeekdays: 0b0011111 }),
      });
      if (!created.ok)
        return { error: `calendar create: ${created.status} ${await created.text()}` };
      const calendar = (await created.json()) as { data: { id: string } };

      const planRead = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      if (!planRead.ok) return { error: `plan read: ${planRead.status} ${await planRead.text()}` };
      const plan = (await planRead.json()) as { data: { version: number } };

      const bound = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calendarId: calendar.data.id, version: plan.data.version }),
      });
      if (!bound.ok) return { error: `plan bind: ${bound.status} ${await bound.text()}` };

      const reread = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      const planAfter = (await reread.json()) as { data: { calendarId: string | null } };
      const calendarRead = await fetch(
        `/api/v1/organizations/${org}/calendars/${calendar.data.id}`,
        { credentials: 'include' },
      );
      const stored = (await calendarRead.json()) as { data: { workingWeekdays: number } };
      return {
        error: null,
        boundId: planAfter.data.calendarId,
        calendarId: calendar.data.id,
        workingWeekdays: stored.data.workingWeekdays,
      };
    },
    { org: orgSlug, id: planId },
  );
  expect(result.error, 'binding the Mon–Fri calendar').toBeNull();
  expect(result.boundId, 'the plan must name the calendar just made').toBe(result.calendarId);
  expect(result.workingWeekdays, 'the calendar must be Monday to Friday').toBe(MON_FRI_MASK);

  // The bind went round the client, whose cached plan still names the old calendar — and the
  // working-day predicate is built from THAT. Reload, as a planner's own calendar change amounts to.
  await syncClient(page);
}

/** The weekday of a `YYYY-MM-DD` day: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** `n` calendar days after a `YYYY-MM-DD` day. */
export function plusDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The first Monday–Friday day at or after `iso` — what the engine rolls a placement to. */
export function rollForward(iso: string): string {
  let day = iso;
  while (weekdayOf(day) === 0 || weekdayOf(day) === 6) day = plusDays(day, 1);
  return day;
}

/** Monday–Friday days from `startIso` to `finishIso`, both inclusive. */
export function workingDaysInclusive(startIso: string, finishIso: string): number {
  let count = 0;
  for (let day = startIso; day <= finishIso; day = plusDays(day, 1)) {
    if (weekdayOf(day) !== 0 && weekdayOf(day) !== 6) count += 1;
  }
  return count;
}

/** Assert a day is a working day — a fixture whose dates fell on a weekend would prove nothing. */
export function expectWeekday(iso: string | null, label: string): void {
  expect(iso, `${label} must exist`).not.toBeNull();
  expect([0, 6], `${label} (${String(iso)}) must be a Monday–Friday day`).not.toContain(
    weekdayOf(iso!),
  );
}
