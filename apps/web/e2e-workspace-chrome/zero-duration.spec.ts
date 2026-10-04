import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  findBarWide,
  linkActivities,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  selectedActivityId,
} from './support';

/**
 * **A zero-duration task converted in the editor keeps its place in the schedule**
 * (`docs/specs/zero-duration-task/`, ADR-0162; M2's journey step, extended by M4).
 *
 * The entry point is the one a planner already has: the activity editor's **Type** field, then
 * **Save** on the General tab. M0-T3 measured the defect through the API (the successor moved from
 * Monday 12 to Tuesday 13 January); this drives the same conversion through the real editor, with
 * the pen enforced at the API, and reads the result back **through the API** rather than the DOM
 * under test, because the claim is about what the server stored.
 *
 * The fixture is M0-T3's: `PRE` ends Friday 9 January, `Z` is a zero-duration task placed on and
 * constrained to Monday 12 (so both kinds of stored date are exercised), and `SUCC` follows it. The
 * plan takes the organisation's Monday–Friday default, which is what puts a weekend between Friday
 * and Monday — the shape that made the old move a whole working day.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 3400;

interface Row {
  id: string;
  name: string;
  type: string;
  version: number;
  updatedAt: string;
  earlyStart: string | null;
  constraintDate: string | null;
  visualStart: string | null;
}

/** The label the bar's icon-only control is named by and the menus print (M4-T2). */
const MAKE_MILESTONE = 'Make milestone…';

/** The collapsed activities bar at the foot of the workspace — the dock's host (ADR-0092). */
function footRow(page: Page) {
  return page.locator('[data-activities-bar]');
}

async function footRowHeight(page: Page): Promise<number> {
  const box = await footRow(page).boundingBox();
  if (!box) throw new Error('the activities bar has no bounding box');
  return Math.round(box.height);
}

/**
 * A control's pointer target: at least 24 × 24 (WCAG 2.5.8) and the element a pointer at its
 * centre actually hits. axe cannot assert this here — `target-size` is off in this repository's
 * configuration (ADR-0090 M5) — and `e2e-workspace-fit` sweeps the deck, not the dock.
 */
async function expectReachableTarget(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('the control has no bounding box');
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  const hit = await locator.evaluate(
    (el, [x, y]) => {
      const target = document.elementFromPoint(x as number, y as number);
      return target !== null && (target === el || el.contains(target));
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe(true);
}

/** One resource, assigned to one activity, through the public API. */
async function assignResource(page: Page, orgSlug: string, activityId: string): Promise<void> {
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const res = await fetch(`/api/v1/organizations/${org}/resources`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Crew ${String(Date.now())}`, kind: 'LABOUR' }),
      });
      if (!res.ok) throw new Error(`resource ${String(res.status)} ${await res.text()}`);
      const resourceId = ((await res.json()) as { data: { id: string } }).data.id;
      const assign = await fetch(`/api/v1/organizations/${org}/activities/${id}/assignments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceId, budgetedUnits: 1, isDriving: false }),
      });
      if (!assign.ok) throw new Error(`assign ${String(assign.status)} ${await assign.text()}`);
    },
    { org: orgSlug, id: activityId },
  );
}

/** A row with the two fields a write necessarily moves removed, for a byte-identity comparison. */
function comparable(row: Row | undefined): Omit<Row, 'version' | 'updatedAt'> | undefined {
  if (!row) return undefined;
  const { version: _version, updatedAt: _updatedAt, ...rest } = row;
  return rest;
}

/** Create one activity with an arbitrary body in the open plan; the response is checked. */
async function createActivity(page: Page, orgSlug: string, body: object): Promise<Row> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id, payload }: { org: string; id: string; payload: object }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(`create ${String(response.status)} ${await response.text()}`);
      return ((await response.json()) as { data: Row }).data;
    },
    { org: orgSlug, id: planId, payload: body },
  );
}

/** Every activity in the open plan, keyed by name, straight from the API. */
async function rowsByName(page: Page, orgSlug: string): Promise<Map<string, Row>> {
  const planId = openPlanId(page);
  const rows = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) throw new Error(`list ${String(response.status)}`);
      return ((await response.json()) as { data: Row[] }).data;
    },
    { org: orgSlug, id: planId },
  );
  return new Map(rows.map((r) => [r.name, r]));
}

test.describe('A zero-duration task converted in the editor', () => {
  test('keeps its successor on the same day, and the stored dates are re-expressed', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP);
    await createHierarchy(page);
    await newPlan(page, 'Zero-duration conversion');
    await ensurePen(page);

    const pre = await createActivity(page, orgSlug, { name: 'Pre', durationDays: 5, laneIndex: 0 });
    const z = await createActivity(page, orgSlug, {
      name: 'Handover',
      durationDays: 0,
      laneIndex: 1,
      constraintType: 'SNET',
      constraintDate: '2026-01-12',
      visualStart: '2026-01-12',
    });
    const succ = await createActivity(page, orgSlug, {
      name: 'Succ',
      durationDays: 1,
      laneIndex: 2,
    });
    await linkActivities(page, orgSlug, pre.id, z.id);
    await linkActivities(page, orgSlug, z.id, succ.id);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    const before = await rowsByName(page, orgSlug);
    // The fixture, before anything is concluded from it: the successor starts the day Z is pinned to.
    expect(before.get('Succ')?.earlyStart?.slice(0, 10)).toBe('2026-01-12');

    await findBarWide(page, z.id);
    const dock = page.getByRole('toolbar', { name: /^Actions for / });
    await dock.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const type = dialog.getByLabel('Type', { exact: true });
    await type.selectOption('FINISH_MILESTONE');
    // The hint says so before the save, linked to the control it is about.
    await expect(type).toHaveAccessibleDescription(/its dates will be re-expressed/i);
    await dialog.getByRole('button', { name: /save general/i }).click();
    await expect(dialog.getByText('Saved.')).toBeVisible();

    // Read back through the API. The recalculation is the workspace's own coalesced one; poll for
    // the type to land and the schedule to settle rather than assuming either is immediate.
    await expect
      .poll(async () => (await rowsByName(page, orgSlug)).get('Handover')?.type, {
        timeout: 15_000,
      })
      .toBe('FINISH_MILESTONE');
    // An explicit recalculation, so the successor read below cannot be the pre-change value the
    // workspace's own recalculation has not yet replaced.
    await recalculate(page, orgSlug);
    const after = await rowsByName(page, orgSlug);
    const zAfter = after.get('Handover');
    // Each stored date moved one CALENDAR day: Monday 12 → Sunday 11.
    expect(zAfter?.constraintDate).toBe('2026-01-11');
    expect(zAfter?.visualStart).toBe('2026-01-11');
    // A finish milestone reports the day that closes at its instant (Monday 00:00): Friday 9.
    expect(zAfter?.earlyStart?.slice(0, 10)).toBe('2026-01-09');
    // The instant is unchanged, so the successor still starts Monday 12 (M0 read Tuesday 13).
    expect(after.get('Succ')?.earlyStart?.slice(0, 10)).toBe('2026-01-12');
  });
});

test.describe('Make milestone… (M4)', () => {
  /**
   * **The selection bar converts an unresourced zero-duration task, and nothing else moves**
   * (ADR-0162 decision 4, spec US-3, M4-T3's journey).
   *
   * The fixture: `Pre` (5 days) → `Pour slab` (zero-duration, placed on MONDAY 12 January) →
   * `Succ`. Finish is preselected because the task has a predecessor (D5). What is asserted, and
   * where it is read from:
   *
   * - through the API: the type, the placement re-expressed to the SUNDAY (a working-day shift would
   *   store the Friday and keep the instant, so only the stored value tells the two apart — FC-3
   *   (a)), and the successor still starting Monday;
   * - in the browser: focus on the diagram's listbox with the activity as its active descendant,
   *   because the button that opened the dialog is gone and a native `<dialog>` restores focus to
   *   whatever held it at `showModal()` (spec D4). jsdom has no top layer, so only this can ask;
   * - FC-6 as an equality: the foot row is the same height with this task selected as with an
   *   ordinary one, at 1646 and at 1920;
   * - the control's pointer target, at both widths;
   * - Ctrl+Z restores the row byte-identical, apart from its version and timestamp.
   */
  test('converts from the selection bar, keeps the schedule, returns focus, and undoes exactly', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const orgSlug = await onboard(page, STAMP + 1);
    await createHierarchy(page);
    await newPlan(page, 'Make milestone');
    await ensurePen(page);

    const pre = await createActivity(page, orgSlug, { name: 'Pre', durationDays: 5, laneIndex: 0 });
    const z = await createActivity(page, orgSlug, {
      name: 'Pour slab',
      durationDays: 0,
      laneIndex: 1,
      visualStart: '2026-01-12',
    });
    const succ = await createActivity(page, orgSlug, {
      name: 'Succ',
      durationDays: 1,
      laneIndex: 2,
    });
    // FC-6 is about an UNPLACED zero-duration task: a placed one also shows `Clear visual start`,
    // which already wraps the foot row at 1646 with no new item (m0-measurement.md, M0-T5, accepted
    // at M-F-T6). This one sits at the data date in Succ's lane, clear of Succ, and ties to nothing.
    const loose = await createActivity(page, orgSlug, {
      name: 'Loose event',
      durationDays: 0,
      laneIndex: 2,
    });
    await linkActivities(page, orgSlug, pre.id, z.id);
    await linkActivities(page, orgSlug, z.id, succ.id);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    const before = await rowsByName(page, orgSlug);
    expect(before.get('Succ')?.earlyStart?.slice(0, 10)).toBe('2026-01-12');
    const dock = page.getByRole('toolbar', { name: /^Actions for / });

    // 1646 FIRST (the config's own viewport), then 1920. Shrinking 1920 → 1646 mid-test left
    // Chromium's hit-testing with no viewport: `document.elementsFromPoint` returned [] for a point
    // well inside 1646 × 1097, `innerWidth` read 1646, and every canvas click timed out behind
    // "<html> intercepts pointer events" for four minutes. Growing works, so the order is the fix.
    for (const width of [1646, 1920]) {
      await page.setViewportSize({ width, height: 1097 });
      await findBarWide(page, pre.id);
      await expect(dock.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
      // Absent for an ordinary task: it does not apply (ADR-0082's omit clause).
      await expect(dock.getByRole('button', { name: MAKE_MILESTONE })).toHaveCount(0);
      const ordinary = await footRowHeight(page);

      await findBarWide(page, loose.id);
      const button = dock.getByRole('button', { name: MAKE_MILESTONE });
      await expect(button).toBeVisible();
      expect(await footRowHeight(page), `foot row at ${String(width)}`).toBe(ordinary);
      await expectReachableTarget(button);

      // The dialog's own controls at this width too, then Cancel: nothing is written.
      await button.click();
      const dialog = page.getByRole('dialog', { name: /milestone/ });
      await expect(dialog).toBeVisible();
      // No predecessor, so Start is preselected (spec D5).
      await expect(dialog.getByRole('radio', { name: 'Start milestone' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
      for (const control of [
        dialog.getByRole('radio', { name: 'Finish milestone' }),
        dialog.getByRole('radio', { name: 'Start milestone' }),
        dialog.getByRole('button', { name: 'Cancel' }),
        dialog.getByRole('button', { name: 'Make milestone', exact: true }),
      ]) {
        await expectReachableTarget(control);
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(diagramList(page)).toBeFocused();
    }
    expect((await rowsByName(page, orgSlug)).get('Loose event')?.type).toBe('TASK');

    // The placed one: its predecessor makes Finish the default.
    await findBarWide(page, z.id);
    await dock.getByRole('button', { name: MAKE_MILESTONE }).click();
    const dialog = page.getByRole('dialog', { name: /milestone/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Finish milestone' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await dialog.getByRole('button', { name: 'Make milestone', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Focus is on the activity in the diagram, not on <body>.
    await expect(diagramList(page)).toBeFocused();
    expect(await selectedActivityId(page)).toBe(z.id);
    // And the announcement, made from the recalculated row once it arrived.
    await expect(page.getByTestId('announcer')).toHaveText(
      /Pour slab is now a finish milestone, dated \w{3} \d{1,2} \w{3}\. Its successors and float are unchanged\./,
      { timeout: 20_000 },
    );

    await expect
      .poll(async () => (await rowsByName(page, orgSlug)).get('Pour slab')?.type, {
        timeout: 15_000,
      })
      .toBe('FINISH_MILESTONE');
    const converted = (await rowsByName(page, orgSlug)).get('Pour slab');
    // Monday 12 → SUNDAY 11: one calendar day, never the Friday.
    expect(converted?.visualStart).toBe('2026-01-11');

    // Undo, from the keyboard, with focus where the conversion left it.
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await rowsByName(page, orgSlug)).get('Pour slab')?.type, {
        timeout: 15_000,
      })
      .toBe('TASK');

    await recalculate(page, orgSlug);
    const after = await rowsByName(page, orgSlug);
    expect(after.get('Succ')?.earlyStart?.slice(0, 10)).toBe('2026-01-12');
    expect(comparable(after.get('Pour slab'))).toEqual(comparable(before.get('Pour slab')));
    expect(comparable(after.get('Succ'))).toEqual(comparable(before.get('Succ')));
  });

  test('a resourced zero-duration task is shaded with the assignments reason', async ({ page }) => {
    test.setTimeout(180_000);
    const orgSlug = await onboard(page, STAMP + 2);
    await createHierarchy(page);
    await newPlan(page, 'Resourced zero task');
    await ensurePen(page);

    const z = await createActivity(page, orgSlug, {
      name: 'Inspection',
      durationDays: 0,
      laneIndex: 0,
    });
    await assignResource(page, orgSlug, z.id);
    await recalculate(page, orgSlug);
    await ensurePen(page);

    await findBarWide(page, z.id);
    const button = page
      .getByRole('toolbar', { name: /^Actions for / })
      .getByRole('button', { name: MAKE_MILESTONE });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAccessibleDescription(
      'It has 1 resource assignment. A milestone does no work; remove it in Resources first.',
    );
    await button.click({ force: true });
    await expect(page.getByRole('dialog', { name: /milestone/ })).toHaveCount(0);
  });
});
