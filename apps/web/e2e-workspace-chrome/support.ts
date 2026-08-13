import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Journey helpers for the **workspace chrome** suite (`docs/specs/workspace-chrome/`).
 *
 * The onboarding / hierarchy / seeding helpers deliberately mirror
 * `e2e-authoring-flow/support.ts` rather than importing it: a Playwright `testDir` is its own
 * compilation root, and a shared helper file whose fixture names two suites both mutate is how two
 * serial suites start failing each other on a shared database. What is NOT copied is the part that
 * matters here — this suite runs with `VITE_SCHEDULING_MODES` at its default, so it has Visual mode
 * and the placement helpers below, which no other journey can reach.
 */

/** Sign up + create an organisation; returns the org slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `chrome-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Chrome Tester');
  await page.getByLabel('Email').fill(`chrome-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Chrome Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the client and project this suite's plans hang off, landing on the project screen. */
export async function createHierarchy(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
}

/**
 * The data date every plan in this suite starts from: **Monday 5 January 2026**.
 *
 * A Monday is load-bearing, not a tidy choice. The rule under test is which direction a placement
 * on a non-working day rolls, so the fixture has to make "forward" and "nearest" give *different*
 * answers: from a Monday, day 5 is Saturday, whose nearest working day is Friday (day 4, earlier
 * wins ties) and whose next working day is Monday (day 7). A fixture starting mid-week would still
 * pass under the rule this milestone deleted.
 */
export const DATA_DATE = '2026-01-05';

/** Create a plan under the suite's project and open it (mounts the canvas workspace). */
export async function newPlan(page: Page, planName: string): Promise<void> {
  const project = page.getByRole('link', { name: 'Riverside', exact: true });
  if ((await project.count()) > 0) await project.first().click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(planName);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill(DATA_DATE);
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: planName, exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
}

/** Hold the pen, whether or not this session already does (ADR-0028). Idempotent. */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** One seeded activity, as the API returns it. */
export interface SeededActivity {
  id: string;
  name: string;
}

/** Create activities in the open plan through the API. Every response is checked. */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; laneIndex: number; durationDays?: number }[],
): Promise<SeededActivity[]> {
  const planId = openPlanId(page);
  const result = await page.evaluate(
    async ({
      org,
      id,
      rows,
    }: {
      org: string;
      id: string;
      rows: readonly { name: string; laneIndex: number; durationDays?: number }[];
    }) => {
      const made: { id: string; name: string }[] = [];
      const bad: string[] = [];
      for (const row of rows) {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            type: 'TASK',
            durationDays: row.durationDays ?? 3,
            laneIndex: row.laneIndex,
          }),
        });
        if (!response.ok) {
          bad.push(`${row.name}: ${String(response.status)} ${await response.text()}`);
          continue;
        }
        const body = (await response.json()) as { data: { id: string; name: string } };
        made.push({ id: body.data.id, name: body.data.name });
      }
      return { made, bad };
    },
    { org: orgSlug, id: planId, rows: specs },
  );
  if (result.bad.length > 0) {
    throw new Error(`seeding rejected ${String(result.bad.length)}: ${result.bad.join('; ')}`);
  }
  return result.made;
}

/** Recalculate the open plan so the seeded bars have dates to draw, then reload to pick them up. */
export async function recalculate(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: planId },
  );
  await page.reload();
}

/**
 * The placement fields of one activity, straight from the API — this suite's ground truth.
 *
 * `visualStart` is the planner's INPUT (what the drag persisted); `visualEffectiveStart` is the
 * engine's OUTPUT (`compute.ts:335-338`, after `rollForwardToWorking`). Keeping both is the whole
 * point: M2's claim is that the raw dropped day is stored and the SERVER performs the roll, and
 * reading only one of the two cannot tell that apart from the client having rolled it first.
 */
export interface PlacementRow {
  id: string;
  name: string;
  version: number;
  visualStart: string | null;
  visualEffectiveStart: string | null;
  earlyStart: string | null;
}

/** Every activity in the open plan, with its placement fields. Paged; every response checked. */
export async function placements(page: Page, orgSlug: string): Promise<PlacementRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const rows: PlacementRow[] = [];
      let cursor: string | null = null;
      do {
        const query = `limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
        const response = await fetch(
          `/api/v1/organizations/${org}/plans/${id}/activities?${query}`,
          { credentials: 'include' },
        );
        if (!response.ok) {
          throw new Error(`activity list ${String(response.status)}: ${await response.text()}`);
        }
        const body = (await response.json()) as {
          data: PlacementRow[];
          meta: { nextCursor: string | null };
        };
        rows.push(...body.data);
        cursor = body.meta.nextCursor;
      } while (cursor !== null);
      return rows;
    },
    { org: orgSlug, id: planId },
  );
}

/** One activity's placement row, failing loudly rather than silently skipping the assertion. */
export function requirePlacement(rows: readonly PlacementRow[], name: string): PlacementRow {
  const row = rows.find((candidate) => candidate.name === name);
  if (!row) throw new Error(`no activity named ${name} in ${String(rows.length)} rows`);
  return row;
}

/** The date half of an ISO instant, which is all this suite ever compares. */
export function isoDay(instant: string | null): string | null {
  return instant === null ? null : instant.slice(0, 10);
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): Locator {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/** The diagram's parallel focusable listbox (ADR-0026 D7) — the canvas's own account of itself. */
export function diagramList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/** Which activity the canvas reports as selected, from `aria-activedescendant`. */
export async function selectedActivityId(page: Page): Promise<string | null> {
  const active = await diagramList(page).getAttribute('aria-activedescendant');
  if (active === null) return null;
  const match = /-opt-([0-9a-f-]{36})$/.exec(active);
  return match?.[1] ?? null;
}

/** Switch the plan to Visual scheduling mode (ADR-0033), and confirm it took. */
export async function useVisualMode(page: Page): Promise<void> {
  const visual = page.getByRole('button', { name: 'Visual mode' });
  await expect(visual).toBeVisible();
  if ((await visual.getAttribute('aria-pressed')) === 'true') return;
  await visual.click();
  await expect(visual).toHaveAttribute('aria-pressed', 'true');
}

/** Zoom the time axis out `times` steps, so a whole week of scene fits inside the canvas. */
export async function zoomOut(page: Page, times: number): Promise<void> {
  const button = page.getByRole('button', { name: 'Zoom out' });
  for (let i = 0; i < times; i += 1) await button.click();
}

/** The canvas columns the probe walks, in canvas-relative pixels, in the order it tries them. */
const PROBE_XS = [60, 90, 40, 120, 160, 200] as const;
const PROBE_STEP_Y = 6;
const PROBE_MAX_Y = 200;

/**
 * Find the point that hits a given activity, by clicking in `select` mode and asking the canvas
 * which bar it hit. **Measured, not assumed** (the ADR-0064 harness's rule): the pixel we believe
 * we drew at and the pixel the hit-test agrees with are different claims, and only the second one
 * can drive a drag.
 *
 * Several columns rather than one, because the day→pixel scale is derived from the canvas width at
 * pick time (ADR-0056) and a fixed column is a guess about it. Early-exits on the first hit, so the
 * common case costs one column.
 */
export async function findBar(page: Page, activityId: string): Promise<{ x: number; y: number }> {
  for (const x of PROBE_XS) {
    for (let y = 16; y <= PROBE_MAX_Y; y += PROBE_STEP_Y) {
      await canvas(page).click({ position: { x, y } });
      if ((await selectedActivityId(page)) === activityId) return { x, y };
    }
  }
  throw new Error(`no probed canvas point hit ${activityId}`);
}

/**
 * Find the bar again **along a known row**, sweeping the full canvas width.
 *
 * Zooming is horizontal: it changes pixels-per-day and re-frames the visible range, so a bar that
 * was under the left-hand probe columns can be anywhere afterwards — but its LANE, and therefore
 * its `y`, is untouched. Splitting the search that way turns a two-dimensional sweep (hundreds of
 * clicks) into one row of them, which is why {@link findBar} runs before the zoom and this runs
 * after it.
 *
 * The step is deliberately under a three-day bar's width at the zoomed-out scale, minus the 8 px
 * `EDGE_HANDLE_PX` grab zone at each end — a column that lands on a handle would start a duration
 * resize rather than a reposition, and the case would fail reporting the wrong thing entirely.
 */
export async function findBarInRow(page: Page, activityId: string, y: number): Promise<number> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  for (let x = 30; x < box.width - 10; x += 40) {
    await canvas(page).click({ position: { x, y } });
    if ((await selectedActivityId(page)) === activityId) return x;
  }
  throw new Error(`no point in row y=${String(y)} hit ${activityId}`);
}

/**
 * Drag a bar horizontally by `dx` canvas pixels, using the manual mouse sequence rather than
 * `dragTo`. The canvas is one element, so `dragTo` has no second target to aim at — and the
 * intermediate move matters: the direct-manipulation gesture arms on `pointermove` after
 * `pointerdown`, so a two-event down/up is a click, not a drag.
 */
export async function dragBarBy(
  page: Page,
  from: { x: number; y: number },
  dx: number,
): Promise<void> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + from.x + dx / 2, box.y + from.y, { steps: 5 });
  await page.mouse.move(box.x + from.x + dx, box.y + from.y, { steps: 5 });
  await page.mouse.up();
}

/** Whole days between two ISO dates, positive when `to` is later. */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Drag a bar until it sits on `targetDay`, counted in days from {@link DATA_DATE} — **aim, measure,
 * correct**, rather than one shot from a calibrated scale.
 *
 * The scale (pixels per day) is derived from the canvas width at zoom-pick time (ADR-0056), so it
 * is not a constant a journey may assume; and deriving it from a single drag carries up to half a
 * day of error, because all the drag can report back is an integer day. The first version of this
 * helper did exactly that and landed on Friday when it meant Saturday — a one-day aiming error that
 * reads, in the assertion, exactly like the placement rule being wrong. So the estimate is
 * **refined from each drag's own result** and the aim is repeated until it lands.
 *
 * The bar's position is taken from `visualEffectiveStart`, not `visualStart`: once a drop lands on
 * a non-working day the engine rolls it forward and the bar is DRAWN at the rolled position, so
 * aiming from the raw value would be aiming at a bar that is not there.
 */
export async function placeOnDay(
  page: Page,
  orgSlug: string,
  activity: { id: string; name: string },
  row: number,
  targetDay: number,
  attempts = 5,
): Promise<void> {
  /** Where the bar is DRAWN, in days from the data date — the position a drag is measured from. */
  const drawnDay = async (): Promise<number> => {
    const placement = requirePlacement(await placements(page, orgSlug), activity.name);
    const drawn = isoDay(placement.visualEffectiveStart) ?? isoDay(placement.earlyStart);
    if (drawn === null) throw new Error(`${activity.name} has no drawn date to aim from`);
    return daysBetweenIso(DATA_DATE, drawn);
  };
  /** Where the bar was DROPPED, in days from the data date — null before any placement. */
  const droppedDay = async (): Promise<number | null> => {
    const raw = isoDay(
      requirePlacement(await placements(page, orgSlug), activity.name).visualStart,
    );
    return raw === null ? null : daysBetweenIso(DATA_DATE, raw);
  };

  // A deliberately coarse opening estimate: it only has to put the first drag in the right
  // neighbourhood, and every later one is measured from its own result.
  let pxPerDay = 50;
  const trace: string[] = [];

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if ((await droppedDay()) === targetDay) return;

    const from = await drawnDay();
    const before = requirePlacement(await placements(page, orgSlug), activity.name).version;
    const x = await findBarInRow(page, activity.id, row);
    const dx = Math.round((targetDay - from) * pxPerDay);
    await dragBarBy(page, { x, y: row }, dx);

    // Two waits, and they are different questions. First: did the PATCH land at all — a version
    // that never moves means the gesture was not a drag, which is a different failure from a drag
    // that missed. Second: has the engine caught up with THIS placement? Until the coalesced
    // recalculation runs, `visualEffectiveStart` still describes where the bar used to be, so
    // aiming the next drag from it would aim at a bar that has moved.
    await expect
      .poll(async () => requirePlacement(await placements(page, orgSlug), activity.name).version, {
        message: 'the drag never reached the server',
        timeout: 15_000,
      })
      .toBeGreaterThan(before);
    await expect
      .poll(
        async () => {
          const dropped = await droppedDay();
          return dropped === null ? -1 : (await drawnDay()) - dropped;
        },
        { message: 'the recalculation never caught up with the drop', timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(0);

    const landed = await droppedDay();
    if (landed === null) throw new Error('a drag that bumped the version persisted no visualStart');
    trace.push(
      `drawn day ${String(from)} ${dx >= 0 ? '+' : ''}${String(dx)}px -> dropped ${String(landed)}`,
    );
    // Refine only from a drag that actually moved days: dividing by zero would poison the estimate,
    // and a drag that moved none says only that `dx` was under half a day.
    if (landed !== from) pxPerDay = Math.abs(dx / (landed - from));
  }

  throw new Error(
    `could not drop ${activity.name} on day ${String(targetDay)} in ${String(attempts)} drags ` +
      `(reached ${String(await droppedDay())}): ${trace.join('; ')}`,
  );
}
