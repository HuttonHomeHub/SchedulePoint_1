import { expect, type Page, test } from '@playwright/test';

import { canvas, drawActivity, openNewPlan, startEditing } from '../e2e-authoring/support';
import {
  diagramList,
  ensurePen,
  placeViaApi,
  recalculate,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { readRows, settle, signUp, sweepRow } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0 / Task 0.2** (`docs/specs/placed-bar-follows-link/m0-measurement.md`):
 * does the draft copy fit the dock, and what does the label `Follow logic` do to the selection bar.
 *
 * **The copy is INJECTED, not shipped.** The strips do not exist in the product yet, so each one is
 * a clone of the REAL `canvas-mode-band` confirmation (a real `NoticeStrip` with a real `Button`),
 * captured from the running page after a real Link-tool link, with its sentence and buttons
 * replaced by the spec's draft copy (§4.6) and put into the real dock outlet. Layout is the
 * product's own: the outlet, the foot row, the stage and the selection bar are all real. What is
 * NOT the product: the sentence and the button labels, and that nothing here is wired to anything.
 *
 * The `truncate` and `grow` message fits are both read, because `NoticeStrip`'s default truncates
 * (`min-w-0 truncate`) and a strip that truncates its one sentence is a different finding from one
 * that wraps. A harness, not a gate (ADR-0081 §3).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1912x1080', w: 1912, h: 1080 },
];

const VARIANTS = [
  // CONTROL: the shipped Link confirmation's own words and its one button, in the same clone path. If
  // this overflows the outlet too, the overflow is today's product and not the draft copy's doing.
  {
    id: 'control-shipped-linked-band',
    text: 'Linked “Excavate” → “Pour slab” (FS).',
    buttons: ['Undo'],
    dashed: false,
  },
  {
    id: 'edit-one',
    text: '“Pour slab” stays where you placed it, before its logic allows.',
    buttons: ['Follow logic', 'Keep it here'],
    dashed: false,
  },
  {
    id: 'edit-one-long-name',
    text: '“Install structural steel to level 3 east wing” stays where you placed it, before its logic allows.',
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

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0 width ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

/** Everything read in one place, in the page. Self-contained: Playwright serialises it. */
function readDock(arg: { tag: string }): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const stage = document.querySelector<HTMLElement>(
    'section[aria-label="Time-scaled logic diagram"]',
  );
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
  const strip = document.querySelector<HTMLElement>('[data-testid="m0-injected-strip"]');
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  const out: Reading = {
    tag: arg.tag,
    coarse: matchMedia('(pointer: coarse)').matches,
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footScrollsSideways: foot ? foot.scrollWidth > foot.clientWidth + 1 : null,
    stageH: stage ? r(stage.getBoundingClientRect().height) : null,
    outletW: outlet ? r(outlet.getBoundingClientRect().width) : null,
    outletH: outlet ? r(outlet.getBoundingClientRect().height) : null,
  };
  if (bar) {
    const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter((e) => {
      const b = e.getBoundingClientRect();
      return b.width > 1.5 && b.height > 1.5;
    });
    const remedy = bar.querySelector<HTMLElement>('[data-toolbar-item="clear-visual-placement"]');
    out['selectionBar'] = {
      lines: cluster(items.map((e) => e.getBoundingClientRect().top)).length,
      barW: r(bar.getBoundingClientRect().width),
      barH: r(bar.getBoundingClientRect().height),
      remedyW: remedy ? r(remedy.getBoundingClientRect().width) : null,
      remedyText: remedy ? (remedy.textContent ?? '').trim() : null,
    };
  }
  if (strip) {
    const sb = strip.getBoundingClientRect();
    const p = strip.querySelector<HTMLElement>('p');
    const buttons = [...strip.querySelectorAll<HTMLElement>('button')];
    // The sentence's natural width: a nowrap copy, measured and removed.
    let natural: number | null = null;
    if (p) {
      const probe = p.cloneNode(true) as HTMLElement;
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;flex:none;overflow:visible;max-width:none';
      p.parentElement?.appendChild(probe);
      natural = r(probe.getBoundingClientRect().width);
      probe.remove();
    }
    const footRect = foot?.getBoundingClientRect();
    out['strip'] = {
      w: r(sb.width),
      h: r(sb.height),
      left: r(sb.left),
      right: r(sb.right),
      textClientW: p ? r(p.clientWidth) : null,
      textNaturalW: natural,
      textTruncated: p ? p.scrollWidth > p.clientWidth + 1 : null,
      textLines: p
        ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight))
        : null,
      overflowsOutletBy: outlet
        ? r(Math.max(0, sb.right - outlet.getBoundingClientRect().right))
        : null,
      // A sibling of the outlet in the foot row (the facts, the handle) that the strip's box overlaps.
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
      buttons: buttons.map((b) => ({
        text: (b.textContent ?? '').trim(),
        // Is the control's own centre the thing a pointer would hit there?
        selfHit: (() => {
          const bb = b.getBoundingClientRect();
          const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
          return hit !== null && b.contains(hit);
        })(),
        w: r(b.getBoundingClientRect().width),
        h: r(b.getBoundingClientRect().height),
        // A control off the visible window or past the foot row's own edge is a clipped control.
        clipped:
          b.getBoundingClientRect().right > (footRect?.right ?? 0) + 1 ||
          b.getBoundingClientRect().right > window.innerWidth + 1 ||
          b.getBoundingClientRect().bottom > window.innerHeight + 1,
      })),
      onItsOwnLine:
        outlet !== null &&
        bar !== null &&
        Math.abs(sb.top - bar.getBoundingClientRect().top) > 4 &&
        sb.top >= bar.getBoundingClientRect().bottom - 2,
    };
  }
  return out;
}

/** Put one draft strip, cloned from the real band, into the real outlet. */
async function injectStrip(
  page: Page,
  template: string,
  variant: { id: string; text: string; buttons: readonly string[]; dashed: boolean },
  fit: 'truncate' | 'grow',
): Promise<void> {
  await page.evaluate(
    ({ html, v, f }) => {
      const foot = document.querySelector('[data-activities-bar]');
      const outlet = foot?.querySelector('div[class*="not-empty:min-w-"]');
      if (!outlet) throw new Error('no dock outlet');
      const holder = document.createElement('div');
      holder.innerHTML = html;
      const strip = holder.firstElementChild as HTMLElement;
      strip.setAttribute('data-testid', 'm0-injected-strip');
      if (v.dashed) strip.classList.add('border-dashed');
      const p = strip.querySelector('p');
      if (!p) throw new Error('template has no sentence');
      p.textContent = v.text;
      p.className = f === 'grow' ? 'flex-1' : 'min-w-0 truncate';
      const buttons = [...strip.querySelectorAll('button')];
      const first = buttons[0];
      if (!first) throw new Error('template has no button');
      for (const b of buttons) b.remove();
      for (const label of v.buttons) {
        const b = first.cloneNode(true) as HTMLElement;
        b.textContent = label;
        strip.appendChild(b);
      }
      outlet.appendChild(strip);
    },
    { html: template, v: variant, f: fit },
  );
}

async function removeStrip(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('[data-testid="m0-injected-strip"]')?.remove();
  });
}

/** Swap the remedy's label in the real bar (text node only) and put it back. */
async function setRemedyLabel(page: Page, label: string): Promise<boolean> {
  return page.evaluate((text) => {
    const item = document.querySelector('[data-toolbar-item="clear-visual-placement"]');
    if (!item) return false;
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (
        node.nodeValue?.trim() === 'Clear visual start' ||
        node.nodeValue?.trim() === 'Follow logic'
      ) {
        node.nodeValue = text;
        return true;
      }
      node = walker.nextNode();
    }
    return false;
  }, label);
}

async function selectByName(page: Page, org: string, name: string): Promise<void> {
  const row = (await readRows(page, org)).find((x) => x.name === name);
  if (!row) throw new Error(`no ${name}`);
  await diagramList(page).focus();
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 12; i += 1) {
    if ((await selectedActivityId(page)) === row.id) return;
    await page.keyboard.press('ArrowDown');
  }
  if ((await selectedActivityId(page)) !== row.id) throw new Error(`could not reach ${name}`);
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`follow-logic M0 width (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`dock fit of the draft copy, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(1_800_000);
      const name = `follow-logic-m0-width.${pointer}`;
      clearMeasurement(name);
      const record: Reading = { pointer, cells: [] as Reading[] };
      const cells = record['cells'] as Reading[];
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      const { orgSlug } = await signUp(
        page,
        Date.now() + (pointer === 'coarse' ? 3 : 0) + 55,
        'FollowW',
      );
      await openNewPlan(page);
      await startEditing(page);
      const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });

      await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
      await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
      await drawActivity(page, 'Task', 'Pour slab', { x: 440, y: 180 });
      await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });
      const drawn = await settle(
        page,
        orgSlug,
        (r) => r.length === 2 && r.every((x) => x.visualEffectiveStart !== null),
        'two bars',
      );
      await canvas(page).press('Escape');
      await canvas(page).press('Escape');
      const excavate = drawn.rows.find((x) => x.name === 'Excavate');
      const pour = drawn.rows.find((x) => x.name === 'Pour slab');
      if (!excavate || !pour) throw new Error('missing drawn rows');
      const A = await sweepRow(page, excavate.id, 120, 220);
      const B = await sweepRow(page, pour.id, 180, 440);
      await canvas(page).press('Escape');

      // A real Link-tool link, so the band the dock shows is the product's own: captured, not written.
      await page
        .getByRole('toolbar', { name: 'Plan commands' })
        .getByRole('button', { name: 'Link', exact: true })
        .click();
      await canvas(page).click({ position: { x: Math.round((A.min + A.max) / 2), y: 120 } });
      await canvas(page).click({ position: { x: Math.round((B.min + B.max) / 2), y: 180 } });
      await expect(page.getByTestId('canvas-mode-band')).toContainText('Linked', {
        timeout: 10_000,
      });
      const template = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"]')?.outerHTML ?? '',
      );
      expect(template).toContain('Undo');
      record['templateClasses'] = await page.evaluate(
        () => document.querySelector('[data-testid="canvas-mode-band"]')?.className ?? '',
      );
      await canvas(page).press('Escape');

      // Make Pour slab a placed, flagged bar: placed before its predecessor finishes.
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-06');
      await recalculate(page, orgSlug);
      await ensurePen(page);
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

      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(600);
        for (const selection of [
          'none',
          'placed-unflagged-selected',
          'flagged-bar-selected',
        ] as const) {
          if (selection === 'none') await page.keyboard.press('Escape');
          else
            await selectByName(
              page,
              orgSlug,
              selection === 'flagged-bar-selected' ? 'Pour slab' : 'Excavate',
            );
          await page.waitForTimeout(500);
          const base = await page.evaluate(readDock, { tag: 'base' });
          cells.push({ cell: cell.label, selection, variant: 'base', ...base });
          if (selection !== 'none') {
            // The selection bar's label: `Clear visual start` (shipped) against `Follow logic`.
            const swapped = await setRemedyLabel(page, 'Follow logic');
            await page.waitForTimeout(400);
            const after = await page.evaluate(readDock, { tag: 'follow-logic-label' });
            await setRemedyLabel(page, 'Clear visual start');
            await page.waitForTimeout(300);
            cells.push({ cell: cell.label, selection, variant: 'label-swap', swapped, ...after });
          }
          for (const variant of VARIANTS) {
            for (const fit of variant.id.startsWith('control')
              ? (['truncate'] as const)
              : (['truncate', 'grow'] as const)) {
              await injectStrip(page, template, variant, fit);
              await page.waitForTimeout(350);
              const reading = await page.evaluate(readDock, { tag: `${variant.id}/${fit}` });
              await removeStrip(page);
              cells.push({
                cell: cell.label,
                selection,
                variant: variant.id,
                fit,
                ...reading,
              });
            }
          }
          log(`${pointer} ${cell.label} ${selection} done`);
          writeMeasurement(name, record);
        }
      }
      writeMeasurement(name, record);
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
