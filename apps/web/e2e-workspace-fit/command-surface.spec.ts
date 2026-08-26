import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **Every command on the plan's command surface clears 24 × 24 and a pointer can reach it.**
 *
 * WCAG 2.2 §2.5.8 Target Size (Minimum), AA. This closes `docs/TECH_DEBT.md` **#186**: ADR-0109 D1
 * deleted `e2e-toolbar-fit` with the width ladder it tested — correctly, since it asserted a row
 * that no longer exists — and took with it the **only** automated cover 2.5.8 had here.
 *
 * **Two traps, both recorded from ADR-0090 M5 rather than rediscovered:**
 *
 * 1. **Sweep the item's focusable control, not `[data-toolbar-item]`.** That attribute sits on an
 *    item's focusable control in most cases but on a wrapper in others, and a split button's caret
 *    is deliberately `tabIndex={-1}` — which is exactly how a caret shipped at **23 × 36**, under a
 *    gate that was sweeping the wrapper and reporting green.
 * 2. **Assert pointer reachability, never overhang.** A control shrunk to zero width has zero
 *    overhang and is still in the DOM, which is this defect class's exact shape — ADR-0090 M1 found
 *    two controls painted at 0 px visible while a proposed arithmetic gate would have passed them.
 *    `elementFromPoint` at the control's centre is the question that cannot be satisfied by a
 *    control nobody can press.
 *
 * **axe is not an alternative and its green is meaningless for this criterion.** Run directly
 * (ADR-0090 M5): `target-size` is tagged `wcag22aa` while every scan in this estate requests
 * `wcag2a`/`wcag2aa`, **and** the rule ships `enabled: false`.
 */
const WIDTHS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

/** WCAG 2.2 §2.5.8's floor, in CSS px. */
const MIN_TARGET = 24;

interface Target {
  id: string;
  tag: string;
  w: number;
  h: number;
  reachable: boolean;
  visible: boolean;
}

/**
 * Every command's **focusable control**, with its real box and whether its own centre hits itself.
 *
 * The descent from `[data-toolbar-item]` to a focusable descendant is the fix for trap 1: where the
 * attribute already sits on the button, the element is its own answer; where it sits on a wrapper,
 * this finds the control inside. A split button contributes **both** halves, because the caret is a
 * pointer target even though it is out of the tab sequence — and it is the half that shipped
 * undersized.
 */
async function sweep(page: Page): Promise<Target[]> {
  return page.evaluate(
    ({ minTarget }) => {
      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      if (!deck)
        throw new Error('command-surface: no deck — [aria-label="Plan commands"] is absent');

      const out: Target[] = [];
      // **Every pointer target in the deck, in one pass — never per-`[data-toolbar-item]`.**
      // `button`/`a`/`[role=button]` plus `input`, because a split button's caret is
      // `tabIndex={-1}` and the search field is an `<input>`; both are things a planner clicks.
      {
        const all = [
          ...deck.querySelectorAll('button,a,[role="button"]'),
          ...deck.querySelectorAll('input'),
        ];
        for (const el of all) {
          // Identify by the owning item where there is one. A caret has no `data-toolbar-item` of
          // its own — that is the whole reason the per-item version could not see it — so it
          // reports its accessible name instead, and the failure message still names something a
          // reader can find on screen.
          const item = el.closest('[data-toolbar-item]');
          const r = el.getBoundingClientRect();
          const visible = r.width > 0 && r.height > 0;
          let reachable = false;
          if (visible) {
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            reachable = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
          }
          out.push({
            id:
              item?.getAttribute('data-toolbar-item') ??
              el.getAttribute('aria-label') ??
              '(unnamed)',
            tag: el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            reachable,
            visible,
          });
        }
      }
      if (out.length === 0) throw new Error('command-surface: the deck reported no controls');
      void minTarget;
      return out;
    },
    { minTarget: MIN_TARGET },
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('The plan command surface', () => {
  /**
   * **One page, built once, shared by both tests.**
   *
   * `mode: 'serial'` shares the WORKER, not the page — each test still gets a fresh `page` fixture,
   * so the second one opened a blank tab and failed looking for a deck that had never been
   * rendered. That was the first run's failure, and it was the spec's rather than the product's.
   *
   * Shared rather than built twice because the setup is ~25 s of real sign-up, hierarchy, plan,
   * seed and recalculation, and paying that again to fold one group is not a trade worth making.
   */
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1646, height: 1097 } });
    const orgSlug = await onboard(page, Date.now());
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
    // `recalculate` reloads, which drops the pen. Take it back: the deck is pen-gated, so a sweep
    // without it measures a different, smaller set of enabled controls.
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('every command clears 24 × 24 and a pointer can reach it, at every width', async () => {
    test.setTimeout(240_000);
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const targets = await sweep(page);

      // **The pinned positive.** Without it this suite passes just as happily against a deck that
      // renders no commands at all — the ADR-0093 lesson, and `m0-bands` reported exactly that kind
      // of false absence earlier in this epic.
      expect(targets.length, `no controls swept at ${viewport.width}`).toBeGreaterThan(15);

      const undersized = targets.filter((t) => t.visible && (t.w < MIN_TARGET || t.h < MIN_TARGET));
      expect(
        undersized,
        `controls below ${MIN_TARGET}×${MIN_TARGET} at ${viewport.width}: ${JSON.stringify(undersized)}`,
      ).toEqual([]);

      const invisible = targets.filter((t) => !t.visible);
      expect(
        invisible,
        `controls painted at zero size at ${viewport.width}: ${JSON.stringify(invisible)}`,
      ).toEqual([]);

      const unreachable = targets.filter((t) => t.visible && !t.reachable);
      expect(
        unreachable,
        `controls a pointer cannot reach at ${viewport.width}: ${JSON.stringify(unreachable)}`,
      ).toEqual([]);
    }
  });

  /**
   * Folding a group and unfolding it again — **the second half is the point**.
   *
   * `docs/TECH_DEBT.md` #182 records the deck's folded groups being undriven by anything. A test
   * that only folds proves the group can be hidden; it takes the unfold to prove the commands come
   * back, which is the state a planner is left in if it does not.
   */
  test('a deck group folds and unfolds, and its commands come back', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    await expect(deck).toBeVisible();

    const caption = page.locator('[data-toolbar-item="caption:author"]');
    await expect(caption).toHaveAttribute('aria-expanded', 'true');
    const before = await deck.locator('[data-toolbar-item]').count();

    await caption.click();
    await expect(caption).toHaveAttribute('aria-expanded', 'false');
    const folded = await deck.locator('[data-toolbar-item]').count();
    expect(folded, 'folding the group hid nothing').toBeLessThan(before);

    await caption.click();
    await expect(caption).toHaveAttribute('aria-expanded', 'true');
    await expect(deck.locator('[data-toolbar-item]')).toHaveCount(before);

    // And the surface is still sound in the state the fold left it: a group that comes back with a
    // control nobody can press is not "came back".
    const targets = await sweep(page);
    expect(targets.filter((t) => t.visible && !t.reachable)).toEqual([]);
  });

  /**
   * **A keyboard reader can fold a group and get back into it.**
   *
   * This is the half `docs/TECH_DEBT.md` #182 actually cares about, and its own words say so: what
   * was untested is "whether a _keyboard_ reader can get back to a folded group's contents, and
   * whether the roving `tabindex` stays coherent across a fold". Both are asserted in
   * `Deck.test.tsx`; neither had been driven in a browser.
   *
   * The failure it guards against is specific and would be silent: folding unmounts the group's
   * items, so a roving stop naming one of them leaves the deck with **no tab stop at all** — a
   * surface a keyboard reader cannot enter. `Deck` derives the stop rather than repairing it in an
   * effect precisely so that state cannot exist; this proves it in the only place the derivation
   * and a real focus ring meet.
   */
  test('a keyboard reader folds a group, keeps a tab stop, and unfolds it', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    await expect(deck).toBeVisible();

    const caption = page.locator('[data-toolbar-item="caption:author"]');
    const before = await deck.locator('[data-toolbar-item]').count();

    // Fold it from the keyboard, not with a click — that is the path under test.
    await caption.focus();
    await page.keyboard.press('Enter');
    await expect(caption).toHaveAttribute('aria-expanded', 'false');
    expect(await deck.locator('[data-toolbar-item]').count()).toBeLessThan(before);

    // **Exactly one roving stop, and it points at something rendered.** Zero is the defect: a deck
    // nobody can Tab into. More than one is the other one: Tab would enter the deck twice.
    const stops = deck.locator('[data-toolbar-focusable][tabindex="0"]');
    await expect(stops).toHaveCount(1);
    await expect(stops.first()).toBeVisible();

    // **The arrow keys traverse the whole surface in the state the fold left it — and the two
    // families do different jobs, which this walk models rather than assumes.**
    //
    // On a horizontal toolbar `ArrowRight`/`ArrowLeft` are the traversal keys. `ArrowUp`/`ArrowDown`
    // are NOT: they are the escape hatch out of a text field (a single-line input claims the caret
    // keys and has no use for the vertical ones — `docs/TECH_DEBT.md` #189), and a popover trigger
    // legitimately claims `ArrowDown` to OPEN its panel, at which point the container stands down on
    // `defaultPrevented` (#192). An earlier version of this walk pressed `ArrowDown` throughout and
    // halted on `today`, the Go-to-date trigger — the product was right and the test was wrong about
    // which key does what.
    await page.keyboard.press('Home');
    const reached: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const here = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          id: active?.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? null,
          isField: active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA',
        };
      });
      if (here.id !== null && !reached.includes(here.id)) reached.push(here.id);
      // One ArrowDown to step out of a text field, ArrowRight everywhere else.
      await page.keyboard.press(here.isField ? 'ArrowDown' : 'ArrowRight');
    }
    expect(reached, "the folded group's caption is not reachable by arrow key").toContain(
      'caption:author',
    );
    // The search field is IN the lap rather than the end of it — a walk that stops there is #189,
    // and a lap that never reaches it is a fixture proving nothing.
    expect(reached, 'the search field is not in the roving sequence').toContain('search');
    expect(
      reached.indexOf('caption:author'),
      'the traversal did not get past the search field',
    ).toBeGreaterThan(reached.indexOf('search'));

    // And back in again, from the keyboard, with every command restored.
    await caption.focus();
    await page.keyboard.press('Enter');
    await expect(caption).toHaveAttribute('aria-expanded', 'true');
    await expect(deck.locator('[data-toolbar-item]')).toHaveCount(before);
  });
});
