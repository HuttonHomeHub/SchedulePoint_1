import { expect, test, type Page } from '@playwright/test';

import { addActivity, openNewPlan, setPlannedStart, startEditing } from './support';

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
  await page.getByRole('button', { name: /create an account/i }).click();
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
  await expect(a.getByRole('heading', { name: 'Welcome to SchedulePoint' })).toBeVisible();

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
  // One activity, so B has a row (and therefore a row menu) to look at while locked out.
  await addActivity(a, 'Excavate');

  // --- B opens the plan: read-only, held by A, with a Request-control affordance -------------
  await b.goto(planUrl);
  const requestBtn = b.getByRole('button', { name: 'Request control' });
  await expect(requestBtn).toBeVisible();
  await expect(b.getByRole('button', { name: 'New activity' })).toHaveCount(0);

  // --- The row menu shades rather than hides, and says why (ADR-0082) -----------------------
  // The only place this can be checked: `canEditSchedule` is false here because a *peer holds the
  // pen*, which no mocked test distinguishes from "your role cannot write" — and the sentence is
  // the whole point of the change. Before ADR-0082 the four write actions were simply absent, so
  // this assertion fails against the old code by not finding the item at all.
  await b.getByRole('button', { name: 'Actions for Excavate' }).click();
  const lockedMenu = b.getByRole('menu');
  const lockedEdit = lockedMenu.getByRole('menuitem', { name: 'Edit' });
  await expect(lockedEdit).toHaveAttribute('aria-disabled', 'true');
  const reasonId = await lockedEdit.getAttribute('aria-describedby');
  expect(reasonId).not.toBeNull();
  // The reason is a real sentence naming a next step, not a bare "Read-only" — and it names the
  // control THIS reader can actually see. That is `docs/TECH_DEBT.md` #115, and this assertion is
  // where it was found: the sentence used to read "Start editing to change this activity" while
  // the same page showed **Request control** and no Start-editing button at all, a few lines from
  // the `requestBtn` this test clicks next. ADR-0083 M7 routed all eleven such sites through one
  // `scheduleRefusal`, so the frame is chosen from the live pen state and the peer is named.
  const reason = b.locator(`#${reasonId ?? ''}`);
  // "Holder", not "Holder A": `lockCopy.heldByOther` renders the FIRST NAME only, which is what
  // the pen banner shows, so the two surfaces cannot describe one state two ways.
  await expect(reason).toHaveText(
    /Holder is editing this plan\. Request control to change this activity\./,
  );
  // Stated negatively too, because the defect was a plausible-looking sentence rather than a
  // missing one: nothing here may offer a control this reader does not have.
  await expect(reason).not.toHaveText(/Start editing/);
  // A shaded item stays an arrow-key stop, which is the only way that sentence is reachable by
  // keyboard. `itemsOf` filtered disabled items until ADR-0082, so this line is the primitive's
  // posture change observed through the product rather than through the primitive's own suite.
  const labels = await lockedMenu.getByRole('menuitem').allTextContents();
  const editIndex = labels.indexOf('Edit');
  expect(editIndex).toBeGreaterThan(-1);
  await b.keyboard.press('Home');
  for (let i = 0; i < editIndex; i += 1) await b.keyboard.press('ArrowDown');
  await expect(lockedEdit).toBeFocused();
  await b.keyboard.press('Escape');

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

  // ...and the same row-menu item is now live, with the reason gone. Asserting both ends of one
  // hand-off is what makes this a statement about the *gate* rather than about a snapshot: the
  // shaded and the actionable state are the same control, on the same row, for the same person.
  await b.getByRole('button', { name: 'Actions for Excavate' }).click();
  const freeEdit = b.getByRole('menu').getByRole('menuitem', { name: 'Edit' });
  await expect(freeEdit).not.toHaveAttribute('aria-disabled', 'true');
  await expect(freeEdit).not.toHaveAttribute('aria-describedby', /./);
  await b.keyboard.press('Escape');

  // The other surface's sentence for the same state, so the two cannot drift into two mental
  // models — which is the defect `docs/TECH_DEBT.md` #111 actually described. The pen has moved,
  // so A is now the locked-out one and B is the named holder: the mirror image of the assertion
  // above, and the proof that the sentence follows the live state rather than a constant. It named
  // "Start editing" for BOTH readers until ADR-0083 M7, which is exactly how a constant fails —
  // it is right for whoever it was written about and wrong for everybody else.
  await refetchLock(a);
  await a.bringToFront();
  await a.getByRole('button', { name: 'Actions for Excavate' }).click();
  const aEdit = a.getByRole('menu').getByRole('menuitem', { name: 'Edit' });
  await expect(aEdit).toHaveAttribute('aria-disabled', 'true', CROSS_ACTOR);
  const aReasonId = await aEdit.getAttribute('aria-describedby');
  await expect(a.locator(`#${aReasonId ?? ''}`)).toHaveText(
    /Peer is editing this plan\. Request control to change this activity\./,
    CROSS_ACTOR,
  );
  await a.keyboard.press('Escape');

  await ctxA.close();
  await ctxB.close();
});
