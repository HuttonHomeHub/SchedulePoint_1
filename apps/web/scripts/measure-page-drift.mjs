/**
 * M0 for the per-page scope: measure the DRIFT between the non-canvas screens, rendered.
 *
 * The source tells you which component a screen reaches for. It does not tell you that one
 * heading sits 10px higher than its neighbour's, that a row's first and last fact are 1,090px
 * apart, or that a page is 2% full. Those are the things a planner sees, and this repository's
 * record (ADR-0099, ADR-0143) is that the screens were argued from source and band heights for
 * months and settled the first time somebody rendered them.
 *
 * Reuses the shoot harness's own sign-up + seed so it measures the SAME fixture the pictures show;
 * a second fixture drifts and the drift is invisible (ADR-0065, ADR-0121).
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { globSync } from 'node:fs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const WIDTH = Number(process.env.WIDTH ?? '1646');
const SLUG = process.env.SLUG;
if (!SLUG) throw new Error('SLUG is required — pass the org slug the shoot harness created');

/**
 * **The nine in-scope screens, plus `account` labelled as what it is.**
 *
 * This list was wrong on its first run and the correction is the reason it now carries a comment.
 * It measured `account` — a **declared exception** to the page frame
 * (`page-container.structural.test.ts`) and therefore deliberately different — while OMITTING
 * `client-detail` and `project-detail`, which are in scope, carry four of the ten hand-rolled
 * `<h1>` sites and two of the three `<h2>` sites, and are the only two that sit under
 * `Breadcrumbs`. So every "three h1 rhythms across eight screens" statement taken from the first
 * run was about the wrong eight.
 *
 * `account` is **kept and labelled** rather than dropped: a measurement of what is deliberately
 * different is worth having, and dropping it would make the exception invisible to the instrument
 * that exists to see differences.
 *
 * The two detail screens resolve their ids at run time by following the links the list screens
 * render, rather than taking them as environment variables — two values that have to agree and
 * are written down twice is how they stop agreeing (the rule this file already applies to EMAIL).
 */
const PAGES = [
  ['clients', (slug) => `/orgs/${slug}/clients`],
  ['client-detail', (slug, ids) => `/orgs/${slug}/clients/${ids.clientId}`],
  ['project-detail', (slug, ids) => `/orgs/${slug}/projects/${ids.projectId}`],
  ['calendars', (slug) => `/orgs/${slug}/calendars`],
  ['resources', (slug) => `/orgs/${slug}/resources`],
  ['members', (slug) => `/orgs/${slug}/members`],
  ['audit-log', (slug) => `/orgs/${slug}/audit-log`],
  ['recently-deleted', (slug) => `/orgs/${slug}/recently-deleted`],
  ['my-activity', () => `/me/activity`],
  // Out of scope, measured as the control: a declared exception to the frame gate.
  ['account (declared exception)', () => `/account`],
];

/*
 * **This function is serialised and runs INSIDE the browser**, so `document`, `window` and
 * `getComputedStyle` are the page's globals rather than Node's. The lint config's browser block
 * covers `public/**` only (ADR-0074's theme boot), and this file is a Node script that happens to
 * carry one browser-context function, so the disable is scoped to exactly that function rather
 * than to the file — the Node half above and below it keeps `no-undef`.
 */
/* eslint-disable no-undef */
const probe = () => {
  const main = document.querySelector('main');
  const r = (el) => (el ? el.getBoundingClientRect() : null);
  const h1 = document.querySelector('h1');
  const h1r = r(h1);

  // The page frame: whichever element carries the measure cap.
  const frame = [...document.querySelectorAll('main div')].find((d) => {
    const cs = getComputedStyle(d);
    return (
      cs.maxWidth !== 'none' &&
      parseFloat(cs.maxWidth) > 400 &&
      d.getBoundingClientRect().width > 400
    );
  });

  // A page-level description: the first paragraph that is a sibling-ish of the h1, before any table.
  const firstTable = document.querySelector('table');
  const paras = [...document.querySelectorAll('main p')].filter((p) => {
    if (!p.textContent.trim()) return false;
    if (firstTable && p.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_PRECEDING)
      return false;
    return true;
  });

  const tables = [...document.querySelectorAll('table')].map((t) => {
    // Natural width is what ADR-0143 M5 used to tell a table that is genuinely wide from one that
    // is merely spread: a column rendered at 300px whose content wants 90px is slack, and a column
    // rendered at 300px whose content wants 290px is the table.
    const naturalOf = (col) => {
      const cells = [...t.querySelectorAll('tbody tr')]
        .slice(0, 40)
        .map((tr) => tr.querySelectorAll('td')[col])
        .filter(Boolean);
      const head = t.querySelectorAll('thead th')[col];
      let widest = 0;
      for (const el of [head, ...cells]) {
        if (!el) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        widest = Math.max(widest, Math.ceil(range.getBoundingClientRect().width));
      }
      return widest;
    };
    const heads = [...t.querySelectorAll('thead th')].map((th, i) => ({
      text: th.textContent.trim().slice(0, 24),
      x: Math.round(th.getBoundingClientRect().left),
      w: Math.round(th.getBoundingClientRect().width),
      natural: naturalOf(i),
    }));
    const rows = [...t.querySelectorAll('tbody tr')];
    const first = rows[0];
    const cells = first
      ? [...first.querySelectorAll('td')].map((td) => Math.round(td.getBoundingClientRect().left))
      : [];
    const heights = rows.slice(0, 6).map((tr) => Math.round(tr.getBoundingClientRect().height));
    // What a row offers as actions, by accessible role.
    const actions = first
      ? [...first.querySelectorAll('button,a')].map((el) =>
          (el.textContent.trim() || el.getAttribute('aria-label') || '?').slice(0, 18),
        )
      : [];
    /**
     * **`factSpread` exists because `lastCellX` was measuring the wrong thing**, and the arithmetic
     * proves it rather than suggesting it: on every table here, `lastCellX − firstCellX` equals the
     * table's width minus its last column's width, exactly. The last column is `Actions`, so the
     * number was reporting **where the actions column starts** — not how far a reader's eye travels
     * between a row's first fact and its last, which is what M0-T2's attribution was about and what
     * a remedy would be aimed at.
     *
     * It matters because the two move in opposite directions. Page-consistency M4 replaced three
     * text buttons with one `⋯`, which narrows `Actions` and therefore **grows** `lastCellX −
     * firstCellX` by up to 196 px — while the facts themselves did not move at all.
     *
     * `factSpread` measures to the last **content** cell instead. Both are reported, because the
     * old number is what the M0 baseline holds and a comparison needs it.
     */
    const factIndex = heads.findIndex((h) => h.text === 'Actions');
    const lastFact = factIndex > 0 ? (cells[factIndex - 1] ?? null) : (cells.at(-1) ?? null);

    return {
      rows: rows.length,
      headers: heads,
      rowHeights: heights,
      firstCellX: cells[0] ?? null,
      lastCellX: cells.length ? cells[cells.length - 1] : null,
      lastFactX: lastFact,
      factSpread: lastFact !== null && cells[0] !== undefined ? lastFact - cells[0] : null,
      actions,
    };
  });

  // Sections built from the archetype render a <section> with an accessible name (ADR-0098).
  const sections = [...document.querySelectorAll('main section')].map((s) => ({
    name: (s.getAttribute('aria-label') || s.querySelector('h2,h3')?.textContent || '')
      .trim()
      .slice(0, 30),
    boxed: getComputedStyle(s).backgroundColor,
  }));

  /**
   * **The state every `x` in this output is conditional on.**
   *
   * ADR-0113's finding, one instrument along: the Project Explorer is a resizable drawer, so the
   * content column's left edge — and therefore every column offset and every row spread below —
   * is a function of a width the reader chose and the harness never recorded. A run that does not
   * say how wide the Explorer was cannot be compared with another run, and two such runs disagreeing
   * looks like drift.
   */
  // Measured as `main`'s LEFT OFFSET rather than by finding the Explorer's own box. The shell is
  // `grid-cols-[auto_minmax(0,1fr)]` with the Explorer alone in column 1 and `<main>` in column 2
  // (`app-shell.tsx:134`, `:174`, `:203`), so the offset IS the column's width — and it stays right
  // when the Explorer is folded to its spine, hidden below `lg`, or absent on a route that has no
  // organisation (ADR-0104), where a selector would find nothing and report a misleading 0.
  const explorerNav = document.querySelector('nav[aria-label="Project Explorer"]');
  const frameCs = frame ? getComputedStyle(frame) : null;

  return {
    state: {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      explorerWidth: main ? Math.round(main.getBoundingClientRect().left) : null,
      explorerPresent: Boolean(explorerNav),
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
      mainLeft: main ? Math.round(main.getBoundingClientRect().left) : null,
      frameMaxWidthComputed: frameCs ? frameCs.maxWidth : null,
      framePadding: frameCs ? `${frameCs.paddingTop} ${frameCs.paddingLeft}` : null,
    },
    mainScrolls: main ? main.scrollHeight > main.clientHeight + 1 : null,
    mainScrollHeight: main ? main.scrollHeight : null,
    mainClientHeight: main ? main.clientHeight : null,
    docScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    h1: h1
      ? {
          text: h1.textContent.trim().slice(0, 30),
          top: Math.round(h1r.top),
          size: getComputedStyle(h1).fontSize,
          weight: getComputedStyle(h1).fontWeight,
        }
      : null,
    frameMaxWidth: frame ? getComputedStyle(frame).maxWidth : null,
    /**
     * **The page description, located semantically rather than positionally.**
     *
     * `descriptions` below is "every paragraph before the first table", which was the only thing
     * available before `PageHeader` was adopted and which conflates three different things: the
     * page's own description, a `SectionCard`'s, and a filter bar's prose. FC-1 clause 2 is about
     * the **page** description's measure, and a probe that cannot tell those apart reports a
     * divergence that is not there and a convergence that is not either — which is exactly what it
     * did at M1's first run.
     *
     * `PageHeader` wires its description with `aria-describedby` from the `<h1>`, so the link is
     * the locator: there is no guessing, and a screen that stops using the archetype reports
     * `null` rather than silently reporting its next paragraph instead.
     */
    pageDescription: (() => {
      const id = h1?.getAttribute('aria-describedby');
      const el = id ? document.getElementById(id) : null;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        chars: el.textContent.trim().length,
        width: Math.round(box.width),
        maxWidth: getComputedStyle(el).maxWidth,
        top: Math.round(box.top),
      };
    })(),
    frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
    descriptions: paras.slice(0, 4).map((p) => ({
      chars: p.textContent.trim().length,
      width: Math.round(p.getBoundingClientRect().width),
      top: Math.round(p.getBoundingClientRect().top),
    })),
    sectionCount: sections.length,
    sections,
    tables,
  };
};
/* eslint-enable no-undef */

// The same discovery the shoot harness does — this container ships Chromium under
// /opt/pw-browsers and has no headless-shell build, so a bare launch() throws.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome')[0];
if (!executablePath) throw new Error('No Chromium under /opt/pw-browsers');
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
const page = await ctx.newPage();

// Sign in as the account the shoot harness created, so this measures the SAME fixture the
// pictures show. Deriving the address from the slug rather than passing it twice: two values
// that have to agree and are written down twice is how they stop agreeing.
const EMAIL = process.env.EMAIL ?? `${SLUG.replace('shoot-co-', 'shoot-')}@example.com`;
await page.goto(`${BASE}/sign-in`);
await page.getByLabel(/email/i).fill(EMAIL);
await page.getByLabel(/password/i).fill('correct-horse-battery');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/orgs\//, { timeout: 20000 });
/**
 * The two detail screens need a client id and a project id. They are FOLLOWED from the list
 * screens rather than passed in, so the harness cannot be pointed at a fixture that does not
 * contain them — and so it fails loudly if a list renders no navigable row, rather than silently
 * measuring a 404 (ADR-0143's rule: a probe that reports a plausible number for the wrong subject
 * is worse than one that throws).
 */
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
const out = {
  run: { sha, width: WIDTH, slug: SLUG, takenAt: new Date().toISOString(), ids },
};
for (const [name, path] of PAGES) {
  await page.goto(`${BASE}${path(SLUG, ids)}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  out[name] = await page.evaluate(probe);
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
