import { type Page } from '@playwright/test';

import { expectPenFree, holdThePen, releaseThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';

import { refetchLock, setUpTwoActors } from './support';

/**
 * The pen on opening (ADR-0220). A Planner or Org Admin who opens a plan nobody is editing holds the
 * pen without pressing anything; a colleague who opens it second sees today's hand-off; Stop is
 * respected for the opening.
 *
 * Every assertion is an invariant — a role, an accessible name, an exact sentence, a request count,
 * or what the API reads back — never a pixel or a duration. The journeys that are not ABOUT the
 * automatic take say `holdThePen` (which works in both orderings) rather than relying on it, so a
 * defect in the automatic take fails the journeys named for it and no others.
 *
 * **Counting acquires.** `POST …/edit-lock` is the acquire; `/heartbeat`, `/request` and `/handoff`
 * are different paths and do not match.
 */
const CROSS_ACTOR = { timeout: 20_000 };

const HOLDING = 'You’re editing this plan.';

/** Count every acquire this page sends from now on. */
function countAcquires(page: Page): () => number {
  let n = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/edit-lock$/.test(new URL(req.url()).pathname)) n += 1;
  });
  return () => n;
}

/** The lock state the API reads for the signed-in user of `page`. */
async function lockState(page: Page, planUrl: string): Promise<string> {
  const match = /\/orgs\/([^/]+)\/(?:.*\/)?plans\/([^/?#]+)/.exec(new URL(planUrl).pathname);
  if (!match) throw new Error(`no org and plan in ${planUrl}`);
  const [, slug, id] = match;
  return page.evaluate(
    async ({ slug, id }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${id}/edit-lock`, {
        credentials: 'include',
      });
      const body = (await res.json()) as { data: { state: string } };
      return body.data.state;
    },
    { slug: slug ?? '', id: id ?? '' },
  );
}

/** The pen is this page's, and nothing about it needed pressing. */
async function expectHeldWithoutPressing(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await expect(page.getByText(HOLDING, { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
}

test('an Org Admin who opens a free plan holds the pen without pressing anything', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { ctxA, a, ctxB } = await setUpTwoActors(browser);
  const acquires = countAcquires(a);

  // The fixture left the plan free; this is a fresh opening. The test never calls `holdThePen` and
  // never clicks Start editing.
  await a.goto(new URL(a.url()).href);
  await expectHeldWithoutPressing(a);
  expect(acquires()).toBe(1);

  await ctxA.close();
  await ctxB.close();
});

test('a Planner who opens a free plan holds the pen too', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctxA, ctxB, a, b, planUrl } = await setUpTwoActors(browser);
  const acquires = countAcquires(b);

  await b.goto(planUrl);
  await expectHeldWithoutPressing(b);
  expect(acquires()).toBe(1);
  // From the other side: the Admin, opening it second, finds it held and offered a take-over,
  // never an automatic one.
  await a.goto(planUrl);
  await expect(a.getByRole('button', { name: 'Take over', exact: true })).toBeVisible(CROSS_ACTOR);
  await expect(a.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

test('a second planner sees who is editing and is offered Request control, as before', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { ctxA, ctxB, a, b, planUrl } = await setUpTwoActors(browser);

  await a.goto(planUrl);
  await holdThePen(a);

  const acquires = countAcquires(b);
  await b.goto(planUrl);
  await expect(b.getByText('Holder is editing this plan.', { exact: true })).toBeVisible();
  await expect(b.getByRole('button', { name: 'Request control' })).toBeVisible();
  // B does not hold it, read from the server rather than from B's own screen.
  await expect.poll(() => lockState(b, planUrl)).toBe('HELD_BY_OTHER');
  expect(acquires()).toBe(0);

  await ctxA.close();
  await ctxB.close();
});

test('Stop editing is respected: the pen is not taken back, and not taken from a poll', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { ctxA, ctxB, a, b, planUrl } = await setUpTwoActors(browser);

  await a.goto(planUrl);
  await holdThePen(a);
  await b.goto(planUrl);
  await expect(b.getByRole('button', { name: 'Request control' })).toBeVisible();

  const aAcquires = countAcquires(a);
  const bAcquires = countAcquires(b);
  await releaseThePen(a);

  // Both pages re-read the lock after the release, A's own and B's.
  await refetchLock(b);
  await expect(b.getByText('No one is editing this plan.', { exact: true })).toBeVisible(
    CROSS_ACTOR,
  );
  await refetchLock(a);
  await expectPenFree(a);
  await expect(b.getByRole('button', { name: 'Start editing' })).toBeVisible();
  await expect(b.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);

  expect(aAcquires()).toBe(0);
  expect(bAcquires()).toBe(0);
  expect(await lockState(a, planUrl)).toBe('FREE');

  await ctxA.close();
  await ctxB.close();
});

test('closing a second tab does not tell the first it was taken over', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctxA, ctxB, a, planUrl } = await setUpTwoActors(browser);

  await a.goto(planUrl);
  await holdThePen(a);
  const firstTabAcquires = countAcquires(a);

  // A second tab of the same person reads the lease as already theirs and sends nothing.
  const tab2 = await ctxA.newPage();
  const secondTabAcquires = countAcquires(tab2);
  await tab2.goto(planUrl);
  await expect(tab2.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  expect(secondTabAcquires()).toBe(0);

  // Closing it releases the person's lease (the lock is per user, not per tab). Wait until the
  // server says so, so the first tab's next beat meets a lease that is really gone.
  await tab2.close({ runBeforeUnload: true });
  await expect.poll(() => lockState(a, planUrl), CROSS_ACTOR).toBe('FREE');

  // The first tab's beat (forced the way it happens when the tab returns to the foreground) is
  // refused; the plan is free, so it takes the pen back without a word.
  await refetchLock(a);
  // The retake is the evidence the beat was refused: until it is sent, the screen still shows the
  // state from before the beat, which reads "editing" for the wrong reason.
  await expect.poll(firstTabAcquires, CROSS_ACTOR).toBe(1);
  await expect(a.getByText(HOLDING, { exact: true })).toBeVisible(CROSS_ACTOR);
  await expect(a.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await expect(a.getByText(/taken over/)).toHaveCount(0);
  await expect(a.getByRole('alert')).toHaveCount(0);
  expect(firstTabAcquires()).toBe(1);
  expect(await lockState(a, planUrl)).toBe('HELD_BY_ME');

  await ctxA.close();
  await ctxB.close();
});

test('a Viewer who opens a free plan does not take the pen', async ({ browser }) => {
  test.setTimeout(150_000);
  const { ctxA, ctxB, a, extras, planUrl } = await setUpTwoActors(browser, ['VIEWER']);
  const viewer = extras[0]!;
  const acquires = countAcquires(viewer.page);

  await viewer.page.goto(planUrl);
  await expect(
    viewer.page.getByText('No one is editing this plan.', { exact: true }),
  ).toBeVisible();
  await expect(viewer.page.getByRole('button', { name: 'Stop editing' })).toHaveCount(0);
  // The deck may draw the verb shaded, with its reason; what matters is that none is on offer.
  await expect(
    viewer.page.getByRole('button', { name: 'Start editing', disabled: false }),
  ).toHaveCount(0);
  expect(acquires()).toBe(0);
  // Read from somebody who could take it: still free.
  expect(await lockState(a, planUrl)).toBe('FREE');

  await viewer.ctx.close();
  await ctxA.close();
  await ctxB.close();
});

test('two planners opening a free plan at once: one holds it, the other is not shown an error', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { ctxA, ctxB, b, extras, planUrl } = await setUpTwoActors(browser, ['PLANNER']);
  const c = extras[0]!.page;

  await Promise.all([b.goto(planUrl), c.goto(planUrl)]);

  const holding = (page: Page) => page.getByRole('button', { name: 'Stop editing' });
  const asking = (page: Page) => page.getByRole('button', { name: 'Request control' });
  // Exactly one of the two ends up holding, whoever the server served first.
  await expect
    .poll(async () => (await holding(b).count()) + (await holding(c).count()), CROSS_ACTOR)
    .toBe(1);
  const winner = (await holding(b).count()) === 1 ? b : c;
  const loser = winner === b ? c : b;
  await expect(asking(loser)).toBeVisible(CROSS_ACTOR);
  await expect(holding(loser)).toHaveCount(0);
  await expect(winner.getByText(HOLDING, { exact: true })).toBeVisible();
  await expect(b.getByRole('alert')).toHaveCount(0);
  await expect(c.getByRole('alert')).toHaveCount(0);

  await extras[0]!.ctx.close();
  await ctxA.close();
  await ctxB.close();
});
