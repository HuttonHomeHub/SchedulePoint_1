import { execFileSync } from 'node:child_process';

import { expect, type Locator, type Page } from '@playwright/test';

import { planCommands, recalculate } from '../e2e-support/toolbar';

/**
 * Journey helpers for the **swimlanes by hand** suite (`docs/specs/swimlanes/`, M2-T11).
 *
 * The actor is the organisation's Org Admin, who satisfies everything here. The plan under test is
 * the catalogue's `plan:capability-swimlanes` (`docs/TEST_PLAYBOOK.md`), created through the public
 * REST API by `schedulepoint-seed` once the actor exists — drawing seven bars and three swimlanes by
 * hand would measure the canvas, and a failure there says nothing about swimlanes.
 */

/** The seeded plan's activities, in the plan's order, and the swimlane each starts in. */
export const ACTIVITIES = [
  { name: 'Pile caps', swimlane: /^Substructure/ },
  { name: 'Ground-bearing slab pour', swimlane: /^Substructure/ },
  { name: 'First-fix containment', swimlane: /^Électricité/ },
  { name: 'Distribution boards', swimlane: /^Électricité/ },
  { name: 'Riser brackets', swimlane: /^Mechanical, plumbing/ },
  { name: 'Pipework first fix', swimlane: /^Mechanical, plumbing/ },
  { name: 'Site welfare cabins, in no swimlane', swimlane: null },
] as const;

/** The seeded swimlane names, in order (the playbook's row 96). */
export const SWIMLANE_NAMES = [
  'Substructure, piling and ground-bearing slab up to the podium level',
  'Électricité courants forts et faibles, including temporary builder’s power',
  'Mechanical, plumbing and fire-protection services across every floor',
] as const;

/** Sign up and create an organisation; returns its slug ("Swimlanes Co 1" → "swimlanes-co-1"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `swimlanes-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Swimlanes Tester');
  await page.getByLabel('Email').fill(`swimlanes-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Swimlanes Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client and a project, stopping on the project page where the plans are listed. */
async function openProject(page: Page): Promise<void> {
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
 * Sign up and open a plan whose swimlane source is **NONE** (the default for a new plan), with two
 * dated activities so there is a diagram for the lens to be about. Made through the public API, like
 * the seeded plan: drawing the bars by hand would measure the canvas, not the setup.
 *
 * Returns the organisation slug. The pen is NOT taken.
 */
export async function openPlainPlan(page: Page, stamp: number): Promise<string> {
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  const projectId = /projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!projectId) throw new Error(`no project id in ${page.url()}`);
  await page.evaluate(
    async ({ org, project }: { org: string; project: string }) => {
      const call = async (path: string, body?: unknown): Promise<{ id: string }> => {
        const response = await fetch(`/api/v1/organizations/${org}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) {
          throw new Error(`POST ${path} ${String(response.status)}: ${await response.text()}`);
        }
        return ((await response.json()) as { data: { id: string } }).data;
      };
      const plan = await call(`/projects/${project}/plans`, {
        name: 'A plan with no swimlanes',
        plannedStart: '2026-01-05',
      });
      await call(`/plans/${plan.id}/activities`, { name: 'Dig footings', durationDays: 10 });
      await call(`/plans/${plan.id}/activities`, { name: 'Pour slab', durationDays: 5 });
      await call(`/plans/${plan.id}/schedule/recalculate`);
    },
    { org: orgSlug, project: projectId },
  );
  await page.reload();
  await page.getByRole('link', { name: 'A plan with no swimlanes' }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await expect(diagramList(page).getByRole('option')).toHaveCount(2, { timeout: 30_000 });
  return orgSlug;
}

/** The open plan's id, read from the route — never "the first plan the list endpoint returns". */
export function openPlanId(page: Page): string {
  const match = /\/plans\/([0-9a-f-]{36})/.exec(page.url());
  if (!match?.[1]) throw new Error(`no plan id in ${page.url()}`);
  return match[1];
}

/** The diagram's parallel listbox: the product's own account of what is on the canvas (ADR-0026). */
export function diagramList(page: Page): Locator {
  return page.getByRole('listbox', { name: 'Activities in the diagram' });
}

/** The gutter's labels, as one roving vertical toolbar. */
export function gutterLabels(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Swimlanes' });
}

/**
 * Sign up, seed `plan:capability-swimlanes` into a fresh project through the public API, open it and
 * wait for the diagram. The pen is NOT taken: a case that writes calls {@link ensurePen}.
 *
 * Returns the organisation slug, which the API probes below need.
 */
export async function openSeededPlan(page: Page, stamp: number): Promise<string> {
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  const projectId = /projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!projectId) throw new Error(`no project id in ${page.url()}`);
  // `--family swimlanes` seeds both swimlane plans (by hand, and from the WBS); this suite opens the
  // first. The seeder signs in as the actor just created, so it is an ordinary client of the API.
  execFileSync(
    'pnpm',
    [
      '--filter',
      '@repo/seed-cli',
      'seed',
      '--url',
      'http://localhost:3000',
      '--org',
      orgSlug,
      '--project',
      projectId,
      '--email',
      `swimlanes-${stamp}@example.com`,
      '--password',
      'correct-horse-battery',
      '--tier',
      'capability',
      '--family',
      'swimlanes',
    ],
    { stdio: 'inherit', cwd: '../..' },
  );
  await page.reload();
  await page.getByRole('link', { name: /three long-named bands made by hand/ }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await expect(diagramList(page).getByRole('option')).toHaveCount(ACTIVITIES.length, {
    timeout: 30_000,
  });
  // The gutter is drawn once the swimlane list has arrived; the plan's source is MANUAL, so the lens
  // is on by default.
  await expect(page.getByTestId('tsld-swimlane-gutter')).toBeVisible({ timeout: 15_000 });
  return orgSlug;
}

/** Hold the pen, whether or not this session already does (ADR-0028). Idempotent. */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  const start = page.getByRole('button', { name: 'Start editing' });
  // Wait for the pen control to render before deciding: `isVisible()` answers at once.
  await expect(start.or(stop).first()).toBeVisible({ timeout: 15_000 });
  if (await stop.isVisible()) return;
  await start.click();
  await expect(stop).toBeVisible();
}

/**
 * Take the pen and calculate the plan. The catalogue plan arrives "Not yet calculated", so no bar has
 * dates and nothing is drawn: Move to swimlane… would refuse every activity as not drawn yet. A case
 * that needs drawn bars calls this once, after {@link openSeededPlan}. (Recalculate is pen-gated, so
 * this cannot run through the API without the lock.)
 */
export async function calculateSeededPlan(page: Page): Promise<void> {
  await ensurePen(page);
  await recalculate(page);
}

/** One activity as the API stores it. */
export interface StoredActivity {
  name: string;
  laneIndex: number;
  swimlaneId: string | null;
}

/**
 * The plan's activities by name, straight from the API.
 *
 * The listbox is the product's account of what is drawn; this is what reached the database. A lens
 * round trip that "looks right" can still have rewritten a stored lane, which is the claim (SC-1).
 * One page of 100 is enough for this suite's seven activities, and the helper refuses to undercount
 * rather than paging silently.
 */
export async function storedActivities(
  page: Page,
  orgSlug: string,
): Promise<Record<string, StoredActivity>> {
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
        data: { name: string; laneIndex: number; swimlaneId?: string | null }[];
        meta?: { nextCursor?: string | null };
      };
      if (body.meta?.nextCursor) {
        throw new Error('the plan has more than one page — this probe would undercount');
      }
      return Object.fromEntries(
        body.data.map((a) => [
          a.name,
          { name: a.name, laneIndex: a.laneIndex, swimlaneId: a.swimlaneId ?? null },
        ]),
      );
    },
    { org: orgSlug, id: planId },
  );
}

/** Add `count` swimlanes to the open plan through the API (the pen must be held). */
export async function seedSwimlanes(page: Page, orgSlug: string, count: number): Promise<void> {
  const planId = openPlanId(page);
  const bad = await page.evaluate(
    async ({ org, id, n }: { org: string; id: string; n: number }) => {
      const failures: string[] = [];
      for (let i = 1; i <= n; i += 1) {
        const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/swimlanes`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Filler swimlane ${String(i).padStart(2, '0')}` }),
        });
        if (!response.ok) failures.push(`${String(response.status)} ${await response.text()}`);
      }
      return failures;
    },
    { org: orgSlug, id: planId, n: count },
  );
  if (bad.length > 0) throw new Error(`seeding swimlanes was rejected: ${bad.join('; ')}`);
}

/** The `View ▾` trigger on the command deck. */
export function viewTrigger(page: Page): Locator {
  return planCommands(page).locator('[data-toolbar-item="view"]');
}

/**
 * Open `View ▾` and expand **Structure** only (the folded sections stay folded, as the floor
 * measurement needs). Returns the panel.
 */
export async function openStructure(page: Page): Promise<Locator> {
  await viewTrigger(page).click();
  const panel = page.getByRole('dialog', { name: /^View/ });
  await expect(panel).toBeVisible();
  const structure = panel.getByRole('button', { name: /^Structure/ });
  if ((await structure.getAttribute('aria-expanded')) !== 'true') await structure.click();
  await expect(structure).toHaveAttribute('aria-expanded', 'true');
  return panel;
}

/** The lens checkbox inside an open `View ▾` panel. */
export function lensCheckbox(panel: Locator): Locator {
  return panel.getByRole('checkbox', { name: 'Swimlanes', exact: true });
}

/** The lens's command beneath it: "Set up swimlanes…" with none, "Swimlanes…" once there are some. */
export function manageButton(panel: Locator): Locator {
  return panel.getByRole('button', { name: /^(Set up swimlanes|Swimlanes)…$/ });
}

/** Open the **Swimlanes** dialog the way a planner does: `View ▾ ▸ Structure ▸ Swimlanes…`. */
export async function openManageFromView(page: Page): Promise<Locator> {
  const panel = await openStructure(page);
  await manageButton(panel).click();
  const dialog = page.getByRole('dialog', { name: 'Swimlanes', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Turn the lens on or off through `View ▾`, and close the panel again. */
export async function setLens(page: Page, on: boolean): Promise<void> {
  const panel = await openStructure(page);
  const box = lensCheckbox(panel);
  if (on) await box.check();
  else await box.uncheck();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}

/** A listbox option's whole sentence, found by the activity's name. */
export function option(page: Page, name: string): Locator {
  return diagramList(page).getByRole('option').filter({ hasText: name });
}

/** Every option's sentence, keyed by the activity's name. */
export async function optionSentences(page: Page): Promise<Map<string, string>> {
  const texts = await diagramList(page).getByRole('option').allTextContents();
  const out = new Map<string, string>();
  for (const { name } of ACTIVITIES) {
    const text = texts.find((t) => t.startsWith(name));
    if (text === undefined)
      throw new Error(`no option starts with "${name}": ${texts.join(' | ')}`);
    out.set(name, text);
  }
  return out;
}

/** The lane a sentence states with swimlanes OFF: `…, lane 3, …` (1-based). */
export function plainLane(sentence: string): number {
  const match = /, lane (\d+)(?=,|$)/.exec(sentence);
  if (!match?.[1]) throw new Error(`no plain lane clause in: ${sentence}`);
  return Number(match[1]);
}

/** The place a sentence states with swimlanes ON: `…, in Mechanical, lane 2 of 3, …`. */
export function swimlanePlace(sentence: string): string {
  const match = /, in (.+?), lane (\d+) of (\d+)(?=,|$)/.exec(sentence);
  if (!match) throw new Error(`no swimlane clause in: ${sentence}`);
  return `${match[1]!}|${match[2]!}|${match[3]!}`;
}

/**
 * Move the listbox cursor to the option for `name`, from the top, by arrow keys alone.
 * Focus must already be in the listbox.
 */
export async function cursorTo(page: Page, name: string): Promise<void> {
  const list = diagramList(page);
  await list.press('Home');
  for (let step = 0; step <= ACTIVITIES.length; step += 1) {
    const id = await list.getAttribute('aria-activedescendant');
    const text = id === null ? '' : ((await page.locator(`[id="${id}"]`).textContent()) ?? '');
    if (text.startsWith(name)) return;
    await list.press('ArrowDown');
  }
  throw new Error(`the listbox cursor never reached "${name}"`);
}

/**
 * Select the activity named `first` and the option after it, with the listbox's own keys: an arrow
 * selects the row it lands on, and Shift+ArrowDown extends by one (the multi-select journey's
 * contract). The pair is adjacent in the seed's order, so the second is named by the caller.
 */
export async function selectPair(page: Page, first: string, second: string): Promise<void> {
  const list = diagramList(page);
  await list.focus();
  await list.press('Escape');
  await cursorTo(page, first);
  await list.press('Shift+ArrowDown');
  await expect(page.getByTestId('bulk-selection-bar')).toContainText(/2 activities selected/);
  await expect(list.getByRole('option', { selected: true })).toHaveCount(2);
  for (const name of [first, second]) {
    await expect(option(page, name)).toHaveAttribute('aria-selected', 'true');
  }
}

/**
 * Assert `locator` is `document.activeElement`, and when it is not say what is. `toBeFocused` retries
 * until its timeout, so the description is taken after the wait — the moment the answer is final.
 */
export async function expectFocused(page: Page, locator: Locator): Promise<void> {
  try {
    await expect(locator).toBeFocused();
  } catch (error) {
    throw new Error(`${(error as Error).message}\nfocus is on: ${await describeFocus(page)}`);
  }
}

/**
 * Assert focus is on something in the product and not on `<body>`, after the last named swimlane has
 * been deleted: the gutter may stay (with "No swimlane") or unmount with the last one, so the product
 * lands on a gutter stop, the View ▾ trigger or the diagram's listbox, in that order of preference
 * (`focus-after-delete.ts`).
 */
export async function expectFocusKept(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.activeElement;
          return (
            el !== null &&
            el !== document.body &&
            el.matches(
              [
                '[data-testid="tsld-swimlane-gutter-labels"] [data-swimlane]',
                '[data-testid="tsld-swimlane-gutter-labels"]',
                '[data-testid="tsld-swimlane-gutter-corner"] button',
                '[data-toolbar-item="view"]',
                '[role="listbox"][aria-label="Activities in the diagram"]',
              ].join(','),
            )
          );
        }),
      { message: 'focus is on a gutter stop, View ▾ or the listbox, never <body>' },
    )
    .toBe(true);
}

/** A short description of the focused element, for failure messages. */
export async function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'nothing';
    const label = el.getAttribute('aria-label') ?? el.textContent ?? '';
    return `${el.tagName.toLowerCase()} "${label.trim().slice(0, 60)}"`;
  });
}
