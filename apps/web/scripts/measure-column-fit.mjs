/**
 * M0-T4 for the page-composition epic: does any table cell WRAP, and how much slack sits beside it?
 *
 * **Why this is a separate instrument from `measure-page-drift.mjs`.** That harness answers "how
 * far apart are a row's facts?" and it answered it correctly — `docs/specs/page-consistency/`
 * records it driving the fixed column caps that page-consistency M4-T2 added, with real numbers
 * (−34, −122, −65, −65px of `factSpread`). The caps did what the measurement asked of them. What
 * nothing asked was whether the content still rendered on ONE LINE inside the cap, and it does not:
 * `md:w-44` is 176px and `"Mon, Tue, Wed, Thu, Fri, Sat"` does not fit in it, so the product owner's
 * screenshot shows that cell broken over two lines while ~500px of the row sits empty.
 *
 * That is the lesson this file exists to carry: **`factSpread` and `fits` are different quantities,
 * and optimising the first without watching the second is how the remedy became the defect.** A
 * distance can always be shortened by making a column narrower. Whether the words still fit is a
 * separate question, and until now nothing in this repository could ask it.
 *
 * **It carries a pinned positive case and refuses a verdict without one** (ADR-0093, ADR-0108): a
 * probe that selects nothing reports zero wraps, which is indistinguishable from a product with no
 * wraps. On today's tree it MUST find the two known wraps — Calendars `Working days` and Resources
 * `Code` — and it exits non-zero if it does not. A probe that cannot see today's defect cannot
 * judge tomorrow's fix, so its own red run is committed beside it as its proof.
 *
 * Usage (after `pnpm --filter @repo/web shoot` has created a tenant):
 *
 *   SLUG=shoot-co-<stamp>-<width> WIDTH=1646 node scripts/measure-column-fit.mjs
 *
 * `EXPECT_KNOWN_WRAPS=0` turns the pinned case off. It exists for exactly one caller — the run
 * AFTER the column model lands, where the two known wraps are supposed to be gone and their absence
 * is the result rather than a broken instrument.
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { globSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTH = Number(process.env.WIDTH ?? '1646');
const SLUG = process.env.SLUG;
if (!SLUG) throw new Error('SLUG is required — pass the org slug the shoot harness created');

const EXPECT_KNOWN_WRAPS = process.env.EXPECT_KNOWN_WRAPS !== '0';

/**
 * The known wraps, as `[screen, column]`. This is the instrument's own control, so it is written
 * here rather than derived: a control derived from the same code it is controlling agrees with
 * itself (ADR-0120's A9, whose two sides shared one blind spot and therefore could not disagree).
 */
const KNOWN_WRAPS = [
  ['calendars', 'Working days'],
  ['resources', 'Code'],
];

const PAGES = [
  ['org-home', (slug) => `/orgs/${slug}`],
  ['clients', (slug) => `/orgs/${slug}/clients`],
  ['client-detail', (slug, ids) => `/orgs/${slug}/clients/${ids.clientId}`],
  ['project-detail', (slug, ids) => `/orgs/${slug}/projects/${ids.projectId}`],
  ['calendars', (slug) => `/orgs/${slug}/calendars`],
  ['resources', (slug) => `/orgs/${slug}/resources`],
  ['members', (slug) => `/orgs/${slug}/members`],
  ['audit-log', (slug) => `/orgs/${slug}/audit-log`],
  ['recently-deleted', (slug) => `/orgs/${slug}/recently-deleted`],
  ['my-activity', () => `/me/activity`],
];

/* eslint-disable no-undef */
const probe = () => {
  /**
   * **Does this cell render on more lines than its content needs?**
   *
   * The first version of this counted `Range.getClientRects()` line boxes, and its own pinned case
   * caught it: it reported `Actions` containing the single word `Edit` as two lines, and `Name`
   * containing `Standard` as two. Both are correct rect counts and both are the wrong question — a
   * cell holding two stacked elements, or a button beside a `⋯` trigger whose boxes round to
   * different tops, has two line boxes and wraps nothing. De-duplicating by rounded `top` did not
   * save it, because those siblings genuinely sit at different tops.
   *
   * So the question is asked directly instead: clone the cell at its own rendered width, measure
   * its height, then force `white-space: nowrap` through the whole subtree and measure again. If
   * the cell gets SHORTER when nothing is allowed to wrap, it was wrapping. A cell whose height is
   * set by stacked siblings is unchanged by that and reports nothing, which is the discrimination
   * the rect count could not make.
   */
  const wrapHeight = (el) => {
    const width = el.getBoundingClientRect().width;
    const cs = getComputedStyle(el);
    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'absolute',
      left: '-99999px',
      top: '0',
      width: `${width}px`,
      font: cs.font,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
    });
    const clone = el.cloneNode(true);
    /**
     * **The padding is KEPT, and this is the fix for a one-pixel lie.**
     *
     * The first version zeroed the clone's padding while sizing the host to the cell's full
     * border-box width, so the content was offered 176px in the probe where the real cell offers
     * 160 (`pr-4` is 16px). `Working days` needs 175px: it wraps in the product and fitted in the
     * probe, by one pixel, and the run reported zero findings on the very column the epic was
     * opened on. Keeping the padding and making the clone `border-box` measures the space the
     * content actually gets.
     */
    clone.style.boxSizing = 'border-box';
    clone.style.width = '100%';
    host.appendChild(clone);
    document.body.appendChild(host);
    const wrapped = host.getBoundingClientRect().height;
    for (const node of [clone, ...clone.querySelectorAll('*')]) node.style.whiteSpace = 'nowrap';
    const nowrap = host.getBoundingClientRect().height;
    host.remove();
    return { wrapped: Math.round(wrapped), nowrap: Math.round(nowrap) };
  };

  /**
   * The width the content WANTS, measured by asking the browser rather than by summing glyphs.
   * A Range around the cell's contents reports the union of its line boxes, which is the wrapped
   * width — useless here. So the cell is cloned into an absolutely-positioned, `max-content` box
   * carrying the same computed font, and measured there.
   */
  const naturalWidth = (el) => {
    const probeEl = el.cloneNode(true);
    const cs = getComputedStyle(el);
    Object.assign(probeEl.style, {
      position: 'absolute',
      left: '-99999px',
      top: '0',
      width: 'max-content',
      maxWidth: 'none',
      whiteSpace: 'nowrap',
      font: cs.font,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      // Padding is KEPT so `natural` is a border-box number directly comparable with `used`, which
      // is a `getBoundingClientRect().width`. Zeroing it made every `slack` overstate by the
      // cell's horizontal padding — 16px on every column here, which is the difference between
      // "this column has 1px to spare" and "this column is 15px short and wraps".
      boxSizing: 'border-box',
    });
    document.body.appendChild(probeEl);
    const w = Math.ceil(probeEl.getBoundingClientRect().width);
    probeEl.remove();
    return w;
  };

  return [...document.querySelectorAll('table')].map((t, tableIndex) => {
    const heads = [...t.querySelectorAll('thead th')];
    const bodyRows = [...t.querySelectorAll('tbody tr')];
    const tableBox = t.getBoundingClientRect();

    const columns = heads.map((th, i) => {
      const cells = bodyRows
        .map((tr) => tr.querySelectorAll('td')[i])
        .filter(Boolean)
        // A cell spanning the row (an expanded child, an empty state) is not this column.
        .filter((td) => (td.getAttribute('colspan') ?? '1') === '1');

      let wrapped = 0;
      let worstExtraPx = 0;
      let worstText = '';
      let natural = naturalWidth(th);
      for (const td of cells) {
        const h = wrapHeight(td);
        // 1px of tolerance: sub-pixel line-height rounding, not a wrap.
        if (h.wrapped > h.nowrap + 1) {
          wrapped += 1;
          const extra = h.wrapped - h.nowrap;
          if (extra > worstExtraPx) {
            worstExtraPx = extra;
            worstText = td.textContent.trim().slice(0, 48);
          }
        }
        natural = Math.max(natural, naturalWidth(td));
      }

      const used = Math.round(th.getBoundingClientRect().width);
      return {
        header: th.textContent.trim().slice(0, 28) || '(unnamed)',
        used,
        natural,
        // Positive: the column is wider than its content needs. Negative: it is too narrow, which
        // is the condition that produces a wrap.
        slack: used - natural,
        cells: cells.length,
        wrappedCells: wrapped,
        worstExtraPx,
        worstText,
        // The cap, if one is declared — read off the class list so the finding names the thing to
        // change rather than leaving a reader to grep for it.
        widthClass:
          [...th.classList, ...(cells[0] ? [...cells[0].classList] : [])]
            .filter((c) => /^(sm|md|lg|xl|2xl):w-/.test(c) || /^w-\d/.test(c))
            .join(' ') || null,
      };
    });

    return {
      tableIndex,
      caption: (t.querySelector('caption')?.textContent ?? '').trim().slice(0, 40) || null,
      tableWidth: Math.round(tableBox.width),
      rows: bodyRows.length,
      // The width the table would need for every column to sit on one line.
      naturalTotal: columns.reduce((a, c) => a + c.natural, 0),
      columns,
    };
  });
};
/* eslint-enable no-undef */

const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!executablePath) throw new Error('No Chromium under /opt/pw-browsers');
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await ctx.newPage();

const EMAIL = process.env.EMAIL ?? `${SLUG.replace('shoot-co-', 'shoot-')}@example.com`;
await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill('correct-horse-battery');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/orgs\//, { timeout: 20000 });

await page.goto(`${BASE}/orgs/${SLUG}/clients`);
await page.waitForLoadState('networkidle');
const clientHref = await page
  .locator(`a[href*="/orgs/${SLUG}/clients/"]`)
  .first()
  .getAttribute('href');
if (!clientHref) throw new Error('No client row to follow — seed the fixture first');
const clientId = clientHref.split('/').pop();
await page.goto(`${BASE}${clientHref}`);
await page.waitForLoadState('networkidle');
const projectHref = await page
  .locator(`a[href*="/orgs/${SLUG}/projects/"]`)
  .first()
  .getAttribute('href');
if (!projectHref) throw new Error(`Client ${clientId} has no project to follow`);
const ids = { clientId, projectId: projectHref.split('/').pop() };

const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
const out = { run: { sha, width: WIDTH, slug: SLUG, takenAt: new Date().toISOString(), ids } };
for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path(SLUG, ids)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  out[name] = await page.evaluate(probe);
}
await browser.close();

/**
 * The findings, flattened: every column with at least one wrapped cell.
 */
const findings = [];
for (const [name] of PAGES) {
  for (const table of out[name] ?? []) {
    for (const col of table.columns) {
      if (col.wrappedCells > 0) {
        findings.push({ screen: name, ...col, tableIndex: table.tableIndex });
      }
    }
  }
}
out.findings = findings;

/**
 * Total slack per screen: how much width the row is NOT using. Reported beside the wraps, because
 * "a cell wrapped" and "a cell wrapped while 500px sat empty" are different facts and only the
 * second one is this epic's subject.
 */
out.slackByScreen = Object.fromEntries(
  PAGES.map(([name]) => [
    name,
    (out[name] ?? []).map((t) => ({
      tableWidth: t.tableWidth,
      naturalTotal: t.naturalTotal,
      slack: t.tableWidth - t.naturalTotal,
    })),
  ]),
);

console.log(JSON.stringify(out, null, 1));

if (EXPECT_KNOWN_WRAPS) {
  const missing = KNOWN_WRAPS.filter(
    ([screen, header]) => !findings.some((f) => f.screen === screen && f.header === header),
  );
  if (missing.length > 0) {
    console.error(
      `\nPINNED CASE FAILED: this probe did not report the known wraps ` +
        `${missing.map(([s, h]) => `${s}/${h}`).join(', ')}.\n` +
        `A probe that cannot see today's defect cannot judge tomorrow's fix. Either the ` +
        `instrument is broken or the defect is already gone — establish which before trusting ` +
        `any number above. Set EXPECT_KNOWN_WRAPS=0 only when the column model has landed and ` +
        `their absence is the RESULT.`,
    );
    process.exitCode = 1;
  } else {
    console.error(`\nPinned case OK: both known wraps reported (${findings.length} findings).`);
  }
}
