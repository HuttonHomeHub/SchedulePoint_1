import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the **Health check** suite (health M2-T4). The defective network is built
 * through the **API** (the ADR-0066 rule): this suite is about READING an assessment, and drawing
 * the defects by hand would add a dozen reasons to fail for something the epic is not about. The
 * surfaces that ARE the epic — the menu item, the docked panel, the offender jump — are driven as
 * a planner drives them.
 */

/** Sign up + create an organisation; returns the org slug (derived from the name by the API). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `health-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Health Tester');
  await page.getByLabel('Email').fill(`hc-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Health Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
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

/** Create a plan under the current project and open it. */
export async function createAndOpenPlan(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel(/Planned start/).fill('2026-01-05');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  return planIdOf(page.url());
}

export interface SeededDefects {
  danglerName: string;
}

/**
 * Seed the KNOWN defects the panel must report, then calculate:
 *
 * ```
 *   Groundworks (5 d) ──FS──▶ Frame (5 d) ──SS −1 d──▶ Fit out (5 d)   ← ONE lead (metric 2 FAIL)
 *   Phase 2 (WBS) ▸ Loose end (3 d)                                    ← dangles (metric 1 offender),
 *                                                                        under a collapsible parent
 * ```
 */
export async function seedDefects(
  page: Page,
  orgSlug: string,
  planId: string,
): Promise<SeededDefects> {
  await page.evaluate(
    async ({ slug, planId }) => {
      const post = async (path: string, body: unknown): Promise<{ id: string }> => {
        const res = await fetch(`/api/v1/organizations/${slug}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST ${path} ${String(res.status)}`);
        return ((await res.json()) as { data: { id: string } }).data;
      };
      const act = (name: string, durationDays: number, extra: object = {}) =>
        post(`/plans/${planId}/activities`, { name, durationDays, ...extra });
      const a = await act('Groundworks', 5);
      const b = await act('Frame', 5);
      const c = await act('Fit out', 5);
      // The dangler lives UNDER a WBS summary, so the Gantt claim can collapse its parent and
      // prove the offender jump auto-expands the ancestor chain (M3-T2 — the UX review's blocker:
      // selection alone reveals nothing in the Gantt).
      const phase = await act('Phase 2', 0, { type: 'WBS_SUMMARY' });
      await act('Loose end', 3, { parentId: phase.id });
      const link = (predecessorId: string, successorId: string, extra: object = {}) =>
        post(`/plans/${planId}/dependencies`, { predecessorId, successorId, ...extra });
      await link(a.id, b.id);
      await link(b.id, c.id, { type: 'SS', lagDays: -1 });
      const recalc = await fetch(
        `/api/v1/organizations/${slug}/plans/${planId}/schedule/recalculate`,
        { method: 'POST' },
      );
      if (!recalc.ok) throw new Error(`recalculate ${String(recalc.status)}`);
    },
    { slug: orgSlug, planId },
  );
  return { danglerName: 'Loose end' };
}

/** The canvas's parallel activity listbox — the a11y surface the offender jump has to reach. */
export function canvasListbox(page: Page) {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}
