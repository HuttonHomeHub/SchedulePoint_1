import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **search that navigates** suite
 * (`VITE_CANVAS_SEARCH_NAV`, `docs/specs/canvas-search-navigation/`).
 *
 * The helpers below read the product's **own account of what happened** rather than pixels: the
 * canvas's parallel listbox (ADR-0026 D7) for "which bar is selected", the single polite live
 * region for "what was said", and the visible chip for "what was shown". That split matters here
 * more than usual, because the epic's whole point is that one Enter does four things — cursor,
 * centre, select, announce — and a suite that could only see one of them would pass while three
 * were broken.
 */

/** Sign up + create an organisation; returns the org slug ("Find Co" → "find-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `find-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Find Tester');
  await page.getByLabel('Email').fill(`find-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Find Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the client and project this suite's plan hangs off, landing on the project screen. */
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

/** Create a plan under the suite's project and open it (mounts the canvas workspace). */
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
 * Create activities in the open plan through the API and return them, **then recalculate**, so the
 * bars have the computed dates the cycle orders by and the viewport centres on.
 *
 * Every response is checked. A seed helper that lies about how much it seeded turns "wraps after
 * the last match" into a lottery — the assertion that matters most here is a *count*.
 *
 * Lanes are assigned round-robin rather than left to default, because two unconstrained tasks both
 * start at the data date and would stack on lane 0. Nothing in this suite clicks a bar, but the
 * ordering comparator's second key **is** the lane, and a plan where every lane is 0 would leave
 * the id tie-break carrying an assertion it was never meant to carry.
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; durationDays?: number }[],
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
      rows: readonly { name: string; durationDays?: number }[];
    }) => {
      const made: { id: string; name: string }[] = [];
      const bad: string[] = [];
      for (const [index, row] of rows.entries()) {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            type: 'TASK',
            durationDays: row.durationDays ?? 5,
            laneIndex: index,
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

  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      // Recalculate is itself pen-gated (ADR-0028). A helper that ignores the status turns a
      // test-order mistake into "no bars drew", which reads as a product defect several assertions
      // later rather than as the ordering error it is.
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: openPlanId(page) },
  );
  await page.reload();
  return result.made;
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
 * This is the surface a screen-reader user actually reaches, which is why a jump that "selects"
 * without moving it would be a defect rather than a detail.
 */
export async function selectedActivityId(page: Page): Promise<string | null> {
  const active = await diagramList(page).getAttribute('aria-activedescendant');
  if (active === null) return null;
  const match = /-opt-([0-9a-f-]{36})$/.exec(active);
  return match?.[1] ?? null;
}

/** The find/look toolbar row, which carries the search field and the frame commands. */
export function lookToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'View and navigate' });
}

/** The toolbar row that carries the authoring cluster (Add / Link). */
export function doToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Build and manage' });
}

/** The search field itself — located by its accessible name, which is what an assumption breaks on. */
export function searchField(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Search or filter activities' });
}

/**
 * The app's single polite live region (`components/ui/announcer.tsx`). Read as text, not asserted
 * visible: it is `sr-only`, so a visibility assertion would fail on a region that is working.
 */
export function announcer(page: Page): Locator {
  return page.getByTestId('announcer');
}

/** Wait for the announcer to settle on text matching `pattern`, and return what it said. */
export async function announced(page: Page, pattern: RegExp): Promise<string> {
  await expect(announcer(page)).toHaveText(pattern);
  return (await announcer(page).textContent()) ?? '';
}

/** Type a query into the search field and wait for the read-out to report a total. */
export async function search(page: Page, query: string): Promise<void> {
  await searchField(page).fill(query);
  // The field is debounced upstream of the match set; polling the read-out is the product's own
  // signal that the query has landed, and is why this helper exists rather than a fixed wait.
  await expect(matchReadout(page)).toBeVisible();
}

/**
 * The visible n-of-m chip, located by its own grammar ("12 matches" / "3 of 12").
 *
 * By **text**, not by role: the chip is deliberately `aria-hidden` so it cannot duplicate the
 * announcer, which means `getByRole` structurally cannot see it. Locating it by text is therefore
 * not a shortcut — it is the only honest way to assert that the sighted read-out exists, and the
 * separate `aria-describedby` assertions cover the channel it is hidden from.
 */
export function matchReadout(page: Page): Locator {
  return lookToolbar(page).getByText(/^(\d+ of \d+|\d+ match(es)?)$/);
}

/** Press Enter in the search field and return what the announcer said about the jump. */
export async function jumpNext(page: Page): Promise<string> {
  await searchField(page).press('Enter');
  return announced(page, /^Match \d+ of \d+: /);
}

/** Press Shift+Enter in the search field and return what the announcer said about the jump. */
export async function jumpPrevious(page: Page): Promise<string> {
  await searchField(page).press('Shift+Enter');
  return announced(page, /^Match \d+ of \d+: /);
}

/**
 * The zoom-preset **radio group**, inside the `View ▾` panel.
 *
 * ADR-0091 D3 moved the presets off the toolbar: the old `Zoom ▾` trigger labelled itself with the
 * CURRENT preset, so a planner hunting for `Fit to plan` met a button reading `Week`. There is no
 * trigger to read a level off any more, so {@link openZoomPresets} opens the panel and the level is
 * read from which radio is checked.
 */
export async function openZoomPresets(page: Page): Promise<Locator> {
  const view = lookToolbar(page).getByRole('button', { name: /^View/ });
  if ((await view.getAttribute('aria-expanded')) !== 'true') await view.click();
  return page.getByRole('dialog', { name: 'View' }).getByRole('radiogroup', { name: 'Zoom level' });
}

/**
 * Close the `View ▾` panel if it is open.
 *
 * Both helpers below must do this, and forgetting it is not a tidy-up: the panel is an overlay, so
 * leaving it open makes every toolbar control underneath unclickable and the NEXT assertion fails
 * with a timeout that says nothing about the panel. That is exactly how the first version of this
 * rewrite failed.
 */
async function closeViewPanel(page: Page): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'View' });
  if (await panel.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  }
}

/** Pick a zoom preset from the `View ▾` panel, and wait for it to report the new level. */
export async function pickZoomPreset(page: Page, level: string): Promise<void> {
  const group = await openZoomPresets(page);
  // Matched by PREFIX: each row carries the range it frames ("Year — 3 years"). Native radios now,
  // not `menuitemradio` — the exclusivity that role expressed is expressed by the input itself.
  const row = group.getByRole('radio', { name: new RegExp(`^${level}\\b`) });
  await row.check();
  await expect(row).toBeChecked();
  await closeViewPanel(page);
}

/** The level the panel currently reports — the control's own answer, not the canvas's. */
export async function reportedZoomLevel(page: Page): Promise<string> {
  const group = await openZoomPresets(page);
  const name = await group.getByRole('radio', { checked: true }).evaluate((el) => {
    const label = (el as HTMLElement).closest('label');
    return label?.textContent?.trim() ?? '';
  });
  await closeViewPanel(page);
  // Strip the range suffix — callers compare LEVELS, and "Year — 3 years" is a row label.
  return name.split('—')[0]!.trim();
}

/**
 * Arm the Link tool from the split-button's primary region, and confirm it armed. **Idempotent** —
 * the primary region is a toggle, so clicking it while already armed would disarm the tool and the
 * Escape-precedence assertion would then be testing nothing.
 */
export async function armLink(page: Page): Promise<void> {
  const armed = doToolbar(page).getByRole('button', { name: /^Linking/ });
  if ((await armed.count()) > 0) return;
  await doToolbar(page).getByRole('button', { name: 'Link', exact: true }).click();
  await expect(armed).toBeVisible();
}

/** Whether the Link tool currently reads as armed, from the toolbar's own label. */
export async function linkIsArmed(page: Page): Promise<boolean> {
  return (
    (await doToolbar(page)
      .getByRole('button', { name: /^Linking/ })
      .count()) > 0
  );
}

/** Switch the workspace to the Gantt and wait for the grid. */
export async function showGantt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(ganttGrid(page)).toBeVisible();
}

/** Switch the workspace back to the diagram and wait for the canvas. */
export async function showDiagram(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
}

/** The Gantt's treegrid. */
export function ganttGrid(page: Page): Locator {
  return page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
}
