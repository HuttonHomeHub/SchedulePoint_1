import AxeBuilder from '@axe-core/playwright';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import { probeRowSubjects, type ProbeResult } from '../scripts/row-subject-probe.mjs';

import {
  addActivity,
  createClient,
  createPlan,
  createProject,
  countOverviewRequests,
  ensurePen,
  onboard,
  openOverview,
  section,
} from './support';

/**
 * The organisation overview, driven end to end (ADR-0098 M2).
 *
 * **What only this can see.** Three of the four claims this screen makes are untestable in a unit
 * suite, because a unit suite hands the component its own payload:
 *
 * 1. **The endpoint exists and the client asks for it correctly.** `apiFetch` prefixes
 *    `API_BASE_URL`, which is already `/api/v1` — the staff console shipped a doubled prefix that
 *    its own tests agreed with, because they mock `apiFetch` and branch on whatever string the code
 *    happens to pass. Only a real request against a real API can see that.
 * 2. **An activity edit moves its plan.** The read model's ordering key is a `GREATEST` over three
 *    tables precisely because `plans.updated_at` does not move when an activity changes. A mocked
 *    payload proves nothing about that; a real edit followed by a real read does.
 * 3. **The actor is the person who made the change.** Attribution runs from a session, through
 *    `updated_by`, through a join scoped to `org_members`. A unit test asserts a name it supplied
 *    itself.
 *
 * A brand-new organisation is created per run, so the assertions are about work this test did.
 */
test.describe.configure({ mode: 'serial' });

test('the landing shows what changed, who changed it, and what is waiting', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);

  // -------------------------------------------------- 1. A brand-new organisation says so
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Overview Co ${stamp}`);
  await expect(page.getByText('This organisation is empty')).toBeVisible();
  // An Org Admin may act, so the action is offered. The role-gated absence is a unit assertion —
  // this journey proves the writer half against the real role the API handed back.
  await expect(page.getByRole('link', { name: 'Add your first client' })).toBeVisible();
  // The section headings are NOT rendered in this state: an empty organisation is one fact, not
  // three empty frames.
  await expect(page.getByRole('region', { name: 'Recently changed' })).toHaveCount(0);

  // -------------------------------------------------- 2. Build a plan, and change it
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await ensurePen(page);
  await addActivity(page, orgSlug, 'Pour slab');

  // -------------------------------------------------- 3. The overview noticed
  //
  // **In a SECOND tab, and this is the journey's first finding.** The obvious version of this test
  // navigated the same page to the overview and then asserted the held pen — and failed, because
  // `use-plan-edit-lock.ts:168-184` releases the lease on nav-away and on `pagehide`. That is the
  // product being right: a pen you released is not one you are holding, and reporting it would be
  // the false statement this screen exists to avoid. So the shape that actually produces a held
  // lock is the real one — the plan is open somewhere and you are looking at the overview — and
  // that is what this drives. Written down because the same wrong assumption is one keystroke away
  // for whoever touches this next.
  const overviewPage = await page.context().newPage();
  await openOverview(overviewPage, orgSlug);
  const recent = section(overviewPage, 'Recently changed');
  const row = recent.getByRole('link', { name: 'Northgate — Phase 1' });
  await expect(row).toBeVisible();
  await expect(recent.getByText('Northgate · Bellway')).toBeVisible();
  // The actor is this session's user, resolved through org_members — not a name the test supplied.
  await expect(recent.getByText('Ada Overview')).toBeVisible();
  // The exact instant is in the markup, not only in a hover title a keyboard reader never sees.
  await expect(recent.locator('time').first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

  // -------------------------------------------------- 4. The pen held in the other tab is reported
  const attention = section(overviewPage, 'Needs your attention');
  await expect(attention).toBeVisible();
  await expect(attention.getByText('You are holding the editing lock.')).toBeVisible();

  // -------------------------------------------------- 5. Exactly one h1, and no second landmark
  await expect(overviewPage.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(overviewPage.getByRole('main')).toHaveCount(1);

  // -------------------------------------------------- 5b. The page uses the width it has
  //
  // **Two sections sharing a `top` is what "two columns" MEANS**, so it is asserted as a geometric
  // fact rather than by reading a class name — a class assertion passes against a grid whose
  // columns never resolve (ADR-0100 M4's token pair painted nothing in a real browser while its
  // gate stayed green). It has to run here rather than in a unit test: the whole effect is CSS
  // grid, which jsdom does not lay out, so all 152 unit cases for this feature pass identically
  // whether the landing is one column or two.
  //
  // **It lives inside this test, and that is deliberate on two counts.** As its own test it needed
  // its own `onboard()`, and a fourth sign-up in this shard pushed the file into Better Auth's
  // 3-per-10s in-process rate limiter — `standing.spec.ts` then failed its retries at "create your
  // organisation", a failure caused entirely by adding an assertion elsewhere. And the page here is
  // provably SETTLED: several `toBeVisible` assertions above have already resolved against real
  // content. Measured once immediately after `openOverview` it was flaky, sampling a layout that
  // was still arriving — two sections at 155 and 337, stacked, before the stylesheet applied.
  //
  // No pixel width is asserted. The columns are 730 px at 1920 and 647 at 1646, both fluid and both
  // meant to change when the drawer moves; pinning either would make a correct resize fail.
  await overviewPage.setViewportSize({ width: 1600, height: 1000 });
  await expect
    .poll(
      async () => {
        const sections = await overviewPage.getByRole('region').all();
        const tops = await Promise.all(
          sections.map(async (r) => Math.round((await r.boundingBox())?.y ?? -1)),
        );
        // The pinned positive case, inside the poll: "no two sections share a top" is satisfied
        // perfectly by a page with no sections on it, so a run that found none must not read as a
        // pass. Returning the pair makes both halves visible in the failure message.
        return { count: tops.length, distinct: new Set(tops).size };
      },
      { message: 'the landing never settled into two columns' },
    )
    .toEqual({ count: 4, distinct: 2 });

  // -------------------------------------------------- 5b2. The grid splits on the width IT has
  //
  // **A viewport breakpoint cannot pass this block.** The Explorer moves the grid's width by up to
  // 386 px at one window size, so the same 1280 window must be one column with the Explorer open
  // and two with it folded, and a 1440 window one column with the Explorer at 420 (ADR-0182,
  // `docs/specs/landing-two-columns` SC-1, SC-3). Geometry again, never a class name: jsdom lays
  // out no container query. It stays inside this test for the sign-up rate-limit reason above.
  const settled = (columns: 1 | 2) =>
    expect
      .poll(
        async () => {
          const regions = await overviewPage.getByRole('region').all();
          const boxes = await Promise.all(regions.map((r) => r.boundingBox()));
          return {
            count: boxes.length,
            distinct: new Set(boxes.map((b) => Math.round(b?.y ?? -1))).size,
            // A column is never narrower than 564 px (72rem less the gap, halved) whatever the
            // window, Explorer or text size.
            narrowest: Math.min(...boxes.map((b) => Math.round(b?.width ?? 0))) >= 564,
          };
        },
        { message: `the landing never settled into ${String(columns)} column(s)` },
      )
      .toEqual({ count: 4, distinct: columns === 1 ? 4 : 2, narrowest: true });

  /** The regions in DOM order, and the regions Tab walks through, in the order it reaches them. */
  const readingAndTabOrder = async () => {
    const regionOf = () =>
      overviewPage.evaluate(
        () => document.activeElement?.closest('section')?.getAttribute('aria-labelledby') ?? null,
      );
    const dom = await overviewPage.evaluate(() =>
      [...document.querySelectorAll('main section[aria-labelledby]')].map(
        (el) =>
          document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
      ),
    );
    const first = overviewPage.locator('main section[aria-labelledby] a').first();
    await first.focus();
    const walked: string[] = [];
    for (let i = 0; i < 80; i += 1) {
      const id = await regionOf();
      if (id === null) break;
      const name = await overviewPage.evaluate(
        (labelId) => document.getElementById(labelId)?.textContent ?? '',
        id,
      );
      if (walked[walked.length - 1] !== name) walked.push(name);
      await overviewPage.keyboard.press('Tab');
    }
    return { dom, walked };
  };
  const expectSameSequence = async (layout: string) => {
    const { dom, walked } = await readingAndTabOrder();
    expect(walked.length, `${layout}: Tab never left the first section`).toBeGreaterThan(1);
    expect(walked, `${layout}: Tab order differs from DOM order`).toEqual(
      dom.filter((name) => walked.includes(name)),
    );
  };
  const axeBoth = async (layout: string) => {
    const results = await new AxeBuilder({ page: overviewPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      // `region` is a best-practice rule and off by default; both are named so a clean report
      // cannot mean the rule was never run.
      .options({
        rules: {
          'scrollable-region-focusable': { enabled: true },
          region: { enabled: true },
        },
      })
      .analyze();
    // The Explorer's splitter wrapper (`explorer-column.tsx:128-130`, a `contents` panel surface
    // outside every landmark) fails `region` in every state, one column or two. It is the shell's,
    // untouched by this change, and is filed as `docs/TECH_DEBT.md` #473 rather than hidden: it is
    // filtered by that one target, so any OTHER `region` finding still fails.
    const violations = results.violations
      .map((v) => ({
        ...v,
        nodes: v.nodes.filter((n) => !(v.id === 'region' && n.target.join() === '.contents')),
      }))
      .filter((v) => v.nodes.length > 0);
    expect(violations, `${layout}: axe`).toEqual([]);
    expect(
      results.passes.some((r) => r.id === 'scrollable-region-focusable') ||
        results.inapplicable.some((r) => r.id === 'scrollable-region-focusable'),
      `${layout}: scrollable-region-focusable was not run`,
    ).toBe(true);
  };

  // Enough plans that "Recently changed" holds more than a box's 220 px floor of rows, and (#474) more
  // than the two-column box can show (the API returns at most 8), so one body overflows while the
  // shorter boxes do not. With one
  // plan every box is shorter than its floor, so a clamp to the floor and a box sized by its content
  // read the same and the assertion below would pass against the defect it names.
  await overviewPage.evaluate(async (org) => {
    const call = async (path: string, body: object) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`POST ${path}: ${String(response.status)}`);
      return ((await response.json()) as { data: { id: string } }).data;
    };
    const client = await call('/clients', { name: 'Filler Estates' });
    const project = await call(`/clients/${client.id}/projects`, { name: 'Filler Works' });
    for (let i = 1; i <= 7; i += 1) {
      await call(`/projects/${project.id}/plans`, {
        name: `Filler plan ${String(i)}`,
        plannedStart: '2026-03-02',
      });
    }
  }, orgSlug);
  await overviewPage.reload();
  await expect(section(overviewPage, 'Recently changed').getByRole('link').nth(5)).toBeVisible();

  await expectSameSequence('two columns at 1600');
  await axeBoth('two columns at 1600');

  await overviewPage.setViewportSize({ width: 1280, height: 800 });
  await settled(1);
  // **One column means one ordinary gap between boxes, not a floor's worth of air.** The 220 px
  // floor is a two-column rule; applied in one column it held each wrapper at 220 while the card
  // inside stopped at its content, leaving 100-130 px bands between short boxes (measured at 1465
  // with the Explorer open). Geometry, because jsdom lays out nothing.
  const gaps = await overviewPage.evaluate(() => {
    const boxes = [...document.querySelectorAll('main section[aria-labelledby]')].map((el) =>
      el.getBoundingClientRect(),
    );
    return boxes.slice(1).map((b, i) => Math.round(b.top - (boxes[i]?.bottom ?? 0)));
  });
  expect(gaps, 'one-column gaps between boxes').toEqual([24, 24, 24]);
  // **In one column the boxes stack at the height their content needs and `<main>` scrolls.** A cap
  // that survived the split clamped all four to their 220 px floor, each body scrolling on its own
  // (ADR-0182, the accessibility review).
  const stacked = await overviewPage.evaluate(() => {
    const recent = [...document.querySelectorAll('main section[aria-labelledby]')].find(
      (el) =>
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ===
        'Recently changed',
    );
    // Structural, not `[tabindex="0"]`: the body's tab stop is conditional now (#474).
    const body = recent?.lastElementChild;
    const main = document.querySelector('main');
    return {
      boxHeight: Math.round(recent?.getBoundingClientRect().height ?? 0),
      bodyClipped: body ? body.scrollHeight - body.clientHeight : -1,
      bodyTabindex: body?.getAttribute('tabindex') ?? null,
      mainScrolls: main ? main.scrollHeight > main.clientHeight : false,
    };
  });
  expect(
    stacked.boxHeight,
    'the box is clamped to its floor, not sized by its rows',
  ).toBeGreaterThan(300);
  expect(stacked.bodyClipped, 'the box body scrolls on its own in one column').toBeLessThanOrEqual(
    0,
  );
  // #474: nothing scrolls in one column, so the body is out of the tab sequence — as `-1`, never
  // without the attribute, which would drop focus to `<body>` if it were focused when this applied.
  expect(stacked.bodyTabindex, 'a body that scrolls nothing is still a tab stop').toBe('-1');
  expect(stacked.mainScrolls, 'the page does not scroll').toBe(true);
  await expectSameSequence('one column at 1280');
  await axeBoth('one column at 1280');

  // Fold the Explorer: the same window now has the room, and the control that caused the reflow
  // keeps focus (its counterpart takes it, `explorer-column.tsx:119`).
  await overviewPage.getByRole('button', { name: 'Hide Project Explorer' }).click();
  await settled(2);
  await expect(overviewPage.getByRole('button', { name: 'Show Project Explorer' })).toBeFocused();
  await expectSameSequence('two columns at 1280, Explorer folded');
  await overviewPage.getByRole('button', { name: 'Show Project Explorer' }).click();
  await settled(1);
  await expect(overviewPage.getByRole('button', { name: 'Hide Project Explorer' })).toBeFocused();

  // WCAG 1.4.4: at 200 % text the rem-based threshold keeps the page one column and nothing
  // overflows sideways.
  await overviewPage.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await settled(1);
  expect(
    await overviewPage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    'the landing overflows horizontally at 200 % text',
  ).toBeLessThanOrEqual(0);
  await overviewPage.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });

  // A wider window, but the Explorer dragged to its 420 maximum: one column where two would not fit.
  await overviewPage.setViewportSize({ width: 1440, height: 900 });
  await overviewPage.getByRole('separator', { name: 'Resize Project Explorer' }).focus();
  await overviewPage.keyboard.press('End');
  await settled(1);
  await expect(
    overviewPage.getByRole('separator', { name: 'Resize Project Explorer' }),
  ).toBeFocused();

  // Leave the page as the next step expects it.
  await overviewPage.keyboard.press('Home');
  await overviewPage.setViewportSize({ width: 1600, height: 1000 });
  await settled(2);

  // -------------------------------------------------- 5c. A capped box can be scrolled by keyboard
  //
  // **What this asserts, and what it deliberately does not.** The density work caps each box and
  // lets its body scroll, so the body is a scroll container — and a scroll container that cannot
  // take focus cannot be scrolled without a pointer (WCAG 2.2 §2.1.1, level A). `SectionCard fill`
  // gives the body `tabIndex` 0 while it overflows and -1 while it does not (`docs/TECH_DEBT.md`
  // #474: -1 and not removal, because removing the attribute from a focused element drops focus to
  // `<body>`; and it fails open to 0 when unmeasured, because an unreachable scroller is the level-A
  // failure and a spare stop is not). This proves, in a real browser jsdom cannot stand in for,
  // that the two states match the real overflow and that the overflowing one scrolls from the keys.
  //
  // It does NOT assert that the workspace stops scrolling, which is the claim the whole milestone
  // is about. That was written, run, and **found to be vacuous**: this organisation holds one plan,
  // so `<main>` does not overflow with the cap or without it — removing the cap entirely left the
  // assertion green. A test that passes against the defect it names is worse than no test, so the
  // claim stays where a fixture can exhibit it: `measure-landing-density.mjs`, on twelve plans,
  // reported in `m9-density-design.md` §5. The blind spot is stated rather than papered over.
  const bodies = await overviewPage.evaluate(() =>
    [...document.querySelectorAll('main section[aria-labelledby]')].map((el, index) => {
      const body = el.lastElementChild;
      return {
        index,
        overflowing: body ? body.scrollHeight > body.clientHeight + 1 : false,
        tabindex: body?.getAttribute('tabindex') ?? null,
      };
    }),
  );
  expect(
    bodies.filter((b) => b.overflowing && b.tabindex === '0'),
    'no box overflows at 1600 x 1000, so the keyboard path below has nothing to drive',
  ).not.toHaveLength(0);
  expect(
    bodies.filter((b) => !b.overflowing && b.tabindex === '-1'),
    'every box overflows at 1600 x 1000, so the spare-stop state is never exercised',
  ).not.toHaveLength(0);
  expect(
    bodies.filter((b) => b.overflowing !== (b.tabindex === '0')),
    "a body's tab stop disagrees with whether it overflows",
  ).toEqual([]);

  const scrollIndex = bodies.find((b) => b.overflowing)?.index ?? 0;
  const scrollable = overviewPage
    .locator('main section[aria-labelledby]')
    .nth(scrollIndex)
    .locator('> :last-child');
  await scrollable.focus();
  expect(
    await overviewPage.evaluate(() => document.activeElement?.getAttribute('tabindex')),
    'the capped box body did not take focus, so it cannot be scrolled from the keyboard',
  ).toBe('0');
  await overviewPage.keyboard.press('PageDown');
  expect(
    await scrollable.evaluate((el) => el.scrollTop),
    'PageDown did not scroll the focused box body',
  ).toBeGreaterThan(0);

  // -------------------------------------------------- 6. The row is the way back into work
  await row.click();
  await expect(overviewPage).toHaveURL(/\/plans\/[0-9a-f-]{36}/);

  // -------------------------------------------------- 7. No row's subject is ever cut off (#472)
  //
  // **Geometry from glyph rectangles, by the same probe the measurement harness runs**
  // (`scripts/row-subject-probe.mjs`), because "clipped" has one definition: the old instrument
  // counted a `text-overflow: ellipsis` on a text node's direct parent, which a plan name inside a
  // router `<a>` never has, so it reported zero clipped names while 16 of 17 were (M0). A unit test
  // cannot ask: jsdom lays nothing out.
  const LONG_NAME = 'Berth 4 Deepening — Dredging and Revetment Works, Stage 2B';
  await acknowledgeViewportNotice(overviewPage);
  const planId = await overviewPage.evaluate(
    async ({ org, name }: { org: string; name: string }) => {
      const call = async (path: string, body: object) => {
        const response = await fetch(`/api/v1/organizations/${org}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`POST ${path}: ${String(response.status)}`);
        return ((await response.json()) as { data: { id: string } }).data;
      };
      const client = await call('/clients', { name: 'Northern Ports and Harbours Authority' });
      const project = await call(`/clients/${client.id}/projects`, {
        name: 'Estuary Crossing Programme — Western Approaches',
      });
      return (await call(`/projects/${project.id}/plans`, { name, plannedStart: '2026-02-02' })).id;
    },
    { org: orgSlug, name: LONG_NAME },
  );
  // Open it once, so "Jump back in" carries it as well as "Recently changed" (the remembered id is
  // recorded when the plan has LOADED, which is what the pen control signals).
  await overviewPage.goto(`/orgs/${orgSlug}/plans/${planId}`);
  await expect(overviewPage.getByRole('button', { name: /^(Start|Stop) editing$/ })).toBeVisible();

  /** Open the landing at a size and read the probe once two readings agree. */
  const readSubjects = async (width: number, height: number): Promise<ProbeResult> => {
    await overviewPage.setViewportSize({ width, height });
    await openOverview(overviewPage, orgSlug);
    await expect(section(overviewPage, 'Jump back in').getByRole('link').first()).toBeVisible();
    let previous = '';
    let reading = await overviewPage.evaluate(probeRowSubjects);
    await expect
      .poll(
        async () => {
          reading = await overviewPage.evaluate(probeRowSubjects);
          const signature = JSON.stringify(reading.subjects.map((x) => x.rowHeight));
          const settled = signature === previous;
          previous = signature;
          return settled;
        },
        { message: `the landing never settled at ${String(width)} x ${String(height)}` },
      )
      .toBe(true);
    return reading;
  };
  const clippedSubjects = (reading: ProbeResult): string[] =>
    reading.subjects
      .filter(
        (x) =>
          x.name.clipped ||
          x.context.clipped ||
          x.name.ellipsis ||
          x.context.ellipsis ||
          x.trailing?.clipped,
      )
      .map((x) => `${x.region}: ${x.text}`);

  for (const [width, height] of [
    [1477, 900],
    [1912, 948],
  ] as const) {
    const at = `${String(width)} x ${String(height)}`;
    const reading = await readSubjects(width, height);
    // The pinned positive case: "nothing is clipped" is also what a page with no subjects reports.
    expect(reading.found, `${at}: the probe found no row subject`).toBeGreaterThan(0);
    expect(
      reading.subjects.some((x) => x.text.includes(LONG_NAME) && x.hasBadge && x.hasContext),
      `${at}: the long-named plan is not on the landing with its badge and context`,
    ).toBe(true);
    expect(clippedSubjects(reading), `${at}: a name, context or trailing fact is cut off`).toEqual(
      [],
    );
    expect(reading.docOverflowX, `${at}: the page overflows sideways`).toBeLessThanOrEqual(0);

    // Reading order for the long-named row from where the boxes are, not from the DOM: name, then
    // badge, then context — on one line left to right, otherwise top to bottom.
    const order = await overviewPage.evaluate((longName) => {
      // "Jump back in" renders the same plan with no badge or context, so the row asked about is the
      // first one that has both.
      const subject = [...document.querySelectorAll('[data-row-subject]')].find(
        (el) =>
          el.textContent?.includes(longName) && (el.firstElementChild?.children.length ?? 0) > 1,
      );
      const group = subject?.firstElementChild;
      const contextBox = subject?.lastElementChild;
      const link = group?.querySelector('a');
      const badge = group && group.children.length > 1 ? group.lastElementChild : null;
      const first = (el: Element | null | undefined) => el?.getClientRects()[0] ?? null;
      const boxes = [first(link), first(badge), first(contextBox)];
      return boxes.map((b) => (b ? { top: b.top, left: b.left } : null));
    }, LONG_NAME);
    const [nameBox, badgeBox, contextBox] = order;
    expect(
      nameBox && badgeBox && contextBox,
      `${at}: a part of the long row is missing`,
    ).toBeTruthy();
    const before = (a: { top: number; left: number }, b: { top: number; left: number }) =>
      Math.abs(a.top - b.top) < 8 ? a.left < b.left : a.top < b.top;
    expect(before(nameBox!, badgeBox!), `${at}: the badge reads before the name`).toBe(true);
    expect(before(badgeBox!, contextBox!), `${at}: the context reads before the badge`).toBe(true);
  }

  /** SC-2's after-control: a token no layout can fit, injected into one whole context. */
  const controlSeesAnInjectedToken = async (): Promise<void> => {
    const base = await overviewPage.evaluate(probeRowSubjects);
    const target = base.subjects.findIndex((x) => x.hasContext && !x.context.clipped);
    expect(target, 'no unclipped context to inject into').toBeGreaterThanOrEqual(0);
    await overviewPage.evaluate((i) => {
      const host = document.querySelectorAll('[data-row-subject]')[i]?.lastElementChild;
      const token = document.createElement('span');
      token.dataset.injected = 'true';
      token.style.cssText = 'display:inline-block;white-space:nowrap';
      // Wider than the window itself (a "W" at 14 px is ~12.5 px): a context now wraps under its name,
      // so a fixed 400 px token (the harness's, on the OLD tree) simply fits at 1280. The probe reads
      // glyph rects, so an empty box would overflow nothing it can see.
      token.textContent = 'W'.repeat(Math.ceil((window.innerWidth * 1.5) / 12));
      host?.appendChild(token);
    }, target);
    const injected = await overviewPage.evaluate(probeRowSubjects);
    await overviewPage.evaluate(() => document.querySelector('[data-injected]')?.remove());
    expect(
      injected.subjects[target]?.context.clipped,
      'the probe is silent about an injected overflow, so its zero counts mean nothing',
    ).toBe(true);
  };

  await readSubjects(1280, 800);
  await controlSeesAnInjectedToken();

  /** Re-read the probe after a style change, once two readings agree (the page does not reload). */
  const reprobe = async (): Promise<ProbeResult> => {
    let previous = '';
    let reading = await overviewPage.evaluate(probeRowSubjects);
    await expect
      .poll(async () => {
        reading = await overviewPage.evaluate(probeRowSubjects);
        const signature = JSON.stringify(reading.subjects.map((x) => x.rowHeight));
        const same = signature === previous;
        previous = signature;
        return same;
      })
      .toBe(true);
    return reading;
  };
  /** A section body is a second scroll axis (SC-6): its content may not be wider than it is. */
  const bodiesOverflowingSideways = (): Promise<string[]> =>
    overviewPage.evaluate(() =>
      [...document.querySelectorAll('main section[aria-labelledby]')]
        .filter((el) => {
          const body = el.lastElementChild;
          return body ? body.scrollWidth > body.clientWidth : false;
        })
        .map(
          (el) =>
            document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
        ),
    );
  /** Within each section, rows stack: every row starts below the previous row's top and clear of it. */
  const rowsThatOverlap = (): Promise<string[]> =>
    overviewPage.evaluate(() => {
      const bad: string[] = [];
      for (const sectionEl of document.querySelectorAll('main section[aria-labelledby]')) {
        let previous: DOMRect | null = null;
        for (const subject of sectionEl.querySelectorAll('[data-row-subject]')) {
          const row = subject.closest('li') ?? subject;
          const rect = row.getBoundingClientRect();
          if (previous && (rect.top <= previous.top || rect.top < previous.bottom - 1)) {
            bad.push((subject.textContent ?? '').trim().slice(0, 40));
          }
          previous = rect;
        }
      }
      return bad;
    });

  // SC-8, WCAG 1.4.12 text spacing: the four values the criterion names, injected as an author
  // stylesheet at the three cells the spec lists. A row that wraps instead of clipping must also not
  // collide with its neighbour once the lines grow.
  for (const [width, height] of [
    [1280, 800],
    [1477, 900],
    [1912, 948],
  ] as const) {
    const at = `${String(width)} x ${String(height)} with text spacing`;
    await readSubjects(width, height);
    const spacing = await overviewPage.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important } p { margin-bottom: 2em !important }',
    });
    const reading = await reprobe();
    expect(reading.found, `${at}: the probe found no row subject`).toBeGreaterThan(0);
    expect(clippedSubjects(reading), `${at}: a name, context or trailing fact is cut off`).toEqual(
      [],
    );
    expect(reading.docOverflowX, `${at}: the page overflows sideways`).toBeLessThanOrEqual(0);
    expect(await bodiesOverflowingSideways(), `${at}: a box body is wider than itself`).toEqual([]);
    expect(await rowsThatOverlap(), `${at}: a row overlaps the one above it`).toEqual([]);
    await spacing.evaluate((el) => (el as Element).remove());
  }

  // SC-6 / SC-9 at 200 % text, applied the way the earlier 200 % block does it (`html { font-size:
  // 200% }`, a labelled proxy for the browser's text-only zoom, which a headless run cannot set).
  // That block runs before any long name exists, so the row-subject claims are made here.
  for (const [width, height] of [
    [1280, 800],
    [1912, 948],
  ] as const) {
    const at = `${String(width)} x ${String(height)} at 200 % text`;
    await readSubjects(width, height);
    await overviewPage.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const reading = await reprobe();
    expect(reading.found, `${at}: the probe found no row subject`).toBeGreaterThan(0);
    expect(clippedSubjects(reading), `${at}: a name, context or trailing fact is cut off`).toEqual(
      [],
    );
    expect(reading.docOverflowX, `${at}: the page overflows sideways`).toBeLessThanOrEqual(0);
    expect(await bodiesOverflowingSideways(), `${at}: a box body is wider than itself`).toEqual([]);
    const trailing = reading.subjects.filter((x) => x.trailing);
    expect(trailing.length, `${at}: no row has a trailing fact to measure`).toBeGreaterThan(0);
    for (const x of trailing) {
      expect(
        x.trailing?.primaryChars,
        `${at}: ${x.text} leaves its name too little room`,
      ).toBeGreaterThanOrEqual(12);
    }
    await overviewPage.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }

  // 320 x 800 is the 1280-at-400 % reflow proxy (WCAG 1.4.10). The "designed for larger screens"
  // notice sits above the landing; it is measured beneath, as M0 did.
  const narrow = await readSubjects(320, 800);
  expect(narrow.found, '320: the probe found no row subject').toBeGreaterThan(0);
  expect(clippedSubjects(narrow), '320: a name, context or trailing fact is cut off').toEqual([]);
  await controlSeesAnInjectedToken();
  const withTrailing = narrow.subjects.filter((x) => x.trailing);
  expect(withTrailing.length, '320: no row has a trailing fact to measure').toBeGreaterThan(0);
  for (const x of withTrailing) {
    // SC-9: the name keeps room — 12 advances of "0" in its own font — and the fact is beneath.
    expect(
      x.trailing?.primaryChars,
      `320: ${x.text} leaves its name too little room`,
    ).toBeGreaterThanOrEqual(12);
    expect(x.trailing?.beneath, `320: ${x.text} keeps its trailing fact beside a 320 px name`).toBe(
      true,
    );
  }

  // The floor: at 1024 x 600 nothing drops, because the narrowest track is wider than 7rem plus the
  // trailing fact.
  const floor = await readSubjects(1024, 600);
  const floorTrailing = floor.subjects.filter((x) => x.trailing);
  expect(floorTrailing.length, '1024: no row has a trailing fact to measure').toBeGreaterThan(0);
  for (const x of floorTrailing) {
    expect(
      x.trailing?.centreInFirstLine,
      `1024: ${x.text} has dropped its trailing fact below the first line`,
    ).toBe(true);
  }
  expect(clippedSubjects(floor), '1024: a name, context or trailing fact is cut off').toEqual([]);
});

test('the settled overview has no accessibility violations', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await openOverview(page, orgSlug);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

/**
 * "Jump back in" (ADR-0098 M3), which only a real browser can prove.
 *
 * Three of its four claims are about `localStorage` and the network, both of which a unit suite
 * replaces: that opening a plan is remembered at all, that the section costs **no extra request**,
 * and that an entry whose plan has gone stops being offered rather than 404ing on click. The
 * fourth — that the store holds no name — is a unit assertion, and it is the reason the third
 * works.
 */
test('the landing offers the plans this browser was recently in', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  const planUrl = page.url();

  // -------------------------------------------------- 1. Opening a plan is remembered
  const requests = await countOverviewRequests(page, async () => {
    await openOverview(page, orgSlug);
  });
  const jumpBackIn = section(page, 'Jump back in');
  await expect(jumpBackIn.getByRole('link', { name: 'Northgate — Phase 1' })).toBeVisible();

  // -------------------------------------------------- 2. …and costs no request of its own
  expect(requests).toBe(1);

  // -------------------------------------------------- 3. A rename is corrected, not cached
  await page.goto(planUrl);
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(planUrl)?.[1];
  expect(planId).toBeDefined();
  await ensurePen(page);
  const renamed = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const current = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      const version = (await current.json()).data.version as number;
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed since', version }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId! },
  );
  if (!renamed.ok) throw new Error(`rename failed: ${renamed.status} ${renamed.body}`);

  await openOverview(page, orgSlug);
  await expect(
    section(page, 'Jump back in').getByRole('link', { name: 'Renamed since' }),
  ).toBeVisible();

  // -------------------------------------------------- 4. A deleted plan disappears, never 404s
  const deleted = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId! },
  );
  if (!deleted.ok) throw new Error(`delete failed: ${deleted.status} ${deleted.body}`);

  await page.goto(`/orgs/${orgSlug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Absent, not present-and-broken, and not an "a plan you had is gone" message — that sentence
  // would name a plan to somebody who may no longer be entitled to know it exists.
  await expect(page.getByRole('region', { name: 'Jump back in' })).toHaveCount(0);
});

/**
 * The wordmark is the route home, and "Overview" has left the nav (ADR-0098 M4 + M5).
 *
 * These land together because they are one change seen from two sides: the item went only after
 * the conventional route home existed. A journey is the only place the pair can be checked at all —
 * the wordmark has to work from a **plan workspace**, which is the screen furthest from the shell's
 * own routes and the one a planner is actually on when they want to get back.
 */
test('the wordmark returns to the overview, and the nav no longer names it', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);

  // -------------------------------------------------- 1. The nav has dropped the item
  const nav = page.getByRole('navigation', { name: 'Organisation' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveCount(0);

  // -------------------------------------------------- 2. …and the wordmark replaces it
  await page.getByRole('link', { name: 'SchedulePoint — organisation overview' }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Overview Co ${stamp}`);

  // -------------------------------------------------- 3. …and says so once you are there
  await expect(
    page.getByRole('link', { name: 'SchedulePoint — organisation overview' }),
  ).toHaveAttribute('aria-current', 'page');
});
