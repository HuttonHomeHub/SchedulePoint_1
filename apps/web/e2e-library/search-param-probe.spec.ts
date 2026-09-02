import { expect, test, type Page } from '@playwright/test';

import { onboard } from './support';

/** Create an organisation-library calendar from the Calendars screen. */
async function createCalendar(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New calendar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create calendar' }).click();
  await expect(dialog).toBeHidden();
}

/** The organisation nav's link, scoped so it does not also match the breadcrumb. */
function navLink(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page.getByLabel('Organisation', { exact: true }).getByRole('link', { name, exact: true });
}

/**
 * **The `docs/TECH_DEBT.md` #96 M0 probe: what the address bar actually holds.**
 *
 * The register row says the router JSON-parses every search value, so a numeric term round-trips
 * re-quoted — a URL a planner copies and sends is not the one they can read. This settles it by
 * reading the **raw** query string in a real browser, because `searchParams.get(...)` decodes and
 * decoding hides the quoting, which is the whole subject.
 *
 * **Its verdict rule was committed first, on its own**
 * (`docs/specs/router-search-params/m0-measurement.md`): no `%22` ⇒ the symptom is withdrawn and
 * the epic re-scoped. A measurement whose rule is written afterwards is read as whatever result
 * arrives, which this register records twice.
 *
 * **It is a test of its own, and that is a finding rather than tidiness.** Written inline inside
 * the shipped `e2e-library` journey it BROKE that journey — a later assertion went from one match
 * to a strict-mode violation on two — established by running the suite stashed and unstashed back
 * to back. A probe that perturbs the journey it borrows is measuring a state the product does not
 * otherwise reach.
 */
test('#96 — a numeric search term is carried as typed (was: re-quoted)', async ({ page }) => {
  await onboard(page, Date.now());
  await navLink(page, 'Calendars').click();
  const search = page.getByLabel('Search calendars');
  await expect(search).toBeVisible();

  await search.fill('2026');
  await expect.poll(() => new URL(page.url()).search, { timeout: 10_000 }).toMatch(/[?&]q=/);

  const raw = new URL(page.url()).search;
  // eslint-disable-next-line no-console -- the probe's output IS the measurement (#96 M0-T2)
  console.log(`[#96 M0 probe] calendars search raw query: ${raw}`);

  // **Re-baselined at M4, and this is the whole point of having pinned it.** M0 measured
  // `?q=%222026%22` — four characters typed, six carried — and this line asserted exactly that, so
  // the codec flip could not land without coming here and saying it had changed the URL. It did,
  // and the sweep reported it with the message written for the occasion. The old value stays in the
  // comment because a re-baseline audited line by line is worth more than a clean file (ADR-0106).
  expect(raw, 'the URL no longer carries the term as typed — #96 M4 regressed').toBe('?q=2026');
});

/**
 * **#96 M1's acceptance case: a hand-typed numeric search term reaches the search box.**
 *
 * This is the milestone's entry point (ADR-0081), and the only place it can be checked. `?q=2026`
 * decodes to the NUMBER `2026`, so before M1 `pickText`'s `typeof value === 'string'` test threw it
 * away: the planner got an unfiltered table with an empty search box, and nothing said why. Every
 * unit test of that reader hands it a literal and never crosses the parser — the same blind spot
 * that let `?verified=1` ship broken with a green suite (ADR-0074 M5).
 *
 * **Both halves are asserted, and that is the plan's stated risk.** Asserting only the table would
 * pass against a screen that filtered correctly while showing an empty field, which is a worse bug
 * than the one being fixed — the planner cannot tell what they are looking at. Asserting only the
 * field would pass against a field that echoed the URL and filtered nothing.
 *
 * **The negative control is not decoration.** Without it a green run cannot distinguish "the filter
 * works" from "the filter is ignored and everything shows", because the positive case's expected
 * row is present either way.
 */
test('#96 M1 — a numeric term typed into the URL filters the library and fills the field', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await navLink(page, 'Calendars').click();
  await expect(page.getByRole('button', { name: 'New calendar' })).toBeVisible();

  await createCalendar(page, '2026 shutdown');
  await createCalendar(page, 'Night shift');
  await expect(page.getByRole('cell', { name: '2026 shutdown', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Night shift', exact: true })).toBeVisible();

  // Arrive by URL, the way a colleague receiving a pasted link does — never by typing, which would
  // put a string into the field without the router ever parsing one.
  const url = new URL(page.url());
  await page.goto(`${url.pathname}?q=2026`);

  await expect(page.getByLabel('Search calendars')).toHaveValue('2026');
  await expect(page.getByRole('cell', { name: '2026 shutdown', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Night shift', exact: true })).toHaveCount(0);

  // The negative control: a term matching nothing reaches the filter too, and says so.
  await page.goto(`${url.pathname}?q=notacalendar`);
  await expect(page.getByLabel('Search calendars')).toHaveValue('notacalendar');
  await expect(page.getByText('No calendars match these filters.')).toBeVisible();
});
