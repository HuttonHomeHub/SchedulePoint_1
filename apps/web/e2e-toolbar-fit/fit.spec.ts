import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * **The toolbar fit gate** (ADR-0090 M1). One invariant, seven assertions, eight widths, both rows.
 *
 * **This defect was invisible to every unit suite in the repository and always would be**: jsdom has
 * no layout, so `getBoundingClientRect()` returns zeros and ~25 suites rendering `<Toolbar>` stayed
 * green throughout. The only instrument that can see it is a real browser.
 *
 * The six assertions, and why each is here rather than an obvious simpler one:
 *
 * **Every per-control assertion is taken _after scrolling that control into view_**, which is the
 * whole design of this gate and took three attempts to get right. The row is `overflow-x-auto`
 * below its pinned floor (M1-T5), so a box outside the right edge is not evidence of anything; the
 * question a planner actually has is *can I get a pointer onto this command*. Scrolling first asks
 * exactly that, and costs nothing at the widths where the row already fits, where it is a no-op.
 *
 * - **S1 — no control has zero visible width even after being scrolled to.** The direct statement
 *   of what shipped: `legend` and `shortcuts` painted outside an `overflow-hidden` box at 1920.
 * - **S2 — the `⋯` is a real target.** It was 1 px visible at 1440 and 0 px at 960 while holding
 *   the only route to ~15 commands.
 * - **S3 — the reachable set is unchanged from the widest viewport.** Compared against *what this
 *   build shows when it has room*, never a list typed into this file, so it cannot rot.
 * - **S4 — the row fits as laid out** (`scrollWidth ≤ clientWidth`), asserted above the pinned
 *   floor only. Below it the row is honestly too narrow for its pinned controls and scrolls; S1/S5
 *   carry the guarantee there.
 * - **S5 — every control is a ≥ 24 px target and actually clickable.** `elementFromPoint` at its
 *   own visible centre. **A position check cannot replace this**: a control shrunk to zero width has
 *   zero overhang and is still in the DOM, so it passes any geometric test while being exactly as
 *   unreachable as the original bug. Two reviewers found that hole independently — and then a case
 *   arrived from a direction none of us predicted, a neighbouring group's chevron covering the `⋯`,
 *   which Playwright called "visible, enabled and stable" and could not click.
 * - **S6 — the layout is stable.** Settle, snapshot, settle, snapshot. S1–S5 are single snapshots
 *   and would pass on a settled-but-wrong state, missing a slow oscillation entirely.
 * - **S7 — every _clickable control_ is a 24 × 24 target, not just every toolbar _item_.** S1–S5
 *   iterate `[data-toolbar-item]`, which sits on an item's **focusable control** — so a split
 *   button's caret, which is deliberately held out of the roving sequence (`tabIndex={-1}`,
 *   `ToolbarSplitButton.tsx:97`), carries no such attribute and was **invisible to this gate**.
 *   WCAG 2.2 §2.5.8 is about pointer targets and does not care whether a control is a tab stop.
 *   Added for ADR-0090 M3, whose plan makes capturing that control's real rendered box a blocking
 *   prerequisite: *"If it is failing today, that is a pre-existing, independent 2.5.8 defect."*
 *   **It was.** The first red run measured **23 × 36** on both shared carets, settling a dispute the
 *   plan could only frame as "arithmetic against arithmetic"; a third, bespoke caret in the
 *   selection bar measured 22 and is out of this gate's reach by decision (#124). Why none of
 *   §2.5.8's exceptions rescue them is recorded at `TOOLBAR_CARET_TARGET` beside the fix.
 *
 * **The selection bar is deliberately NOT covered here, and that is a decision rather than an
 * oversight.** It mounts a third `<Toolbar>` on the identical `measure()`/`computeOverflow` path, so
 * M1's repair reaches it by construction — there is one primitive, and it instantiates it. But its
 * failure mode is a different one: the floating bar shrink-wraps to its content and is clamped to
 * the *viewport*, not to a container it can overflow, so nothing this gate asserts would be
 * meaningful about it. A first draft of this file included a test for it; the locator matched
 * nothing and the test skipped silently, reporting success for never having run — which is worse
 * than no coverage, because it looks like coverage. Recorded as `docs/TECH_DEBT.md` #124 instead.
 */

// **`Plan mode` is no longer a row.** Graphite M5 moved the mode cluster to the tool rail, where it
// is a VERTICAL toolbar: its items stack, so there is no row to overflow, its `clientWidth` is not
// an input to any fit decision, and every assertion in this file is about a row that can run out of
// width. Sweeping it here asked a rail whether it fitted horizontally and hung — three minutes,
// then a timeout, which is what an assertion aimed at the wrong axis looks like.
//
// It is not left uncovered: `tool-rail.test.tsx` pins where the cluster lives, and `Toolbar`'s own
// suite pins that a vertical toolbar announces `aria-orientation="vertical"`, opts out of the
// ladder and never labels its items.
const ROWS = ['View and navigate', 'Build and manage'] as const;
// 1646 is the product owner's Surface Pro (2880 x 1920 at 175%). Added with the band fix, because
// that defect was only ever visible at a width this gate had never been run at.
const WIDTHS = [2133, 1920, 1646, 1600, 1440, 1280, 1024, 960, 768];

/**
 * At or above this the row must fit outright; below it the row scrolls by design (M1-T5), where
 * S1/S5 carry the guarantee instead.
 *
 * **Now every width in the list — the floor has been retired rather than lowered**, which is
 * ADR-0090 M3's stated outcome ("`scrollWidth ≤ clientWidth + 1` extends to 960 and 768").
 *
 * Its history is the milestone's argument in one constant. It was drafted at 1280 and **measured**
 * up to 1440, because Row 1's pinned `render` items alone were ~1177 px against a 1192 px container
 * and nothing but removing them could close it. M2 removed them (1198 → 784 px), M3-T2 folded the
 * four viewport commands behind `Zoom ▾`, and M3-T3 gave the collapsed band icon-only triggers and
 * a 144 px search field. Re-measured at every width in `WIDTHS`, both rows now lay out inside their
 * container — 680 px at 768 included, where Row 1 was 203 px over before this milestone
 * (`docs/specs/workspace-layout/m3-narrow-widths.md`).
 *
 * Keeping the constant at 768 rather than deleting the branch is deliberate: it says *this is a
 * measured claim about the narrowest supported width*, and it is the line to move if a future
 * viewport is added below it rather than a branch to reconstruct.
 */
const PINNED_FLOOR_WIDTH = 768;

/**
 * How far the trailing group may sit from the row's end (S10). Generous on purpose: the real value
 * is the `⋯` wrapper's ~9 px of chrome, and the defect this guards against was **191 px**, so
 * anything in between is noise rather than a judgement call.
 */
const TRAILING_GAP_TOLERANCE_PX = 24;

/** WCAG 2.2 §2.5.8 Target Size (Minimum). A pointer target is sized by the part that is there. */
const MIN_TARGET_PX = 24;

/**
 * The **inline text controls** inside `search`, which 2.5.8 exempts under **Inline**: "the target is
 * in a sentence, or its size is otherwise constrained by the line-height of non-target text". A
 * search field's own box is the target; the leading icon and the trailing clear button are sized by
 * the field's text line and cannot be grown without growing the field.
 *
 * Listed by owning item rather than by selector so the exemption is **narrow and reviewable**: a
 * blanket "skip small things" would have re-opened exactly the hole S7 exists to close.
 */
const INLINE_EXEMPT_ITEMS = new Set(['search']);

interface Target {
  key: string;
  width: number;
  height: number;
}

interface RowState {
  containerWidth: number;
  scrollWidth: number;
  inline: string[];
  /**
   * The inline ids that are **read-outs, not commands** — nothing inside them is focusable.
   *
   * S3's claim is "no command has been lost", and a read-out that withdraws when the row stops
   * being roomy has not been lost, it has been *withheld* — a designed omission whose value is one
   * press away in `Summary ▾`. Without this distinction the finish chip's correct disappearance at
   * 960 reads as a command with no route.
   */
  presentational: string[];
  overflowPresent: boolean;
  overflowVisibleWidth: number;
  pastRightEdge: string[];
  belowTargetFloor: string[];
  unclickable: string[];
  /** S7 — every clickable control, including the ones carrying no `data-toolbar-item`. */
  secondaryBelowFloor: Target[];
  /**
   * S9 — the id of the row's rightmost `[data-toolbar-item]`, or `null` on an empty row.
   *
   * The `⋯` is the row's escape hatch, so wherever it renders it must be the **last** thing: a
   * button that opens "everything else" sitting mid-row reads as a control that was left behind
   * rather than as the end of the list. The finish chip used to be the toolbar's sibling, painted to
   * its right, which made that impossible — and no assertion here saw it, because every command was
   * still clickable.
   *
   * **It does not catch the other defect that put the `⋯` mid-row**, and that was checked rather
   * than assumed: with the second `ml-auto` restored this still passes, because the button remained
   * the row's last element — what moved was the trailing *group*, which had ~191 px of slack dumped
   * in front of it. That is `trailingGapPx` below.
   */
  rightmostItemId: string | null;
  /** Does this row park a group at its trailing edge (`alignEndGroup` → `ml-auto`)? */
  hasTrailingGroup: boolean;
  /**
   * S10 — px between the last non-`⋯` item and whatever ends the row.
   *
   * On a row with a trailing group this should be the `⋯` wrapper's own chrome and nothing else.
   * It was ~191 px, because the row carried **two** auto margins — `alignEndGroup`'s and the `⋯`
   * wrapper's — and a flex line splits its free space equally between every auto margin on it
   * rather than giving it to the last. Both controls then sat at a midpoint, each looking
   * individually plausible, and the product owner reported the `⋯` as stranded mid-row.
   */
  trailingGapPx: number | null;
}

async function readRow(page: Page, ariaLabel: string): Promise<RowState> {
  return page.getByRole('toolbar', { name: ariaLabel }).evaluate(
    (el, arg): RowState => {
      const { minTarget, inlineExempt } = arg;
      const container = el as HTMLElement;
      const inline: string[] = [];
      const presentational: string[] = [];
      const pastRightEdge: string[] = [];
      const belowTargetFloor: string[] = [];
      const unclickable: string[] = [];
      let overflowPresent = false;
      let overflowVisibleWidth = 0;

      let rightmostItemId: string | null = null;
      let rightmostEdge = Number.NEGATIVE_INFINITY;
      let rightmostNonOverflowEdge = Number.NEGATIVE_INFINITY;
      let overflowLeft: number | null = null;

      const startScroll = container.scrollLeft;
      for (const node of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
        const id = node.getAttribute('data-toolbar-item') ?? '';
        if (id === '__overflow__') overflowPresent = true;
        else inline.push(id);
        // A read-out rather than a command: nothing inside it is focusable.
        if (
          id !== '__overflow__' &&
          !node.matches('[data-toolbar-focusable]') &&
          node.querySelector('[data-toolbar-focusable]') === null
        ) {
          presentational.push(id);
        }

        const ownBox = node.getBoundingClientRect();
        // A zero-width box is not "rightmost" in any sense a reader would recognise.
        if (ownBox.width > 0 && ownBox.right > rightmostEdge) {
          rightmostEdge = ownBox.right;
          rightmostItemId = id;
        }
        if (id === '__overflow__') {
          // The wrapper, not the button: its `border-l pl-1` is part of what sits between the two.
          overflowLeft = (node.parentElement ?? node).getBoundingClientRect().left;
        } else if (ownBox.width > 0 && ownBox.right > rightmostNonOverflowEdge) {
          rightmostNonOverflowEdge = ownBox.right;
        }

        // **Scroll to it first.** Since M1-T5 the row is `overflow-x-auto`, so "past the right edge"
        // no longer means "unreachable" — it means the reader scrolls. The user-level question is
        // therefore not *where is this box* but *can a planner get a pointer onto it*, and that is
        // what this measures. It generalises too: at every width where the row already fits,
        // scrolling is a no-op and the reading is identical.
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const rowBox = container.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        // Clamped against the **viewport as well as the row** (ADR-0091 M1, B4). Intersecting with
        // the row's own box alone is sound only while a row is full-width inside the band, which
        // both original rows are. The mode row is shrink-to-fit, so its container box and its
        // content coincide by definition and a clip can never be reported — the row would pass S1
        // and `belowTargetFloor` while a control sat off-screen, pushed out by the identity line or
        // the band. Clamping to the viewport catches that and cannot regress the other two rows,
        // whose boxes already sit inside it.
        const left = Math.max(b.left, rowBox.left, 0);
        const right = Math.min(b.right, rowBox.right, window.innerWidth);
        const visible = Math.round(Math.max(0, right - left));
        if (id === '__overflow__') overflowVisibleWidth = visible;

        // Unreachable even after scrolling to it — the shipped defect.
        if (visible <= 0) pastRightEdge.push(id);
        if (visible < minTarget) belowTargetFloor.push(`${id}:${visible}px`);

        // Does a click at the control's own visible centre land on it? A correctly positioned,
        // fully scrolled-to control can still be covered by a neighbour's overflowing content —
        // which happened during this milestone, and which no position check can see.
        const cx = Math.round(left + visible / 2);
        const cy = Math.round(b.top + b.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        if (visible > 0 && !(hit && (node === hit || node.contains(hit)))) unclickable.push(id);
      }

      // **S7 — the second sweep, over clickable controls rather than toolbar items.** The two are not
      // the same set: `data-toolbar-item` marks an item's *focusable* control, so a split button's
      // caret (`tabIndex={-1}`, outside the roving sequence by design) carries none and the first loop
      // never saw it. Both dimensions are measured here, not just width: the first loop's width-only
      // reading answers "is it clipped by the horizontal scroll", which is the axis M1's defect lived
      // on; 2.5.8 is about the box.
      const secondaryBelowFloor: Target[] = [];
      const clickable = container.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [role="button"]',
      );
      for (const node of clickable) {
        const owner =
          node.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? 'row';
        if (inlineExempt.includes(owner)) continue;
        node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const b = node.getBoundingClientRect();
        // A control that is not laid out at all is not a target; `hidden`/`display:none` produce a
        // zero box, and asserting on those would fail on markup no pointer can reach.
        if (b.width === 0 && b.height === 0) continue;
        if (b.width >= minTarget && b.height >= minTarget) continue;
        const name =
          node.getAttribute('aria-label') ?? (node.textContent ?? '').trim().slice(0, 24);
        secondaryBelowFloor.push({
          key: `${owner}/${name || node.tagName.toLowerCase()}`,
          width: Math.round(b.width * 10) / 10,
          height: Math.round(b.height * 10) / 10,
        });
      }
      container.scrollLeft = startScroll;

      return {
        containerWidth: container.clientWidth,
        scrollWidth: container.scrollWidth,
        inline,
        presentational,
        overflowPresent,
        overflowVisibleWidth,
        pastRightEdge,
        belowTargetFloor,
        unclickable,
        secondaryBelowFloor,
        rightmostItemId,
        hasTrailingGroup: container.querySelector('[role="group"].ml-auto') !== null,
        trailingGapPx:
          rightmostNonOverflowEdge === Number.NEGATIVE_INFINITY
            ? null
            : Math.round(
                (overflowLeft ?? container.getBoundingClientRect().right) -
                  rightmostNonOverflowEdge,
              ),
      };
    },
    { minTarget: MIN_TARGET_PX, inlineExempt: [...INLINE_EXEMPT_ITEMS] },
  );
}

/** The full reachable set: what is inline plus whatever the `⋯` offers. */
async function reachableSet(page: Page, ariaLabel: string, state: RowState): Promise<string[]> {
  const ids = [...state.inline];
  if (state.overflowPresent && state.overflowVisibleWidth >= MIN_TARGET_PX) {
    const bar = page.getByRole('toolbar', { name: ariaLabel });
    await bar.getByRole('button', { name: 'More toolbar actions' }).click();
    const menu = page.getByRole('menu', { name: 'More toolbar actions' });
    await expect(menu).toBeVisible();
    ids.push(
      ...(await menu.evaluate((el) =>
        // **Every menuitem *role*, not just the bare one.** `[role="menuitem"]` alone missed every
        // toggle in the `⋯` — `ToolbarOverflow` renders an item with `isActive` as
        // `role="menuitemcheckbox"` (and a radio as `menuitemradio`), which is correct APG and
        // invisible to that selector. The hole was harmless only while tier-3 items were
        // *permanently* in the menu: they never appeared in the reference set, so nothing ever
        // asked whether the menu offered them. Tier-3 admission put `float-paths` inline at the
        // widest width, it entered the reference, and the gate then reported it as having no route
        // at all — a true statement about the instrument and a false one about the product.
        [
          ...el.querySelectorAll<HTMLElement>(
            '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
          ),
        ].map((n) => `menu:${(n.innerText ?? '').trim()}`),
      )),
    );
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  return ids;
}

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}

async function openPlan(page: Page, stamp: number): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Fit Tester');
  await page.getByLabel('Email').fill(`fit-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Fit Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

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
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();
  // The mode cluster must still be asserted at mount (ADR-0091 M1) even though it is no longer
  // swept: without it, a cluster that fails to render leaves every remaining assertion passing on a
  // shorter list — coverage that looks like coverage, `docs/TECH_DEBT.md` #124 one row over. It is
  // in the rail since Graphite M5, and it is a VERTICAL toolbar, which is why it is not in `ROWS`.
  const modes = page.getByRole('toolbar', { name: 'Plan mode' });
  await expect(modes).toBeVisible();
  await expect(modes).toHaveAttribute('aria-orientation', 'vertical');

  // A populated plan, or three Row-1 items self-hide (`hasDiagram`) and the row measured is not the
  // row a planner looks at — the blind spot the first measurement pass shipped with.
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  for (const name of ['Excavate', 'Pour slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  // Wait for the schedule to compute before measuring, or the row is narrower than the one a planner
  // sees.
  //
  // **Asked of the API, not of the screen** (ADR-0091 M7-S4). This used to watch the Project-finish
  // read-out, on the reasoning that a readiness gate must be something that appears when the work is
  // done. That was right, and the element chosen stopped satisfying it: the chip moved back into the
  // registry and became band-conditional, so under a coarse pointer at a narrow band it correctly
  // never appears and the gate waited 30 s for it. Any on-screen signal is a hostage to the layout —
  // which is the very thing this file exists to vary — so the honest gate is the state itself.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const match = /\/orgs\/([^/]+)\/plans\/([^/?#]+)/.exec(window.location.pathname);
          if (!match) return null;
          const response = await fetch(
            `/api/v1/organizations/${match[1]}/plans/${match[2]}/schedule/summary`,
            { credentials: 'include' },
          );
          if (!response.ok) return null;
          const body = (await response.json()) as { data?: { projectFinish?: string | null } };
          return body.data?.projectFinish ?? null;
        }),
      { timeout: 30_000, message: 'the schedule never computed a project finish' },
    )
    .not.toBeNull();
}

test('every toolbar command is reachable at every targeted width', async ({ page }) => {
  const stamp = Date.now();
  await page.setViewportSize({ width: WIDTHS[0]!, height: 1080 });
  await openPlan(page, stamp);
  await settle(page);

  // The reference set: what this build offers when it has room. Never a list typed into this file.
  const reference: Record<string, string[]> = {};
  for (const row of ROWS) {
    const widest = await readRow(page, row);
    reference[row] = widest.inline.filter((id) => !widest.presentational.includes(id)).sort();
  }

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 1200 ? 1280 : 1080 });
    await settle(page);

    for (const row of ROWS) {
      const state = await readRow(page, row);
      const where = `${row} @ ${width}`;

      // S1 — nothing rendered past the row's right edge.
      expect(state.pastRightEdge, `S1 ${where}: rendered past the right edge`).toEqual([]);

      // S5 — every control is a real, clickable target of at least 24 px.
      expect(state.belowTargetFloor, `S5 ${where}: below the 24 px target minimum`).toEqual([]);
      expect(state.unclickable, `S5 ${where}: covered by something else`).toEqual([]);

      // S7 — and every clickable control inside the row, tab stop or not.
      expect(
        state.secondaryBelowFloor,
        `S7 ${where}: a clickable control below the 24 px minimum (WCAG 2.2 §2.5.8)`,
      ).toEqual([]);

      // S2 — if the ⋯ renders at all, it is a real target too.
      if (state.overflowPresent) {
        expect(
          state.overflowVisibleWidth,
          `S2 ${where}: the overflow button is the escape hatch and must never be the clipped thing`,
        ).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      }

      // S4 — above the pinned floor the row fits as laid out.
      if (width >= PINNED_FLOOR_WIDTH) {
        expect(
          state.scrollWidth,
          `S4 ${where}: the row lays out wider than its container`,
        ).toBeLessThanOrEqual(state.containerWidth + 1);
      }

      // S9 — wherever the `⋯` renders, it is the row's last thing.
      if (state.overflowPresent) {
        expect(
          state.rightmostItemId,
          `S9 ${where}: the ⋯ is the escape hatch and must be the row's rightmost control`,
        ).toBe('__overflow__');
      }

      // S10 — a row that parks a group at its trailing edge really does put it there.
      if (state.hasTrailingGroup && state.trailingGapPx !== null) {
        expect(
          state.trailingGapPx,
          `S10 ${where}: the trailing group is adrift of the row's end — more than one auto margin on the line?`,
        ).toBeLessThanOrEqual(TRAILING_GAP_TOLERANCE_PX);
      }

      // S11 — a popover trigger goes icon-only in the collapsed band, like its neighbours.
      //
      // Added 2026-08-13 after `Analysis` and `Share & export` were found painting their text at
      // every width while every other trigger on both rows went icon-only below 1024. That is 145 px
      // between them; Row 2 fitted at 960 only because `snap-to-grid` was there to demote, and
      // deleting that button (workspace-chrome M2) turned a latent inconsistency into a red S4.
      //
      // Asserted as **both states**, not just the narrow one: an assertion that only pins "no label
      // at 960" passes just as well against a control that has no label anywhere, which is the
      // TECH_DEBT #126 failure (four blank 16 px buttons) in a different costume. The trigger is
      // located by its item id, never by its copy — the standing rule after three journeys broke on
      // a label change.
      //
      // **Keyed to the BAND's width, not the viewport's** (Graphite M3). The threshold is the
      // toolbar's own density band, and `ToolbarBandProvider` resolves that from the band — which
      // stopped being the viewport when the rail took the leading column top to bottom, so the band
      // is now the viewport MINUS the rail. At 1280 with the rail expanded that is ~1000 px, one
      // side of 1024, and this assertion went red against a ladder behaving exactly as designed.
      // Comparing a density decision against a number the decision is not a function of is the
      // ADR-0091 M7 conflation, on the gate's side of the fence this time.
      for (const id of ['analysis', 'export']) {
        if (!state.inline.includes(id)) continue;
        const text = await page
          .locator(`[data-toolbar-item="${id}"]`)
          .first()
          .innerText()
          .catch(() => '');
        const labelled = text.trim().length > 0;
        const roomy = state.containerWidth >= 1024;
        expect(
          labelled,
          `S11 ${where}: ${id} should be ${roomy ? 'labelled' : 'icon-only'} in this band ` +
            `(band ${state.containerWidth} px at viewport ${width} px)`,
        ).toBe(roomy);
      }

      // S3 — no command has been lost; it is inline or the ⋯ offers it.
      const reachable = await reachableSet(page, row, state);
      const missing = reference[row]!.filter(
        (id) => !state.inline.includes(id) && reachable.length === state.inline.length,
      );
      expect(missing, `S3 ${where}: commands with no route at all`).toEqual([]);
    }
  }
});

/**
 * **The command band's width does not change when the context drawer opens** (ADR-0099 §4a,
 * Graphite M4) — the product owner's requirement, and the one this epic answers with geometry
 * rather than with a measurement anyone has to keep correct.
 *
 * The band spans grid columns 2–3; `<main>` and the drawer are the two things inside that span.
 * Opening the drawer redistributes width between them and changes their container by zero. There
 * is no `ResizeObserver`, no measured reservation and no way to break it without editing
 * `grid-column` — which is exactly what four epics of measuring a row against its own leftover
 * width bought (ADR-0090 → ADR-0094).
 *
 * **Asserted at three states, not two.** Open/closed alone would pass against a band that reserved
 * a fixed drawer width, which is a different design with the same two readings; dragging the
 * splitter to a third width is what separates "spans the drawer's column" from "leaves room for a
 * drawer". The stage must move at each step, or the drawer is not taking width from anything and
 * the test is asserting that nothing happened.
 */
test('the command band is unchanged across drawer open, close and resize', async ({ page }) => {
  await page.setViewportSize({ width: 1646, height: 1000 });
  await openPlan(page, Date.now() + 5);

  const band = page.locator('[data-surface="chrome"]').first();
  const stage = page.getByRole('main');
  const explorer = page.getByRole('button', { name: 'Project Explorer' });
  const widthOf = async (locator: typeof band): Promise<number> =>
    locator.evaluate((node: Element) => node.getBoundingClientRect().width);

  // The drawer starts open on the Explorer, which is the shipped default.
  await expect(page.getByRole('complementary', { name: 'Project Explorer' })).toBeVisible();
  const bandOpen = await widthOf(band);
  const stageOpen = await widthOf(stage);

  await explorer.click();
  await expect(page.getByRole('complementary', { name: 'Project Explorer' })).toBeHidden();
  const bandClosed = await widthOf(band);
  const stageClosed = await widthOf(stage);

  await explorer.click();
  await expect(page.getByRole('complementary', { name: 'Project Explorer' })).toBeVisible();
  const splitter = page.getByRole('separator', { name: 'Resize context drawer' });
  await splitter.focus();
  // Six ArrowLeft presses at the primitive's 16 px step: 300 → 396, inside the 224–420 bounds and
  // far enough that a band reserving a fixed width would be caught.
  for (let i = 0; i < 6; i += 1) await splitter.press('ArrowLeft');
  await expect(splitter).toHaveAttribute('aria-valuenow', '396');
  const bandResized = await widthOf(band);
  const stageResized = await widthOf(stage);

  expect(bandClosed, 'the band changed width when the drawer closed').toBeCloseTo(bandOpen, 0);
  expect(bandResized, 'the band changed width when the drawer was resized').toBeCloseTo(
    bandOpen,
    0,
  );

  // The control: the stage really did give up width at each step. Without this the band assertion
  // passes just as well against a drawer that never opened.
  expect(stageClosed, 'the stage did not widen when the drawer closed').toBeGreaterThan(stageOpen);
  expect(stageResized, 'the stage did not narrow when the drawer grew').toBeLessThan(stageOpen);
});

test('the layout settles rather than oscillating', async ({ page }) => {
  const stamp = Date.now();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPlan(page, stamp);

  // S6. The boundary widths matter most: 1920 is where the defect was reported, and the row's
  // cheapest group (`help`, two items) empties around there — the shape a derived chrome must not
  // oscillate on and a measured one would have.
  for (const width of [1920, 1600, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await settle(page);
    const first = await readRow(page, 'View and navigate');
    await settle(page);
    const second = await readRow(page, 'View and navigate');
    expect(second.inline, `S6 @ ${width}: the inline set changed with no input`).toEqual(
      first.inline,
    );
    expect(second.scrollWidth, `S6 @ ${width}: the row width changed with no input`).toBe(
      first.scrollWidth,
    );
  }
});

/**
 * **S8 — the search field's leading icon is actually painted** (ADR-0091 M4).
 *
 * It had been in the DOM, correctly sized and correctly positioned, and **invisible**: a `-mr-6`
 * negative margin on a non-positioned flex item leaves the icon in flow, and the input — later in
 * document order, carrying an opaque `bg-field` — painted over it. Reported as a missing icon;
 * measured (M0-T2) as a covered one.
 *
 * **This is why the assertion is `elementFromPoint` rather than a visibility or geometry check.**
 * Every cheaper test passes against the broken code: the icon has a non-zero box, `opacity: 1`,
 * `visibility: visible`, and Playwright calls it visible. Only asking *what would a click at this
 * pixel actually hit* separates "painted" from "painted underneath something else" — the same
 * reasoning as S5, one layer down. No unit test can see it at all: jsdom has no layout and no
 * paint order.
 */
test('the search field paints its leading icon rather than hiding it under the input', async ({
  page,
}) => {
  const stamp = Date.now();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPlan(page, stamp);
  await page.waitForTimeout(400);

  const verdict = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) return 'no search input on the page';
    const icon = input.parentElement?.querySelector('svg') ?? null;
    if (!icon) return 'the search field has no leading icon';
    const b = icon.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return 'the icon has a zero-area box';
    // `pointer-events` must be neutralised for the duration of the read. A decorative icon is
    // `pointer-events-none` — correctly — and `elementFromPoint` skips such elements entirely,
    // returning whatever is beneath. Without this the assertion asks "is the icon clickable?",
    // whose answer is always no by design, and it could never pass in either state. The first
    // version of this test made exactly that conflation.
    const el = icon as SVGElement & { style: CSSStyleDeclaration };
    const prior = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    el.style.pointerEvents = prior;
    if (hit === icon) return 'painted';
    return `covered by <${hit?.tagName.toLowerCase() ?? 'nothing'}>`;
  });

  expect(verdict, 'S8: a click at the icon’s own centre must land on the icon').toBe('painted');
});

test('the toolbar passes a WCAG 2.2 scan with target-size opted in', async ({ page }) => {
  const stamp = Date.now();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPlan(page, stamp);
  await settle(page);

  /**
   * The pre-existing scans request `['wcag2a', 'wcag2aa']` — the **WCAG 2.0** tag families. Verified
   * by running axe-core 4.12.1: `target-size` is tagged `wcag22aa` and ships `enabled: false`, so it
   * is excluded twice over, and "the axe scan is green" was true and meaningless about the one
   * criterion this milestone is about. This scan opts it in.
   *
   * **It does not, however, catch the defect this milestone fixes, and this test must not be read as
   * if it did.** Run against the pre-M1 build it passed — while `legend` and `shortcuts` were sitting
   * outside the row at zero visible width. `target-size` measures an element's own box, and those
   * boxes were a healthy 32 × 36; what made them unreachable was an **ancestor's** `overflow: hidden`,
   * which the rule does not model. So this is a genuine widening that catches genuinely small
   * targets — worth having, and it holds M3's touch work to account — but the gate for *this* defect
   * is S5's `elementFromPoint` probe above, and nothing else here.
   *
   * That distinction was established by running the pre-fix build, not by reading axe's source. The
   * first draft of this test was named "the accessibility scan can actually see a target-size
   * failure", which the red run disproved.
   */
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .include('[role="toolbar"]')
    .analyze();

  expect(results.violations).toEqual([]);
});

/**
 * **Touch geometry** (ADR-0090 M3-T4), asserted in a browser that actually reports
 * `@media (pointer: coarse)` rather than by reading the class list.
 *
 * The plan asks for "a computed assertion on the coarse-pointer control geometry", and the reason it
 * has to be computed is that every cheaper check is a check on the *source*: a unit test can see
 * `pointer-coarse:px-3` in a `className` and cannot see whether Tailwind emitted the rule, whether
 * the variant name is right, or whether something later in the cascade beat it. (The rule's presence
 * in the built CSS was confirmed separately — `@media (pointer:coarse){.pointer-coarse\:px-3{…}}` —
 * but "it compiled" and "it applies to this button" are different claims.)
 *
 * **What it does not claim.** The house rule is ≥ 44 px on both axes (`docs/UX_STANDARDS.md`) and
 * this only moves the major one, 32 → 40. The minor axis stays 36 and is `docs/TECH_DEBT.md` #127,
 * so the assertion is written against the number actually delivered — a test asserting 44 here would
 * be red on merge, and a gate that fails on day one gets deleted rather than fixed (ADR-0058).
 */
test.describe('coarse pointer', () => {
  // `hasTouch` alone, **probed rather than assumed**: a standalone script reported
  // `matchMedia('(pointer: coarse)').matches` as `true` for `{hasTouch}` and for
  // `{hasTouch, isMobile}`, and `false` for neither. `isMobile` was in the first draft and is left
  // out because it also emulates the mobile meta-viewport, which reflowed the New-activity dialog
  // until its description paragraph covered the Create button — the fixture failed on a detail with
  // nothing to do with what is being measured.
  test.use({ hasTouch: true });

  test('widens every toolbar control without shortening it', async ({ page }) => {
    const stamp = Date.now();
    await page.setViewportSize({ width: 1024, height: 1366 });
    await openPlan(page, stamp);

    await settle(page);

    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    // If the emulation ever stops reporting coarse, this test would pass by measuring the fine-
    // pointer layout against a fine-pointer expectation — green for having tested nothing.
    expect(coarse, 'the browser must actually report a coarse pointer').toBe(true);

    const boxes = await page.getByRole('toolbar', { name: 'Build and manage' }).evaluate((el) =>
      [...(el as HTMLElement).querySelectorAll<HTMLElement>('[data-toolbar-item]')].map((n) => ({
        id: n.getAttribute('data-toolbar-item') ?? '',
        width: Math.round(n.getBoundingClientRect().width),
        height: Math.round(n.getBoundingClientRect().height),
      })),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(
        box.width,
        `${box.id} is narrower than the coarse-pointer floor`,
      ).toBeGreaterThanOrEqual(40);
      expect(box.height, `${box.id} lost height to the padding change`).toBeGreaterThanOrEqual(36);
    }
  });
});
