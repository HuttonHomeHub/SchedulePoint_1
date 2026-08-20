import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the **organisation overview** suite (ADR-0098). The onboarding + hierarchy
 * helpers mirror `e2e-gantt/support.ts`; the onboarding actor becomes the org's Org Admin, which is
 * what lets this journey see every attention item there is.
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `overview-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Ada Overview');
  await page.getByLabel('Email').fill(`overview-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Overview Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

export async function createClient(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name }).click();
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name }).click();
}

export async function createPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name }).click();
  /**
   * **Wait for the plan to have LOADED, not merely for the click to have landed.**
   *
   * `useRememberPlan` records on `planQuery.isSuccess` (ADR-0098 M3), so a helper that returns as
   * soon as the link is clicked lets the caller navigate away before anything is remembered — and
   * the "Jump back in" case then fails intermittently, asserting a product rule against a fixture
   * that never satisfied its precondition. Seen twice in one sweep and once passing, which is what
   * a race looks like from the outside.
   *
   * The pen control is the signal because it renders only once the plan workspace has its plan; the
   * heading is not, since the identity line paints from the route before the query resolves.
   */
  await expect(page.getByRole('button', { name: /^(Start|Stop) editing$/ })).toBeVisible();
}

/** Hold the pen, whether or not this session already does. */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** The open plan's id, read from the route rather than from a list endpoint's ordering. */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/**
 * Add one activity to the open plan through the API.
 *
 * This is the change the overview is supposed to notice, and it goes through the API deliberately:
 * the assertion under test is that an **activity** edit moves a plan up the list — which is the
 * whole reason the read model's ordering key is a `GREATEST` over three tables rather than
 * `plans.updated_at`. Drawing the bar on the canvas would test the canvas.
 */
export async function addActivity(page: Page, orgSlug: string, name: string): Promise<void> {
  const planId = openPlanId(page);
  const result = await page.evaluate(
    async ({ org, id, activityName }: { org: string; id: string; activityName: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: activityName, code: 'A0001', durationDays: 5 }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId, activityName: name },
  );
  if (!result.ok) throw new Error(`activity create failed: ${result.status} ${result.body}`);
}

/** Go to the organisation overview by URL, and wait for it to settle. */
export async function openOverview(page: Page, orgSlug: string): Promise<void> {
  await page.goto(`/orgs/${orgSlug}`);
  await expect(section(page, 'Recently changed')).toBeVisible();
}

/**
 * One named section of the overview.
 *
 * **Locators here MUST be section-scoped**, and that is a product fact rather than a test
 * convenience: the same plan legitimately appears in both sections at once — once as work that
 * changed, once as a pen you are holding — saying two different things about itself. An unscoped
 * `getByRole('link', { name: planName })` matches both and fails on strict mode, which is how this
 * helper came to exist. `SectionCard` renders a named `<section>`, so each section is a `region`
 * for a screen-reader user and an addressable scope here, from the same one change.
 */
export function section(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page.getByRole('region', { name });
}

/**
 * Count the overview requests a navigation makes.
 *
 * "Jump back in" is only acceptable on the coldest path in the product because it costs **no extra
 * request** — the remembered ids ride on the overview call the screen is already making (ADR-0098
 * §4.9). That is an arithmetic claim about a real browser, so it is asserted here rather than
 * reasoned about: a per-section query would be invisible to every unit test, because they mock
 * `apiFetch` and count nothing.
 *
 * **The predicate matches the API path, not the substring `/overview`.** The first version used
 * `includes('/overview')` and counted **19** — because the Vite dev server serves this feature's
 * own modules from `/src/features/overview/…`, every one of which matches. A measurement harness
 * that counts its own source files reports a defect that is not there, which is worse than not
 * measuring: it is a number, and numbers get believed.
 */
export async function countOverviewRequests(page: Page, run: () => Promise<void>): Promise<number> {
  let count = 0;
  const isOverviewCall = /\/api\/v1\/organizations\/[^/]+\/overview(\?|$)/;
  const listener = (request: { url(): string }): void => {
    if (isOverviewCall.test(request.url())) count += 1;
  };
  page.on('request', listener);
  try {
    await run();
  } finally {
    page.off('request', listener);
  }
  return count;
}
