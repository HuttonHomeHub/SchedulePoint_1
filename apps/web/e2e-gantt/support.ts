import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Gantt view** suite (`VITE_GANTT_VIEW`, ADR-0059,
 * `docs/specs/gantt-view/`). The onboarding + client/project/plan helpers mirror
 * `e2e-library/support.ts` verbatim. The onboarding actor becomes the org's Org Admin, which
 * already satisfies everything this journey does.
 *
 * There is deliberately **no canvas-drawing helper**. This suite builds its schedule through the
 * API and reads the diagram through its parallel listbox: authoring on the canvas is the TSLD's
 * contract to test, and a Gantt assertion that fails because a click landed oddly tells you nothing
 * about the Gantt.
 */

/** Sign up + create an organisation; returns the org slug (name "Gantt Co" → "gantt-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `gantt-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Gantt Tester');
  await page.getByLabel('Email').fill(`gantt-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
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
 * Seeding goes through the API rather than the canvas on purpose: authoring hundreds of bars by
 * click would measure the canvas, take minutes, and make a Gantt assertion fail for reasons that
 * have nothing to do with the Gantt. The session cookie rides along because the request is issued
 * from the page's origin.
 *
 * **Sequential, and every response is checked.** An earlier version fired batches concurrently and
 * ignored the results; some creates were rejected and the seed silently produced half the rows it
 * claimed, which turned a Gantt assertion into a lottery. A seed helper that lies about how much it
 * seeded is worse than a slow one — three hundred round trips are a few seconds.
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

  const failures = await page.evaluate(
    async ({ org, id, n, from }: { org: string; id: string; n: number; from: number }) => {
      const bad: string[] = [];
      for (let k = 0; k < n; k += 1) {
        const i = from + k;
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `Seeded ${i}`,
            code: `S${String(i).padStart(4, '0')}`,
            durationDays: 5,
          }),
        });
        if (!response.ok) bad.push(`${i}: ${response.status} ${await response.text()}`);
      }
      return bad;
    },
    { org: orgSlug, id: planId, n: count, from: startIndex },
  );
  if (failures.length > 0) {
    throw new Error(
      `seeding rejected ${failures.length} create(s): ${failures.slice(0, 3).join('; ')}`,
    );
  }

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

/**
 * The diagram's **parallel focusable listbox** — the accessible representation ADR-0026 built by
 * hand because a canvas has none. It is the right probe for "the two views are the same model":
 * the diagram's own account of what it contains, compared against the Gantt's rows, with no canvas
 * pixel-poking in between.
 */
export function diagramActivityList(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/**
 * A Gantt row, located by its **name cell** rather than by the row's text.
 *
 * ADR-0095 gave every row the arrows' textual equivalent — an `sr-only`
 * "Follows <predecessors>." rendered as a direct child of the row — so a successor's row contains
 * its predecessors' NAMES. A `filter({ hasText })` locator therefore matches rows that are not the
 * activity being addressed, and `.first()` then picks whichever of them the sort put on top.
 *
 * `e2e-float-paths` shipped exactly that and failed in CI: its fixture puts the successor at
 * `laneIndex: 0`, so the successor's row came first and BOTH of its row locators collapsed onto it
 * — one assertion passing and its neighbour failing against the same element. The journeys here
 * pass under the same pattern only because their seeded rows happen to sort the other way round,
 * which is not a property any of them assert.
 *
 * **Anchored, never exact**: the float-path de-emphasis marker renders INSIDE the name cell, so an
 * exact match would miss precisely the rows those assertions are about.
 */
export function ganttRow(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('gridcell', { name: new RegExp(`^${name}\\b`) }) })
    .first();
}
