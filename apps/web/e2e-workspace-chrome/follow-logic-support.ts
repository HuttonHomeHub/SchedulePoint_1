import { expect, type Locator, type Page } from '@playwright/test';

import { drawActivity } from '../e2e-authoring/support';

import { canvas, diagramList, openPlanId, selectedActivityId } from './support';

/**
 * Helpers for the **follow-logic** journeys (placed-bar-follows-link M2, ADR-0216), which are the one
 * place in the estate that must DRAW its bars: a seeded activity carries no `visualStart` and so
 * follows its logic, which is exactly how the owner's first walkthrough was fooled
 * (`docs/HANDOFF.md`, "The owner's biggest finding"). State is read from the API, never from the DOM,
 * because a drag can return before the engine has seen its placement (`placeOnDay`'s own warning).
 */

/**
 * One activity as these journeys read it: the placement the planner made, the engine's verdict on it
 * and the constraint it carries.
 */
export interface ActivityRow {
  id: string;
  name: string;
  type: string;
  version: number;
  laneIndex: number;
  durationDays: number;
  visualStart: string | null;
  visualEffectiveStart: string | null;
  visualConflictReason: string | null;
  constraintType: string | null;
  constraintDate: string | null;
}

/** Every activity in the open plan with the fields above, straight from the API. */
export async function activityRows(page: Page, orgSlug: string): Promise<ActivityRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error(`activity list ${String(response.status)}`);
      return ((await response.json()) as { data: ActivityRow[] }).data;
    },
    { org: orgSlug, id: planId },
  );
}

/** One row by name, failing loudly rather than skipping the assertion. */
export function requireRow(rows: readonly ActivityRow[], name: string): ActivityRow {
  const row = rows.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`no activity named ${name} in ${String(rows.length)} rows`);
  return row;
}

/** The names flagged "placed before its logic allows" right now. */
export async function flaggedNames(page: Page, orgSlug: string): Promise<string[]> {
  return (await activityRows(page, orgSlug))
    .filter((row) => row.visualConflictReason === 'EARLIER_THAN_LOGIC')
    .map((row) => row.name)
    .sort();
}

/**
 * The x-range, in canvas pixels, along row `y` where a select-mode click selects `id`. Bounded
 * around where the bar was drawn (`hint`): on a coarse pointer the panel divider's hit strip covers
 * the canvas's right edge and would intercept a click there. The range's far end is inside the bar's
 * 8 px end-handle zone, which is where a duration drag is grabbed.
 */
export async function sweepBar(
  page: Page,
  id: string,
  y: number,
  hint: number,
): Promise<{ min: number; max: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let x = Math.max(20, hint - 60); x < Math.min(box.width - 60, hint + 80); x += 2) {
    await canvas(page).click({ position: { x, y } });
    if ((await selectedActivityId(page)) === id) {
      min = Math.min(min, x);
      max = Math.max(max, x);
    }
  }
  if (!Number.isFinite(min)) throw new Error(`no point in row y=${String(y)} selects ${id}`);
  return { min, max };
}

/** Write an activity's constraint through the public REST API, at its current version. */
export async function constrainViaApi(
  page: Page,
  orgSlug: string,
  row: ActivityRow,
  constraint: { type: string; date: string },
): Promise<void> {
  const error = await page.evaluate(
    async ({
      org,
      id,
      version,
      type,
      date,
    }: {
      org: string;
      id: string;
      version: number;
      type: string;
      date: string;
    }) => {
      const response = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ constraintType: type, constraintDate: date, version }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    {
      org: orgSlug,
      id: row.id,
      version: row.version,
      type: constraint.type,
      date: constraint.date,
    },
  );
  if (error !== null) throw new Error(`constraint rejected: ${error}`);
}

/** The three bars of the owner's runbook, by name, in the order they are drawn. */
export const DRAWN = ['Excavate', 'Pour slab', 'Steel beam'] as const;

export interface DrawnBars {
  /** Where each bar can be clicked, and the x-range along its row that selects it. */
  A: { x: number; y: number; r: [number, number] };
  B: { x: number; y: number; r: [number, number] };
  C: { x: number; y: number; r: [number, number] };
  rows: ActivityRow[];
}

/**
 * **Draw three tasks with the Add tool**, each carrying a placement, and find where each can be
 * pressed. `xs` is where each is dropped: the runbook's `[220, 440, 660]` puts C far to the right
 * of B, so lengthening A strands B only; a closer `[220, 300, 330]` strands both; and a B left of A
 * (`[440, 220, 660]`) is stranded by the link itself.
 */
export async function drawThreeBars(
  page: Page,
  orgSlug: string,
  xs: readonly [number, number, number],
): Promise<DrawnBars> {
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const ys = [120, 180, 240] as const;
  for (const [i, name] of DRAWN.entries()) {
    await drawActivity(page, 'Task', name, { x: xs[i] ?? 0, y: ys[i] ?? 0 });
    await expect(diagram.getByRole('option')).toHaveCount(i + 1, { timeout: 15_000 });
  }
  await expect
    .poll(
      async () => {
        const rows = await activityRows(page, orgSlug);
        return rows.length === 3 && rows.every((row) => row.visualEffectiveStart !== null);
      },
      { message: 'the three drawn bars never got dates', timeout: 30_000 },
    )
    .toBe(true);
  const rows = await activityRows(page, orgSlug);
  // Leave the sticky Add tool before looking for the bars.
  await canvas(page).press('Escape');
  await canvas(page).press('Escape');
  const point = async (
    name: string,
    y: number,
    hint: number,
  ): Promise<{ x: number; y: number; r: [number, number] }> => {
    const range = await sweepBar(page, requireRow(rows, name).id, y, hint);
    return { x: Math.round((range.min + range.max) / 2), y, r: [range.min, range.max] };
  };
  const A = await point('Excavate', ys[0], xs[0]);
  const B = await point('Pour slab', ys[1], xs[1]);
  const C = await point('Steel beam', ys[2], xs[2]);
  await canvas(page).press('Escape');
  return { A, B, C, rows };
}

/** Arm the Link tool and link `from` to `to` by pressing their bars. Leaves the tool armed. */
export async function linkWithTool(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  armed = true,
): Promise<void> {
  if (armed) {
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Link', exact: true })
      .click();
  }
  await canvas(page).click({ position: from });
  await canvas(page).click({ position: to });
}

/**
 * Drag the right end of the bar whose pressable range along its row is `r` to the right by `days`
 * working days' worth of pixels, which lengthens it. `pxPerDay` is measured from the plan's own bars
 * (the scale is derived from the canvas width, ADR-0056, so it is never a constant a journey may
 * assume).
 */
export async function lengthenBar(
  page: Page,
  bar: { y: number; r: [number, number] },
  dx: number,
): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const grabX = bar.r[1] - 1;
  await page.mouse.move(box.x + grabX, box.y + bar.y);
  await page.mouse.down();
  await page.mouse.move(box.x + grabX + dx / 2, box.y + bar.y, { steps: 6 });
  await page.mouse.move(box.x + grabX + dx, box.y + bar.y, { steps: 6 });
  await page.mouse.up();
}

/** Whole days between two ISO dates (or instants), positive when `to` is later. */
export function dayGap(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * The foot row and the offer's strip as the dock lays them out, from the browser: the foot row's
 * height, the strip's, and whether the row scrolls sideways. These are the figures M0d read
 * (`docs/specs/placed-bar-follows-link/m0-measurement.md`, "M0d"), so a journey that asserts them
 * is asserting the injected measurement against the real DOM.
 */
export async function footFigures(page: Page): Promise<{
  foot: number;
  strip: number;
  stage: number;
  outlet: number;
  sideways: boolean;
}> {
  return page.evaluate(() => {
    const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
    const strip = document.querySelector<HTMLElement>('[data-testid="canvas-follow-logic-offer"]');
    // The section, as M0d's `stageH` was read: it is the box the foot row's height comes out of.
    const stage = document.querySelector<HTMLElement>(
      'section[aria-label="Time-scaled logic diagram"]',
    );
    const outlet = foot?.querySelector<HTMLElement>('div[class*="not-empty:min-w-"]');
    if (!foot || !outlet) throw new Error('the foot row is not on screen');
    return {
      foot: Math.round(foot.getBoundingClientRect().height),
      strip: strip === null ? 0 : Math.round(strip.getBoundingClientRect().height),
      stage: stage === null ? 0 : Math.round(stage.getBoundingClientRect().height),
      outlet: Math.round(outlet.getBoundingClientRect().width * 10) / 10,
      sideways: foot.scrollWidth > foot.clientWidth,
    };
  });
}

/** Whether a pointer at the button's centre lands on the button, after scrolling it into view. */
export async function selfHit(button: Locator): Promise<boolean> {
  await button.scrollIntoViewIfNeeded();
  return button.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top !== null && el.contains(top);
  });
}

/** Select an activity by walking the diagram's listbox, so the bar for it is on the dock. */
export async function selectInList(page: Page, orgSlug: string, name: string): Promise<void> {
  const row = requireRow(await activityRows(page, orgSlug), name);
  await diagramList(page).focus();
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 12; i += 1) {
    if ((await selectedActivityId(page)) === row.id) return;
    await page.keyboard.press('ArrowDown');
  }
  if ((await selectedActivityId(page)) !== row.id) throw new Error(`could not reach ${name}`);
}
