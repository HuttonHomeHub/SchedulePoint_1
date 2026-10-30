import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { drawActivity } from '../e2e-authoring/support';
import { expect, test } from '../e2e-support/test';
import { planCommands } from '../e2e-support/toolbar';

import {
  CODES_PLAN,
  calculateSeededPlan,
  cursorTo,
  diagramList,
  ensurePen,
  findBar,
  gutterLabels,
  openActivityEditor,
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
 * **M4-T4 adds the writes** (second test): Move to swimlane…, the editor's Save codes, Set code… and a bar
 * drawn in a band all write the code, each as one request carrying the lanes that keep the rest of the
 * diagram still, and Undo takes each back in one step.
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

/** Each activity's stored code values and lanes by the activity's own code (`CD_3`), from the API. */
async function storedByCode(
  page: Page,
  orgSlug: string,
): Promise<
  Record<
    string,
    {
      name: string;
      codes: { codeTypeId: string; codeValueId: string }[];
      lanes: { codeTypeId: string; codeValueId: string | null; laneIndex: number }[];
    }
  >
> {
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
        data: {
          code: string;
          name: string;
          codes?: { codeTypeId: string; codeValueId: string }[];
          codeSwimlaneLanes?: {
            codeTypeId: string;
            codeValueId: string | null;
            laneIndex: number;
          }[];
        }[];
      };
      return Object.fromEntries(
        body.data.map((a) => [
          a.code,
          { name: a.name, codes: a.codes ?? [], lanes: a.codeSwimlaneLanes ?? [] },
        ]),
      );
    },
    { org: orgSlug, id: planId },
  );
}

/** The plan's Area type and its values' ids, by short code, from the API. */
async function areaOf(
  page: Page,
  orgSlug: string,
): Promise<{ typeId: string; values: Record<string, string> }> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const base = `/api/v1/organizations/${org}/plans/${id}/code-types`;
      const types = (await (
        await fetch(`${base}?values=none`, { credentials: 'include' })
      ).json()) as {
        data: { id: string; name: string }[];
      };
      const area = types.data.find((t) => t.name === 'Area')!;
      const values = (await (
        await fetch(`${base}/${area.id}/values`, { credentials: 'include' })
      ).json()) as { data: { id: string; shortCode: string }[] };
      return {
        typeId: area.id,
        values: Object.fromEntries(values.data.map((v) => [v.shortCode, v.id])),
      };
    },
    { org: orgSlug, id: planId },
  );
}

/** Open a Combobox with the keyboard and commit the option whose text matches (inside its own list). */
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

/** Every option's sentence in this plan's list, keyed by the activity's name (the text before ", CD_n"). */
async function codePlanSentences(page: Page): Promise<Map<string, string>> {
  const texts = await diagramList(page).getByRole('option').allTextContents();
  return new Map(texts.map((t) => [t.split(/, CD_\d/)[0]!, t]));
}

test.describe('writes under a code source', () => {
  test('Move to swimlane…, Save codes, Set code… and a drawn bar write Area and keep the diagram still', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const orgSlug = await openSeededPlan(page, Date.now() + 1, CODES_PLAN);
    await calculateSeededPlan(page);
    const area = await areaOf(page, orgSlug);
    await setSourceToCode(page, orgSlug, 'Area');
    await page.reload();
    await ensurePen(page);
    await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 30_000 });
    const list = diagramList(page);
    const wire = recordActivityWrites(page);
    const bodies: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/activities')) {
        bodies.push({ url: request.url(), method: request.method(), body: request.postData() });
      }
    });
    const codesWrites = (): typeof bodies =>
      bodies.filter((b) => /\/activities\/codes$/.test(b.url) && b.method === 'PATCH');
    const gutter = gutterLabels(page).getByRole('button');
    await expect(gutter).toHaveCount(4);

    await test.step('1. Move to swimlane… ▸ Roof on CD_8: ONE codes request with lanes, CD_8 reads Roof, one Undo returns it', async () => {
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Snagging');
      const bar = page.getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' });
      await bar.getByRole('button', { name: 'Move to swimlane…' }).click();
      const popover = page.getByRole('dialog', { name: 'Move to swimlane…' });
      // The choices are the bands on screen and "No Area": Level 2 is a value nobody carries.
      await expect(popover.getByLabel('Move to', { exact: true }).locator('option')).toHaveText([
        'Choose a swimlane',
        'Ground floor',
        'Level 1',
        'Roof',
        'No Area',
      ]);
      await popover.getByLabel('Move to', { exact: true }).selectOption({ label: 'Roof' });
      const before = codesWrites().length;
      await popover.getByRole('button', { name: 'Move', exact: true }).click();
      await expect(popover).toBeHidden();
      await expect
        .poll(async () =>
          (await storedByCode(page, orgSlug))['CD_8']?.codes.map((c) => c.codeValueId),
        )
        .toContain(area.values['RF']);
      expect(codesWrites().length - before, 'one codes request').toBe(1);
      const sent = JSON.parse(codesWrites().at(-1)!.body!) as {
        lanes?: { id: string }[];
        lanesCodeTypeId?: string;
      };
      expect(sent.lanesCodeTypeId).toBe(area.typeId);
      expect(sent.lanes?.length ?? 0, 'the mover is placed').toBeGreaterThan(0);
      expect(
        bodies.filter((b) => /\/activities\/positions$/.test(b.url)),
        'no positions write beside it',
      ).toEqual([]);
      await expect(option(page, 'Snagging')).toContainText(/in Roof/);

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () => (await storedByCode(page, orgSlug))['CD_8']?.codes.length ?? 0)
        .toBe(0);
      await expect(option(page, 'Snagging')).toContainText(/in No Area/);
    });

    await test.step('2. the editor on CD_4: the Swimlane line is read-only; Area = Ground floor ▸ Save codes moves CD_4 and nothing else', async () => {
      const sentences = await codePlanSentences(page);
      const editor = await openActivityEditor(page, 'First-fix services');
      const line = editor.getByRole('textbox', { name: 'Current swimlane' });
      await expect(line).toHaveValue('Level 1');
      await expect(line).toHaveAttribute('readonly', '');
      await expect(line).toHaveAccessibleDescription(
        'Swimlanes follow Area in this plan. Change it under Codes on this tab.',
      );
      // Once, with the editor open and its read-only line on screen.
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      const areas = editor.getByRole('combobox', { name: 'Area' });
      await chooseOption(page, areas, /Ground floor/);
      const before = codesWrites().length;
      await editor.getByRole('button', { name: 'Save codes' }).click();
      await expect(editor.getByText('Saved.')).toBeVisible();
      expect(codesWrites().length - before, 'one codes request').toBe(1);
      await expect
        .poll(async () =>
          (await storedByCode(page, orgSlug))['CD_4']?.codes.map((c) => c.codeValueId),
        )
        .toContain(area.values['GF']);
      await editor.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(editor).toBeHidden();

      await expect(option(page, 'First-fix services')).toContainText(/in Ground floor/);
      const after = await codePlanSentences(page);
      // Nothing but the subject moved: every other bar reads the lane it read before.
      for (const name of ['Piling', 'Ground-bearing slab', 'Steel frame', 'Roof deck']) {
        expect(after.get(name), name).toBe(sentences.get(name));
      }

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect
        .poll(async () =>
          (await storedByCode(page, orgSlug))['CD_4']?.codes.map((c) => c.codeValueId),
        )
        .toContain(area.values['L1']);
    });

    await test.step('3. Set code… ▸ Area ▸ Level 2 on CD_8: a value nobody used gets its swimlane, and Undo takes it away', async () => {
      await list.focus();
      await list.press('Escape');
      await cursorTo(page, 'Snagging');
      const bar = page.getByRole('toolbar', { name: 'Actions for Snagging, with no codes at all' });
      await bar.getByRole('button', { name: 'Set code…' }).click();
      const panel = page.getByRole('dialog', { name: 'Set code…' });
      await panel.getByLabel('Code type', { exact: true }).selectOption({ label: 'Area' });
      await chooseOption(page, panel.getByRole('combobox', { name: 'Value' }), /Level 2/);
      await panel.getByRole('button', { name: 'Set Area' }).click();
      await expect(panel).toBeHidden();
      await expect(gutter).toHaveCount(5);
      await expect(gutterLabels(page)).toContainText('Level 2');
      await expect(option(page, 'Snagging')).toContainText(/in Level 2/);
      const last = JSON.parse(codesWrites().at(-1)!.body!) as { lanesCodeTypeId?: string };
      expect(last.lanesCodeTypeId).toBe(area.typeId);

      await planCommands(page)
        .getByRole('button', { name: /^Undo\b/ })
        .click();
      await expect(gutter).toHaveCount(4);
    });

    await test.step('4. a bar drawn in Level 1 is created carrying Area = Level 1, in one request', async () => {
      // Level 1's row is the gutter label's own: its centre is inside the swimlane's first lane.
      const level = (await gutterLabels(page)
        .getByRole('button', { name: /^Level 1/ })
        .boundingBox())!;
      const box = (await page
        .locator('section[aria-label="Time-scaled logic diagram"] canvas')
        .first()
        .boundingBox())!;
      const gutterBox = (await page.getByTestId('tsld-swimlane-gutter').boundingBox())!;
      // Before Steel frame starts: free in time, and inside the swimlane by its y.
      const created = page.waitForRequest(
        (request) => request.method() === 'POST' && /\/activities$/.test(request.url()),
      );
      await drawActivity(page, 'Task', 'Drawn in Level 1', {
        x: gutterBox.x + gutterBox.width + 80 - box.x,
        y: level.y + level.height / 2 - box.y,
      });
      const sent = JSON.parse((await created).postData()!) as {
        codes?: { codeTypeId: string; codeValueId: string }[];
        swimlaneId?: string;
      };
      expect(sent.codes).toEqual([{ codeTypeId: area.typeId, codeValueId: area.values['L1'] }]);
      expect(sent).not.toHaveProperty('swimlaneId');
      await expect(option(page, 'Drawn in Level 1')).toContainText(/in Level 1/);
      await expect
        .poll(async () => {
          const all = await storedByCode(page, orgSlug);
          return Object.values(all)
            .find((a) => a.name === 'Drawn in Level 1')
            ?.codes.map((c) => c.codeValueId);
        })
        .toContain(area.values['L1']);
      expect(wire.failed, 'the server accepted every write').toEqual([]);
    });
  });
});
