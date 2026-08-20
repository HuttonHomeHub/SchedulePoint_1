import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  findBar,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from './support';

/**
 * **The activity editor opens where the epic says it does** (ADR-0099 M10).
 *
 * The M10 gate pass found that it did not. `m6-activity-context.md` T4 says "the three ADR-0060
 * intents open the drawer"; registering a subject only made a rail button appear, so pressing
 * **Edit** on a selected activity opened the **modal** — at every width, exactly as before the
 * epic — unless the planner had separately discovered that button and pressed it first. The
 * drawer, the milestone's headline capability, was dark in the product's default path.
 *
 * **Why this file exists rather than another unit test.** The unit suites mount the editor, and the
 * defect was in the seam between the editor and the shell: `drawer-entry-point.test.tsx` now drives
 * that seam with a probe route, which is a real test and still not this one. Only the shipped
 * product can say that the *plan workspace* — the actual route, its actual selection bar, its actual
 * gating — reaches it. ADR-0081 exists because a milestone once shipped with unit tests validating
 * code no planner could reach, and this is the fifth recorded instance of that shape.
 *
 * Nothing here is flagged: Graphite ships no `VITE_` flag (ADR-0088 D1 — a build-time constant is
 * not an operator rollback), so this runs against the default bundle.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 2500;

test.describe('The activity drawer', () => {
  test('opens from the canvas selection, keeps the Explorer reachable, and never opens twice', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Activity drawer');
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // The drawer starts on the Explorer, which is what a planner sees on arrival.
    const explorerTree = page.getByRole('navigation', { name: 'Project Explorer' });
    await expect(explorerTree).toBeVisible();

    // ── Edit on a selected bar opens the DRAWER. ──────────────────────────────────────────────
    await findBar(page, dig.id);
    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(dock).toBeVisible();
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();

    // The heading is the activity's own name (`m6-activity-context.md`: the subject names itself),
    // and the drawer has taken the Explorer's place rather than appearing beside it.
    const drawer = page.getByRole('complementary', { name: dig.name });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: dig.name })).toBeVisible();
    await expect(explorerTree).toHaveCount(0);

    // **And there is no modal.** This is the assertion that would have caught the defect from the
    // other direction: before the fix the editor opened, correctly, as a `<dialog>` — everything
    // looked right, and the drawer was simply never involved.
    await expect(
      page.getByRole('dialog'),
      'one activity must never have two chromes — the drawer and a modal are alternatives',
    ).toHaveCount(0);

    // ── The tabs are a horizontal strip, because the rail does not fit a 300 px panel. ────────
    //
    // `railFits` asked a VIEWPORT query, which is always true at the `lg`+ widths where the drawer
    // exists at all — so the 208 px vertical rail rendered inside a 224–420 px panel, leaving about
    // 92 px for the content it labels. Asserted through `aria-orientation`, which is the same fact
    // the layout rests on rather than a proxy for it.
    const tablist = drawer.getByRole('tablist');
    await expect(tablist).toBeVisible();
    await expect(tablist).not.toHaveAttribute('aria-orientation', 'vertical');

    // ── Closing the editor returns focus to the rail button, not to `<body>`. ─────────────────
    //
    // WCAG 2.4.3. The Close button is inside the portalled subtree, so pressing it removes the
    // element that has focus; a browser then drops focus to the body, which also silently disables
    // every keyboard accelerator bound on the workspace root (the ADR-0080 M2 finding). No unit
    // test can see this — jsdom's `fireEvent.click` does not move focus the way a real click does,
    // which `app-shell.test.tsx` says in its own words.
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    const railButton = page.getByRole('button', { name: 'Activity details' });
    await expect(railButton).toBeFocused();

    // ── The Explorer is still one press away. ─────────────────────────────────────────────────
    //
    // The drawer is one panel with two subjects, so opening the editor takes the tree off screen.
    // That is the design; what would not be acceptable is losing the way back.
    await page.getByRole('button', { name: 'Project Explorer' }).click();
    await expect(explorerTree).toBeVisible();
  });
});
