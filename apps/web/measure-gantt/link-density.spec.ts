import { expect, test } from '@playwright/test';

import { writeMeasurement } from '../measure-toolbar/output';
import {
  createClient,
  createPlan,
  createProject,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
} from '../e2e-gantt/support';

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
  await seedActivities(page, orgSlug, ACTIVITY_COUNT);

  // Read the graph from the API rather than the DOM: a link's row span is a property of the plan and
  // the current order, not of what happens to be painted.
  const graph = await page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) => {
      const get = async (path: string) => {
        const res = await fetch(path, { credentials: 'include' });
        return res.ok ? ((await res.json()) as { data: unknown[] }).data : [];
      };
      return {
        activities: (await get(
          `/api/v1/organizations/${slug}/plans/${id}/activities?limit=5000`,
        )) as { id: string; totalFloat: number | null; isCritical: boolean }[],
        dependencies: (await get(
          `/api/v1/organizations/${slug}/plans/${id}/dependencies?limit=20000`,
        )) as { predecessorId: string; successorId: string }[],
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

  const readings: Record<string, unknown>[] = [];
  for (const sort of SORTS) {
    if (sort !== '(default)') {
      // Click the shipped column header — what a planner can actually reach.
      await page
        .getByRole('button', { name: new RegExp(`^${sort}`, 'i') })
        .first()
        .click();
      await page.waitForTimeout(300);
    }

    // The row order as the Gantt currently presents it, read from the rendered grid's own row ids.
    const order = await page.evaluate(() =>
      [...document.querySelectorAll('[role="row"][data-activity-id]')].map(
        (el) => (el as HTMLElement).dataset.activityId ?? '',
      ),
    );

    readings.push({
      sort,
      visibleRows: order.length,
      note: order.length === 0 ? 'no data-activity-id on rows — see below' : 'ok',
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

  // The harness must not report a density it did not establish. If the rows carry no activity id
  // there is nothing to compute spans from, and that is a finding about the DOM, not a zero.
  expect(
    readings.every((r) => (r.visibleRows as number) > 0),
    'no row carried a data-activity-id — the span cannot be derived from the DOM as written',
  ).toBe(true);
});
