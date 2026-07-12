import { expect, test, type Page } from '@playwright/test';

import { openNewPlan, setPlannedStart, startEditing } from './support';

/**
 * Flag-ON multi-actor pen hand-off journey (TECH_DEBT #27b). Two real users in one org:
 * the holder takes the pen; a second Planner requests control; the holder hands over; the
 * pen moves and the ex-holder drops to read-only. Proves the graceful peer hand-off
 * (ADR-0028 Q-A) end to end in a real browser — the piece the single-actor journeys can't cover.
 *
 * Cross-actor propagation: in the app the lock status polls (15 s) and refetches on focus, but a
 * backgrounded tab pauses the interval and headless focus events are unreliable, so each actor is
 * nudged to re-pull the peer's action via {@link refetchLock} before asserting (the generous
 * timeout is a backstop). The propagation mechanism itself is covered by the unit tests.
 */
const CROSS_ACTOR = { timeout: 20_000 };

/**
 * Force the lock-status query to re-pull the peer's latest action WITHOUT unloading the page — a
 * `reload()` would fire the holder's `pagehide` pen-release. Bringing the page to front + a
 * `visibilitychange` triggers TanStack Query's focus refetch (the status query is always stale).
 */
async function refetchLock(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
}

test('a Planner requests control and the holder hands the pen over (peer hand-off)', async ({
  browser,
}) => {
  const stamp = Date.now();
  const orgName = `Handoff Co ${stamp}`;

  // --- Holder A: create the org, invite a Planner B, then create + open a plan --------------
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await signUp(a, 'Holder A', `holder-${stamp}@example.com`);
  await a.getByLabel('Organisation name').fill(orgName);
  await a.getByRole('button', { name: /create organisation/i }).click();
  await expect(a.getByRole('heading', { name: orgName })).toBeVisible();

  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const dialog = a.getByRole('dialog');
  await dialog.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await dialog.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await a.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  await openNewPlan(a);
  await setPlannedStart(a, '2026-01-01');
  const planUrl = a.url();

  // --- Peer B: accept the invite, joining A's org as a Planner -------------------------------
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await signUp(b, 'Peer B', `peer-${stamp}@example.com`);
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);

  // --- A takes the pen ----------------------------------------------------------------------
  await a.bringToFront();
  await a.goto(planUrl);
  await startEditing(a);

  // --- B opens the plan: read-only, held by A, with a Request-control affordance -------------
  await b.goto(planUrl);
  const requestBtn = b.getByRole('button', { name: 'Request control' });
  await expect(requestBtn).toBeVisible();
  await expect(b.getByRole('button', { name: 'New activity' })).toHaveCount(0);
  await requestBtn.click();
  await expect(b.getByText(/Requested — waiting/i)).toBeVisible();

  // --- A sees the incoming request and hands over -------------------------------------------
  await refetchLock(a);
  const handOver = a.getByRole('button', { name: 'Hand over' });
  await expect(handOver).toBeVisible(CROSS_ACTOR);
  await handOver.click();
  // A has given up the pen → read-only (no editing affordances). A is the Org Admin, so its
  // held-by-other controls differ from a Planner's; asserting the pen is gone stays role-agnostic.
  await expect(a.getByRole('button', { name: 'Stop editing' })).toHaveCount(0, CROSS_ACTOR);
  await expect(a.getByRole('button', { name: 'New activity' })).toHaveCount(0);

  // --- B now holds the pen: editing affordances are live ------------------------------------
  await refetchLock(b);
  await expect(b.getByRole('button', { name: 'Stop editing' })).toBeVisible(CROSS_ACTOR);
  await expect(b.getByRole('button', { name: 'New activity' })).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
