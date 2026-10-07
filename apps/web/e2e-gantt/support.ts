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
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
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

  /**
   * **Tell the client what just happened out of band.**
   *
   * Everything above went straight to the REST API, so the open page knows about none of it: not
   * the activities, not the recalculation. That did not matter while `Recalculate` was an
   * unconditional toolbar command — every journey pressed it next, the press was a real mutation,
   * and invalidating the plan's queries was a side effect the suites had come to rely on without
   * anyone writing it down.
   *
   * ADR-0109 D3 made that control conditional: it appears only when the schedule is behind the
   * plan, and a client that believes the plan is empty believes it is current. So the shared
   * `recalculate()` helper correctly pressed nothing, and six `e2e-gantt-editing` specs opened a
   * Gantt with no rows in it.
   *
   * A reload is the established idiom here (`e2e-workspace-chrome/support.ts` does exactly this,
   * with the same one-line reason) and it belongs at the point of the out-of-band write rather than
   * in a helper that has no way to know one happened.
   *
   * **`ensurePen` after it, and that is not belt-and-braces.** A reload drops this session's hold on
   * the plan lock, and every caller here seeds while holding it — so without this the next write
   * gets a 423, which is exactly what the first version of this change produced (`create summary:
   * 423`, five specs). `ensurePen` is idempotent by construction: it reads what the toolbar says
   * rather than assuming, which its own docblock added for this same reload case.
   */
  await syncClient(page);
}

/**
 * **A nest of five WBS summaries with a task at the bottom**, through the public API: `Phase 1` at
 * depth 0 down to `Phase 5` at depth 4, and `Pour footing and backfill` (a task) under `Phase 5`.
 *
 * Test-local, and it exists because nothing else here can reach depth 4. The catalogue's
 * `plan:capability-types-and-wbs` stops at depth 1 (one summary, two leaves) and `seedActivities`
 * cannot set a parent; `parentId` is on the create DTO, so each child names its parent when it is
 * made. Recalculated and synced as `seedActivities` does, then the Gantt is opened (an empty plan
 * has no grid to open), and **only then** is every level's row asserted visible: the panel starts
 * with nothing collapsed, and the Gantt has no expand-all control to drive, so visibility is the
 * thing to check rather than a step to take.
 */
export async function seedNestedWbs(page: Page, orgSlug: string): Promise<string[]> {
  const planId = openPlanId(page);
  const names = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'];
  const failures = await page.evaluate(
    async ({ org, id, summaries }: { org: string; id: string; summaries: string[] }) => {
      const url = `/api/v1/organizations/${org}/plans/${id}/activities`;
      const post = async (body: Record<string, unknown>): Promise<string> => {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`${String(body.name)}: ${response.status}`);
        return ((await response.json()) as { data: { id: string } }).data.id;
      };
      try {
        let parentId: string | null = null;
        for (const name of summaries) {
          parentId = await post({
            name,
            type: 'WBS_SUMMARY',
            ...(parentId === null ? {} : { parentId }),
          });
        }
        await post({ name: 'Pour footing and backfill', durationDays: 5, parentId });
        const recalc = await fetch(
          `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
          {
            method: 'POST',
            credentials: 'include',
          },
        );
        if (!recalc.ok) throw new Error(`recalculate: ${recalc.status}`);
        return null;
      } catch (error) {
        return String(error);
      }
    },
    { org: orgSlug, id: planId, summaries: names },
  );
  if (failures !== null) throw new Error(`seedNestedWbs: ${failures}`);
  await syncClient(page);
  await showGantt(page);
  for (const name of [...names, 'Pour footing and backfill']) {
    await expect(ganttRow(page, name), `${name} is visible after the recalculation`).toBeVisible();
  }
  return names;
}

/**
 * **Make the open page aware of a write that went straight to the REST API.**
 *
 * Named rather than inlined because it is a rule, not a step: **a journey that writes through the
 * API tells the client itself** (`docs/TECH_DEBT.md` #183). Suites here seed activities and links
 * with `page.evaluate` — much faster than driving the UI, and correct — and the open page knows
 * about none of it. That did not matter while `Recalculate` was an unconditional toolbar command,
 * because every journey pressed it next and the press invalidated the plan's queries as a side
 * effect nobody had written down. ADR-0109 D3 made that control conditional, and a client that
 * believes the plan is empty believes it is current.
 *
 * The reload is the established idiom (`e2e-workspace-chrome/support.ts`); the `ensurePen` after it
 * is the part that is easy to miss, because a reload drops this session's hold on the plan lock and
 * the next write then 423s several specs later, a long way from the cause.
 */
export async function syncClient(page: Page): Promise<void> {
  await page.reload();
  await ensurePen(page);
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

/**
 * **The pinned columns end exactly where the chart begins** — the invariant ADR-0095's `Float`
 * incident violated and `grid-width.structural.test.ts` pins in arithmetic. Lifted out of
 * `gantt.spec.ts` (where it was a closure) so the column-widths journey asserts the same thing the
 * same way; a second copy would be two definitions of "meets" that could drift apart.
 *
 * Only meaningful at `scrollLeft: 0`. The pinned block is `position: sticky; left: 0`, so once the
 * scroller moves the chart header slides UNDER it and the two edges legitimately overlap — an
 * assertion taken mid-scroll would report the defect it is looking for.
 *
 * ONE equality catches both ways the arithmetic can be wrong: a column overflowing onto the chart
 * reads as `>`, a gap between the two as `<`.
 */
export async function chartMeetsGrid(page: Page, where: string): Promise<void> {
  const grid = ganttGrid(page);
  await grid.evaluate((el) => {
    let node = el.parentElement;
    while (node && node.scrollWidth <= node.clientWidth) node = node.parentElement;
    if (node) node.scrollLeft = 0;
  });
  const heads = await grid.getByRole('columnheader').evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      return { name: (el.textContent ?? '').trim(), left: box.left, right: box.right };
    }),
  );
  // The Timeline header's text includes its ruler labels, so it is matched by prefix.
  const timeline = heads.find((h) => h.name.startsWith('Timeline'));
  // `Actions` is `sr-only`, so it takes no layout and its rect says nothing about the pane.
  const pinned = heads.filter((h) => !h.name.startsWith('Timeline') && h.name !== 'Actions');
  expect(timeline, `${where}: no Timeline column header`).toBeDefined();
  expect(pinned.length, `${where}: no pinned column headers`).toBeGreaterThan(0);
  expect(
    Math.round(Math.max(...pinned.map((h) => h.right))),
    `${where}: the pinned columns do not end where the chart begins — ${JSON.stringify(heads)}`,
  ).toBe(Math.round(timeline?.left ?? -1));
}
