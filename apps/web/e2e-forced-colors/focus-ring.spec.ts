import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A keyboard focus ring is visible under Windows High Contrast (`docs/TECH_DEBT.md` #324).
 *
 * **The defect, measured before the remedy.** The house convention is `focus-visible:outline-none`
 * plus a `focus-visible:ring-*` box-shadow — 61 occurrences across 49 files in `apps/web/src`.
 * `forced-colors: active` computes `box-shadow` to `none` outright and leaves a native `outline`
 * alone, so every control following the convention showed **no focus indicator at all**: WCAG 2.2
 * §2.4.7 Focus Visible, level A, across the whole product. Measured in Chromium against the
 * production build with the control focused by keyboard, a screenshot of its box before and after
 * `Tab` was **byte-identical**.
 *
 * **So the pixel comparison is the assertion, and the computed style is corroboration.** A test that
 * only read `outline-style` would pass against a rule that resolves to a ring nobody can see — a
 * transparent colour, a zero offset behind an opaque border, a control the mode paints over. Two
 * screenshots of the same element that differ is the statement a reader actually cares about, and it
 * is what was used to establish the defect, so before and after are measured the same way.
 *
 * **Its control is the `forced-colors: none` case in the same file.** Without it, a run proving
 * "focusing changes pixels under forced colours" would pass equally against a build where the
 * ordinary box-shadow ring had been broken and replaced by the outline everywhere — i.e. it could
 * not tell the fix from a regression that happens to satisfy it.
 *
 * **What this does NOT establish**, and the second and third are the M7 accessibility review's.
 *
 * Chromium's `forcedColors` is an **emulation** of Windows High Contrast, not the mode on real
 * Windows with a real theme, and nothing here is observed with a screen reader —
 * `docs/TECH_DEBT.md` #154 is untouched. One browser, one page, three controls.
 *
 * **Ancestor clipping is not exercised.** A 2px outline at 2px offset extends 4px beyond the border
 * box, and an ancestor `overflow: hidden` clips it exactly as it would clip a box-shadow ring —
 * `docs/TECH_DEBT.md` #124 and ADR-0114 M1 record that class of defect in this codebase. All three
 * controls here sit on `/sign-in`'s centred card, not beside a horizontally scrolled `DataTable`, a
 * popover panel or the plan-workspace deck. It is **not a regression**: the geometry is identical to
 * the `ring-2 ring-offset-2` convention, so wherever a ring is clipped today the outline is clipped
 * the same way. Named because it is implicit otherwise.
 *
 * **A dozen `tabIndex={-1}` focus-handoff destinations carry a bare `outline-none` and no ring at
 * all** (`PlansTable`, `ActivitiesTable`, `ClientsTable`, `ResourcesTable`, `CalendarsTable`,
 * `BaselinesPanel`, `ActivityLogicPanel`, `RecentlyDeletedTable`, `CrossPlanLinksSection`,
 * `ProjectsTable`, `ActivityResourcesPanel`, `CalendarExceptionsEditor`) — the same WCAG 2.4.7 gap
 * `ProjectCalendarsSection` records having fixed once for its own screen. Under this rule they gain
 * a ring in forced colours and stay ringless in ordinary colours, so the mode inconsistency a later
 * reader meets there is a **pre-existing gap partly closed**, not new breakage.
 */

/** Focus by keyboard, because `:focus-visible` is the selector under test and `.focus()` is not it. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('never reached the control by Tab — the assertion below would be vacuous');
}

/** The element's own box, before and after focusing it, as PNG bytes. */
async function focusChangesPixels(page: Page, target: Locator): Promise<boolean> {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  // Clipped generously, because the ring is drawn OUTSIDE the border box (`outline-offset: 2px`)
  // and a screenshot of the element alone would miss the very thing under test.
  const box = await target.boundingBox();
  if (!box) throw new Error('the control has no box — it is not rendered');
  const clip = { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 };
  const before = await page.screenshot({ clip });
  await tabTo(page, target);
  const after = await page.screenshot({ clip });
  return !before.equals(after);
}

const CONTROLS: { name: string; find: (page: Page) => Locator }[] = [
  // Three different primitives, because the convention lives in `Button`'s CVA base AND in sixty
  // other places. A single subject would prove the rule reaches one component.
  { name: 'a text input', find: (page) => page.getByLabel('Email') },
  { name: 'a submit button', find: (page) => page.getByRole('button', { name: /sign in/i }) },
  { name: 'a link', find: (page) => page.getByRole('link').first() },
];

test.describe('forced colours', () => {
  test.use({ forcedColors: 'active' });

  for (const control of CONTROLS) {
    test(`${control.name} shows a focus indicator`, async ({ page }) => {
      await page.goto('/sign-in');
      const target = control.find(page);
      await expect(target).toBeVisible();

      expect(
        await focusChangesPixels(page, target),
        'focusing this control changed no pixels under forced colours — WCAG 2.2 §2.4.7',
      ).toBe(true);

      // Corroboration: the indicator is a native `outline`, which is the one thing the mode does not
      // suppress. A box-shadow here would be the defect restated.
      const style = await target.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
        };
      });
      expect(style.outlineStyle).not.toBe('none');
      expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThan(0);
    });
  }
});

test.describe('ordinary colours — the control', () => {
  test.use({ forcedColors: 'none' });

  test('the box-shadow ring still works, so the fix is additive', async ({ page }) => {
    /**
     * Not decoration. The suite above passes equally against a build where the shipped `ring-*`
     * convention had been replaced by an outline everywhere — that is a regression, not the fix, and
     * only this test can tell them apart. The forced-colours rule is meant to be **additive**: 61
     * call sites are untouched and `forced-colors: none` renders byte-for-byte what it did before.
     */
    await page.goto('/sign-in');
    const button = page.getByRole('button', { name: /sign in/i });
    await expect(button).toBeVisible();

    /**
     * **The guard has not leaked, and this is the assertion with the widest blast radius.**
     *
     * If the `@media (forced-colors: active)` query were ever defeated — a build change, a tidy-up,
     * a bundler that hoists the rule out of its query — the unlayered `outline: 2px solid Highlight`
     * would fire **unconditionally, on every focused control in the product, in ordinary colours**.
     * `Highlight` is a valid CSS colour outside forced-colours mode too (it resolves to the OS
     * selection colour), so that is not an inert mistake: it is a visible, permanent colour
     * regression on every focus ring.
     *
     * **And every other assertion in this file would still pass.** `focusChangesPixels` returns
     * `true` either way — an added outline only adds more pixel change. `box-shadow` is an
     * independent property an unconditional outline does not touch. And the structural test reads
     * the SOURCE, so it cannot see a build-time defeat of the guard at all, which is the specific
     * class this suite exists to cover. That is the epic's own named risk
     * (`implementation-plan.md`: "The `forced-colors` block is defeated by the cascade and ships
     * inert") — and it was asserted in three docblocks and tested nowhere until the M7 review found
     * it. Nobody would have noticed here, which is exactly why it is one line.
     *
     * **Its first version could not fire, and that is worth keeping.** The assertion was written
     * where the review suggested it — immediately after `toBeVisible()` — and passed cheerfully
     * against a build with the `@media` guard deleted. `:focus-visible` does not match an unfocused
     * element, and `focusChangesPixels` **blurs the control first**, so the read happened at the one
     * moment the rule could not apply whatever the stylesheet said. A gate written for a defect and
     * verified against nothing is worse than no gate, because it stops anyone looking. The read is
     * now taken while the control is focused, and it **throws** rather than asserting if it is not.
     */
    expect(await focusChangesPixels(page, button)).toBe(true);

    // **Read WHILE the control is focused.** `focusChangesPixels` leaves it focused, and that
    // ordering is the assertion — see the note above for what happened when it was not.
    const style = await button.evaluate((el) => {
      if (el !== document.activeElement) throw new Error('not focused — the read below is vacuous');
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, boxShadow: cs.boxShadow };
    });
    expect(
      style.outlineStyle,
      'forced-colors: none must not paint the forced-colours outline',
    ).toBe('none');
    expect(style.boxShadow, 'the ordinary ring is a box-shadow and must be unchanged').not.toBe(
      'none',
    );
  });
});
