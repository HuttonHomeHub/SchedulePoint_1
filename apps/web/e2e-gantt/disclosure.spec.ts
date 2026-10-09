import { type Locator, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { unfoldViewSections } from '../e2e-support/toolbar';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  ganttRow,
  onboard,
  seedNestedWbs,
  startEditing,
} from './support';

/**
 * **The summary row's arrow is a 24 × 24 target beside the activity name** (ADR-0177 D4, Q-M2-1 = C;
 * `docs/specs/gantt-coarse-pointer/`, M2-T2).
 *
 * Asserted at both pointers because §2.5.8's floor holds at both, and at the extremes that broke the
 * old placement: depth 4, and the Code column at its 48 px minimum (typed, ADR-0173). The arrow used
 * to live in the Code column after the depth indent, where a 24 px box ran out of room at depth 4.
 *
 * Geometry is read from the browser, never restated: jsdom has no layout, so the unit suite
 * (`GanttPanel.disclosure.test.tsx`) asserts which element carries which class and this asserts what
 * that comes to on the page.
 */

const DEPTH_4 = 'Phase 5';

async function nestedPlan(page: Page): Promise<void> {
  // The product owner's Surface Pro width (ADR-0091's retrospective), as column-widths.spec.ts does.
  await page.setViewportSize({ width: 1646, height: 1097 });
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedNestedWbs(page, orgSlug);
  await expect(ganttGrid(page)).toBeVisible();
}

async function setCodeWidth(page: Page, width: number): Promise<void> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await unfoldViewSections(page);
  await page.getByRole('spinbutton', { name: 'Code width' }).fill(String(width));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () =>
        (await ganttGrid(page).getByRole('columnheader', { name: /Code/ }).first().boundingBox())
          ?.width,
    )
    .toBe(width);
}

const arrowOf = (page: Page, name: string): Locator =>
  ganttRow(page, name).locator('[data-gantt-disclosure]');

/** What `elementFromPoint` finds at the arrow's centre, as a verdict rather than a node. */
async function hitAtCentre(arrow: Locator): Promise<{ isArrow: boolean; tag: string }> {
  return arrow.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      isArrow: hit !== null && hit.closest('[data-gantt-disclosure]') === element,
      tag: hit === null ? 'none' : `${hit.tagName.toLowerCase()} ${hit.textContent ?? ''}`.trim(),
    };
  });
}

async function expectBox(page: Page, name: string, where: string): Promise<void> {
  const arrow = arrowOf(page, name);
  await expect(arrow, `${where}: ${name} has an arrow`).toHaveCount(1);
  const box = await arrow.boundingBox();
  expect(box, where).not.toBeNull();
  expect(box!.width, `${where}: width`).toBeGreaterThanOrEqual(24);
  expect(box!.height, `${where}: height`).toBeGreaterThanOrEqual(24);
  const hit = await hitAtCentre(arrow);
  expect(hit.isArrow, `${where}: the centre hits ${hit.tag}, not the arrow`).toBe(true);
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`${pointer} pointer`, () => {
    test.use({ hasTouch: pointer === 'coarse' });
    test.describe.configure({ mode: 'serial' });

    test(`the arrow is at least 24 x 24 at depth 0 and 4, with Code wide and at 48 px (${pointer})`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await nestedPlan(page);
      const media = await page.evaluate(
        (kind) => window.matchMedia(`(pointer: ${kind})`).matches,
        pointer,
      );
      expect(media, `the context must report a ${pointer} pointer`).toBe(true);

      for (const [label, width] of [
        ['Code at its default width', null],
        ['Code at 48 px', 48],
      ] as const) {
        if (width !== null) await setCodeWidth(page, width);
        await expectBox(page, 'Phase 1', `${pointer}, depth 0, ${label}`);
        await expectBox(page, DEPTH_4, `${pointer}, depth 4, ${label}`);
        // The leaf has the same slot, empty, and no arrow.
        await expect(arrowOf(page, 'Pour footing and backfill')).toHaveCount(0);
      }
    });

    test(`the name's x-offset grows with depth, and the Code cell is not indented (${pointer})`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await nestedPlan(page);
      const left = async (name: string): Promise<number> => {
        const text = ganttRow(page, name)
          .getByRole('gridcell', { name: new RegExp(`^${name}\\b`) })
          .getByText(name, { exact: true });
        const box = await text.boundingBox();
        if (box === null) throw new Error(`no box for ${name}`);
        return box.x;
      };
      const offsets = [];
      for (const name of ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5']) {
        offsets.push(await left(name));
      }
      for (let i = 1; i < offsets.length; i += 1) {
        expect(offsets[i]! - offsets[i - 1]!, `level ${i + 1} steps in by one indent`).toBe(14);
      }
      const codeCell = ganttRow(page, DEPTH_4).getByRole('gridcell').first();
      expect(await codeCell.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('8px');
    });

    test(`at the narrowest Activity width the name still truncates inside its cell (${pointer})`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await nestedPlan(page);
      // 160 px of Code leaves Activity at its 120 px floor (ADR-0173; column-widths.spec.ts).
      await setCodeWidth(page, 160);
      const cellOf = (name: string) =>
        ganttRow(page, name)
          .getByRole('gridcell', { name: new RegExp(`^${name}`) })
          .first();
      const cell = cellOf('Pour footing and backfill');
      // The clipper is the nearest box from the name outward that clips with an ellipsis: the cell
      // itself where the lead is an inline child, the name's own span where the cell holds a flex
      // row (an editable cell, whose lead sits beside the field and must not move when it opens).
      const verdict = await cell.evaluate((el) => {
        const text = [...el.querySelectorAll('span')].find(
          (sp) => sp.textContent === 'Pour footing and backfill',
        );
        let clipper: Element = el;
        for (let a: Element | null = text ?? null; a !== null; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (st.overflowX === 'hidden' && st.textOverflow === 'ellipsis') {
            clipper = a;
            break;
          }
          if (a === el) break;
        }
        const style = getComputedStyle(clipper);
        return {
          overflow: style.overflowX,
          ellipsis: style.textOverflow,
          clipped: clipper.scrollWidth > clipper.clientWidth,
          width: Math.round(el.getBoundingClientRect().width),
          spilled: el.scrollWidth > el.clientWidth,
        };
      });
      expect(verdict.width).toBe(120);
      expect(verdict.overflow).toBe('hidden');
      expect(verdict.ellipsis).toBe('ellipsis');
      expect(
        verdict.clipped,
        'the long name is cut by its clipper, not spilled into the next',
      ).toBe(true);
      expect(verdict.spilled, 'nothing spills out of the cell itself').toBe(false);
      // Depth changes the cell's contents and nothing about its identity: the same title as a
      // depth-0 summary's cell (both writable, so both none).
      expect(await cellOf(DEPTH_4).getAttribute('title')).toBe(
        await cellOf('Phase 1').getAttribute('title'),
      );
    });
  });
}
