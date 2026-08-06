import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Journey helpers for the **canvas authoring flow** suite (ADR-0064,
 * `docs/specs/canvas-authoring-and-routing/`).
 *
 * This suite exists because the epic's founding defect — a link that recorded its endpoints the
 * wrong way round — is only observable where the canvas, the coalesced auto-recalculation and a
 * real pen-enforcing API all run at once. A mocked `fetch` accepts any endpoint order, and a unit
 * test of the gesture reducer proves only that the reducer is right, which was never in doubt: the
 * reducer maps the first click to the predecessor with no inversion anywhere in the path.
 *
 * The helpers below are therefore built around **measuring**, not assuming: `mapBars` discovers
 * where each bar actually is by clicking and reading the canvas's own parallel listbox, rather than
 * trusting the pixel we drew at. That distinction is the whole diagnostic — a pick that lands on
 * the wrong bar and a pick that is dropped produce different evidence only if you know which bar
 * each pixel was.
 */

/** Sign up + create an organisation; returns the org slug ("Flow Co" → "flow-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `flow-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Flow Tester');
  await page.getByLabel('Email').fill(`flow-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Flow Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

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
}

/**
 * Create a plan under the suite's project and open it (mounts the canvas workspace). Navigates back
 * to the project first when a plan is already open, so cases can take **a plan each**.
 *
 * A plan each is not tidiness: every unconstrained task starts at the data date, so activities
 * accumulating in one plan stack lane by lane and push the bars out of any bounded probe grid. One
 * plan per case keeps every bar at lane 0 or 1, where the probe can find it in a handful of clicks.
 */
export async function newPlan(page: Page, planName: string): Promise<void> {
  const project = page.getByRole('link', { name: 'Riverside', exact: true });
  if ((await project.count()) > 0) await project.first().click();
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
 * Create activities in the open plan through the API and return them. Every response is checked —
 * a seed helper that lies about how much it seeded turns an assertion into a lottery.
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; laneIndex: number; durationDays?: number }[],
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
      rows: readonly { name: string; laneIndex: number; durationDays?: number }[];
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
            type: 'TASK',
            durationDays: row.durationDays ?? 5,
            // A lane is **mandatory** here, not a nicety. Two unconstrained tasks both start at the
            // data date, so seeding without lanes stacks them on lane 0 where they overlap exactly —
            // the top bar takes every click and the bar underneath is unreachable. The first run of
            // this diagnostic failed on precisely that, and the screenshot showed two labels
            // overprinted into one illegible bar.
            laneIndex: row.laneIndex,
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

/** Recalculate the open plan so the seeded bars have dates to draw, then reload to pick them up. */
export async function recalculate(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      // Recalculate is itself pen-gated (ADR-0028), so a caller that takes it out of order gets a
      // 423 — and a helper that ignores its status turns that into "no bars drew", which reads as a
      // product defect several assertions later rather than a test-order mistake.
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: planId },
  );
  await page.reload();
}

/**
 * One dependency as this suite reads it — the epic's ground truth for link direction.
 *
 * The API embeds each endpoint as a light summary (`predecessor: { id, name, … }`) rather than a
 * bare id, so the ids are lifted here. Reading `row.predecessorId` off the raw response yields
 * `undefined`, which compares unequal to everything and would have reported the defect as present
 * on every run.
 */
export interface DependencyRow {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
}

/** Every dependency in the open plan, straight from the API. Paged; every response checked. */
export async function dependencies(page: Page, orgSlug: string): Promise<DependencyRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const rows: DependencyRow[] = [];
      let cursor: string | null = null;
      do {
        const query = `limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
        const response = await fetch(
          `/api/v1/organizations/${org}/plans/${id}/dependencies?${query}`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          throw new Error(`dependency list ${String(response.status)}: ${await response.text()}`);
        }
        const body = (await response.json()) as {
          data: {
            id: string;
            type: string;
            predecessor: { id: string };
            successor: { id: string };
          }[];
          meta: { nextCursor: string | null };
        };
        rows.push(
          ...body.data.map((row) => ({
            id: row.id,
            type: row.type,
            predecessorId: row.predecessor.id,
            successorId: row.successor.id,
          })),
        );
        cursor = body.meta.nextCursor;
      } while (cursor !== null);
      return rows;
    },
    { org: orgSlug, id: planId },
  );
}

/** How many activities the plan actually holds, straight from the API. Paged; response checked. */
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

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): Locator {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/** The diagram's parallel focusable listbox (ADR-0026 D7) — the canvas's own account of itself. */
export function diagramList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/**
 * Which activity the canvas currently reports as selected, read from the parallel listbox's
 * `aria-activedescendant` (`<listboxId>-opt-<activityId>`), or null when nothing is selected.
 *
 * This is the canvas's *own* answer to "what did that click hit", which is why the diagnostic uses
 * it rather than a screenshot: it is the same id the gesture machine would have picked.
 */
export async function selectedActivityId(page: Page): Promise<string | null> {
  const active = await diagramList(page).getAttribute('aria-activedescendant');
  if (active === null) return null;
  const match = /-opt-([0-9a-f-]{36})$/.exec(active);
  return match?.[1] ?? null;
}

/** The toolbar row that carries the authoring cluster (Add / Link). */
export function doToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Build and manage' });
}

/**
 * Draw a task on the canvas via the Add split-button, and name it in the drop popover.
 *
 * Unlike `seedActivities` this goes through the **client** mutation, so it arms the coalesced
 * auto-recalculation (ADR-0032 M3, `AUTO_RECALC_DEBOUNCE_MS = 500`). That is the point: the
 * unquiescent half of the diagnostic needs a recalculation genuinely in flight, and an API-direct
 * write would never schedule one.
 */
export async function drawTask(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  await doToolbar(page)
    .getByRole('button', { name: /^Activity type:/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add to plan' }).click();
  await expect(form).toBeHidden();
}

/**
 * Arm the Link tool from the split-button's primary region, and confirm it armed. **Idempotent** —
 * the primary region is a toggle, so clicking it while already armed would disarm the tool and the
 * next helper would silently drive the wrong mode.
 */
export async function armLink(page: Page): Promise<void> {
  const armed = doToolbar(page).getByRole('button', { name: /^Linking/ });
  if ((await armed.count()) > 0) return;
  await doToolbar(page).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(armed).toBeVisible();
}

/** Arm the Add tool on the given kind, via the split-button's type menu. */
export async function armAdd(
  page: Page,
  kind: 'Task' | 'Start milestone' | 'Finish milestone',
): Promise<void> {
  await doToolbar(page)
    .getByRole('button', { name: /^Activity type:/ })
    .click();
  await page.getByRole('menuitemradio', { name: kind }).click();
  await expect(doToolbar(page).getByRole('button', { name: /^Adding/ })).toBeVisible();
}

/** Leave whatever tool is armed, by pressing Escape on the canvas until Link reads idle again. */
export async function disarm(page: Page): Promise<void> {
  await canvas(page).press('Escape');
  await canvas(page).press('Escape');
}

/** The single canvas column the probe walks, in canvas-relative pixels. */
const PROBE_X = 80;
/** Probe step, in canvas-relative pixels — comfortably under an 18 px bar in a 28 px lane. */
const PROBE_STEP_Y = 6;
/** How far down the scene the probe walks — eight lanes' worth, and no further. */
const PROBE_MAX_Y = 250;

/**
 * Walk one column of the canvas in `select` mode and return, for every activity the canvas reports
 * under it, the point that hit it. **Measured, not assumed** — which is the whole diagnostic: a
 * pick that lands on the wrong bar and a pick that is dropped are only distinguishable if you know
 * independently which bar each pixel was.
 *
 * Deliberately **one pass, one column, bounded**. Probing per-activity re-walks the scene for each
 * one, and an unbounded probe was the first version of this harness: it never finished, which is a
 * worse failure than a wrong answer because it reads as an environment problem. The column works
 * because every unconstrained task starts at the data date, so the bars stack at the left of the
 * scene one lane apart — true for the tasks this suite seeds, not for milestones.
 */
export async function mapBars(page: Page): Promise<Map<string, { x: number; y: number }>> {
  const found = new Map<string, { x: number; y: number }>();
  for (let y = 16; y <= PROBE_MAX_Y; y += PROBE_STEP_Y) {
    await canvas(page).click({ position: { x: PROBE_X, y } });
    const hit = await selectedActivityId(page);
    if (hit !== null && !found.has(hit)) found.set(hit, { x: PROBE_X, y });
  }
  return found;
}

/**
 * Drop any canvas selection, by clicking below the last lane.
 *
 * Not tidiness: a selected bar mounts the **floating selection-actions bar** over the scene
 * (TECH_DEBT #31a), and that bar tracks the selected activity — so it can come to rest on top of a
 * point a later step means to click. Playwright would then either refuse the click or send it to
 * the bar, and the failure surfaces as "no dependency was created" several assertions away from
 * its cause. One run of this suite failed in exactly that shape and did not reproduce; clearing
 * the selection removes the mechanism whether or not it was that run's.
 */
export async function clearSelection(page: Page): Promise<void> {
  // Disarm first. A canvas click only *deselects* in `select` mode; with Add armed — which it is
  // after any draw, because the tool is deliberately sticky — the same click opens the create
  // popover, and every later click lands on that instead. Not hypothetical: it is how this helper
  // failed on its first run, and the screenshot showed an empty "Activity name" field sitting on
  // top of the pick points.
  await canvas(page).press('Escape');
  await canvas(page).press('Escape');
  await canvas(page).click({ position: { x: PROBE_X, y: PROBE_MAX_Y } });
  await expect.poll(async () => await selectedActivityId(page)).toBe(null);
}

/** Look an activity up in a measured map, failing loudly — a diagnostic that silently skips a bar
 * proves nothing. */
export function requireBarPoint(
  map: ReadonlyMap<string, { x: number; y: number }>,
  activityId: string,
  label: string,
): { x: number; y: number } {
  const point = map.get(activityId);
  if (!point) throw new Error(`no canvas point hit ${label} (${activityId})`);
  return point;
}
