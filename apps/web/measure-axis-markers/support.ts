import { expect, type Page } from '@playwright/test';

/**
 * Harness helpers for the **axis-marker** Milestone 0 measurement
 * (`docs/specs/canvas-axis-markers/`).
 *
 * Deliberately a copy of the `e2e-workspace-chrome` onboarding shape rather than an import: a
 * Playwright `testDir` is its own compilation root, and two suites sharing a helper whose fixture
 * names they both mutate is how two serial suites start failing each other on one database.
 */

/** The width every figure in this milestone is quoted at: the product owner's Surface Pro. */
export const TARGET_WIDTH = 1646;
export const TARGET_HEIGHT = 1080;

/** Sign up and create an organisation; returns the slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const slug = `axis-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Axis Tester');
  await page.getByLabel('Email').fill(`axis-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Axis Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`));
  return slug;
}

/** Create the client and project the plans hang off, landing on the project screen. */
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
}

/** Create a plan with an explicit data date and open it. */
export async function newPlan(page: Page, name: string, dataDate: string): Promise<void> {
  const project = page.getByRole('link', { name: 'Riverside', exact: true });
  if ((await project.count()) > 0) await project.first().click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill(dataDate);
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
}

/** Hold the pen (ADR-0028). Idempotent. */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** The open plan's id, from the route. */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** Create activities through the real API and recalculate, so the diagram has bars with dates. */
export async function seedAndRecalculate(
  page: Page,
  orgSlug: string,
  names: readonly string[],
): Promise<void> {
  const planId = openPlanId(page);
  const failures = await page.evaluate(
    async ({ org, id, rows }: { org: string; id: string; rows: readonly string[] }) => {
      const bad: string[] = [];
      let lane = 0;
      for (const name of rows) {
        const res = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, type: 'TASK', durationDays: 3, laneIndex: lane }),
        });
        lane += 1;
        if (!res.ok) bad.push(`${name}: ${String(res.status)} ${await res.text()}`);
      }
      const recalc = await fetch(`/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!recalc.ok) bad.push(`recalculate: ${String(recalc.status)} ${await recalc.text()}`);
      return bad;
    },
    { org: orgSlug, id: planId, rows: names },
  );
  if (failures.length > 0) throw new Error(`seeding rejected: ${failures.join('; ')}`);
  await page.reload();
  await expect(page.getByTestId('tsld-ruler')).toBeVisible();
}

/** Pick a zoom preset from the `View` menu's radio group (ADR-0091 D3 relocated ADR-0056 §1). */
export async function setPreset(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: /^View/ }).click();
  const radio = page.getByRole('radio', { name: new RegExp(`^${label}\\b`) });
  await expect(radio).toBeVisible();
  await radio.check();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}
