import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **WBS improvements** suite (`VITE_WBS_IMPROVEMENTS`, ADR-0063,
 * `docs/specs/wbs-improvements/`). The onboarding + client/project/plan helpers mirror
 * `e2e-gantt/support.ts`; the actor is the org's Org Admin, which satisfies everything here.
 *
 * Activities and summaries are seeded through the **API**, for the same reason the Gantt suite
 * does it: drawing bars on a canvas measures the canvas, and a grouping assertion that fails
 * because a click landed a lane out tells you nothing about grouping. What this journey drives
 * through the UI is exactly what the epic added — the multi-select, the band, the bucket, dissolve,
 * and the delete warning.
 */

/** Sign up + create an organisation; returns the org slug ("WBS Co" → "wbs-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `wbs-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('WBS Tester');
  await page.getByLabel('Email').fill(`wbs-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`WBS Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client, project and plan, and open the plan (mounts the canvas workspace). */
export async function createPlan(page: Page, planName: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();

  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(planName);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: planName, exact: true }).click();
}

/**
 * Hold the pen, whether or not this session already does (ADR-0028). The API seeding below is
 * pen-gated too and would 423 without it; a reload may leave the lease already held, in which case
 * clicking "Start editing" would hang.
 */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** Release the pen, so every pen-gated affordance shades with its reason. */
export async function releasePen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** One seeded activity, as the API returns it. */
export interface SeededActivity {
  id: string;
  name: string;
}

/**
 * Create activities in the open plan through the API and return them.
 *
 * Sequential, and **every response is checked** — a seed helper that lies about how much it seeded
 * turns an assertion into a lottery (the lesson `e2e-gantt/support.ts` records).
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; type?: 'TASK' | 'WBS_SUMMARY'; durationDays?: number }[],
): Promise<SeededActivity[]> {
  const planId = openPlanId(page);
  const result = await page.evaluate(
    async ({
      org,
      id,
      rows,
    }: {
      org: string;
      id: string;
      rows: readonly { name: string; type?: string; durationDays?: number }[];
    }) => {
      const made: { id: string; name: string }[] = [];
      const bad: string[] = [];
      for (const row of rows) {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            type: row.type ?? 'TASK',
            // A WBS summary's dates roll up from its members, so it takes no duration of its own.
            ...(row.type === 'WBS_SUMMARY' ? {} : { durationDays: row.durationDays ?? 5 }),
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
  return result.made;
}

/** Recalculate the open plan, so summaries and the derived bucket have dates to draw. */
export async function recalculate(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      // Checked for the same reason `activityCount` pages. Recalculate is itself pen-gated
      // (ADR-0028 Q-B, asserted inside the advisory lock), so a caller that takes it out of order
      // gets a 423 — and a helper that ignores its status turns that into "the band drew nothing",
      // which reads as a product defect three assertions later rather than a test-order mistake.
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: planId },
  );
  await page.reload();
}

/**
 * How many activities the plan actually holds, straight from the API — the loss invariant's probe.
 *
 * It **pages** rather than asking for one big page. The first version asked for `limit=200`, which
 * `PaginationQueryDto` caps at 100, so the request 422'd and the probe read `.length` off an error
 * envelope — the journey failed on its own helper before it ever reached the product. Capping the
 * ask at 100 would have made it pass, and would have been worse: a probe that silently stops
 * counting at 100 reports "no activity lost" for exactly the plans big enough to lose one in.
 */
export async function activityCount(page: Page, orgSlug: string): Promise<number> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      let total = 0;
      let cursor: string | null = null;
      do {
        const query = `limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
        const response = await fetch(
          `/api/v1/organizations/${org}/plans/${id}/activities?${query}`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          throw new Error(`activity list ${String(response.status)}: ${await response.text()}`);
        }
        const body = (await response.json()) as {
          data: unknown[];
          meta: { nextCursor: string | null };
        };
        total += body.data.length;
        cursor = body.meta.nextCursor;
      } while (cursor !== null);
      return total;
    },
    { org: orgSlug, id: planId },
  );
}

/**
 * Make the activities table reachable in the canvas-first workspace (ADR-0030), where it lives in a
 * collapsible bottom panel rather than being the page. Idempotent: expands only if collapsed.
 *
 * This journey needs both surfaces — the table for M4b's bulk assign and the canvas for M4's band —
 * so it runs on the plan workspace and cannot borrow the activity-editor journey's
 * trick of turning that flag off to get a plain table page.
 */
export async function openActivitiesPanel(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(page.getByRole('region', { name: 'Activities panel' })).toBeVisible();
}

/** The activities table's selection checkbox for a row. */
export function rowCheckbox(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page.getByRole('checkbox', { name: `Select ${name}` });
}

/** Open a row's actions menu in the activities table. Ensures the panel is open first. */
export async function openRowMenu(page: Page, name: string): Promise<void> {
  await openActivitiesPanel(page);
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

/** The diagram's parallel focusable listbox (ADR-0026 D7) — the canvas's own account of itself. */
export function diagramActivityList(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/** Toggle a `View▾ ▸ Structure` switch by its label. */
export async function toggleView(page: Page, label: string): Promise<void> {
  const lookRow = page.getByRole('toolbar', { name: 'Plan commands' });
  await lookRow.getByRole('button', { name: 'View', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'View' });
  await panel.getByLabel(label).click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}
