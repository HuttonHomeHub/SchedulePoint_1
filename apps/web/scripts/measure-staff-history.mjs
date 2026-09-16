// M0 of the probe-history rework: what the performance panel's reading history costs the page.
//
// The product owner opened the released console and said the history is "a massive list, with copy
// report on each one", and asked whether the latest report plus a selector would be better. This
// answers the part that is measurable — **how much of the page is that list** — before a line of
// the remedy is built, because this repository has withdrawn seven consecutive height expectations
// on their own measurements (ADR-0091 D4, ADR-0092 M4, ADR-0093, ADR-0113, ADR-0114, ADR-0115,
// ADR-0143 FC-4) and the eighth would not be a surprise.
//
// **Why it could not be read off the last epic's numbers.** ADR-0143's M0 baseline was taken with
// ZERO readings recorded — its own §2 says the panel renders "No readings recorded yet" — so the
// 3,690 px figure contains no sitting block at all. M6's 12,696 px WAS taken over an accumulated
// history and says so in its §4, but it never separated that history from the rest of the page.
// Neither number answers "how tall is the list", which is the only quantity this decision turns on.
//
// **Where it bypasses the product** (ADR-0081): nowhere. It signs in through the real form and
// reads the real `/staff` route. The database is whatever `scripts/e2e-local.sh` has accumulated,
// which is the point — a synthetic history would measure the fixture rather than the complaint.
//
// Run with both dev servers up and the API allow-listing the staff address:
//   node apps/web/scripts/measure-staff-history.mjs > /tmp/m0.md
/* global document, getComputedStyle */
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.STAFF_EMAIL ?? 'ops@schedulepoint.test';
const PASSWORD = process.env.STAFF_PASSWORD ?? 'correct-horse-battery';
// The product owner's own screen, and the width ADR-0091's retrospective established two whole
// epics had never measured at.
const WIDTH = Number(process.env.WIDTH ?? 1646);
const HEIGHT = Number(process.env.VIEWPORT_HEIGHT ?? 1000);

const out = [];
const p = (s = '') => out.push(s);
/**
 * A reading with a known answer, printed beside every result.
 *
 * ADR-0118's M0 caught four instruments lying in one epic and ADR-0119's probe styled the wrong
 * node while returning a number that passed every rule — so a harness that measures the wrong
 * thing has to say so itself rather than produce something plausible.
 */
const ctl = (name, ok, detail) => p(`- CONTROL — ${name}: **${ok ? 'PASS' : 'FAIL'}** (${detail})`);

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

await page.goto(`${BASE}/sign-in`);
await page.getByLabel('Email').fill(EMAIL);
await page.getByLabel('Password').fill(PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30_000 });

await page.goto(`${BASE}/staff`);
await page.getByRole('heading', { name: 'Performance' }).waitFor({ timeout: 30_000 });
// The history is a separate query from the panel's controls; wait for it to settle rather than
// measuring a spinner. A block's heading is the only thing on the page matching this shape.
await page
  .getByRole('heading', { level: 3, name: /^(Sweep of \d+ readings?|One reading) — / })
  .first()
  .waitFor({ timeout: 30_000 });
// The page holds several tables whose rows arrive independently; one animation frame after the
// last of them settles is not enough to trust a height. Wait for the document to stop growing.
await page.waitForFunction(
  () => {
    const h = document.documentElement.scrollHeight;

    return new Promise((resolve) =>
      setTimeout(() => resolve(document.documentElement.scrollHeight === h), 400),
    );
  },
  undefined,
  { timeout: 30_000 },
);

const m = await page.evaluate(() => {
  const round = (n) => Math.round(n * 10) / 10;
  const doc = document.documentElement.scrollHeight;

  // The Performance panel: the card whose own heading is "Performance".
  const perfHeading = [...document.querySelectorAll('h2')].find(
    (h) => h.textContent?.trim() === 'Performance',
  );
  const perfCard = perfHeading?.closest('section') ?? null;

  // Every sitting block, located by its own `<h3>` rather than by a class — a class is a styling
  // decision and would silently stop matching; the heading is the thing the reader sees.
  const blockHeadings = [...document.querySelectorAll('h3')].filter((h) =>
    /^(Sweep of \d+ readings?|One reading) — /.test(h.textContent?.trim() ?? ''),
  );
  const blocks = blockHeadings.map((h) => h.closest('section')).filter(Boolean);
  const blockHeights = blocks.map((b) => round(b.getBoundingClientRect().height));

  // The list's own container, so the gaps between blocks are counted too.
  //
  // **`[data-probe-history-list]` and the block's parent are the SAME node**, before and after the
  // index landed: the attribute was put exactly where the `div.space-y-8` that held the blocks was,
  // which is what makes the before and after figures comparable at all. The parent is kept as the
  // fallback so this harness still reads a build that predates the attribute, and the result says
  // which one it used rather than leaving the reader to assume.
  const marked = document.querySelector('[data-probe-history-list]');
  const list = marked ?? blocks[0]?.parentElement ?? null;
  const listSource = marked ? 'data-probe-history-list' : 'first block’s parent';

  // Every sitting NAMED on the page, however it is rendered — the expanded block's heading plus
  // the index's rows. This is the quantity FC-B is about, and it is deliberately not the block
  // count: a dropdown would leave the block count at 1 and this at 1 too, which is the failure.
  const indexTable = [...document.querySelectorAll('table')].find((t) =>
    /Every sitting/.test(t.querySelector('caption')?.textContent ?? ''),
  );
  const namedSittings =
    (indexTable ? indexTable.querySelectorAll('tbody tr').length : 0) || blockHeadings.length;

  const copyButtons = [...document.querySelectorAll('button')].filter(
    (b) => b.textContent?.trim() === 'Copy report',
  ).length;

  const tables = [...document.querySelectorAll('table')];
  const widest = tables.length
    ? round(Math.max(...tables.map((t) => t.getBoundingClientRect().width)))
    : null;

  return {
    doc,
    perfCard: perfCard ? round(perfCard.getBoundingClientRect().height) : null,
    list: list ? round(list.getBoundingClientRect().height) : null,
    listSource,
    namedSittings,
    indexRows: indexTable ? indexTable.querySelectorAll('tbody tr').length : 0,
    listGap: list ? getComputedStyle(list).rowGap : null,
    blocks: blockHeights,
    copyButtons,
    widestTable: widest,
    // Every `<h2>` on the page: the panel roster, so "the list is N % of the page" can be checked
    // against something other than itself.
    panels: [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
  };
});

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sorted = [...m.blocks].sort((a, b) => a - b);
const median = sorted.length
  ? sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  : null;

p(`# M0 — what the reading history costs the staff console`);
p();
p(`**Taken:** ${new Date().toISOString()}, Chromium, ${WIDTH} × ${HEIGHT}, local e2e database.`);
p();
p(`| quantity | measured |`);
p(`| --- | ---: |`);
p(`| Document height | **${m.doc} px** |`);
p(`| …in viewport heights (${HEIGHT}) | **${(m.doc / HEIGHT).toFixed(1)} screens** |`);
p(`| Performance panel, whole card | **${m.perfCard} px** |`);
p(`| The sittings list alone | **${m.list} px** |`);
p(`| …as a share of the document | **${((m.list / m.doc) * 100).toFixed(1)} %** |`);
p(`| Sitting blocks expanded | **${m.blocks.length}** |`);
p(`| Sittings named on the page | **${m.namedSittings}** |`);
p(`| Index rows | ${m.indexRows} |`);
p(`| "Copy report" buttons | **${m.copyButtons}** |`);
p(`| Block height — min / median / max | ${sorted[0]} / ${median} / ${sorted.at(-1)} px |`);
p(`| Sum of block heights | ${round1(sum(m.blocks))} px |`);
p(`| Gap between blocks | ${m.listGap} |`);
p(`| Widest table | ${m.widestTable} px |`);
p(`| List located by | \`${m.listSource}\` |`);
p(`| Panels on the page | ${m.panels.length} — ${m.panels.join(', ')} |`);
p();
p(`## Controls`);
p();
ctl(
  'the list was located, not guessed',
  m.blocks.length > 0 && m.list !== null,
  `${m.blocks.length} blocks inside a ${m.list} px container`,
);
ctl(
  'one Copy button per expanded block',
  m.copyButtons === m.blocks.length,
  `${m.copyButtons} buttons, ${m.blocks.length} expanded — the complaint was one per report`,
);
ctl(
  'every sitting is still named, with nothing opened',
  m.namedSittings >= m.blocks.length,
  `${m.namedSittings} named, ${m.blocks.length} expanded — a dropdown would name ${m.blocks.length}`,
);
ctl(
  'blocks fit inside the container they were measured in',
  m.list !== null && sum(m.blocks) <= m.list + 1,
  `Σblocks ${round1(sum(m.blocks))} px ≤ list ${m.list} px`,
);
ctl(
  'the list fits inside the panel',
  m.perfCard !== null && m.list <= m.perfCard,
  `list ${m.list} px ≤ card ${m.perfCard} px`,
);
ctl(
  'the page is the post-ADR-0143 two-column screen',
  m.widestTable !== null && m.widestTable > 1000,
  `widest table ${m.widestTable} px — the one-column screen measured 798`,
);

function round1(n) {
  return Math.round(n * 10) / 10;
}

console.log(out.join('\n'));
await browser.close();
