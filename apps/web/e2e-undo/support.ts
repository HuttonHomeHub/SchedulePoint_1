import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **undo / redo** suite (`VITE_UNDO_REDO`, ADR-0048). Mirrors the
 * canvas-first authoring helpers (this surface layers on that one): sign up → org → client → project →
 * plan, take the pen, and draw activities on the canvas — then the spec reverses those edits with the
 * toolbar controls + keybindings.
 */

/** Sign up + create an organisation; returns the org slug (name "Undo Co" → "undo-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `undo-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Undo Tester');
  await page.getByLabel('Email').fill(`undo-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Undo Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open it (mounts the canvas-first authoring workspace). */
export async function openNewPlan(page: Page): Promise<void> {
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
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

/** Take the pen so the authoring affordances (and undo/redo) go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw a task on the canvas via the Add split-button (ADR-0032 M4): open the `Add▾` menu, pick Task
 * (which arms add mode), click the canvas at `pos`, then name + commit in the drop popover.
 */
export async function drawTask(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  // The Add control is a true split button (ADR-0064 T3): its primary region arms the tool, and the
  // caret — located here by its `Activity type: <kind>` label — opens the kind menu.
  await page.getByRole('button', { name: /^Activity type:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add to plan' }).click();
  await expect(form).toBeHidden();
}

/**
 * Expand the activities panel, which is **collapsed by default** (ADR-0030 — the canvas gets the
 * room).
 *
 * Written the naive way first (go straight for the row menu) and it timed out on the first run,
 * which is the whole reason this suite runs locally before it ships. The shape below is
 * `e2e-activity-editor/support.ts`'s, deliberately copied rather than re-derived, including its
 * race guard: asserting one of the two buttons is visible **before** asking which, so a check that
 * runs before the app has painted cannot answer "not collapsed" and skip the expand.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

/**
 * Open an activity's **Logic** surface. Convergence-flag-on (the default this config inherits) that
 * is the tabbed editor's Logic tab; the helper goes through the activities table's row menu, which
 * is the route a planner takes and therefore the one worth proving.
 */
export async function openLogic(page: Page, activityName: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  await expect(page.getByRole('heading', { name: 'Add a link' })).toBeVisible();
}

/**
 * Link the open activity to `otherName` as its successor, with a whole-day lag.
 *
 * Deliberately the inline **Add a link** section rather than the canvas two-click Link tool: the
 * subject here is the Edit-link dialog's undo seam, and a canvas pick would make a failure
 * ambiguous between "the link was not drawn" and "the edit was not recorded" — the ambiguity
 * ADR-0064's own harness was built to remove.
 */
export async function addLink(page: Page, otherName: string, lag: string): Promise<void> {
  await page.getByLabel('Link it as').selectOption('successor');
  // `selectOption`'s `label` is an exact string, never a pattern — the first version passed a
  // RegExp behind an `as never` and the compiler said nothing while the browser refused it
  // ("expected string, got object"). The option's visible text is `CODE — Name` when the activity
  // has a code and `Name` when it does not, so the id is resolved from the option whose text
  // CONTAINS the name and the select is driven by value, which is stable either way.
  const picker = page.getByLabel('Successor activity');
  const value = await picker
    .locator('option', { hasText: otherName })
    .first()
    .getAttribute('value');
  if (!value) throw new Error(`no option for ${otherName} in the successor picker`);
  await picker.selectOption(value);
  await page.getByLabel(/^Lag \(/).fill(lag);
  await page.getByRole('button', { name: 'Add link' }).click();
}

/**
 * Read the open plan's dependencies straight from the REST API, in the page's own session.
 *
 * The assertion this exists for is about **stored minutes**, and the field cannot display them on
 * the degraded path (`lagDays` is rounded, and the sub-day control needs a resolvable
 * working-hours factor). Reading the DOM back would therefore prove the form re-rendered, not that
 * the undo restored what was there — which is the whole defect the seam guards against.
 *
 * The org slug and plan id come from `location.pathname` (`/orgs/:slug/plans/:id`) rather than
 * being threaded through the spec: the page is already on that URL, so a mismatch between what the
 * test thinks it opened and what it opened cannot hide. Note the API path says `organizations`
 * where the client route says `orgs` — they are genuinely different, and writing `orgs` here
 * returns a 404 whose body still parses, so the helper asserts the status.
 */
export async function apiDependencies(
  page: Page,
): Promise<{ id: string; lagMinutes: number; lagDays: number; type: string }[]> {
  return page.evaluate(async () => {
    const match = /\/orgs\/([^/]+)\/plans\/([^/?#]+)/.exec(window.location.pathname);
    if (!match) throw new Error(`not on a plan route: ${window.location.pathname}`);
    const res = await fetch(
      `/api/v1/organizations/${match[1]}/plans/${match[2]}/dependencies?limit=100`,
      { credentials: 'include' },
    );
    if (!res.ok) throw new Error(`dependencies read failed: ${res.status}`);
    const body = (await res.json()) as {
      data: { id: string; lagMinutes: number; lagDays: number; type: string }[];
    };
    return body.data;
  });
}
