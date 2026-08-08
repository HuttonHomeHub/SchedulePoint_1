import { expect, test } from '@playwright/test';

import {
  announced,
  canvas,
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  onboard,
  openPlanId,
  seedActivities,
  clearSelection,
  dragBar,
  mapBars,
  placements,
} from './support';

/**
 * The flag-ON journey for the **canvas plural selection** (`VITE_CANVAS_MULTI_SELECT`,
 * `docs/specs/canvas-multi-select/` M5-T2).
 *
 * Driven through the **parallel listbox**, not canvas pixels — the ADR-0064 harness technique. The
 * canvas is `aria-hidden`, so pixel-driving it would test the hit-test rather than the selection,
 * and would break every time a bar moved a pixel. The listbox is the same selection state the
 * canvas rings, so what it reports is what the canvas shows.
 *
 * **One test, one page** (the `e2e-search-nav` shape). The pen is a per-session lease (ADR-0028) and
 * the plan is opened by navigating to it, so a per-test fresh page would have to re-onboard, re-open
 * and re-take the pen before it could assert anything — and the first version of this suite did
 * exactly that and timed out on a "Start editing" button that was never on screen, because a fresh
 * page lands on `/` and not on the plan. Sharing the page also removes the thing that shape hid: the
 * bulk-delete assertions depended on a link an *earlier test* had created, which is a dependency the
 * runner is free to break.
 *
 * The two assertions that cannot be made anywhere else:
 *
 * 1. **The stored state, read back from the API** — not the DOM under test (the ADR-0070 M6
 *    lesson: a screen can render exactly what a test expects while the row on disk says something
 *    else).
 * 2. **One undo restores a bulk delete with its links** — the CQ-4 answer. A mocked fetch would
 *    return whatever it was handed; only a real `restore-batch` proves the dependencies between the
 *    deleted activities came back with them.
 */

/**
 * The fixture, seeded with **distinct** start dates.
 *
 * A chain is ordered by time (ADR-0080 §7), and the tie-break below a shared date is the name — so
 * five unconstrained activities would all start at the data date and chain **alphabetically**
 * (Blind, Cure, Excavate…), which is a perfectly correct product behaviour that would make the
 * direction assertion below test the alphabet rather than the clock. Pinning each to its own
 * working day makes the seeded order, the row order (`createdAt asc`) and the chain order the same
 * sequence, so a chain that came out backwards would be visible.
 */
const FIXTURE = [
  { name: 'Excavate', startOn: '2026-01-05' },
  { name: 'Blind', startOn: '2026-01-06' },
  { name: 'Pour slab', startOn: '2026-01-07' },
  { name: 'Cure', startOn: '2026-01-08' },
  { name: 'Strike forms', startOn: '2026-01-09' },
] as const;

const NAMES = FIXTURE.map((row) => row.name);

test('the canvas plural selection: build a set, chain it, delete it, undo it', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, `Multi-select ${stamp}`);
  await ensurePen(page);
  await seedActivities(
    page,
    orgSlug,
    FIXTURE.map((row) => ({ ...row, durationDays: 2 })),
  );
  const planId = openPlanId(page);
  // `seedActivities` reloads, and the pen survives the reload as a lease — but the button is the
  // product's own answer to "do I hold it", so it is asked rather than assumed.
  await ensurePen(page);

  /**
   * Read the plan's dependencies **from the API**, through the page.
   *
   * `page.evaluate` rather than the `request` fixture: the session cookie lives in the browser
   * context, so a bare request would be unauthenticated and the assertion would fail for a reason
   * that has nothing to do with the feature.
   */
  const storedDependencies = async (): Promise<
    { predecessor: { name: string }; successor: { name: string } }[]
  > =>
    page.evaluate(
      async ({ org, id }: { org: string; id: string }) => {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
          credentials: 'include',
        });
        const body = (await response.json()) as {
          data: { predecessor: { name: string }; successor: { name: string } }[];
        };
        return body.data;
      },
      { org: orgSlug, id: planId },
    );

  /** How many options the listbox currently reports as selected. */
  const selectedCount = async (): Promise<number> =>
    page.locator('[role="option"][aria-selected="true"]').count();

  await expect(canvas(page)).toBeVisible();
  const list = diagramList(page);
  await list.focus();
  const bar = page.getByTestId('bulk-selection-bar');

  await test.step('the listbox advertises multi-selection, and Space toggles without moving the cursor', async () => {
    await expect(list).toHaveAttribute('aria-multiselectable', 'true');

    const cursorAtStart = await list.getAttribute('aria-activedescendant');
    await list.press('ArrowDown');
    const cursorOnSecond = await list.getAttribute('aria-activedescendant');
    expect(cursorOnSecond).not.toBe(cursorAtStart);

    // Space toggles the focused row OUT, and the cursor stays exactly where it was. In a browser
    // this is the assertion a jsdom test cannot make convincingly: focus is real here.
    await list.press(' ');
    expect(await selectedCount()).toBe(0);
    expect(await list.getAttribute('aria-activedescendant')).toBe(cursorOnSecond);

    await list.press(' ');
    expect(await selectedCount()).toBe(1);
    expect(await list.getAttribute('aria-activedescendant')).toBe(cursorOnSecond);
  });

  await test.step('Shift+Arrow extends, Ctrl+A selects all, and each transition is announced', async () => {
    await list.press('Escape');
    await list.press('Home');
    await list.press('Shift+ArrowDown');
    await announced(page, /2 activities selected/);
    expect(await selectedCount()).toBe(2);

    await list.press('Control+a');
    expect(await selectedCount()).toBe(NAMES.length);
    await announced(page, new RegExp(`${String(NAMES.length)} activities selected`));
  });

  await test.step('the bulk bar appears at two, names the primary, and Escape clears the selection last', async () => {
    await list.press('Escape');
    await expect(bar).toBeHidden();
    await announced(page, /Selection cleared/);

    await list.press('Home');
    await list.press('Shift+ArrowDown');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(/2 activities selected/);
    // The primary is named, because the singular affordances still act on exactly one bar.
    await expect(bar).toContainText(/is the subject of single-activity actions/);
  });

  await test.step('the chain preview shows the order it will write, and Reverse flips it', async () => {
    await list.press('Control+a');
    await bar.getByRole('button', { name: /link in sequence/i }).click();

    const preview = page.getByTestId('chain-preview');
    await expect(preview).toBeVisible();
    // Ordered by START DATE, which for this fixture is the seeded order. The direction is the whole
    // risk (ADR-0064 was opened on a reversed link), so it is asserted rather than assumed.
    const forward = await preview.locator('li').allInnerTexts();
    expect(forward[0]).toContain(NAMES[0]);
    expect(forward[forward.length - 1]).toContain(NAMES[NAMES.length - 1]);

    await page.getByRole('button', { name: /reverse the order/i }).click();
    const reversed = await preview.locator('li').allInnerTexts();
    expect(reversed[0]).toContain(NAMES[NAMES.length - 1]);
    expect(reversed[reversed.length - 1]).toContain(NAMES[0]);

    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(preview).toBeHidden();
  });

  await test.step('a chain writes the direction the preview promised — read back from the API', async () => {
    await list.focus();
    await list.press('Escape');
    await list.press('Home');
    await list.press('Shift+ArrowDown'); // the first two, earliest first
    await bar.getByRole('button', { name: /link in sequence/i }).click();
    await page.getByRole('button', { name: /create 1 link/i }).click();
    await announced(page, /1 link created in sequence/);

    // The STORED edge, not the DOM: a preview and a screen can agree and both be wrong about what
    // reached the database.
    const stored = await storedDependencies();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.predecessor.name).toBe(NAMES[0]);
    expect(stored[0]?.successor.name).toBe(NAMES[1]);
  });

  await test.step('a bulk delete is ONE undo step, and the links come back with the activities', async () => {
    const beforeCount = (await storedDependencies()).length;
    expect(beforeCount).toBeGreaterThan(0); // the chain above — this step needs one

    await list.focus();
    await list.press('Escape');
    await list.press('Home');
    await list.press('Shift+ArrowDown'); // the two ends of that link
    await bar.getByRole('button', { name: /^delete$/i }).click();
    await page.getByRole('button', { name: /^delete 2$/i }).click();
    await announced(page, /2 activities deleted/);

    expect(await storedDependencies()).toHaveLength(0);

    // Focus is asserted, not assumed: the workspace's undo accelerator is a React `onKeyDown` on
    // the workspace root, so a bulk delete that drops focus to `<body>` makes Ctrl+Z reach nothing.
    // That is exactly what this journey found on its first green-enough run, and the assertion is
    // kept so the fix cannot quietly regress.
    await expect(list).toBeFocused();
    // ONE undo. Not two, not five — the whole gesture is one reversible step (ADR-0048 M2.3).
    await page.keyboard.press('Control+z');
    await expect
      // 15s, not the 5s default: one undo is a restore, a recalculation and a refetch, and the
      // default expired mid-chain — the failure read as "the links did not come back" while the
      // row was already live in the database. Measured, not guessed.
      .poll(async () => (await storedDependencies()).length, { timeout: 15_000 })
      // The CQ-4 answer, proved: `restore-batch` puts the ids back, so the dependency BETWEEN the
      // two deleted activities survives. A re-create would have restored two bars and no link.
      .toBe(beforeCount);
  });
  await test.step('dragging one of a plural selection moves them ALL (TECH_DEBT #108)', async () => {
    // **Written before the gesture existed, and verified red against it** — the ADR-0081 rule.
    // ADR-0080 landed `movedPlacement`/`bulkMoveSnapshots`, `bulkPlacementCommand`,
    // `useBatchPlacements` and `PATCH …/activities/placements` with its API e2e, all correct, and
    // **nothing called them**: the gesture machine's `repositioning` state keys on one
    // `activityId`, so dragging one of twelve selected bars moved that one bar. The data layer
    // shipped; the interaction did not. This step is the thing that says which.
    // Its **own plan**. The steps above drag, link and delete the shared plan's activities, so the
    // one-column probe finds one bar rather than three — which fails as "need three probed bars"
    // and would read as a product defect if this step had been written after the fix rather than
    // before it. Three unconstrained tasks all start at the data date and stack one lane apart,
    // which is the assumption `mapBars` is bounded on.
    await newPlan(page, 'Plural drag');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Drag A' },
      { name: 'Drag B' },
      { name: 'Drag C' },
    ]);
    await ensurePen(page);
    await clearSelection(page);
    const bars = await mapBars(page);
    const ids = [...bars.keys()].slice(0, 3);
    expect(ids.length, 'need three probed bars to drag a plural selection').toBe(3);

    // Build the selection through the canvas's own keyboard contract (Space toggles, ADR-0080).
    const list = diagramList(page);
    await list.focus();
    await page.keyboard.press('Control+a');
    await announced(page, /selected/i);

    const before = await placements(page, orgSlug);
    const grab = bars.get(ids[0]!)!;
    // Right by ~4 day-columns at the current preset; the exact delta does not matter, only that
    // every selected bar moves by the SAME one.
    await dragBar(page, grab, { x: grab.x + 160, y: grab.y });

    await expect
      .poll(
        async () => {
          const after = await placements(page, orgSlug);
          return ids.filter((id) => after.get(id)?.earlyStart !== before.get(id)?.earlyStart)
            .length;
        },
        { timeout: 20_000 },
      )
      // ALL three. Today this is 1 — the dragged bar — which is the defect.
      .toBe(3);

    // And it is ONE reversible step, not three: the whole gesture undoes together.
    //
    // Focus is placed deliberately rather than asserted. The delete step above asserts
    // `toBeFocused` because its own anchor — the bulk bar's Delete button — unmounts with the
    // selection, so focus fell to `<body>` and Ctrl+Z reached nothing; that is a real fix worth
    // pinning. A pointer drag has no such anchor: focus is simply wherever the planner left it, and
    // asserting the listbox holds it after a mouse gesture would be testing an invariant the
    // product never claimed.
    await list.focus();
    await page.keyboard.press('Control+z');
    await expect
      .poll(
        async () => {
          const after = await placements(page, orgSlug);
          return ids.filter((id) => after.get(id)?.earlyStart === before.get(id)?.earlyStart)
            .length;
        },
        { timeout: 20_000 },
      )
      .toBe(3);
  });
});
