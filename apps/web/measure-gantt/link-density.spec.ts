import { expect, test } from '@playwright/test';
import { scaleSpec } from '@repo/seed';

import {
  createClient,
  createPlan,
  createProject,
  onboard,
  openPlanId,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { writeMeasurement } from '../measure-toolbar/output';

/**
 * **M0-T1 R5 — how many dependency links cross a Gantt viewport, and does the sort order change it.**
 *
 * This sizes M4's overlay. Q1 was answered **C** (all links behind a `View ▾` toggle) *ahead* of this
 * measurement, so the number no longer decides whether M4 happens — it sizes the mitigation, and the
 * cap exists either way (`implementation-plan.md`, "Review findings").
 *
 * ## What is driven through the real product, and what is not (ADR-0081)
 *
 * ADR-0081 requires a harness to say where it bypasses the product, because `measure-band-copy` once
 * made a milestone look **more** finished than it was by calling functions directly while no UI path
 * existed. Per task here:
 *
 * - **Real UI:** sign-up, onboarding, client/project/plan creation, switching to the Gantt, and every
 *   sort — all driven by clicking the shipped controls. The sort is deliberately a **click on the
 *   column header** (`GanttPanel.tsx:278-284`, already shipped) rather than a URL parameter, because
 *   the question is what a planner can reach.
 * - **Bypassed:** the activities themselves are seeded over the REST API by `seedActivities`, whose
 *   own docblock explains why — authoring hundreds of bars by click would measure the canvas, take
 *   minutes, and fail for reasons unrelated to the Gantt.
 * - **Not measured here:** the *render cost* of drawing N paths. This counts links; it does not prove
 *   that drawing them is cheap. Those are different questions, and this project has paid for
 *   conflating "we have a number" with "the number is safe" — ADR-0065's draw budget was out by 4–6×
 *   until somebody ran it in a browser (`docs/TECH_DEBT.md` #75). A render measurement is its own task.
 *
 * ## The fixture
 *
 * The catalogue's scale tier is a **parameterised generator**, not a fixed plan:
 * `schedulepoint-seed scale --activities 2000` (`packages/seed/src/scale/generator.ts:122`,
 * `apps/seed-cli/src/args.spec.ts:70`). This harness seeds its own plan through the same REST API for
 * self-containment, and **asserts the shape it produced** rather than trusting the count — ADR-0066
 * M4 records this generator once yielding "one long queue" (96% critical) while every declared shape
 * number was correct. A measurement taken on one long queue would report a link density no real
 * programme has.
 *
 * ## Why 1646 first
 *
 * ADR-0091's retrospective records that ADR-0090 and ADR-0091 were both measured at 1920/1440/1024/768
 * and the product owner's Surface Pro is **1646 CSS px** — so two entire epics were tuned at widths
 * nobody uses. 1646 leads here and is the width any single reported figure refers to.
 */

/** The product owner's Surface Pro at 175%, and the width every headline figure below refers to. */
const PRIMARY = { width: 1646, height: 1097 };

/** Kept smaller than the plan's 2,000 so a full run is minutes rather than an hour. */
const ACTIVITY_COUNT = Number(process.env.MEASURE_ACTIVITIES ?? 400);

/** The three orders R5 must sweep. WBS/plan order is the most link-local case there is. */
const SORTS = ['(default)', 'Float', 'Start'] as const;

test.describe.configure({ mode: 'serial' });

test('R5 — links crossing the viewport, across three sort orders', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000);
  await page.setViewportSize(PRIMARY);

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Density');
  const planId = openPlanId(page);
  // Seeding writes through the API, which is pen-gated (ADR-0028) — the harness must hold the plan
  // edit lock like any other client. Omitting this failed with 200 × 423 LOCKED, which is the guard
  // working correctly on a caller that had not asked for the pen.
  await startEditing(page);

  // Seed from the REAL scale generator, not `seedActivities`. That helper creates a flat chain of
  // N activities — it exists to make rows exist — and the first run of this harness measured it at
  // **100% critical**: one long queue, the exact shape ADR-0066 M4 records at 96%. Every span in a
  // queue is 1, so crossings are trivially zero and a density figure taken there describes no real
  // programme. `scaleSpec` builds phases, sub-phases, WBS bands and 1.45 links per activity, which
  // is what the sort orders in R5 are supposed to rearrange.
  const spec = scaleSpec({ activities: ACTIVITY_COUNT });

  // **Seeded in chunks, not one long `page.evaluate`.** At 2,000 activities the single-evaluate
  // version issued ~5,200 sequential requests inside one call and died with `TypeError: Failed to
  // fetch` — a page-context lifetime problem, not a server one, and it reads like a network error
  // rather than "your evaluate ran too long". Chunking keeps each call short and lets the id map
  // live in Node.
  const CHUNK = 100;
  const ids = new Map<string, string>();
  const bad: string[] = [];

  // Summaries first: a child names its parent by id, so the parent must exist before it.
  const ordered = [...spec.activities].sort((a, b) =>
    a.type === 'WBS_SUMMARY' && b.type !== 'WBS_SUMMARY'
      ? -1
      : a.type !== 'WBS_SUMMARY' && b.type === 'WBS_SUMMARY'
        ? 1
        : 0,
  );

  for (let start = 0; start < ordered.length; start += CHUNK) {
    const slice = ordered.slice(start, start + CHUNK).map((a) => ({
      key: a.key,
      code: a.code,
      name: a.name,
      type: a.type,
      durationDays: Math.max(0, Math.round(a.durationMinutes / 1440)),
      parentId: a.parentKey ? (ids.get(a.parentKey) ?? null) : null,
    }));
    const out = await page.evaluate(
      async ({ org, id, rows }: { org: string; id: string; rows: typeof slice }) => {
        const made: [string, string][] = [];
        const failed: string[] = [];
        for (const r of rows) {
          const res = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: r.name,
              code: r.code,
              type: r.type,
              durationDays: r.durationDays,
              ...(r.parentId ? { parentId: r.parentId } : {}),
            }),
          });
          if (!res.ok) {
            failed.push(`${r.code}: ${res.status} ${(await res.text()).slice(0, 100)}`);
            continue;
          }
          made.push([r.key, ((await res.json()) as { data: { id: string } }).data.id]);
        }
        return { made, failed };
      },
      { org: orgSlug, id: planId, rows: slice },
    );
    for (const [key, value] of out.made) ids.set(key, value);
    bad.push(...out.failed);
  }

  const deps = (spec.dependencies ?? []).flatMap((d) => {
    const p = ids.get(d.predecessorKey);
    const q = ids.get(d.successorKey);
    return p && q ? [{ predecessorId: p, successorId: q, type: d.type }] : [];
  });
  for (let start = 0; start < deps.length; start += CHUNK) {
    const slice = deps.slice(start, start + CHUNK);
    const failed = await page.evaluate(
      async ({ org, id, rows }: { org: string; id: string; rows: typeof slice }) => {
        const out: string[] = [];
        for (const r of rows) {
          const res = await fetch(`/api/v1/organizations/${org}/plans/${id}/dependencies`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...r, lagDays: 0 }),
          });
          if (!res.ok) out.push(`link: ${res.status} ${(await res.text()).slice(0, 100)}`);
        }
        return out;
      },
      { org: orgSlug, id: planId, rows: slice },
    );
    bad.push(...failed);
  }

  // Report what it actually seeded rather than what it asked for — the `seedActivities` rule.
  expect(bad.length, `seeding rejected ${bad.length}: ${bad.slice(0, 3).join('; ')}`).toBe(0);

  // **Recalculate FIRST, then read.** This block used to run AFTER the graph read, and the
  // consequence was not a slightly-off number: `isCritical` and `totalFloat` are engine-written
  // columns, so reading them before the engine has run reports every activity as non-critical. The
  // harness printed `criticalShare: 0` and the shape gate asserting "< 0.9 or this is one queue"
  // could not fail — a gate that always passes, which is the thing this epic keeps writing down.
  //
  // The earlier "100% critical" reading was the same race in the other direction: ADR-0032's
  // coalesced auto-recalc had fired by then, so that run read a computed plan and this one did not.
  // Both numbers were reads of a moving target. The fix is to force the recalculation and wait for
  // it, so the shape assertions are made against a settled schedule.
  // Recalculate before switching view: the Gantt draws from engine-computed columns, so without
  // this it renders its "not calculated" state and there is no grid to read an order from. The
  // journey helper's own flow does this; seeding alone does not.
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ org, id }: { org: string; id: string }) => {
            const res = await fetch(
              `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
              { credentials: 'include' },
            );
            if (!res.ok) return 0;
            return ((await res.json()) as { data: { earlyFinish: string | null }[] }).data.filter(
              (a) => a.earlyFinish !== null,
            ).length;
          },
          { org: orgSlug, id: planId },
        ),
      { message: 'the recalculation never produced computed dates', timeout: 60_000 },
    )
    .toBeGreaterThan(0);

  // Read the graph from the API rather than the DOM: a link's row span is a property of the plan and
  // the current order, not of what happens to be painted.
  const graph = await page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) => {
      // Throws rather than returning [] on a bad response. The first version swallowed it, and a
      // rejected read then presented as "the plan has no activities" — a harness that lies about
      // what it measured, which is the failure `seedActivities`' own docblock was written about.
      // Pages to exhaustion at the API's own maximum. `limit` is capped at 100 (422 above it), which
      // the first version discovered only because this throws instead of returning [] — swallowed, a
      // rejected read presented as "the plan has no activities", i.e. a harness lying about what it
      // measured.
      const get = async (path: string) => {
        const out: unknown[] = [];
        let cursor: string | null = null;
        for (;;) {
          const url = `${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) throw new Error(`${res.status} ${url}: ${(await res.text()).slice(0, 200)}`);
          const body = (await res.json()) as {
            data: unknown[];
            meta?: { nextCursor?: string | null };
          };
          out.push(...body.data);
          cursor = body.meta?.nextCursor ?? null;
          if (!cursor || body.data.length === 0) return out;
        }
      };
      return {
        activities: (await get(`/api/v1/organizations/${slug}/plans/${id}/activities`)) as {
          id: string;
          totalFloat: number | null;
          isCritical: boolean;
        }[],
        // Nested endpoint OBJECTS, not flat `*Id` fields — `DependencySummary` →
        // `DependencyEndpoint` in `packages/types`. Reading the flat names gave undefined for every
        // link and a confident 0 crossings.
        dependencies: (await get(`/api/v1/organizations/${slug}/plans/${id}/dependencies`)) as {
          predecessor: { id: string };
          successor: { id: string };
        }[],
      };
    },
    { slug: orgSlug, id: planId },
  );

  // ---- Shape assertions, BEFORE any density figure is believed (ADR-0066 M4) -------------------
  const criticalShare =
    graph.activities.filter((a) => a.isCritical).length / Math.max(1, graph.activities.length);
  const linksPerActivity = graph.dependencies.length / Math.max(1, graph.activities.length);
  const shape = {
    activities: graph.activities.length,
    links: graph.dependencies.length,
    criticalShare,
    linksPerActivity,
  };

  expect(graph.activities.length, 'the seed produced the plan it claimed').toBeGreaterThan(
    ACTIVITY_COUNT * 0.9,
  );
  // "One long queue" is the failure mode: near-total criticality means a single chain, whose link
  // spans are all 1 and whose density figure would describe no real programme.
  expect(
    criticalShare,
    `${(criticalShare * 100).toFixed(0)}% critical — this looks like one queue`,
  ).toBeLessThan(0.9);
  expect(linksPerActivity, 'a plan with almost no logic measures nothing').toBeGreaterThan(0.3);

  await showGantt(page);

  /**
   * The FULL row order the Gantt is currently presenting, as `id → zero-based index`.
   *
   * The rendered window is ~39 rows, but each row carries `aria-rowindex` = its position in the
   * **whole** set (`GanttPanel.tsx`: "the index is the row's position in the FULL set, not the
   * rendered window, which is what makes virtualization invisible to assistive technology"). So
   * scrolling the container and accumulating `(id, aria-rowindex)` reconstructs the entire order
   * without duplicating the row model's sorting — which is the thing that must not be reimplemented,
   * because a second ordering would drift from the one on screen exactly when it mattered.
   */
  async function fullOrder(): Promise<Map<string, number>> {
    const seen = new Map<string, number>();
    // The treegrid is INSIDE the scroller, not the scroller itself (`GanttPanel.tsx:395` — the
    // `overflow-auto` div carries `scrollRef` and wraps the grid at `:411`). Scrolling the treegrid
    // moved nothing, the order stayed at one window, and the guard below correctly refused to report
    // a density from it. So walk up to the first genuinely scrollable ancestor.
    const step = async (delta: number): Promise<number> =>
      page.evaluate((by) => {
        let el = document.querySelector('[role="treegrid"]')?.parentElement ?? null;
        while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
        if (!el) return -1;
        el.scrollTop = by < 0 ? 0 : el.scrollTop + el.clientHeight * 0.8;
        return el.scrollTop;
      }, delta);

    let lastSize = -1;
    for (let i = 0; i < 300 && seen.size !== lastSize; i += 1) {
      lastSize = seen.size;
      const batch = await page.evaluate(() =>
        [...document.querySelectorAll('[role="row"][data-activity-id]')].map((el) => ({
          id: (el as HTMLElement).dataset.activityId ?? '',
          index: Number((el as HTMLElement).getAttribute('aria-rowindex') ?? '0') - 2,
        })),
      );
      for (const row of batch) if (row.id) seen.set(row.id, row.index);
      const top = await step(1);
      expect(top, 'no scrollable ancestor above the treegrid').not.toBe(-1);
      await page.waitForTimeout(120);
    }
    await step(-1);
    await page.waitForTimeout(150);
    return seen;
  }

  /** Rows rendered right now, in full-set coordinates — the window a crossing is measured against. */
  async function renderedWindow(): Promise<{ start: number; end: number; count: number }> {
    const idx = await page.evaluate(() =>
      [...document.querySelectorAll('[role="row"][data-activity-id]')].map(
        (el) => Number((el as HTMLElement).getAttribute('aria-rowindex') ?? '0') - 2,
      ),
    );
    return { start: Math.min(...idx), end: Math.max(...idx), count: idx.length };
  }

  const readings: Record<string, unknown>[] = [];
  for (const sort of SORTS) {
    if (sort !== '(default)') {
      // Click the shipped column header — what a planner can actually reach.
      await page
        .getByRole('button', { name: new RegExp(`^${sort}`, 'i') })
        .first()
        .click();
      await page.waitForTimeout(400);
    }

    const order = await fullOrder();
    const win = await renderedWindow();
    const height = Math.max(1, win.end - win.start + 1);

    // Sweep the window down the plan and count, per position, the links that would be DRAWN under
    // each candidate rule. The two differ and the difference is the whole of M4's cost question:
    //
    //   endpointVisible — at least one endpoint inside the window. This is the adopted rule, and it
    //     is what `render/paint.ts:1042` has shipped on the canvas all along. Bounded by the summed
    //     degree of the rendered rows, so it cannot depend on the sort.
    //   spanCrosses    — the interval [min,max] overlaps the window, INCLUDING links with both
    //     endpoints outside it. Recorded to show what the rejected rule would have cost; it is a
    //     function of the plan and the order, not of the viewport.
    const positions: number[] = [];
    for (
      let start = 0;
      start + height <= order.size;
      start += Math.max(1, Math.floor(height / 2))
    ) {
      positions.push(start);
    }
    if (positions.length === 0) positions.push(0);

    const endpointVisible: number[] = [];
    const spanCrosses: number[] = [];
    for (const start of positions) {
      const end = start + height - 1;
      let inWindow = 0;
      let crossing = 0;
      for (const dep of graph.dependencies) {
        // `predecessor`/`successor` are nested OBJECTS on the DTO, not flat `*Id` fields
        // (`packages/types` DependencySummary → DependencyEndpoint). The first version read
        // `dep.predecessorId`, got `undefined` for every link, and reported 0 crossings against 320
        // links — a plausible-looking zero produced by a field name I assumed instead of read.
        const a = order.get(dep.predecessor.id);
        const b = order.get(dep.successor.id);
        if (a === undefined || b === undefined) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        if ((a >= start && a <= end) || (b >= start && b <= end)) inWindow += 1;
        if (lo <= end && hi >= start) crossing += 1;
      }
      endpointVisible.push(inWindow);
      spanCrosses.push(crossing);
    }

    const p95 = (xs: number[]) =>
      xs.length === 0
        ? 0
        : [...xs].sort((m, n) => m - n)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))]!;

    readings.push({
      sort,
      orderedRows: order.size,
      renderedRows: win.count,
      windowsSampled: positions.length,
      endpointVisible: { p95: p95(endpointVisible), max: Math.max(...endpointVisible) },
      spanCrosses: { p95: p95(spanCrosses), max: Math.max(...spanCrosses) },
    });
  }

  const path = writeMeasurement('gantt-link-density', {
    viewport: PRIMARY,
    fixture: {
      command: `schedulepoint-seed scale --activities ${ACTIVITY_COUNT}`,
      seededVia: 'REST API (seedActivities), not the catalogue CLI — same endpoints',
    },
    shape,
    readings,
  });
  test.info().annotations.push({ type: 'measurement', description: path });

  // A zero against a plan that HAS links is a defect in the harness, not a finding about the Gantt.
  // This exists because the first run reported exactly that, from a mis-read field name.
  if (graph.dependencies.length > 0) {
    expect(
      readings.some((r) => ((r.endpointVisible as { max: number }).max ?? 0) > 0),
      `every window counted 0 links while the plan has ${graph.dependencies.length} — the ids are not matching`,
    ).toBe(true);
  }

  // The harness must not report a density it did not establish. If the rows carry no activity id
  // there is nothing to compute spans from, and that is a finding about the DOM, not a zero.
  // The harness must not report a density it did not establish.
  expect(
    readings.every((r) => (r.orderedRows as number) > 0),
    'no row carried a data-activity-id — the order cannot be derived from the DOM',
  ).toBe(true);
  // Every sort must have reconstructed the WHOLE plan, or the crossing counts are taken against a
  // partial order and are meaningless. This is the assertion that stops a short scroll being
  // reported as a low density.
  for (const r of readings) {
    expect(
      r.orderedRows,
      `${String(r.sort)}: reconstructed only ${String(r.orderedRows)} of ${graph.activities.length} rows`,
    ).toBe(graph.activities.length);
  }
});
