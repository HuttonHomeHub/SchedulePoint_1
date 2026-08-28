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
async function sweep(
  page: Page,
  root = '[role="toolbar"][aria-label="Plan commands"]',
): Promise<Target[]> {
  return page.evaluate(
    ({ minTarget, root: rootSelector }) => {
      const deck = document.querySelector(rootSelector);
      if (!deck) throw new Error(`command-surface: no surface matched ${rootSelector}`);

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
      if (out.length === 0)
        throw new Error(`command-surface: ${rootSelector} reported no controls`);
      void minTarget;
      return out;
    },
    { minTarget: MIN_TARGET, root },
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

  /**
   * **Every command label on the deck resolves to ONE computed size**
   * (`docs/specs/object-bar-defects/` M3).
   *
   * `Deck` used to override a plain command's label to `text-micro`, and it produced two scales on
   * one row by **two** mechanisms — only one of which was known when the fix was proposed:
   *
   *  1. Eight `render` items (every `▾` trigger) never reached that branch and kept the shared
   *     CVA's `text-sm`.
   *  2. The override targeted `> span:last-of-type`, and `ToolbarButton` renders
   *     icon → label → `sr-only` reason → `sr-only` description. So a control carrying a reason or
   *     an `srDescription` had the override land on an **invisible** span, and its visible label
   *     fell through to `text-sm` — meaning **a label grew from 10 px to 14 px the moment it was
   *     shaded**. Three were live in that state on the measured screen.
   *
   * **This asserts the invariant, not the value.** A gate pinned to `14px` would go red on a
   * deliberate ramp change and say nothing about the defect; what must hold is that the deck does
   * not paint two sizes at once. Captions are excluded on purpose — `text-micro` is their own rule
   * (`Deck.tsx`), and a caption and a command being different sizes is a ramp rather than a mix.
   *
   * **It has to run in a browser.** jsdom computes no Tailwind, so `getComputedStyle` there returns
   * nothing to compare — which is exactly why this shipped and stayed shipped.
   *
   * **Verified red** against the pre-M3 code: two sizes, naming the shaded items.
   */
  test('the deck paints one type scale across every command label', async () => {
    test.setTimeout(240_000);
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(400);

      const labels = await page.evaluate(() => {
        const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
        if (!deck) throw new Error('the command deck was not found — nothing to assert about');
        const out: { item: string; text: string; px: string }[] = [];
        for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
          const item = el.getAttribute('data-toolbar-item') ?? '?';
          // (The `caption:` skip that stood here left with the fold — a static caption carries no
          // `data-toolbar-item`, so nothing reaches this loop to be skipped.)
          const label = [...el.querySelectorAll('span')]
            .filter(
              (sp) => (sp.textContent ?? '').trim() !== '' && !sp.className.includes('sr-only'),
            )
            .pop();
          if (!label) continue;
          out.push({
            item,
            text: (label.textContent ?? '').trim().slice(0, 24),
            px: getComputedStyle(label).fontSize,
          });
        }
        return out;
      });

      // The pinned positive: a deck rendering no labels would satisfy "one distinct size" trivially.
      expect(labels.length, `no command labels found at ${viewport.width}`).toBeGreaterThan(10);

      const sizes = [...new Set(labels.map((l) => l.px))];
      expect(
        sizes,
        `the deck paints ${sizes.length} label sizes at ${viewport.width}: ${JSON.stringify(labels)}`,
      ).toHaveLength(1);
    }
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
   * **The fold is GONE, driven against the real registry** (workspace visual polish, 2026-08-28).
   *
   * The two cases that stood here drove the fold and its keyboard model (`docs/TECH_DEBT.md` #182);
   * the product owner's steer removed the fold, so they went with it — a gate whose subject no
   * longer exists does not become a safety net by staying green (ADR-0109 D1). What replaces them
   * pins the new contract against the SHIPPED registry rather than a unit fixture (the ADR-0114
   * lesson: `Deck.test.tsx`'s fixture is a shape the real registry does not contain), and keeps the
   * roving walk — the part of #182 that was about keyboard coherence, not about folding.
   */
  test('the deck has no disclosure captions, and the roving walk still laps every command', async () => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    await expect(deck).toBeVisible();

    // No caption buttons, in either direction it could quietly return: nothing carries the old
    // `caption:` item id, and nothing in the deck carries `aria-expanded` as a fold state — the
    // popover triggers are `aria-haspopup` controls whose expanded state lives on the open panel,
    // asserted separately so a fold cannot hide behind them.
    await expect(page.locator('[data-toolbar-item^="caption:"]')).toHaveCount(0);
    await expect(deck.getByRole('button', { name: /commands$/ })).toHaveCount(0);
    // The pinned positive: the groups themselves survive, named for AT.
    for (const name of ['View', 'Find', 'Author', 'Plan']) {
      await expect(deck.getByRole('group', { name, exact: true })).toBeVisible();
    }

    // **The roving walk, kept from the fold case it replaces.** ArrowRight/ArrowLeft are the
    // traversal keys; ArrowDown is the escape hatch out of a text field (a single-line input
    // claims the caret keys — `docs/TECH_DEBT.md` #189), and a popover trigger legitimately
    // claims ArrowDown to OPEN its panel, at which point the container stands down on
    // `defaultPrevented` (#192).
    await deck.locator('[data-toolbar-focusable]').first().focus();
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
    // The search field is IN the lap rather than the end of it — a walk that stops there is #189.
    expect(reached, 'the search field is not in the roving sequence').toContain('search');
    // A lap visits commands from the first and last deck groups, so the walk crossed every card.
    expect(reached, 'the walk never reached the Plan card').toContain('export');
    expect(reached.filter((id) => id.startsWith('caption:'))).toEqual([]);
  });

  /**
   * **The object-action bar, which this gate did not cover until now.**
   *
   * `docs/TECH_DEBT.md` #124 put the selection bar outside this sweep's scope **by decision**, and
   * `selection-actions.tsx:286-288` cites that. The decision has cost: measured
   * (`docs/specs/foot-row/m0-measurement.md`), the bar's content is 1753 px at every width against
   * containers of 1619 and 1345, and it neither wraps nor scrolls — so `Clear visual start`
   * renders off-screen at 1920 and `Edit`, `Duplicate` and `Delete` join it at 1646. A pointer
   * cannot reach any of them, and **a keyboard does not rescue them either**: §C1d focused a
   * clipped control and read its rect before and after — identical, because the clip is an
   * ancestor's `overflow-hidden` with nothing scrollable to move. It shipped unreported because
   * nothing looked wrong; the row simply ended.
   *
   * Widening the existing sweep rather than writing a second one is deliberate: two gates with one
   * job disagree about what "reachable" means. This closes the open half of #124.
   *
   * **Verified red before the fix**, naming exactly those controls.
   */
  test('every object action a pointer can see, it can also reach', async () => {
    test.setTimeout(240_000);

    // Select through the canvas's own parallel listbox (ADR-0026 D7): focusing it default-selects,
    // which is a real keyboard route and needs no bar coordinates. Clicking an option does not
    // work — the listbox is `sr-only`, and that is what made an earlier probe silently skip.
    await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();

    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const targets = await sweep(page, '[role="toolbar"][aria-label^="Actions for"]');

      // The pinned positive — without it this passes equally against a bar rendering nothing.
      expect(targets.length, `no object actions swept at ${viewport.width}`).toBeGreaterThan(5);

      const undersized = targets.filter((t) => t.visible && (t.w < MIN_TARGET || t.h < MIN_TARGET));
      expect(
        undersized,
        `object actions below ${MIN_TARGET}×${MIN_TARGET} at ${viewport.width}: ${JSON.stringify(undersized)}`,
      ).toEqual([]);

      // **The zero-size filter, which this case shipped without** (M7, architecture gate B7). Both
      // assertions above are guarded by `t.visible`, so a control painted at 0 px passes them
      // silently — which is trap 2 at the top of this file, and this defect class's exact shape.
      // The deck sweep has carried it since ADR-0110; the sweep modelled on it did not.
      const invisible = targets.filter((t) => !t.visible);
      expect(
        invisible,
        `object actions painted at zero size at ${viewport.width}: ${JSON.stringify(invisible)}`,
      ).toEqual([]);

      const unreachable = targets.filter((t) => t.visible && !t.reachable);
      expect(
        unreachable,
        `object actions a pointer cannot reach at ${viewport.width}: ${JSON.stringify(unreachable)}`,
      ).toEqual([]);
    }
  });
});
