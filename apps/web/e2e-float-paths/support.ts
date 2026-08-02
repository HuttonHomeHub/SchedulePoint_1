import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Float paths** suite (`VITE_FLOAT_PATHS`, audit F4).
 *
 * The network is built through the **API** rather than the canvas: this suite is about reading an
 * analysis, and drawing thirteen activities and their logic by hand would add a dozen reasons to
 * fail for something the epic is not about. The surfaces that ARE the epic — the toolbar item, the
 * panel, the two views' emphasis — are driven as a planner drives them.
 */

/** Sign up + create an organisation; returns the org slug. The actor is the org's Org Admin. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  // The slug is derived from the NAME by the API, so it must be predicted from the name and not
  // invented — a mismatch here fails five steps later with a 404 that looks like an auth problem.
  const orgSlug = `float-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Float Tester');
  await page.getByLabel('Email').fill(`fp-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Float Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * An **eight-hour** working-week calendar, through the API.
 *
 * Eight hours and not twenty-four is the point of the whole journey: one working day of relative
 * float is then **480 minutes**, and the defect M0 fixed — dividing by a flat 1440 — renders it as
 * `0d`, indistinguishable from the driving path. On a 24-hour calendar the bug and the fix agree.
 */
export async function createEightHourCalendar(page: Page, orgSlug: string): Promise<string> {
  return page.evaluate(async (slug) => {
    const shifts = [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      startMinute: 8 * 60,
      endMinute: 16 * 60,
    }));
    const res = await fetch(`/api/v1/organizations/${slug}/calendars`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Eight hour week', shifts }),
    });
    const body = (await res.json()) as { data: { id: string; hoursPerDay: number } };
    if (body.data.hoursPerDay !== 8) {
      throw new Error(`expected an 8-hour day, got ${String(body.data.hoursPerDay)}`);
    }
    return body.data.id;
  }, orgSlug);
}

/** Create a client + project and land on the project page (where plans are created). */
export async function openProject(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
}

/** The plan id, read from the URL rather than from a list fetch. */
export function planIdOf(url: string): string {
  const id = /\/plans\/([0-9a-f-]{36})/.exec(url)?.[1];
  if (!id) throw new Error(`no plan id in ${url}`);
  return id;
}

/** Create a plan under the current project, bind it to the calendar, and open it. */
export async function createAndOpenPlan(
  page: Page,
  name: string,
  orgSlug: string,
  calendarId: string,
): Promise<string> {
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel(/Planned start/).fill('2026-01-05');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();

  const planId = planIdOf(page.url());
  await page.evaluate(
    async ({ slug, planId, calendarId }) => {
      const read = await fetch(`/api/v1/organizations/${slug}/plans/${planId}`);
      const { data } = (await read.json()) as { data: { version: number } };
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calendarId, version: data.version }),
      });
      if (!res.ok) throw new Error(`plan calendar PATCH ${String(res.status)}`);
    },
    { slug: orgSlug, planId, calendarId },
  );
  return planId;
}

export interface SeededNetwork {
  targetId: string;
  drivingId: string;
  branchId: string;
}

/**
 * Build the network the whole journey rests on, then calculate it.
 *
 * ```
 *   Driving (5 d) ──FS──▶ ┐
 *   Branch  (4 d) ──FS──▶ Target (1 d)          ← Branch carries exactly ONE working day of float
 *   Spare01…Spare12 (3 d) ─FS──▶                ← twelve more, so the default 10-path page truncates
 * ```
 *
 * Twelve spares are not padding: `hasMorePaths` is the one field a reader cannot verify by
 * counting rows, and a plan with three paths would never exercise it.
 */
export async function seedNetwork(
  page: Page,
  orgSlug: string,
  planId: string,
): Promise<SeededNetwork> {
  return page.evaluate(
    async ({ slug, planId }) => {
      const post = async (path: string, body: unknown): Promise<{ id: string }> => {
        const res = await fetch(`/api/v1/organizations/${slug}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST ${path} → ${String(res.status)}: ${await res.text()}`);
        const parsed = (await res.json()) as { data: { id: string } };
        return parsed.data;
      };

      const activity = async (name: string, durationDays: number, laneIndex: number) =>
        (await post(`/plans/${planId}/activities`, { name, durationDays, laneIndex })).id;

      const target = await activity('Target', 1, 0);
      const driving = await activity('Driving', 5, 1);
      const branch = await activity('Branch', 4, 2);
      const link = async (predecessorId: string): Promise<void> => {
        await post(`/plans/${planId}/dependencies`, {
          predecessorId,
          successorId: target,
          type: 'FS',
          lagDays: 0,
        });
      };
      await link(driving);
      await link(branch);
      for (let i = 1; i <= 12; i += 1) {
        const spare = await activity(`Spare ${String(i).padStart(2, '0')}`, 3, 2 + i);
        await link(spare);
      }

      const recalc = await fetch(
        `/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`,
        { method: 'POST' },
      );
      if (!recalc.ok) throw new Error(`recalculate → ${String(recalc.status)}`);

      return { targetId: target, drivingId: driving, branchId: branch };
    },
    { slug: orgSlug, planId },
  );
}

/**
 * The analysis, read **from the API**.
 *
 * The DOM is the thing under test: asserting the panel shows `+1d` proves the panel rendered a
 * string. The claim is that the number behind it is 480 working minutes and not 1,440 — so the
 * assertion reads the response, and the DOM assertion sits beside it rather than instead of it.
 */
export async function readFloatPaths(
  page: Page,
  orgSlug: string,
  planId: string,
  targetId: string,
  maxPaths = 10,
): Promise<{
  paths: { index: number; relativeFloat: number; relativeFloatMinutes: number }[];
  hasMorePaths: boolean;
}> {
  return page.evaluate(
    async ({ slug, planId, targetId, maxPaths }) => {
      const res = await fetch(
        `/api/v1/organizations/${slug}/plans/${planId}/schedule/float-paths?target=${targetId}&maxPaths=${String(maxPaths)}`,
      );
      if (!res.ok) throw new Error(`float-paths → ${String(res.status)}`);
      const body = (await res.json()) as {
        data: {
          paths: { index: number; relativeFloat: number; relativeFloatMinutes: number }[];
          hasMorePaths: boolean;
        };
      };
      return body.data;
    },
    { slug: orgSlug, planId, targetId, maxPaths },
  );
}

/** The canvas's parallel activity listbox — the a11y surface the emphasis has to reach. */
export function canvasListbox(page: Page) {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/** Select an activity by name in the canvas listbox, which lifts it to the workspace selection. */
export async function selectOnCanvas(page: Page, name: string): Promise<void> {
  const listbox = canvasListbox(page);
  await listbox.focus();
  // The listbox selects the first row on focus; step down until the selected option is the one
  // wanted. Bounded by the row count so a miss fails loudly rather than looping.
  for (let i = 0; i < 20; i += 1) {
    const selected = listbox.locator('[aria-selected="true"]');
    if (((await selected.textContent()) ?? '').includes(name)) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`could not select ${name} in the canvas listbox`);
}

/** The listbox option text for an activity, including any dim marker. */
export async function canvasOptionText(page: Page, name: string): Promise<string> {
  const option = canvasListbox(page).getByRole('option').filter({ hasText: name }).first();
  return (await option.textContent()) ?? '';
}
