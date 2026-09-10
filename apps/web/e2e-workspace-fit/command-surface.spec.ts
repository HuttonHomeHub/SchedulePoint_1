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

  /**
   * **F1 and F6 of the console epic** (`docs/specs/workspace-console/implementation-plan.md`,
   * M1-T4): the band's height and the deck's line count, at the widths the epic is judged on.
   *
   * **Verified red first, both halves separately.** Against the tree before M1 the band is
   * 180 px, so the height half fails on its own (`m0-measurement.md` §1). The line half passes
   * against today's deck — two lines at 1920 and 1646 — so it was made to fail by injecting a
   * 900 px item into the deck, which pushed the count to three; a line assertion that has never
   * been seen red is a claim about the wrong element waiting to happen (ADR-0110 D5).
   *
   * **The line count is the number of distinct rows the CONTROLS sit on, never a constant and
   * never "height ÷ tallest child".** The latter is the shape `pen-status.spec.ts` uses for the
   * header, and it was the first draft here — and its red run PASSED against a 1500 px item
   * injected into the deck, because a group that wraps INTERNALLY becomes the tallest child and
   * divides itself away. Under the declared rows that is precisely the failure F6 exists to catch
   * (`m0-measurement.md` §2: the LOOK row wraps inside itself at 1440). Clustering every control's
   * `top` cannot be fooled that way and still survives a control-height change (ADR-0118). **The height half asserts a bar (≤ 145), not a value**: a gate pinned to
   * 141 goes red on a deliberate change and says nothing about the defect.
   *
   * **1440 reads "at most three", not "exactly two"**, on M0's measurement rather than the study's
   * figure: the LOOK set was 1452 px against a 1424 px container, so a third line at 1440 was
   * the row wrapping honestly. After M1 deleted the cards it is 1416 — two lines with **8 px** to
   * spare — and M4 owns whether C's wider column gap can afford that. The pinned positive is the
   * control count — a deck rendering nothing is one line tall and 0 px is under any bar.
   */
  test('the band stays inside its height bar and the deck its line count, at every width', async () => {
    test.setTimeout(240_000);
    const BAND_MAX_PX = 145;
    // M6 measured 51 px at 1280/1440/1646/1920. The bar is that reading, not a round number above
    // it: a bound with slack in it cannot report the four pixels the inset is worth.
    const FOOT_MAX_PX = 51;
    const LINES: Record<number, { max: number }> = {
      1920: { max: 2 },
      1646: { max: 2 },
      1440: { max: 3 },
      1280: { max: 3 },
    };
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(400);

      const reading = await page.evaluate(() => {
        const band = document.querySelector('[data-surface="chrome"]:not([data-activities-bar])');
        const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
        if (!band || !deck)
          throw new Error('the band or the deck was not found — nothing to assert about');
        // Cluster within 4 px: controls on one row share a top to sub-pixel precision, and a real
        // second line sits a whole control height below.
        const linesIn = (root: Element) => {
          const tops = [...root.querySelectorAll('[data-toolbar-item]')]
            .map((el) => el.getBoundingClientRect().top)
            .sort((a, b) => a - b);
          let lines = 0;
          let last = Number.NEGATIVE_INFINITY;
          for (const t of tops) {
            if (t - last > 4) lines += 1;
            last = t;
          }
          return { lines, controls: tops.length };
        };
        const rowEl = (row: string) => {
          const el = deck.querySelector(`[data-deck-row="${row}"]`);
          if (!el) throw new Error(`the deck has no declared "${row}" row`);
          return el;
        };
        const look = rowEl('look');
        const doRow = rowEl('do');
        const foot = document.querySelector('[data-activities-bar]');
        if (!foot) throw new Error('the activities row was not found — nothing to assert about');
        return {
          foot: foot.getBoundingClientRect().height,
          band: band.getBoundingClientRect().height,
          ...linesIn(deck),
          look: linesIn(look),
          do: linesIn(doRow),
          // Membership: which commands sit in which declared row. A line-count assertion alone
          // passes against a build where a command has MOVED rows, which is the whole defect the
          // declaration exists to prevent.
          lookIds: [...look.querySelectorAll('[data-toolbar-item]')].map((el) =>
            el.getAttribute('data-toolbar-item'),
          ),
          doIds: [...doRow.querySelectorAll('[data-toolbar-item]')].map((el) =>
            el.getAttribute('data-toolbar-item'),
          ),
        };
      });

      // The pinned positive: an empty deck is one line tall and 0 px, and passes everything below.
      expect(reading.controls, `no controls in the deck at ${viewport.width}`).toBeGreaterThan(15);

      expect(
        reading.lines,
        `the deck's controls sit on ${reading.lines} rows at ${viewport.width}`,
      ).toBeLessThanOrEqual(LINES[viewport.width]!.max);

      // **Per row, since M4 declared them.** Each row is one line at every width the epic is judged
      // on; below that the LOOK row is allowed a second line and the DO row is not, because a wrap
      // inside a row is local — it can never move a command to the other row.
      expect(
        reading.look.lines,
        `the LOOK row wraps to ${reading.look.lines} lines at ${viewport.width}`,
      ).toBeLessThanOrEqual(viewport.width >= 1440 ? 1 : 2);
      expect(
        reading.do.lines,
        `the DO row wraps to ${reading.do.lines} lines at ${viewport.width}`,
      ).toBe(1);

      // **Membership, and it is the assertion that carries M4's argument.** Line counts alone pass
      // against a build where a command has moved rows — which is exactly what flex wrapping did
      // before the rows were declared, and what a planner experiences as every command in the band
      // changing place. Pinned by group rather than by a list of ids, so adding a command to an
      // existing group needs no edit here.
      expect(reading.lookIds, `the LOOK row is empty at ${viewport.width}`).not.toHaveLength(0);
      expect(reading.doIds, `the DO row is empty at ${viewport.width}`).not.toHaveLength(0);
      expect(
        reading.lookIds.filter((id) => reading.doIds.includes(id)),
        'a command appears in both declared rows',
      ).toHaveLength(0);
      expect(
        reading.lookIds.includes('add-activity') || reading.doIds.includes('add-activity'),
      ).toBe(true);
      expect(reading.doIds, 'the authoring tools left the DO row').toContain('add-activity');
      expect(reading.lookIds, 'the search field left the LOOK row').toContain('search');
      // **1920 and 1646 only, by design.** F1 names those two widths; at 1440 the header itself
      // wraps to two lines today (ADR-0112 D4's accepted state) because the pen cluster sits on
      // it, and `m0-measurement.md` §1 shows that row un-wrapping to one line at 1440 the moment
      // the pen leaves — which is M5's win. Asserting the bar at 1440 here would make M1 red for
      // M5's reason. The first version of this case did exactly that.
      if (viewport.width >= 1646) {
        expect(
          reading.band,
          `the command band is ${reading.band} px at ${viewport.width} against a bar of ${BAND_MAX_PX}`,
        ).toBeLessThanOrEqual(BAND_MAX_PX);
      }

      // **F7, the foot row, which had no gate until M7.** It was measured once by hand at M6 (51 px
      // at all four widths) and nothing pinned it — while its inset is a **literal copy** of the
      // deck's, kept in step by a rule written in a docblock rather than by anything that fails.
      // A component review named the drift: change one `py-1` and the other silently stays.
      //
      // Asserted at every width, unlike the band above: the foot row carries no plan name and no
      // pen sentence, so it has no state that legitimately wraps at 1440 and nothing to exempt.
      expect(
        reading.foot,
        `the activities row is ${reading.foot} px at ${viewport.width} against a bar of ${FOOT_MAX_PX}`,
      ).toBeLessThanOrEqual(FOOT_MAX_PX);
    }
  });

  /**
   * **Four states, four pictures** (console epic M3-T5). Arms a modal tool, opens a disclosure, and
   * asserts the three treatments are pairwise distinct **as painted**.
   *
   * A unit test cannot ask this and it is worth saying why rather than leaving the duplication to
   * look like an oversight: jsdom compiles no Tailwind, so `getComputedStyle` there reads an empty
   * string and an assertion about a state's appearance passes against every value including the one
   * the defect had. The unit tier can pin which CLASS a control takes; only a browser can say the
   * classes resolve to different paint.
   *
   * **The defect this replaces**: `toolbarControlVariants` had a boolean `active` painting one wash
   * — `bg-accent`, 1.34:1 against the band — for hover, for open and for armed alike, so an armed
   * Add tool looked like a hovered button. WCAG 2.2 §1.4.11, and the confusion ADR-0064 was opened
   * on. Verified red by forcing every state back to one background, which is exactly what the
   * boolean did.
   *
   * It reads `color` and `box-shadow` as well as `background-color`, because armed deliberately
   * keeps the band's fill: its channels are amber ink and a 2 px amber underline, both 7.91:1 on
   * the band. An assertion that compared only backgrounds would call armed and rest identical and
   * be right about the wrong property.
   */
  test('an armed tool, an open disclosure and a resting command paint differently', async () => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    await page.waitForTimeout(300);

    const deck = page.getByRole('toolbar', { name: 'Plan commands' });
    const paintOf = (itemId: string) =>
      page.evaluate((id) => {
        const el = document.querySelector(
          `[role="toolbar"][aria-label="Plan commands"] [data-toolbar-item="${id}"]`,
        );
        if (!el) throw new Error(`no control with data-toolbar-item="${id}"`);
        const cs = getComputedStyle(el);
        return `${cs.backgroundColor} | ${cs.color} | ${cs.boxShadow}`;
      }, itemId);

    // **Derived, not named.** The first version of this read `recalculate`, which is not in the
    // deck at all — ADR-0109 D3 moved it to the status bar, beside the condition it answers. A
    // hard-coded resting id is a gate that goes stale the moment the registry moves, so the
    // control is chosen as the first one that is neither of the two this case manipulates.
    const restId = await page.evaluate(() => {
      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      const ids = [...(deck?.querySelectorAll('[data-toolbar-item]') ?? [])]
        .map((el) => el.getAttribute('data-toolbar-item'))
        .filter((id): id is string => id !== null && id !== 'add-activity' && id !== 'view');
      if (ids.length === 0) throw new Error('the deck rendered no other commands to compare with');
      return ids[0]!;
    });
    const rest = await paintOf(restId);

    // Arm Add. Its primary is the split button's left half; clicking it arms the tool.
    await deck.locator('[data-toolbar-item="add-activity"]').click();
    await page.waitForTimeout(300);
    const armed = await paintOf('add-activity');

    // Escape returns to `select` (ADR-0064's arm/disarm contract), so the tool is disarmed before
    // the disclosure is opened and the two states cannot be read from one another's frame.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const disarmed = await paintOf('add-activity');

    await deck.getByRole('button', { name: /^View/ }).click();
    await page.waitForTimeout(300);
    const open = await paintOf('view');
    await page.keyboard.press('Escape');

    // The pinned positive: if arming did nothing, `armed` would equal `disarmed` and every
    // "differs from" assertion below would still hold against a deck where no state paints at all.
    expect(armed, 'arming the Add tool changed nothing it paints').not.toBe(disarmed);

    expect(armed, `armed ${armed} vs rest ${rest}`).not.toBe(rest);
    expect(open, `open ${open} vs rest ${rest}`).not.toBe(rest);
    expect(open, `open ${open} vs armed ${armed}`).not.toBe(armed);
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
    // Names read from `activity-bottom-panel.tsx:163,325` rather than guessed — this repository
    // records three journeys broken by a locator matching copy nobody checked. (The names were
    // read; the LINE NUMBERS were not — they said `:155,317` until 2026-09-09, which are two
    // `hostsPlanSlots` props. A citation that is wrong about where it read something is a weaker
    // claim than it reads as, in the comment whose whole subject is not guessing.)
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

  /**
   * **The object bar in the Gantt, which is a THIRD state and not a second view of the same one**
   * (`docs/TECH_DEBT.md` #202c).
   *
   * The two `sweepObjectBar` cases above both run on the TSLD, and the Gantt case above them
   * sweeps the deck and the grid — so the bar was swept in one view and the view was swept without
   * the bar. It is the same `SelectionActionsBar` (`plan-workspace-toolbar.tsx:1331`), which is
   * exactly why nobody noticed: the component is shared, the CONTEXT is not. `ganttSelectionCtx`
   * makes `Zoom to selection` and `Isolate logic path` absent rather than shaded (ADR-0095), so
   * the bar renders a different item set here and a different set can wrap differently.
   *
   * Selection is a real row click, not a listbox focus: the Gantt has no parallel listbox — that
   * is ADR-0026 D7's canvas machinery, and the grid is DOM rows with their own roving tab stop.
   */
  test('every object action in the Gantt view a pointer can see, it can also reach', async () => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1646, height: 1097 });
    // Switched explicitly rather than inherited from the case above. `mode: 'serial'` shares the
    // page, so this would pass today on its predecessor's leftover state — and silently stop
    // testing the Gantt the day that case is reordered, renamed or skipped.
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    const grid = page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
    await expect(grid).toBeVisible();

    // The row helper's shape, read from `e2e-gantt/support.ts:234-239` rather than re-invented:
    // a `row` filtered by a `gridcell` whose name starts with the activity's.
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('gridcell', { name: /^Site setup\b/ }) })
      .first()
      .click();

    // The pinned positive for the STATE. Without it a click that selected nothing leaves
    // `sweepObjectBar` to fail on an absent surface, which reads as a defect in the bar rather
    // than in this setup — and the sweep's own `no controls swept` message would name the wrong
    // subject.
    await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();

    await sweepObjectBar('Gantt, panel collapsed');
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
