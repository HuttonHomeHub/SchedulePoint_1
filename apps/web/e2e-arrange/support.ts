import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Auto-arrange** suite (diagram-legibility M-C2), closing
 * `docs/TECH_DEBT.md` #363.
 *
 * The onboarding + client/project/plan helpers mirror `e2e-wbs/support.ts`; the actor is the org's
 * Org Admin, which satisfies everything here. Activities are seeded through the **API** with their
 * lanes set explicitly, because the state this suite is about — a plan whose rows are scattered —
 * is a property of `lane_index` and not of anything a planner draws. Dragging bars to produce it
 * would measure the canvas.
 */

/** Sign up + create an organisation; returns the org slug ("Arrange Co" → "arrange-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `arrange-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Arrange Tester');
  await page.getByLabel('Email').fill(`arrange-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Arrange Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project, stopping on the project page where both plan entries sit. */
export async function openProject(page: Page): Promise<void> {
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

/** Create a plan from the open project and open it (mounts the canvas workspace). */
export async function createPlan(page: Page, planName: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(planName);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: planName, exact: true }).click();
}

/**
 * Hold the pen, whether or not this session already does (ADR-0028). The API seeding below is
 * pen-gated too and would 423 without it; a reload may leave the lease already held, in which case
 * clicking "Start editing" would hang.
 */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** Release the pen — the state in which the offer must be omitted entirely. */
export async function releasePen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/**
 * Create activities in the open plan through the API, **at the lanes given**, and return them.
 *
 * Every response is checked: a seed helper that lies about how much it seeded turns an assertion
 * into a lottery (the lesson `e2e-gantt/support.ts` records and `e2e-wbs/support.ts` repeats).
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; laneIndex: number; durationDays?: number }[],
): Promise<{ id: string; name: string }[]> {
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
            durationDays: row.durationDays ?? 5,
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

/**
 * Recalculate the open plan and reload.
 *
 * Not optional: `computeLaneArrangement` skips an activity with no `earlyStart`, so on an
 * un-calculated plan the pack moves nothing and the offer is correctly absent — which would make
 * every positive assertion below pass for the wrong reason.
 */
export async function recalculate(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      // Recalculate is pen-gated (ADR-0028 Q-B); a helper that ignores its status turns a 423 into
      // "the offer never appeared", which reads as a product defect three assertions later.
      if (!response.ok) {
        throw new Error(`recalculate ${String(response.status)}: ${await response.text()}`);
      }
    },
    { org: orgSlug, id: planId },
  );
  await page.reload();
}

/**
 * The open plan's lanes, by activity name, straight from the API.
 *
 * **The write is asserted against the database, not against the canvas**, which is `aria-hidden`
 * and would only ever tell us what was painted. One page of 100 is enough for this suite's
 * fixtures and the helper says so rather than paging silently — a probe that stops counting is
 * `e2e-wbs`'s recorded trap.
 */
export async function lanesByName(page: Page, orgSlug: string): Promise<Record<string, number>> {
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
        data: { name: string; laneIndex: number }[];
        meta?: { nextCursor?: string | null };
      };
      if (body.meta?.nextCursor) {
        throw new Error('the plan has more than one page — this probe would undercount');
      }
      return Object.fromEntries(body.data.map((a) => [a.name, a.laneIndex]));
    },
    { org: orgSlug, id: planId },
  );
}

/**
 * A minimal valid XER — one project, two tasks, one FS link — copied from
 * `e2e-interchange/support.ts` rather than imported across suite boundaries.
 *
 * It is here because one case in this suite is a **real import**: M-C0-T3a established that a
 * healthy import leaves the offer with nothing to say (ADR-0069 phase 3 packs, and `packLanes` is
 * idempotent), and an absence assertion that has never run against a real import proves nothing
 * about imports.
 */
export function validXerFile(): { name: string; mimeType: string; buffer: Buffer } {
  const xer = [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%E',
  ].join('\n');
  return {
    name: 'schedule.xer',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(xer, 'utf8'),
  };
}

/** One dependency between two seeded activities, through the real REST API. */
export async function seedDependency(
  page: Page,
  orgSlug: string,
  predecessorId: string,
  successorId: string,
): Promise<void> {
  const planId = openPlanId(page);
  const error = await page.evaluate(
    async ({ org, id, pred, succ }: { org: string; id: string; pred: string; succ: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ predecessorId: pred, successorId: succ, type: 'FS', lagDays: 0 }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    { org: orgSlug, id: planId, pred: predecessorId, succ: successorId },
  );
  if (error !== null) throw new Error(`seeding the dependency was rejected: ${error}`);
}

/**
 * **Where the diagram's ink is, read from the painted canvas.**
 *
 * Returns, for each pixel row, how many pixels are bar-coloured, how many are link-coloured, and
 * the LONGEST CONTIGUOUS run of link colour — which is enough to find the bar rows (long runs of
 * bar colour) and therefore the gutters between them, without the test knowing the viewport's
 * `originY` or pitch.
 *
 * **`linkRun` is what makes a gutter assertion discriminate, and it was added because the first
 * version did not.** Every link that changes lane sends a VERTICAL corridor through the gutters
 * between them, so "some link ink in a gutter" is true whatever the horizontal legs do — the test
 * passed identically against the pre-M1 datum. A vertical crossing is one or two pixels wide; a
 * gutter leg is tens or hundreds. The run length tells them apart; the pixel count cannot.
 *
 * Colour is classified by saturation rather than by a literal: a bar is a saturated plot fill and a
 * link is a near-neutral grey, so a token re-value (ADR-0102 re-valued the whole canvas scope once)
 * changes the numbers and not the classification. A hex literal here would be exactly the second
 * opinion about a token that `resolveTsldPalette` exists to prevent.
 */
export async function canvasInk(
  page: Page,
): Promise<{ rows: { bar: number; link: number; linkRun: number }[]; height: number }> {
  return page.evaluate(() => {
    /** How long a background gap a dashed link may bridge before the run is over, in device px. */
    const DASH_BRIDGE_PX = 10;
    // **The SCENE canvas, chosen by area.** `TsldCanvas` mounts several siblings — the WBS band,
    // the resource strip, the interaction layer — and `querySelector('canvas')` returns whichever
    // is first in the DOM, which is not the one the bars and links are painted on.
    const canvases = [...globalThis.document.querySelectorAll('canvas')];
    if (canvases.length === 0) {
      throw new Error('no canvas is mounted — there is no diagram to read');
    }
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2D context — the read would be blank and look like one');
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const rows: { bar: number; link: number; linkRun: number }[] = [];
    for (let y = 0; y < height; y += 1) {
      let bar = 0;
      let link = 0;
      let linkRun = 0;
      let run = 0;
      let gap = 0;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        if (chroma > 40) {
          bar += 1;
          run = 0;
          gap = 0;
        } else if (max < 190 && max > 40) {
          link += 1;
          run += gap + 1;
          gap = 0;
          if (run > linkRun) linkRun = run;
        } else {
          // Background. A dashed link is a real line, so a gap shorter than a dash bridges rather
          // than ending the run; anything longer ends it.
          //
          // The first version of this branch left `run` untouched, which never ends a run at all —
          // so `linkRun` was just "link pixels since the last bar pixel", identical to the count it
          // was added to replace. It is recorded because the test then passed against the very
          // defect it was written to catch, twice, and only a deliberate red run said so.
          gap += 1;
          if (gap > DASH_BRIDGE_PX) {
            run = 0;
            gap = 0;
          }
        }
      }
      rows.push({ bar, link, linkRun });
    }
    return { rows, height };
  });
}
