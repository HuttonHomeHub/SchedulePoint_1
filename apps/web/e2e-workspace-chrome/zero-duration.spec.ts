import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  findBarWide,
  linkActivities,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
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
  earlyStart: string | null;
  constraintDate: string | null;
  visualStart: string | null;
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
