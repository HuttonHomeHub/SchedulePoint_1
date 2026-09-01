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
  /**
   * What `elementFromPoint` returned when it was not the control — **absent when reachable**.
   * Added at ADR-0118 M3 for the same reason as its twin in `measure-toolbar/control-heights`: a
   * gate that can detect a defect and cannot describe it makes its own finding expensive to act
   * on, which is how a finding gets deferred.
   */
  hitBy?: string;
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
  /**
   * A selector for an ancestor whose descendants are excluded — the ONE named exception (see the
   * coarse projection's docblock). Structural rather than an id list, because the ids this sweep
   * reports depend on the fixture's data and an id list would silently stop matching when a plan
   * is renamed, which is the quietest possible way for an exclusion to become a hole.
   */
  exemptWithin?: string,
): Promise<Target[]> {
  return page.evaluate(
    ({ minTarget, root: rootSelector, exemptWithin: exempt }) => {
      const deck = document.querySelector(rootSelector);
      if (!deck) throw new Error(`command-surface: no surface matched ${rootSelector}`);

      const out: Target[] = [];
      // **Every pointer target under the root, in one pass — never per-`[data-toolbar-item]`.**
      //
      // The list is the contract, and it was wrong until ADR-0118 M4. It read
      // `button,a,[role=button]` plus `input` — written when this swept the deck, where those are
      // everything — and M3 then pointed it at the plan header and the Project Explorer without
      // widening it. `OrgSwitcher`'s `<select>` sat in `<header>` at 36 px and the gate reported
      // the header clean: clean of everything it could see. That is ADR-0110 D5 exactly — a sweep
      // whose blind spot is the control class it exists to protect — and it was found by a
      // reviewer reading the query rather than the result.
      //
      // `[tabindex]` is deliberately NOT in the list: it would sweep the roving containers and
      // every `tabIndex={-1}` wrapper, and the caret this gate exists for is already caught as a
      // `button`.
      {
        const all = [
          ...deck.querySelectorAll(
            'button,a,[role="button"],select,textarea,summary,' +
              '[role="treeitem"],[role="option"],[role="menuitem"],' +
              '[role="menuitemcheckbox"],[role="menuitemradio"],[role="tab"],[role="switch"]',
          ),
          ...deck.querySelectorAll('input'),
        ];
        for (const el of all) {
          if (exempt && el.closest(exempt)) continue;
          // **Not rendered is not the same as painted at zero, and the difference is the whole
          // point of the zero-size assertion below.** An element with `display: none` — or an
          // ancestor with it — returns NO client rects; one that is laid out and collapsed
          // returns one rect of zero size, which is this defect class's exact shape (ADR-0090 M1
          // found two controls at 0 px visible). Widening this sweep past the deck brought in
          // `Show Project Explorer`, which is `lg:hidden` **by design** above 1024 and was
          // reported as a zero-size defect on its first run. Skipping it here rather than
          // relaxing the assertion keeps the assertion able to fail.
          if (el.getClientRects().length === 0) continue;
          // Identify by the owning item where there is one. A caret has no `data-toolbar-item` of
          // its own — that is the whole reason the per-item version could not see it — so it
          // reports its accessible name instead, and the failure message still names something a
          // reader can find on screen.
          const item = el.closest('[data-toolbar-item]');
          const r = el.getBoundingClientRect();
          const visible = r.width > 0 && r.height > 0;
          // **Scrolled out of a scrollable list is not the same defect as clipped by
          // `overflow-hidden`, and the sweep has to tell them apart** (ADR-0118 M3). Widening past
          // the deck brought in the Project Explorer's virtualized tree, whose lower rows sit
          // below their scroller's fold: they have a real rect, so `elementFromPoint` at their
          // centre returns whatever IS painted there, and they read as unreachable. A planner
          // scrolls to them.
          //
          // The discriminator is the one ADR-0114 M1's defect turns on: that row was clipped by an
          // ancestor's `overflow-hidden` with **nothing scrollable to move**, so no gesture could
          // ever reveal it — and §C1d proved focusing it moved its rect by zero. So the skip is
          // conditional on the ancestor genuinely having overflow to scroll (`scrollHeight >
          // clientHeight`); a non-scrolling clip still fails, which is what keeps this assertion
          // able to catch the thing it was written for.
          let offFold = false;
          for (let a = el.parentElement; a && !offFold; a = a.parentElement) {
            const st = getComputedStyle(a);
            const scrolls = /auto|scroll/.test(st.overflowY) && a.scrollHeight > a.clientHeight + 1;
            const scrollsX = /auto|scroll/.test(st.overflowX) && a.scrollWidth > a.clientWidth + 1;
            if (!scrolls && !scrollsX) continue;
            const ar = a.getBoundingClientRect();
            if (
              r.bottom <= ar.top ||
              r.top >= ar.bottom ||
              r.right <= ar.left ||
              r.left >= ar.right
            )
              offFold = true;
            // A control straddling the fold has its centre outside the scroller's box; that is
            // the case the tree's lower rows are actually in.
            else if (
              r.top + r.height / 2 < ar.top ||
              r.top + r.height / 2 > ar.bottom ||
              r.left + r.width / 2 < ar.left ||
              r.left + r.width / 2 > ar.right
            )
              offFold = true;
          }
          if (offFold) continue;

          let reachable = false;
          let hitBy: string | undefined;
          if (visible) {
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            reachable = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
            if (!reachable) {
              hitBy = hit
                ? `${hit.tagName.toLowerCase()}` +
                  `${typeof hit.className === 'string' && hit.className ? `.${hit.className.split(/\s+/).slice(0, 5).join('.')}` : ''}` +
                  `${hit.getAttribute('aria-label') ? ` [${hit.getAttribute('aria-label')}]` : ''}` +
                  ` @${Math.round(r.left)},${Math.round(r.top)}`
                : `(nothing at ${Math.round(r.left + r.width / 2)},${Math.round(r.top + r.height / 2)} — outside the viewport)`;
            }
          }
          out.push({
            // Text content is the third fallback, added at ADR-0118 M3: widening this sweep past
            // the deck brought in links and buttons whose name IS their text, and the first
            // failure it produced read `"id": "(unnamed)"` — a gate that can detect a defect and
            // cannot name it sends its reader back to the browser.
            id:
              item?.getAttribute('data-toolbar-item') ??
              el.getAttribute('aria-label') ??
              (el.textContent ?? '').trim().slice(0, 32) ??
              '(unnamed)',
            tag: el.tagName.toLowerCase(),
            w: Math.round(r.width),
            h: Math.round(r.height),
            reachable,
            visible,
            ...(hitBy ? { hitBy } : {}),
          });
        }
      }
      if (out.length === 0)
        throw new Error(`command-surface: ${rootSelector} reported no controls`);
      void minTarget;
      return out;
    },
    { minTarget: MIN_TARGET, root, exemptWithin },
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
   * roving walk — the part of #207 (then numbered #182) that was about keyboard coherence, not about folding.
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
  /**
   * Sweep the object bar at every width, in whatever state the caller has put the workspace in.
   *
   * **Extracted so the same four assertions run in more than one state** (`docs/TECH_DEBT.md`
   * #202c). M1-T1 specified this gate "in both panel states, on TSLD and Gantt" and what shipped
   * covered the collapsed TSLD state only — the panel defaults collapsed and nothing here ever
   * expanded it or switched view. That is not a small gap: ADR-0115 M1 records that expanding the
   * panel or selecting an activity makes this row WRAP, so the untested states are exactly the
   * ones where the row is under pressure.
   */
  async function sweepObjectBar(state: string): Promise<void> {
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const targets = await sweep(page, '[role="toolbar"][aria-label^="Actions for"]');

      // The pinned positive — without it this passes equally against a bar rendering nothing.
      expect(
        targets.length,
        `no object actions swept at ${viewport.width} (${state})`,
      ).toBeGreaterThan(5);

      const undersized = targets.filter((t) => t.visible && (t.w < MIN_TARGET || t.h < MIN_TARGET));
      expect(
        undersized,
        `object actions below ${MIN_TARGET}×${MIN_TARGET} at ${viewport.width} (${state}): ${JSON.stringify(undersized)}`,
      ).toEqual([]);

      // **The zero-size filter, which this case shipped without** (M7, architecture gate B7). Both
      // assertions above are guarded by `t.visible`, so a control painted at 0 px passes them
      // silently — which is trap 2 at the top of this file, and this defect class's exact shape.
      // The deck sweep has carried it since ADR-0110; the sweep modelled on it did not.
      const invisible = targets.filter((t) => !t.visible);
      expect(
        invisible,
        `object actions painted at zero size at ${viewport.width} (${state}): ${JSON.stringify(invisible)}`,
      ).toEqual([]);

      const unreachable = targets.filter((t) => t.visible && !t.reachable);
      expect(
        unreachable,
        `object actions a pointer cannot reach at ${viewport.width} (${state}): ${JSON.stringify(unreachable)}`,
      ).toEqual([]);
    }
  }

  /**
   * Select through the canvas's own parallel listbox (ADR-0026 D7): focusing it default-selects,
   * which is a real keyboard route and needs no bar coordinates. Clicking an option does not work —
   * the listbox is `sr-only`, and that is what made an earlier probe silently skip.
   */
  async function selectOnCanvas(): Promise<void> {
    await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
  }

  test('every object action a pointer can see, it can also reach', async () => {
    test.setTimeout(240_000);
    await selectOnCanvas();
    await sweepObjectBar('TSLD, panel collapsed');
  });

  /**
   * The **expanded** panel, which is the state M1-T1 named and nobody had driven
   * (`docs/TECH_DEBT.md` #202c). The bar shares its row with the plan's facts, so expanding the
   * panel is what puts that row under width pressure.
   */
  test('the same, with the activities panel expanded', async () => {
    test.setTimeout(240_000);
    // Names read from `activity-bottom-panel.tsx:155,317` rather than guessed — this repository
    // records three journeys broken by a locator matching copy nobody checked.
    await page.getByRole('button', { name: 'Expand activities panel' }).click();

    // **The pinned positive for the STATE**, not just for the sweep's result. This case runs in
    // about the same time as its collapsed sibling, which is exactly what a click that silently did
    // nothing would also look like — and a sweep of an unchanged workspace reads as coverage while
    // testing the state that was already covered. The panel's own table is the discriminator: it is
    // not rendered at all while collapsed.
    await expect(page.getByRole('table', { name: /activit/i }).first()).toBeVisible();

    await selectOnCanvas();
    await sweepObjectBar('TSLD, panel expanded');
    await page.getByRole('button', { name: 'Collapse activities panel' }).click();
  });
  /**
   * **The other plan view** (`docs/TECH_DEBT.md` #214).
   *
   * `docs/specs/workspace-chrome-fit/implementation-plan.md:306` (approved) requires this sweep to
   * run "…at every width, **in both plan views**, once with a coarse pointer". The coarse half
   * landed at ADR-0118 M2; the Gantt half was carried into M3 and **did not land there either** —
   * verified 2026-09-01 by grepping the shipped estate, which holds zero occurrences of
   * `view=gantt` or of a coarse sweep under `e2e-gantt/`. So the approved clause was outstanding
   * twice, under a risk table that lists this sweep as the mitigation for "a touch target shrinks".
   *
   * **The Gantt is not a second copy of the diagram's chrome and that is why it needs its own
   * pass.** The deck is one registry with items shaded per view, so sweeping it here is cheap
   * insurance; the grid is a `treegrid` of its own — sortable column headers, a per-row actions
   * menu and in-cell editors (ADR-0095) — and **nothing has ever swept it.** It went last in this
   * describe so the view switch cannot leak into a sibling that assumes the diagram.
   *
   * The grid's floor is deliberately low. It is virtualized, so the swept count is a function of
   * the viewport rather than of the plan, and a floor tuned to a tall window would fail at 1280
   * for a reason that is not a defect. What the pinned positive has to exclude is a grid that
   * rendered nothing at all — which is the state a broken view switch produces, and the state
   * every other assertion here would pass against.
   */
  test('every command and every grid control clears 24 × 24 in the Gantt view too', async () => {
    test.setTimeout(240_000);
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    const grid = page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
    await expect(grid).toBeVisible();

    const SURFACES = [
      { name: 'command deck', root: '[role="toolbar"][aria-label="Plan commands"]', atLeast: 15 },
      { name: 'Gantt grid', root: '[role="treegrid"]', atLeast: 1 },
    ] as const;

    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);

      for (const surface of SURFACES) {
        const targets = await sweep(page, surface.root);

        expect(
          targets.length,
          `no controls swept on ${surface.name} in the Gantt at ${viewport.width}`,
        ).toBeGreaterThan(surface.atLeast);

        const undersized = targets.filter(
          (t) => t.visible && (t.w < MIN_TARGET || t.h < MIN_TARGET),
        );
        expect(
          undersized,
          `${surface.name}: below ${MIN_TARGET}×${MIN_TARGET} in the Gantt at ${viewport.width}: ${JSON.stringify(undersized)}`,
        ).toEqual([]);

        const invisible = targets.filter((t) => !t.visible);
        expect(
          invisible,
          `${surface.name}: painted at zero size in the Gantt at ${viewport.width}: ${JSON.stringify(invisible)}`,
        ).toEqual([]);

        const unreachable = targets.filter((t) => t.visible && !t.reachable);
        expect(
          unreachable,
          `${surface.name}: a pointer cannot reach these in the Gantt at ${viewport.width}: ${JSON.stringify(unreachable)}`,
        ).toEqual([]);
      }
    }
  });
});

/**
 * **The house rule under a coarse pointer: every command clears 44 × 44** (ADR-0118 M2).
 *
 * The sweep above is WCAG 2.2 §2.5.8's **24 px AA floor**, which is a different and much weaker
 * question. 44 px is §2.5.5 Target Size (Enhanced), level **AAA**, and it is this product's own
 * house rule (`docs/UX_STANDARDS.md`) — ADR-0118 D2 narrows it to the coarse pointer, because
 * measurement showed the input device is the axis that matters and the fine default stays 36 px.
 * So this is a **second** projection of the same sweep rather than a raised constant: the AA floor
 * has to keep binding on the fine path, where 44 is deliberately not required.
 *
 * **Its own context, and not `test.use({ hasTouch })`.** `hasTouch` is a context option that
 * configures the page the *fixture* builds; the describe above builds its page with
 * `browser.newPage()` in `beforeAll`, so a `test.use` here would configure a page nothing uses and
 * this whole file would measure a fine pointer while reading as a touch gate. That is not
 * hypothetical — `combobox-coarse.spec.ts` earned the rule by producing two plausible numbers
 * about the wrong pointer, and ADR-0118 M0 records four instruments caught lying in one epic.
 *
 * **So the `matchMedia` assertion below is non-negotiable and runs before any measurement.**
 * Without it a mis-built context yields a green run about nothing, which is strictly worse than no
 * gate: a green gate stops anyone looking (ADR-0110 D5).
 *
 * **Scope is the command deck.** The object-action bar, the plan header, the Project Explorer and
 * the panel chrome are M3's; `docs/TECH_DEBT.md` #153 carries what is still under the rule, and the
 * pinned count below is what stops this narrowing quietly.
 *
 * **Verified red** against `TOOLBAR_CARET_TARGET` with its coarse `min-w` removed: it named all
 * three carets at **31 × 44**, by accessible name rather than item id — the split button's caret is
 * deliberately not a `[data-toolbar-item]`, and is the exact control ADR-0110 D5 records shipping
 * at 23 × 36 past a gate that swept per item.
 *
 * **It also earned its place on its first run**, on something no read of the diff had found: the
 * TSLD search field exists as **two components** — a disabled "coming soon" control and the live
 * one behind the lenses flag — and `tsld-toolbar-items.tsx` carries a comment on each saying they
 * must move together, "fixing one is exactly how a correct pattern gets applied to a control and
 * not its neighbour". The token-axis commit changed one and left the other, so every deck control
 * measured 44 × 44 under coarse and the live field measured **240 × 36**. The sentence warning
 * against it was in the file being edited, three lines from the edit.
 */
const HOUSE_TARGET = 44;

/**
 * The surfaces this projection covers, with the floor each must clear so an empty one cannot pass.
 * `plan header` and `Project Explorer` join the deck at M3 — between them they held 15 of the 16
 * controls still under the house rule after M2, including the six Explorer destinations, which are
 * how a planner LEAVES a plan.
 */
const COARSE_SURFACES = [
  { name: 'command deck', root: '[role="toolbar"][aria-label="Plan commands"]', atLeast: 15 },
  { name: 'plan header', root: 'header', atLeast: 5 },
  // `minWidth` because below `lg` the pinned Explorer is not rendered at all — it becomes the
  // off-canvas Sheet `e2e-narrow-shell` drives. Stated as a width rather than made "optional":
  // an optional surface silently covers nothing the day its selector changes, which is the hole
  // this file's pinned positives exist to close.
  // 6, not 8: the tree became a named exception above, so the swept set is the six organisation
  // destinations plus the rail's two controls. The floor still proves the destinations are there,
  // which is the class M3 fixed and the reason this surface is swept at all.
  { name: 'Project Explorer', root: '[data-panel-border]', atLeast: 6, minWidth: 1024 },
] as const;

/**
 * **Two named exceptions, both excluded by an ANCESTOR SELECTOR rather than by a size threshold**,
 * so each can hide exactly the class it names and never a regression elsewhere.
 *
 * The second is the Project Explorer's virtualized tree — its rows and their row-menu triggers are
 * 28 px on both pointers. That is ADR-0118 D1's `icon-sm` exception plus the row rhythm that
 * constrains it: `HierarchyTree`'s `ROW_HEIGHT` is a **JavaScript constant** feeding both the
 * absolute row style and the virtualizer's `estimateSize`, so growing it under a coarse pointer is
 * a row-rhythm decision with its own design pass rather than a padding change
 * (`docs/TECH_DEBT.md` #215). It is excluded here rather than left unswept, so the class is named
 * in one place with its equivalents: a long-press anywhere on the row opens the same menu on
 * touch, and Menu/Shift+F10 opens it from the keyboard.
 *
 * The first is a breadcrumb crumb. See the projection's docblock — a truncated crumb's
 * width IS the space left over, so no CSS makes it clear a width floor, and a 44 px box was built,
 * measured at **16 × 44**, and withdrawn for making the failing axis worse. Compliant under WCAG
 * 2.2 §2.5.8's Inline exception; `breadcrumbs.tsx` carries the reasoning.
 */
const EXEMPT_WITHIN = ['nav[aria-label="Breadcrumb"]', '[role="tree"]'].join(',');

/**
 * **390 is in the list, and it is the width this epic's own repair was made at** (ADR-0118 M4).
 *
 * M3 fixed two plan-header controls that laid out entirely outside a 390 px viewport, and shipped
 * that fix with its narrowest gate at 834 — while `playwright.narrow-shell.config.ts` and
 * `.github/workflows/ci.yml` both said the coarse axis was "gated by the coarse projection in
 * `e2e-workspace-fit`". Three of the five gate-pass reviews raised it independently: the one
 * viewport where the defect lived had no coarse cover, under a comment saying it had. That is
 * `docs/TECH_DEBT.md` #214's exact shape inside the epic that filed #214.
 *
 * The Explorer is skipped below `lg` by its own `minWidth`, so 390 sweeps the deck and the header
 * — which is where the repair is.
 */
const COARSE_WIDTHS = [
  { width: 1646, height: 1097 },
  { width: 1024, height: 768 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
];

test.describe('The plan command surface, under a coarse pointer', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1646, height: 1097 },
      hasTouch: true,
    });
    const orgSlug = await onboard(page, Date.now() + 7);
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Touch');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('every command clears 44 × 44 and a pointer can reach it, at every width', async () => {
    test.setTimeout(240_000);

    // **First, and before anything is measured.** See the docblock: a context without a coarse
    // pointer makes every assertion below true of the wrong thing.
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(
      pointer,
      'this context did not report a coarse pointer — every assertion below would be about the fine path, and green. `hasTouch` must be passed to the context that builds THIS page, never via test.use().',
    ).toBe('coarse');

    for (const viewport of COARSE_WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);

      for (const surface of COARSE_SURFACES) {
        if ('minWidth' in surface && viewport.width < surface.minWidth) continue;
        const targets = await sweep(page, surface.root, EXEMPT_WITHIN);

        // The pinned positive, per surface — the sweep passes just as happily against a surface
        // rendering nothing at all (the ADR-0093 shape).
        expect(
          targets.length,
          `no controls swept on ${surface.name} at ${viewport.width}`,
        ).toBeGreaterThan(surface.atLeast);

        const belowHouse = targets.filter(
          (t) => t.visible && (t.w < HOUSE_TARGET || t.h < HOUSE_TARGET),
        );
        expect(
          belowHouse,
          `${surface.name}: below the ${HOUSE_TARGET}×${HOUSE_TARGET} house rule under a coarse pointer at ${viewport.width}: ${JSON.stringify(belowHouse)}`,
        ).toEqual([]);

        const invisible = targets.filter((t) => !t.visible);
        expect(
          invisible,
          `${surface.name}: painted at zero size at ${viewport.width}: ${JSON.stringify(invisible)}`,
        ).toEqual([]);

        const unreachable = targets.filter((t) => t.visible && !t.reachable);
        expect(
          unreachable,
          `${surface.name}: a pointer cannot reach these at ${viewport.width}: ${JSON.stringify(unreachable)}`,
        ).toEqual([]);
      }
    }
  });
});
