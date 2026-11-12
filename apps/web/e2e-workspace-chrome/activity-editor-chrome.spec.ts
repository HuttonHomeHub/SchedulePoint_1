import { activityEditor } from '../e2e-support/activity-editor';
import { expect, test } from '../e2e-support/test';

import {
  canvas,
  createHierarchy,
  ensurePen,
  findBar,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from './support';

/**
 * **The activity editor opens in the chrome it was designed for** (ADR-0101).
 *
 * The M10 gate pass found that it did not. `m6-activity-context.md` T4 says "the three ADR-0060
 * intents open the drawer"; registering a subject only made a rail button appear, so pressing
 * **Edit** on a selected activity opened the **modal** — at every width, exactly as before the
 * epic — unless the planner had separately discovered that button and pressed it first. The
 * drawer, the milestone's headline capability, was dark in the product's default path.
 *
 * **Why this file exists rather than another unit test.** The unit suites mount the editor, and the
 * defect was in the seam between the editor and the shell: `drawer-entry-point.test.tsx` drove that
 * seam with a probe route, which was a real test and still not this one — and which is why it went
 * with the drawer on 2026-09-01 (`docs/TECH_DEBT.md` #156): a probe route proves nothing about a
 * mechanism the product no longer has. Only the shipped
 * product can say that the *plan workspace* — the actual route, its actual selection bar, its actual
 * gating — reaches it. ADR-0081 exists because a milestone once shipped with unit tests validating
 * code no planner could reach, and this is the fifth recorded instance of that shape.
 *
 * Nothing here is flagged: Graphite ships no `VITE_` flag (ADR-0088 D1 — a build-time constant is
 * not an operator rollback), so this runs against the default bundle.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 2500;

test.describe('The activity editor chrome', () => {
  test('opens as an xl dialog with its section rail, and leaves the Explorer in place', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Activity editor chrome');
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    const explorerTree = page.getByRole('navigation', { name: 'Project Explorer' });
    await expect(explorerTree).toBeVisible();

    // ── Edit on a selected bar opens the DIALOG. ──────────────────────────────────────────────
    await findBar(page, dig.id);
    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(dock).toBeVisible();
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: dig.name })).toBeVisible();

    // ── The rail is back, and it is the whole point of the reversal. ─────────────────────────
    //
    // ADR-0061 widened this form to `xl` (896 px) with a vertical section rail BECAUSE 448 px was
    // already unusable. Graphite M6 then docked it in a 300–420 px panel, where the rail cannot
    // fit at any width, so it ran its sub-768 px narrow layout permanently on a desktop: four tabs
    // overflowing sideways inside a panel scrolling vertically. `aria-orientation` is the fact the
    // layout actually rests on, which is why it is asserted rather than a width.
    const tablist = dialog.getByRole('tablist');
    await expect(tablist).toBeVisible();
    await expect(tablist).toHaveAttribute('aria-orientation', 'vertical');

    // The form is genuinely wide, not merely labelled `xl`. 700 px is comfortably below the 896 px
    // cap and comfortably above the 420 px the drawer could ever have offered, so this fails on a
    // re-dock without being brittle about the exact measure.
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(700);

    // ── The Explorer never left. ──────────────────────────────────────────────────────────────
    //
    // The drawer used to be one panel with two subjects, so opening the editor took the tree off
    // screen and the journey had to prove there was a way back. A dialog costs the tree nothing —
    // which is a real gain, and the assertion that records it.
    await expect(explorerTree).toBeVisible();

    // ── And the rail button is gone with the subject. ─────────────────────────────────────────
    await expect(page.getByRole('button', { name: 'Activity details' })).toHaveCount(0);

    // ── Closing restores focus; a dialog does this itself. ────────────────────────────────────
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? 'BODY');
    expect(focusedTag, 'focus must not drop to <body> on dismissal').not.toBe('BODY');
  });

  /**
   * **Double-click a bar opens its editor** (ADR-0218 D4, `docs/specs/diagram-keys-and-selection/` M3).
   *
   * The canvas had no `dblclick` at all. What the journey pins is where it lands (General for someone
   * who can edit now), that focus is inside the dialog it opened, and the four places it must do
   * nothing: empty ground, the Link tool, and (in the unit tier) a drag. The negatives sit in the same
   * test as the positive that precedes them, so a build that never opened anything could not pass them.
   */
  test('double-clicking a bar with the pen opens its editor on General, and not in the Link tool or on empty ground', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Double-click editor');
    await ensurePen(page);

    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Dig footings', laneIndex: 0 },
      { name: 'Steel frame', laneIndex: 1 },
    ]);
    const [dig, steel] = seeded;
    if (!dig || !steel) throw new Error('seeding returned no activities');
    await recalculate(page, orgSlug);
    await ensurePen(page);

    // ── The bar's editor opens on General, for that activity. ─────────────────────────────────
    const at = await findBar(page, dig.id);
    await canvas(page).dblclick({ position: at });
    const editor = activityEditor(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('heading', { name: dig.name })).toBeVisible();
    await expect(editor.getByRole('tab', { name: 'General', selected: true })).toBeVisible();
    await expect
      .poll(() => editor.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await editor.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ── Empty ground opens nothing. ───────────────────────────────────────────────────────────
    const box = await canvas(page).boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await canvas(page).dblclick({ position: { x: Math.floor(box.width / 2), y: box.height - 30 } });
    await expect(canvas(page)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ── The Link tool owns its two clicks. ────────────────────────────────────────────────────
    const commands = page.getByRole('toolbar', { name: 'Plan commands' });
    await commands.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(commands.getByRole('button', { name: /^Linking/ })).toBeVisible();
    await canvas(page).dblclick({ position: at });
    await expect(commands.getByRole('button', { name: /^Linking/ })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('double-clicking a bar as a Contributor opens Progress, which is all they can report', async ({
    browser,
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 2);
    const mateEmail = `chrome-mate-${STAMP}@example.com`;

    // Invite a Contributor, who can report progress and cannot edit the schedule.
    await page
      .getByRole('navigation', { name: 'Organisation' })
      .getByRole('link', { name: 'Members', exact: true })
      .click();
    await page.getByRole('button', { name: 'Invite member' }).click();
    const invite = page.getByRole('dialog');
    await invite.getByLabel('Email').fill(mateEmail);
    await invite.getByLabel('Role', { exact: true }).selectOption('CONTRIBUTOR');
    await invite.getByRole('button', { name: /send invitation/i }).click();
    const acceptUrl = await page.getByLabel('Invitation link').inputValue();
    await invite
      .getByRole('button', { name: /close|done/i })
      .first()
      .click();

    await createHierarchy(page);
    await newPlan(page, 'Double-click contributor');
    await ensurePen(page);
    const seeded = await seedActivities(page, orgSlug, [{ name: 'Dig footings', laneIndex: 0 }]);
    const [dig] = seeded;
    if (!dig) throw new Error('seeding returned no activity');
    await recalculate(page, orgSlug);
    const planPath = new URL(page.url()).pathname;

    const mateContext = await browser.newContext();
    const mate = await mateContext.newPage();
    await mate.goto('/sign-up');
    await mate.getByLabel('Full name').fill('Chrome Mate');
    await mate.getByLabel('Email').fill(mateEmail);
    await mate.getByLabel('Password').fill('correct-horse-battery');
    await mate.getByRole('button', { name: /create an account/i }).click();
    await expect(mate.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
      timeout: 15_000,
    });
    await mate.goto(acceptUrl);
    await mate.getByRole('button', { name: /accept and join/i }).click();
    await expect(mate).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

    await mate.goto(planPath);
    const at = await findBar(mate, dig.id);
    await canvas(mate).dblclick({ position: at });
    const editor = activityEditor(mate);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('heading', { name: dig.name })).toBeVisible();
    await expect(editor.getByRole('tab', { name: 'Progress', selected: true })).toBeVisible();
    await mateContext.close();
  });
});
