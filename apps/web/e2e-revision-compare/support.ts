import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the **Compare revisions** suite (revision M2-T4).
 *
 * The plan and its baseline are built through the **API** (the ADR-0066 rule): this suite is about
 * READING a comparison, and drawing a network by hand would add a dozen reasons to fail for
 * something the epic is not about. The surfaces that ARE the epic — the menu item, the docked
 * panel, the two pickers — are driven as a planner drives them.
 *
 * **The seed catalogue captures no baselines** (`docs/TEST_PLAYBOOK.md`, verified), so this suite
 * captures its own through the public REST API, which is the route the health M6 journey took for
 * the same reason.
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `revision-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Revision Tester');
  await page.getByLabel('Email').fill(`rc-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Revision Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

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

export function planIdOf(url: string): string {
  const id = /\/plans\/([0-9a-f-]{36})/.exec(url)?.[1];
  if (!id) throw new Error(`no plan id in ${url}`);
  return id;
}

export async function createAndOpenPlan(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel(/Planned start/).fill('2026-01-05');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  return planIdOf(page.url());
}

export interface SeededRevision {
  /** The activity that is OFF the critical path at capture and ON it afterwards. */
  enteringName: string;
  /** One of the two that carry the critical path at capture and lose it afterwards. */
  leavingName: string;
  /** In the baseline and deleted afterwards — the one thing only the change picture can show. */
  removedName: string;
}

/**
 * Seed a plan whose comparison has a **known, non-empty answer**, capture a baseline, then move it.
 *
 * ```
 *   at capture:   Groundworks (10 d) ──FS──▶ Frame (10 d)      ← critical, and Frame carries the finish
 *                 Cladding (2 d)                                ← parallel and short: floats
 *
 *   after:        Cladding stretched to 40 d                    ← now critical; the chain is not
 * ```
 *
 * So the comparison must report **Cladding entered** and **Groundworks and Frame left**. A
 * comparison of two identical schedules would pass an "it rendered" assertion while proving
 * nothing — the non-vacuity rule this epic applies to its own measurements, applied to its journey.
 *
 * **This seeds through the API and does NOT reload — its caller does** (`docs/TECH_DEBT.md` #208).
 * A `page.evaluate` POST is invisible to the open page's TanStack Query cache, and several suites
 * used to lean on a later `Recalculate` press to invalidate it, which was an undocumented side
 * effect that ADR-0109 D3 removed by making that control conditional.
 */
export async function seedRevision(
  page: Page,
  orgSlug: string,
  planId: string,
): Promise<SeededRevision> {
  await page.evaluate(
    async ({ slug, planId }) => {
      const call = async (path: string, method: string, body?: unknown) => {
        const res = await fetch(`/api/v1/organizations/${slug}${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!res.ok) throw new Error(`${method} ${path} ${String(res.status)}`);
        return res.status === 204 ? null : ((await res.json()) as { data: { id: string } }).data;
      };
      const act = (name: string, durationDays: number) =>
        call(`/plans/${planId}/activities`, 'POST', { name, durationDays }) as Promise<{
          id: string;
        }>;

      const a = await act('Groundworks', 10);
      const b = await act('Frame', 10);
      const cladding = await act('Cladding', 2);
      // Baselined and then DELETED, so the comparison has work that is in the old revision and not
      // in the plan. That is the one thing tier 2a can show and nothing else can: a removed
      // activity has no live bar, no listbox row and no lane the cull knows about (ADR-0127).
      const hoarding = await act('Site hoarding', 5);
      await call(`/plans/${planId}/dependencies`, 'POST', {
        predecessorId: a.id,
        successorId: b.id,
      });
      await call(`/plans/${planId}/schedule/recalculate`, 'POST');
      await call(`/plans/${planId}/baselines`, 'POST', { name: 'Contract Baseline' });
      // AFTER the capture — the baseline froze it, the plan no longer has it.
      await call(`/activities/${hoarding.id}`, 'DELETE');

      // Move the plan so the delta is NOT empty. The version is read back rather than assumed:
      // a recalculation writes engine-owned columns and bumps it, so `version: 1` would 409.
      const read = await fetch(`/api/v1/organizations/${slug}/activities/${cladding.id}`);
      const current = (await read.json()) as { data: { version: number } };
      await call(`/activities/${cladding.id}`, 'PATCH', {
        durationDays: 40,
        version: current.data.version,
      });
      await call(`/plans/${planId}/schedule/recalculate`, 'POST');
    },
    { slug: orgSlug, planId },
  );
  return { enteringName: 'Cladding', leavingName: 'Frame', removedName: 'Site hoarding' };
}
