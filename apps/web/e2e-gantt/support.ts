import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Gantt view** suite (`VITE_GANTT_VIEW`, ADR-0059,
 * `docs/specs/gantt-view/`). The onboarding + client/project/plan + canvas-authoring helpers mirror
 * `e2e-library/support.ts` verbatim (the same canvas-authoring flags bake into this suite's
 * `webServer`, so a plan opens on a draw-ready blank canvas). The onboarding actor becomes the
 * org's Org Admin, which already satisfies everything this journey does.
 */

/** Sign up + create an organisation; returns the org slug (name "Gantt Co" → "gantt-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `gantt-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Gantt Tester');
  await page.getByLabel('Email').fill(`gantt-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Gantt Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the client this journey hangs its project off, and open it. */
export async function createClient(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name }).click();
}

/** Create a project under the currently-open client and open its detail screen. */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name }).click();
}

/** Create a plan under the currently-open project and open it (mounts the canvas workspace). */
export async function createPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name }).click();
}

/** Take the pen so the authoring affordances go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/**
 * Hold the pen, whether or not this session already does.
 *
 * Writes are pen-gated (ADR-0028) — including the API seeding below, which would 423 without it —
 * but a reload may leave the lease already held, in which case the toolbar reads "Stop editing" and
 * clicking "Start editing" would hang. Checking beats assuming either state.
 */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await startEditing(page);
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/** Draw a task on the canvas via the Add split-button (mirrors `e2e-library/support.ts`). */
export async function drawActivity(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  await page.getByRole('button', { name: /^Add(ing .+)?$/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByRole('textbox', { name: 'New activity name' }).fill(name);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form).toBeHidden();
}

/** The Gantt's treegrid — the surface every assertion in this journey reads. */
export function ganttGrid(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
}

/**
 * The open plan's id, read from the route (`/orgs/$orgSlug/plans/$planId`). Deliberately NOT "the
 * first plan the list endpoint returns" — that depends on the API's ordering, and would silently
 * address the wrong plan.
 */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/**
 * Seed activities into the open plan through the API, then recalculate.
 *
 * The canvas is exercised by `drawActivity` — once, exactly as every other flag-on suite does. Bulk
 * seeding goes through the API on purpose: authoring hundreds of bars by click would measure the
 * canvas, take minutes, and make a Gantt assertion fail for reasons that have nothing to do with
 * the Gantt. The session cookie rides along because the request is issued from the page's origin.
 *
 * `startIndex` keeps names and codes unique when a plan is topped up in more than one call.
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  count: number,
  startIndex = 0,
): Promise<void> {
  const planId = openPlanId(page);

  await page.evaluate(
    async ({ org, id, n, from }: { org: string; id: string; n: number; from: number }) => {
      // Small concurrent batches: 400 strictly-sequential round trips is minutes of wall clock on
      // a shared runner, and the point of the seed is to arrive at a row count, not to measure the
      // API. Batched rather than all-at-once so the pool is not swamped.
      const BATCH = 20;
      for (let start = 0; start < n; start += BATCH) {
        await Promise.all(
          Array.from({ length: Math.min(BATCH, n - start) }, (_, k) => {
            const i = from + start + k;
            return fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                name: `Seeded ${i}`,
                code: `S${String(i).padStart(4, '0')}`,
                durationDays: 5,
              }),
            });
          }),
        );
      }
    },
    { org: orgSlug, id: planId, n: count, from: startIndex },
  );

  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      await fetch(`/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
    },
    { org: orgSlug, id: planId },
  );
}

/** Switch the workspace to the Gantt and wait for the grid. */
export async function showGantt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(ganttGrid(page)).toBeVisible();
}
