import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * **The narrow shell** (`docs/specs/narrow-shell-journey/`, closes `docs/TECH_DEBT.md` #172).
 *
 * The first authenticated journey ever to run below `lg` (1024 px). Its subjects are the branches
 * no browser had opened: the off-canvas `Sheet` that IS the Project Explorer on a narrow screen,
 * the header hamburger that opens it, the `matchMedia` transition effect that closes it on
 * crossing `lg`, and the below-`md` workspace fallback that ADR-0114 M7's gate pass found broken
 * — by a specialist review, because this suite did not exist to find it.
 *
 * **Seeding happens at a WIDE viewport, deliberately.** The subject is the narrow SHELL, not
 * every creation dialog at 390 px; seeding through the proven wide path keeps a dialog-layout
 * failure from reading as a shell failure. The viewport then narrows and stays narrow for the
 * assertions.
 *
 * Reachability is asserted with `elementFromPoint`, not visibility: ADR-0114 M1 measured that a
 * control clipped by an ancestor's `overflow-hidden` moves by zero pixels when focused, so
 * "visible" and "keyboard-reachable" can both hold while a pointer can never touch it — a control
 * that is not painted looks exactly like a control that does not exist.
 */

/** The centre of a locator's box is the topmost element at that point (pointer-reachable). */
async function pointerReachable(page: Page, name: string, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box, `${name} has a layout box`).not.toBeNull();
  if (!box) return;
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      return el ? { tag: el.tagName, text: (el.textContent ?? '').slice(0, 40) } : null;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit, `${name} is under the pointer at its own centre`).not.toBeNull();
  const target = locator;
  const contains = await target.evaluate(
    (el, point) => {
      const found = document.elementFromPoint(point[0], point[1]);
      return found !== null && (el === found || el.contains(found) || found.contains(el));
    },
    [box.x + box.width / 2, box.y + box.height / 2] as [number, number],
  );
  expect(contains, `${name}'s centre point resolves to itself, not a covering element`).toBe(true);
}

test('the narrow shell: sheet navigation, header reachability, breakpoint crossing, plan facts', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = `narrow-co-${stamp}`;

  // ── Seed at a wide viewport (the proven base-journey path, verbatim steps).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Narrow Tester');
  await page.getByLabel('Email').fill(`narrow-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Narrow Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();

  // Back to the organisation landing, then narrow. The shell's pinned rail should give way to
  // the hamburger.
  await page.goto(`/orgs/${orgSlug}`);
  await page.setViewportSize({ width: 390, height: 844 });

  // ── FR-2: the below-`lg` header's controls exist and are pointer-reachable.
  const hamburger = page.getByRole('button', { name: 'Show Project Explorer' });
  await expect(hamburger).toBeVisible();
  await pointerReachable(page, 'the Explorer trigger', hamburger);
  await pointerReachable(
    page,
    'the brand link',
    page.getByRole('link', { name: /SchedulePoint/i }).first(),
  );

  // ── FR-1: open the sheet, walk the hierarchy, navigate to the plan by its NAME.
  await hamburger.click();
  const sheet = page.getByRole('dialog', { name: 'Project Explorer' });
  await expect(sheet).toBeVisible();
  // **Read `aria-expanded` before clicking a container — never click blind.** Creating the plan
  // at the wide viewport auto-expanded the path to it (the shell reveals freshly-created nodes),
  // and expansion persists per organisation — so a blind click COLLAPSES an already-open branch.
  // This spec's first run did exactly that and spent its timeout waiting for a child it had just
  // hidden; the probe that diagnosed it also proved expansion itself works.
  for (const name of [/Northgate/, /Riverside/]) {
    const row = sheet.getByRole('treeitem', { name });
    await expect(row).toBeVisible();
    if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  }
  // The plan is a leaf: clicking anywhere on it navigates, and `onNavigate` closes the sheet.
  await sheet.getByRole('treeitem', { name: /Baseline/ }).click();
  await expect(page).toHaveURL(/\/plans\//);
  await expect(sheet).not.toBeVisible();

  // ── FR-4: below `md` the plan's facts render in the shell fallback, not a hidden pane
  // (the ADR-0114 M7 regression, asserted in a real layout for the first time).
  await expect(page.getByText('Data date', { exact: true })).toBeVisible();

  // ── FR-3: the breakpoint-crossing effect. Open the sheet, widen across `lg`: the effect must
  // close it (a modal drawer lingering behind the pinned rail is a stuck focus trap), and the
  // pinned rail takes over. Narrowing again restores the trigger.
  await page.goto(`/orgs/${orgSlug}`);
  await page.getByRole('button', { name: 'Show Project Explorer' }).click();
  await expect(page.getByRole('dialog', { name: 'Project Explorer' })).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.getByRole('dialog', { name: 'Project Explorer' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Show Project Explorer' })).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Show Project Explorer' })).toBeVisible();

  // ── FR-5: the narrow shell with the sheet open is accessible. ONE `options()` carrying BOTH
  // runOnly and rules — the #170 shape this same PR fixes elsewhere, and this spec's first draft
  // shipped the superseded `.withTags(['wcag2a','wcag2aa'])` in the same diff (caught by the
  // phase gate: the "one correct pattern applied to a control and not its neighbour" class,
  // committed by the neighbour's own author). `target-size` is opted in because axe ships it
  // disabled and tags it wcag22aa — and a 390 px phone journey is exactly where WCAG 2.5.8 bites.
  await page.getByRole('button', { name: 'Show Project Explorer' }).click();
  await expect(page.getByRole('dialog', { name: 'Project Explorer' })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .options({
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
          },
          rules: { 'target-size': { enabled: true } },
        })
        .analyze()
    ).violations,
  ).toEqual([]);
});
