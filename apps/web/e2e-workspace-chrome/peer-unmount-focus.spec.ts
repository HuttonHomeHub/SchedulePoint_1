import AxeBuilder from '@axe-core/playwright';
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
} from './support';

/**
 * **A peer removes the control you are standing on, and focus does not fall on the floor.**
 * `docs/TECH_DEBT.md` #204(c); `docs/specs/unmount-focus-handoff/`.
 *
 * This is the only instrument that has ever reproduced the defect, and the only one that can. The
 * unit tier proves the hook's decision table but runs in jsdom, which has no real focus model —
 * measured during M1: removing a focused node there dispatches **no blur event at all**, so the
 * blur rule the whole mechanism rests on is untestable at that tier. Here there are two real
 * sessions, a real API with the pen enforced, and a real browser.
 *
 * **The reachable case changed with the product, and the shape did not** (one-planning-surface
 * M-F-T4b). It used to be a peer flipping `schedulingMode` — `PATCH …/plans/:planId` is not
 * pen-gated, so a second Planner could do it while the reader held the pen, and `Clear visual
 * start`'s `isVisible` was literally `schedulingMode === 'VISUAL'`. The collapse removes that
 * condition: there is one planning surface, every plan can carry a placement, and that control can
 * no longer be taken away by anybody.
 *
 * **Nothing plan-level replaces it, which is worth saying plainly** — after the collapse there is
 * no field a peer can write on `PATCH …/plans/:planId` that removes a registry item. So the fixture
 * inverts: the **peer** holds the pen and changes the selected activity's `type` to `WBS_SUMMARY`,
 * and the reader — who is only reading, which needs no pen (ADR-0063 M4b) — is standing on
 * `Duplicate`, whose `isVisible` is `!ctx.isSummary`. Same hook, same three guards, one control
 * disappearing from under a focus ring because somebody else wrote.
 *
 * The reader is deliberately NOT holding the pen now, and that is a consequence rather than a
 * convenience: an activity write asserts `assertHoldsPen`, so the peer must hold it, so the reader
 * must not. `Duplicate` is therefore shaded with its pen reason throughout — and still focusable,
 * which is ADR-0082's whole point and is what keeps this case constructible at all.
 *
 * ## Three guards, before any reading is believed
 *
 * Each was earned by a version of the measurement probe that reported a confident wrong answer
 * (`m0-measurement.md`), and all three are kept here as assertions rather than readings:
 *
 * 1. The control is present and focused **before**. Otherwise the "after" is about a control that
 *    was never there.
 * 2. The reader's client really **re-asked** the server — counted, not inferred. "The screen did
 *    not change" cannot tell a product defect from an instrument that did nothing, and two earlier
 *    probe versions reported exactly that.
 * 3. The **server** says the activity is a `WBS_SUMMARY`. Asserting the reader's own DOM here would
 *    assert the thing under test, and asserting it after a reload is worse — a reload re-reads
 *    everything, so the control would vanish for two reasons at once.
 *
 * **The 31-second wait is the mechanism, not padding.** `createQueryClient` sets
 * `staleTime: 30_000` with `refetchOnWindowFocus: true`, so a focus event fired inside that window
 * correctly refetches nothing. It is also faithful: thirty seconds is nothing for a planner looking
 * at a plan, and coming back to the tab is the commonest trigger there is.
 *
 * **The wake is simulated and that is stated rather than glossed.** `@tanstack/query-core` listens
 * for `visibilitychange` on **`window`** (`focusManager.js:11-13`) and treats anything that is not
 * `"hidden"` as focused (`focusManager.js:56-59`) — there is no transition tracking. Headless
 * Chromium fires no `visibilitychange` on `bringToFront` at all (measured), so no amount of page
 * shuffling produces a real background→foreground transition. The event the library listens to is
 * therefore dispatched explicitly, on `window`. What this establishes is what the product does when
 * its focus manager wakes.
 *
 * **Those two citations moved here from `measure-toolbar/tech-debt-204c-mode-flip-focus.spec.ts`,
 * which is deleted** (one-planning-surface M-F-T4b). That harness was `#204(c)`'s M0 evidence and
 * its whole mechanism was a peer flipping `schedulingMode`; with the mode gone it could not be
 * re-run, and converting it would have made it produce a different reading from the one
 * `docs/specs/unmount-focus-handoff/` records — a measurement file that no longer reproduces its
 * own recorded measurement is worse than none. The knowledge it carried is the wake mechanism, and
 * that lives here, where it is still load-bearing.
 */

const PEER_PASSWORD = 'correct-horse-battery';

/** The bar, located by role and name — never by copy (the ADR-0099 M5 correction). */
function selectionBar(page: Page) {
  return page.getByRole('toolbar', { name: /^Actions for / });
}

test('a peer retypes the activity and the bar catches the focus it drops', async ({ browser }) => {
  test.setTimeout(180_000);

  const stamp = Date.now();
  const ctxA = await browser.newContext({ viewport: { width: 1646, height: 1097 } });
  const a = await ctxA.newPage();

  // --- A: the reader, who holds no pen and is standing on the control --------------------------
  const orgSlug = `chrome-co-${stamp}`;
  await a.goto('/sign-up');
  await a.getByLabel('Full name').fill('Chrome Tester');
  await a.getByLabel('Email').fill(`chrome-${stamp}@example.com`);
  await a.getByLabel('Password').fill(PEER_PASSWORD);
  await a.getByRole('button', { name: /create an account/i }).click();
  await expect(a.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await a.getByLabel('Organisation name').fill(`Chrome Co ${stamp}`);
  await a.getByRole('button', { name: /create organisation/i }).click();
  await expect(a).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Invite the peer BEFORE opening the plan: the invitation link is only shown once.
  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const invite = a.getByRole('dialog');
  await invite.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Done' }).click();

  await createHierarchy(a);
  await newPlan(a, `Peer unmount ${stamp}`);
  const planId = openPlanId(a);
  await ensurePen(a);
  const seeded = await seedActivities(a, orgSlug, [
    { name: 'Excavate', laneIndex: 0, durationDays: 5 },
  ]);
  // Without the recalculation the canvas has no bar to select and the probe would fail at its
  // fixture rather than at its subject.
  // `recalculate` reloads, which fires the holder's `pagehide` pen release — and this journey
  // WANTS the pen released, because the peer needs it to write an activity. The reader is only
  // reading, which has never needed a pen (ADR-0063 M4b).
  await recalculate(a, orgSlug);
  const seededId = seeded[0]!.id;

  // --- B: a second Planner, who never opens the plan -------------------------------------------
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/sign-up');
  await b.getByLabel('Full name').fill('Peer Planner');
  await b.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await b.getByLabel('Password').fill(PEER_PASSWORD);
  await b.getByRole('button', { name: /create an account/i }).click();
  // **Wait for the sign-up to land before following the invitation link.** Without this the
  // `goto` races the sign-up POST and the accept page renders signed-out, where there is no
  // "Accept and join" at all — which is how the first run of this journey failed, in its fixture
  // rather than in its subject.
  await expect(b.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);

  // --- A: select the activity and stand on the control -----------------------------------------
  await a.bringToFront();
  await diagramList(a).focus();
  await a.keyboard.press('ArrowDown');
  await expect.poll(async () => selectedActivityId(a)).not.toBeNull();

  // **Shaded, because the reader holds no pen — and focusable anyway**, which is ADR-0082's ruling
  // and the only reason this case can be built at all. A primitive that skipped `aria-disabled`
  // items would make the reason unreachable by keyboard AND make this journey impossible.
  const duplicate = a.getByRole('button', { name: 'Duplicate', exact: true });
  await expect(duplicate).toBeVisible();
  await duplicate.focus();

  // Guard 1. **The accessible name, not `aria-label`** — this control carries `showLabel: 'always'`,
  // so `ToolbarButton` names it from its text and there is no `aria-label` to read. The first run
  // of this journey asserted the attribute alone and failed against a perfectly focused button.
  await expect
    .poll(async () =>
      a.evaluate(() => {
        const el = document.activeElement;
        if (!el) return '';
        return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      }),
    )
    .toContain('Duplicate');

  // --- B: take the pen, then retype the activity, over the public API ---------------------------
  //
  // **The lock acquisition is part of the subject, not setup noise.** An activity write asserts
  // `assertHoldsPen` (ADR-0028), which is exactly why the reader above holds no pen: the two cannot
  // both be true, and the case only exists because one person's write removes another's control.
  const flip = await b.evaluate(
    async ({ org, id, activityId }: { org: string; id: string; activityId: string }) => {
      const lock = await fetch(`/api/v1/organizations/${org}/plans/${id}/edit-lock`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!lock.ok) {
        return { ok: false, stage: 'lock', status: lock.status, body: await lock.text() };
      }
      // **Org-scoped, not plan-nested** — `activities.controller.ts` is
      // `organizations/:orgSlug/activities`; the plan-nested spelling 404s, which is how the
      // first run of this conversion failed.
      const get = await fetch(`/api/v1/organizations/${org}/activities/${activityId}`, {
        credentials: 'include',
      });
      if (!get.ok) return { ok: false, stage: 'get', status: get.status, body: await get.text() };
      const activity = (await get.json()) as { data: { version: number } };
      const patch = await fetch(`/api/v1/organizations/${org}/activities/${activityId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'WBS_SUMMARY', version: activity.data.version }),
      });
      return { ok: patch.ok, stage: 'patch', status: patch.status, body: await patch.text() };
    },
    { org: orgSlug, id: planId, activityId: seededId },
  );
  expect(flip.ok, `peer write failed: ${JSON.stringify(flip)}`).toBe(true);

  // Guard 2 — count A's ACTIVITY reads from here on. The subject moved from a plan field to an
  // activity field, so counting plan reads would count a request that says nothing about it.
  let planRequests = 0;
  const activitiesUrl = `/api/v1/organizations/${orgSlug}/plans/${planId}/activities`;
  a.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === activitiesUrl) planRequests += 1;
  });

  await a.waitForTimeout(31_000);
  await a.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });

  // Guard 3 — ask the server, not the page under test.
  const serverType = await b.evaluate(
    async ({ org, activityId }: { org: string; activityId: string }) => {
      const res = await fetch(`/api/v1/organizations/${org}/activities/${activityId}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as { data: { type: string } };
      return json.data.type;
    },
    { org: orgSlug, activityId: seededId },
  );
  expect(serverType, 'the peer PATCH did not change the activity').toBe('WBS_SUMMARY');

  // The control really goes, and the BAR really stays — the two together are what make this the
  // per-item case rather than `SelectionActionsBar`'s whole-bar cleanup.
  await expect(duplicate).toHaveCount(0);
  await expect(selectionBar(a)).toBeVisible();
  expect(
    planRequests,
    'the reader never re-read the plan; nothing below is about the product',
  ).toBeGreaterThanOrEqual(1);

  // --- The assertion this suite exists for -----------------------------------------------------
  //
  // Asserted through `evaluate` against the element itself, never against a visible string: the
  // question is where the browser's focus ring IS. Verified red by reverting the `target.focus()`
  // call in `use-focus-handoff.ts`, which leaves `activeElement` on `<body>`.
  await expect
    .poll(
      async () =>
        a.evaluate(() => {
          const active = document.activeElement;
          if (!active) return '(null)';
          if (active === document.body) return 'BODY';
          return `${active.getAttribute('role') ?? active.tagName}:${active.getAttribute('aria-label') ?? ''}`;
        }),
      { message: 'focus should have been handed to the selection bar, not dropped on <body>' },
    )
    .toMatch(/^toolbar:Actions for /);

  // And the reader is told what left and why. The sentence is the item's own `lostReason`, which is
  // a statement about the CONDITION and is therefore still true now that the condition has changed.
  await expect(a.getByTestId('announcer')).toContainText(
    'Duplicate is no longer available. This action does not apply to a WBS summary. ' +
      'Focus moved to Actions for',
  );

  // **The scan's target is asserted to match something first** — the ADR-0099 M5 correction, where
  // three suites carried `.include()` calls naming rows that had been deleted. The subject is the
  // roving containers themselves: a `tabIndex={-1}` has just been added to each, and this is the
  // state where one of them holds focus.
  expect(await a.locator('[role="toolbar"]').count()).toBeGreaterThan(0);
  const scan = await new AxeBuilder({ page: a })
    .include('[role="toolbar"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(scan.violations).toEqual([]);

  await ctxA.close();
  await ctxB.close();
});
