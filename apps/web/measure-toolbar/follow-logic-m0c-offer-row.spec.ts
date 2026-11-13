import { type CDPSession, expect, type Page, test } from '@playwright/test';

import { canvas, drawActivity, openNewPlan } from '../e2e-authoring/support';
import { ganttRow, showGantt } from '../e2e-gantt/support';
import { holdThePen } from '../e2e-support/pen';
import {
  diagramList,
  linkActivities,
  placeViaApi,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { readRows, settle, signUp, sweepRow } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0c** (`docs/specs/placed-bar-follows-link/m0-measurement.md`, "M0c";
 * `amendment-2-after-m0b.md` section 3): does option A-prime hold stop rules S1 to S5?
 *
 * **A-prime is INJECTED, not shipped; nothing under `apps/web/src` changes.** Each strip is a clone of
 * the REAL `NoticeStrip` the product renders (captured from the running page after a real Link-tool
 * link, with `min-w-0` now shipped on it), with the draft copy swapped in and put into the real dock
 * outlet. A-prime is the amendment's compiled CSS (`RULES_CSS`, verbatim) plus three markup changes
 * the amendment names: `data-dock-row` on the strip, comfortable density, and the buttons grouped in
 * one `<div data-dock-row-actions>`. The link-plus-offer face goes BEFORE the selection bar in the
 * Diagram (`TsldPanel.tsx:3327` against `:3338`), which is where the product renders it; every
 * other face is appended, as the product renders it, and the Gantt appends all of them.
 *
 * The same harness reads, for `docs/TECH_DEBT.md` #580, the three existing foot messages and the
 * real multi-select bar at 1024 with long names: as shipped, with A-prime's own-row treatment, and
 * with `grow` plus comfortable density.
 *
 * A harness, not a gate (ADR-0081 section 3): no CI step, no new config.
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1120x700', w: 1120, h: 700 },
  { label: '1250x800', w: 1250, h: 800 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1646x1097', w: 1646, h: 1097 },
  { label: '1912x1080', w: 1912, h: 1080 },
];
const FACTS_CELLS = CELLS.filter((c) => ['1024x600', '1280x800', '1440x900'].includes(c.label));
const MESSAGE_CELLS = CELLS.filter((c) => ['1024x600', '1280x800', '1646x1097'].includes(c.label));

const LONG_A = 'Install structural steel to level 3 west wings';
const LONG_B = 'Fabricate and erect precast stair cores, blk B';
const LONG_C = 'Commission the rooftop plant and chilled water loop';

/**
 * Amendment 2 section 3's injected stylesheet, verbatim. The outlet rule replaces `basis-auto`
 * with a floor; the strip, the sentence and the action group are the `messageFit="wrap"` value.
 */
const RULES_CSS = `
[data-activities-bar] > div[class*='not-empty:min-w-']:not(:empty):has([data-dock-row]) {
  min-width: min(36rem, 100%);
}
[data-dock-row] {
  min-width: 0;
  flex-wrap: wrap;
}
[data-dock-row] > p {
  flex: 1 1 0%;
  min-width: min(16rem, 100%);
}
[data-dock-row] > [data-dock-row-actions] {
  margin-inline-start: auto;
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
`;

const GROW_FLOOR_CSS = `
[data-activities-bar] > div[class*='not-empty:min-w-']:not(:empty):has([data-m0c-floor]) {
  min-width: min(36rem, 100%);
}
`;

const VARIANTS = [
  {
    id: 'edit-one',
    text: '“Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'edit-one-long-name',
    text: `“${LONG_A}” stays where you placed it, before its logic allows.`,
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'edit-several',
    text: '“Pour slab” and 2 others stay where you placed them, before their logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: false,
  },
  {
    id: 'plan',
    text: '3 bars stay where they were placed, before their logic allows.',
    buttons: ['Follow logic', 'Dismiss'],
    dashed: true,
    beforeBar: false,
  },
  {
    id: 'link-confirmation-plus-offer',
    text: 'Linked “Excavate” → “Pour slab” (FS). “Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Undo', 'Follow logic', 'Keep it here'],
    dashed: false,
    beforeBar: true,
  },
] as const;

/**
 * `shipped`: the product's strip. `A-prime`: the amendment. `grow`: row 580's other candidate.
 * `grow-floor`: `grow` plus ONLY the 36 rem outlet floor (no wrap, no action group), so "`grow` under
 * the A-prime outlet floor" is a reading and not a guess.
 */
type Mode = 'shipped' | 'A-prime' | 'grow' | 'grow-floor';

interface Sentence {
  text: string;
  buttons: readonly string[];
  dashed: boolean;
  beforeBar: boolean;
}

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0c ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const STRIP_ID = 'm0c-injected-strip';

/** Everything read in one place, in the page. Self-contained: Playwright serialises it. */
function readDock(arg: { tag: string; stripSelector: string }): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const diagramStage = document.querySelector<HTMLElement>(
    'section[aria-label="Time-scaled logic diagram"]',
  );
  const grid = document.querySelector<HTMLElement>(
    '[role="treegrid"][aria-label="Schedule as a bar chart"]',
  );
  // The Gantt has no `section[aria-label]`; its stage is the tallest ancestor of the grid that ends where
  // the foot row begins, which is the box the foot row's height comes out of.
  const ganttStage = ((): HTMLElement | null => {
    if (!grid || !foot) return null;
    const footTop = foot.getBoundingClientRect().top;
    let best: HTMLElement | null = null;
    for (let el: HTMLElement | null = grid; el && el !== document.body; el = el.parentElement) {
      if (Math.abs(el.getBoundingClientRect().bottom - footTop) <= 3) best = el;
    }
    return best;
  })();
  const stage = diagramStage ?? ganttStage;
  const outlet = foot?.querySelector<HTMLElement>('div[class*="not-empty:min-w-"]') ?? null;
  const cluster = (values: number[], tol = 4): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const lines: number[] = [];
    for (const v of sorted) {
      const last = lines[lines.length - 1];
      if (last === undefined || v - last > tol) lines.push(v);
    }
    return lines;
  };
  // The shell's one scroller: the grid that is `h-dvh` and carries the `squat:overflow-y-auto` rule
  // (`app-shell.tsx:160`). It scrolls only when `squat` is engaged (narrow AND short, or 200 % text).
  const scroller =
    [...document.querySelectorAll<HTMLElement>('div')].find(
      (d) =>
        d.className.includes('h-dvh') && d.className.includes('grid-cols-[auto_minmax(0,1fr)]'),
    ) ?? null;
  const strip = document.querySelector<HTMLElement>(arg.stripSelector);
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  const bulk = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
  const corner = document.querySelector<HTMLElement>(
    '[role="toolbar"][aria-label="Diagram viewport"]',
  );
  const facts = document.querySelector<HTMLElement>('[data-schedule-state]');
  const toggle = foot?.querySelector<HTMLElement>('button[aria-label$="activities panel"]') ?? null;
  const out: Reading = {
    tag: arg.tag,
    view: diagramStage ? 'diagram' : grid ? 'gantt' : 'unknown',
    coarse: matchMedia('(pointer: coarse)').matches,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footScrollsSideways: foot ? foot.scrollWidth > foot.clientWidth + 1 : null,
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    shellScrollsSideways: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : null,
    stageH: stage ? r(stage.getBoundingClientRect().height) : null,
    outletW: outlet ? r(outlet.getBoundingClientRect().width) : null,
    outletH: outlet ? r(outlet.getBoundingClientRect().height) : null,
    outletBasis: outlet ? getComputedStyle(outlet).flexBasis : null,
    outletMinW: outlet ? getComputedStyle(outlet).minWidth : null,
    shell: scroller
      ? {
          scrollTop: r(scroller.scrollTop),
          scrollHeight: scroller.scrollHeight,
          clientHeight: scroller.clientHeight,
          overflowY: getComputedStyle(scroller).overflowY,
          squat: getComputedStyle(scroller).overflowY === 'auto',
        }
      : null,
    facts: facts
      ? {
          state: facts.getAttribute('data-schedule-state'),
          w: r(facts.getBoundingClientRect().width),
          h: r(facts.getBoundingClientRect().height),
          tail: (facts.textContent ?? '').replace(/\s+/g, ' ').trim().slice(-48),
        }
      : null,
  };
  if (corner && stage) {
    const c = corner.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    out['cornerInsideStage'] =
      c.width > 0 &&
      c.left >= s.left - 0.5 &&
      c.top >= s.top - 0.5 &&
      c.right <= s.right + 0.5 &&
      c.bottom <= s.bottom + 0.5;
  } else {
    out['cornerInsideStage'] = corner ? null : 'no-cluster-in-this-view';
  }
  const selectionEl = bar ?? bulk;
  if (selectionEl) {
    const items = [
      ...selectionEl.querySelectorAll<HTMLElement>('[data-toolbar-item], button'),
    ].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5;
    });
    out['selectionBar'] = {
      label: selectionEl.getAttribute('aria-label') ?? selectionEl.getAttribute('data-testid'),
      lines: cluster(items.map((e) => e.getBoundingClientRect().top)).length,
      barW: r(selectionEl.getBoundingClientRect().width),
      barH: r(selectionEl.getBoundingClientRect().height),
      inOutlet: outlet ? outlet.contains(selectionEl) : null,
    };
  }

  // Controls whose reachability is read: the strip's buttons and the foot row's own toggle. Geometry
  // and the in-place hit test first, for every control; only then the scroll-into-view pass.
  const controls: { kind: 'strip' | 'toggle'; el: HTMLElement }[] = [];
  if (strip) {
    for (const b of strip.querySelectorAll<HTMLElement>('button')) {
      controls.push({ kind: 'strip', el: b });
    }
  }
  if (toggle) controls.push({ kind: 'toggle', el: toggle });
  const hitSelf = (el: HTMLElement): boolean => {
    const bb = el.getBoundingClientRect();
    const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
    return hit !== null && el.contains(hit);
  };
  const inPlace = controls.map((c) => ({
    hit: hitSelf(c.el),
    inViewport:
      c.el.getBoundingClientRect().bottom <= window.innerHeight + 1 &&
      c.el.getBoundingClientRect().top >= -1 &&
      c.el.getBoundingClientRect().right <= window.innerWidth + 1,
  }));
  const geometry = controls.map((c) => {
    const bb = c.el.getBoundingClientRect();
    const footRect = foot?.getBoundingClientRect();
    return {
      text: (c.el.getAttribute('aria-label') ?? c.el.textContent ?? '').trim(),
      w: r(bb.width),
      h: r(bb.height),
      top: r(bb.top),
      // Past the foot row's own right edge: a control the row clips whatever the page does.
      pastFootRight: bb.right > (footRect?.right ?? 0) + 1,
    };
  });
  const sb = strip?.getBoundingClientRect() ?? null;
  if (strip && sb) {
    const p = strip.querySelector<HTMLElement>('p');
    const actions = strip.querySelector<HTMLElement>('[data-dock-row-actions]');
    const pb = p?.getBoundingClientRect() ?? null;
    out['strip'] = {
      w: r(sb.width),
      h: r(sb.height),
      left: r(sb.left),
      right: r(sb.right),
      top: r(sb.top),
      bottom: r(sb.bottom),
      textClientW: p ? r(p.clientWidth) : null,
      textTruncated: p ? p.scrollWidth > p.clientWidth + 1 : null,
      textLines: p
        ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))
        : null,
      minWidthComputed: getComputedStyle(strip).minWidth,
      flexWrap: getComputedStyle(strip).flexWrap,
      overflowsOutletBy: outlet
        ? r(Math.max(0, sb.right - outlet.getBoundingClientRect().right))
        : null,
      // The buttons dropped under the sentence (the strip's wrap), as one group.
      actionsBelowText: pb && actions ? actions.getBoundingClientRect().top >= pb.bottom - 2 : null,
      actionsW: actions ? r(actions.getBoundingClientRect().width) : null,
      overlapsFootSibling:
        outlet && outlet.parentElement
          ? [...outlet.parentElement.children]
              .filter((c) => c !== outlet && (c.textContent ?? '').trim() !== '')
              .some((c) => {
                const cb = c.getBoundingClientRect();
                return (
                  cb.left < sb.right - 1 &&
                  cb.right > sb.left + 1 &&
                  cb.top < sb.bottom - 1 &&
                  cb.bottom > sb.top + 1
                );
              })
          : null,
      // The strip and the selection bar do not share a line, either way round.
      stackedWithBar: selectionEl
        ? sb.top >= selectionEl.getBoundingClientRect().bottom - 2 ||
          sb.bottom <= selectionEl.getBoundingClientRect().top + 2
        : null,
      aboveBar: selectionEl ? sb.bottom <= selectionEl.getBoundingClientRect().top + 2 : null,
      // The strip's line is above the plan facts (DOM order: outlet first).
      aboveFacts: facts ? sb.bottom <= facts.getBoundingClientRect().top + 2 : null,
    };
  }

  // The scroll pass. Every scrollable ancestor's offset is put back afterwards, so the next reading
  // starts from the same scroll the product would.
  const saved: { el: Element; top: number; left: number }[] = [];
  const remember = (el: Element | null): void => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      if (!saved.some((s) => s.el === n))
        saved.push({ el: n, top: n.scrollTop, left: n.scrollLeft });
    }
  };
  for (const c of controls) remember(c.el);
  const afterScroll = controls.map((c) => {
    c.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    return hitSelf(c.el);
  });
  for (const s of saved) {
    s.el.scrollTop = s.top;
    s.el.scrollLeft = s.left;
  }
  const merged = controls.map((_, i) => ({
    ...geometry[i],
    selfHitInPlace: inPlace[i]?.hit ?? null,
    inViewportInPlace: inPlace[i]?.inViewport ?? null,
    selfHitAfterScroll: afterScroll[i] ?? null,
  }));
  out['stripButtons'] = merged.filter((_, i) => controls[i]?.kind === 'strip');
  out['toggle'] = merged.find((_, i) => controls[i]?.kind === 'toggle') ?? null;
  return out;
}

async function read(page: Page, tag: string, stripSelector = `[data-testid="${STRIP_ID}"]`) {
  return page.evaluate(readDock, { tag, stripSelector });
}

async function installRules(page: Page): Promise<void> {
  await page.evaluate((css: string) => {
    document.getElementById('m0c-rules')?.remove();
    const style = document.createElement('style');
    style.id = 'm0c-rules';
    style.textContent = css;
    document.head.appendChild(style);
  }, RULES_CSS + GROW_FLOOR_CSS);
}

/** Put one strip, cloned from a real one, into the real outlet, in the product's order. */
async function injectStrip(
  page: Page,
  template: string,
  sentence: Sentence,
  mode: Mode,
  view: 'diagram' | 'gantt',
): Promise<void> {
  await page.evaluate(
    ({ html, s, m, id, v }) => {
      const foot = document.querySelector('[data-activities-bar]');
      const outlet = foot?.querySelector('div[class*="not-empty:min-w-"]');
      if (!outlet) throw new Error('no dock outlet');
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const strip = holder.firstElementChild as HTMLElement;
      strip.setAttribute('data-testid', id);
      strip.removeAttribute('role');
      if (s.dashed) strip.classList.add('border-dashed');
      const p = strip.querySelector('p');
      if (!p) throw new Error('template has no sentence');
      p.textContent = s.text;
      const buttons = [...strip.querySelectorAll('button')];
      const first = buttons[0];
      if (!first) throw new Error('template has no button');
      for (const b of buttons) b.remove();
      const labelled = s.buttons.map((label) => {
        const b = first.cloneNode(true) as HTMLElement;
        b.textContent = label;
        return b;
      });
      if (m === 'A-prime') {
        p.className = 'flex-1';
        strip.classList.remove('items-center', 'justify-between', 'py-1.5');
        strip.classList.add('items-start', 'py-2');
        strip.setAttribute('data-dock-row', '');
        const group = document.createElement('div');
        group.setAttribute('data-dock-row-actions', '');
        for (const b of labelled) group.appendChild(b);
        strip.appendChild(group);
      } else {
        if (m === 'grow' || m === 'grow-floor') {
          p.className = 'flex-1';
          strip.classList.remove('items-center', 'justify-between', 'py-1.5');
          strip.classList.add('items-start', 'py-2');
          if (m === 'grow-floor') strip.setAttribute('data-m0c-floor', '');
        } else {
          p.className = 'min-w-0 truncate';
        }
        for (const b of labelled) strip.appendChild(b);
      }
      const bar = outlet.querySelector('[role="toolbar"][aria-label^="Actions for"]');
      const barChild = bar
        ? ([...outlet.children].find((c) => c === bar || c.contains(bar)) ?? null)
        : null;
      if (s.beforeBar && v === 'diagram' && barChild) outlet.insertBefore(strip, barChild);
      else outlet.appendChild(strip);
    },
    { html: template, s: sentence, m: mode, id: STRIP_ID, v: view },
  );
}

async function removeStrip(page: Page): Promise<void> {
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="${id}"]`)?.remove();
  }, STRIP_ID);
}

/**
 * Reshape the REAL multi-select bar in place (row 580). `restore` puts its classes back; React does
 * not touch them while the bar's props are unchanged, which is checked by reading it back.
 */
async function reshapeBulk(page: Page, mode: Mode): Promise<void> {
  await page.evaluate((m) => {
    const strip = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
    if (!strip) throw new Error('no bulk bar');
    strip.setAttribute('data-m0c-orig', strip.className);
    const p = strip.querySelector(':scope > p');
    if (!p) throw new Error('no bulk sentence');
    p.setAttribute('data-m0c-orig', p.className);
    if (m === 'shipped') return;
    p.className = 'flex-1';
    strip.classList.remove('items-center', 'justify-between', 'py-1.5');
    strip.classList.add('items-start', 'py-2');
    if (m === 'grow-floor') strip.setAttribute('data-m0c-floor', '');
    if (m === 'A-prime') {
      strip.setAttribute('data-dock-row', '');
      const actions = strip.querySelector(':scope > div');
      if (!actions) throw new Error('no bulk actions group');
      actions.setAttribute('data-dock-row-actions', '');
    }
  }, mode);
}

async function restoreBulk(page: Page): Promise<void> {
  await page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>('[data-testid="bulk-selection-bar"]');
    if (!strip) return;
    const orig = strip.getAttribute('data-m0c-orig');
    if (orig !== null) strip.className = orig;
    strip.removeAttribute('data-m0c-orig');
    strip.removeAttribute('data-dock-row');
    strip.removeAttribute('data-m0c-floor');
    strip.querySelector(':scope > div')?.removeAttribute('data-dock-row-actions');
    const p = strip.querySelector(':scope > p');
    const po = p?.getAttribute('data-m0c-orig');
    if (p && po !== null && po !== undefined) p.className = po;
    p?.removeAttribute('data-m0c-orig');
  });
}

async function selectByName(page: Page, org: string, name: string): Promise<void> {
  const row = (await readRows(page, org)).find((x) => x.name === name);
  if (!row) throw new Error(`no ${name}`);
  await diagramList(page).focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 15; i += 1) {
    if ((await selectedActivityId(page)) === row.id) return;
    await page.keyboard.press('ArrowDown');
  }
  if ((await selectedActivityId(page)) !== row.id) throw new Error(`could not reach ${name}`);
}

async function selectInGantt(page: Page, name: string): Promise<void> {
  await ganttRow(page, name).getByRole('gridcell').first().click();
}

type Selection = 'none' | 'placed-unflagged-selected' | 'flagged-bar-selected';
const SELECTIONS: readonly Selection[] = [
  'none',
  'placed-unflagged-selected',
  'flagged-bar-selected',
];
const NAME_FOR: Record<Selection, string | null> = {
  none: null,
  'placed-unflagged-selected': 'Excavate',
  'flagged-bar-selected': 'Pour slab',
};

async function applySelection(
  page: Page,
  org: string,
  view: 'diagram' | 'gantt',
  selection: Selection,
): Promise<void> {
  const name = NAME_FOR[selection];
  if (name === null) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    // The Gantt has no way to clear a selection (no Clear selection button, and Escape does not reach it),
    // so its `none` pass runs first, from a selection cleared in the diagram; this checks it held.
    if ((await page.locator('[role="toolbar"][aria-label^="Actions for"]').count()) > 0) {
      throw new Error(`selection would not clear in ${view}`);
    }
  } else if (view === 'diagram') {
    await selectByName(page, org, name);
  } else {
    await selectInGantt(page, name);
  }
  await page.waitForTimeout(500);
}

/** The real plural selection: the long-named bar, then Shift+ArrowDown to extend (ADR-0080). */
async function selectPlural(page: Page, org: string): Promise<void> {
  await selectByName(page, org, LONG_A);
  await diagramList(page).press('Shift+ArrowDown');
  await expect(page.getByTestId('bulk-selection-bar')).toContainText(/2 activities selected/);
  await page.waitForTimeout(500);
}

/** Facts state, for the first line of every reading: the thing R0 says was missing from M0b. */
const factsOf = (reading: Reading): unknown => reading['facts'];

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`follow-logic M0c (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`A-prime at 1024 and above, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(5_400_000);
      const name = `follow-logic-m0c-offer-row.${pointer}`;
      clearMeasurement(name);
      const record: Reading = {
        pointer,
        method:
          "A-prime injected: amendment 2 section 3's stylesheet (verbatim), data-dock-row on the cloned strip, comfortable density, buttons in one data-dock-row-actions group; nothing under apps/web/src changed",
        r0: [] as Reading[],
        diagram: [] as Reading[],
        gantt: [] as Reading[],
        text200: [] as Reading[],
        text200cdp: [] as Reading[],
        ganttText200: [] as Reading[],
        messages: [] as Reading[],
        band: [] as Reading[],
        factsWidened: [] as Reading[],
        r0Controlled: [] as Reading[],
      };
      const r0 = record['r0'] as Reading[];
      const diagramCells = record['diagram'] as Reading[];
      const ganttCells = record['gantt'] as Reading[];
      const text200 = record['text200'] as Reading[];
      const text200cdp = record['text200cdp'] as Reading[];
      const ganttText200 = record['ganttText200'] as Reading[];
      const messages = record['messages'] as Reading[];
      const factsWidened = record['factsWidened'] as Reading[];
      expect(LONG_A).toHaveLength(46);
      expect(LONG_B).toHaveLength(46);

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(
        page,
        Date.now() + (pointer === 'coarse' ? 7 : 0) + 177,
        'FollowC',
      );
      await openNewPlan(page);
      await holdThePen(page);
      const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
      const count = (n: number) =>
        expect(diagram.getByRole('option')).toHaveCount(n, { timeout: 15_000 });

      // ── The real undo result strip, with a long name: draw, then Ctrl+Z.
      await drawActivity(page, 'Task', LONG_C, { x: 220, y: 360 });
      await count(1);
      await canvas(page).press('Control+z');
      await expect(page.getByTestId('canvas-history-result')).toBeVisible({ timeout: 10_000 });
      const historyTemplate = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-history-result"]')?.outerHTML ?? '',
      );
      const historySentence = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-history-result"] p')?.textContent ?? '',
      );
      const historyButtons = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="canvas-history-result"] button')].map((b) =>
          (b.textContent ?? '').trim(),
        ),
      );
      await page
        .getByTestId('canvas-history-result')
        .getByRole('button', { name: 'Dismiss' })
        .click();
      await count(0);

      // ── The fixture: Excavate and Pour slab (selection states, the flagged bar); two long-named bars.
      await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
      await count(1);
      await drawActivity(page, 'Task', 'Pour slab', { x: 440, y: 180 });
      await count(2);
      await drawActivity(page, 'Task', LONG_A, { x: 220, y: 240 });
      await count(3);
      await drawActivity(page, 'Task', LONG_B, { x: 440, y: 300 });
      await count(4);
      const drawn = await settle(
        page,
        orgSlug,
        (rows) => rows.length === 4 && rows.every((x) => x.visualEffectiveStart !== null),
        'four bars',
      );
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      const byName = (n: string) => {
        const row = drawn.rows.find((x) => x.name === n);
        if (!row) throw new Error(`missing drawn row ${n}`);
        return row;
      };
      const sweepA = await sweepRow(page, byName(LONG_A).id, 240, 220);
      const sweepB = await sweepRow(page, byName(LONG_B).id, 300, 440);
      await canvas(page).press('Escape');

      // ── R0: a real Link-tool link between the long-named bars, read at 1024 as M0b did (the first
      // read after an edit, right after a resize from 1646), again 3 s later, and either side of a
      // recalculation, with the facts' state and width and the outlet's width in every one.
      await page
        .getByRole('toolbar', { name: 'Plan commands' })
        .getByRole('button', { name: 'Link', exact: true })
        .click();
      await canvas(page).click({
        position: { x: Math.round((sweepA.min + sweepA.max) / 2), y: 240 },
      });
      await canvas(page).click({
        position: { x: Math.round((sweepB.min + sweepB.max) / 2), y: 300 },
      });
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Linked', {
        timeout: 10_000,
      });
      const linkedTemplate = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"]')?.outerHTML ?? '',
      );
      const linkedSentence = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"] p')?.textContent ?? '',
      );
      expect(linkedTemplate).toContain('Undo');
      const live = '[data-testid="canvas-mode-band"]';
      const r0Read = async (what: string): Promise<void> => {
        r0.push({
          what,
          at: new Date().toISOString().slice(11, 23),
          sentence: linkedSentence,
          ...(await read(page, 'r0', live)),
        });
      };
      await r0Read('LIVE Linked band at 1646x1097, immediately after the link');
      await page.setViewportSize({ width: 1024, height: 600 });
      await page.waitForTimeout(500);
      await r0Read('LIVE, 1024x600, 0.5 s after the resize (M0b read here)');
      await page.waitForTimeout(3000);
      await r0Read('LIVE, 1024x600, 3.5 s after the resize');
      // The real route first: the button, if the facts offer one; the API otherwise.
      const recalcButton = page.getByRole('button', { name: 'Recalculate', exact: true });
      const viaButton = await recalcButton.isVisible();
      if (viaButton) {
        await recalcButton.click();
      } else {
        await page.evaluate(
          async ({ org, id }: { org: string; id: string }) => {
            const response = await fetch(
              `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
              { method: 'POST', credentials: 'include' },
            );
            if (!response.ok) throw new Error(`recalculate ${String(response.status)}`);
          },
          { org: orgSlug, id: /\/plans\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '' },
        );
      }
      record['r0Recalculate'] = viaButton ? 'the Recalculate button' : 'POST /schedule/recalculate';
      await r0Read('LIVE, 1024x600, immediately after recalculate was requested');
      await page.waitForTimeout(3000);
      await r0Read('LIVE, 1024x600, 3 s after recalculate');
      // The same strip as a clone, with the band put away (the Link tool disarmed), in the settled facts.
      await canvas(page).press('Escape');
      await injectStrip(
        page,
        linkedTemplate,
        { text: linkedSentence, buttons: ['Undo'], dashed: false, beforeBar: true },
        'shipped',
        'diagram',
      );
      await page.waitForTimeout(300);
      r0.push({
        what: 'CLONE of the Linked band, 1024x600, after recalculate (M0b read 347.5 here)',
        ...(await read(page, 'r0-clone')),
      });
      await removeStrip(page);
      // The moment M0b read: right after an edit, at 1024. Ctrl+Z is an edit (it deletes the link), so
      // the schedule goes stale again; sample the facts and the outlet every 100 ms for 6 s.
      await canvas(page).press('Control+z');
      const series: Reading[] = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        series.push(
          await page.evaluate((ms: number) => {
            const facts = document.querySelector<HTMLElement>('[data-schedule-state]');
            const outlet = document.querySelector<HTMLElement>(
              '[data-activities-bar] div[class*="not-empty:min-w-"]',
            );
            const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
            return {
              ms,
              state: facts?.getAttribute('data-schedule-state') ?? null,
              factsW: facts ? Math.round(facts.getBoundingClientRect().width * 10) / 10 : null,
              outletW: outlet ? Math.round(outlet.getBoundingClientRect().width * 10) / 10 : null,
              footH: foot ? Math.round(foot.getBoundingClientRect().height * 10) / 10 : null,
            };
          }, Date.now() - t0),
        );
        await page.waitForTimeout(100);
      }
      record['r0Series'] = series;
      const dismiss = page
        .getByTestId('canvas-history-result')
        .getByRole('button', { name: 'Dismiss' });
      if (await dismiss.isVisible()) await dismiss.click();
      await page.setViewportSize({ width: 1646, height: 1097 });
      record['sentences'] = { linkedSentence, historySentence, historyButtons };

      // Pour slab placed before its predecessor finishes: a placed, flagged bar (as M0).
      await linkActivities(page, orgSlug, byName('Excavate').id, byName('Pour slab').id);
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-06');
      await recalculate(page, orgSlug);
      await holdThePen(page);
      const settled = await settle(
        page,
        orgSlug,
        (rows) =>
          rows.find((x) => x.name === 'Pour slab')?.visualConflictReason === 'EARLIER_THAN_LOGIC',
        'Pour slab flagged',
      );
      record['fixture'] = settled.rows.map((x) => ({
        name: x.name,
        placed: x.visualStart,
        reason: x.visualConflictReason,
      }));
      await installRules(page);
      writeMeasurement(name, record);

      const stripCells = async (
        sink: Reading[],
        cell: string,
        selection: Selection | 'plural',
        view: 'diagram' | 'gantt',
        extra: Reading = {},
      ): Promise<void> => {
        const base = await read(page, 'base');
        sink.push({ cell, selection, variant: 'base', mode: 'none', ...extra, ...base });
        for (const variant of VARIANTS) {
          await injectStrip(page, linkedTemplate, variant, 'A-prime', view);
          await page.waitForTimeout(300);
          const reading = await read(page, `${variant.id}/A-prime`);
          await removeStrip(page);
          sink.push({
            cell,
            selection,
            variant: variant.id,
            mode: 'A-prime',
            ...extra,
            ...reading,
          });
        }
      };

      const messageTemplates: { id: string; template: string; sentence: Sentence }[] = [
        {
          id: 'bare-linked',
          template: linkedTemplate,
          // The mode band renders before the selection bar (TsldPanel.tsx:3327).
          sentence: { text: linkedSentence, buttons: ['Undo'], dashed: false, beforeBar: true },
        },
        {
          id: 'undo-result',
          template: historyTemplate,
          sentence: {
            text: historySentence,
            buttons: historyButtons,
            dashed: false,
            beforeBar: false,
          },
        },
        {
          // `LayoutResolvedStrip` is `NoticeStrip tone="muted"` (compact, truncate), the same classes as the
          // Linked band, so the band's HTML stands in for it; the sentence is `sentenceFor`'s one-bar form.
          id: 'layout-resolved',
          template: linkedTemplate,
          sentence: {
            text: `Moved “${LONG_A}” to lane 3 so it no longer overlaps another activity.`,
            buttons: ['Undo', 'Dismiss'],
            dashed: false,
            beforeBar: false,
          },
        },
      ];

      // ── R2 (Diagram): seven widths, three selection states, five variants.
      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(600);
        for (const selection of SELECTIONS) {
          await applySelection(page, orgSlug, 'diagram', selection);
          await stripCells(diagramCells, cell.label, selection, 'diagram');
          log(`${pointer} diagram ${cell.label} ${selection} done`);
        }
        writeMeasurement(name, record);
      }

      // ── Where S2 fires, if it does: a 10 px sweep of the window width around it, both selections,
      // the base and one variant, so the width band is a measurement and not a guess from two cells.
      const bandCells = record['band'] as Reading[];
      for (let w = 1150; w <= 1330; w += 10) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(500);
        for (const selection of ['placed-unflagged-selected', 'flagged-bar-selected'] as const) {
          await applySelection(page, orgSlug, 'diagram', selection);
          const base = await read(page, 'base');
          bandCells.push({
            cell: `${String(w)}x800`,
            selection,
            variant: 'base',
            mode: 'none',
            ...base,
          });
          await injectStrip(page, linkedTemplate, VARIANTS[0], 'A-prime', 'diagram');
          await page.waitForTimeout(300);
          const reading = await read(page, 'edit-one/A-prime');
          await removeStrip(page);
          bandCells.push({
            cell: `${String(w)}x800`,
            selection,
            variant: 'edit-one',
            mode: 'A-prime',
            ...reading,
          });
        }
      }
      writeMeasurement(name, record);

      // ── Row 580: the three existing messages and the real multi-select bar, at three widths.
      for (const cell of MESSAGE_CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(600);
        for (const selection of ['none', 'flagged-bar-selected'] as const) {
          await applySelection(page, orgSlug, 'diagram', selection);
          const base = await read(page, 'base');
          messages.push({ cell: cell.label, selection, message: 'none', mode: 'none', ...base });
          for (const message of messageTemplates) {
            for (const mode of ['shipped', 'A-prime', 'grow', 'grow-floor'] as const) {
              await injectStrip(page, message.template, message.sentence, mode, 'diagram');
              await page.waitForTimeout(300);
              const reading = await read(page, `${message.id}/${mode}`);
              await removeStrip(page);
              messages.push({
                cell: cell.label,
                selection,
                message: message.id,
                sentence: message.sentence.text,
                mode,
                ...reading,
              });
            }
          }
        }
        await selectPlural(page, orgSlug);
        const baseBulk = await read(page, 'base-bulk');
        messages.push({
          cell: cell.label,
          selection: 'plural',
          message: 'bulk-bar',
          mode: 'none',
          ...baseBulk,
        });
        const bulkSel = '[data-testid="bulk-selection-bar"]';
        for (const mode of ['shipped', 'A-prime', 'grow', 'grow-floor'] as const) {
          await reshapeBulk(page, mode);
          await page.waitForTimeout(300);
          const reading = await read(page, `bulk-bar/${mode}`, bulkSel);
          await restoreBulk(page);
          messages.push({
            cell: cell.label,
            selection: 'plural',
            message: 'bulk-bar',
            sentence: await page.evaluate(
              (sel) => document.querySelector(`${sel} > p`)?.textContent ?? '',
              bulkSel,
            ),
            mode,
            ...reading,
          });
        }
        log(`${pointer} messages ${cell.label} done`);
        writeMeasurement(name, record);
      }

      // ── R1 and R4: 200 % text at 1024 x 600 by the root font size (a user style sheet's effect). The
      // selection is made at 100 %, because the listbox cannot take focus once the root is 200 %.
      const readAt200 = async (
        sink: Reading[],
        cellLabel: string,
        selection: Selection,
        view: 'diagram' | 'gantt',
      ): Promise<void> => {
        const base = await read(page, 'base');
        sink.push({ cell: cellLabel, selection, variant: 'base', mode: 'none', ...base });
        for (const message of messageTemplates) {
          await injectStrip(page, message.template, message.sentence, 'shipped', view);
          await page.waitForTimeout(300);
          const reading = await read(page, `${message.id}/shipped`);
          await removeStrip(page);
          sink.push({
            cell: cellLabel,
            selection,
            variant: message.id,
            mode: 'shipped',
            ...reading,
          });
        }
        for (const variant of VARIANTS) {
          await injectStrip(page, linkedTemplate, variant, 'A-prime', view);
          await page.waitForTimeout(300);
          const reading = await read(page, `${variant.id}/A-prime`);
          await removeStrip(page);
          sink.push({
            cell: cellLabel,
            selection,
            variant: variant.id,
            mode: 'A-prime',
            ...reading,
          });
        }
      };
      for (const selection of SELECTIONS) {
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        await page.waitForTimeout(300);
        await applySelection(page, orgSlug, 'diagram', selection);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await page.setViewportSize({ width: 1030, height: 600 });
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.waitForTimeout(600);
        await readAt200(text200, '1024x600@200%', selection, 'diagram');
        log(`${pointer} text200 ${selection} done`);
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);
      writeMeasurement(name, record);

      // ── The same by the route a browser's own text-size setting takes (`Page.setFontSizes`, which moves
      // the rem media queries as well), then put back.
      const planUrl = page.url();
      const cdp: CDPSession = await page.context().newCDPSession(page);
      const setFonts = (px: number, fixed: number): Promise<unknown> =>
        cdp.send('Page.setFontSizes', {
          fontSizes: { standard: px, fixed, serif: px, sansSerif: px },
        } as never);
      const rootPx = (): Promise<number> =>
        page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      await page.setViewportSize({ width: 1024, height: 600 });
      await setFonts(32, 26);
      await page.goto(planUrl);
      if ((await rootPx()) !== 32) {
        await setFonts(32, 26);
        await page.reload();
      }
      expect(await rootPx()).toBe(32);
      await page.waitForTimeout(800);
      await holdThePen(page);
      await installRules(page);
      for (const selection of SELECTIONS) {
        await applySelection(page, orgSlug, 'diagram', selection);
        await readAt200(text200cdp, '1024x600@200%cdp', selection, 'diagram');
        log(`${pointer} text200cdp ${selection} done`);
      }
      await setFonts(16, 13);
      await page.goto(planUrl);
      if ((await rootPx()) !== 16) {
        await setFonts(16, 13);
        await page.reload();
      }
      expect(await rootPx()).toBe(16);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(800);
      await holdThePen(page);
      await installRules(page);
      writeMeasurement(name, record);

      // ── R2 (Gantt): the same cells. The Gantt cannot clear a selection, so it goes selection-major.
      const clearButton = page
        .getByRole('button', { name: 'Clear selection', exact: true })
        .first();
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      if (await clearButton.isVisible()) await clearButton.click();
      await expect(page.locator('[role="toolbar"][aria-label^="Actions for"]')).toHaveCount(0);
      await showGantt(page);
      for (const selection of SELECTIONS) {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.waitForTimeout(500);
        await applySelection(page, orgSlug, 'gantt', selection);
        for (const cell of CELLS) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(600);
          await stripCells(ganttCells, cell.label, selection, 'gantt');
        }
        // R1 and R4 in the Gantt (root font size; M0b never read it at 200 %). The Gantt's selection
        // cannot be cleared, so the 200 % read rides on the same selection-major pass.
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
        await page.setViewportSize({ width: 1030, height: 600 });
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.waitForTimeout(600);
        await readAt200(ganttText200, '1024x600@200%', selection, 'gantt');
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '';
        });
        log(`${pointer} gantt ${selection} done`);
        writeMeasurement(name, record);
      }

      // ── R3: the facts widened by the schedule-state region (mouse only, as the amendment words it).
      // An activity created through the API after the last calculation is "Edited since it was last
      // calculated" plus a Recalculate button once the page is reloaded; nothing recalculates it.
      if (pointer === 'fine') {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.getByRole('button', { name: 'Diagram', exact: true }).click();
        await seedActivities(page, orgSlug, [{ name: 'Stale probe', laneIndex: 6 }]);
        await page.reload();
        await holdThePen(page);
        await installRules(page);
        await page.waitForTimeout(1500);
        const stateNow = await read(page, 'r3-state');
        record['r3State'] = factsOf(stateNow);
        for (const cell of FACTS_CELLS) {
          await page.setViewportSize({ width: cell.w, height: cell.h });
          await page.waitForTimeout(600);
          for (const selection of SELECTIONS) {
            await applySelection(page, orgSlug, 'diagram', selection);
            await stripCells(factsWidened, cell.label, selection, 'diagram', {
              factsVariant: 'stale-real',
            });
            // The widest honest sentence, put in by text (a failed calculation with edits pending).
            const realText = await page.evaluate(() => {
              const span = document.querySelector('[data-schedule-state] > span.ml-auto > span');
              const before = span?.textContent ?? '';
              if (span) span.textContent = 'Could not calculate — 12 edits still pending';
              return before;
            });
            await stripCells(factsWidened, cell.label, selection, 'diagram', {
              factsVariant: 'stale-widest-injected',
            });
            await page.evaluate((text: string) => {
              const span = document.querySelector('[data-schedule-state] > span.ml-auto > span');
              if (span) span.textContent = text;
            }, realText);
            log(`${pointer} facts ${cell.label} ${selection} done`);
          }
          writeMeasurement(name, record);
        }
      }
      // ── R0, controlled: the SAME clone of the Linked band at 1024 in the stale facts and again after the
      // real Recalculate button, so the one variable that changes is the facts' state.
      if (pointer === 'fine') {
        await applySelection(page, orgSlug, 'diagram', 'none');
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.waitForTimeout(600);
        const controlled = record['r0Controlled'] as Reading[];
        const linkedSentenceBand = messageTemplates[0];
        if (!linkedSentenceBand) throw new Error('no linked template');
        const readClone = async (what: string): Promise<void> => {
          await injectStrip(
            page,
            linkedSentenceBand.template,
            linkedSentenceBand.sentence,
            'shipped',
            'diagram',
          );
          await page.waitForTimeout(300);
          controlled.push({ what, ...(await read(page, 'r0c')) });
          await removeStrip(page);
        };
        await readClone('clone of the Linked band, stale facts, 1024x600');
        await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
        await expect(page.locator('[data-schedule-state="current"]')).toBeVisible({
          timeout: 20_000,
        });
        await page.waitForTimeout(500);
        await readClone('clone of the Linked band, after the Recalculate button, 1024x600');
      }
      writeMeasurement(name, record);
      expect(diagramCells.length).toBeGreaterThan(0);
    });
  });
}
