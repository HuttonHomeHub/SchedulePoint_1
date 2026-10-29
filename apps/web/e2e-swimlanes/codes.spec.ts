import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';
import { openPrintDocument } from '../e2e-support/print';
import { expect, test } from '../e2e-support/test';
import { planCommands, unfoldViewSections } from '../e2e-support/toolbar';

import {
  CODES_PLAN,
  calculateSeededPlan,
  cursorTo,
  diagramList,
  ensurePen,
  expectFocused,
  openPlanId,
  openSeededPlan,
} from './support';

/**
 * **Codes, in the Activities panel** (`docs/specs/p6-activity-codes/`, M3, ADR-0081): the milestone's
 * journey, grown one step per task. It lives in the `e2e-swimlanes` suite because that suite already
 * seeds a catalogue family through the public API, enforces the pen at the API and turns on no flags,
 * so it needs no config of its own (`m3-ui-design.md` §12, F7).
 *
 * The plan is the catalogue's `plan:capability-codes`: Area (GF, L1, L2, RF), Trade (CIV, STR, MEP,
 * ENV, FIN) and Phase (PH1 to PH3, carried by nobody), over eight activities. CD_3 and CD_4 and CD_5
 * carry L1, which is what makes "Delete L1" a statement with a number in it.
 *
 * **What a real browser is asked here** that jsdom cannot answer (ADR-0111): where focus lands when a
 * dialog opens, a value is added, a row is moved and a row is deleted; that a native `<dialog>` stacked
 * over another gives focus back; that both panes of the dialog scroll by themselves at 1024 x 600; and
 * that axe finds nothing in the open dialog. Unit tests hold the request counts: this suite raises the
 * API's rate limit to 300 a minute, so it cannot see the 100-a-minute budget the dialog is built around.
 */

const DIALOG = { name: 'Codes', exact: true } as const;

/** Show the Activities panel (folded by default) and open Codes… from its header. */
async function openCodes(page: Page): Promise<Locator> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
  await page.getByRole('button', { name: 'Codes…' }).click();
  const dialog = page.getByRole('dialog', DIALOG);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The short codes the open pane lists, in order. */
async function paneRows(dialog: Locator, typeName: string): Promise<string[]> {
  const table = dialog.getByRole('table', { name: `${typeName} values` });
  await expect(table).toBeVisible();
  return table.locator('tbody tr td:first-child').allTextContents();
}

/** Each activity's code values as the API stores them, by the activity's own code (`CD_3`). */
async function storedCodes(
  page: Page,
  orgSlug: string,
): Promise<Record<string, { codeTypeId: string; codeValueId: string }[]>> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`activities ${String(response.status)}: ${await response.text()}`);
      }
      const body = (await response.json()) as {
        data: { code: string; codes?: { codeTypeId: string; codeValueId: string }[] }[];
      };
      return Object.fromEntries(body.data.map((a) => [a.code, a.codes ?? []]));
    },
    { org: orgSlug, id: planId },
  );
}

/** The plan's code types by name, with the id of each, from the API. */
async function storedTypes(page: Page, orgSlug: string): Promise<Record<string, string>> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/code-types?values=none`,
        { credentials: 'include' },
      );
      const body = (await response.json()) as { data: { id: string; name: string }[] };
      return Object.fromEntries(body.data.map((t) => [t.name, t.id]));
    },
    { org: orgSlug, id: planId },
  );
}

test.describe('Codes…', () => {
  test('a planner manages the plan’s codes in one dialog, and each change is one undo step', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await openSeededPlan(page, Date.now(), CODES_PLAN);
    const types = await storedTypes(page, orgSlug);

    await test.step('1. without the pen: three tabs in order, Area’s values, and every write shaded with one sentence', async () => {
      const dialog = await openCodes(page);
      await expect(dialog.getByRole('tab')).toHaveText(['Area', 'Trade', 'Phase']);
      await expect(dialog.getByRole('tablist', { name: 'Code types' })).toBeVisible();
      expect(await paneRows(dialog, 'Area')).toEqual(['GF', 'L1', 'L2', 'RF']);
      // The first thing a keyboard reader lands on is the selected tab (focus rule 1).
      await expectFocused(page, dialog.getByRole('tab', { name: 'Area' }));
      await expect(dialog.getByText('Start editing to change codes.')).toHaveCount(1);
      for (const name of ['Add code type', 'Add value', 'Rename…', 'Delete…', 'Delete L1']) {
        const control = dialog.getByRole('button', { name });
        await expect(control).toHaveAttribute('aria-disabled', 'true');
        // Shaded, not disabled: the control stays in the tab order (ADR-0082). `toBeDisabled`
        // counts `aria-disabled`, so the native attribute is asserted directly.
        await expect(control).not.toHaveAttribute('disabled');
        await control.focus();
        await expect(control).toBeFocused();
      }
      await expect(dialog.getByLabel('New code type')).toHaveAttribute('readonly', '');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      // The dialog gives focus back to the button that opened it, loaded late as it is.
      await expectFocused(page, page.getByRole('button', { name: 'Codes…' }));
    });

    await ensurePen(page);

    await test.step('2. add a code type and a value: focus follows, and the field is ready for the next', async () => {
      const dialog = await openCodes(page);
      await dialog.getByLabel('New code type').fill('System');
      await dialog.getByRole('button', { name: 'Add code type' }).click();
      await expect(dialog.getByRole('tab', { name: 'System', selected: true })).toBeVisible();
      // The next thing to type is a value (focus rule 2).
      await expectFocused(page, dialog.getByLabel('Short code'));
      await dialog.getByLabel('Short code').fill('HVAC');
      await dialog.getByRole('button', { name: 'Add value' }).click();
      await expect(dialog.getByRole('heading', { name: 'System · 1 value' })).toBeVisible();
      expect(await paneRows(dialog, 'System')).toEqual(['HVAC']);
      await expect(dialog.getByLabel('Short code')).toHaveValue('');
      await expectFocused(page, dialog.getByLabel('Short code'));
    });

    await test.step('3. rename L2, and move RF up: focus stays on the control that moved', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      await dialog.getByRole('tab', { name: 'Area' }).click();
      expect(await paneRows(dialog, 'Area')).toEqual(['GF', 'L1', 'L2', 'RF']);
      await dialog.getByRole('button', { name: 'Edit L2' }).click();
      const edit = page.getByRole('dialog', { name: 'Edit value' });
      await edit.getByLabel('Short code').fill('L2A');
      await edit.getByRole('button', { name: 'Save' }).click();
      await expect(edit).toBeHidden();
      expect(await paneRows(dialog, 'Area')).toEqual(['GF', 'L1', 'L2A', 'RF']);
      await dialog.getByRole('button', { name: 'Move RF up' }).click();
      await expect.poll(() => paneRows(dialog, 'Area')).toEqual(['GF', 'L1', 'RF', 'L2A']);
      await expectFocused(page, dialog.getByRole('button', { name: 'Move RF up' }));
    });

    await test.step('4. delete L1: the confirmation counts its carriers, the API drops it from CD_3, focus lands on the next row', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      const area = types['Area']!;
      const before = await storedCodes(page, orgSlug);
      expect(before['CD_3']?.some((c) => c.codeTypeId === area)).toBe(true);
      await dialog.getByRole('button', { name: 'Delete L1' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Delete L1?' });
      await expect(confirm).toContainText(
        '3 activities use it. They will show no Area until you restore it.',
      );
      await confirm.getByRole('button', { name: 'Delete value' }).click();
      await expect(confirm).toBeHidden();
      await expect.poll(() => paneRows(dialog, 'Area')).toEqual(['GF', 'RF', 'L2A']);
      // At the API, not only on the screen: CD_3 reads as having no Area.
      const after = await storedCodes(page, orgSlug);
      expect(after['CD_3']?.some((c) => c.codeTypeId === area)).toBe(false);
      // The row after L1 was RF; its Delete takes focus (focus rule 5).
      await expectFocused(page, dialog.getByRole('button', { name: 'Delete RF' }));
    });

    await test.step('5. Undo brings L1 back, on CD_3, in one step', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      const area = types['Area']!;
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(dialog).toBeHidden();
      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () =>
          (await storedCodes(page, orgSlug))['CD_3']?.some((c) => c.codeTypeId === area),
        )
        .toBe(true);
      const reopened = await openCodes(page);
      await reopened.getByRole('tab', { name: 'Area' }).click();
      await expect.poll(() => paneRows(reopened, 'Area')).toContain('L1');
    });

    await test.step('6. deleting values hands focus to the next row’s Delete, and the last one to Add value', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      await dialog.getByRole('tab', { name: 'Phase' }).click();
      expect(await paneRows(dialog, 'Phase')).toEqual(['PH1', 'PH2', 'PH3']);
      for (const [gone, next] of [
        ['PH1', 'Delete PH2'],
        ['PH2', 'Delete PH3'],
      ] as const) {
        await dialog.getByRole('button', { name: `Delete ${gone}` }).click();
        await page
          .getByRole('alertdialog', { name: `Delete ${gone}?` })
          .getByRole('button', { name: 'Delete value' })
          .click();
        await expect(dialog.getByRole('button', { name: `Delete ${gone}` })).toHaveCount(0);
        await expectFocused(page, dialog.getByRole('button', { name: next }));
      }
      await dialog.getByRole('button', { name: 'Delete PH3' }).click();
      await page
        .getByRole('alertdialog', { name: 'Delete PH3?' })
        .getByRole('button', { name: 'Delete value' })
        .click();
      await expect(dialog.getByRole('button', { name: 'Delete PH3' })).toHaveCount(0);
      // Nothing left to delete: the next thing to do in this pane is add one.
      await expectFocused(page, dialog.getByLabel('Short code'));
    });

    await test.step('7. deleting a type focuses the neighbouring tab at once', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      await dialog.getByRole('button', { name: 'Delete…' }).click();
      await page
        .getByRole('alertdialog', { name: 'Delete Phase?' })
        .getByRole('button', { name: 'Delete code type' })
        .click();
      await expect(dialog.getByRole('tab', { name: 'Phase' })).toHaveCount(0);
      // Phase was followed by System, which takes the selection and the focus.
      await expectFocused(page, dialog.getByRole('tab', { name: 'System', selected: true }));
      await dialog.getByRole('button', { name: 'Delete…' }).click();
      await page
        .getByRole('alertdialog', { name: /^Delete System/ })
        .getByRole('button', { name: 'Delete code type' })
        .click();
      await expect(dialog.getByRole('tab', { name: 'System' })).toHaveCount(0);
      // System was last, so the previous tab takes it.
      await expectFocused(page, dialog.getByRole('tab', { name: 'Trade', selected: true }));
    });

    await test.step('8. restoring hands focus to the next Restore, and the last one to the list’s toggle', async () => {
      const dialog = page.getByRole('dialog', DIALOG);
      const toggle = dialog.getByRole('button', { name: /^Deleted code types/ });
      await toggle.click();
      const restores = dialog.getByRole('list', { name: 'Deleted code types' }).getByRole('button');
      await expect(restores).toHaveCount(2);
      await restores.first().click();
      await expect(restores).toHaveCount(1);
      await expectFocused(page, restores.first());
      await restores.first().click();
      await expect(dialog.getByText('Nothing deleted.')).toBeVisible();
      await expectFocused(page, dialog.getByRole('button', { name: /^Deleted code types/ }));
      await expect(dialog.getByRole('tab')).toHaveCount(4);
    });
  });
});

/**
 * **The floor** (1024 x 600, ADR-0179): both panes of the dialog scroll by themselves, so the rail's
 * Add form and the pane's Add value form stay reachable however long the values are, and the dialog
 * itself never scrolls. Neither is a unit-testable fact: they are about a real layout.
 */
test.describe('Codes… at the 1024 × 600 floor', () => {
  test('both panes scroll and both Add forms stay reachable', async ({ page }) => {
    test.setTimeout(240_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 1, CODES_PLAN);
    await ensurePen(page);
    const types = await storedTypes(page, orgSlug);
    const planId = openPlanId(page);
    // Enough values to overflow the pane at 600 px, made through the API: typing them would measure
    // the form, not the layout.
    const failures = await page.evaluate(
      async ({ org, id, area }: { org: string; id: string; area: string }) => {
        const bad: string[] = [];
        for (let i = 1; i <= 25; i += 1) {
          const response = await fetch(
            `/api/v1/organizations/${org}/plans/${id}/code-types/${area}/values`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ shortCode: `F${String(i).padStart(2, '0')}` }),
            },
          );
          if (!response.ok) bad.push(`${String(response.status)} ${await response.text()}`);
        }
        return bad;
      },
      { org: orgSlug, id: planId, area: types['Area']! },
    );
    expect(failures).toEqual([]);
    // Four deleted types, so the Deleted code types list has rows to push the Add form with.
    const leftovers = await page.evaluate(
      async ({ org, id }: { org: string; id: string }) => {
        const bad: string[] = [];
        const base = `/api/v1/organizations/${org}/plans/${id}/code-types`;
        for (let i = 1; i <= 4; i += 1) {
          const made = await fetch(base, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: `Gone ${String(i)}` }),
          });
          if (!made.ok) {
            bad.push(`create ${String(made.status)}`);
            continue;
          }
          const created = (await made.json()) as { data: { id: string; version: number } };
          const removed = await fetch(
            `${base}/${created.data.id}?version=${String(created.data.version)}`,
            { method: 'DELETE', credentials: 'include' },
          );
          if (!removed.ok) bad.push(`delete ${String(removed.status)}`);
        }
        return bad;
      },
      { org: orgSlug, id: planId },
    );
    expect(leftovers).toEqual([]);
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.waitForTimeout(500);

    const dialog = await openCodes(page);
    await expect(dialog.getByRole('heading', { name: 'Area · 29 values' })).toBeVisible();

    const metrics = await dialog.evaluate((el) => {
      const panel = el.querySelector<HTMLElement>('[role="tabpanel"]');
      const rail = el.querySelector<HTMLElement>('[role="tablist"]');
      return {
        dialogScrolls: el.scrollHeight - el.clientHeight,
        dialogHeight: el.getBoundingClientRect().height,
        viewport: window.innerHeight,
        paneScrolls: panel ? panel.scrollHeight - panel.clientHeight : -1,
        railOverflow: rail ? getComputedStyle(rail).overflowY : 'none',
      };
    });
    expect(metrics.dialogHeight, 'the dialog is taller than the window').toBeLessThanOrEqual(
      metrics.viewport,
    );
    expect(metrics.dialogScrolls, 'the dialog scrolls instead of its panes').toBeLessThanOrEqual(1);
    expect(metrics.paneScrolls, 'the pane does not scroll by itself').toBeGreaterThan(0);
    expect(metrics.railOverflow).toBe('auto');

    // The rail's Add form is under the tabs, in view with no scrolling; the pane's is reached by
    // scrolling the pane, and is then a pointer hit and not covered by anything.
    const expectReachable = async (when: string): Promise<void> => {
      for (const name of ['Add code type', 'Add value']) {
        const control = dialog.getByRole('button', { name });
        await control.scrollIntoViewIfNeeded();
        const hit = await control.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            ok: top !== null && (top === el || el.contains(top)),
            found:
              top === null
                ? 'nothing'
                : `${top.tagName.toLowerCase()} ${top.textContent ?? ''}`.slice(0, 60),
            box: `${String(Math.round(box.top))}-${String(Math.round(box.bottom))} of ${String(window.innerHeight)}`,
          };
        });
        expect(
          hit.ok,
          `${name} cannot be reached by a pointer ${when}: ${hit.found} at ${hit.box}`,
        ).toBe(true);
      }
    };
    await expectReachable('with the lists folded');

    // Both Deleted lists open: the rail's foot scrolls by itself and the Add form leads it, so the
    // longer list cannot push the form out of the window.
    await dialog.getByRole('button', { name: /^Deleted code types/ }).click();
    await expect(
      dialog.getByRole('list', { name: 'Deleted code types' }).getByRole('button'),
    ).toHaveCount(4);
    await dialog.getByRole('button', { name: /^Deleted values/ }).click();
    await expectReachable('with the Deleted lists open');
  });
});

/** Show the Activities panel (folded by default). */
async function showActivitiesPanel(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

/** The Activities table's cell for a row (found by the activity's name) under a column heading. */
async function tableCell(page: Page, rowName: string, heading: string): Promise<Locator> {
  const table = page.getByRole('table', { name: 'Activities' });
  const headings = await table.getByRole('columnheader').allTextContents();
  const index = headings.indexOf(heading);
  expect(index, `no "${heading}" column in ${headings.join(', ')}`).toBeGreaterThan(-1);
  return table.getByRole('row').filter({ hasText: rowName }).first().getByRole('cell').nth(index);
}

const GANTT_GRID = { name: 'Schedule as a bar chart' } as const;

/** Open View ▾ with every section unfolded, which opens the Codes list inside Columns. */
async function openViewColumns(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await unfoldViewSections(page);
  return page.getByRole('dialog', { name: /^View/ });
}

/**
 * **Code columns, in the table and in the Gantt, and on paper** (M3-T2, ADR-0081). Off by default; the
 * choice lives in the URL (`acodes` for the table, `gcodes` for the Gantt); a Gantt code cell is
 * read-only; and the printed programme carries the Gantt's switched-on columns. What only a browser can
 * say: that the pinned block does not paint over the chart, that the View panel stays inside a short
 * window however many types the plan has, and what the print stylesheet receives.
 */
test.describe('Code columns', () => {
  test('the table’s Columns menu, the Gantt’s View ▾ list, and the printed programme', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 2, CODES_PLAN);

    await test.step('1. nothing is shown by default; Columns ▸ Area shows it after WBS, and a reload keeps it', async () => {
      await showActivitiesPanel(page);
      const table = page.getByRole('table', { name: 'Activities' });
      await expect(table.getByRole('columnheader', { name: 'Area' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Code columns' }).click();
      const items = page.getByRole('menu', { name: 'Code columns' }).getByRole('menuitemcheckbox');
      await expect(items).toHaveText(['Area', 'Trade', 'Phase']);
      await page.getByRole('menuitemcheckbox', { name: 'Area' }).click();
      await expect(table.getByRole('columnheader', { name: 'Area' })).toBeVisible();
      await expect(await tableCell(page, 'Piling', 'Area')).toHaveText('Ground floor');
      await expect(await tableCell(page, 'Cladding, in no area', 'Area')).toHaveText('—');
      await expect(page).toHaveURL(/acodes=/);

      await page.reload();
      await showActivitiesPanel(page);
      await expect(table.getByRole('columnheader', { name: 'Area' })).toBeVisible();
      await expect(await tableCell(page, 'Piling', 'Area')).toHaveText('Ground floor');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    await test.step('2. Gantt ▸ View ▾ ▸ Columns ▸ Codes ▸ Trade: a read-only column that stops short of the chart', async () => {
      await page.goto(`${page.url().split('?')[0]}?view=gantt`);
      const grid = page.getByRole('treegrid', GANTT_GRID);
      await expect(grid.getByRole('row').nth(1)).toBeVisible({ timeout: 30_000 });
      await expect(grid.getByRole('columnheader', { name: 'Trade' })).toHaveCount(0);

      const panel = await openViewColumns(page);
      await panel.getByRole('checkbox', { name: 'Trade' }).click();
      await page.keyboard.press('Escape');
      await expect(grid.getByRole('columnheader', { name: 'Trade' })).toBeVisible();
      await expect(page).toHaveURL(/gcodes=/);

      const row = grid.getByRole('row').filter({ hasText: 'First-fix services' });
      const headings = await grid.getByRole('columnheader').allTextContents();
      const trade = headings.findIndex((h) => h === 'Trade');
      await expect(row.getByRole('gridcell').nth(trade)).toHaveText(
        'Mechanical, electrical and plumbing',
      );
      // Read-only: opening the cell offers no editor.
      await row.getByRole('gridcell').nth(trade).dblclick();
      await expect(row.getByRole('textbox')).toHaveCount(0);

      // The pinned block ends where the chart begins: the last code cell's right edge is not past the
      // Timeline header's left edge (the ADR-0095 Float incident, for a column that is not a GanttColumn).
      const edges = await page.evaluate(() => {
        const heads = [...document.querySelectorAll('[role="columnheader"]')];
        const timeline = heads.find((h) => h.textContent?.includes('Timeline'));
        const code = heads.find((h) => h.textContent === 'Trade');
        return {
          timelineLeft: timeline?.getBoundingClientRect().left ?? -1,
          codeRight: code?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
        };
      });
      expect(edges.codeRight).toBeLessThanOrEqual(edges.timelineLeft + 1);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    await test.step('3. Export ▸ Print… carries Trade after the standard headings, and CD_4’s row reads its value', async () => {
      // A plan seeded through the API has never been calculated, and Print… is shaded until it is.
      await calculateSeededPlan(page);
      await openPrintDocument(page);
      const head = page.locator('.gantt-print-root thead');
      const headings = (await head.locator('th').allTextContents()).slice(0, -1);
      expect(headings).toEqual([
        'Code',
        'Activity',
        'Duration',
        'Start',
        'Finish',
        'Float left',
        'Trade',
      ]);
      await expect(
        page.locator('.gantt-print-root tbody tr').filter({ hasText: 'First-fix services' }),
      ).toContainText('Mechanical, electrical and plumbing');
      // Three fit with no baseline, so nothing is left off and no sentence is printed.
      await expect(page.locator('.gantt-print-omitted')).toHaveCount(0);
    });

    await test.step('4. at 1024 × 600 the View panel does not grow with the number of types', async () => {
      await ensurePen(page);
      const planId = openPlanId(page);
      const addTypes = async (from: number, to: number): Promise<void> => {
        const failures = await page.evaluate(
          async ({ org, id, a, b }: { org: string; id: string; a: number; b: number }) => {
            const bad: string[] = [];
            for (let i = a; i <= b; i += 1) {
              const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/code-types`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: `Extra ${String(i).padStart(2, '0')}` }),
              });
              if (!response.ok) bad.push(`${String(response.status)} ${await response.text()}`);
            }
            return bad;
          },
          { org: orgSlug, id: planId, a: from, b: to },
        );
        expect(failures).toEqual([]);
      };
      const panelHeight = async (): Promise<number> => {
        await page.reload();
        const grid = page.getByRole('treegrid', GANTT_GRID);
        await expect(grid.getByRole('row').nth(1)).toBeVisible({ timeout: 30_000 });
        const panel = await openViewColumns(page);
        await expect(panel.getByRole('checkbox', { name: 'Extra 01' })).toBeVisible();
        const box = await panel.boundingBox();
        await page.keyboard.press('Escape');
        return box?.height ?? -1;
      };
      await page.setViewportSize({ width: 1024, height: 600 });
      await addTypes(1, 12);
      const twelve = await panelHeight();
      // The reload above released the pen; the second batch writes too.
      await ensurePen(page);
      await addTypes(13, 30);
      const thirty = await panelHeight();
      expect(twelve, 'the View panel has no height').toBeGreaterThan(0);
      expect(thirty, 'the View panel grew with the type count').toBeLessThanOrEqual(twelve + 1);
      expect(thirty).toBeLessThanOrEqual(600);
    });
  });
});

/** A type's live values (id by short code), from the API. */
async function storedValues(
  page: Page,
  orgSlug: string,
  typeId: string,
): Promise<Record<string, string>> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id, type }: { org: string; id: string; type: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/code-types/${type}/values`,
        { credentials: 'include' },
      );
      const body = (await response.json()) as { data: { id: string; shortCode: string }[] };
      return Object.fromEntries(body.data.map((v) => [v.shortCode, v.id]));
    },
    { org: orgSlug, id: planId, type: typeId },
  );
}

/** Each activity's code values by the activity's NAME, for a clone that has no code of its own. */
async function storedCodesByName(
  page: Page,
  orgSlug: string,
): Promise<Record<string, { codeTypeId: string; codeValueId: string }[]>> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      const body = (await response.json()) as {
        data: { name: string; codes?: { codeTypeId: string; codeValueId: string }[] }[];
      };
      return Object.fromEntries(body.data.map((a) => [a.name, a.codes ?? []]));
    },
    { org: orgSlug, id: planId },
  );
}

/** Open one activity's editor from its row's Actions menu in the Activities table. */
async function openEditorFor(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editor = activityEditor(page);
  await expect(editor).toBeVisible();
  return editor;
}

/**
 * Open a Combobox with the keyboard and commit the option whose text matches. The option is looked
 * up inside the listbox the picker controls, because the page holds other options (the diagram's
 * search list names "Roof deck" too).
 */
async function chooseOption(page: Page, picker: Locator, text: RegExp): Promise<void> {
  await picker.focus();
  await page.keyboard.press('ArrowDown');
  const listboxId = await picker.getAttribute('aria-controls');
  expect(listboxId, 'the picker names its listbox').toBeTruthy();
  await page
    .locator(`[id="${listboxId as string}"]`)
    .getByRole('option', { name: text })
    .click();
}

/**
 * **Setting codes: the editor, the table's ticked rows, undo, history and copy** (M3-T3, ADR-0081). What
 * only a browser can say: that the two Saves on General are separate requests with separate bodies, that
 * ticking two rows and pressing Set sends exactly ONE request (counted on the wire), that one Undo takes
 * both rows back, that History names the type and the value, and that a copy within the plan carries the
 * source's codes.
 */
test.describe('Setting codes', () => {
  test('the editor’s Codes section, the table’s Set Area, undo, history and a copy', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 3, CODES_PLAN);
    const types = await storedTypes(page, orgSlug);
    const trade = types['Trade']!;
    const area = types['Area']!;
    const tradeValues = await storedValues(page, orgSlug, trade);
    const areaValues = await storedValues(page, orgSlug, area);
    await ensurePen(page);
    await showActivitiesPanel(page);

    await test.step('1. the editor: Trade = MEP on CD_5, saved by Save codes alone, then read in History', async () => {
      const editor = await openEditorFor(page, 'Fit-out, in no trade');
      const trades = editor.getByRole('combobox', { name: 'Trade' });
      await expect(trades).toHaveValue('None');
      await chooseOption(page, trades, /MEP/);
      // Two Saves on General: only the codes one is pending.
      await expect(editor.getByRole('button', { name: 'Save general' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'PATCH') requests.push(request.url());
      });
      await editor.getByRole('button', { name: 'Save codes' }).click();
      await expect(editor.getByText('Saved.')).toBeVisible();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatch(/\/plans\/[0-9a-f-]{36}\/activities\/codes$/);
      expect((await storedCodes(page, orgSlug))['CD_5']).toContainEqual({
        codeTypeId: trade,
        codeValueId: tradeValues['MEP'],
      });

      await editor.getByRole('tab', { name: 'History' }).click();
      await expect(
        editor.getByText('Trade set to Mechanical, electrical and plumbing'),
      ).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await editor.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(editor).toBeHidden();
    });

    await test.step('2. Undo takes the editor’s save back in one step', async () => {
      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () =>
          (await storedCodes(page, orgSlug))['CD_5']?.some((c) => c.codeTypeId === trade),
        )
        .toBe(false);
    });

    await test.step('3. tick CD_7 and CD_8, Set Area to Roof: ONE request, both read Roof, one Undo returns both', async () => {
      await page.getByRole('checkbox', { name: 'Select Cladding, in no area' }).check();
      await page.getByRole('checkbox', { name: 'Select Snagging, with no codes at all' }).check();
      await page.getByLabel('Code type', { exact: true }).selectOption({ label: 'Area' });
      await chooseOption(page, page.getByRole('combobox', { name: 'Value' }), /Roof/);
      await expect(page.getByText('Sets Area to Roof on 2 activities.')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

      let writes = 0;
      page.on('request', (request) => {
        if (request.method() === 'PATCH' && /\/activities\/codes$/.test(request.url())) writes += 1;
      });
      await page.getByRole('button', { name: 'Set Area' }).click();
      await expect
        .poll(async () => (await storedCodes(page, orgSlug))['CD_8']?.map((c) => c.codeValueId))
        .toContain(areaValues['RF']);
      const stored = await storedCodes(page, orgSlug);
      expect(stored['CD_7']).toContainEqual({ codeTypeId: area, codeValueId: areaValues['RF'] });
      expect(writes).toBe(1);

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () => {
          const after = await storedCodes(page, orgSlug);
          return ['CD_7', 'CD_8'].map((k) => after[k]?.some((c) => c.codeTypeId === area));
        })
        .toEqual([false, false]);
    });

    await test.step('4. duplicating CD_1 within the plan: the copy carries Ground floor and Civil', async () => {
      await page.getByRole('button', { name: 'Actions for Piling' }).click();
      await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
      await expect(page.getByTestId('announcer')).toContainText('1 activity duplicated.');
      const copies = Object.entries(await storedCodesByName(page, orgSlug)).filter(
        ([name]) => name !== 'Piling' && name.startsWith('Piling'),
      );
      expect(copies).toHaveLength(1);
      expect(copies[0]?.[1]).toEqual(
        expect.arrayContaining([
          { codeTypeId: area, codeValueId: areaValues['GF'] },
          { codeTypeId: trade, codeValueId: tradeValues['CIV'] },
        ]),
      );
    });
  });
});

/**
 * **Set code… on the diagram's selection bars** (M3-T4, ADR-0081, the owner's second decision). The
 * single-activity bar and the plural bar open the same control the table does, so the journey asserts
 * what only a browser can: one request for the whole selection, one Undo for it, the panel handing focus
 * back to its trigger, Escape closing the open value list before the panel, and every control on the
 * single bar still reachable at the 1024 × 600 floor and at 1646.
 */
test.describe('Setting codes from the diagram', () => {
  test('the single bar, the plural bar, undo, Escape and the floor', async ({ page }) => {
    test.setTimeout(300_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 5, CODES_PLAN);
    const types = await storedTypes(page, orgSlug);
    const trade = types['Trade']!;
    const area = types['Area']!;
    const tradeValues = await storedValues(page, orgSlug, trade);
    const areaValues = await storedValues(page, orgSlug, area);
    await ensurePen(page);
    const list = diagramList(page);
    await list.focus();
    await list.press('Escape');

    await test.step('1. CD_8 on the diagram: Set code… ▸ Area ▸ Roof ▸ Set Area, then undo', async () => {
      await cursorTo(page, 'Snagging');
      const bar = page.getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' });
      const trigger = bar.getByRole('button', { name: 'Set code…' });
      await trigger.click();
      const panel = page.getByRole('dialog', { name: 'Set code…' });
      await expectFocused(page, panel.getByLabel('Code', { exact: true }));
      await panel.getByLabel('Code', { exact: true }).selectOption({ label: 'Area' });
      const value = panel.getByRole('combobox', { name: 'Value' });
      await chooseOption(page, value, /Roof/);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      await panel.getByRole('button', { name: 'Set Area' }).click();
      await expect
        .poll(async () => (await storedCodes(page, orgSlug))['CD_8']?.map((c) => c.codeValueId))
        .toContain(areaValues['RF']);
      await expect(panel).toBeHidden();
      await expectFocused(page, trigger);

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () => (await storedCodes(page, orgSlug))['CD_8']?.length ?? 0)
        .toBe(0);
    });

    await test.step('2. Escape closes the open value list first, then the panel', async () => {
      await cursorTo(page, 'Snagging');
      const bar = page.getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' });
      await bar.getByRole('button', { name: 'Set code…' }).click();
      const panel = page.getByRole('dialog', { name: 'Set code…' });
      await panel.getByLabel('Code', { exact: true }).selectOption({ label: 'Area' });
      const value = panel.getByRole('combobox', { name: 'Value' });
      await value.focus();
      await page.keyboard.press('ArrowDown');
      const values = page.getByRole('listbox', { name: /values$/ });
      await expect(values.getByRole('option', { name: /Roof/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(values).toBeHidden();
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });

    await test.step('3. three selected: Set code… ▸ Trade ▸ ENV ▸ Set Trade is ONE request, one Undo', async () => {
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Ground-bearing slab');
      await list.press('Shift+ArrowDown');
      await list.press('Shift+ArrowDown');
      const bar = page.getByTestId('bulk-selection-bar');
      await expect(bar).toContainText(/3 activities selected/);
      await bar.getByRole('button', { name: 'Set code…' }).click();
      const panel = page.getByRole('dialog', { name: 'Set code…' });
      await panel.getByLabel('Code', { exact: true }).selectOption({ label: 'Trade' });
      await chooseOption(page, panel.getByRole('combobox', { name: 'Value' }), /Building envelope/);
      let writes = 0;
      page.on('request', (request) => {
        if (request.method() === 'PATCH' && /\/activities\/codes$/.test(request.url())) writes += 1;
      });
      await panel.getByRole('button', { name: 'Set Trade' }).click();
      await expect
        .poll(async () => {
          const stored = await storedCodes(page, orgSlug);
          return ['CD_2', 'CD_3', 'CD_4'].map((k) =>
            stored[k]?.some((c) => c.codeValueId === tradeValues['ENV']),
          );
        })
        .toEqual([true, true, true]);
      expect(writes).toBe(1);

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () => {
          const stored = await storedCodes(page, orgSlug);
          return ['CD_2', 'CD_3', 'CD_4'].map((k) =>
            stored[k]?.some((c) => c.codeValueId === tradeValues['ENV']),
          );
        })
        .toEqual([false, false, false]);
    });

    await test.step('4. the single bar stays inside the viewport at 1024 × 600 and 1646', async () => {
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Snagging');
      for (const viewport of [
        { width: 1024, height: 600 },
        { width: 1646, height: 900 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(500);
        const buttons = page
          .getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' })
          .getByRole('button');
        const count = await buttons.count();
        expect(count).toBeGreaterThan(3);
        for (let i = 0; i < count; i += 1) {
          const box = await buttons.nth(i).boundingBox();
          if (box === null) continue;
          expect(box.x, `control ${String(i)} at ${String(viewport.width)}`).toBeGreaterThanOrEqual(
            0,
          );
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        }
        await expect(
          page
            .getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' })
            .getByRole('button', { name: 'Set code…' }),
        ).toBeVisible();
      }
    });
  });
});
