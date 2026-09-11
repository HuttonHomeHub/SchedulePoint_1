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
  useVisualMode,
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
 * **What makes the case reachable is an API fact, not a UI one.** `PATCH …/plans/:planId` is
 * "Planner or Org Admin; optimistic locking" and `assertHoldsPen` appears nowhere in
 * `apps/api/src/modules/plans/`, so a second Planner can flip `schedulingMode` while the first
 * holds the pen and changes nothing about that pen. `Clear visual start`'s `isVisible` is literally
 * `schedulingMode === 'VISUAL'`, so the reader's next refetch takes it away.
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
 * 3. The **server** says the plan is `EARLY`. Asserting the reader's own DOM here would assert the
 *    thing under test; asserting it after a reload is worse, because a reload drops the pen and the
 *    control would vanish for two reasons at once.
 *
 * **The 31-second wait is the mechanism, not padding.** `createQueryClient` sets
 * `staleTime: 30_000` with `refetchOnWindowFocus: true`, so a focus event fired inside that window
 * correctly refetches nothing. It is also faithful: thirty seconds is nothing for a planner looking
 * at a plan, and coming back to the tab is the commonest trigger there is.
 *
 * **The wake is simulated and that is stated rather than glossed.** `@tanstack/query-core` listens
 * for `visibilitychange` on **`window`** and calls `onFocus()` unconditionally — there is no
 * transition tracking. Headless Chromium fires no `visibilitychange` on `bringToFront` at all
 * (measured), so no amount of page shuffling produces a real background→foreground transition. The
 * event the library listens to is therefore dispatched explicitly, on `window`. What this
 * establishes is what the product does when its focus manager wakes.
 */

const PEER_PASSWORD = 'correct-horse-battery';

/** The bar, located by role and name — never by copy (the ADR-0099 M5 correction). */
function selectionBar(page: Page) {
  return page.getByRole('toolbar', { name: /^Actions for / });
}

test('a peer flips the scheduling mode and the bar catches the focus it drops', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const stamp = Date.now();
  const ctxA = await browser.newContext({ viewport: { width: 1646, height: 1097 } });
  const a = await ctxA.newPage();

  // --- A: the reader, who will be holding the pen and standing on the control ------------------
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
  await seedActivities(a, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 5 }]);
  // `recalculate` reloads, which fires the holder's `pagehide` pen release — so the pen is re-taken
  // afterwards. Without the recalculation the canvas has no bar to select and the probe would fail
  // at its fixture rather than at its subject.
  await recalculate(a, orgSlug);
  await ensurePen(a);
  await useVisualMode(a);

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

  const clear = a.getByRole('button', { name: 'Clear visual start' });
  await expect(clear).toBeVisible();
  await clear.focus();

  // Guard 1.
  await expect
    .poll(async () => a.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
    .toContain('Clear visual start');

  // --- B: flip the plan to Early, over the public API, holding no pen ---------------------------
  const flip = await b.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const get = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      if (!get.ok) return { ok: false, stage: 'get', status: get.status, body: '' };
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
  expect(flip.ok, `peer PATCH failed: ${JSON.stringify(flip)}`).toBe(true);

  // Guard 2 — count A's plan reads from here on.
  let planRequests = 0;
  const planUrl = `/api/v1/organizations/${orgSlug}/plans/${planId}`;
  a.on('request', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === planUrl) planRequests += 1;
  });

  await a.waitForTimeout(31_000);
  await a.evaluate(() => {
    window.dispatchEvent(new Event('visibilitychange'));
  });

  // Guard 3 — ask the server, not the page under test.
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
  expect(serverMode, 'the peer PATCH did not change the plan').toBe('EARLY');

  // The control really goes, and the BAR really stays — the two together are what make this the
  // per-item case rather than `SelectionActionsBar`'s whole-bar cleanup.
  await expect(clear).toHaveCount(0);
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
    'Clear visual start is no longer available. This action applies only while the plan is ' +
      'scheduled in Visual mode. Focus moved to Actions for',
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
