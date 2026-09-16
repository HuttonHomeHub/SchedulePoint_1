/**
 * M8 of the organisation landing (docs/specs/organisation-landing-portfolio/).
 *
 * The product owner asked for three things about the released landing: tighten the rows to carry
 * more without hurting readability, cap each box so it does not grow without bound as the app
 * does, and — the load-bearing one — **not have to scroll the main window**.
 *
 * Only the first of those is a judgement call. The other two are arithmetic, and this repository
 * has been wrong about exactly this arithmetic on exactly this kind of screen enough times that
 * ADR-0142 D4 now says a remedy is measured before it is built. So before any of it is designed:
 * what does a row actually cost, what height is there to spend, and at what viewport height does
 * "give each box a quarter of the screen" stop being better than page scroll?
 *
 * Reports, all in ONE sitting against ONE fixture so the figures are comparable with each other:
 *   D1  the chrome above the grid, and the height left for it, per viewport height
 *   D2  each box's anatomy — card padding, heading block, and every row's own height
 *   D3  rows that fit in a box's share, per viewport height (the "how many is 4?" question)
 *   D4  the floor: the viewport height below which a box's share holds fewer than two rows
 *
 * **It measures the SHIPPED screen** — nothing here is behind a flag and no code is changed — so
 * every figure is a baseline a later run can be compared against.
 *
 * Run with both dev servers up and DATABASE_URL pointing at the database the API is serving:
 *   DATABASE_URL=postgresql://app:app@localhost:5432/app_test?schema=public \
 *   node apps/web/scripts/measure-landing-density.mjs > /tmp/m8.md
 */
/* global document, window, getComputedStyle */
import { chromium } from '@playwright/test';

import { assertLandingStates, expireInvitation, seedLandingStates } from './landing-fixture.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
// 1646 is the product owner's Surface Pro and the width every verdict on this screen is taken at;
// 1920 is the monitor the two-column question was raised about. Both, because the row count a box
// can hold is a function of HEIGHT and the row's own height is a function of WIDTH — a narrower
// column wraps a sentence onto a second line, so measuring one width would answer for neither.
const WIDTHS = [1646, 1920];
// The heights are real windows rather than round numbers: 1000 is FC-1's frame, 1080 and 1200 are
// the two commonest desktop panel heights less browser chrome, and 800 / 700 are a laptop at 768p
// and a short window — the region where the whole idea is expected to stop working.
const HEIGHTS = [1200, 1080, 1000, 900, 800, 700];
const tag = String(Date.now());
const out = [];
const p = (s = '') => out.push(s);

async function onboard(page) {
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`m8-density-${tag}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  const orgName = `M8 Density ${tag}`;
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  return { slug: new URL(page.url()).pathname.split('/')[2], orgName };
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: HEIGHTS[2] } });
const page = await context.newPage();

const { slug, orgName } = await onboard(page);
const ids = await seedLandingStates(page, slug);
expireInvitation(ids.expiredInvite);
const control = assertLandingStates(ids);

// Q1's store is per-user and empty on a fresh account, so "Jump back in" would measure as a box
// with no rows at all — the one section whose row cost this exists to establish. Opening four
// plans is what makes it describe the screen a returning user sees.
for (const id of [ids.late, ids.onPlan, ids.stale, ids.never]) {
  await page.goto(`${BASE}/orgs/${slug}/plans/${id}`);
  await page.waitForLoadState('networkidle');
}

await page.goto(`${BASE}/orgs/${slug}`);
await page.getByRole('heading', { level: 1 }).waitFor();
await page.waitForLoadState('networkidle');

const h1 = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim() ?? '';
if (h1 !== orgName) {
  throw new Error(
    `The harness never reached the organisation landing: <h1> is ${JSON.stringify(h1)}, expected ${JSON.stringify(orgName)}. Every figure below would have been about another screen.`,
  );
}

const build =
  (
    await page
      .locator('text=/^web \\d+\\.\\d+\\.\\d+ · api \\d+\\.\\d+\\.\\d+$/')
      .first()
      .textContent()
      .catch(() => null)
  )?.trim() ?? 'UNREAD';

/**
 * One box's anatomy, read from the DOM rather than from the stylesheet.
 *
 * A row here is a direct child of the element holding them, which is how `SectionCard` renders a
 * list — asking for a class name would bind this to a styling detail, and asking for `listitem`
 * would miss "Needs your attention", whose items are not a list.
 */
async function anatomy() {
  return page.evaluate(() => {
    const regions = [...document.querySelectorAll('[role="region"], section')];
    return regions
      .map((region) => {
        const heading = region.querySelector('h2, h3');
        const name = heading?.textContent?.trim() ?? '(unnamed)';
        const box = region.getBoundingClientRect();
        // The row container is the descendant with the MOST children that are each a plausible
        // row. Picking the FIRST such element instead — which is what this did on its first run —
        // selects the card itself, whose two children are the heading block and the body, and
        // reports a two-row box of ~60 and ~750 px. That number is wrong and looks entirely
        // reasonable, which is the failure this harness exists to avoid rather than commit.
        const candidates = [...region.querySelectorAll('*')]
          .map((el) => ({
            el,
            kids: [...el.children].filter((k) => k.getBoundingClientRect().height > 24),
          }))
          .filter(
            ({ el, kids }) =>
              el !== region && kids.length >= 2 && kids.length === el.children.length,
          );
        candidates.sort((a, b) => b.kids.length - a.kids.length);
        const rowParent = candidates[0];
        const rows = rowParent
          ? rowParent.kids.map((k) => Math.round(k.getBoundingClientRect().height))
          : [];
        const firstRowTop = rowParent ? rowParent.el.getBoundingClientRect().top : box.bottom;
        const style = getComputedStyle(region);
        return {
          name,
          boxHeight: Math.round(box.height),
          boxTop: Math.round(box.top + window.scrollY),
          headingBlock: Math.round(firstRowTop - box.top),
          padTop: Math.round(parseFloat(style.paddingTop) || 0),
          padBottom: Math.round(parseFloat(style.paddingBottom) || 0),
          rows,
        };
      })
      .filter((r) => r.name !== '(unnamed)');
  });
}

/** The y of the first box's top — everything above it is chrome the grid never gets. */
async function chromeAbove() {
  return page.evaluate(() => {
    const regions = [...document.querySelectorAll('[role="region"], section')].filter((r) =>
      r.querySelector('h2, h3'),
    );
    const tops = regions.map((r) => r.getBoundingClientRect().top + window.scrollY);
    return Math.round(Math.min(...tops));
  });
}

/** Total document height, to state what the page scroll currently costs. */
async function pageHeight() {
  return page.evaluate(() => Math.round(document.documentElement.scrollHeight));
}

p('# M8 — what a landing row costs, and what height there is to spend');
p();
p(`- **Taken:** ${new Date().toISOString()}`);
p(`- **Build:** \`${build}\` (read off the shell footer, not assumed)`);
p(`- **Organisation:** \`${slug}\`, seeded by \`landing-fixture.mjs\``);
p(
  `- **Non-vacuity control:** PASS, ${String(control.checked)} states asserted positively before any measurement`,
);
p();
p(
  '> Measured against the **shipped** screen — no flag, no code change — so these are a baseline a',
);
p('> later run can be compared against.');
p();

/**
 * D0 — WHICH element scrolls.
 *
 * The first run reported a document height of exactly the viewport height, which is not what a
 * 1451 px page does. The app shell is a fixed-height layout with an internal scroll region, so
 * "the main window scrolls" is already false — what scrolls is the workspace. That distinction
 * decides where a height cap has to be applied, so it is established here rather than assumed.
 */
const scrollChain = await page.evaluate(() => {
  const region = [...document.querySelectorAll('[role="region"], section')].find((r) =>
    r.querySelector('h2, h3'),
  );
  const chain = [];
  let el = region;
  while (el && el !== document.documentElement) {
    const s = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 60),
      display: s.display,
      overflowY: s.overflowY,
      clientH: el.clientHeight,
      scrollH: el.scrollHeight,
      scrolls: el.scrollHeight > el.clientHeight + 1,
    });
    el = el.parentElement;
  }
  return {
    docScrollH: document.documentElement.scrollHeight,
    docClientH: document.documentElement.clientHeight,
    chain,
  };
});

p('## D0 — which element actually scrolls');
p();
p(
  `Document: scrollHeight **${String(scrollChain.docScrollH)}**, clientHeight **${String(scrollChain.docClientH)}** — ` +
    (scrollChain.docScrollH > scrollChain.docClientH + 1
      ? 'the page itself scrolls.'
      : '**the page does not scroll at all.**'),
);
p();
p('| Ancestor | display | overflow-y | client | scroll | scrolls? |');
p('| -------- | ------- | ---------- | -----: | -----: | -------- |');
for (const a of scrollChain.chain) {
  p(
    `| \`${a.tag}.${a.cls}\` | ${a.display} | ${a.overflowY} | ${String(a.clientH)} | ${String(a.scrollH)} | ${a.scrolls ? '**yes**' : 'no'} |`,
  );
}
p();

const byWidth = {};

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: HEIGHTS[2] });
  await page.waitForTimeout(400);
  const boxes = await anatomy();
  const chrome = await chromeAbove();
  const docHeight = await pageHeight();
  byWidth[width] = { boxes, chrome, docHeight };

  p(`## D2 — box anatomy at ${String(width)} wide`);
  p();
  p('| Box | box height | heading block | rows | row heights |');
  p('| --- | ---------: | ------------: | ---: | ----------- |');
  for (const b of boxes) {
    p(
      `| ${b.name} | ${String(b.boxHeight)} | ${String(b.headingBlock)} | ${String(b.rows.length)} | ${b.rows.join(', ') || '—'} |`,
    );
  }
  p();
  const allRows = boxes.flatMap((b) => b.rows);
  if (allRows.length > 0) {
    const sorted = [...allRows].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    p(
      `Rows across all boxes: **min ${String(sorted[0])}, median ${String(median)}, max ${String(sorted[sorted.length - 1])}** px.`,
    );
  }
  p();
  p(
    `Chrome above the first box: **${String(chrome)} px**. Document height: **${String(docHeight)} px**.`,
  );
  p();
}

/**
 * D3/D4 — what a box's share holds, per viewport height.
 *
 * The grid is two rows of two, so a box's share is (viewport − chrome − the gap between grid rows)
 * halved. `GRID_GAP` is read rather than assumed: it is the same `gap-6` token `PageGrid` applies,
 * and hard-coding 24 here would be a second copy of a value the stylesheet owns.
 */
const GRID_GAP = await page.evaluate(() => {
  // The grid that CONTAINS the boxes, not the first grid on the page. The first version asked for
  // "any grid with three children" and found something else entirely, reporting a 0 px gap for a
  // `gap-6` grid — a plausible-looking number about the wrong element, which would have made every
  // "what fits" row below wrong by 24 px in the optimistic direction.
  const region = [...document.querySelectorAll('[role="region"], section')].find((r) =>
    r.querySelector('h2, h3'),
  );
  let el = region?.parentElement ?? null;
  while (el) {
    const s = getComputedStyle(el);
    if (s.display === 'grid') return Math.round(parseFloat(s.rowGap) || 0);
    el = el.parentElement;
  }
  return 0;
});

p('## D1 / D3 / D4 — what fits, per viewport height');
p();
p(`Grid row gap, read from the live grid: **${String(GRID_GAP)} px**.`);
p();

for (const width of WIDTHS) {
  const { boxes, chrome } = byWidth[width];
  const headingBlock = Math.max(...boxes.map((b) => b.headingBlock));
  const rowsAll = boxes.flatMap((b) => b.rows).sort((a, b) => a - b);
  const median = rowsAll[Math.floor(rowsAll.length / 2)];
  const tallest = rowsAll[rowsAll.length - 1];

  p(`### At ${String(width)} wide`);
  p();
  p(
    `Worst heading block **${String(headingBlock)} px**; median row **${String(median)} px**; tallest row **${String(tallest)} px**.`,
  );
  p();
  p(
    '| Viewport height | grid gets | each box | body after heading | rows @ median | rows @ tallest |',
  );
  p(
    '| --------------: | --------: | -------: | -----------------: | ------------: | -------------: |',
  );
  for (const h of HEIGHTS) {
    const grid = h - chrome - GRID_GAP;
    const box = Math.floor(grid / 2);
    const body = box - headingBlock;
    const atMedian = Math.floor(body / median);
    const atTallest = Math.floor(body / tallest);
    p(
      `| ${String(h)} | ${String(grid)} | ${String(box)} | ${String(body)} | **${String(Math.max(atMedian, 0))}** | ${String(Math.max(atTallest, 0))} |`,
    );
  }
  p();
}

p('## What this does not establish');
p();
p(
  '- **The rows are the shipped ones.** Tightening them changes every figure in D3, which is why the',
);
p('  tightening is a separate question and has to be settled first.');
p('- **One fixture, one set of states.** A row wraps differently for a long plan name or a long');
p('  client name, and the tallest row here is the tallest this fixture produces, not the tallest.');
p('- **Nothing here measures readability**, which is the half of the request that is a judgement');
p('  rather than an arithmetic.');

console.log(out.join('\n'));

await browser.close();
