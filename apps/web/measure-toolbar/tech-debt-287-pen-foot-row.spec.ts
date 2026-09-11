import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **`docs/TECH_DEBT.md` #287 — the one reading that row asks for, and nothing else.**
 *
 * The pen's badge, live-region sentence and hand-off controls portal into `PenStatusOutlet`, which
 * sits inside `PlanFacts` — a container carrying `shrink-0`. CQ-4's own reasoning rejected that
 * home for exactly that word: it is the one item in the foot row that cannot give way.
 *
 * **`shrink-0` on a foot-row child is this repository's recorded shape for a clipped control.**
 * ADR-0114 M1 found four controls painted and pointer-unreachable behind one; ADR-0115 then had to
 * re-scope a `max-w-64` off the same container for the same reason. Nothing says this instance is
 * clipping — what is missing is the reading that would settle it.
 *
 * **The combination nobody has measured**, in #287's own words: an activity selected (so the
 * object-action bar occupies the dock), a lock state **offering hand-off controls** (a peer
 * asking), and **1440** — the narrowest width the epic is judged at. Three sources of width in a
 * row where one of them cannot shrink.
 *
 * M0-T4 measured the resting case and named this gap itself — _"Owed at M5: the same reading with
 * an activity selected (the dock bar occupying the row) and at 1440"_. It was never taken. M6
 * re-measured the foot at a flat 51 px across four widths, but its fixture is **pen held with no
 * request outstanding**, which is the one branch offering no hand-off controls at all: the narrow
 * case, not the wide one.
 *
 * ## The conditions, written before the run
 *
 * Four consecutive epics on this surface have had a width expectation contradicted by their own
 * measurement, so the verdict is computed from the readings rather than read off them afterwards.
 *
 * **C1 — is anything clipped?** At each width, with the request outstanding and an activity
 * selected, no control inside the foot row may have its right edge beyond the row's own right
 * edge, and the row's `scrollWidth` may not exceed its `clientWidth`.
 *
 * **C2 — is anything unreachable?** ADR-0114 M1's lesson is that a box measurement is NOT
 * reachability: a control clipped by an ancestor's `overflow-hidden` has a perfectly ordinary
 * rectangle, and focusing it moves that rectangle by **zero**, because there is nothing scrollable
 * to move. So every control is probed with `elementFromPoint` at its own centre. A control whose
 * centre resolves to something else is unreachable by pointer whatever its box says.
 *
 * **C3 — the control case.** The same page with the request **dismissed** (pen held, no hand-off
 * controls) must produce a narrower required width than the request-outstanding case at the same
 * width. If it does not, the fixture never reached the state this row is about and the reading is
 * void — the ADR-0093 shape: a pass over a population that is not the one named.
 *
 * ## What it does NOT establish
 *
 * One machine, one browser, one plan. It measures the **peer-request** branch and not the Org
 * Admin override branch, which offers a different control set; #287 names both, and this settles
 * the one its own words put first. Nothing here is a claim about any width but those probed.
 */

const WIDTHS = [1440, 1646, 1920] as const;

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
}

/** Bring the holder's lock-status query up to date without a reload, which would drop the pen. */
async function refetchLock(page: Page): Promise<void> {
  await page.bringToFront();
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

interface ControlReading {
  readonly label: string;
  readonly right: number;
  readonly width: number;
  readonly beyondRow: boolean;
  readonly pointerReachable: boolean;
}

interface RowReading {
  readonly error?: string;
  readonly rowRight?: number;
  /**
   * **The quantity that turned out to matter.** This row WRAPS (ADR-0114 M1 changed its
   * `shrink-0` to `min-w-0`, and ADR-0115 measured the consequence), so it never reports a
   * `scrollWidth` above its `clientWidth` — extra controls buy a second line rather than an
   * overflow. Width answers "is anything clipped"; only height answers "what does it cost".
   */
  readonly height?: number;
  readonly canvasHeight?: number | undefined;
  readonly scrollWidth?: number;
  readonly clientWidth?: number;
  readonly overflows?: boolean;
  readonly requiredWidth?: number;
  readonly controls?: readonly ControlReading[];
}

async function readFootRow(page: Page): Promise<RowReading> {
  return page.evaluate((): RowReading => {
    const round = (n: number) => Math.round(n * 10) / 10;
    const row = document.querySelector<HTMLElement>('[data-activities-bar]');
    if (!row) return { error: 'no [data-activities-bar]' };
    const box = row.getBoundingClientRect();

    const controls = [...row.querySelectorAll<HTMLElement>('button, [role="button"]')].map((c) => {
      const b = c.getBoundingClientRect();
      // The centre, because a control clipped at one edge can still have a reachable middle — and
      // the reverse. `elementFromPoint` answers what a pointer would actually hit.
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        label: (c.getAttribute('aria-label') ?? c.textContent ?? '').trim().slice(0, 40),
        right: round(b.right),
        width: round(b.width),
        beyondRow: b.right > box.right + 1,
        // A zero-size control is not reachable and is not clipped either; it is reported rather
        // than counted, because ADR-0110 D5 records a gate that passed a control shrunk to nothing.
        pointerReachable: b.width > 0 && b.height > 0 && hit !== null && c.contains(hit),
      };
    });

    const canvasSection = document.querySelector<HTMLElement>(
      'section[aria-label="Time-scaled logic diagram"]',
    );

    return {
      rowRight: round(box.right),
      height: round(box.height),
      canvasHeight: canvasSection ? round(canvasSection.getBoundingClientRect().height) : undefined,
      scrollWidth: round(row.scrollWidth),
      clientWidth: round(row.clientWidth),
      overflows: row.scrollWidth > row.clientWidth + 1,
      // What the row would need if nothing shrank — the figure that says how close it is, which a
      // pass/fail on today's width cannot.
      requiredWidth: round(row.scrollWidth),
      controls,
    };
  });
}

test('#287 — the pen foot row with a hand-off outstanding and an activity selected', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  clearMeasurement('techdebt-287-pen-foot-row');

  const stamp = Date.now();
  const orgName = `Pen Foot ${stamp}`;

  // --- Holder A: org, invite a Planner, a plan with activities --------------------------------
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  await signUp(a, 'Holder A', `holder-${stamp}@example.com`);
  await a.getByLabel('Organisation name').fill(orgName);
  await a.getByRole('button', { name: /create organisation/i }).click();
  await expect(a.getByRole('heading', { level: 1, name: orgName })).toBeVisible();

  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const dialog = a.getByRole('dialog');
  await dialog.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await dialog.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await a.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  // The slug the API helpers need, read from the URL the organisation landed on rather than
  // rebuilt from the name — a slug is the server's answer, not a transformation of the input.
  const orgSlug = /\/orgs\/([^/?#]+)/.exec(a.url())?.[1] ?? '';
  expect(orgSlug).not.toBe('');

  await createHierarchy(a);
  await newPlan(a, `Foot row ${stamp}`);
  const planUrl = a.url();
  await ensurePen(a);
  await seedActivities(a, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 5 }]);
  // `recalculate` RELOADS, and a reload fires the holder's `pagehide` pen release — so the plan is
  // brought to a computed state first and the pen re-taken afterwards. Getting this the other way
  // round leaves the fixture without the pen and the hand-off branch unreachable, which would
  // measure a state this row is not about.
  await recalculate(a, orgSlug);
  await ensurePen(a);

  // --- Peer B: accept, open the plan, request control -----------------------------------------
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await signUp(b, 'Peer B', `peer-${stamp}@example.com`);
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);
  await b.goto(planUrl);
  const requestBtn = b.getByRole('button', { name: 'Request control' });
  await expect(requestBtn).toBeVisible();
  await requestBtn.click();

  // --- A: the request is outstanding, so the hand-off controls render --------------------------
  //
  // **Polled, not nudged once.** The holder's lock-status query has to re-pull before the peer's
  // request is visible, and one `visibilitychange` is a race: an earlier run of this spec reached
  // the end with the controls present and the next failed here with nothing else changed. The
  // pen-handoff journey records the same need. So nudge repeatedly until the control appears.
  const handOver = a.getByRole('button', { name: 'Hand over' });
  await expect
    .poll(
      async () => {
        await refetchLock(a);
        return handOver.count();
      },
      { timeout: 60_000, intervals: [500, 1000, 2000] },
    )
    .toBeGreaterThan(0);
  await expect(handOver).toBeVisible();

  // Select the activity, so the dock's object-action bar occupies the row alongside the facts.
  //
  // Through the canvas's parallel listbox (ADR-0026 D7) rather than by clicking the bar: the canvas
  // is `aria-hidden`, so a click on it leaves focus on `<body>`, and the listbox is the surface
  // that actually reports a selection.
  await diagramList(a).focus();
  await a.keyboard.press('ArrowDown');
  // Asserted, not assumed. A measurement taken without the selection would report the resting row
  // under this test's name — the ADR-0093 shape, a reading about a population it never reached.
  await expect.poll(async () => selectedActivityId(a)).not.toBeNull();

  const readings: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await a.setViewportSize({ width, height: 900 });
    // One frame for the wrap to settle before anything is measured.
    await a.waitForTimeout(250);
    readings[`w${String(width)}_request_outstanding`] = await readFootRow(a);
  }

  // --- C3's control: the same page with no hand-off outstanding --------------------------------
  // **`Keep editing`, not `Dismiss`** — read off `tsld-toolbar-items.tsx:2136`, which names the
  // pair as `Hand over` and `Keep editing`. The first version of this spec guessed `Dismiss` and
  // timed out after every reading had already been taken.
  await a.getByRole('button', { name: 'Keep editing' }).click();
  await expect(a.getByRole('button', { name: 'Hand over' })).toHaveCount(0);
  for (const width of WIDTHS) {
    await a.setViewportSize({ width, height: 900 });
    await a.waitForTimeout(250);
    readings[`w${String(width)}_no_request`] = await readFootRow(a);
  }

  writeMeasurement('techdebt-287-pen-foot-row', readings);

  await ctxA.close();
  await ctxB.close();
});
