import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
  syncClient,
} from '../e2e-gantt/support';
import { recalculate } from '../e2e-support/toolbar';

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
  await syncClient(page);
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

/**
 * Every activity on the open plan, or an empty list — **never a throw**.
 *
 * Its sibling above throws on a miss, which is right where the row must already exist and a miss is
 * the failure. It is wrong inside `expect.poll`, which treats a throw as fatal rather than as a
 * reason to try again: a poll waiting for a write to land got exactly one attempt, and reported the
 * gap between the keystroke and the response as "no activity named Piling".
 */
async function readActivities(
  page: Page,
  orgSlug: string,
): Promise<{ name: string; durationMinutes: number; durationDays: number }[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as {
        data: { name: string; durationMinutes: number; durationDays: number }[];
      };
      return body.data;
    },
    { org: orgSlug, id: planId },
  );
}

/** The Duration cell on the first seeded row. */
function durationCell(page: Page) {
  return ganttRow(page, 'Seeded 0').getByRole('gridcell').nth(2);
}

/** Put the plan into VISUAL mode through the API, then reload so the client sees it. */
async function useVisualMode(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const read = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      if (!read.ok) return `plan read: ${read.status}`;
      const plan = (await read.json()) as { data: { version: number } };
      const patched = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schedulingMode: 'VISUAL', version: plan.data.version }),
      });
      if (!patched.ok) return `mode patch: ${patched.status} ${await patched.text()}`;
      return null;
    },
    { org: orgSlug, id: planId },
  );
  if (failure !== null) throw new Error(failure);
  await syncClient(page);
}

/** The stored constraint and placement — the fields a typed date is actually about. */
async function readSchedulingFields(
  page: Page,
  orgSlug: string,
  name: string,
): Promise<{
  constraintType: string | null;
  constraintDate: string | null;
  visualStart: string | null;
  durationDays: number;
  earlyStart: string | null;
  earlyFinish: string | null;
}> {
  const planId = openPlanId(page);
  const row = await page.evaluate(
    async ({ org, id, activityName }: { org: string; id: string; activityName: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) return null;
      const body = (await response.json()) as {
        data: {
          name: string;
          constraintType: string | null;
          constraintDate: string | null;
          visualStart: string | null;
          durationDays: number;
          earlyStart: string | null;
          earlyFinish: string | null;
        }[];
      };
      return body.data.find((a) => a.name === activityName) ?? null;
    },
    { org: orgSlug, id: planId, activityName: name },
  );
  if (row === null) throw new Error(`no activity named ${name}`);
  return row;
}

/**
 * The Start and Finish cells on the first seeded row.
 *
 * By index, matching `durationCell` above, because `GANTT_COLUMNS` fixes the order: code(0),
 * name(1), duration(2), **start(3), finish(4)**, float(5), predecessors(6). The index alone would
 * be a silent liar if that order changed, so every case below opens the cell and then asserts the
 * editor's accessible name — `Start, Seeded 0` — which is the real check.
 */
function startCell(page: Page) {
  return ganttRow(page, 'Seeded 0').getByRole('gridcell').nth(3);
}

function finishCell(page: Page) {
  return ganttRow(page, 'Seeded 0').getByRole('gridcell').nth(4);
}

/** `n` calendar days after a `YYYY-MM-DD` day, as `YYYY-MM-DD`. */
function plusDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The date the cell would print for a day — so the journey types what a planner sees.
 *
 * `en-GB` + UTC, the same two options `formatCalendarDate` is built with. It is restated here
 * rather than imported because a Playwright `testDir` is its own compilation root; if the two ever
 * disagree this line is the one to change, and the product's own round-trip is asserted by
 * `src/lib/format-date.round-trip.test.ts` over every day of a year.
 */
function asDisplayed(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
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
  await recalculate(page);
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
  await recalculate(page);
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
  await recalculate(page);
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
  await recalculate(page);
  await showGantt(page);

  // Focus a row the way a keyboard planner does, then enter cell mode. The unit suite proves F2
  // calls `begin`; only a browser proves the row is focusable, the handler is bound to something
  // that actually receives the key, and the field ends up focused.
  // Establish that focus is INSIDE the row before pressing F2 — F2 goes to whatever is focused, so
  // a click that has not settled sends it to the document.
  //
  // Not `toBeFocused()` on the row itself, which is what this asserted first and is wrong for a
  // reason worth writing down: Playwright clicks an element's CENTRE, and the row's centre is a
  // cell. The page snapshot on the failing run named it — `gridcell "5 d" [active]`, the Duration
  // column M2 added — with the row correctly `aria-selected="true"` beside it. So the gesture had
  // worked and the assertion was describing a different element; a settle-wait and then a retry
  // both failed against perfectly correct behaviour, which is the ADR-0076 shape in a test.
  //
  // A cell taking focus is right for a grid, and F2 still reaches the handler because the keydown
  // bubbles. What must be true before pressing it is only that focus is somewhere in this row.
  const row = ganttRow(page, 'Seeded 0');
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(
      async () =>
        row.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)),
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.keyboard.press('F2');

  const field = page.getByRole('textbox', { name: /Activity, Seeded 0/ });
  await expect(field).toBeFocused();
  await field.fill('Piling');
  await field.press('Enter');

  // **Polled through a helper that RETURNS the miss rather than throwing it.** `readActivity` ends
  // in `throw new Error('no activity named …')`, and a throw inside `expect.poll` aborts the poll
  // instead of retrying it — so the first attempt, before the write had landed, was fatal. The
  // suite reported "no activity named Piling", which reads as "the write never happened" and was
  // actually "the write had not happened *yet*". Found by the console epic's M7 sweep, where this
  // was the one failure in twenty-nine.
  //
  // The rename is genuinely slower to observe than the duration edits above it: the poll asks for
  // an activity that does not exist until the write lands, where those ask for a field on a row
  // that is already there and merely re-reads it.
  await expect
    .poll(
      async () => {
        const rows = await readActivities(page, orgSlug);
        return rows.find((a) => a.name === 'Piling')?.name ?? null;
      },
      { timeout: 20_000 },
    )
    .toBe('Piling');
});

/**
 * **ADR-0134 — a typed date writes the constraint a drag writes.**
 *
 * These are here rather than in a unit test for the reason the duration cases above are: a unit
 * test asserts the PATCH body this client builds, and only a real server can say the API accepts
 * it, applies it, and stores what the decision says it should. The write goes through
 * `useUpdateActivityFields` with the pen enforced and an optimistic `version`, neither of which a
 * mocked fetch can refuse.
 *
 * The Visual case matters disproportionately. `bar-drag.spec.ts:157` is one of only a handful of
 * journeys in this repository that runs in Visual mode at all, and ADR-0092 records that gap being
 * the exact place a defect was hiding — a control whose own toggle did nothing, for months.
 */
test('a start date typed in EARLY mode pins the activity as an SNET', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);

  const before = await readSchedulingFields(page, orgSlug, 'Seeded 0');
  expect(
    before.constraintType,
    'the fixture must start unconstrained, or this proves nothing',
  ).toBeNull();

  /**
   * **The date is derived from the fixture's own span, not hardcoded — and the first version of
   * this test was hardcoded and failed for a reason that turned out to be the product being
   * right.** It typed `20 Apr 2026`, well past the seeded activity's finish. Under ADR-0134 D2 a
   * typed start KEEPS the finish and adjusts the duration, exactly as dragging the start edge
   * does, so a start after the finish is a negative duration and is correctly refused. A date one
   * day into the span is the shape the decision is about.
   */
  const target = plusDays(before.earlyStart!, 1);

  await startCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Start, Seeded 0/ });
  await expect(field).toBeVisible();
  await field.fill(asDisplayed(target));
  await field.press('Enter');

  await expect
    .poll(async () => (await readSchedulingFields(page, orgSlug, 'Seeded 0')).constraintType, {
      timeout: 20_000,
    })
    .toBe('SNET');
  const after = await readSchedulingFields(page, orgSlug, 'Seeded 0');
  // The DATE, not just the type — a constraint at the wrong day would satisfy the assertion above.
  expect(after.constraintDate).toContain(target);
});

test('a start date typed in VISUAL mode places the bar and writes NO constraint', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await useVisualMode(page, orgSlug);
  await showGantt(page);

  const before = await readSchedulingFields(page, orgSlug, 'Seeded 0');
  const target = plusDays(before.earlyStart!, 1);

  await startCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Start, Seeded 0/ });
  await expect(field).toBeVisible();
  await field.fill(asDisplayed(target));
  await field.press('Enter');

  await expect
    .poll(async () => (await readSchedulingFields(page, orgSlug, 'Seeded 0')).visualStart, {
      timeout: 20_000,
    })
    .toContain(target);
  // **The half that makes this a different decision rather than the same one.** A placement is
  // advisory; a constraint is not. If this ever starts writing one, the two modes have collapsed
  // into each other and a planner's hand-placed bar has silently become a pin.
  expect((await readSchedulingFields(page, orgSlug, 'Seeded 0')).constraintType).toBeNull();
});

test('a finish date typed in EARLY mode writes a duration and pins nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);

  const before = await readSchedulingFields(page, orgSlug, 'Seeded 0');

  // Later than today's finish, so the duration must grow — a direction that cannot be confused
  // with the write doing nothing.
  const target = plusDays(before.earlyFinish!, 4);

  await finishCell(page).dblclick();
  const field = page.getByRole('textbox', { name: /Finish, Seeded 0/ });
  await expect(field).toBeVisible();
  await field.fill(asDisplayed(target));
  await field.press('Enter');

  // **D3, the branch a reader expects to be FNLT and is not.** A finish-edge resize spreads neither
  // field; a typed finish does the same. This asserts the absence as hard as the presence, because
  // "it also wrote a constraint" is the failure that would look like success on screen.
  await expect
    .poll(async () => (await readSchedulingFields(page, orgSlug, 'Seeded 0')).durationDays, {
      timeout: 20_000,
    })
    .not.toBe(before.durationDays);
  expect((await readSchedulingFields(page, orgSlug, 'Seeded 0')).constraintType).toBeNull();
});
