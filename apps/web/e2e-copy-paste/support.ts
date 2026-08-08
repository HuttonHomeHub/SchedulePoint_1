import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **activity copy / paste / duplicate** suite
 * (`VITE_ACTIVITY_COPY_PASTE`, `docs/specs/activity-copy-paste/` M5-T2).
 *
 * The rule these follow, and the reason several of them exist at all: **assert the server's row,
 * not the DOM under test** (the ADR-0070 M6 rule). A screen that renders a duplicated activity's
 * duration correctly proves the screen; only reading the row back through the API proves the write.
 * So `apiActivities` / `apiDependencies` below are not conveniences — they are the oracle, and the
 * DOM helpers beside them are for the things that genuinely are about the interface (what was
 * announced, what is selected, what a planner can reach).
 */

/** Sign up + create an organisation; returns the org slug ("Copy Co" → "copy-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `copy-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Copy Tester');
  await page.getByLabel('Email').fill(`copy-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Copy Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * The project screen's URL, captured once by {@link createHierarchy}.
 *
 * `newPlan` navigates here rather than hunting for a "Riverside" link, because after the first test
 * the suite is on a plan workspace and the link it used to click is a navigator tree item that does
 * not land where the helper assumed. That cost the second test a 30-second timeout on a "New plan"
 * button that was never going to appear.
 */
let projectUrl: string | null = null;

/** Create the client and project this suite's plans hang off, landing on the project screen. */
export async function createHierarchy(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await expect(page.getByRole('button', { name: 'New plan' })).toBeVisible();
  projectUrl = page.url();
}

/** Create a plan under the suite's project and open it (mounts the canvas workspace). */
export async function newPlan(page: Page, planName: string): Promise<void> {
  if (projectUrl === null) throw new Error('createHierarchy must run before newPlan');
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(planName);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: planName, exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
}

/** Hold the pen, whether or not this session already does (ADR-0028). Idempotent. */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** Release the pen, so the "shaded with a reason" assertions run against a real refusal. */
export async function releasePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (!(await stop.isVisible().catch(() => false))) return;
  await stop.click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** One activity, as the API returns it — the fields this suite asserts a copy carries. */
export interface ApiActivity {
  id: string;
  name: string;
  type: string;
  durationMinutes: number;
  laneIndex: number;
  parentId: string | null;
  percentComplete: number;
  physicalPercentComplete: number | null;
  version: number;
}

export interface ApiDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes: number;
}

/**
 * Every activity in the open plan, read back through the API.
 *
 * **This is the suite's oracle.** Paged to 100 and asserted not to have more, rather than silently
 * reading the first page: this suite's sharpest assertion is a *count* ("one Ctrl+Z returns the
 * active count to the pre-paste number"), and a pager that quietly stops at 100 would turn that
 * into a lottery. The measurement harness for this same epic shipped exactly that bug.
 */
export async function apiActivities(page: Page, orgSlug: string): Promise<ApiActivity[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`activities ${String(response.status)}: ${await response.text()}`);
      }
      const body = (await response.json()) as {
        data: unknown[];
        meta?: { hasMore?: boolean };
      };
      if (body.meta?.hasMore === true) {
        throw new Error('more than 100 activities — this suite would be reading a partial list');
      }
      return body.data as never[];
    },
    { org: orgSlug, id: planId },
  );
}

/** Every dependency in the open plan, read back through the API. Same paging guard. */
export async function apiDependencies(page: Page, orgSlug: string): Promise<ApiDependency[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/dependencies?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`dependencies ${String(response.status)}: ${await response.text()}`);
      }
      const body = (await response.json()) as {
        data: {
          id: string;
          predecessor: { id: string };
          successor: { id: string };
          type: string;
          lagMinutes: number;
        }[];
        meta?: { hasMore?: boolean };
      };
      if (body.meta?.hasMore === true) throw new Error('more than 100 dependencies');
      return body.data.map((d) => ({
        id: d.id,
        predecessorId: d.predecessor.id,
        successorId: d.successor.id,
        type: d.type,
        lagMinutes: d.lagMinutes,
      }));
    },
    { org: orgSlug, id: planId },
  );
}

export interface SeedSpec {
  name: string;
  durationDays?: number;
  /** `WBS_SUMMARY` for a band; omitted means `TASK`. */
  type?: string;
  /** Index into the already-seeded rows whose id becomes this row's `parentId`. */
  parentOf?: number;
}

/**
 * Create activities in the open plan through the API, then recalculate so the bars have dates.
 *
 * Every response is checked. A seed helper that lies about how much it seeded turns a count
 * assertion into a lottery, and counts are what this suite rests on.
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly SeedSpec[],
): Promise<ApiActivity[]> {
  const planId = openPlanId(page);
  const result = await page.evaluate(
    async ({ org, id, rows }: { org: string; id: string; rows: readonly SeedSpec[] }) => {
      const made: { id: string; name: string }[] = [];
      const bad: string[] = [];
      for (const [index, row] of rows.entries()) {
        const parent = row.parentOf === undefined ? undefined : made[row.parentOf]?.id;
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            type: row.type ?? 'TASK',
            durationDays: row.durationDays ?? 5,
            laneIndex: index,
            ...(parent === undefined ? {} : { parentId: parent }),
          }),
        });
        if (!response.ok) {
          bad.push(`${row.name}: ${String(response.status)} ${await response.text()}`);
          continue;
        }
        const body = (await response.json()) as { data: { id: string; name: string } };
        made.push({ id: body.data.id, name: body.data.name });
      }
      return { made, bad };
    },
    { org: orgSlug, id: planId, rows: specs },
  );
  if (result.bad.length > 0) {
    throw new Error(`seeding rejected ${String(result.bad.length)}: ${result.bad.join('; ')}`);
  }
  await recalculate(page, orgSlug);
  await page.reload();
  // Re-take the pen. The reload drops it client-side, and the first run of this suite failed
  // exactly there: `ensurePen` had been called before seeding (recalculate is pen-gated), the
  // reload landed on "Start editing", and every authoring control was correctly shaded — which
  // read as a product defect for as long as it took to open the accessibility snapshot.
  await ensurePen(page);
  return apiActivities(page, orgSlug);
}

/** Link two seeded activities through the API. */
export async function seedLink(
  page: Page,
  orgSlug: string,
  predecessorId: string,
  successorId: string,
): Promise<void> {
  const planId = openPlanId(page);
  const error = await page.evaluate(
    async ({ org, id, from, to }: { org: string; id: string; from: string; to: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ predecessorId: from, successorId: to, type: 'FS' }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    { org: orgSlug, id: planId, from: predecessorId, to: successorId },
  );
  if (error !== null) throw new Error(`link: ${error}`);
}

/** Recalculate the open plan. Pen-gated (ADR-0028), so the status is checked rather than ignored. */
export async function recalculate(page: Page, orgSlug: string): Promise<void> {
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: openPlanId(page) },
  );
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): Locator {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/** The diagram's parallel focusable listbox (ADR-0026 D7) — the canvas's own account of itself. */
export function diagramList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/** Which activity the canvas reports as selected, from `aria-activedescendant`. */
export async function selectedActivityId(page: Page): Promise<string | null> {
  const active = await diagramList(page).getAttribute('aria-activedescendant');
  if (active === null) return null;
  const match = /-opt-([0-9a-f-]{36})$/.exec(active);
  return match?.[1] ?? null;
}

/**
 * Move the canvas's keyboard cursor onto the named activity and select it.
 *
 * Keyboard rather than a click at computed pixels: the bar's position depends on the zoom preset,
 * the lane packing and the data date, so a coordinate is a guess that fails as a mystery. The
 * listbox is the canvas's own account of what is where, and driving it is what a keyboard planner
 * does anyway.
 */
export async function selectByName(page: Page, name: string): Promise<string> {
  await diagramList(page).focus();
  await page.keyboard.press('Home');
  // Bounded, and the bound is an error rather than a silent give-up: a helper that returned
  // without finding the row would make every later assertion pass against the wrong activity.
  for (let step = 0; step < 60; step += 1) {
    const id = await selectedActivityId(page);
    if (id !== null) {
      const label = await page.locator(`[id$="-opt-${id}"]`).first().textContent();
      if (label?.includes(name) === true) return id;
    }
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`no diagram option named "${name}" within 60 rows`);
}

/**
 * The app's single polite live region (`components/ui/announcer.tsx`). Read as text, not asserted
 * visible: it is `sr-only`, so a visibility assertion would fail on a region that is working.
 */
export function announcer(page: Page): Locator {
  return page.getByTestId('announcer');
}

/** Wait for the announcer to settle on text matching `pattern`, and return what it said. */
export async function announced(page: Page, pattern: RegExp): Promise<string> {
  await expect(announcer(page)).toHaveText(pattern);
  return (await announcer(page).textContent()) ?? '';
}

/**
 * The floating **selection actions** toolbar for one activity — where Duplicate lives.
 *
 * Named per activity (`Actions for Excavate`), which is the thing an assumption breaks on: this
 * suite's first run looked for Duplicate in the main `Build and manage` row and timed out against a
 * toolbar that was on screen the whole time under a different name.
 */
export function selectionToolbar(page: Page, activityName: string): Locator {
  return page.getByRole('toolbar', { name: `Actions for ${activityName}` });
}

/** The Duplicate control on the selection-actions bar for `activityName`. */
export function duplicateButton(page: Page, activityName: string): Locator {
  return selectionToolbar(page, activityName).getByRole('button', {
    name: 'Duplicate',
    exact: true,
  });
}

/**
 * The **Duplicate band** control, which a summary gets instead of Duplicate.
 *
 * A separate locator because it is a separate item with a different name — and `{ exact: true }` on
 * both, because without it "Duplicate" matches "Duplicate band" too and the two assertions stop
 * being able to tell each other apart.
 */
export function duplicateBandButton(page: Page, summaryName: string): Locator {
  return selectionToolbar(page, summaryName).getByRole('button', { name: 'Duplicate band' });
}
