import { type CDPSession, expect, type Locator, type Page, test } from '@playwright/test';

import { ganttRow, showGantt } from '../e2e-gantt/support';
import { activityEditor } from '../e2e-support/activity-editor';
import { holdThePen } from '../e2e-support/pen';
import {
  createHierarchy,
  diagramList,
  linkActivities,
  newPlan,
  openViewMenu,
  placeViaApi,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Large-text dock, M0: measure the problem and the candidate** (`docs/specs/large-text-dock/
 * m0-measurement.md`, TECH_DEBT #569). Nothing is patched: each candidate is a temporary injected
 * `<style>` applied to the same page the base is read from, so the baseline and every candidate
 * see identical layout inputs.
 *
 * - **R1** gives row 3 of the shell a floor, `minmax(min(100dvh, F), 1fr)`, with the shell clipping
 *   x and scrolling y. It is re-stated under the `squat` media rule, so `squat` keeps precedence
 *   exactly as the shipped class order does. F is 15 rem (`r1_15`) and 12 rem (`r1_12`).
 * - **R2** (only if R1 fails) is `squat` as a container query on the shell's parent.
 *
 * Text states: 100 %; **CDP** 200 % (`Page.setFontSizes`, what a browser's own text-size setting
 * does, so rem media queries answer); **inline** 200 % (`documentElement.style.fontSize`, which
 * moves rem lengths and not rem media queries). The root size is read back and recorded for every
 * 200 % reading.
 *
 * A harness, not a gate (ADR-0081 §3). It bypasses nothing but the candidate styles, and the
 * viewport-notice acknowledgement (ADR-0179) so the banner row does not add height.
 */

const PASSWORD = 'correct-horse-battery';
const PHOTOS = '../../docs/specs/large-text-dock/photos';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[large-text-dock m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

type Reading = Record<string, unknown>;

const TIP = 'Press and hold an icon button to see its name. A tap still presses it.';

const VARIANTS = (process.env['LTD_VARIANTS'] ?? 'base,r1_15,r1_12,r2_literal,r2').split(',');

/** The candidate styles. Every one is injected after the app's own sheet, at equal specificity. */
const CANDIDATE_CSS: Record<string, string> = {
  base: '',
  r1_15: rOne('15rem'),
  r1_12: rOne('12rem'),
  // The plan's R2 as written: containment on the shell's parent and nothing else.
  r2_literal: `[data-ltd-parent]{container-type:size;container-name:shell}
@container shell (width < 64rem) and (height <= 26rem){[data-ltd-shell]{grid-template-rows:auto auto 100dvh auto;overflow-y:auto}}`,
  // The same with the container given the window's height. Size containment makes an auto-height
  // block zero high, so without this the query's height is 0 and it matches in every window.
  r2: `[data-ltd-parent]{container-type:size;container-name:shell;height:100dvh}
@container shell (width < 64rem) and (height <= 26rem){[data-ltd-shell]{grid-template-rows:auto auto 100dvh auto;overflow-y:auto}}`,
};

function rOne(floor: string): string {
  return `[data-ltd-shell]{grid-template-rows:auto auto minmax(min(100dvh,${floor}),1fr) auto;overflow-x:hidden;overflow-y:auto}
@media (width < 64rem) and (height <= 26rem){[data-ltd-shell]{grid-template-rows:auto auto 100dvh auto;overflow-y:auto}}`;
}

/**
 * Read the shell, its rows and, when `strip` names one, the strip's controls at rest and after
 * `scrollIntoView({ block: 'nearest' })`, once per variant. Self-contained (Playwright serialises it).
 */
async function readShell(args: {
  strip: 'none' | 'tip' | 'selection';
  variants: readonly string[];
  css: Record<string, string>;
  tip: string;
}): Promise<Reading> {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const frames = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const main = document.querySelector<HTMLElement>('main#main');
  const shell = main?.parentElement ?? null;
  if (!main || !shell) return { error: 'no shell' };
  shell.setAttribute('data-ltd-shell', '');
  shell.parentElement?.setAttribute('data-ltd-parent', '');

  const describe = (el: Element | null): string => {
    if (!el) return 'none';
    const testid = el.getAttribute('data-testid');
    const role = el.getAttribute('role');
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 3).join('.');
    return `${el.tagName.toLowerCase()}${id}${role ? `[role=${role}]` : ''}${testid ? `[testid=${testid}]` : ''}${cls ? `.${cls}` : ''}`;
  };

  const findStrip = (): { strip: HTMLElement | null; controls: HTMLElement[] } => {
    if (args.strip === 'none') return { strip: null, controls: [] };
    if (args.strip === 'tip') {
      const message = [...document.querySelectorAll<HTMLElement>('*')].find(
        (e) => e.children.length === 0 && e.textContent?.trim() === args.tip,
      );
      if (!message) return { strip: null, controls: [] };
      let strip: HTMLElement = message.parentElement as HTMLElement;
      while (strip.parentElement && !strip.querySelector('button[aria-label="Dismiss this tip"]')) {
        strip = strip.parentElement;
      }
      const controls = ['Touch gestures', 'Dismiss this tip']
        .map((name) =>
          [...strip.querySelectorAll<HTMLElement>('button')].find(
            (b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name,
          ),
        )
        .filter((b): b is HTMLElement => b !== undefined);
      return { strip, controls };
    }
    if (args.strip === 'selection') {
      const bar = document.querySelector<HTMLElement>(
        '[role="toolbar"][aria-label^="Actions for"]',
      );
      if (!bar) return { strip: null, controls: [] };
      const controls = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width > 1.5 && b.height > 1.5;
      });
      return { strip: bar, controls };
    }
    return { strip: null, controls: [] };
  };

  const resetScroll = (): void => {
    for (let n: HTMLElement | null = findStrip().strip; n; n = n.parentElement) n.scrollTop = 0;
    shell.scrollTop = 0;
    document.documentElement.scrollTop = 0;
  };

  // The inset scales with the root: the controls are `rounded-md`, which is a rem length, so a point
  // 4 px in on the diagonal is outside the arc at a 32 px root (radius 16 px) and the strip behind
  // it is correctly what a hit-test returns. A fixed 4 px reads that as "covered" (found by M0).
  const inset = 4 * (parseFloat(getComputedStyle(document.documentElement).fontSize) / 16);
  const probe = (controls: HTMLElement[]): Reading => {
    // A tooltip left up by an earlier press floats over the strip and is not what is being measured.
    for (const t of document.querySelectorAll<HTMLElement>('[role="tooltip"]')) {
      t.style.pointerEvents = 'none';
    }
    const strip = findStrip().strip;
    let points = 0;
    let selfHits = 0;
    let outside = 0;
    let siblingHits = 0;
    let foreignHits = 0;
    let centreSelf = 0;
    const foreignCovers: Record<string, number> = {};
    const bad: string[] = [];
    for (const control of controls) {
      const b = control.getBoundingClientRect();
      const pts: [number, number][] = [
        [b.x + b.width / 2, b.y + b.height / 2],
        [b.x + inset, b.y + inset],
        [b.right - inset, b.y + inset],
        [b.x + inset, b.bottom - inset],
        [b.right - inset, b.bottom - inset],
      ];
      let controlOk = true;
      pts.forEach(([x, y], i) => {
        points += 1;
        if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
          outside += 1;
          controlOk = false;
          return;
        }
        const top = document.elementFromPoint(x, y);
        if (top !== null && control.contains(top)) {
          selfHits += 1;
          if (i === 0) centreSelf += 1;
        } else {
          controlOk = false;
          // A neighbour's own hit area (a coarse-pointer control's `absolute` slop span) is inside
          // the strip and is not the toolbar covering it; anything outside the strip is.
          if (top !== null && strip !== null && strip.contains(top)) siblingHits += 1;
          else {
            foreignHits += 1;
            const d = describe(top);
            foreignCovers[d] = (foreignCovers[d] ?? 0) + 1;
          }
        }
      });
      if (!controlOk) {
        bad.push(
          control.getAttribute('data-toolbar-item') ??
            control.getAttribute('aria-label') ??
            control.textContent?.trim().slice(0, 24) ??
            '?',
        );
      }
    }
    return {
      controls: controls.length,
      points,
      selfHits,
      centreSelf,
      outsideWindow: outside,
      siblingHits,
      foreignHits,
      // The row's criterion: every control's centre is itself, nothing outside the strip covers any
      // probed point, and every point is inside the window.
      reachable:
        controls.length > 0 && outside === 0 && foreignHits === 0 && centreSelf === controls.length,
      allSelf: controls.length > 0 && selfHits === points,
      notSelfControls: bad,
      foreignCovers,
    };
  };

  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const stage =
    document.querySelector('canvas') ??
    document.querySelector('[role="treegrid"]') ??
    document.querySelector('[role="listbox"]');

  const snapshot = async (): Promise<Reading> => {
    resetScroll();
    await frames();
    const kids = [...shell.children]
      .filter((c): c is HTMLElement => c instanceof HTMLElement)
      .filter((c) => getComputedStyle(c).position !== 'absolute')
      .map((c) => {
        const b = c.getBoundingClientRect();
        return { el: describe(c).slice(0, 50), top: r(b.top), h: r(b.height) };
      });
    const mb = main.getBoundingClientRect();
    const fb = foot?.getBoundingClientRect();
    const { strip, controls } = findStrip();
    const sb = strip?.getBoundingClientRect();
    const rest: Reading = {
      kids,
      mainTop: r(mb.top),
      mainH: r(mb.height),
      footTop: fb ? r(fb.top) : null,
      footH: fb ? r(fb.height) : null,
      footBottom: fb ? r(fb.bottom) : null,
      footBelowWindow: fb ? fb.bottom > window.innerHeight + 0.5 : null,
      stageH: stage ? r(stage.getBoundingClientRect().height) : null,
      stripH: sb ? r(sb.height) : null,
      stripTop: sb ? r(sb.top) : null,
      shellScrollH: shell.scrollHeight,
      shellClientH: shell.clientHeight,
      shellOverflows: shell.scrollHeight > shell.clientHeight,
      shellScrollTop: shell.scrollTop,
      shellOverflowY: getComputedStyle(shell).overflowY,
      shellRows: getComputedStyle(shell).gridTemplateRows,
      docScrollW: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      probeAtRest: strip ? probe(controls) : null,
    };
    let scrolled: Reading | null = null;
    if (strip) {
      strip.scrollIntoView({ block: 'nearest' });
      await frames();
      const sb2 = strip.getBoundingClientRect();
      scrolled = {
        shellScrollTop: shell.scrollTop,
        stripTop: r(sb2.top),
        stripBottom: r(sb2.bottom),
        probe: probe(findStrip().controls),
        // Each control scrolled into view on its own: a strip taller than the window cannot have
        // every control in view at once, and the planner scrolls to the one they want.
        probeEach: await (async (): Promise<Reading> => {
          const tally = {
            controls: 0,
            points: 0,
            selfHits: 0,
            outside: 0,
            foreign: 0,
            centreSelf: 0,
            notSelfControls: [] as string[],
          };
          for (const control of findStrip().controls) {
            control.scrollIntoView({ block: 'nearest' });
            await frames();
            const one = probe([control]) as {
              points: number;
              selfHits: number;
              outsideWindow: number;
              foreignHits: number;
              centreSelf: number;
              notSelfControls: string[];
            };
            tally.controls += 1;
            tally.points += one.points;
            tally.selfHits += one.selfHits;
            tally.outside += one.outsideWindow;
            tally.foreign += one.foreignHits;
            tally.centreSelf += one.centreSelf;
            tally.notSelfControls.push(...one.notSelfControls);
          }
          return {
            ...tally,
            allSelf: tally.controls > 0 && tally.selfHits === tally.points,
            reachable:
              tally.controls > 0 &&
              tally.outside === 0 &&
              tally.foreign === 0 &&
              tally.centreSelf === tally.controls,
          };
        })(),
      };
    }
    resetScroll();
    return { ...rest, scrolled };
  };

  const out: Reading = {
    root: getComputedStyle(document.documentElement).fontSize,
    squat: matchMedia('(width < 64rem) and (height <= 26rem)').matches,
    lg: matchMedia('(min-width: 64rem)').matches,
    coarse: matchMedia('(pointer: coarse)').matches,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    parent: shell.parentElement
      ? `${describe(shell.parentElement)} display=${getComputedStyle(shell.parentElement).display} h=${r(shell.parentElement.getBoundingClientRect().height)}`
      : null,
    variants: {},
  };
  for (const v of args.variants) {
    const tag = document.createElement('style');
    tag.id = 'ltd-candidate';
    tag.textContent = args.css[v] ?? '';
    document.head.append(tag);
    // A container-query candidate needs a layout pass of its own before it is read.
    await frames();
    (out['variants'] as Record<string, Reading>)[v] = await snapshot();
    tag.remove();
    await frames();
  }
  return out;
}

/**
 * The SC-4 sweep reading: only the rects that must be equal. Synchronous; the caller injects the
 * candidate through {@link CANDIDATE_CSS} and waits a frame.
 */
function readRects(): Reading {
  const r = (n: number): number => Math.round(n);
  const main = document.querySelector<HTMLElement>('main#main');
  const shell = main?.parentElement ?? null;
  if (!main || !shell) return { error: 'no shell' };
  shell.setAttribute('data-ltd-shell', '');
  shell.parentElement?.setAttribute('data-ltd-parent', '');
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const kids = [...shell.children]
    .filter((c): c is HTMLElement => c instanceof HTMLElement)
    .filter((c) => getComputedStyle(c).position !== 'absolute')
    .map((c) => {
      const b = c.getBoundingClientRect();
      return [r(b.top), r(b.height)];
    });
  const mb = main.getBoundingClientRect();
  const fb = foot?.getBoundingClientRect();
  // Every fixed-position element: a containment candidate (R2) changes the containing block of any
  // that sits inside the container, and this is how that would show.
  const fixed = [...document.querySelectorAll<HTMLElement>('*')]
    .filter((e) => getComputedStyle(e).position === 'fixed')
    .map((e) => {
      const b = e.getBoundingClientRect();
      return `${e.tagName}#${e.id}:${r(b.top)},${r(b.left)},${r(b.width)},${r(b.height)}`;
    });
  return {
    kids,
    fixed,
    main: [r(mb.top), r(mb.left), r(mb.width), r(mb.height)],
    foot: fb ? [r(fb.top), r(fb.left), r(fb.width), r(fb.height)] : null,
    shellScrollH: shell.scrollHeight,
    shellClientH: shell.clientHeight,
    shellOverflows: shell.scrollHeight > shell.clientHeight,
    mainH: r(mb.height),
  };
}

async function selectByName(page: Page, id: string): Promise<void> {
  await page.keyboard.press('Escape');
  await diagramList(page).focus();
  await page.waitForTimeout(150);
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 14; i += 1) {
    if ((await selectedActivityId(page)) !== id) await page.keyboard.press('ArrowDown');
    if ((await selectedActivityId(page)) === id) {
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error(`could not select ${id.slice(-4)}`);
}

const SMALL = { standard: 16, fixed: 13, serif: 16, sansSerif: 16 };
const LARGE = { standard: 32, fixed: 26, serif: 32, sansSerif: 32 };

type TextState = '100' | 'cdp200' | 'inline200';
const TEXT_STATES: readonly TextState[] = ['100', 'cdp200', 'inline200'];
type ViewState = 'diagram' | 'diagram-expanded' | 'gantt';
const VIEW_STATES: readonly ViewState[] = ['diagram', 'diagram-expanded', 'gantt'];
const STRIPS = ['none', 'tip', 'selection'] as const;

const SWEEP_CELLS: [number, number][] = [];
for (const h of [600, 720, 800, 948, 1097]) {
  for (const w of [1024, 1152, 1280, 1408, 1536, 1664, 1792, 1912]) SWEEP_CELLS.push([w, h]);
}
for (const cell of [
  [640, 480],
  [640, 360],
  [640, 300],
  [320, 720],
  [320, 256],
  [1280, 520],
  [1024, 500],
  [320, 568],
  [320, 640],
] as const) {
  SWEEP_CELLS.push([cell[0], cell[1]]);
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`large-text-dock M0 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0 readings, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(3_600_000);
      const name = `large-text-dock-m0${process.env['LTD_SUFFIX'] ?? ''}.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = { pointer, cells: [] as Reading[], sweep: [] as Reading[] };
      const cells = record['cells'] as Reading[];
      const sweep = record['sweep'] as Reading[];

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Dock Tester');
      await page.getByLabel('Email').fill(`dock-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Dock Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `dock-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      const orgUrl = page.url();
      await createHierarchy(page);
      await newPlan(page, 'Dock M0');
      await holdThePen(page);

      const seeded = await seedActivities(page, orgSlug, [
        { name: 'Excavate', laneIndex: 0 },
        { name: 'Pour slab', laneIndex: 1 },
        { name: 'Plain', laneIndex: 2 },
      ]);
      const byName = new Map(seeded.map((s) => [s.name, s.id]));
      const id = (n: string): string => {
        const v = byName.get(n);
        if (!v) throw new Error(`no seeded ${n}`);
        return v;
      };
      await linkActivities(page, orgSlug, id('Excavate'), id('Pour slab'));
      await recalculate(page, orgSlug);
      await holdThePen(page);
      // Placed before its logic allows, so a conflict exists and the selection bar carries a remedy.
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-05');
      await recalculate(page, orgSlug);
      await holdThePen(page);
      const planUrl = page.url();

      const cdp: CDPSession = await page.context().newCDPSession(page);
      const setFonts = (large: boolean): Promise<unknown> =>
        cdp.send('Page.setFontSizes', { fontSizes: large ? LARGE : SMALL });
      const readRoot = (): Promise<string> =>
        page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

      /** Back to 100 % text with every route cleared. */
      const reset100 = async (): Promise<void> => {
        await setFonts(false);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
      };

      /** Load the plan fresh at 1024 x 600, 100 % text, in the requested view, with the strip up. */
      const arrange = async (
        view: ViewState,
        strip: (typeof STRIPS)[number],
      ): Promise<string | null> => {
        await reset100();
        await page.setViewportSize({ width: 1024, height: 600 });
        // A fresh load occasionally leaves the pen control unread in this container; one retry.
        for (let attempt = 0; ; attempt += 1) {
          await page.goto(planUrl);
          await page.waitForTimeout(700);
          try {
            await holdThePen(page);
            break;
          } catch (e) {
            if (attempt >= 1) throw e;
          }
        }
        const expand = page.getByRole('button', { name: 'Expand activities panel' });
        const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
        try {
          if (view === 'gantt') {
            await showGantt(page);
          } else if (view === 'diagram-expanded') {
            if (await expand.isVisible()) await expand.click();
          } else if (await collapse.isVisible()) {
            await collapse.click();
          }
          await page.waitForTimeout(400);
          if (strip === 'tip') {
            const glyph = page.getByRole('button', { name: 'Comments' });
            await expect(glyph).toBeVisible();
            const box = await glyph.boundingBox();
            if (!box) throw new Error('no Comments box');
            await glyph.dispatchEvent('pointerdown', {
              pointerType: 'touch',
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
            });
            await glyph.dispatchEvent('pointerup', { pointerType: 'touch' });
            await expect(page.getByText(TIP)).toBeVisible();
          } else if (strip === 'selection') {
            if (view === 'gantt') await ganttRow(page, 'Pour slab').click();
            else if (view === 'diagram') await selectByName(page, id('Pour slab'));
            else await page.getByRole('cell', { name: 'Pour slab', exact: true }).click();
            await page.waitForTimeout(400);
            await expect(page.locator('[role="toolbar"][aria-label^="Actions for"]')).toBeVisible();
          }
        } catch (e) {
          return String(e instanceof Error ? e.message : e).split('\n')[0] ?? 'error';
        }
        return null;
      };

      const applyText = async (state: TextState): Promise<string> => {
        if (state === 'cdp200') {
          await setFonts(true);
          await page.waitForTimeout(500);
          if ((await readRoot()) !== '32px') {
            await setFonts(true);
            await page.waitForTimeout(500);
          }
        } else if (state === 'inline200') {
          await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
          });
          // The canvas sizes itself from a ResizeObserver; nudge it, as conflict-reason.spec does.
          await page.setViewportSize({ width: 1030, height: 600 });
          await page.setViewportSize({ width: 1024, height: 600 });
        }
        await page.waitForTimeout(500);
        return readRoot();
      };

      // ── Part 1: view × text state × strip, base and every candidate, at 1024 x 600 ─────────────
      for (const view of VIEW_STATES) {
        for (const text of TEXT_STATES) {
          for (const strip of STRIPS) {
            const setupError = await arrange(view, strip);
            const rootRead = await applyText(text);
            const expectedRoot = text === '100' ? '16px' : '32px';
            const reading =
              setupError === null || strip === 'none'
                ? await page.evaluate(readShell, {
                    strip,
                    variants: VARIANTS,
                    css: CANDIDATE_CSS,
                    tip: TIP,
                  })
                : { skipped: true };
            if (view === 'diagram' && setupError === null && ['tip', 'selection'].includes(strip)) {
              await page.screenshot({
                path: `${PHOTOS}/m0-${pointer}-${view}-${text}-${strip}.png`,
              });
            }
            cells.push({
              view,
              text,
              strip,
              rootRead,
              rootAsExpected: rootRead === expectedRoot,
              setupError,
              ...reading,
            });
            log(`${pointer} ${view} ${text} ${strip} root=${rootRead} err=${setupError ?? '-'}`);
          }
          writeMeasurement(name, record);
        }
      }
      await reset100();

      // ── Part 2: the SC-4 sweep at 100 %, plan (Diagram) and the organisation landing ───────────
      const routes: [string, string][] = [
        ['plan', planUrl],
        ['overview', orgUrl],
      ];
      for (const [routeName, url] of routes) {
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.goto(url);
        // The shell must be drawn and the Explorer's data in before the first cell is read: a read
        // taken a moment early saw no shell at all, and then a shorter Explorer than every later cell.
        await page.locator('main#main').waitFor();
        await page.waitForTimeout(2500);
        if (routeName === 'plan') await holdThePen(page);
        for (const [w, h] of SWEEP_CELLS) {
          await page.setViewportSize({ width: w, height: h });
          await page.waitForTimeout(150);
          const row: Reading = { route: routeName, w, h };
          for (const v of VARIANTS) {
            await page.evaluate(
              (arg) => {
                document.getElementById('ltd-candidate')?.remove();
                const tag = document.createElement('style');
                tag.id = 'ltd-candidate';
                tag.textContent = arg.css;
                document.head.append(tag);
              },
              { css: CANDIDATE_CSS[v] ?? '' },
            );
            await page.waitForTimeout(60);
            row[v] = await page.evaluate(readRects);
          }
          await page.evaluate(() => document.getElementById('ltd-candidate')?.remove());
          sweep.push(row);
        }
        log(`${pointer} sweep ${routeName} done`);
        writeMeasurement(name, record);
      }
      await cdp.detach();
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}

/**
 * **M1's overlay reading (SC-6, ADR-0213).** The frame is a size container, and containment changes
 * the containing block of a fixed descendant. Every overlay should be outside it (a top-layer
 * `<dialog>`, or a portal into the body), so each rect is read twice on the same page: as built, and
 * with the container switched off (`container-type: normal`, which restores today's containment
 * state; `squat` is off at 1024 x 600 either way). They must be equal.
 */
async function overlayRects(page: Page, target: Locator): Promise<Record<string, unknown>> {
  const read = (): Promise<number[]> =>
    target.first().evaluate((el) => {
      const b = el.getBoundingClientRect();
      return [b.top, b.left, b.width, b.height].map(Math.round);
    });
  const built = await read();
  await page.evaluate(() => {
    const tag = document.createElement('style');
    tag.id = 'ltd-plain';
    tag.textContent = '.shell-frame{container-type:normal}';
    document.head.append(tag);
  });
  await page.waitForTimeout(200);
  const plain = await read();
  await page.evaluate(() => document.getElementById('ltd-plain')?.remove());
  return { built, plain, equal: JSON.stringify(built) === JSON.stringify(plain) };
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`large-text-dock M1 overlays (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`overlay rects with and without the frame's containment, ${pointer} pointer`, async ({
      page,
    }) => {
      test.setTimeout(600_000);
      const stamp = Date.now() + (pointer === 'coarse' ? 3 : 2);
      const results: Record<string, unknown> = { pointer };
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Dock Tester');
      await page.getByLabel('Email').fill(`dock-ov-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Dock Ov ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `dock-ov-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      await createHierarchy(page);
      await newPlan(page, 'Dock M1 overlays');
      await holdThePen(page);
      await seedActivities(page, orgSlug, [{ name: 'Excavate', laneIndex: 0 }]);
      const planUrl = page.url();

      const arrange = async (width: number): Promise<void> => {
        await page.setViewportSize({ width, height: 600 });
        await page.goto(planUrl);
        await page.waitForTimeout(700);
        await holdThePen(page);
      };

      // 1. The activity editor Dialog, from the Activities panel's row menu.
      await arrange(1024);
      await page.getByRole('button', { name: 'Expand activities panel' }).click();
      await page.getByRole('button', { name: 'Actions for Excavate' }).click();
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      await expect(activityEditor(page)).toBeVisible();
      results['activityEditor'] = await overlayRects(page, activityEditor(page));
      await page.keyboard.press('Escape');

      // 2. The View popover.
      await arrange(1024);
      await openViewMenu(page);
      const view = page.getByRole('dialog', { name: /^View/ });
      await expect(view).toBeVisible();
      results['viewPopover'] = await overlayRects(page, view);
      await page.keyboard.press('Escape');

      // 3. A row Menu in the Explorer.
      await arrange(1024);
      const explorer = page.getByRole('navigation', { name: 'Project Explorer' });
      await explorer
        .getByRole('button', { name: /^Actions for/ })
        .first()
        .click();
      const menu = page.getByRole('menu').first();
      await expect(menu).toBeVisible();
      results['explorerRowMenu'] = await overlayRects(page, menu);
      await page.keyboard.press('Escape');

      // 4. A tooltip: long-pressed on a finger, hovered otherwise.
      await arrange(1024);
      const glyph = page.getByRole('button', { name: 'Comments' });
      await expect(glyph).toBeVisible();
      if (pointer === 'coarse') {
        const box = await glyph.boundingBox();
        if (!box) throw new Error('no Comments box');
        await glyph.dispatchEvent('pointerdown', {
          pointerType: 'touch',
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        });
        await page.waitForTimeout(900);
      } else {
        await glyph.hover();
        await page.waitForTimeout(900);
      }
      const tooltip = page.locator('[data-tooltip]');
      await expect(tooltip.first()).toBeVisible();
      results['tooltip'] = await overlayRects(page, tooltip);
      if (pointer === 'coarse') await glyph.dispatchEvent('pointerup', { pointerType: 'touch' });

      // 5. The Explorer Sheet, below lg.
      await arrange(1000);
      await page.getByRole('button', { name: 'Show Project Explorer' }).click();
      const sheet = page.getByRole('dialog', { name: 'Project Explorer' });
      await expect(sheet).toBeVisible();
      results['explorerSheet'] = await overlayRects(page, sheet);

      writeMeasurement(`large-text-dock-m1-overlays.${pointer}`, results);
      log(`${pointer} overlays ${JSON.stringify(results)}`);
      for (const [name, r] of Object.entries(results)) {
        if (name === 'pointer') continue;
        expect((r as { equal: boolean }).equal, `${name} moved with the frame's containment`).toBe(
          true,
        );
      }
    });
  });
}
