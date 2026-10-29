import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { planCommands } from '../e2e-support/toolbar';

import { CODES_PLAN, ensurePen, expectFocused, openPlanId, openSeededPlan } from './support';

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
        await expect(control).not.toBeDisabled();
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
        '3 activities carry it. They will read as having no Area until you restore it.',
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
      expect(hit.ok, `${name} cannot be reached by a pointer: ${hit.found} at ${hit.box}`).toBe(
        true,
      );
    }
  });
});
