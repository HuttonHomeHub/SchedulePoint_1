import { expect, type Page } from '@playwright/test';

import { pickAddKind } from '../e2e-support/toolbar';

/**
 * Journey helpers for the flag-ON **External-Guest per-plan share links** suite
 * (`VITE_GUEST_SHARE_LINKS`, ADR-0051 F-M4). The onboarding + client/project/plan helpers and the
 * canvas-first "draw an activity" helper mirror `e2e-authoring/support.ts` verbatim (same underlying
 * canvas-authoring flags bake into this suite's `webServer`, so a plan opens on a draw-ready blank
 * canvas) — the onboarding actor becomes the org's Org Admin, which already satisfies `plan:share`
 * (Planner + Org Admin), so no extra role setup is needed.
 */

/** Sign up + create an organisation; returns the org slug (name "Share Co" → "share-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `share-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Share Tester');
  await page.getByLabel('Email').fill(`share-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Share Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open it (mounts the canvas-first authoring workspace). */
export async function openNewPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Guest Plan');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Guest Plan' }).click();
}

/** Take the pen so the authoring affordances go live (compact status lives in the slim header). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw an activity of the given kind on the canvas via the Add split-button (ADR-0032 M4): open the
 * `Add▾` menu, pick the kind (which arms add mode), click the canvas at `pos`, then name + commit in
 * the drop popover. A milestone places on the single click; a task's click is a 1-day span. Drawing the
 * first activity silently sets the plan start and auto-recalcs — the bar plots without a Recalculate
 * click (mirrors `e2e-authoring/support.ts`).
 */
export async function drawActivity(
  page: Page,
  kind: 'Task' | 'Start milestone' | 'Finish milestone',
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  // The Add control is a true split button (ADR-0064 T3): its primary region arms the tool, and the
  // caret — located here by its `Activity type: <kind>` label — opens the kind menu. A milestone
  // kind is a button of its own on a wide bar (toolbar-redesign M5); `pickAddKind` finds either.
  await pickAddKind(page, kind);
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add to plan' }).click();
  await expect(form).toBeHidden();
}

// ── ADR-0163 (FC-1/FC-5/FC-6): a placed activity's bar sits where the planner put it ──────────────
//
// The drawn activity's date depends on click pixels and is not reliable (`drawActivity` above), so
// the fixture for the placed-basis comparison is built through the REAL API instead — copied here
// rather than imported across suite boundaries, the `e2e-arrange/support.ts` convention.

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

interface SeededActivity {
  id: string;
  name: string;
  version: number;
}

/**
 * Create activities in the open plan through the API, at the given lanes, and return their id +
 * version (needed for the placements PATCH below). The pen must already be held
 * (`PLAN_EDIT_LOCK_ENFORCED=true` in this suite's `webServer`, `startEditing` above) — a helper that
 * ignores a non-2xx status turns a 423 into "the placement never happened", which reads as a product
 * defect three assertions later rather than as a seeding mistake.
 */
export async function seedActivities(
  page: Page,
  orgSlug: string,
  specs: readonly { name: string; laneIndex: number; durationDays: number }[],
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
      rows: readonly { name: string; laneIndex: number; durationDays: number }[];
    }) => {
      const made: SeededActivity[] = [];
      const bad: string[] = [];
      for (const row of rows) {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            type: 'TASK',
            durationDays: row.durationDays,
            laneIndex: row.laneIndex,
          }),
        });
        if (!response.ok) {
          bad.push(`${row.name}: ${String(response.status)} ${await response.text()}`);
          continue;
        }
        const body = (await response.json()) as {
          data: { id: string; name: string; version: number };
        };
        made.push({ id: body.data.id, name: body.data.name, version: body.data.version });
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
 * Hand-place an activity at `visualStart` through the batch **placements** endpoint
 * (`PATCH …/activities/placements`, ADR-0033/ADR-0148) — the same write a canvas drag makes. Every
 * placement field is required-but-nullable, so `constraintType`/`constraintDate` are sent as `null`
 * (unset) and `laneIndex` as `null` (leave the lane unchanged) rather than omitted.
 */
export async function placeActivity(
  page: Page,
  orgSlug: string,
  activity: { id: string; version: number },
  visualStart: string,
): Promise<void> {
  const planId = openPlanId(page);
  const status = await page.evaluate(
    async ({
      org,
      id,
      act,
      start,
    }: {
      org: string;
      id: string;
      act: { id: string; version: number };
      start: string;
    }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities/placements`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placements: [
              {
                id: act.id,
                version: act.version,
                constraintType: null,
                constraintDate: null,
                visualStart: start,
                laneIndex: null,
              },
            ],
          }),
        },
      );
      return response.ok ? 200 : { status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId, act: activity, start: visualStart },
  );
  if (status !== 200) {
    throw new Error(`placement rejected: ${JSON.stringify(status)}`);
  }
}

/**
 * Recalculate the open plan through the API (pen-gated, ADR-0028 Q-B) — checked, not
 * fire-and-forget — **then reload**.
 *
 * **Not optional**, and copied verbatim as a requirement from `e2e-arrange/support.ts`'s own
 * `recalculate`: the write above goes through a raw `fetch`, which never touches the page's
 * TanStack Query cache (`staleTime: 30_000`, no `refetchInterval` on the activities list — nothing
 * makes a plain `fetch` invalidate it). Without the reload, the canvas and the listbox would keep
 * showing whatever they last rendered from the UI-driven flow — the PRE-placement picture —
 * indefinitely, and every downstream FC-5/FC-6 read would be comparing the member's stale view
 * against the guest's fresh one rather than against each other.
 */
export async function recalculatePlan(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const status = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      return response.ok ? 200 : { status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId },
  );
  if (status !== 200) {
    throw new Error(`recalculate rejected: ${JSON.stringify(status)}`);
  }
  await page.reload();
}

interface MemberActivityRow {
  id: string;
  name: string;
  earlyStart: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
}

/**
 * The open plan's activities, straight from the MEMBER read (never the canvas, which is
 * `aria-hidden` and would only ever tell us what was painted). One page of 100 is enough for this
 * suite's two-activity fixture, and the helper says so rather than paging silently
 * (`e2e-wbs`'s recorded trap, `e2e-arrange/support.ts:lanesByName`).
 */
export async function memberActivities(page: Page, orgSlug: string): Promise<MemberActivityRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        {
          credentials: 'include',
        },
      );
      if (!response.ok) {
        throw new Error(`activities ${String(response.status)}: ${await response.text()}`);
      }
      const body = (await response.json()) as {
        data: MemberActivityRow[];
        meta?: { nextCursor?: string | null };
      };
      if (body.meta?.nextCursor) {
        throw new Error('the plan has more than one page — this probe would undercount');
      }
      return body.data;
    },
    { org: orgSlug, id: planId },
  );
}

/**
 * **Where each bar's ink is, read from the painted canvas — grouped into rows (lanes).**
 *
 * Adapted from `e2e-arrange/support.ts`'s `canvasInk` (bar ink classified by saturation/hue, never
 * a hex literal — a token re-value must not change the classification). This variant additionally
 * merges contiguous bar-bearing rows into bands and reports each band's LEFT/RIGHT extent, because
 * FC-6 needs "where does the Excavate bar start relative to the Pour bar", not a per-row pixel
 * count. Bands are returned top-to-bottom, which is lane order (lane 0 paints above lane 1).
 *
 * **Node glyphs (ADR-0157) are ground-filled** — a 15 px circle at each bar end, filled with the
 * canvas ground and not the bar colour — so they contribute little to the classified bar run beyond
 * their thin criticality rim. Both contexts (member/guest) measure the SAME way, so this bias is
 * expected to cancel in the ratio FC-6 computes; the tolerance in the test absorbs the rest.
 */
export async function barExtentsByRow(
  page: Page,
): Promise<{ top: number; bottom: number; left: number; right: number }[]> {
  return page.evaluate(() => {
    const canvases = [...globalThis.document.querySelectorAll('canvas')];
    if (canvases.length === 0)
      throw new Error('no canvas is mounted — there is no diagram to read');
    const target = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const ctx = target.getContext('2d');
    if (ctx === null) throw new Error('no 2D context — the read would be blank and look like one');
    const { width, height } = target;
    const data = ctx.getImageData(0, 0, width, height).data;
    interface RowRun {
      left: number;
      right: number;
      count: number;
    }
    const rows: (RowRun | null)[] = [];
    for (let y = 0; y < height; y += 1) {
      let left = -1;
      let right = -1;
      let count = 0;
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        // Violet is link ink, whatever its saturation (NetPoint grammar, ADR-0157) — excluded here
        // so a routed link crossing a bar's row does not widen its reported extent.
        const violet = b > r && r > g && chroma > 20;
        const isBar = chroma > 40 && !violet;
        if (isBar) {
          if (left === -1) left = x;
          right = x;
          count += 1;
        }
      }
      // A handful of stray saturated pixels (anti-aliasing, a criticality rim edge) should not
      // register as a bar row on their own — a real bar's own body is many pixels wide.
      rows.push(count > 5 ? { left, right, count } : null);
    }
    const bands: { top: number; bottom: number; left: number; right: number }[] = [];
    let current: { top: number; bottom: number; left: number; right: number } | null = null;
    for (let y = 0; y < rows.length; y += 1) {
      const row = rows[y];
      if (row) {
        if (!current) current = { top: y, bottom: y, left: row.left, right: row.right };
        else {
          current.bottom = y;
          current.left = Math.min(current.left, row.left);
          current.right = Math.max(current.right, row.right);
        }
      } else if (current) {
        bands.push(current);
        current = null;
      }
    }
    if (current) bands.push(current);
    return bands;
  });
}
