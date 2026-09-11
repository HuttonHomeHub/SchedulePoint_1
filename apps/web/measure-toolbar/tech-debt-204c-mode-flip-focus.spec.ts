import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  openPlanId,
  recalculate,
  seedActivities,
  selectedActivityId,
  useVisualMode,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **`docs/TECH_DEBT.md` #204(c) — the browser half, and only that.**
 *
 * The hazard: `Clear visual start` renders only while the plan is in Visual mode
 * (`clearVisualPlacementApplies` is literally `schedulingMode === 'VISUAL'`). `schedulingMode` is a
 * **plan-level** setting, so another user can change it, and the reader's next refetch unmounts the
 * control under whatever focus is on it. If focus then lands on `<body>`, that is WCAG 2.4.3 — a
 * class this repository has fixed four times (ADR-0060 M6, ADR-0080, ADR-0099 M10, ADR-0096).
 *
 * **The API half is already settled and is what makes this worth running.** The thing that would
 * have made the hazard moot is a pen gate: if changing the mode needed the pen, only the user
 * already holding it could do it, and taking the pen unmounts the whole bar anyway.
 * `PATCH /organizations/:orgSlug/plans/:planId` is "Planner or Org Admin; optimistic locking"
 * (`plans.controller.ts:60-61`), and `assertHoldsPen` appears nowhere in
 * `apps/api/src/modules/plans/`. So a second Planner can flip the mode while the first holds the
 * pen and changes nothing about that pen.
 *
 * The row's ORIGINAL mechanism is stale and this does not test it: that was written about a toolbar
 * item going `isVisible: false` and `Toolbar`'s roving-tabindex repair, and ADR-0115 moved this
 * control off the command surface onto the selection bar. The route tested here is the one the
 * re-read identified.
 *
 * ## The falsification structure
 *
 * A probe that cannot fail proves nothing, so three things are asserted before the reading is
 * believed:
 *
 * 1. **The control is present and focused before the flip.** Otherwise the "after" reading is about
 *    a control that was never there.
 * 2. **The control is GONE after the flip.** Otherwise the refetch did not land and the probe
 *    measured a page that never changed — the ADR-0093 shape, a pass over a population it never
 *    reached.
 * 3. Only then is `document.activeElement` read. It is recorded for **both** moments, so a reader
 *    can see the focus move rather than take one value on trust.
 *
 * **This measures; it does not fix.** If focus drops, the remedy is a decision about where focus
 * should go when an unmount is caused by somebody else, and that belongs in a spec.
 */

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
}

/** What has focus, described well enough to tell `<body>` from a real control. */
async function activeElement(page: Page): Promise<{ tag: string; name: string; isBody: boolean }> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return { tag: '(null)', name: '', isBody: true };
    return {
      tag: el.tagName,
      name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60),
      isBody: el === document.body || el === document.documentElement,
    };
  });
}

test('#204(c) — a peer flips the scheduling mode while focus sits on Clear visual start', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  clearMeasurement('techdebt-204c-mode-flip-focus');

  const stamp = Date.now();
  const orgName = `Mode Flip ${stamp}`;

  const ctxA = await browser.newContext({ viewport: { width: 1646, height: 1000 } });
  const a = await ctxA.newPage();
  await signUp(a, 'Holder A', `holder-${stamp}@example.com`);
  await a.getByLabel('Organisation name').fill(orgName);
  await a.getByRole('button', { name: /create organisation/i }).click();
  await expect(a.getByRole('heading', { level: 1, name: orgName })).toBeVisible();
  const orgSlug = /\/orgs\/([^/?#]+)/.exec(a.url())?.[1] ?? '';
  expect(orgSlug).not.toBe('');

  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const dialog = a.getByRole('dialog');
  await dialog.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await dialog.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await a.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  await createHierarchy(a);
  await newPlan(a, `Mode flip ${stamp}`);
  const planId = openPlanId(a);
  await ensurePen(a);
  await seedActivities(a, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 5 }]);
  // The canvas has no bar to select until the plan has been computed — and `recalculate` RELOADS,
  // which fires the holder's `pagehide` pen release, so the pen is re-taken afterwards. Without
  // this the listbox is empty and the probe fails at the selection rather than at its subject.
  await recalculate(a, orgSlug);
  await ensurePen(a);
  await useVisualMode(a);

  // Peer B joins as a Planner. They never open the plan: the point is that a plan-level setting can
  // be changed from anywhere by anybody with the role, without touching the pen.
  // B's page never needs to be in front — every action it takes here is an API call through
  // `evaluate`, which works on a background page. Keeping A in front throughout is what stops the
  // probe disturbing the very thing it measures.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await signUp(b, 'Peer B', `peer-${stamp}@example.com`);
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);

  // --- A: select the activity and put focus on the control ------------------------------------
  await a.bringToFront();
  await diagramList(a).focus();
  await a.keyboard.press('ArrowDown');
  await expect.poll(async () => selectedActivityId(a)).not.toBeNull();

  const clear = a.getByRole('button', { name: 'Clear visual start' });
  await expect(clear).toBeVisible();
  await clear.focus();

  const before = await activeElement(a);
  // Guard 1: the reading is about a control that really had focus.
  expect(before.name).toContain('Clear visual start');

  // --- B: flip the plan to Early, through the public API, holding no pen ----------------------
  const flip = await b.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const get = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      if (!get.ok) return { ok: false, stage: 'get', status: get.status };
      const plan = (await get.json()) as { data: { version: number } };
      const patch = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulingMode: 'EARLY', version: plan.data.version }),
      });
      return { ok: patch.ok, stage: 'patch', status: patch.status, body: await patch.text() };
    },
    { org: orgSlug, id: planId },
  );
  // A peer with no pen must be ABLE to do this, or the hazard does not exist and the row closes.
  expect(flip.ok, `peer PATCH failed: ${JSON.stringify(flip)}`).toBe(true);

  /**
   * **Count A's plan reads from here on.** This is the discriminator the two earlier versions
   * lacked: a screen that did not change can mean the client never asked, or that it asked and
   * the answer did not reach the control. Those are different findings with different owners, and
   * "the control is still there" reports them identically.
   */
  let planRequests = 0;
  const planUrl = `/api/v1/organizations/${orgSlug}/plans/${planId}`;
  a.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === planUrl) planRequests += 1;
  });

  // --- A: refetch without touching focus -------------------------------------------------------
  //
  // **The wait is not padding; it is the mechanism.** `createQueryClient` sets
  // `staleTime: 30_000` with `refetchOnWindowFocus: true`, so a focus event fired inside that
  // window refetches NOTHING — the query is still fresh and the client is correct to ignore it.
  // The first run of this probe dispatched immediately, the control stayed put, and Guard 2 caught
  // it. Without that guard the reading would have been "focus was not dropped", from a page that
  // never changed.
  //
  // It is also faithful rather than contrived: 30 seconds is nothing for a planner looking at a
  // plan, and the trigger being modelled — coming back to the tab — is the commonest there is.
  await a.waitForTimeout(31_000);

  /**
   * **Waking the reader's client — and the two previous versions of this both did nothing,
   * for two different reasons, neither of which was the one recorded here.**
   *
   * What the product actually listens to is one line of `@tanstack/query-core`:
   * `window.addEventListener('visibilitychange', () => onFocus())`
   * (`focusManager.js:11-13`). Two consequences settle how this probe must work, and both were
   * **read from that file rather than assumed**:
   *
   * - The listener is on **`window`**, and it calls `onFocus()` on EVERY such event. There is no
   *   transition tracking at all — `isFocused()` just reads `document.visibilityState`
   *   (`focusManager.js:56-59`). So version 1's docblock, which blamed "a synthetic event on a
   *   page that was already focused sets the same state it already had", was wrong about the
   *   mechanism. Its real failure was almost certainly the target: a bare
   *   `document.dispatchEvent(new Event('visibilitychange'))` does not bubble, so it never reaches
   *   a `window` listener. **Measured in Chromium**: `win: 0` after a non-bubbling dispatch on
   *   `document`, `win: 1` with `{ bubbles: true }`, `win: 2` dispatching on `window`.
   * - Version 2 replaced it with `bringToFront`, and **in headless Chromium that fires no
   *   `visibilitychange` at all** — `document.visibilityState` on A stays `"visible"` throughout,
   *   with an empty event log, in both the separate-context arrangement this probe uses and in one
   *   shared context. Also measured, not reasoned about.
   *
   * So a **headless run cannot produce a real background→foreground transition**, and no amount of
   * page shuffling will make one. `bringToFront` is kept because it models the case and costs
   * nothing; the event the library listens to is then dispatched explicitly on `window`. That is
   * simulation and the write-up must say so — what it establishes is what the product does when
   * its focus manager wakes, not that a real alt-tab wakes it.
   *
   * **And this is why the refetch is counted rather than inferred.** `planRequests` rises only
   * when A's client actually re-asks the server for the plan. Without it, "the control is still
   * there" cannot tell a product defect from an instrument that did nothing — which is exactly
   * what both earlier versions reported.
   */
  await b.bringToFront();
  await b.waitForTimeout(500);
  await a.bringToFront();
  await a.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });
  await a.waitForTimeout(2_000);

  /**
   * **Guard 2, moved to the server.** It was `expect(clear).toHaveCount(0)` — the control really
   * went — and that is the wrong guard twice over. It conflates "the reader's page updated" with
   * "the plan changed", and the first is the thing being measured, so asserting it makes the probe
   * unable to report the interesting answer. Checking A's page after a reload is no better: a
   * reload drops the pen, so the control would vanish for two reasons at once.
   *
   * So the guard asks the SERVER. If the plan is genuinely `EARLY`, the probe reached its
   * condition and whatever A's page shows is a finding either way.
   */
  const serverMode = await b.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const res = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as { data: { schedulingMode: string } };
      return json.data.schedulingMode;
    },
    { org: orgSlug, id: planId },
  );
  expect(serverMode, 'the peer PATCH did not actually change the plan').toBe('EARLY');

  // Give the refetch a chance to land and the tree to settle before either reading is taken.
  await a.waitForTimeout(3_000);
  const controlStillThere = (await clear.count()) > 0;
  const after = await activeElement(a);

  writeMeasurement('techdebt-204c-mode-flip-focus', {
    peerPatch: flip,
    serverModeAfterPatch: serverMode,
    planReadsByReaderAfterFlip: planRequests,
    transition: 'simulated — headless Chromium fires no visibilitychange on bringToFront',
    controlStillPresentOnReadersPage: controlStillThere,
    focusBefore: before,
    focusAfter: after,
    // The verdict, computed rather than left for a reader to infer from four fields. There are
    // four outcomes and only one of them is the hazard the row describes — and the first of them
    // is about this probe rather than about the product, which is the distinction the two earlier
    // versions could not draw.
    verdict:
      planRequests === 0
        ? 'INSTRUMENT DID NOT REACH ITS CONDITION — the reader never re-read the plan, so nothing ' +
          'here is a statement about the product. The focus manager was not woken.'
        : controlStillThere
          ? 'NO UNMOUNT — the reader re-read the plan (' +
            `${planRequests} GET(s)), the server says EARLY, and the Visual-mode control is still ` +
            'on screen. The focus hazard is NOT reachable by this route; what IS true is that the ' +
            'reader is looking at a control for a mode the plan is no longer in.'
          : after.isBody
            ? 'FOCUS DROPPED TO BODY — WCAG 2.4.3, the hazard is real'
            : `the control unmounted and focus was caught by ${after.tag} "${after.name}" — no drop`,
  });

  await ctxA.close();
  await ctxB.close();
});
