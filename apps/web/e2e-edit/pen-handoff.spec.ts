import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { addActivity, showActivities, openNewPlan, setPlannedStart, startEditing } from './support';

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

interface TwoActors {
  ctxA: BrowserContext;
  a: Page;
  ctxB: BrowserContext;
  b: Page;
  planUrl: string;
  orgName: string;
}

/**
 * Two real actors in one organisation, with a plan created and nobody holding the pen.
 *
 * **Extracted at the `docs/TECH_DEBT.md` #286 slice, and the extraction is a MOVE.** Every
 * assertion in the hand-off test below is unchanged by it, so that test is the oracle for this
 * function being correct — the ADR-0078 barrel-preserving argument applied to a fixture rather
 * than to a module. Three transitions had no client coverage and each needs this same thirty-line
 * setup; re-typing it three times is how two fixtures drift into describing different worlds.
 *
 * **A is the organisation's creator and therefore an Org Admin.** That is not incidental: it is
 * what makes the override transition reachable at all, since `canTakeOverNow` returns true on
 * `perms.override` before it looks at a request or a heartbeat. **B is a Planner** — it can
 * request, and it can take over once grace has elapsed, and it can never override. The two roles
 * are the two halves of ADR-0028's hand-off model, so one fixture serves every case.
 */
async function setUpTwoActors(browser: Browser): Promise<TwoActors> {
  const stamp = Date.now();
  const orgName = `Handoff Co ${stamp}`;

  // --- Holder A: create the org, invite a Planner B, then create + open a plan --------------
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await signUp(a, 'Holder A', `holder-${stamp}@example.com`);
  await a.getByLabel('Organisation name').fill(orgName);
  await a.getByRole('button', { name: /create organisation/i }).click();
  // The landing is the organisation overview (ADR-0098), so its `<h1>` is the organisation's own
  // name — it was 'Welcome to SchedulePoint' until that screen was replaced. Asserting the name is
  // the stronger claim anyway: it proves this actor landed in the organisation they just created.
  await expect(a.getByRole('heading', { level: 1, name: orgName })).toBeVisible();

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

  return { ctxA, a, ctxB, b, planUrl, orgName };
}

test('a Planner requests control and the holder hands the pen over (peer hand-off)', async ({
  browser,
}) => {
  /**
   * **120 s, matching every other multi-actor journey here.** This drives two whole browser
   * contexts through two sign-ups, an invitation, a plan, and a full request → hand-off → mirror
   * cycle, and it had been running just inside Playwright's 30 s default. ADR-0099's heavier plan
   * mount pushed it over, and the failure was a timeout in the last third rather than anything
   * disagreeing — established by reading where it stopped (line 154, the second-to-last assertion),
   * not by assuming. Raising the cap is the honest fix for a fixture that is genuinely long; the
   * alternative, splitting it, would give up the thing it exists to prove, which is that both ends
   * of ONE hand-off agree.
   */
  test.setTimeout(120_000);
  const { ctxA, a, ctxB, b, planUrl } = await setUpTwoActors(browser);

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
  // B never adds anything, so nothing has expanded its activities panel — and the row menu this
  // assertion is about lives inside it. A's panel was expanded as a side effect of `addActivity`;
  // the reader's was not, which is exactly the asymmetry the collapsed default introduces.
  await showActivities(b);
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
  // **Scoped to the live region, not to the page.** This read `b.getByText(/Requested — waiting/i)`
  // and went ambiguous at console M5: the pen's verb moved to the command deck, where a shaded
  // control carries its reason as an `sr-only` sibling linked by `aria-describedby` (ADR-0082), and
  // the lock's own sentence is that reason. So the same words are now legitimately on screen twice —
  // once as the button's description, once as the `role="status"` sentence ADR-0112 D1 put in the
  // foot row — and an unscoped match resolved to both. Neither copy is a defect: the name stays
  // pinned to `Start editing` by `aria-label`, so nothing is announced twice in one breath.
  //
  // Asserting the STATUS region is strictly stronger than what it replaces: it says the sentence
  // reached the live region a requester is told to watch, which the old line could have satisfied
  // from the sr-only span alone.
  await expect(b.getByRole('status').filter({ hasText: /Requested — waiting/i })).toBeVisible();

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

/**
 * **Admin override — `docs/TECH_DEBT.md` #286, transition 1 of 3.**
 *
 * An Org Admin takes the pen from a holder with no request and no waiting. This is the one
 * transition that bypasses ADR-0028's whole negotiation: `canTakeOverNow` returns true on
 * `perms.override` **before** it evaluates a request or a heartbeat, so nothing the holder does
 * affects it. It is also the transition with the sharpest consequence for the other person — they
 * are editing, and then they are not — which is why the confirm dialog exists and why its body
 * promises that unsaved work "stays as it was".
 *
 * The reason this could never be a unit test: `canOverride` is a server-computed capability on the
 * lock status, so a mocked status can assert the button renders and can never assert that the
 * **server agrees** this caller may override. Only a real Org Admin against a real API proves it.
 */
test('an Org Admin overrides a peer who is editing, and the peer is told they lost it', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { ctxA, a, ctxB, b, planUrl } = await setUpTwoActors(browser);

  // --- B (Planner) takes the pen first, so A has somebody to override -----------------------
  await b.bringToFront();
  await b.goto(planUrl);
  await startEditing(b);
  await addActivity(b, 'Piling');
  await expect(b.getByRole('button', { name: 'Stop editing' })).toBeVisible();

  // --- A (Org Admin) opens the plan and is offered the override, not a request ---------------
  await a.bringToFront();
  await a.goto(planUrl);
  // The discriminator, asserted in BOTH directions. An admin gets `takeOver` ("Take over"); a
  // Planner in the same position gets `requestControl`. Asserting only the presence of one would
  // pass against a build that offered every control to everybody, which is the shape of an
  // authorisation defect rather than a layout one.
  const overrideBtn = a.getByRole('button', { name: 'Take over', exact: true });
  await expect(overrideBtn).toBeVisible(CROSS_ACTOR);
  await expect(a.getByRole('button', { name: 'Request control' })).toHaveCount(0);

  // The admin is told WHY they have a control nobody else has. `adminNote` is appended to
  // `heldByOther`, so the sentence names the holder and the reason in one breath.
  await expect(
    a.getByRole('status').filter({ hasText: /As an admin, you can take over editing\./ }),
  ).toBeVisible(CROSS_ACTOR);

  // --- The confirmation is a real gate, and cancelling leaves the pen where it was -----------
  // Asserted because an override is not undoable from this side: once taken, B's pen is gone and
  // only B can get it back. A confirm dialog that does not actually hold is worse than none.
  await overrideBtn.click();
  // `role="alertdialog"`, NOT `dialog` — `ConfirmDialog` sets it (`confirm-dialog.tsx:46`) because
  // this interrupts to confirm a consequence rather than to host a task. Written as `getByRole
  // ('dialog')` first, which found nothing: the assertion failed loudly, which is the right way
  // round, but it is worth naming because a locator reaching for the wrong role and happening to
  // match something would have asserted against the wrong element entirely.
  const confirm = a.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'Take over editing?' })).toBeVisible();
  await expect(confirm).toContainText(/Any change they haven’t saved stays as it was\./);
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await refetchLock(b);
  await expect(b.getByRole('button', { name: 'Stop editing' })).toBeVisible(CROSS_ACTOR);

  // --- Now confirm it for real ---------------------------------------------------------------
  await a.bringToFront();
  await overrideBtn.click();
  await a.getByRole('alertdialog').getByRole('button', { name: 'Take over', exact: true }).click();
  await expect(a.getByRole('button', { name: 'Stop editing' })).toBeVisible(CROSS_ACTOR);

  // --- B is told, in words, that it was taken — not merely left read-only --------------------
  // This is the `lost` copy (`lock-copy.ts`), and it is the half of the transition that has never
  // been driven. A peer whose pen vanishes with no sentence cannot tell the difference between
  // "somebody took this" and "the application broke", and those need different responses.
  await refetchLock(b);
  await expect(
    b
      .getByRole('status')
      .filter({ hasText: /Editing control was taken over — you’re now read-only\./ }),
  ).toBeVisible(CROSS_ACTOR);
  await expect(b.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);
  await expect(b.getByRole('button', { name: 'New activity' })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

/**
 * **Take-over after grace, and the waiting state — `docs/TECH_DEBT.md` #286, transitions 2 and 3.**
 *
 * A Planner requests control, the holder never answers, and after `LOCK_HANDOFF_GRACE_MS` (45 s,
 * `plan-lock.policy.ts`) the requester may take the pen. ADR-0135 Option A: **the real 45 seconds
 * are waited**, not mocked. A faked clock here would prove the component re-renders on a prop
 * change and would say nothing about the server, which is where `isGraceElapsed` actually lives —
 * and the server is the only party whose opinion can refuse the take-over.
 *
 * **Why the wait is punctuated rather than one long sleep, which is the whole correctness argument
 * of this test.** `canTakeOverNow` is a disjunction: grace elapsed after a request **or** the
 * holder being inactive for `LOCK_INACTIVE_AFTER_MS` (90 s). Both routes light the same control and
 * `lockCopy.canTakeOver` deliberately covers both, so a test that simply waits cannot say which
 * branch it exercised — and a backgrounded tab pauses the holder's heartbeat, which makes the
 * inactivity branch the *likely* one rather than a remote possibility. So A is brought to the front
 * on every tick, keeping its heartbeat fresh, and the assertion is bounded well under 90 s. If the
 * grace branch were broken this test fails rather than quietly passing on the other one.
 */
test('a requester takes the pen once grace elapses, and the silent holder is told', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { ctxA, a, ctxB, b, planUrl } = await setUpTwoActors(browser);

  // --- A takes the pen and then simply stops answering ---------------------------------------
  await a.bringToFront();
  await a.goto(planUrl);
  await startEditing(a);
  await addActivity(a, 'Formwork');

  // --- B requests control ---------------------------------------------------------------------
  await b.bringToFront();
  await b.goto(planUrl);
  await b.getByRole('button', { name: 'Request control' }).click();
  await expect(b.getByRole('status').filter({ hasText: /Requested — waiting/i })).toBeVisible();

  // --- The WAITING state: the control exists, names itself, and refuses ------------------------
  // This is the state ADR-0028 designed and nothing had ever driven. It matters because the
  // alternative designs both fail a reader: hiding the button gives a requester no idea anything
  // will ever change, and enabling it early makes the grace window a decoration. A disabled
  // control with the same label is the honest middle — it says what is coming and declines now.
  const takeOverNow = b.getByRole('button', { name: 'Take over now' });
  await expect(takeOverNow).toBeVisible();
  await expect(takeOverNow).toBeDisabled();

  // --- Wait out the real grace window, keeping the holder demonstrably alive -------------------
  // Six ticks of 9 s = 54 s, comfortably past the 45 s grace and comfortably short of the 90 s
  // inactivity threshold that would otherwise be an alternative explanation for what happens next.
  // **Verified non-vacuous, 2026-09-11.** Cutting this loop to a single 9 s tick turns the
  // `toBeEnabled` assertion below red — "element is not enabled" at that line, with the other four
  // tests still passing. So the test genuinely depends on the grace window elapsing rather than on
  // the button merely existing, and it cannot be satisfied by the inactivity branch inside 54 s.
  // That check is the difference between a journey and a decoration, and this register records
  // enough tests that passed for the wrong reason to make it worth the two minutes.
  for (let tick = 0; tick < 6; tick += 1) {
    await refetchLock(a); // brings A to front: its heartbeat interval resumes and stays current
    await a.waitForTimeout(9_000);
  }

  // --- Grace has elapsed: the same control is now live, and says who it takes from -------------
  await refetchLock(b);
  await expect(takeOverNow).toBeEnabled(CROSS_ACTOR);
  await expect(
    b.getByRole('status').filter({ hasText: /You can take over editing from Holder\./ }),
  ).toBeVisible(CROSS_ACTOR);
  // "Holder", not "Holder A" — `firstName` again, the same rule the hand-off test pins. Asserted
  // here too because this sentence is produced by a different branch of `lock-view.ts`, and one
  // branch rendering a full name while its sibling renders a first name is exactly the
  // one-pattern-applied-to-a-control-and-not-its-neighbour shape this register keeps recording.

  await takeOverNow.click();
  await expect(b.getByRole('button', { name: 'Stop editing' })).toBeVisible(CROSS_ACTOR);
  // **`showActivities` first, and the reason is a real asymmetry rather than a quirk of this test.**
  // The activities panel defaults collapsed (ADR-0113 measured that as a planner's own choice) and
  // `New activity` lives inside it (`CreateActivityButton.tsx:46`). A holder who has just ADDED an
  // activity has an expanded panel as a side effect; a reader who has only watched has not — so
  // asserting this without expanding passes for the first actor and fails for the second, which is
  // exactly what happened on this test's first run. The hand-off test above is immune only because
  // it expands B's panel forty lines earlier to reach a row menu.
  await showActivities(b);
  await expect(b.getByRole('button', { name: 'New activity' })).toBeVisible();

  // --- A, who never answered, is told what happened -------------------------------------------
  // The silent holder is the case most likely to be surprised, and the least likely to be watching.
  await refetchLock(a);
  await expect(
    a
      .getByRole('status')
      .filter({ hasText: /Editing control was taken over — you’re now read-only\./ }),
  ).toBeVisible(CROSS_ACTOR);
  await expect(a.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});
