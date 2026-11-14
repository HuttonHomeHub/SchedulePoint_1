import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { holdThePen, releaseThePen } from '../e2e-support/pen';

/**
 * Shared journey helpers for the flag-ON editing suite. These drive the plan
 * hierarchy the same way a planner would (no API short-cuts), so the journeys
 * exercise the real UI end to end.
 */

/** Sign up + create an organisation; returns the org slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `edit-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Edit Tester');
  await page.getByLabel('Email').fill(`edit-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Edit Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open the plan detail. */
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
  await page.getByRole('dialog').getByLabel('Start date').fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
}

/** Set the plan's planned start (needed before the schedule can compute). */
export async function setPlannedStart(page: Page, isoDate: string): Promise<void> {
  await page.getByRole('button', { name: 'Edit plan details' }).click();
  await page.getByRole('dialog').getByLabel('Data date').fill(isoDate);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
}

/** Add an activity through the activities-table dialog (requires the pen when enforced). */
/**
 * Make the activities table visible.
 *
 * The panel is **collapsed by default** on the plan workspace (ADR-0030), and it returns to that
 * default on every reload — which is what this suite does mid-test to defeat the client cache. So
 * this is needed in two places, not one: before the New-activity button can be clicked, and again
 * after any `page.reload()` before the table can be read. Idempotent, so calling it when the panel
 * is already open costs nothing.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  // **Wait on the TOGGLE, not on the table.** Two traps, both paid for:
  //
  // 1. `DataTable` returns its empty state instead of a `<table>` when there are no rows
  //    (`data-table.tsx:86`), so an empty plan has no table to wait for — and this helper runs
  //    before the first activity exists.
  // 2. `isVisible()` is a snapshot, not a wait. Called straight after `page.reload()` it answers
  //    "no" because the app has not painted, the expand is skipped, and the missing table then
  //    reads exactly like the edit under test having failed to persist.
  //
  // The toggle is present in one state or the other whenever the workspace has rendered, which is
  // the invariant worth waiting on. Idempotent.
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

export async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/**
 * Wait until the open plan actually has a computed schedule.
 *
 * `recalculate` only presses the button; the sequencing checkpoint that followed it used to be
 * `getByText('Project finish')`, the legacy stacked page's `ScheduleSummaryStrip` label. The
 * workspace shows that fact as the toolbar's finish chip instead — which renders the DATE, carries
 * the words only as an accessible name, and **withholds itself below the `compact` density band**
 * (ADR-0092: a `render` item cannot demote, so its only way to yield width is to disappear). At
 * this suite's viewport it is legitimately absent, so no locator for it can work.
 *
 * Asserting the computed dates at the API is both width-independent and a stronger claim than the
 * label ever made: it proves the schedule computed rather than that a word rendered.
 */
export async function awaitComputedSchedule(page: Page, orgSlug: string): Promise<void> {
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ slug, id }: { slug: string; id: string }) => {
            const res = await fetch(`/api/v1/organizations/${slug}/plans/${id}/activities`, {
              credentials: 'include',
            });
            if (!res.ok) return 0;
            const body = (await res.json()) as { data: { earlyFinish: string | null }[] };
            return body.data.filter((a) => a.earlyFinish !== null).length;
          },
          { slug: orgSlug, id: planId },
        ),
      { message: 'the recalculation never produced computed dates', timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}

/**
 * Force the lock-status query to re-pull the peer's latest action WITHOUT unloading the page — a
 * `reload()` would fire the holder's `pagehide` pen-release. Bringing the page to front + a
 * `visibilitychange` triggers TanStack Query's focus refetch (the status query is always stale).
 */
export async function refetchLock(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
}

/** A signed-in member of the organisation, beyond the two the fixture always creates. */
export interface Member {
  ctx: BrowserContext;
  page: Page;
}

export interface TwoActors {
  ctxA: BrowserContext;
  a: Page;
  ctxB: BrowserContext;
  b: Page;
  /** One entry per role asked for in `extraRoles`, in order. */
  extras: Member[];
  planUrl: string;
  orgName: string;
}

/**
 * Two real actors in one organisation, with a plan created and nobody holding the pen — plus one
 * more member for each role in `extraRoles`.
 *
 * **Extracted at the `docs/TECH_DEBT.md` #286 slice, and the extraction is a MOVE.** Every
 * assertion in the hand-off test is unchanged by it, so that test is the oracle for this
 * function being correct — the ADR-0078 barrel-preserving argument applied to a fixture rather
 * than to a module. Three transitions had no client coverage and each needs this same thirty-line
 * setup; re-typing it three times is how two fixtures drift into describing different worlds.
 * Moved again into this file for ADR-0220's journey, which needs the same world with a Viewer and
 * a second Planner added.
 *
 * **A is the organisation's creator and therefore an Org Admin.** That is not incidental: it is
 * what makes the override transition reachable at all, since `canTakeOverNow` returns true on
 * `perms.override` before it looks at a request or a heartbeat. **B is a Planner** — it can
 * request, and it can take over once grace has elapsed, and it can never override. The two roles
 * are the two halves of ADR-0028's hand-off model, so one fixture serves every case.
 *
 * **"Nobody holds the pen" is made true on purpose.** A creates the plan by opening it, and since
 * ADR-0220 opening a free plan takes the pen — so A would still be holding it when the fixture
 * returned. A presses Stop editing before leaving, and that is also what makes the later reopening
 * a fresh one: Stop is respected only until the plan is next opened.
 */
export async function setUpTwoActors(
  browser: Browser,
  extraRoles: readonly ('PLANNER' | 'VIEWER')[] = [],
): Promise<TwoActors> {
  const stamp = Date.now();
  const orgName = `Handoff Co ${stamp}`;
  const emails = {
    peer: `peer-${stamp}@example.com`,
    extras: extraRoles.map((_, i) => `extra${i}-${stamp}@example.com`),
  };

  // --- Holder A: create the org, invite the members, then create + open a plan -------------
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await signUp(a, 'Holder A', `holder-${stamp}@example.com`);
  await a.getByLabel('Organisation name').fill(orgName);
  await a.getByRole('button', { name: /create organisation/i }).click();
  // The landing is the organisation overview (ADR-0098), so its `<h1>` is the organisation's own
  // name — it was 'Welcome to SchedulePoint' until that screen was replaced. Asserting the name is
  // the stronger claim anyway: it proves this actor landed in the organisation they just created.
  await expect(a.getByRole('heading', { level: 1, name: orgName })).toBeVisible();

  const invite = async (email: string, role: 'PLANNER' | 'VIEWER'): Promise<string> => {
    await a.getByRole('link', { name: 'Members' }).click();
    await a.getByRole('button', { name: 'Invite member' }).click();
    const dialog = a.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByLabel('Role', { exact: true }).selectOption(role);
    await dialog.getByRole('button', { name: /send invitation/i }).click();
    const url = await a.getByLabel('Invitation link').inputValue();
    await a.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    return url;
  };
  const acceptUrl = await invite(emails.peer, 'PLANNER');
  const extraUrls: string[] = [];
  for (const [i, role] of extraRoles.entries()) {
    extraUrls.push(await invite(emails.extras[i] ?? '', role));
  }

  await openNewPlan(a);
  await setPlannedStart(a, '2026-01-01');
  const planUrl = a.url();
  // The plan was opened free, so A holds it now; let go so the fixture's promise is true. Settling
  // on "held" first (which presses Start only if it is offered) keeps the fixture independent of
  // the very behaviour the journeys built on it are testing.
  await holdThePen(a);
  await releaseThePen(a);

  // --- Everybody else accepts the invitation, joining A's org --------------------------------
  const join = async (name: string, email: string, url: string): Promise<Member> => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page, name, email);
    await page.goto(url);
    await page.getByRole('button', { name: /accept and join/i }).click();
    await expect(page).toHaveURL(/\/orgs\//);
    return { ctx, page };
  };
  const { ctx: ctxB, page: b } = await join('Peer B', emails.peer, acceptUrl);
  const extras: Member[] = [];
  for (const [i, url] of extraUrls.entries()) {
    extras.push(await join(`Extra ${i}`, emails.extras[i] ?? '', url));
  }

  return { ctxA, a, ctxB, b, extras, planUrl, orgName };
}
