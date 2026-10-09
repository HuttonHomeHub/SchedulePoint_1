import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Page } from '@playwright/test';

import { showActivities } from '../e2e/workspace';
import { ganttRow } from '../e2e-gantt/support';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  openPlanId,
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
  // The design floor (ADR-0179), with the Explorer at its default width.
  { width: 1024, height: 600 },
];

/**
 * **The Project Explorer is usable at the floor, on either pointer** (ADR-0179; found by M0).
 *
 * The sweeps cannot see this defect, which is why it is asked separately. They skip a control that
 * sits below a scroller's fold, so a column that CAN scroll reads as clean even when its tree has
 * been squeezed to nothing. At 1024 × 600 the shell's fixed blocks (the header, the organisation's
 * destinations, the footer) left the tree 0 px on a coarse pointer and 81 on a fine one. So two
 * things are asked: the tree keeps room for four 28 px rows, and the last destination can be
 * scrolled to and pressed.
 *
 * **Verified red** against the tree before the fix: the tree measured 0 px (coarse) and 81 px
 * (fine) at this cell.
 */
async function assertExplorerUsableAtFloor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.waitForTimeout(500);
  const nav = page.getByRole('navigation', { name: 'Project Explorer' });
  await expect(nav).toBeVisible();
  const treeHeight = await nav.getByRole('tree').evaluate((el) => {
    let scroller: Element | null = el;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
      scroller = scroller.parentElement;
    return (scroller ?? el).getBoundingClientRect().height;
  });
  expect(
    treeHeight,
    'the Explorer tree has room for four rows at the floor',
  ).toBeGreaterThanOrEqual(112);
  const last = page.getByRole('navigation', { name: 'Organisation' }).getByRole('link').last();
  await last.scrollIntoViewIfNeeded();
  const reading = await last.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      hit: hit === el || el.contains(hit),
      inside: r.top >= 0 && r.bottom <= window.innerHeight,
    };
  });
  expect(reading, 'the last destination can be scrolled to and pressed at the floor').toEqual({
    hit: true,
    inside: true,
  });
}

/**
 * **The collapsed spine** (dense-row-touch-targets M3; `m0-measurement.md` §3). Its width is a
 * CSS class that follows what it holds — a destination link, its wrapper's `p-1` and the column's
 * border — and these are the widths that arithmetic gives: 36 + 8 + 1 for a mouse, 44 + 8 + 1 for
 * a finger. The mouse figure is a fix, not a feature: the old 34 px spine held 36 px links in a
 * 44 px wrapper and overflowed by 6 px (`scrollWidth` 39 against `clientWidth` 33, measured with
 * a mouse), so M3 widens it to the width it needs.
 */
const SPINE_FINE_WIDTH = 45;
const SPINE_COARSE_WIDTH = 53;

interface ColumnReading {
  /** The column's slot in the shell grid: panel plus splitter when expanded, the spine when not. */
  column: number;
  stage: number;
  canvas: number;
}

async function readColumn(page: Page): Promise<ColumnReading> {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-panel-border]');
    if (!panel?.parentElement) throw new Error('no Project Explorer column is painted');
    const main = document.querySelector('main');
    const canvas = main?.querySelector('canvas');
    if (!main || !canvas) throw new Error('the stage or its canvas is not painted');
    return {
      column: panel.parentElement.getBoundingClientRect().width,
      stage: main.getBoundingClientRect().width,
      canvas: canvas.getBoundingClientRect().width,
    };
  });
}

/** Fold the Explorer to its spine and read it; leaves the spine showing. */
async function foldToSpine(page: Page): Promise<{
  expanded: ColumnReading;
  collapsed: ColumnReading;
  panel: { width: number; scrollWidth: number; clientWidth: number };
  outside: string[];
}> {
  const show = page.getByRole('button', { name: 'Show Project Explorer' });
  if (await show.isVisible()) await show.click();
  await page.getByRole('button', { name: 'Hide Project Explorer' }).waitFor();
  const expanded = await readColumn(page);
  await page.getByRole('button', { name: 'Hide Project Explorer' }).click();
  await show.waitFor();
  const collapsed = await readColumn(page);
  const reading = await page.evaluate(() => {
    const panel = document.querySelector('[data-panel-border]') as HTMLElement;
    const p = panel.getBoundingClientRect();
    const outside: string[] = [];
    for (const control of panel.querySelectorAll('button, a')) {
      const r = control.getBoundingClientRect();
      // The 1 px border is the panel's own; a control may not reach into it.
      if (r.left < p.left - 0.5 || r.right > p.right - 1 + 0.5)
        outside.push(
          `${control.getAttribute('aria-label') ?? control.tagName}: ${r.left}..${r.right}`,
        );
    }
    return {
      panel: { width: p.width, scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth },
      outside,
    };
  });
  return { expanded, collapsed, ...reading };
}

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
  /**
   * Whether a root whose every control is exempt may legitimately sweep to nothing. Only the Gantt
   * grid under a coarse pointer is in that state, and its positive is then the exempt side's
   * marker counts (`assertGanttExemptionsPresent`) rather than a swept count.
   */
  allowEmpty = false,
  /**
   * Narrows the swept set to controls matching this selector. For a surface whose OTHER controls
   * are outside the question being asked (the activities table's sort headers and name cells are
   * not row-menu triggers), so the set is named rather than filtered by size.
   */
  only?: string,
): Promise<Target[]> {
  return page.evaluate(
    ({
      minTarget,
      root: rootSelector,
      exemptWithin: exempt,
      allowEmpty: mayBeEmpty,
      only: keep,
    }) => {
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
          if (keep && !el.matches(keep)) continue;
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
      if (out.length === 0 && !mayBeEmpty)
        throw new Error(`command-surface: ${rootSelector} reported no controls`);
      void minTarget;
      return out;
    },
    { minTarget: MIN_TARGET, root, exemptWithin, allowEmpty, only },
  );
}

/** The summary row the Gantt sweeps need, and the child that keeps it expanded and visible. */
const WBS_SUMMARY = 'Substructure package';
const WBS_CHILD = 'Pour pile caps';

/**
 * **A WBS summary with one child, through the public API** (ADR-0177 M2-T4).
 *
 * Both seeds were two flat tasks, so the Gantt grid never drew a summary row and the disclosure
 * arrow — a real 24 × 24 `<button>` this gate has to see — was never in the DOM. The same shape
 * as `e2e-gantt/support.ts`'s `seedNestedWbs`, one level deep: that helper also opens the Gantt
 * and builds five levels, which would change the diagram this file's other cases sweep. The
 * panel starts with nothing collapsed, so the child's visibility is asserted where the Gantt is
 * opened, rather than a step taken here.
 */
// **Own lanes, deliberately**: two bars sharing a lane raise the "overlap" banner, which makes the
// foot row 57 px against `FOOT_MAX_PX` and fails an unrelated gate (the first run of this seed did).
async function seedWbsSummary(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id, summary, child }) => {
      const url = `/api/v1/organizations/${org}/plans/${id}/activities`;
      const post = async (body: Record<string, unknown>): Promise<string> => {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`${String(body.name)}: ${response.status}`);
        return ((await response.json()) as { data: { id: string } }).data.id;
      };
      try {
        const parentId = await post({ name: summary, type: 'WBS_SUMMARY', laneIndex: 2 });
        await post({ name: child, type: 'TASK', durationDays: 6, laneIndex: 3, parentId });
        return null;
      } catch (error) {
        return String(error);
      }
    },
    { org: orgSlug, id: planId, summary: WBS_SUMMARY, child: WBS_CHILD },
  );
  if (failure !== null) throw new Error(`seedWbsSummary: ${failure}`);
}

/** Switch to the Gantt and assert the summary is EXPANDED: its child's row is painted. */
async function openGanttExpanded(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
  await expect(
    ganttRow(page, WBS_SUMMARY),
    'the summary row is painted — the arrow cannot be swept without it',
  ).toBeVisible();
  await expect(ganttRow(page, WBS_SUMMARY)).toHaveAttribute('aria-expanded', 'true');
  await expect(
    ganttRow(page, WBS_CHILD),
    'the summary is expanded, so its child is painted',
  ).toBeVisible();
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
    await seedWbsSummary(page, orgSlug);
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
      // Two since M4: the search field is 168 px below 1600, so LOOK is 1254 px in a 1264 px row
      // (`docs/specs/minimum-viewport/m4-measurement.md`). It was 3 with the 240 px field.
      1280: { max: 2 },
      // The floor, measured at M0 (`docs/specs/minimum-viewport/m0-measurement.md` §1): four lines,
      // each declared row wrapping once. M4 measured that this is arithmetic, not a defect: the four
      // groups are 733, 513, 627 and 622 px in a 1008 px row, so no two share a line without a
      // command losing its label (`m4-measurement.md`). The bound stays at the reading.
      1024: { max: 4 },
    };
    // The DO row is one line at every width the epic is judged on. The floor is the exception M4
    // owns (see above), so it is named here rather than passed by loosening the others.
    const DO_ROW_MAX_LINES = (width: number): number => (width <= 1024 ? 2 : 1);
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
      ).toBeLessThanOrEqual(viewport.width >= 1280 ? 1 : 2);
      expect(
        reading.do.lines,
        `the DO row wraps to ${reading.do.lines} lines at ${viewport.width}`,
      ).toBeLessThanOrEqual(DO_ROW_MAX_LINES(viewport.width));

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
    // Select BEFORE expanding. The page is left at the previous case's 1024 x 600, where an expanded
    // panel takes the whole body and hides the diagram (ADR-0180), and a hidden listbox cannot be
    // focused. The selection survives the swap, which is what the sweep below needs.
    await selectOnCanvas();
    await page.getByRole('button', { name: 'Expand activities panel' }).click();

    // **The pinned positive for the STATE**, not just for the sweep's result. This case runs in
    // about the same time as its collapsed sibling, which is exactly what a click that silently did
    // nothing would also look like — and a sweep of an unchanged workspace reads as coverage while
    // testing the state that was already covered. The panel's own table is the discriminator: it is
    // not rendered at all while collapsed.
    await expect(page.getByRole('table', { name: /activit/i }).first()).toBeVisible();

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
    await openGanttExpanded(page);

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

      // **The pinned positive for the summary-row arrow** (ADR-0177 M2-T4). `atLeast` on the grid
      // does not do this job — the six sort headers satisfy it on their own — and a swept target's
      // id is '' for a button with no name, so the arrow is counted by its own marker. It is a real
      // 24 × 24 `<button>` (§2.5.8 allows no exception for it), so each box is asserted, not only
      // counted.
      const arrows = await page.evaluate(() =>
        [...document.querySelectorAll('[role="treegrid"] [data-gantt-disclosure]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );
      expect(
        arrows.length,
        `no disclosure arrow in the Gantt at ${viewport.width}`,
      ).toBeGreaterThan(0);
      expect(
        arrows.filter((a) => a.w < MIN_TARGET || a.h < MIN_TARGET),
        `a disclosure arrow below ${MIN_TARGET}×${MIN_TARGET} at ${viewport.width}`,
      ).toEqual([]);
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

  test('the Project Explorer is usable at the floor', async () => {
    await assertExplorerUsableAtFloor(page);
  });

  /**
   * **The stage keeps 720 px at the floor, and the planner's stored width is untouched** (M4-T1),
   * and **the header is one row there** (M4-T3). Verified red against the tree before M4: a stored
   * 420 left a 603 px stage at 1024, and the header measured 88 px (two rows) instead of 40.
   */
  test('a wide Explorer cannot starve the stage, and the header is one row, at the floor', async () => {
    const KEY = 'schedulepoint-explorer';
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ size: 420 })), KEY);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    const reading = await page.evaluate(() => ({
      stage: document.querySelector('main')!.getBoundingClientRect().width,
      header: document.querySelector('header')!.getBoundingClientRect().height,
    }));
    expect(reading.stage, 'the stage at 1024 with a stored 420 Explorer').toBeGreaterThanOrEqual(
      720,
    );
    expect(reading.header, 'the header wrapped to a second row at 1024').toBeLessThanOrEqual(48);
    expect(
      await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').size, KEY),
      'the clamp must not overwrite what the planner chose',
    ).toBe(420);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.reload();
    await ensurePen(page);
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
interface CoarseSurface {
  name: string;
  root: string;
  atLeast: number;
  /** Every control is exempt, so the positive is the exemption markers, not a swept count. */
  markersOnly?: boolean;
  minWidth?: number;
  /** The plan view this surface is only drawn in. */
  view?: 'gantt';
  /** Narrows the sweep to controls matching this selector (see `sweep`'s `only`). */
  only?: string;
  /**
   * Also asserts every row-menu trigger lies inside its own row's box (`assertRowTriggersContained`).
   * A row that is smaller than the control in it is exactly the overflow `icon-sm` was kept at 28 px
   * to avoid, and the size sweep above cannot see it: it asks whether the control is 44, not
   * whether the row holds it.
   */
  contained?: true;
  /** The surface is the activities panel's table, which is collapsed until it is expanded. */
  activities?: true;
  /**
   * Skipped below this viewport height. At 1024 × 600 the activities panel is 140 px tall and sits
   * at y 497..625 on a 600 px viewport, so no row is painted inside the viewport and the sweep has
   * nothing to measure (`docs/specs/dense-row-touch-targets/m0-measurement.md` §2) — the floor is
   * asked for SIZE ONLY (`assertActivitiesRowMenuSizeOnly`); reachability there is covered by the
   * device sheet.
   */
  minHeight?: number;
  /**
   * A scroller that is swept at its top and again at its bottom. The sweep skips a control below a
   * scroller's fold, so at the floor — where the Explorer column scrolls as a whole — one position
   * sees only part of the column and the positive would count a viewport, not the surface.
   */
  scrollEnds?: string;
}

const COARSE_SURFACES: readonly CoarseSurface[] = [
  { name: 'command deck', root: '[role="toolbar"][aria-label="Plan commands"]', atLeast: 15 },
  { name: 'plan header', root: 'header', atLeast: 5 },
  // `minWidth` because below `lg` the pinned Explorer is not rendered at all — it becomes the
  // off-canvas Sheet `e2e-narrow-shell` drives. Stated as a width rather than made "optional":
  // an optional surface silently covers nothing the day its selector changes, which is the hole
  // this file's pinned positives exist to close.
  // 13, so 14 swept: the six organisation destinations, the rail's two controls, and the tree's
  // three rows with their three `⋯` (dense-row-touch-targets M2 took the tree off the exemption
  // list). The tree has its own entry below as well, so a tree that sweeps to nothing cannot hide
  // behind the destinations; this aggregate is what proves the two surfaces are swept together.
  {
    name: 'Project Explorer',
    root: '[data-panel-border]',
    atLeast: 13,
    minWidth: 1024,
    scrollEnds: 'nav[aria-label="Project Explorer"]',
  },
  // The virtualized tree on its own: the seeded client, project and plan, each a row with a `⋯`, so
  // 6 swept and a floor of 5 — measured at both widths, where the tree's scroller still holds all
  // three rows at 44 px (a row below the fold is skipped by the sweep, so a regression that cost
  // rows would fall under it). `contained`: a 44 px `⋯` in a row that did not grow overflows it.
  {
    name: 'Explorer tree',
    root: '[role="tree"]',
    atLeast: 5,
    minWidth: 1024,
    contained: true,
  },
  // The activities table (#215): swept for its row-menu triggers only. Its other controls (sort
  // headers, name cells) are a different question, and its 24 px row checkboxes are the named
  // `row-select` exemption (`ROW_SELECT_EXEMPT`), asserted present in the test.
  {
    name: 'activities table',
    root: 'table',
    atLeast: 0,
    only: '[aria-haspopup="menu"]',
    activities: true,
    minHeight: 700,
    contained: true,
  },
  // Switched to in the test, not here. `minWidth` is the floor (1024): the pinned grid block is
  // 584 px, so below it the grid overflows its scroller and its controls sit outside the viewport,
  // where a reachability assertion would fail for a layout reason that is out of scope (#438,
  // closed by ADR-0179).
  // Every control in the grid is one of D4's four named kinds, so the swept set is EMPTY by design
  // and the positive is the marker counts (`assertGanttExemptionsPresent`): a grid that rendered
  // nothing has no markers, and a control that lost its marker is swept and fails the house rule.
  {
    name: 'Gantt grid',
    root: '[role="treegrid"]',
    atLeast: 0,
    markersOnly: true,
    minWidth: 1024,
    view: 'gantt',
  },
];

/**
 * **One named exception, excluded by an ANCESTOR SELECTOR rather than by a size threshold**, so it
 * can hide exactly the class it names and never a regression elsewhere.
 *
 * It is a breadcrumb crumb. See the projection's docblock — a truncated crumb's width IS the space
 * left over, so no CSS makes it clear a width floor, and a 44 px box was built, measured at
 * **16 × 44**, and withdrawn for making the failing axis worse. Compliant under WCAG 2.2 §2.5.8's
 * Inline exception; `breadcrumbs.tsx` carries the reasoning.
 *
 * **There used to be a second: the Project Explorer's virtualized tree**, whose rows and `⋯` were
 * 28 px on both pointers because `HierarchyTree`'s row height was a JavaScript constant. It follows
 * the pointer now (`treeRowHeight`, dense-row-touch-targets M2), so the tree is swept like any
 * other surface and a regression to a fixed 28 goes red here.
 */
const EXEMPT_WITHIN = 'nav[aria-label="Breadcrumb"]';

/**
 * **The Gantt grid's four named coarse exceptions** (ADR-0177 D4, swept entries), each excluded by
 * an attribute **inside `[role="treegrid"]`** and never by size. The list below is the whole of D4's
 * swept coarse list; an entry added there without a kind here goes red, and a kind with no element
 * is caught by `GANTT_EXEMPT_KINDS`' presence assertion.
 *
 * - `disclosure` — the summary-row arrow, 24 × 24 in a 28 px row (`docs/TECH_DEBT.md` #215).
 * - `row-menu` — the `⋯`, 28 × 28 (`icon-sm`); a press-and-hold on the row is the large route.
 * - `sort` — the column-header buttons, exactly 24 tall with the spacing test passed.
 * - `cell-input` — an open cell's field, 24 px; the activity editor is the large route.
 */
const GANTT_EXEMPT_KINDS = ['disclosure', 'row-menu', 'sort', 'cell-input'] as const;
/**
 * **The activities table's row checkboxes, a named coarse exception** (`docs/TECH_DEBT.md`, filed
 * with #215). 24 px labels around 16 px boxes: AA under WCAG 2.2 §2.5.8, below the house rule, and
 * outside the row-menu question this surface asks.
 *
 * **This marker excludes nothing from the sweep** — that surface is narrowed by
 * `only: '[aria-haspopup="menu"]'`, which never matches a checkbox. It works as an INVENTORY
 * assertion (`assertRowSelectExemptionsPresent`): every checkbox in the table carries it, there is
 * at least one, and the marked labels really are below 44, so the exception is named, counted and
 * able to go red. It is asserted at the wide viewport only (the floor skips this surface).
 */
const ROW_SELECT_EXEMPT = '[data-coarse-exempt="row-select"]';

const ganttExempt = (kinds: readonly string[] = GANTT_EXEMPT_KINDS): string =>
  kinds.map((kind) => `[role="treegrid"] [data-gantt-coarse-exempt="${kind}"]`).join(',');

/**
 * **The coarse list is the two designed extremes** (ADR-0179): the Surface at 1646 × 1097, and the
 * floor itself at 1024 × 600, where the Explorer is pinned at its default width and a finger has
 * the least room.
 *
 * **390 × 844 left this list because the product stopped being designed for a phone.** It was the
 * width ADR-0118 M4 repaired two plan-header controls at, and it stayed here for as long as the
 * layout owed a phone anything. Below 1024 the signed-in app now shows a "designed for larger
 * screens" page, and the obligation that remains is WCAG 1.4.10 reflow, which the narrow-shell
 * journey holds at 640 × 480 and 320 × 256 with axe's `target-size` on. The reflow check kept here
 * is `UPRIGHT_TABLET`, below: a tablet held upright, after Continue.
 *
 * The Explorer is skipped below `lg` by its own `minWidth`.
 */
const COARSE_WIDTHS = [
  { width: 1646, height: 1097 },
  { width: 1024, height: 600 },
];

/** An 11-inch tablet held upright: below the floor, so axe and overflow are asked, not the sweep. */
const UPRIGHT_TABLET = { width: 834, height: 1112 };

test.describe('The plan command surface, under a coarse pointer', () => {
  let page: Page;
  let context: BrowserContext;
  let orgSlugForSweep: string;

  test.beforeAll(async ({ browser }) => {
    // A context, not `browser.newPage()`: axe refuses a page that has no context of its own.
    context = await browser.newContext({
      viewport: { width: 1646, height: 1097 },
      hasTouch: true,
    });
    // The upright-tablet check below narrows this page to 834: a reader who got there pressed
    // Continue anyway first. (A `beforeAll` context is outside the fixture's reach.)
    await acknowledgeViewportNotice(context);
    page = await context.newPage();
    const orgSlug = await onboard(page, Date.now() + 7);
    orgSlugForSweep = orgSlug;
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Touch');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 12 },
      { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    ]);
    await seedWbsSummary(page, orgSlug);
    await recalculate(page, orgSlug);
    await ensurePen(page);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await context.close();
  });

  async function showView(view: 'gantt' | 'tsld'): Promise<void> {
    const grid = page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
    if (view === 'gantt') {
      if (!(await grid.isVisible())) await openGanttExpanded(page);
      return;
    }
    if (await grid.isVisible()) {
      await page.getByRole('button', { name: 'Diagram', exact: true }).click();
      await expect(grid).toBeHidden();
    }
  }

  /**
   * **Each exemption kind is exercised, so each can fail (ADR-0110 D5).** An exemption nothing
   * carries could never go red: the sweep would be excluding an empty set and reading as cover.
   * The marker counts are also the Gantt surface's pinned positive on the exempt side.
   * `cell-input` exists only while a cell is open, so one Duration cell is opened for the pass and
   * closed again with Escape.
   */
  async function assertGanttExemptionsPresent(width: number): Promise<void> {
    const count = (kind: string): Promise<number> => page.locator(ganttExempt([kind])).count();
    for (const kind of ['disclosure', 'row-menu', 'sort'] as const) {
      expect(
        await count(kind),
        `no '${kind}' exemption element in the Gantt at ${width}`,
      ).toBeGreaterThan(0);
    }
    await ganttRow(page, 'Site setup')
      .getByRole('gridcell')
      .filter({ hasText: /^12 ?d/ })
      .first()
      .dblclick();
    expect(
      await count('cell-input'),
      `no 'cell-input' exemption element in the Gantt at ${width}`,
    ).toBeGreaterThan(0);
    // Swept WITHOUT the `cell-input` exemption, so the open input is visible to the sweep: it must
    // be the one sub-44 target, which proves the kind covers a real under-size control rather than
    // excluding a set the sweep never saw (test-engineer review of M2-T4).
    const targets = await sweep(
      page,
      '[role="treegrid"]',
      ganttExempt(['disclosure', 'row-menu', 'sort']),
      true,
    );
    expect(
      targets
        .filter((t) => t.visible && (t.w < HOUSE_TARGET || t.h < HOUSE_TARGET))
        .map((t) => t.tag),
      `the open cell input is the only sub-44 control while a cell is open at ${width}`,
    ).toEqual(['input']);
    await page.keyboard.press('Escape');
    await expect(page.locator(ganttExempt(['cell-input']))).toHaveCount(0);
  }

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
        if (surface.minWidth !== undefined && viewport.width < surface.minWidth) continue;
        if (surface.minHeight !== undefined && viewport.height < surface.minHeight) {
          if (surface.activities) await assertActivitiesRowMenuSizeOnly(viewport);
          continue;
        }
        // The Gantt grid exists only in its own view; every other surface is swept in the diagram.
        await showView(surface.view === 'gantt' ? 'gantt' : 'tsld');
        if (surface.activities) await showActivities(page);
        const exempt = surface.view === 'gantt' ? ganttExempt() : EXEMPT_WITHIN;
        let targets = await sweep(
          page,
          surface.root,
          surface.activities ? ROW_SELECT_EXEMPT : exempt,
          surface.markersOnly === true,
          surface.only,
        );
        if (surface.scrollEnds !== undefined) {
          const scroller = page.locator(surface.scrollEnds);
          await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
          const atEnd = await sweep(page, surface.root, exempt, false);
          await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
          // The same control is seen at both ends when the column fits; count it once.
          const key = (t: Target): string => `${t.tag}:${t.id}:${t.w}x${t.h}`;
          const seen = new Set(targets.map(key));
          targets = [...targets, ...atEnd.filter((t) => !seen.has(key(t)))];
        }

        // The pinned positive, per surface — the sweep passes just as happily against a surface
        // rendering nothing at all (the ADR-0093 shape).
        if (surface.markersOnly !== true) {
          expect(
            targets.length,
            `no controls swept on ${surface.name} at ${viewport.width}`,
          ).toBeGreaterThan(surface.atLeast);
          // A row of invisible targets would pass every visible-filtered check below vacuously.
          expect(
            targets.some((t) => t.visible),
            `${surface.name}: nothing swept is actually painted at ${viewport.width}`,
          ).toBe(true);
        }

        if (surface.contained)
          await assertRowTriggersContained(surface.name, surface.root, viewport.width);

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

        if (surface.view === 'gantt') await assertGanttExemptionsPresent(viewport.width);
        if (surface.activities) await assertRowSelectExemptionsPresent(viewport.width);
      }
    }
  });

  /**
   * **Every row-menu trigger lies inside its own row** (border box, ±0.5 px). Scoped to
   * `[aria-haspopup="menu"]` inside a `treeitem` or a table row, and the row is the nearest one, so a
   * trigger cannot satisfy it by sitting inside some other, taller row. A positive count is
   * required: a root with no such trigger would pass vacuously (ADR-0110 D5). Only rows that are
   * painted in their scroller are asked — a row below the fold is not on screen to overflow.
   */
  async function assertRowTriggersContained(
    name: string,
    root: string,
    width: number,
  ): Promise<void> {
    const reading = await page.evaluate((rootSelector) => {
      const surface = document.querySelector(rootSelector);
      if (!surface) throw new Error(`command-surface: no surface matched ${rootSelector}`);
      let checked = 0;
      const outside: string[] = [];
      for (const trigger of surface.querySelectorAll('[aria-haspopup="menu"]')) {
        const row = trigger.closest('[role="treeitem"], tr');
        if (!row || trigger.getClientRects().length === 0) continue;
        const t = trigger.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        let clipped = false;
        for (let a = row.parentElement; a && !clipped; a = a.parentElement) {
          if (!/auto|scroll/.test(getComputedStyle(a).overflowY)) continue;
          const ar = a.getBoundingClientRect();
          clipped = r.top + r.height / 2 < ar.top || r.top + r.height / 2 > ar.bottom;
        }
        if (clipped) continue;
        checked += 1;
        const e = 0.5;
        if (
          t.top < r.top - e ||
          t.bottom > r.bottom + e ||
          t.left < r.left - e ||
          t.right > r.right + e
        )
          outside.push(
            `${trigger.getAttribute('aria-label') ?? '(unnamed)'}: trigger ${Math.round(t.width)}×${Math.round(t.height)} in row ${Math.round(r.width)}×${Math.round(r.height)}`,
          );
      }
      return { checked, outside };
    }, root);
    expect(reading.checked, `${name}: no row-menu trigger was checked at ${width}`).toBeGreaterThan(
      0,
    );
    expect(reading.outside, `${name}: a row-menu trigger overflows its row at ${width}`).toEqual(
      [],
    );
  }

  /**
   * **The floor's share of the activities table, SIZE ONLY.** At 1024 × 600 the panel sits at
   * y 497..625 on a 600 px viewport, so no row is hit-testable and the reachability half of the
   * sweep cannot run (`m0-measurement.md` §2). The `⋯` is still laid out, so its box is read and
   * held to 44; that the row grows to fit (57 → 61) is the layout's doing and is not asserted.
   */
  async function assertActivitiesRowMenuSizeOnly(viewport: {
    width: number;
    height: number;
  }): Promise<void> {
    await showView('tsld');
    await showActivities(page);
    const sizes = await page.locator('table [aria-haspopup="menu"]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    expect(
      sizes.length,
      `no activities row menu is laid out at ${viewport.width} × ${viewport.height}`,
    ).toBeGreaterThan(0);
    expect(
      sizes.filter((t) => t.w < HOUSE_TARGET || t.h < HOUSE_TARGET),
      `activities table: row menu below ${HOUSE_TARGET} at ${viewport.width} × ${viewport.height} (size only)`,
    ).toEqual([]);
    // At the floor an expanded panel hides the Gantt ("Gantt hidden. Collapse to return."), and the
    // next surface in the loop needs it.
    await page.getByRole('button', { name: 'Collapse activities panel' }).click();
    await expect(page.getByRole('button', { name: 'Expand activities panel' })).toBeVisible();
  }

  /**
   * **The `row-select` exemption is exercised, so it can fail (ADR-0110 D5).** Every checkbox in the
   * activities table sits inside a marked label, and there is at least one: an unmarked checkbox is
   * a new under-size target nobody named, and an empty set would make the exemption read as cover.
   * The marked labels are also asserted to be the sub-44 controls they claim to excuse.
   */
  async function assertRowSelectExemptionsPresent(width: number): Promise<void> {
    const table = page.locator('table');
    const checkboxes = await table.locator('input[type="checkbox"]').count();
    const marked = await table.locator(`${ROW_SELECT_EXEMPT} input[type="checkbox"]`).count();
    expect(checkboxes, `no row checkboxes in the activities table at ${width}`).toBeGreaterThan(0);
    expect(marked, `a row checkbox lost its 'row-select' marker at ${width}`).toBe(checkboxes);
    const boxes = await table.locator(ROW_SELECT_EXEMPT).evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height);
      }),
    );
    expect(
      boxes.every((side) => side < HOUSE_TARGET),
      `the 'row-select' exemption covers a control that already clears ${HOUSE_TARGET} at ${width}: delete the exemption`,
    ).toBe(true);
  }

  /**
   * **The list pages' `⋯`** (`RowActionsMenu`, six tables; Clients is the one swept). The loop above
   * runs on the plan page only, so this leaves it, sweeps the Clients table at both coarse widths
   * and returns to the plan URL it saved — a later test in this serial group needs the plan.
   */
  test('the Clients list row menu clears 44 × 44 under a coarse pointer', async () => {
    test.setTimeout(120_000);
    const planUrl = page.url();
    for (const viewport of COARSE_WIDTHS) {
      await page.setViewportSize(viewport);
      await page.goto(`/orgs/${orgSlugForSweep}/clients`);
      await expect(page.locator('main table')).toBeVisible();
      const targets = await sweep(page, 'main table', undefined, false, '[aria-haspopup="menu"]');
      expect(
        targets.length,
        `no row menu swept in the Clients list at ${viewport.width}`,
      ).toBeGreaterThan(0);
      expect(
        targets.some((t) => t.visible),
        `no Clients row menu is painted at ${viewport.width}: the checks below would pass vacuously`,
      ).toBe(true);
      const belowHouse = targets.filter(
        (t) => t.visible && (t.w < HOUSE_TARGET || t.h < HOUSE_TARGET),
      );
      expect(
        belowHouse,
        `Clients list: below the ${HOUSE_TARGET}×${HOUSE_TARGET} house rule under a coarse pointer at ${viewport.width}: ${JSON.stringify(belowHouse)}`,
      ).toEqual([]);
      const unreachable = targets.filter((t) => t.visible && !t.reachable);
      expect(
        unreachable,
        `Clients list: a pointer cannot reach these at ${viewport.width}: ${JSON.stringify(unreachable)}`,
      ).toEqual([]);
    }
    await page.goto(planUrl);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    // A fresh navigation re-acquires the plan lock from scratch; do not leave a later test in the
    // serial group depending on the pen `beforeAll` took.
    await ensurePen(page);
  });

  /**
   * **An upright 11-inch tablet is below the floor, so it is asked the reflow question and no
   * more** (ADR-0179): the document does not scroll sideways, and axe is clean with `target-size`
   * on — which it ships disabled and tags `wcag22aa`, so it is opted in by rule and by tag. The
   * 44 px house rule and pointer-reachability are designed-range obligations and are not asserted.
   */
  test('an upright tablet reflows: no sideways document scroll, axe clean', async () => {
    await page.setViewportSize(UPRIGHT_TABLET);
    await showView('tsld');
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `the document overflows ${String(UPRIGHT_TABLET.width)} px`,
    ).toBeLessThanOrEqual(0);
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

  test('the Project Explorer is usable at the floor', async () => {
    await assertExplorerUsableAtFloor(page);
  });

  /**
   * **A long name still truncates beside the always-visible 44 px `⋯`, at the Explorer's 200 px
   * minimum** (dense-row-touch-targets M2; `m0-measurement.md` §4 measured the name box at 85 px
   * there). On a coarse pointer the `⋯` is never hidden and takes 16 px more than it did, so the
   * name has less room: this holds that it gives way (an ellipsis) rather than running under the
   * button, and that the button stays inside its row. The plan row is the deepest, so it has the
   * least room of the three.
   */
  test('a long name truncates beside the 44 px ⋯ at the minimum Explorer width', async () => {
    const KEY = 'schedulepoint-explorer';
    await page.setViewportSize({ width: 1646, height: 1097 });
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ size: 200 })), KEY);
    await page.reload();
    await ensurePen(page);
    const row = page.getByRole('tree').getByRole('treeitem', { name: /Riverside Quarter/ });
    await expect(row).toBeVisible();
    const reading = await row.evaluate((el) => {
      // The name's clipping box is the parent of the innermost text span; found by its text so a class rename
      // cannot turn this into a selector failure that reads as the defect.
      const text = [...el.querySelectorAll('span')].find(
        (span) => span.childElementCount === 0 && span.textContent?.startsWith('Riverside Quarter'),
      );
      const name = text?.parentElement;
      const more = el.querySelector('[aria-haspopup="menu"]');
      if (!name || !more) throw new Error('the plan row has no name span or no ⋯ button');
      const n = name.getBoundingClientRect();
      const m = more.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        truncated: name.scrollWidth > name.clientWidth,
        // Clipped on ONE line, not wrapped: a name that wraps would also overflow a narrow box.
        singleLine: n.height < 24,
        nameClearsButton: n.right <= m.left + 0.5,
        buttonInRow: m.left >= r.left - 0.5 && m.right <= r.right + 0.5,
        panelWidth: Math.round(r.width),
        button: `${Math.round(m.width)}×${Math.round(m.height)}`,
      };
    });
    expect(reading, 'the plan row at a 200 px Explorer').toMatchObject({
      truncated: true,
      singleLine: true,
      nameClearsButton: true,
      buttonInRow: true,
      button: '44×44',
    });
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.reload();
    await ensurePen(page);
  });
  /**
   * **The collapsed spine holds its controls at 44 and holds the stage to the spine's growth**
   * (dense-row-touch-targets M3). Folding the Explorer gains the stage the column's width less the
   * spine's, so the 19 px a coarse spine costs over the old 34 is the stage's whole loss: the
   * expanded and collapsed readings are taken in the same state and must differ by exactly
   * `expanded column − spine`. The overflow check is the same one the fine path is held to.
   */
  test('the collapsed spine clears 44 × 44 inside its own box and costs the stage only its width', async () => {
    test.setTimeout(120_000);
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(pointer, 'this context did not report a coarse pointer').toBe('coarse');
    await showView('tsld');
    for (const viewport of COARSE_WIDTHS) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const { expanded, collapsed, panel, outside } = await foldToSpine(page);
      const at = `at ${viewport.width}`;
      expect(collapsed.column, `the coarse spine's column ${at}`).toBe(SPINE_COARSE_WIDTH);
      expect(panel.scrollWidth, `the spine overflows its box ${at}`).toBeLessThanOrEqual(
        panel.clientWidth,
      );
      expect(outside, `a spine control lies outside the spine ${at}`).toEqual([]);
      expect(collapsed.stage - expanded.stage, `the stage's gain from folding ${at}`).toBe(
        expanded.column - collapsed.column,
      );
      expect(collapsed.canvas - expanded.canvas, `the canvas's gain from folding ${at}`).toBe(
        expanded.column - collapsed.column,
      );
      const targets = await sweep(page, '[data-panel-border]');
      expect(
        targets.length,
        `the spine sweeps its button and six links ${at}`,
      ).toBeGreaterThanOrEqual(7);
      const belowHouse = targets.filter(
        (t) => t.visible && (t.w < HOUSE_TARGET || t.h < HOUSE_TARGET),
      );
      expect(
        belowHouse,
        `the spine: below the house rule ${at}: ${JSON.stringify(belowHouse)}`,
      ).toEqual([]);
      const unreachable = targets.filter((t) => !t.visible || !t.reachable);
      expect(unreachable, `the spine: not reachable ${at}: ${JSON.stringify(unreachable)}`).toEqual(
        [],
      );
      await page.getByRole('button', { name: 'Show Project Explorer' }).click();
      await expect(page.getByRole('button', { name: 'Hide Project Explorer' })).toBeVisible();
    }
  });
});

test.describe('The collapsed spine, under a mouse', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1912, height: 948 } });
    await acknowledgeViewportNotice(context);
    page = await context.newPage();
    await onboard(page, Date.now() + 11);
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Mouse');
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
  });

  test.afterAll(async () => {
    await context.close();
  });

  /**
   * **A mouse's spine holds its links, and the stage changes only by that fix**
   * (dense-row-touch-targets M3, `m0-measurement.md` P4). The 34 px spine overflowed (`scrollWidth`
   * 39 against `clientWidth` 33); it is 45 now, the width its 36 px links need. That is the epic's
   * one mouse-visible change and a defect fix, so the stage's gain from folding is still exactly
   * the column less the spine, and the controls keep their fine size (36), which proves the touch
   * rule did not leak onto a mouse.
   */
  test('the collapsed spine holds its links and costs the stage only its width', async () => {
    test.setTimeout(120_000);
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(pointer, 'this context reported a coarse pointer').toBe('fine');
    for (const viewport of [
      { width: 1912, height: 948 },
      { width: 1024, height: 600 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const { expanded, collapsed, panel, outside } = await foldToSpine(page);
      const at = `at ${viewport.width}`;
      expect(collapsed.column, `the fine spine's column ${at}`).toBe(SPINE_FINE_WIDTH);
      expect(panel.scrollWidth, `the spine overflows its box ${at}`).toBeLessThanOrEqual(
        panel.clientWidth,
      );
      expect(outside, `a spine control lies outside the spine ${at}`).toEqual([]);
      expect(collapsed.stage - expanded.stage, `the stage's gain from folding ${at}`).toBe(
        expanded.column - collapsed.column,
      );
      expect(collapsed.canvas - expanded.canvas, `the canvas's gain from folding ${at}`).toBe(
        expanded.column - collapsed.column,
      );
      const links = await page
        .locator('[data-panel-border] nav[aria-label="Organisation"] a')
        .evaluateAll((els) =>
          els.map(
            (el) =>
              `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
          ),
        );
      expect(links, `a mouse's spine links keep their 36 px size ${at}`).toEqual(
        Array(6).fill('36x36'),
      );
      await page.getByRole('button', { name: 'Show Project Explorer' }).click();
      await expect(page.getByRole('button', { name: 'Hide Project Explorer' })).toBeVisible();
    }
  });
});
