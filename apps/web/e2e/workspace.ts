import { expect, type Page } from '@playwright/test';

/**
 * Two facts about the plan workspace that most of these journeys need, in one place.
 *
 * The base suite ran on the **legacy stacked plan-detail page** until `VITE_CANVAS_WORKSPACE`
 * retired: a long scrolling column with the activities table always rendered and a schedule
 * summary strip above it. The workspace is canvas-maximal instead, and two consequences reach
 * almost every spec here. Both are collected rather than repeated per file, because seven specs
 * needed the first and four the second — which is a shared helper, not a coincidence.
 *
 * `e2e/combobox.ts` is the precedent for a shared helper module in this directory.
 */

/**
 * Make the activities table reachable.
 *
 * The panel is **collapsed by default** (ADR-0030 — the canvas gets the room), and returns to that
 * default on every load. Two traps live behind these three lines, both paid for by a failing run
 * during the conversion rather than found by reading:
 *
 * 1. `DataTable` renders its empty state **instead of** a `<table>` when there are no rows
 *    (`src/components/ui/data-table.tsx:86`), so waiting for the table is wrong on an empty plan —
 *    which is exactly when this first runs.
 * 2. `isVisible()` is a snapshot, not a wait. Called straight after a navigation or reload it
 *    answers "no" because the app has not painted, the expand is skipped, and the missing table
 *    then reads exactly like the write under test having failed to persist.
 *
 * So it waits on the panel **toggle**, which is present in one state or the other whenever the
 * workspace has rendered. Idempotent.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

/**
 * Wait until the open plan actually has a computed schedule.
 *
 * These journeys used `getByText('Project finish')` as their post-recalculation checkpoint — the
 * legacy page's `ScheduleSummaryStrip` label. The workspace carries the same fact in the toolbar's
 * finish chip, which renders the **date**, holds the words only as an accessible name, and
 * **withholds itself below the `compact` density band** (ADR-0092: a `render` item cannot demote,
 * so disappearing is its only way to yield width). At these viewports it is legitimately absent, so
 * no locator for it can work.
 *
 * Reading the computed dates from the API is width-independent and a **stronger** claim than the
 * label ever made: it proves the schedule computed rather than that a word rendered.
 */
export async function awaitComputedSchedule(page: Page, orgSlug: string): Promise<void> {
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ slug, id }: { slug: string; id: string }) => {
            const res = await fetch(`/api/v1/organizations/${slug}/plans/${id}/activities`, {
              credentials: 'include',
            });
            if (!res.ok) return 0;
            const body = (await res.json()) as { data: { earlyFinish: string | null }[] };
            return body.data.filter((a) => a.earlyFinish !== null).length;
          },
          { slug: orgSlug, id: planId },
        ),
      { message: 'the recalculation never produced computed dates', timeout: 20_000 },
    )
    .toBeGreaterThan(0);
}

/**
 * Assert the open plan has **no** computed schedule yet — the precondition before a recalculation.
 *
 * The legacy page showed this as `ScheduleSummaryStrip`'s "Schedule not yet calculated". On the
 * workspace that strip lives inside the `Summary ▾` popover, so the text is real but one click
 * away; asserting it would make a precondition check depend on opening a popover. Read at the API
 * instead, symmetrically with {@link awaitComputedSchedule}.
 */
export async function expectNoComputedSchedule(page: Page, orgSlug: string): Promise<void> {
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  const computed = await page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${id}/activities`, {
        credentials: 'include',
      });
      if (!res.ok) return -1;
      const body = (await res.json()) as { data: { earlyFinish: string | null }[] };
      return body.data.filter((a) => a.earlyFinish !== null).length;
    },
    { slug: orgSlug, id: planId },
  );
  expect(computed, 'the plan already has computed dates before the recalculation').toBe(0);
}
