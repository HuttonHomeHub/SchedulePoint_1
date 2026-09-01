import { expect, test } from '@playwright/test';

import {
  activityCount,
  createPlan,
  diagramActivityList,
  ensurePen,
  onboard,
  openActivitiesPanel,
  openRowMenu,
  recalculate,
  releasePen,
  rowCheckbox,
  seedActivities,
  toggleView,
} from './support';

/**
 * The flag-ON **WBS improvements** journey (`VITE_WBS_IMPROVEMENTS`, ADR-0063).
 *
 * One journey, because the epic's claims are sequential: you cannot check that dissolving a summary
 * keeps its work without first having filed work into one. Serial, on one plan, mirroring the other
 * flag-on suites.
 *
 * What only a real server can prove, and therefore why this exists rather than more unit tests:
 *
 * - the batch membership write is **per-row optimistic-locked** — a mocked `fetch` accepts any
 *   `version`, so the version the multi-select sends is only ever really checked here;
 * - the batch and dissolve are **pen-gated** (423). With the lock enforced, releasing the pen has
 *   to shut the affordances, and a client-side boolean is not evidence that it does;
 * - **no activity is lost** to a dissolve. The count comes from the API, not from what the screen
 *   is showing.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
let orgSlug = '';

test('WBS: group, see, dissolve — without losing work', async ({ page }) => {
  test.slow();

  orgSlug = await onboard(page, STAMP);
  await createPlan(page, 'Riverside Programme');
  await ensurePen(page);

  // ---------------------------------------------------------------- seed
  // One summary and five loose activities. Seeded through the API: what this journey is about is
  // what happens to them next, not how they were typed in.
  await seedActivities(page, orgSlug, [
    { name: 'Substructure', type: 'WBS_SUMMARY' },
    { name: 'Excavate' },
    { name: 'Blind' },
    { name: 'Reinforce' },
    { name: 'Pour' },
    { name: 'Strike' },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  const seeded = await activityCount(page, orgSlug);
  expect(seeded).toBe(6);

  // ------------------------------------------------- M4b: multi-select bulk assign
  // The canvas-first workspace (ADR-0030) puts the table in a collapsible bottom panel, so reach it
  // explicitly before asserting anything about its contents.
  await openActivitiesPanel(page);

  // Presence BEFORE absence, and in that order deliberately: `toHaveCount(0)` is satisfied just as
  // well by a table that never rendered, so the summary-has-no-checkbox assertion below is only
  // meaningful once some other row is known to have one. Asserted the other way round, this block
  // passed against a collapsed panel and failed five lines later for an unrelated-looking reason.
  await expect(rowCheckbox(page, 'Excavate')).toBeVisible();
  // A summary offers no checkbox — nesting one is the Breakdown picker's job (spec C-1b).
  await expect(rowCheckbox(page, 'Substructure')).toHaveCount(0);

  // **Every selection checkbox clears 24 x 24** (`docs/TECH_DEBT.md` #72). A bare `size-4` input is
  // a **16 px** pointer target, below WCAG 2.2 §2.5.8's AA floor, and it sat outside every
  // instrument that could report it: `e2e-workspace-fit`'s sweep is scoped to the command surfaces,
  // and axe's `target-size` rule is tagged `wcag22aa` (never requested here) *and* ships
  // `enabled: false`. The fix wraps the 16 px box in a 24 px `<label>`, so this measures the LABEL.
  //
  // It lives in this journey and not in the target-size suite because the selection column renders
  // only when the plan holds a `WBS_SUMMARY` — written there first, its pinned positive caught the
  // fixture having none and failed rather than sweeping an empty set and reporting green.
  const targets = await page.getByRole('checkbox', { name: /^Select / }).evaluateAll((els) =>
    els.map((el) => {
      const box = (el.closest('label') ?? el).getBoundingClientRect();
      return {
        name: el.getAttribute('aria-label') ?? '?',
        w: Math.round(box.width),
        h: Math.round(box.height),
      };
    }),
  );
  expect(targets.length, 'no selection checkboxes found').toBeGreaterThan(0);
  expect(
    targets.filter((t) => t.w < 24 || t.h < 24),
    `selection checkboxes below 24x24: ${JSON.stringify(targets)}`,
  ).toEqual([]);

  await rowCheckbox(page, 'Excavate').check();
  await rowCheckbox(page, 'Blind').check();
  await rowCheckbox(page, 'Reinforce').check();
  await rowCheckbox(page, 'Pour').check();
  await rowCheckbox(page, 'Strike').check();

  const assignTo = page.getByLabel('Assign to');
  await expect(assignTo).toBeVisible();
  await assignTo.selectOption({ label: 'Substructure' });
  await expect(page.getByText('5 activities will move')).toBeVisible();
  await page.getByRole('button', { name: 'Assign' }).click();

  // The batch landed — every row now names its parent in the read-only WBS column. Read from the
  // table rather than from a toast: a toast proves a request was made, not that it was accepted.
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Excavate/ }).getByText('Substructure')).toBeVisible();

  // Nothing was created or destroyed by a re-parent.
  expect(await activityCount(page, orgSlug)).toBe(seeded);

  await recalculate(page, orgSlug);
  await ensurePen(page);

  // ------------------------------------------------- M4: the pinned canvas band
  // The a11y invariant first (ADR-0063 §4): summaries leave the SCENE when the band is on, and must
  // not leave the accessibility tree with it. The listbox is the only way an AT user reaches a bar.
  const before = await diagramActivityList(page).getByRole('option').count();
  await toggleView(page, 'WBS band');
  await expect(page.getByTestId('tsld-wbs-band')).toBeVisible();
  await expect(diagramActivityList(page).getByRole('option')).toHaveCount(before);

  // The band sits under the ruler and above the scene — the scene's top moved down with it.
  const bandBox = await page.getByTestId('tsld-wbs-band').boundingBox();
  expect(bandBox?.height ?? 0).toBeGreaterThan(0);

  await toggleView(page, 'WBS band');
  await expect(page.getByTestId('tsld-wbs-band')).toHaveCount(0);

  // ------------------------------------------------- M3: the derived Unassigned bucket
  // Everything is filed right now, so there is nothing unassigned. Add one loose activity and the
  // bucket appears — derived, never persisted.
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  const grid = page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
  await expect(grid).toBeVisible();
  await expect(grid.getByText('Unassigned')).toHaveCount(0);

  await seedActivities(page, orgSlug, [{ name: 'Loose end' }]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(grid.getByText('Unassigned')).toBeVisible();
  await expect(grid.getByText('Loose end')).toBeVisible();

  // ------------------------------------------------- M2: dissolve keeps the work
  // "Diagram", not "TSLD": the toolbar's view-mode pair is Diagram | Gantt (ADR-0059 §the view
  // seam). The URL param is `?view=tsld`, which is where the wrong label came from.
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  const beforeDissolve = await activityCount(page, orgSlug);

  await openRowMenu(page, 'Substructure');
  await page.getByRole('menuitem', { name: 'Dissolve' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(/keeps the work/)).toBeVisible();
  await expect(confirm.getByText(/its 5 activities move up to the top level/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Dissolve' }).click();
  await expect(confirm).toBeHidden();

  // **The invariant.** Exactly one row left — the summary — and every activity that was in it is
  // still in the plan. Counted at the API, because a table can be showing a stale page.
  await expect(page.getByRole('cell', { name: 'Substructure', exact: true })).toHaveCount(0);
  expect(await activityCount(page, orgSlug)).toBe(beforeDissolve - 1);
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // ------------------------------------------------- M0-T4: the honest delete warning
  // Cascade delete is the opposite of dissolve, and the confirmation has to say so with a number.
  const [second] = await seedActivities(page, orgSlug, [
    { name: 'Superstructure', type: 'WBS_SUMMARY' },
  ]);
  expect(second).toBeDefined();
  await page.reload();
  await ensurePen(page);
  await openActivitiesPanel(page);

  await rowCheckbox(page, 'Excavate').check();
  await rowCheckbox(page, 'Blind').check();
  await page.getByLabel('Assign to').selectOption({ label: 'Superstructure' });
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveCount(0);

  await openRowMenu(page, 'Superstructure');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const deleteConfirm = page.getByRole('alertdialog');
  // The number is the point: "delete this summary" hides that it takes two activities with it.
  await expect(deleteConfirm.getByText(/the 2 activities below it/)).toBeVisible();
  await deleteConfirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteConfirm).toBeHidden();

  // ------------------------------------------------- the pen actually gates
  await releasePen(page);
  // Dissolve is a structural write, so without the pen the row menu **shades** it and says why —
  // the same as Edit and Delete, and the same as the bulk-assign bar asserted a few lines below.
  //
  // This assertion was inverted by ADR-0082 (`docs/TECH_DEBT.md` #111), and the version it replaces
  // is the reason that ADR exists: it required Dissolve to be *absent* here while the very next
  // paragraph of this same test required the Assign button to be *present and shaded with a
  // reason*. One journey, four lines apart, pinning both halves of the inconsistency.
  await openRowMenu(page, 'Superstructure');
  const dissolve = page.getByRole('menuitem', { name: 'Dissolve' });
  await expect(dissolve).toHaveAttribute('aria-disabled', 'true');
  const dissolveReason = await dissolve.getAttribute('aria-describedby');
  expect(dissolveReason).not.toBeNull();
  await expect(page.locator(`[id="${dissolveReason ?? ''}"]`)).toContainText('Start editing');
  await page.keyboard.press('Escape');

  // Selecting is a READ, so the checkboxes stay live without the pen — and they must, because the
  // bar they open is the only place that says why the write is shut. The bar is SHADED with that
  // reason rather than hidden: `aria-disabled`, so it keeps its place in the tab order.
  await rowCheckbox(page, 'Excavate').check();
  const assign = page.getByRole('button', { name: 'Assign' });
  await expect(assign).toHaveAttribute('aria-disabled', 'true');
  // Read the reason through the button's own `aria-describedby` rather than by hunting for a
  // `role="status"`: the pen banner is also a status region, so a bare role query is ambiguous —
  // and this asserts the thing that actually matters, that the reason is *associated* with the
  // control it explains rather than merely nearby (the M6 accessibility finding).
  const describedBy = await assign.getAttribute('aria-describedby');
  expect(describedBy).not.toBeNull();
  await expect(page.locator(`[id="${describedBy ?? ''}"]`)).toContainText('Start editing');
});

/**
 * **Every item in a row menu can be clicked, not merely focused** — including the last one, on the
 * tallest menu the product renders, opened as low in the window as a row can sit.
 *
 * This exists because the defect it guards was found by accident. Adding a `Notes` item to the
 * activities table (`docs/specs/object-bar-defects/` M2) pushed a WBS summary's menu past 200 px,
 * and `Menu` positioned every menu as though it were exactly that tall: `clampAnchor` used a
 * **hard-coded `ESTIMATED_HEIGHT` and never measured the real box**, so a taller menu opened low ran
 * off the bottom of the viewport. `Delete` — the last item, present on every row — could be reached
 * by keyboard and not by pointer.
 *
 * It surfaced as a Playwright timeout on a locator that **resolved**, which is the signature worth
 * remembering: the element was in the DOM and in the accessibility tree, and the click never landed.
 * Raising the constant was tried first and made this pass; it was rejected, because it moves the
 * threshold and leaves the class. The fix measures the panel.
 *
 * `elementFromPoint` at each item's centre is the assertion, for the reason
 * `e2e-workspace-fit/command-surface.spec.ts` gives: a bounding box says where a control claims to
 * be, and only a hit test says whether a pointer arriving there reaches it.
 *
 * **Verified red** against the unmeasured clamp, naming the item.
 */
test('every item in the tallest row menu is reachable by pointer, not just present', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const org = await onboard(page, Date.now() + 11);
  await createPlan(page, 'Menu reach');
  await ensurePen(page);
  await seedActivities(page, org, [
    { name: 'Substructure', type: 'WBS_SUMMARY' },
    { name: 'Excavate' },
  ]);
  await recalculate(page, org);
  await ensurePen(page);
  await openActivitiesPanel(page);

  // A **summary** carries the most items — Logic, Notes, Progress, Members, Resources, Edit,
  // Dissolve, Delete — so it is the menu that overflows first. A plain activity's menu is shorter
  // and would pass against the defect, which is why the subject is named rather than "any row".
  await openRowMenu(page, 'Substructure');

  const unreachable = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) throw new Error('no row menu is open — the probe has no subject');
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    if (items.length < 4) throw new Error(`only ${items.length} menu items — expected a full menu`);
    return items
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          label: (el.textContent ?? '').trim().slice(0, 24),
          bottom: Math.round(r.bottom),
          viewportHeight: window.innerHeight,
          reachable: hit != null && (hit === el || el.contains(hit)),
        };
      })
      .filter((t) => !t.reachable);
  });

  expect(
    unreachable,
    `row-menu items a pointer cannot reach: ${JSON.stringify(unreachable)}`,
  ).toEqual([]);
});
