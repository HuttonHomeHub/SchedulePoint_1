import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ensurePen,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';

/**
 * **M2-T5 — a duration typed into the Gantt grid, checked at the API.**
 *
 * The sub-day case is the one that matters, and it is here rather than in a unit test for a reason
 * ADR-0070 M6 recorded the hard way: its own journey found, on its first run, that the plan's
 * calendar never reached `CreateActivityButton`, so on the surface where every activity is first
 * created the duration field rendered, looked right, and quietly refused `4h`. Nothing in jsdom can
 * see that — the factor arrives through a query, the parse is `hoursPerDay`-dependent, and a mocked
 * fetch accepts whatever it is handed.
 *
 * So this asserts **the stored minutes, read back from the API**, never the DOM under test. A grid
 * that displayed `4h` while having written 1,440 minutes would pass a DOM assertion and be wrong in
 * the only way that matters.
 *
 * **`1d` is the discriminating case, not `4h`** — and the first version of this docblock said the
 * opposite. Four hours is 240 working minutes on ANY calendar, so that assertion passes whether or
 * not the factor reached the parser; only a DAY-denominated value distinguishes an eight-hour
 * calendar (480) from the 24-hour default (1,440). The `4h` case still earns its place, because it
 * proves the grammar is accepted at all where ADR-0070 M6 found it silently refused — but it is not
 * the one that proves ADR-0068. Both are kept, with which is which written down.
 *
 * That correction was not free: `1d` really did store 1,440 on the first run, and the cause was
 * this file. Binding the calendar through a raw `fetch` leaves TanStack Query holding the plan it
 * already had, so the client resolved the factor from the plan's ORIGINAL 24-hour calendar. A
 * reload is the honest fix — a planner choosing a calendar in the UI invalidates that query — and
 * the failure is worth recording, because a `4h`-only suite would have gone green over it.
 */

const EIGHT_HOUR_NAME = 'Eight hour week';

/** Create an 8 h/day calendar and make it the plan's, through the public API. */
async function useEightHourCalendar(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id, name }: { org: string; id: string; name: string }) => {
      const created = await fetch(`/api/v1/organizations/${org}/calendars`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          // Mon–Fri, 08:00–16:00, as explicit intraday SHIFT WINDOWS — minutes from midnight, which
          // is the storage contract (`CalendarShiftDto`, ADR-0036). `workingWeekdays` is the other
          // half of a mutually-exclusive pair and can only say WHETHER a day works, so it cannot
          // express an eight-hour one and would leave this calendar at 24 h/day — the value that
          // makes `4h` and `1d` indistinguishable and the test pass for the wrong reason.
          //
          // `hoursPerDay` is deliberately NOT sent: it is derived once from the pattern at write
          // time (ADR-0068), and supplying it would assert the very answer this test rests on.
          shifts: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
          })),
        }),
      });
      if (!created.ok) return `calendar create: ${created.status} ${await created.text()}`;
      const body = (await created.json()) as { data: { id: string; hoursPerDay?: number } };

      // The plan PATCH is optimistically locked (ADR-0022), so the current version has to be read
      // first. Fetching it rather than assuming `1`: the plan has already been through create and
      // a pen acquisition by the time this runs, and a hard-coded version would fail the day either
      // of those started bumping it — a test that breaks for a reason unrelated to its subject.
      const planRead = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      if (!planRead.ok) return `plan read: ${planRead.status} ${await planRead.text()}`;
      const plan = (await planRead.json()) as { data: { version: number } };

      const bound = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calendarId: body.data.id, version: plan.data.version }),
      });
      if (!bound.ok) return `plan bind: ${bound.status} ${await bound.text()}`;
      // Fail loudly if the derived factor is not what the whole test rests on, rather than letting
      // a 24-hour calendar make `4h` and `1d` agree by accident.
      if (body.data.hoursPerDay !== 8) {
        return `calendar reports hoursPerDay=${String(body.data.hoursPerDay)}, expected 8`;
      }
      return null;
    },
    { org: orgSlug, id: planId, name: EIGHT_HOUR_NAME },
  );
  if (failure !== null) throw new Error(failure);

  // The bind above went round the client, so its cached plan still names the previous calendar and
  // `hoursPerDayFor` would resolve the OLD factor. Reload rather than invalidate: the test has no
  // handle on the query client, and this is what a planner's own calendar change amounts to.
  //
  // The reload drops the pen lease, which the next line restores — found by the seeding 423ing three
  // times immediately after the reload landed. `ensurePen` rather than `startEditing`, because a
  // reload may leave the lease already held and clicking "Start editing" would then hang on a
  // button that is not there.
  await page.reload();
  await ensurePen(page);
}

/** The stored row, straight from the API — the only honest place to check a write. */
async function readActivity(
  page: Page,
  orgSlug: string,
  name: string,
): Promise<{ durationMinutes: number; durationDays: number; name: string }> {
  const planId = openPlanId(page);
  const row = await page.evaluate(
    async ({ org, id, activityName }: { org: string; id: string; activityName: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error(`read: ${response.status} ${await response.text()}`);
      const body = (await response.json()) as {
        data: { name: string; durationMinutes: number; durationDays: number }[];
      };
      return body.data.find((a) => a.name === activityName) ?? null;
    },
    { org: orgSlug, id: planId, activityName: name },
  );
  if (row === null) throw new Error(`no activity named ${name}`);
  return row;
}

/** The Duration cell on the first seeded row. */
function durationCell(page: Page) {
  return page.getByRole('row').filter({ hasText: 'Seeded 0' }).first().getByRole('gridcell').nth(2);
}

test.describe.configure({ mode: 'serial' });

test('a sub-day duration typed into the grid is stored as minutes', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await useEightHourCalendar(page, orgSlug);
  await seedActivities(page, orgSlug, 3);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);

  await durationCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Duration, Seeded 0/ });
  await expect(field).toBeVisible();
  await field.fill('4h');
  await field.press('Enter');

  // 240 working minutes on an eight-hour day — NOT 1,440. On the default 24-hour calendar those two
  // are the same number of minutes for "half a day", so this assertion only means anything because
  // the calendar above was bound first.
  await expect
    .poll(async () => (await readActivity(page, orgSlug, 'Seeded 0')).durationMinutes, {
      timeout: 20_000,
    })
    .toBe(240);
});

test('a whole-day duration on the same calendar stores its own minutes', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await useEightHourCalendar(page, orgSlug);
  await seedActivities(page, orgSlug, 3);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);

  await durationCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Duration, Seeded 0/ });
  await field.fill('1d');
  await field.press('Enter');

  // 480, not 1,440. A day is a per-calendar quantity (ADR-0068), and the whole point of the
  // required `hoursPerDay` parameter is that this cannot silently mean three days' work.
  await expect
    .poll(async () => (await readActivity(page, orgSlug, 'Seeded 0')).durationMinutes, {
      timeout: 20_000,
    })
    .toBe(480);
});

test('Escape discards, so a mistyped cell writes nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await useEightHourCalendar(page, orgSlug);
  await seedActivities(page, orgSlug, 3);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);

  const before = (await readActivity(page, orgSlug, 'Seeded 0')).durationMinutes;

  await durationCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Duration, Seeded 0/ });
  await field.fill('99d');
  await field.press('Escape');
  await expect(field).toBeHidden();

  // Checked at the API rather than by looking at the cell: a discard that closed the field and sent
  // the write anyway would look identical on screen until the next refetch.
  await expect
    .poll(async () => (await readActivity(page, orgSlug, 'Seeded 0')).durationMinutes)
    .toBe(before);
});

test('F2 opens a cell from the keyboard, and the name it writes is stored', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);

  // Focus a row the way a keyboard planner does, then enter cell mode. The unit suite proves F2
  // calls `begin`; only a browser proves the row is focusable, the handler is bound to something
  // that actually receives the key, and the field ends up focused.
  await page.getByRole('row').filter({ hasText: 'Seeded 0' }).first().click();
  await page.keyboard.press('F2');

  const field = page.getByRole('textbox', { name: /Activity, Seeded 0/ });
  await expect(field).toBeFocused();
  await field.fill('Piling');
  await field.press('Enter');

  await expect
    .poll(async () => (await readActivity(page, orgSlug, 'Piling')).name, { timeout: 20_000 })
    .toBe('Piling');
});
