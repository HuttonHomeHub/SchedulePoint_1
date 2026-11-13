import { type CDPSession, expect, type Page, test } from '@playwright/test';

import { canvas, drawActivity, openNewPlan } from '../e2e-authoring/support';
import { ganttRow, showGantt } from '../e2e-gantt/support';
import { holdThePen } from '../e2e-support/pen';
import {
  diagramList,
  linkActivities,
  placeViaApi,
  recalculate,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { readRows, settle, signUp, sweepRow } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0b** (`docs/specs/placed-bar-follows-link/m0-measurement.md`, "M0b";
 * `amendment-1-offer-at-1024.md` section 4): does option A, "the offer takes a row of its own when it
 * does not fit beside the plan facts", hold the amendment's four stop rules?
 *
 * **Option A is INJECTED, not shipped; nothing under `apps/web/src` changes.** Each strip is a clone of
 * the REAL `NoticeStrip` the product renders (captured from the running page after a real Link-tool
 * link), with the draft copy and buttons swapped in, put into the real dock outlet. Option A is
 * three injected things and nothing else:
 *   1. `data-dock-row` on the strip;
 *   2. a stylesheet that is the compiled form of the outlet class `has-[[data-dock-row]]:basis-auto`
 *      (`.outlet:has([data-dock-row]) { flex-basis: auto }`, applied only while a marked strip is in it);
 *   3. the strip's message fit `grow` (the `<p>` is `flex-1`) and density `comfortable`
 *      (`items-start py-2` in place of `items-center justify-between py-1.5`).
 * The outlet, foot row, stage, selection bar, fonts and widths are the product's own. What is NOT the
 * product: the sentences and the button labels, and that nothing is wired to anything.
 *
 * The same harness reads, for Q3's register row, the three EXISTING foot messages with long names
 * (the bare Linked band, the layout-resolved notice, the undo result), as shipped, with `min-w-0`
 * added to the strip (the design review's suspected missing class), and with option A's marker.
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

// The alternative rule (stop rule 2's fallback) is read only where stop rule 2 asks about it.
const ALT_CELLS = new Set(['1120x700', '1250x800']);

const LONG_A = 'Install structural steel to level 3 west wings';
const LONG_B = 'Fabricate and erect precast stair cores, blk B';
const LONG_C = 'Commission the rooftop plant and chilled water loop';

const VARIANTS = [
  {
    id: 'edit-one',
    text: '“Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
  },
  {
    id: 'edit-one-long-name',
    text: `“${LONG_A}” stays where you placed it, before its logic allows.`,
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
  },
  {
    id: 'edit-several',
    text: '“Pour slab” and 2 others stay where you placed them, before their logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
  },
  {
    id: 'plan',
    text: '3 bars stay where they were placed, before their logic allows.',
    buttons: ['Follow logic', 'Dismiss'],
    dashed: true,
  },
  {
    id: 'link-confirmation-plus-offer',
    text: 'Linked “Excavate” → “Pour slab” (FS). “Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Undo', 'Follow logic', 'Keep it here'],
    dashed: false,
  },
] as const;

type Mode = 'A' | 'A-alt' | 'shipped' | 'shipped+min-w-0';

interface Sentence {
  text: string;
  buttons: readonly string[];
  dashed: boolean;
}

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0b ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const STRIP_ID = 'm0b-injected-strip';

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
  const strip = document.querySelector<HTMLElement>(arg.stripSelector);
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  const corner = document.querySelector<HTMLElement>(
    '[role="toolbar"][aria-label="Diagram viewport"]',
  );
  const out: Reading = {
    tag: arg.tag,
    view: diagramStage ? 'diagram' : grid ? 'gantt' : 'unknown',
    coarse: matchMedia('(pointer: coarse)').matches,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footScrollsSideways: foot ? foot.scrollWidth > foot.clientWidth + 1 : null,
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    stageH: stage ? r(stage.getBoundingClientRect().height) : null,
    outletW: outlet ? r(outlet.getBoundingClientRect().width) : null,
    outletH: outlet ? r(outlet.getBoundingClientRect().height) : null,
    outletBasis: outlet ? getComputedStyle(outlet).flexBasis : null,
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
  if (bar) {
    const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5;
    });
    out['selectionBar'] = {
      label: bar.getAttribute('aria-label'),
      lines: cluster(items.map((e) => e.getBoundingClientRect().top)).length,
      barW: r(bar.getBoundingClientRect().width),
      barH: r(bar.getBoundingClientRect().height),
    };
  }
  if (strip) {
    const sb = strip.getBoundingClientRect();
    const p = strip.querySelector<HTMLElement>('p');
    const buttons = [...strip.querySelectorAll<HTMLElement>('button')];
    const footRect = foot?.getBoundingClientRect();
    out['strip'] = {
      w: r(sb.width),
      h: r(sb.height),
      left: r(sb.left),
      right: r(sb.right),
      top: r(sb.top),
      textClientW: p ? r(p.clientWidth) : null,
      textTruncated: p ? p.scrollWidth > p.clientWidth + 1 : null,
      textLines: p
        ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))
        : null,
      minWidthComputed: getComputedStyle(strip).minWidth,
      overflowsOutletBy: outlet
        ? r(Math.max(0, sb.right - outlet.getBoundingClientRect().right))
        : null,
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
      buttons: buttons.map((b) => {
        const bb = b.getBoundingClientRect();
        const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
        return {
          text: (b.textContent ?? '').trim(),
          // Is the control's own centre the thing a pointer would hit there?
          selfHit: hit !== null && b.contains(hit),
          w: r(bb.width),
          h: r(bb.height),
          // A control off the visible window or past the foot row's own edge is a clipped control.
          clipped:
            bb.right > (footRect?.right ?? 0) + 1 ||
            bb.right > window.innerWidth + 1 ||
            bb.bottom > window.innerHeight + 1,
        };
      }),
      // The strip sits on a line below the selection bar, not beside it.
      belowSelectionBar: bar !== null ? sb.top >= bar.getBoundingClientRect().bottom - 2 : null,
      // The strip's line is above the plan facts (DOM order: outlet first).
      aboveFacts: (() => {
        const facts = outlet?.nextElementSibling;
        return facts ? sb.bottom <= facts.getBoundingClientRect().top + 2 : null;
      })(),
    };
  }
  return out;
}

async function read(page: Page, tag: string, stripSelector = `[data-testid="${STRIP_ID}"]`) {
  return page.evaluate(readDock, { tag, stripSelector });
}

/** Option A's outlet rule, in its compiled form. Present for the whole run: it matches only a marked strip. */
async function installRules(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'm0b-rules';
    style.textContent = [
      // `has-[[data-dock-row]]:basis-auto` on the outlet.
      '[data-activities-bar] > div[class*="not-empty:min-w-"]:not(.m0b-alt):has([data-dock-row]) { flex-basis: auto; }',
      // The stop-rule-2 alternative: the marker counts only when no selection bar is in the outlet.
      '[data-activities-bar] > div[class*="not-empty:min-w-"].m0b-alt:has([data-dock-row]):not(:has([data-dock-wide])) { flex-basis: auto; }',
    ].join('\n');
    document.head.appendChild(style);
  });
}

/** Put one strip, cloned from a real one, into the real outlet. */
async function injectStrip(
  page: Page,
  template: string,
  sentence: Sentence,
  mode: Mode,
): Promise<void> {
  await page.evaluate(
    ({ html, s, m, id }) => {
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
      for (const label of s.buttons) {
        const b = first.cloneNode(true) as HTMLElement;
        b.textContent = label;
        strip.appendChild(b);
      }
      if (m === 'A' || m === 'A-alt') {
        // grow + comfortable + the marker.
        p.className = 'flex-1';
        strip.classList.remove('items-center', 'justify-between', 'py-1.5');
        strip.classList.add('items-start', 'py-2');
        strip.setAttribute('data-dock-row', '');
        if (m === 'A-alt') outlet.classList.add('m0b-alt');
      } else {
        p.className = 'min-w-0 truncate';
        if (m === 'shipped+min-w-0') strip.classList.add('min-w-0');
      }
      outlet.appendChild(strip);
    },
    { html: template, s: sentence, m: mode, id: STRIP_ID },
  );
}

async function removeStrip(page: Page): Promise<void> {
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="${id}"]`)?.remove();
    document.querySelector('[data-activities-bar] > div.m0b-alt')?.classList.remove('m0b-alt');
  }, STRIP_ID);
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

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`follow-logic M0b (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`option A at 1024 and above, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(3_000_000);
      const name = `follow-logic-m0b-offer-row.${pointer}`;
      clearMeasurement(name);
      const record: Reading = {
        pointer,
        method:
          'option A injected: data-dock-row on the cloned strip + .outlet:has([data-dock-row]){flex-basis:auto} + grow + comfortable; nothing under apps/web/src changed',
        diagram: [] as Reading[],
        gantt: [] as Reading[],
        text200: [] as Reading[],
        text200cdp: [] as Reading[],
        existingMessages: [] as Reading[],
        live: [] as Reading[],
      };
      const diagramCells = record['diagram'] as Reading[];
      const ganttCells = record['gantt'] as Reading[];
      const text200 = record['text200'] as Reading[];
      const text200cdp = record['text200cdp'] as Reading[];
      const existing = record['existingMessages'] as Reading[];
      const live = record['live'] as Reading[];
      expect(LONG_A).toHaveLength(46);
      expect(LONG_B).toHaveLength(46);

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(
        page,
        Date.now() + (pointer === 'coarse' ? 7 : 0) + 77,
        'FollowB',
      );
      await openNewPlan(page);
      await holdThePen(page);
      const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
      const count = (n: number) =>
        expect(diagram.getByRole('option')).toHaveCount(n, { timeout: 15_000 });

      // ── The real undo result strip, with a long name: draw, then Ctrl+Z (the label is `Add “name”`).
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
      await page.setViewportSize({ width: 1024, height: 600 });
      await page.waitForTimeout(400);
      live.push({
        what: 'LIVE undo result strip, real long name',
        sentence: historySentence,
        cell: '1024x600',
        ...(await read(page, 'live-history', '[data-testid="canvas-history-result"]')),
      });
      await page.setViewportSize({ width: 1646, height: 1097 });
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
        (r) => r.length === 4 && r.every((x) => x.visualEffectiveStart !== null),
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

      // A real Link-tool link between the long-named bars: the real band, with long names.
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
      for (const cell of [CELLS[0]!, CELLS[1]!, CELLS[4]!, CELLS[6]!]) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        live.push({
          what: 'LIVE Linked band (Link tool armed), real long names, nothing selected',
          sentence: linkedSentence,
          cell: cell.label,
          ...(await read(page, 'live-linked', '[data-testid="canvas-mode-band"]')),
        });
      }
      await page.setViewportSize({ width: 1646, height: 1097 });
      await canvas(page).press('Escape');
      record['sentences'] = { linkedSentence, historySentence, historyButtons };

      // Pour slab placed before its predecessor finishes: a placed, flagged bar (as M0).
      await linkActivities(page, orgSlug, byName('Excavate').id, byName('Pour slab').id);
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-06');
      await recalculate(page, orgSlug);
      await holdThePen(page);
      const settled = await settle(
        page,
        orgSlug,
        (r) => r.find((x) => x.name === 'Pour slab')?.visualConflictReason === 'EARLIER_THAN_LOGIC',
        'Pour slab flagged',
      );
      record['fixture'] = settled.rows.map((x) => ({
        name: x.name,
        placed: x.visualStart,
        reason: x.visualConflictReason,
      }));
      await installRules(page);

      const sweepCells = async (
        view: 'diagram' | 'gantt',
        sink: Reading[],
        cells: readonly Cell[],
      ): Promise<void> => {
        // The Gantt cannot clear a selection (see `applySelection`), so it goes selection-major: the
        // selection is made once per pass at a roomy size and survives the resizes.
        const readOne = async (cell: Cell, selection: Selection): Promise<void> => {
          const base = await read(page, 'base');
          sink.push({ cell: cell.label, selection, variant: 'base', mode: 'none', ...base });
          const modes: Mode[] =
            pointer === 'fine' && ALT_CELLS.has(cell.label) && selection !== 'none'
              ? ['A', 'A-alt']
              : ['A'];
          for (const variant of VARIANTS) {
            for (const mode of modes) {
              await injectStrip(page, linkedTemplate, variant, mode);
              await page.waitForTimeout(300);
              const reading = await read(page, `${variant.id}/${mode}`);
              await removeStrip(page);
              sink.push({ cell: cell.label, selection, variant: variant.id, mode, ...reading });
            }
          }
          log(`${pointer} ${view} ${cell.label} ${selection} done`);
        };
        if (view === 'diagram') {
          for (const cell of cells) {
            await page.setViewportSize({ width: cell.w, height: cell.h });
            await page.waitForTimeout(600);
            for (const selection of SELECTIONS) {
              await applySelection(page, orgSlug, view, selection);
              await readOne(cell, selection);
            }
            writeMeasurement(name, record);
          }
          return;
        }
        for (const selection of SELECTIONS) {
          await page.setViewportSize({ width: 1646, height: 1097 });
          await page.waitForTimeout(500);
          await applySelection(page, orgSlug, view, selection);
          for (const cell of cells) {
            await page.setViewportSize({ width: cell.w, height: cell.h });
            await page.waitForTimeout(600);
            await readOne(cell, selection);
          }
          writeMeasurement(name, record);
        }
      };

      // ── Diagram: seven widths, three selection states, five variants.
      await sweepCells('diagram', diagramCells, CELLS);

      // ── The three existing foot messages with long names (Q3): as shipped, with `min-w-0` on the
      // strip, and with option A's marker. Sentences are the product's own, built from long names.
      const MESSAGES: { id: string; template: string; sentence: Sentence }[] = [
        {
          id: 'bare-linked',
          template: linkedTemplate,
          sentence: { text: linkedSentence, buttons: ['Undo'], dashed: false },
        },
        {
          id: 'undo-result',
          template: historyTemplate,
          sentence: { text: historySentence, buttons: historyButtons, dashed: false },
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
          },
        },
      ];
      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(600);
        for (const selection of ['none', 'flagged-bar-selected'] as const) {
          await applySelection(page, orgSlug, 'diagram', selection);
          const base = await read(page, 'base');
          existing.push({ cell: cell.label, selection, message: 'none', mode: 'none', ...base });
          for (const message of MESSAGES) {
            for (const mode of ['shipped', 'shipped+min-w-0', 'A'] as const) {
              await injectStrip(page, message.template, message.sentence, mode);
              await page.waitForTimeout(300);
              const reading = await read(page, `${message.id}/${mode}`);
              await removeStrip(page);
              existing.push({
                cell: cell.label,
                selection,
                message: message.id,
                sentence: message.sentence.text,
                mode,
                ...reading,
              });
            }
          }
          log(`${pointer} existing ${cell.label} ${selection} done`);
        }
        writeMeasurement(name, record);
      }

      // ── 200 % text at 1024 x 600 (the root font size, as a user style sheet would set it). The selection
      // is made at 100 %, because the listbox cannot take focus once the root is 200 %.
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
        const base = await read(page, 'base');
        text200.push({ cell: '1024x600@200%', selection, variant: 'base', mode: 'none', ...base });
        for (const variant of VARIANTS) {
          await injectStrip(page, linkedTemplate, variant, 'A');
          await page.waitForTimeout(300);
          const reading = await read(page, `${variant.id}/A`);
          await removeStrip(page);
          text200.push({
            cell: '1024x600@200%',
            selection,
            variant: variant.id,
            mode: 'A',
            ...reading,
          });
        }
        log(`${pointer} text200 ${selection} done`);
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);
      writeMeasurement(name, record);

      // ── 200 % text again by the route a browser's own text-size setting takes (`Page.setFontSizes`,
      // which moves the rem media queries as well, unlike the root font-size above), then put back.
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
        const base = await read(page, 'base');
        text200cdp.push({
          cell: '1024x600@200%cdp',
          selection,
          variant: 'base',
          mode: 'none',
          ...base,
        });
        for (const variant of VARIANTS) {
          await injectStrip(page, linkedTemplate, variant, 'A');
          await page.waitForTimeout(300);
          const reading = await read(page, `${variant.id}/A`);
          await removeStrip(page);
          text200cdp.push({
            cell: '1024x600@200%cdp',
            selection,
            variant: variant.id,
            mode: 'A',
            ...reading,
          });
        }
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

      // ── Gantt: the same cells.
      const clearButton = page
        .getByRole('button', { name: 'Clear selection', exact: true })
        .first();
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      if (await clearButton.isVisible()) await clearButton.click();
      await expect(page.locator('[role="toolbar"][aria-label^="Actions for"]')).toHaveCount(0);
      await showGantt(page);
      await sweepCells('gantt', ganttCells, CELLS);
      writeMeasurement(name, record);
      expect(diagramCells.length).toBeGreaterThan(0);
    });
  });
}
