import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  CODES_PLAN,
  calculateSeededPlan,
  cursorTo,
  diagramList,
  ensurePen,
  findBar,
  gutterLabels,
  openPlanId,
  openSeededPlan,
  option,
} from './support';

/**
 * **Swimlanes by a code** (`docs/specs/p6-activity-codes/`, M4, ADR-0081): the milestone's journey,
 * grown one step per task. It lives in the `e2e-swimlanes` suite, which already seeds a catalogue family
 * through the public API and turns on no flags, so it needs no config of its own (`m4-ui-design.md`
 * §11.5).
 *
 * The plan is the catalogue's `plan:capability-codes`. Until M4-T5 lights the **By code** card there
 * is no way to choose a code in the dialog, so this journey sets the plan's source the way a client
 * does: through the API, with the pen held. T3 asks only what the diagram draws from it.
 *
 * What only a browser can say is here: that a pointer drag across a code swimlane's edge is held while
 * it is in progress and nothing is refused by the server (m4-spec Q7), and that a keyboard nudge inside
 * the swimlane is one positions request.
 */

/** Every non-GET request that touches an activity, so "one request" is a fact about the wire. */
function recordActivityWrites(page: Page): { writes: string[]; failed: string[] } {
  const seen = { writes: [] as string[], failed: [] as string[] };
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/activities')) {
      seen.writes.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() !== 'GET' && request.url().includes('/activities') && !response.ok()) {
      seen.failed.push(`${String(response.status())} ${request.method()} ${request.url()}`);
    }
  });
  return seen;
}

/**
 * Switch the open plan's swimlanes to one code type, as the Swimlanes… dialog will in M4-T5: a plain
 * PATCH of the source and the type, carrying the version last read. The pen must be held.
 */
async function setSourceToCode(page: Page, orgSlug: string, typeName: string): Promise<void> {
  const planId = openPlanId(page);
  const failure = await page.evaluate(
    async ({ org, id, name }: { org: string; id: string; name: string }) => {
      const base = `/api/v1/organizations/${org}/plans/${id}`;
      const types = (await (
        await fetch(`${base}/code-types?values=none`, { credentials: 'include' })
      ).json()) as { data: { id: string; name: string }[] };
      const type = types.data.find((t) => t.name === name);
      if (!type) return `no code type named ${name}`;
      const plan = (await (await fetch(base, { credentials: 'include' })).json()) as {
        data: { version: number };
      };
      const response = await fetch(base, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          swimlaneSource: 'ACTIVITY_CODE',
          swimlaneCodeTypeId: type.id,
          version: plan.data.version,
        }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    { org: orgSlug, id: planId, name: typeName },
  );
  if (failure !== null) throw new Error(`setting the swimlane source was rejected: ${failure}`);
}

test.describe('swimlanes by a code', () => {
  test('a plan sourced from Area draws one swimlane per value in use, and holds a drag at the edge', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const orgSlug = await openSeededPlan(page, Date.now(), CODES_PLAN);
    await calculateSeededPlan(page);
    const list = diagramList(page);
    const wire = recordActivityWrites(page);

    await test.step('1. the source set through the API: the gutter reads the values in use, then No Area', async () => {
      await setSourceToCode(page, orgSlug, 'Area');
      await page.reload();
      await ensurePen(page);
      await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 30_000 });
      const labels = gutterLabels(page).getByRole('button');
      // L2 is a value of Area that nobody carries, so it is not a swimlane.
      await expect(labels).toHaveCount(4);
      for (const [index, name] of ['Ground floor', 'Level 1', 'Roof', 'No Area'].entries()) {
        await expect(labels.nth(index)).toContainText(name);
      }
      await expect(list.getByRole('group', { name: 'No Area', exact: true })).toBeVisible();
      for (const name of ['Cladding, in no area', 'Snagging, with no codes at all']) {
        await expect(
          list.getByRole('group', { name: 'No Area', exact: true }).getByRole('option'),
        ).toContainText([name], { timeout: 5_000 });
      }
    });

    await test.step('2. a drag past Level 1’s edge is held, and says why', async () => {
      const grabbed = await findBar(page, 'Steel frame');
      const region = (await page
        .locator('section[aria-label="Time-scaled logic diagram"]')
        .boundingBox())!;
      const failedBefore = wire.failed.length;
      const writesBefore = wire.writes.length;

      await page.mouse.move(grabbed.x, grabbed.y);
      await page.mouse.down();
      await page.mouse.move(grabbed.x, (grabbed.y + region.y + region.height) / 2, { steps: 6 });
      await page.mouse.move(grabbed.x, region.y + region.height - 6, { steps: 6 });
      // The positive control: held past the edge the cursor refuses, so a drag that never started (a
      // missed bar) cannot pass for one that was stopped.
      await expect
        .poll(() =>
          page
            .locator('section[aria-label="Time-scaled logic diagram"] canvas')
            .first()
            .evaluate((el) => (el as HTMLElement).style.cursor),
        )
        .toBe('not-allowed');
      await page.mouse.up();
      await expect(page.getByTestId('announcer')).toContainText(
        'This swimlane is made from Area, so the bar stays in it.',
      );
      await expect(option(page, 'Steel frame')).toContainText(/in Level 1/);
      expect(wire.failed.slice(failedBefore), 'no write of the drag was refused').toEqual([]);
      expect(wire.writes.slice(writesBefore), 'a held drag writes nothing').toEqual([]);
    });

    await test.step('3. a nudge inside Level 1 is one positions request', async () => {
      const writesBefore = wire.writes.length;
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Steel frame');
      await list.press('Alt+ArrowDown');
      await expect(option(page, 'Steel frame')).toContainText(/in Level 1, lane 2 of 2/);
      await expect
        .poll(() =>
          wire.writes.slice(writesBefore).filter((w) => /\/activities\/positions/.test(w)),
        )
        .toHaveLength(1);
      expect(wire.failed, 'the server accepted every write').toEqual([]);
    });

    await test.step('4. axe finds nothing with swimlanes from a code on', async () => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  });
});
