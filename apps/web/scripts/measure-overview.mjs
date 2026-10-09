/**
 * M0 of the organisation landing (docs/specs/organisation-landing-portfolio/).
 *
 * Every figure the epic is judged on, taken in a real browser on the real product, BEFORE a line of
 * the design is built — because this repository has been wrong about a width on this kind of screen
 * eight consecutive times, each time from arithmetic rather than a browser.
 *
 * Reports:
 *   FC-1  the document `y` of each of Q1–Q7's ANSWERING SENTENCE at 1646 × 1000 (bar: y < 1000)
 *   FC-4  each section's rendered CONTENT width at 1280 / 1440 / 1646 (bar: after >= this)
 *   FC-5  the number of `…/overview` requests the landing issues (bar: exactly 1)
 *
 * **The non-vacuity control runs FIRST and throws** (`landing-fixture.mjs`), and the harness
 * additionally asserts the `<h1>` is the organisation's name — `measure-staff.mjs` once printed
 * `FC-1: 0 of 5 → FAIL` from the sign-in page, a verdict about a screen it had never reached.
 *
 * **Where it departs from the approved plan, and why.** M0-T3's risk line says the harness should
 * "refuse to run while anything answers on 3000 or 5173". That mitigation is `scripts/e2e-local.sh`'s
 * and belongs to a harness that STARTS its own servers; this one drives the running dev servers, so
 * obeying it would make the harness unable to run at all. The risk it names is real (ADR-0099's
 * three false diagnoses came from a silently-adopted stale server), so it is answered the other way:
 * the harness READS THE BUILD off the shell footer and prints it in the header of every report. A
 * stale server then shows up as a wrong version number in the record rather than as a refusal — and
 * unlike a refusal, it is still true when somebody reads the report a week later.
 *
 * Run with both dev servers up:
 *   PLAYWRIGHT_CHROMIUM_PATH=… node scripts/measure-overview.mjs > /tmp/m0.md
 */
/* global document, window, getComputedStyle, NodeFilter */
import { mkdirSync, writeFileSync } from 'node:fs';

import { chromium } from '@playwright/test';

import {
  assertLandingStates,
  expireInvitation,
  seedLandingStates,
  seedLongNames,
} from './landing-fixture.mjs';
import { probeRowSubjects, summariseProbe } from './row-subject-probe.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
// 1920 is the width the product owner's own screenshot was taken at (2026-09-16) — the screen
// they looked at when they asked why the landing is still one column. It was absent from this
// list for the whole epic, so every FC-4 figure the grid was withdrawn on was taken at widths
// narrower than the one being complained about. 1646 stays FIRST because it is FC-1's frame.
const WIDTHS = [1646, 1920, 1440, 1280];
// 1646 × 1000 is FC-1's stated frame — the product owner's Surface Pro, and the height `shoot.mjs`
// photographs at. The fold is a property of the condition, not of this harness.
const FOLD = 1000;
const SHOT_DIR = process.env.SP_SHOT_DIR ?? '/tmp/landing-shots';
// docs/specs/landing-two-columns M0: the split matrix below runs on its own when this is set, so the
// older FC sections (which that epic does not re-judge) are not re-photographed into the record.
const SPLIT_ONLY = process.env.SP_SPLIT_ONLY === '1';
const SPLIT_SHOT_DIR = process.env.SP_SPLIT_SHOT_DIR ?? '/tmp/landing-split-shots';
const tag = String(Date.now());
const out = [];
const p = (s = '') => out.push(s);

/**
 * Q1–Q7 and how each one's ANSWER is located.
 *
 * Sections are found by `role="region"` + accessible name, never by class — `SectionCard` renders a
 * named region (ADR-0143), and a class is the thing a redesign changes. Each question's answer is
 * the first element that actually STATES it, not the section heading: a heading reading "Recently
 * changed" above the fold with every row below it answers nothing, and scoring the heading would
 * report the screen as passing (ADR-0110 D5's shape — a gate satisfied by the wrong node).
 *
 * Q4–Q7 have no locator today by construction. They score `absent`, which is the baseline this
 * epic exists to move, and `find` returning null is how that is reported rather than a zero.
 */
/**
 * How a section is found — and it is NOT `[role="region"]`.
 *
 * `SectionCard` renders `<section aria-labelledby={titleId}>` (`section-card.tsx:65-67`), which IS
 * a region: a `<section>` with an accessible name has the `region` role IMPLICITLY, and there is no
 * `role` attribute in the DOM to match. The approved plan's own risk line said to locate sections
 * "by `role=\"region\"` + accessible name (`SectionCard` renders named regions)" — half right, and
 * the half that is wrong is invisible: `[role="region"]` matched NOTHING, and the first run of this
 * harness printed `FC-1: 0 of 7` and `no named regions found` over a page whose sections were
 * plainly on screen in the same session's screenshot. The `<h1>` guard did not catch it, because the
 * harness HAD reached the right screen; it was asking the wrong question about it.
 *
 * (Playwright's own `getByRole('region')` computes implicit roles and would have found them. This
 * runs inside `page.evaluate`, where a CSS attribute selector does not.)
 */
const REGION_SELECTOR = 'section[aria-labelledby], section[aria-label], [role="region"]';

const QUESTIONS = [
  { id: 'Q1', asks: 'Where was I?', region: 'Jump back in', answer: 'a' },
  {
    id: 'Q2',
    asks: 'What changed while I was away, and who?',
    region: 'Recently changed',
    answer: 'a',
  },
  { id: 'Q3', asks: 'Is anything waiting on me?', region: 'Needs your attention', answer: 'a, p' },
  // The four this epic adds, each located by the data attribute its row carries.
  //
  // **Three of the four regions below were WRONG in the version written at M0, and the error was
  // silent.** That table put all four inside "Recently changed"; M3 then decided that finish,
  // variance and flags belong in a section of their own, and this harness scopes an answer selector
  // INSIDE the named region — so it would have found nothing for Q5–Q7 and reported three failures
  // about a screen that answers all seven. The obvious reading of that verdict is "the layout is
  // wrong", which would have sent M5 to re-order a screen that was already right. Corrected by
  // reading the components rather than by running this, because running it produces a plausible
  // number either way.
  {
    id: 'Q4',
    asks: 'Are these figures current, or stale?',
    region: 'Recently changed',
    answer: '[data-overview-freshness]',
  },
  {
    id: 'Q5',
    asks: 'When does each programme finish?',
    region: 'Where the work stands',
    answer: '[data-overview-finish]',
  },
  {
    id: 'Q6',
    asks: 'Has that moved against what we committed?',
    region: 'Where the work stands',
    answer: '[data-overview-variance]',
  },
  {
    id: 'Q7',
    asks: 'Is anything flagged in the schedule?',
    region: 'Where the work stands',
    answer: '[data-overview-flags]',
  },
];

async function onboard(page) {
  await page.goto(`${BASE}/sign-up`);
  await page.getByLabel('Full name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill(`m0-overview-${tag}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByRole('heading', { name: /create your organisation/i }).waitFor();
  const orgName = `M0 Landing ${tag}`;
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await page.waitForURL(/\/orgs\/[^/]+$/);
  return { slug: new URL(page.url()).pathname.split('/')[2], orgName };
}

mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: WIDTHS[0], height: FOLD } });
const page = await context.newPage();

// FC-5: every request the page issues, counted before anything else can navigate.
const overviewRequests = [];
page.on('request', (r) => {
  const u = r.url();
  // ADR-0098's own guard: the Vite dev server also serves `/src/features/overview/…`, which once
  // made this count read 19. Only the API route counts.
  if (/\/api\/v\d+\/organizations\/[^/]+\/overview/.test(u)) overviewRequests.push(u);
});

const { slug, orgName } = await onboard(page);
const ids = await seedLandingStates(page, slug);
expireInvitation(ids.expiredInvite);
const control = assertLandingStates(ids);

// Q1 ("Where was I?") is backed by a per-user store of plans actually opened, so on a freshly
// onboarded account it is legitimately empty. Opening one plan is what makes the BASELINE describe
// the shipped screen rather than a state no returning user is ever in — without it Q1 would score
// `absent` and the epic would get credit at M5 for a section that already worked.
await page.goto(`${BASE}/orgs/${slug}/plans/${ids.late}`);
await page.waitForLoadState('networkidle');

overviewRequests.length = 0;
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

p('# M0 — the organisation landing, measured before anything is built');
p();
p(`- **Taken:** ${new Date().toISOString()}`);
p(`- **Build:** \`${build}\` (read off the shell footer, not assumed — see the harness docblock)`);
p(`- **Organisation:** \`${slug}\`, seeded by \`landing-fixture.mjs\``);
p(
  `- **Non-vacuity control:** PASS, ${String(control.checked)} states asserted positively before any measurement`,
);
p();

/**
 * One FC-1 pass, so the two widths below cannot drift into measuring different things.
 *
 * FC-1's frame is **1646 × 1000 and that is a property of the condition**, not of this harness, so
 * the 1646 pass is the verdict and the 1920 pass is an INPUT beside it. 1920 is here because the
 * product owner's screenshot was taken there and the whole width question was raised about that
 * screen; scoring only the narrower of the two would answer a question nobody asked.
 */
async function scanFold(width) {
  p(`## FC-1 — is each question answered above the fold at ${String(width)} × ${String(FOLD)}?`);
  p();
  p('| Q | Question | Answering element | `y` | Above the fold? |');
  p('| - | -------- | ----------------- | --: | --------------- |');

  await page.setViewportSize({ width, height: FOLD });
  await page.waitForTimeout(300);

  let answered = 0;
  for (const q of QUESTIONS) {
    const box = await page.evaluate(
      ({ region, answer, sel }) => {
        const regions = [...document.querySelectorAll(sel)];
        const host = regions.find((el) => {
          const labelled = el.getAttribute('aria-labelledby');
          const named =
            el.getAttribute('aria-label') ??
            (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
          return named.trim() === region;
        });
        if (!host) return { found: false, why: `no region named "${region}"` };
        const el = host.querySelector(answer);
        if (!el) return { found: false, why: `region present, no ${answer} inside it` };
        const r = el.getBoundingClientRect();
        return {
          found: true,
          y: Math.round(r.top + window.scrollY),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 48),
        };
      },
      { region: q.region, answer: q.answer, sel: REGION_SELECTOR },
    );
    if (!box.found) {
      p(`| ${q.id} | ${q.asks} | **absent** — ${box.why} | — | **no** |`);
      continue;
    }
    const ok = box.y < FOLD;
    if (ok) answered += 1;
    p(
      `| ${q.id} | ${q.asks} | \`${box.tag}\` — ${JSON.stringify(box.text)} | ${String(box.y)} | ${ok ? '**yes**' : '**no**'} |`,
    );
  }
  p();
  p(
    `**FC-1 at ${String(width)}: ${String(answered)} of ${String(QUESTIONS.length)} answered above the fold.** Bar: 7 of 7.`,
  );
  p();
  return answered;
}

if (!SPLIT_ONLY) {
  await scanFold(1646);
  await scanFold(1920);

  p("## FC-4 — each section's rendered content width");
  p();
  p('| Width | Section | Content width |');
  p('| ----: | ------- | ------------: |');
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: FOLD });
    await page.waitForTimeout(300);
    const widths = await page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)].map((el) => {
          const labelled = el.getAttribute('aria-labelledby');
          const name =
            el.getAttribute('aria-label') ??
            (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
          const cs = getComputedStyle(el);
          // The CONTENT width, not the border box: padding is chrome, and a section that keeps its box
          // and loses its padding has been narrowed in the only sense a reader notices.
          const inner =
            el.getBoundingClientRect().width -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight) -
            parseFloat(cs.borderLeftWidth) -
            parseFloat(cs.borderRightWidth);
          return { name: name.trim(), width: Math.round(inner) };
        }),
      REGION_SELECTOR,
    );
    if (widths.length === 0) p(`| ${String(w)} | **no named regions found** | — |`);
    for (const s of widths) p(`| ${String(w)} | ${s.name} | ${String(s.width)} |`);
  }
  p();
  /**
   * **Section geometry at 1646 — not a falsification condition, an INPUT to one.**
   *
   * FC-1 asks whether each answer sits above `y = 1000`, and when one does not, its sanctioned
   * remedies are "the layout is re-ordered, or a section is cut". Choosing between those needs each
   * section's HEIGHT, and nothing was measuring it. The answer positions alone let a reader INFER
   * section boundaries — `y = 1237` for Q5 says the standing section starts somewhere above 1237 and
   * says nothing about how tall it is — so an ordering was being chosen by arithmetic over guessed
   * boundaries, which is the reasoning this repository keeps replacing with a number.
   *
   * `rows` counts `li` inside the region, because every section here is a list and its height is
   * very nearly its row count times a row.
   */
  p('## Section geometry at 1646 (the input to the ordering decision)');
  p();
  p('| Section | top | height | rows | bottom |');
  p('| ------- | --: | -----: | ---: | -----: |');
  await page.setViewportSize({ width: 1646, height: FOLD });
  await page.waitForTimeout(300);
  const geometry = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(sel)].map((el) => {
        const labelled = el.getAttribute('aria-labelledby');
        const name =
          el.getAttribute('aria-label') ??
          (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '');
        const r = el.getBoundingClientRect();
        return {
          name: name.trim(),
          top: Math.round(r.top + window.scrollY),
          height: Math.round(r.height),
          rows: el.querySelectorAll('li').length,
        };
      }),
    REGION_SELECTOR,
  );
  if (geometry.length === 0) {
    throw new Error(
      'Section geometry found no named regions — every ordering decision below would be arithmetic over nothing.',
    );
  }
  for (const g of geometry) {
    p(
      `| ${g.name} | ${String(g.top)} | ${String(g.height)} | ${String(g.rows)} | ${String(g.top + g.height)} |`,
    );
  }
  p();
  p(
    `Page content runs to **${String(Math.max(...geometry.map((g) => g.top + g.height)))} px**; the fold is ${String(FOLD)}.`,
  );
  p();

  /**
   * **Photographs, because every figure above is a number about a screen nobody looked at.**
   *
   * ADR-0099 was opened after four consecutive epics measured this product's layout and each reported
   * a plausible number; what settled it was a screenshot, and `shoot.mjs`'s list did not cover the
   * screen in question. The same hole existed here: this harness scored the landing at four widths
   * for a whole epic and never once produced an image of it. `fullPage` deliberately — the fold is
   * FC-1's subject, so a viewport-cropped shot would hide exactly what the reader scrolls to.
   */
  p('## Photographs');
  p();
  for (const w of [1920, 1646, 1280]) {
    await page.setViewportSize({ width: w, height: FOLD });
    await page.waitForTimeout(300);
    const file = `${SHOT_DIR}/landing-${String(w)}.png`;
    await page.screenshot({ path: file, fullPage: true });
    p(`- \`${file}\` — full page at ${String(w)} × ${String(FOLD)}`);
  }
  p();
}

p(`## FC-5 — requests to \`…/overview\` on one landing load`);
p();
p(`Counted **${String(overviewRequests.length)}** (bar: exactly 1).`);
p();
p('## What the fixture holds');
p();
p('| Plan | id |');
p('| ---- | -- |');
for (const [k, v] of Object.entries(ids)) {
  if (Array.isArray(v)) continue;
  p(`| ${k} | \`${String(v)}\` |`);
}

/**
 * **The split matrix** (docs/specs/landing-two-columns M0, spec SC-6): for each window and Explorer
 * state, on the landing AND Members, the grid's width, its tracks, how many distinct tops the named
 * regions have, how many boxes are wholly visible without scrolling, document overflow, and — the
 * subject of SC-6 — every text run that wraps to a second line or is ellipsis-truncated.
 *
 * It throws, rather than prints, when a cell finds fewer regions than the screen has: the older
 * sections here only print "no named regions found", which is a verdict about a page nobody
 * measured.
 */
const CELLS = [
  { w: 1024, h: 600, ex: 'default' },
  { w: 1272, h: 1800, ex: 'default' },
  { w: 1280, h: 800, ex: 'default' },
  { w: 1349, h: 800, ex: 'default' },
  { w: 1358, h: 636, ex: 'default' },
  { w: 1440, h: 900, ex: 'default' },
  { w: 1477, h: 900, ex: 'default' },
  { w: 1912, h: 948, ex: 'default' },
  { w: 1912, h: 1114, ex: 'default' },
  { w: 1280, h: 800, ex: 'folded' },
  { w: 1280, h: 800, ex: '420' },
  { w: 1440, h: 900, ex: 'folded' },
  { w: 1440, h: 900, ex: '420' },
];
const LANDING_REGIONS = [
  'Jump back in',
  'Needs your attention',
  'Where the work stands',
  'Recently changed',
];

/** Runs in the page. Returns one cell's readings for whichever screen is showing. */
function readSplit({ sel }) {
  const nameOf = (el) => {
    const labelled = el.getAttribute('aria-labelledby');
    return (
      el.getAttribute('aria-label') ??
      (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '')
    ).trim();
  };
  const regions = [...document.querySelectorAll(sel)];
  const rects = regions.map((el) => ({ name: nameOf(el), r: el.getBoundingClientRect() }));
  const first = regions[0];
  // The grid is the parent of the PageGridItem that wraps the first region.
  let grid = first?.parentElement?.parentElement ?? null;
  while (grid && getComputedStyle(grid).display !== 'grid') grid = grid.parentElement;
  const tracks = grid
    ? getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .map((t) => Math.round(parseFloat(t)))
    : [];
  const main = document.querySelector('main');
  const lineCount = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const tops = new Set([...range.getClientRects()].map((q) => Math.round(q.top / 4)));
    return tops.size;
  };
  const wraps = [];
  const truncated = [];
  for (const el of regions) {
    const region = nameOf(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const host = n.parentElement;
      if (!host || seen.has(host) || !(n.textContent ?? '').trim()) continue;
      seen.add(host);
      const cs = getComputedStyle(host);
      if (cs.textOverflow === 'ellipsis' && host.scrollWidth > host.clientWidth) {
        truncated.push({
          region,
          text: (host.textContent ?? '').trim().slice(0, 70),
          shown: host.clientWidth,
          needs: host.scrollWidth,
        });
      } else if (cs.whiteSpace !== 'nowrap' && lineCount(host) > 1) {
        wraps.push({ region, text: (host.textContent ?? '').trim().slice(0, 70) });
      }
    }
  }
  const vh = window.innerHeight;
  return {
    regionNames: rects.map((x) => x.name),
    gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : null,
    tracks,
    tops: [...new Set(rects.map((x) => Math.round(x.r.top)))].length,
    visibleWhole: rects.filter((x) => x.r.top >= 0 && x.r.bottom <= vh).length,
    heights: rects.map((x) => `${x.name}=${String(Math.round(x.r.height))}`),
    mainScroll: main ? `${String(main.scrollHeight)}/${String(main.clientHeight)}` : 'n/a',
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    wraps,
    truncated,
  };
}

async function setExplorer(state) {
  const value =
    state === 'folded'
      ? { collapsed: true, size: 276 }
      : state === '420'
        ? { collapsed: false, size: 420 }
        : { collapsed: false, size: 276 };
  await page.evaluate(
    (v) => localStorage.setItem('schedulepoint-explorer', JSON.stringify(v)),
    value,
  );
}

if (process.env.SP_SPLIT_MATRIX !== '0') {
  mkdirSync(SPLIT_SHOT_DIR, { recursive: true });

  // Long, realistic names so SC-6 is not vacuous: the seeded plans are 30-40 characters, which fits
  // anywhere. These are the length a real programme carries (a staged works package, a client that
  // is an authority). Nothing here is absurd; it is the long tail of ordinary data.
  const longIds = await page.evaluate(async (org) => {
    const call = async (method, path, body) => {
      const response = await fetch(`/api/v1/organizations/${org}${path}`, {
        method,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
      return (await response.json()).data;
    };
    const client = await call('POST', '/clients', {
      name: 'Northern Ports and Harbours Authority',
    });
    const project = await call('POST', `/clients/${client.id}/projects`, {
      name: 'Estuary Crossing Programme — Western Approaches',
    });
    const plan = await call('POST', `/projects/${project.id}/plans`, {
      name: 'Berth 4 Deepening — Dredging and Revetment Works, Stage 2B',
      plannedStart: '2026-02-02',
    });
    await call('POST', `/plans/${plan.id}/edit-lock`);
    const a = await call('POST', `/plans/${plan.id}/activities`, {
      name: 'Dredge channel',
      code: 'D100',
      durationDays: 12,
    });
    const b = await call('POST', `/plans/${plan.id}/activities`, {
      name: 'Place revetment',
      code: 'D110',
      durationDays: 9,
    });
    await call('POST', `/plans/${plan.id}/dependencies`, {
      predecessorId: a.id,
      successorId: b.id,
    });
    await call('POST', `/plans/${plan.id}/schedule/recalculate`);
    await call('POST', `/plans/${plan.id}/baselines`, { name: 'Contract award' });
    return { plan: plan.id };
  }, slug);
  await page.goto(`${BASE}/orgs/${slug}/plans/${longIds.plan}`);
  await page.waitForLoadState('networkidle');

  p('## Split matrix (landing-two-columns M0)');
  p();
  p(
    '| Window | Explorer | Screen | Grid | Tracks | Distinct tops | Boxes wholly visible | main scroll (h/client) | Doc overflow-x | Wrapped runs | Truncated runs |',
  );
  p('| --- | --- | --- | --: | --- | --: | --: | --- | --: | --: | --: |');
  const detail = [];
  for (const cell of CELLS) {
    for (const screen of ['landing', 'members']) {
      await page.setViewportSize({ width: cell.w, height: cell.h });
      await page.goto(`${BASE}/orgs/${slug}/${screen === 'members' ? 'members' : ''}`);
      await setExplorer(cell.ex);
      await page.reload();
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      const got = await page.evaluate(readSplit, { sel: REGION_SELECTOR });
      const label = `${String(cell.w)}x${String(cell.h)} ${cell.ex} ${screen}`;
      if (screen === 'landing') {
        const missing = LANDING_REGIONS.filter((n) => !got.regionNames.includes(n));
        if (missing.length > 0 || got.gridWidth === null) {
          throw new Error(`${label}: landing regions missing ${JSON.stringify(missing)}`);
        }
      } else if (got.regionNames.length < 3 || got.gridWidth === null) {
        throw new Error(`${label}: Members found ${JSON.stringify(got.regionNames)}`);
      }
      p(
        `| ${String(cell.w)} × ${String(cell.h)} | ${cell.ex} | ${screen} | ${String(got.gridWidth)} | ${got.tracks.join(' + ')} | ${String(got.tops)} | ${String(got.visibleWhole)} of ${String(got.regionNames.length)} | ${got.mainScroll} | ${String(got.overflowX)} | ${String(got.wraps.length)} | ${String(got.truncated.length)} |`,
      );
      detail.push({ label, ...got });
      const stem = `${SPLIT_SHOT_DIR}/${screen}-${String(cell.w)}x${String(cell.h)}-${cell.ex}`;
      await page.screenshot({ path: `${stem}.png` });
      if (cell.ex === 'default' && cell.h < 1500 && cell.w < 1900 && screen === 'landing') {
        // The whole page, which `main` scrolls inside: grow the window until nothing scrolls.
        await page.setViewportSize({ width: cell.w, height: 2400 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${stem}-tall.png` });
      }
    }
  }
  p();
  p('### Wrapped and truncated runs, per cell');
  p();
  for (const d of detail) {
    if (d.wraps.length === 0 && d.truncated.length === 0) continue;
    p(`- **${d.label}** (grid ${String(d.gridWidth)}, tracks ${d.tracks.join(' + ')})`);
    for (const w of d.wraps) p(`  - wraps — ${w.region}: ${JSON.stringify(w.text)}`);
    for (const t of d.truncated) {
      p(
        `  - truncated — ${t.region}: ${JSON.stringify(t.text)} (${String(t.shown)} of ${String(t.needs)} px)`,
      );
    }
  }
  p();
  p('### Region heights, per cell');
  p();
  for (const d of detail) p(`- ${d.label}: ${d.heights.join('; ')}`);
  p();
}

/**
 * **The row-subject matrix** (docs/specs/row-subject-truncation M0-T1/T2, spec SC-1..SC-8).
 *
 * Runs with `SP_ROW_SUBJECT=1` (and, to skip the older sections, `SP_SPLIT_ONLY=1
 * SP_SPLIT_MATRIX=0`). `SP_ROW_SUBJECT_MAXIMA=1` adds the 200 + 200 + 200 plan. Each cell takes
 * the NEW probe (`row-subject-probe.mjs`) and, beside it, the OLD instrument's truncated-run count
 * for the same page, so the record shows what the old one could not see.
 */
const ROW_CELLS = [
  { w: 1024, h: 600 },
  { w: 1280, h: 800 },
  { w: 1465, h: 900 },
  { w: 1477, h: 900 },
  { w: 1646, h: 1000 },
  { w: 1912, h: 948 },
  { w: 1912, h: 1114 },
  { w: 320, h: 800 },
  { w: 1280, h: 800, inject: 'font200' },
  { w: 1912, h: 948, inject: 'font200' },
  { w: 1280, h: 800, inject: 'spacing' },
  { w: 1477, h: 900, inject: 'spacing' },
  { w: 1912, h: 948, inject: 'spacing' },
];
const INJECT_CSS = {
  font200: 'html { font-size: 200% }',
  spacing:
    '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important } p { margin-bottom: 2em !important }',
};

/** Runs in the page: per named box, whole rows in view, region height, and the name column's width in characters. */
function readBoxes() {
  const nameOfSection = (el) => {
    const labelled = el.getAttribute('aria-labelledby');
    return (labelled ? (document.getElementById(labelled)?.textContent ?? '') : '').trim();
  };
  const scroller = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (getComputedStyle(n).overflowY !== 'visible') return n;
    }
    return document.documentElement;
  };
  const canvas = document.createElement('canvas').getContext('2d');
  const boxes = [];
  let minNameChars = Infinity;
  for (const sec of document.querySelectorAll('section[aria-labelledby]')) {
    const subjects = [...sec.querySelectorAll('[data-row-subject]')];
    if (subjects.length === 0) continue;
    const first = subjects[0];
    const sc = scroller(first);
    const sr = sc.getBoundingClientRect();
    let whole = 0;
    let boxMin = Infinity;
    for (const subj of subjects) {
      const row = subj.closest('.border-b');
      const r = row.getBoundingClientRect();
      if (r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5) whole += 1;
      const nameEl = subj.firstElementChild;
      const cs = getComputedStyle(nameEl);
      canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const adv = canvas.measureText('0').width;
      const primary = row.firstElementChild.getBoundingClientRect().width;
      minNameChars = Math.min(minNameChars, primary / adv);
      boxMin = Math.min(boxMin, primary / adv);
    }
    boxes.push({
      region: nameOfSection(sec),
      rows: subjects.length,
      wholeRows: whole,
      minNameChars: Math.round(boxMin),
      boxHeight: Math.round(sec.getBoundingClientRect().height),
      bodyScroll: `${String(sc.scrollHeight)}/${String(sc.clientHeight)}`,
      bodyScrollsX: sc.scrollWidth > sc.clientWidth,
    });
  }
  const main = document.querySelector('main');
  return {
    mainScroll: main ? `${String(main.scrollHeight)}/${String(main.clientHeight)}` : 'n/a',
    boxes,
    minNameChars: Number.isFinite(minNameChars) ? Math.round(minNameChars) : null,
  };
}

if (process.env.SP_ROW_SUBJECT === '1') {
  const shotDir = process.env.SP_ROW_SHOT_DIR ?? '/tmp/row-subject-shots';
  mkdirSync(shotDir, { recursive: true });
  const maxima = process.env.SP_ROW_SUBJECT_MAXIMA === '1';
  await seedLongNames(page, slug, { maxima });
  // Open one long plan so "Jump back in" has a row (it is a per-user store of plans opened).
  const jb = await page.evaluate(async (org) => {
    const r = await fetch(`/api/v1/organizations/${org}/overview`, { credentials: 'include' });
    return (await r.json()).data;
  }, slug);
  void jb;
  p(`## Row-subject matrix (maxima plan: ${maxima ? 'YES' : 'no'})`);
  p();
  p(
    '| Cell | Rows | Names clipped | Contexts clipped | Old instrument truncated runs | Name shown px / chars (median) | Context shown px / chars (median) | Median row h | Rows >1 line | min name col (chars) | doc overflow-x |',
  );
  p('| --- | --: | --: | --: | --: | --- | --- | --: | --: | --: | --: |');
  const details = [];
  for (const cell of ROW_CELLS) {
    await page.setViewportSize({ width: cell.w, height: cell.h });
    await page.goto(`${BASE}/orgs/${slug}`);
    await setExplorer('default');
    await page.reload();
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(400);
    if (cell.inject) await page.addStyleTag({ content: INJECT_CSS[cell.inject] });
    await page.waitForTimeout(200);
    const label = `${String(cell.w)}x${String(cell.h)}${cell.inject ? ` ${cell.inject}` : ''}`;
    const result = await page.evaluate(probeRowSubjects);
    if (result.found === 0) throw new Error(`${label}: no [data-row-subject] found — vacuous`);
    const sum = summariseProbe(result);
    const old = await page.evaluate(readSplit, { sel: REGION_SELECTOR });
    const boxes = await page.evaluate(readBoxes);
    const multi = result.subjects.filter((x) => x.lines > 1).length;
    p(
      `| ${label} | ${String(sum.rows)} | ${String(sum.namesClipped)} | ${String(sum.contextsClipped)} | ${String(old.truncated.length)} | ${String(sum.medianNameShownPx)} px / ${String(sum.medianNameShownChars)} | ${String(sum.medianContextShownPx)} px / ${String(sum.medianContextShownChars)} | ${String(sum.medianRowHeight)} | ${String(multi)} | ${String(boxes.minNameChars)} | ${String(sum.docOverflowX)} |`,
    );
    details.push({ label, result, boxes, old, tracks: old.tracks, gridWidth: old.gridWidth });
    await page.screenshot({
      path: `${shotDir}/landing-${label.replace(' ', '-')}${maxima ? '-maxima' : ''}.png`,
    });
    if (!cell.inject && (cell.w === 1912 || cell.w === 1646) && cell.h < 1100 && cell.h !== 1114) {
      // The page as a whole: `main` scrolls inside the window, so the fold hides every ordinary row.
      await page.setViewportSize({ width: cell.w, height: 1900 });
      await page.waitForTimeout(300);
      await page.screenshot({
        path: `${shotDir}/landing-${label}-tall${maxima ? '-maxima' : ''}.png`,
      });
    }
  }
  if (process.env.SP_ROW_JSON) writeFileSync(process.env.SP_ROW_JSON, JSON.stringify(details));
  p();
  p('### Per-cell detail: clipped subjects, whole rows per box');
  p();
  for (const d of details) {
    p(`- **${d.label}** (grid ${String(d.gridWidth)}, tracks ${d.tracks.join(' + ')})`);
    p(
      `  - main scroll ${d.boxes.mainScroll}; boxes: ${d.boxes.boxes.map((b) => `${b.region}: ${String(b.wholeRows)}/${String(b.rows)} whole, box ${String(b.boxHeight)} px, body ${b.bodyScroll}, min name col ${String(b.minNameChars)} ch${b.bodyScrollsX ? ' SCROLLS-X' : ''}`).join('; ')}`,
    );
    for (const x of d.result.subjects) {
      const nameBad = x.name.clipped;
      const ctxBad = x.context.clipped;
      if (!nameBad && !ctxBad) continue;
      p(
        `  - ${x.region}: ${JSON.stringify(x.text.slice(0, 60))} name ${nameBad ? `CLIPPED ${String(x.name.shownChars)}/${String(x.name.chars)} ch (${String(x.name.shownPx)}/${String(x.name.needsPx)} px)` : 'whole'}; context ${ctxBad ? `CLIPPED ${String(x.context.shownChars)}/${String(x.context.chars)} ch (${String(x.context.shownPx)}/${String(x.context.needsPx)} px)` : x.hasContext ? 'whole' : 'none'}`,
      );
    }
  }
  p();

  // SC-2 positive control: a token wider than 300 px injected into one context must be reported by
  // the probe. On today's tree every row at 320 x 800 is ALREADY clipped, so a count could not rise
  // there; the control therefore runs at 1280 x 800, on the first subject whose context is whole
  // beforehand, and compares THAT subject before and after. (The M1 journey runs the 320 x 800
  // version, where nothing is clipped beforehand.) Silent means the instrument is wrong.
  const controlWidth = Number(process.env.SP_CONTROL_W ?? 1280);
  await page.setViewportSize({ width: controlWidth, height: 800 });
  await page.goto(`${BASE}/orgs/${slug}`);
  await page.reload();
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  const beforeAll = await page.evaluate(probeRowSubjects);
  const target = beforeAll.subjects.findIndex((x) => x.hasContext && !x.context.clipped);
  if (target < 0) throw new Error('SC-2 control: no unclipped context to inject into');
  await page.evaluate((i) => {
    const subj = document.querySelectorAll('[data-row-subject]')[i];
    const host = subj.lastElementChild;
    const token = document.createElement('span');
    token.style.cssText = 'display:inline-block;white-space:nowrap';
    // Text wider than 300 px (32 x "W" at 14 px is ~400 px): the probe reads glyph rects, so a bare
    // 300 px box with one letter in it would not overflow anything it can see.
    token.textContent = 'W'.repeat(32);
    host.appendChild(token);
  }, target);
  const afterAll = await page.evaluate(probeRowSubjects);
  const b4 = beforeAll.subjects[target];
  const af = afterAll.subjects[target];
  p(
    `### SC-2 positive control (token wider than 300 px injected into one context, ${String(controlWidth)} x 800)`,
  );
  p();
  p(
    `- subject #${String(target)} (${JSON.stringify(b4.text.slice(0, 50))}): context clipped before = ${String(b4.context.clipped)}, after = ${String(af.context.clipped)} (${String(af.context.shownChars)}/${String(af.context.chars)} ch shown). Verdict: ${!b4.context.clipped && af.context.clipped ? 'PASS (the probe saw the injected overflow)' : 'FAIL (probe silent)'}`,
  );
  p();
}

console.log(out.join('\n'));
await browser.close();
