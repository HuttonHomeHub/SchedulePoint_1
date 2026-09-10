import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { firstUrlIn, SmtpSink } from '../e2e-account/smtp-sink';

/**
 * The **staff console** journey (ADR-0086, staff-console M3).
 *
 * It lands with M3 rather than at enablement because M3 is the first milestone with a user-facing
 * entry point (ADR-0081 §2) — and this epic has already paid for that rule once: M2 passed 1,589
 * unit tests and could not serve a single request, because every one of them mocks Prisma and the
 * database's own fail-closed CHECK rejected the row the route writes.
 *
 * Four things are only testable here:
 *
 * 1. **A non-staff member sees "Not found", not "access denied".** The API answers every non-staff
 *    caller with the 404 it gives an unmapped route; the screen must say the same, or it confirms
 *    the surface exists and is worth attacking. A mocked fetch cannot be wrong about which status
 *    the real guard chose.
 * 2. **The allowlist's case/whitespace asymmetry works end to end.** The config pins
 *    `' Ops@SchedulePoint.test '`; the account signs up lower-case. Entries are trimmed at parse
 *    time, the session value is lowercased and never trimmed. A unit test asserts each half against
 *    a mock; only this asserts the two meet.
 * 3. **`emailVerified` is genuinely required.** The address is verified by following a real emailed
 *    link — which is also the only honest way to reach the staff path at all, since the guard
 *    demands verification independently of `AUTH_REQUIRE_EMAIL_VERIFICATION` (off here).
 * 4. **A staff account with no organisation is not bounced to `/onboarding`.** `/staff` sits
 *    outside `_authed` for exactly this reason: the shell's home resolver invites a memberless
 *    account to create an organisation, and a dedicated staff account — which `DEPLOYMENT.md`
 *    recommends — is precisely that account. Nothing but a real router run proves it.
 *
 * Chromium only (TECH_DEBT #25a), serial.
 */

/**
 * A stored sitting's table, located by the ACT it names.
 *
 * The history stopped being one flat table at M6-T1: it is now one block per sitting, and each
 * block's caption names what the operator did — `Sweep of 6 readings — …` or `One reading — …` —
 * because that is the distinction `sweep_id` exists to record. The old caption ("Readings recorded
 * on this installation") survives on exactly one path, the loading/error/empty projection, so a
 * journey that went on asking for it would find the table only when there was nothing in it.
 *
 * That is what happened: both tests in this file failed on the first run after M6-T3, having passed
 * every unit suite throughout. Located by role and name rather than by a `data-` hook deliberately
 * — the caption IS the accessible name of the region a screen-reader user navigates to, so asking
 * for it is asking the same question they do.
 */
const SITTING_TABLE = /^(Sweep of \d+ readings?|One reading) — /;

const PASSWORD = 'correct-horse-battery';
/** Must equal the config's `STAFF_EMAILS` entry, modulo case and padding — that is the point. */
const STAFF_EMAIL = 'ops@schedulepoint.test';
/**
 * Allowlisted and **never verified**, on purpose.
 *
 * The squatting control — "allowlisted is not enough, the address must be verified" — is the single
 * most important assertion here, and it is not stable on the primary account: the e2e database
 * persists, so from the second run onwards that account is already verified and the branch cannot
 * be reached again. A dedicated address that nothing ever verifies proves it on every run.
 */
const UNVERIFIED_STAFF_EMAIL = 'unverified@schedulepoint.test';

let sink: SmtpSink;

test.beforeAll(async () => {
  sink = new SmtpSink();
  await sink.start(Number(process.env.E2E_SMTP_PORT ?? 3026));
});

test.afterAll(async () => {
  await sink.stop();
});

/**
 * Sign up, or sign in when the address already exists.
 *
 * `STAFF_EMAIL` is **fixed** — it has to match the server's allowlist — while the e2e database
 * persists between runs, so a plain sign-up passes once and fails every time after. Branching on
 * what the screen actually shows keeps the suite re-runnable without a database reset, which is the
 * difference between a gate people run locally and one they only see in CI.
 */
async function signUpOrIn(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create an account/i }).click();

  // Either we are in (onboarding, or straight to an org), or the address was taken.
  const taken = page.getByText(/already|exists|in use/i).first();
  if (await taken.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForLoadState('networkidle');
}

test('a staff member reaches the console; a member cannot tell it exists', async ({ browser }) => {
  const stamp = Date.now();
  const memberEmail = `staff-outsider-${stamp}@example.com`;

  // ---------------------------------------------------------------- An ordinary member
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUpOrIn(member, memberEmail, 'Ordinary Member');
  // **Assert the session exists before relying on it.** This journey's docblock claims §1 proves
  // "a non-staff MEMBER sees Not found" — but "Not found" is also exactly what an unauthenticated
  // visitor sees, so that assertion has never distinguished the two and would have passed on a
  // sign-up that silently failed. Stated positively here, once, so the rest of this block means
  // what it says.
  await expect(member).not.toHaveURL(/\/sign-(in|up)/);

  await member.goto('/staff');
  // The whole surface argument, driven against the real guard: "Not found", never "access denied",
  // never a sign-in bounce that implies signing in as somebody else would help.
  await expect(member.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(member.getByText(/denied|permission|not authorised|staff/i)).toHaveCount(0);

  // ...and the account menu offers them nothing either. Absent, never shaded: a disabled "Staff
  // console" would tell this reader the surface exists and that they are not allowed near it,
  // which is exactly the oracle the uniform 404 above refuses to be.
  await member.goto('/');
  await member.getByRole('button', { name: /account/i }).click();
  await expect(member.getByRole('menu')).toBeVisible();
  await expect(member.getByRole('menuitem', { name: /staff console/i })).toHaveCount(0);

  // **And now the thing the denial row exists to record: somebody who knows a PANEL url.**
  // Nothing the app does on this reader's behalf produces one — their `/staff` visit and their
  // account menu both ask only the identity probe, which is deliberately unaudited — so a denial
  // has to be provoked the way a real one arrives, by asking for a panel directly. This request
  // carries the member's own session cookies, which is what makes it attributable.
  const probe = await member.request.get('/api/v1/staff/health');
  expect(probe.status(), 'a panel route refuses a member with the same 404').toBe(404);
  await memberContext.close();

  // -------------------------------------------------- Allowlisted, but unverified: still refused
  // The squatting control. `AUTH_REQUIRE_EMAIL_VERIFICATION` is OFF in this config — exactly the
  // configuration in which an allowlisted address that nobody has proved ownership of would
  // otherwise become staff — and the refusal is byte-identical to a stranger's.
  const squatterContext = await browser.newContext();
  const squatter = await squatterContext.newPage();
  await signUpOrIn(squatter, UNVERIFIED_STAFF_EMAIL, 'Unverified Ops');
  await squatter.goto('/staff');
  await expect(squatter.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await squatterContext.close();

  // ---------------------------------------------------------------- The staff member
  // **`clipboard-write` is granted explicitly, and CI is why.** `navigator.clipboard.writeText`
  // needs the permission; without it the promise REJECTS, the Copy handler takes its failure branch
  // and no "Copied." is ever announced. That passed locally and failed on the runner — a divergence
  // that says nothing about the product and everything about the harness, which is the class of
  // false signal this suite exists to avoid producing.
  const staffContext = await browser.newContext({ permissions: ['clipboard-write'] });
  const staff = await staffContext.newPage();
  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');

  // Verify the address if this run created the account. On a re-run it is already verified, and
  // no mail is sent — so waiting for one unconditionally would fail on every run after the first.
  // The unverified branch is proved above on a dedicated account rather than here, which is what
  // makes both halves stable.
  await staff.goto('/staff');
  // Wait for EITHER outcome before branching, with a generous budget. A bare `isVisible({timeout})`
  // probe raced Vite's first compile of this lazily-loaded route on a cold dev server and reported
  // "not the console" for a page that had not finished rendering anything at all — which then sent
  // the run down the verification branch and failed waiting for mail nobody was going to send.
  // Asserting that one of the two headings is present first makes the branch a real observation.
  await expect(staff.getByRole('heading', { name: /^(Staff console|Not found)$/ })).toBeVisible({
    timeout: 30_000,
  });
  const alreadyIn = await staff
    .getByRole('heading', { name: 'Staff console' })
    .isVisible()
    .catch(() => false);

  if (!alreadyIn) {
    await staff.goto('/account');
    const resend = staff.getByRole('button', { name: /resend|send.*verification/i }).first();
    if (await resend.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resend.click();
    }
    const mail = await sink.waitFor(STAFF_EMAIL, /verify-email/);
    const verifyUrl = firstUrlIn(mail.body);
    expect(verifyUrl, 'a verification link must have been sent').toBeTruthy();
    await staff.goto(verifyUrl);
    await staff.waitForLoadState('networkidle');

    // **Sign in again, because verifying does not leave you signed in.** Observed, not assumed: the
    // account was `email_verified = t` in the database and `/staff` still answered "Not found",
    // which is what an unauthenticated request looks like through this screen. It is also the
    // realistic path — a verification link is usually opened from a mail client, not the tab that
    // asked for it.
    await staff.goto('/sign-in');
    await staff.getByLabel('Email').fill(STAFF_EMAIL);
    await staff.getByLabel('Password').fill(PASSWORD);
    await staff.getByRole('button', { name: /sign in/i }).click();
    await staff.waitForLoadState('networkidle');
  }

  // **Sign in again, because verifying does not leave you signed in.** Following the link lands on
  // a fresh navigation whose session does not survive into the console — observed, not assumed: the
  // account is `email_verified = t` in the database at this point and `/staff` still answered "Not
  // found", which is what an unauthenticated request looks like through this screen. It is also the
  // realistic path, since a verification link is usually opened from a mail client rather than the
  // tab that asked for it.
  await staff.goto('/sign-in');
  await staff.getByLabel('Email').fill(STAFF_EMAIL);
  await staff.getByLabel('Password').fill(PASSWORD);
  await staff.getByRole('button', { name: /sign in/i }).click();
  await staff.waitForLoadState('networkidle');

  // ------------------------------------------------- Reached from the account menu, not a URL
  // **This account has NO organisation**, which is the recommended configuration, so signing in
  // lands it on `/onboarding`. That screen is a child of the authenticated layout and therefore
  // carries the header — asserted here rather than assumed, because if onboarding ever moved
  // outside that layout the link would vanish for exactly the configuration the documentation
  // recommends, and nothing else would fail. The console shipped reachable only by typing
  // `/staff`, and the product owner met that: deployed, working, invisible.
  await staff.goto('/');
  await staff.getByRole('button', { name: /account/i }).click();
  await staff.getByRole('menuitem', { name: /staff console/i }).click();
  await expect(staff).toHaveURL(/\/staff$/);
  await expect(staff.getByRole('heading', { name: 'Staff console' })).toBeVisible();

  // ---------------------------------------------------------------- The console itself
  await staff.goto('/staff');
  await expect(staff.getByRole('heading', { name: 'Staff console' })).toBeVisible();
  // The address that matched, rendered NORMALISED — the config pinned ' Ops@SchedulePoint.test '
  // with padding and mixed case, so seeing the lower-case form proves both halves of the asymmetry.
  // Scoped to the header sentence. A bare `getByText(STAFF_EMAIL)` matched two places once the M5
  // Staff activity panel landed — the greeting and the actor column of the console's own audit
  // trail — and Playwright's strict mode failed it. Which is the panel working: the console records
  // that staff read it, and the reader's own address is what it records.
  await expect(staff.getByText(`Signed in as ${STAFF_EMAIL}.`)).toBeVisible();
  await expect(staff.getByRole('heading', { name: 'Mail' })).toBeVisible();
  await expect(staff.getByRole('heading', { name: 'Content-Security-Policy' })).toBeVisible();
  // **Only that the panel renders — not which state it is in.** The empty-state caveat ("not yet
  // proof the policy is clean") is pinned by `staff.test.tsx`, where the payload is controlled.
  // Asserting it here couples this journey to whether `csp_reports` happens to be empty, and it is
  // not: the API e2e suite writes rows into the same database and this suite has no way to clear
  // them. A test that passes or fails on what an unrelated suite left behind is measuring the
  // harness. Both states are covered — this proves the panel is wired, that proves what it says.

  // ---------------------------------------------------------------- Retention (ADR-0087 M3)
  // The milestone's entry point (ADR-0081 §2), asserted against the real API rather than a fixture.
  // Two things only this can see: that the periods rendered are the ones the SERVER is configured
  // with — a component test asserts whatever number its own payload carries — and that the panel
  // is reading the same in-memory `RetentionStatusStore` the sweep writes. `OperationalModule` is
  // global and exports the store; providing a second copy inside `StaffModule` would compile,
  // inject, and report a working sweep as one that had never run, forever, with nothing failing.
  await expect(staff.getByRole('heading', { name: 'Retention' })).toBeVisible();
  // Scoped to the section, never the document — the ADR-0073 C2.5 finding, where a document-scoped
  // assertion passed on the page's prose alone and proved nothing about the table.
  const retention = staff.getByRole('region', { name: /retention by table/i });
  await expect(retention.getByText('Policy violation reports')).toBeVisible();
  await expect(retention.getByText('Mail events')).toBeVisible();
  // The third table, which the staff performance probe added. It appears here without any edit to
  // the panel — the rows are derived from the API's list — and the label falls back to the raw
  // table name if nobody supplies one, which is why the name is asserted rather than assumed.
  await expect(retention.getByText('perf_probe_results')).toBeVisible();
  // Each configured period as the API reports it, and scoped to ITS OWN ROW. Not `/\d+ days/` — a
  // regex would pass on whatever number arrived, including a default the server is not using.
  //
  // The row scope is not fastidiousness: two tables now share a 365-day period, so a
  // section-scoped `getByText('365 days')` matches twice and fails on strict mode. That is exactly
  // how this assertion broke when the third table landed — the slice that added it never ran this
  // journey, and the failure names a number rather than the table it belongs to.
  await expect(rowFor(retention, 'Policy violation reports').getByText('30 days')).toBeVisible();
  await expect(rowFor(retention, 'Mail events').getByText('365 days')).toBeVisible();
  await expect(rowFor(retention, 'perf_probe_results').getByText('365 days')).toBeVisible();
  // The sweep runs at boot (`onApplicationBootstrap`), so by the time a browser has signed up,
  // verified an address and signed in twice, this process HAS swept — which makes the "not swept
  // yet" wording the wrong assertion here and the presence of a real last-run line the right one.
  //
  // `.*` and not `.* ago`: the first version of this assertion demanded "ago" and failed against a
  // perfectly correct panel reading **"Last swept just now"**, because the API boots seconds before
  // the browser arrives and `agoLabel` says "just now" under a minute. The journey was written from
  // the shape of the copy rather than from a run — which is the failure this step exists to catch.
  await expect(staff.getByText(/Last swept .*, every \d+ minutes\./)).toBeVisible();

  // 4. NOT bounced to onboarding. This account has no organisation — which is the recommended
  // configuration — and `/staff` sits outside `_authed` precisely so the shell's home resolver
  // never sees it.
  await expect(staff).toHaveURL(/\/staff$/);
  await expect(staff.getByRole('heading', { name: /create your organisation/i })).toHaveCount(0);

  // 5. **The member's refusal, seventy lines up, left a row the console can see.** This shipped as
  // silence and the M6 security review found it; it is asserted here rather than only in the API
  // suite because it spans the whole chain — a guard writes it, the panel's repository filter has
  // to be the ACTION namespace to return it (an actor-type filter hides it, since the prober is
  // typed `USER` and not `STAFF`), and the copy has to render an action nobody has read before.
  // Nothing short of the real product exercises all three.
  await expect(staff.getByRole('heading', { name: 'Staff activity' })).toBeVisible();
  const activity = staff.getByRole('region', { name: /staff actions/i });
  // The row comes from the member's direct panel request above — NOT from their `/staff` visit or
  // their account menu, both of which ask only the unaudited identity probe. That distinction is
  // the point: this panel shows people who went looking, not everyone who opened a menu.
  await expect(activity.getByText(memberEmail).first()).toBeVisible();
  // And the row says only THAT it was refused, never WHICH of the three conditions failed — the
  // difference the uniform 404 withholds, and a screen that spelt it out would be the oracle the
  // guard is built to deny. An exact-text match is the assertion: a first draft searched the whole
  // region for reason words and failed on the squatter's own address, `unverified@…`, which is the
  // panel working correctly and the test reading it wrongly.
  await expect(activity.getByText('access denied', { exact: true }).first()).toBeVisible();

  // 6. **The performance probe runs, in a real browser, and reaches a terminal state.**
  //
  // This is `docs/specs/staff-performance-probe/` M3's journey, and it is here rather than in a
  // sibling file because the account, the verified address and the signed-in `/staff` page already
  // exist by this point — re-deriving all three to press one button would be the slower and less
  // honest test.
  //
  // **It proves the PATH and says nothing about performance, deliberately.** A CI container cannot
  // produce a quotable number — that is the epic's entire premise, and `m0-conditions.md` records
  // this container's own no-change baseline moving more than tenfold between two runs an hour
  // apart. So the assertion is that the machinery works: the chunk downloads, the canvas paints,
  // the judge is consulted, and whatever comes back is stated as the right KIND of thing.
  //
  // The Quick length is chosen for the runtime AND because a quick run is ungated by construction
  // (one repeat has no run-to-run spread, so the INDETERMINATE rule cannot fire) — which means this
  // journey can never accidentally assert a verdict a container has no business producing.
  const probePanel = staff.getByRole('heading', { name: 'Performance' });
  await expect(probePanel).toBeVisible();
  await openMeasureOne(staff);
  await staff.getByRole('combobox', { name: 'Length' }).selectOption('quick');
  // Typed BEFORE the run: the note travels with the reading rather than being editable afterwards
  // (insert-time only in v1 — an edit route needs `updated_at` and a version column).
  await staff.getByRole('textbox', { name: 'Machine (optional)' }).fill('CI container');
  await staff.getByRole('button', { name: 'Run measurement' }).click();
  // The confirmation's action button shares the opener's name on purpose, so scope to the dialog
  // rather than to the copy (ADR-0091's recorded lesson about locating by text).
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Run measurement' }).click();

  const result = staff.locator('[data-perf-probe-result]');
  await expect(result).toBeVisible({ timeout: 60_000 });

  // **Either a reading or a refusal — both are correct outcomes here**, and asserting only one
  // would make this suite depend on the runner's frame clock, which is the thing being measured.
  const resultText = (await result.textContent()) ?? '';
  expect(resultText).toMatch(
    /(The run was refused|You stopped this run|This run cannot be judged|PASS|FAIL|INDETERMINATE|REPORTED, NOT GRADED)/,
  );

  // **No verdict prints bare.** `REPORTED, NOT GRADED` is the commonest outcome here — a quick
  // check runs once, so there is no run-to-run spread to grade against — and it used to render as
  // the raw enum `REPORTED_ONLY` with nothing beside it, which a first-time reader cannot tell from
  // a failure code. This assertion caught the old wording on its first run after the M5 fix, which
  // is the sense in which it is verified: the journey went red against the pre-fix panel.
  if (resultText.includes('REPORTED, NOT GRADED')) {
    expect(resultText, 'an ungraded verdict carries its reason').toMatch(
      /no run-to-run spread|never graded/,
    );
  }

  // **A saturated delta never appears without its caveat** (`docs/TECH_DEBT.md` #260).
  //
  // Reachable here rather than decorative: the default scenario is `revision-diff`, a DIFFERENCE
  // limb, so this container's software rasteriser can genuinely pin the baseline at the ceiling —
  // the M1-T3 driver run recorded `baseline 100.00 pp` at the whole-plan framing on this same
  // hardware. It may equally not fire (that run measured 30 pp at Week), so the assertion is
  // conditional in BOTH directions and asserts the pairing rather than forcing an outcome: a
  // ceiling sentence with no figure beside it is as wrong as a figure with no sentence.
  const CEILING = /property of the ceiling/;
  if (CEILING.test(resultText)) {
    expect(resultText, 'the caveat names the figure it qualifies').toMatch(/[+-]?\d+\.\d+\s*pp/);
  }

  // And a refusal is never dressed as a verdict. This is the assertion the fourth verdict value
  // exists for, checked against the whole panel rather than the alert alone — the defect would be a
  // pass/fail word left somewhere else on the surface beside a correctly-worded refusal.
  if (resultText.includes('The run was refused')) {
    expect(resultText).not.toMatch(/\bPASS\b/);
    expect(resultText).not.toMatch(/\bFAIL\b/);
  }

  // **What was RECORDED, which is a different question from what was measured** (M4-T6).
  //
  // Branching on the outcome rather than forcing one: a container can legitimately refuse a run,
  // and the two branches assert opposite things. A refusal must store NOTHING — a stored row would
  // put a reading in the installation's history that no machine ever produced — while a measurement
  // must reach the history with the machine note and the app version that drew the frames.
  //
  // This is the only place the POST is driven against a real API with the real guard, the real
  // validation pipe and the real audit producer. A component test sees whatever its mock returns,
  // which is exactly why the DTO's bounds and the transaction cannot be proven there.
  //
  // **Which branch ran is recorded on the run**, because everything below the `else` is skipped on
  // a refusal and a skipped assertion is indistinguishable from a passing one in a green report.
  // That is the ADR-0093 shape — a suite that cannot tell "covered" from "there was nothing to
  // cover" proves neither — and it matters more from M2 on, where the branch carries the columns,
  // the Copy control and the caveat association that are this milestone's whole deliverable.
  const refused = resultText.includes('The run was refused');
  // Printed rather than annotated. An annotation was written first and is not reachable in this
  // workflow — the list reporter does not render one, so it never appeared in the terminal or in
  // `.e2e-logs`, which is an instrument reporting where nobody reads. Established by running it.
  // eslint-disable-next-line no-console
  console.log(
    refused
      ? 'PROBE OUTCOME: REFUSED — the history assertions below were NOT exercised on this run.'
      : 'PROBE OUTCOME: MEASURED — the history assertions below were exercised.',
  );

  if (refused) {
    await expect(staff.getByText('No readings recorded yet.')).toBeVisible();
    await expect(staff.getByRole('button', { name: 'Retry recording' })).toHaveCount(0);
  } else {
    await expect(staff.getByText('Recorded. It appears in the history below.')).toBeVisible({
      timeout: 15_000,
    });
    const history = staff.getByRole('table', { name: SITTING_TABLE }).first();
    // More than the header row, asserted as a shape rather than as a count: a scenario may be
    // measured at more than one scale, and each scale is its own row.
    await expect(history.getByRole('row')).not.toHaveCount(1);

    // **The three facts that decide whether a reading means anything** (M2-T1) — asserted where
    // they now LIVE rather than dropped. All three were stored on every row since this table
    // shipped and rendered on none, against an acceptance criterion the predecessor spec approved;
    // M6-T2 then moved them out of the columns and into the sitting's facts list, because a sweep
    // repeated the machine, the canvas and the display on every one of its rows. The fact being on
    // screen is the criterion; which element carries it is this milestone's business. Asserted
    // against a REAL stored row, because a component test renders whatever fixture it was handed
    // and cannot tell you the value is fed by the field the API actually returns.
    await expect(staff.getByText('CI container').first()).toBeVisible();
    // A real viewport and a real measured interval, not zeroes or blanks: the shapes are what a
    // wrong wiring would break, and a blank value is what it would look like.
    await expect(staff.getByText(/^\d+×\d+ @[\d.]+x$/).first()).toBeVisible();
    await expect(staff.getByText(/^[\d.]+ ms idle frame interval$/).first()).toBeVisible();
    await expect(
      staff.getByText(/^(held throughout|a reading lost focus — see the table)$/).first(),
    ).toBeVisible();
    // And the reading's own time, which is per row rather than per sitting since M6-T4: a resumed
    // reading is stored under the same `sweep_id` hours later, so the sitting's one timestamp is
    // true of its earliest reading and merely probable of the rest.
    await expect(history.getByRole('columnheader', { name: 'Taken' })).toBeVisible();

    // **The entry point for M2-T3** (ADR-0081). The block is the deliverable `docs/TECH_DEBT.md`
    // #75 actually consumes, and until this milestone it could only be produced in the seconds
    // after a run. Clicking it here proves the control reaches a stored reading through the real
    // formatter — the clipboard write itself is asserted in the unit suite, since a headless
    // browser's clipboard permission is a property of the harness rather than of the product.
    //
    // `Copy report` is the SITTING's control and sits beside its table rather than inside it, which
    // is M6-T3's own decision: a block for one limb of a four-reading sweep is a partial answer
    // that looks complete. The name is a full match, so it cannot resolve to the live result
    // block's `Copy full report`.
    // Matched by prefix, not by the exact label: M7 gave each sitting's Copy button an
    // `aria-label` carrying its own caption, because with N blocks on screen an assistive-technology
    // user browsing by button list met a column of identical "Copy report" entries.
    await expect(staff.getByRole('button', { name: /^Copy report/ }).first()).toBeVisible();
    await staff
      .getByRole('button', { name: /^Copy report/ })
      .first()
      .click();
    await expect(staff.getByText('Copied.').first()).toBeVisible();

    // **Everything a reader needs to judge these numbers is reachable from INSIDE the region.**
    // `DataTable` is a focusable `role="region"`, so a landmark-navigating reader lands in the table
    // having skipped whatever sits above it — the caveat that says what the Canvas figure is for,
    // and (since M7) the block's own machine facts, spread warning and partial notice. This used to
    // read one id; `aria-describedby` is a space-separated LIST and now carries several, so a
    // single-id assertion looked like a product defect and was the harness being one version behind.
    const describedBy = await staff
      .getByRole('region')
      .filter({ has: history })
      .first()
      .getAttribute('aria-describedby');
    expect(describedBy, 'the table names what describes it').not.toBeNull();
    const ids = String(describedBy).split(/\s+/).filter(Boolean);
    expect(
      ids.length,
      'the sitting describes itself as well as citing the shared caveat',
    ).toBeGreaterThan(1);

    let described = '';
    for (const id of ids) {
      const target = staff.locator(`#${id}`);
      // A dangling id is worse than a missing one: assistive technology reports a description that
      // resolves to nothing, which a reader cannot tell from a description that was never there.
      await expect(target, `#${id} resolves to an element`).toHaveCount(1);
      described += `${(await target.textContent()) ?? ''}\n`;
    }

    expect(described, 'the shared comparability caveat').toContain('per megapixel');
    // And the block's OWN facts, which differ per sitting and are what decide whether the numbers
    // in this particular table mean anything.
    expect(described, "this sitting's own machine facts").toContain('CI container');
  }

  // The overlay must be gone: it is `position: fixed; inset: 0`, so a leaked one would cover the
  // console and every later assertion — including the axe sweep below — would be about a canvas.
  await expect(staff.getByRole('button', { name: /^Stop/ })).toHaveCount(0);

  // ── M3: a limb is the unit of durability ────────────────────────────────────────────────────
  //
  // Stopping used to discard the whole press, so on the two-scale `canvas-draw` scenario a stop
  // during the second limb threw away a COMPLETE 500-activity limb — every repeat collected,
  // nothing about it wrong. Nobody reported that, which is why it is not a register row: a
  // discarded measurement leaves nothing behind to report.
  //
  // `canvas-draw` is chosen deliberately. `revision-diff` has ONE limb, so a stop can never leave
  // anything behind and a journey driving it would assert an invariant it cannot violate.
  await openMeasureOne(staff);
  await staff.getByRole('combobox', { name: 'Measurement' }).selectOption('canvas-draw');
  // **`full`, not `quick`, and that is the difference between a journey and a decoration.** At 40
  // frames a limb finishes in well under a second, so the second one was over before the click
  // landed and this whole section asserted nothing — established by running it, because the branch
  // prints which path it took. At 180 x 3 there is a real window to stop inside. The second limb is
  // never completed, so the cost is one 500-activity limb rather than a whole full measurement.
  await staff.getByRole('combobox', { name: 'Length' }).selectOption('full');
  await staff.getByRole('button', { name: 'Run measurement' }).click();
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Run measurement' }).click();

  // Wait for the SECOND limb to start, which is the only observable proof that the first finished.
  // Stopping on a timer would be a race with no evidence either way.
  //
  // `.first()` is load-bearing. The progress sentence renders TWICE — once visibly beside the Stop
  // button and once in the panel's `sr-only` live region — so an unscoped `getByText` resolves to
  // two elements and `waitFor` raises a strict-mode violation. The first version of this caught
  // that and reported it as "the second limb never started", which is a real signal turned into a
  // false one by a bare `.catch`. Found by making the diagnosis print what it saw instead of what
  // it concluded.
  let stopFailure = '';
  const stopped = await staff
    .getByText(/Drawing 2000 activities/)
    .first()
    .waitFor({ timeout: 90_000 })
    .then(async () => {
      await staff.getByRole('button', { name: /^Stop/ }).click();
      return true;
    })
    .catch((error: unknown) => {
      stopFailure = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
      return false;
    });

  await expect(staff.locator('[data-perf-probe-result]')).toBeVisible({ timeout: 60_000 });
  const afterText = (await staff.locator('[data-perf-probe-result]').textContent()) ?? '';

  // Printed, for the same reason the branch above is: a run that completed before the click landed
  // is a legitimate outcome that exercises none of M3, and a green report cannot otherwise say so.
  // eslint-disable-next-line no-console
  console.log(
    `M3 DIAGNOSIS: secondLimbSeen=${String(stopped)} resultSaysStopped=${String(
      afterText.includes('You stopped this run'),
    )}${stopFailure === '' ? '' : ` reason="${stopFailure}"`}`,
  );

  if (afterText.includes('You stopped this run')) {
    // **The whole point.** A stop after the first limb keeps that limb, so the sentence names what
    // survived and the history grows. "Nothing was measured" here would be the pre-M3 behaviour.
    expect(afterText).toMatch(/had already finished and (was|were) kept/);

    // **What reached the database, asserted as the SHAPE of the newest sitting rather than as a
    // total that grew.** This used to count every row in the history before and after and require
    // the number to rise — and `staff-probe.service.ts:14` caps the read at 50 rows, so on any
    // installation that has taken fifty readings the total is invariant: a new reading displaces
    // the oldest and the count cannot move. It passed for months because a fresh local database
    // has fewer, and it failed here at 75 rows with the product behaving perfectly. A gate that
    // stops being able to report is exactly what this epic is about, one tier out.
    //
    // The replacement is sharper as well as sound. M3's claim is not "the history grew" but "the
    // completed limb survived and the interrupted one did not", so the newest sitting is a single
    // press holding EXACTLY ONE reading — the 500-activity limb — beside a header row. The suite
    // runs `workers: 1, fullyParallel: false`, so the newest sitting is this press.
    //
    // Polled rather than counted once: "Recorded." means the POST resolved, not that the history
    // query has refetched and re-rendered, and reading in that gap is a race that once failed this
    // on one run in four.
    await expect
      .poll(
        async () =>
          staff.getByRole('table', { name: SITTING_TABLE }).first().getByRole('row').count(),
        {
          message: 'a stopped press still stored its completed limb as a sitting of one',
          timeout: 15_000,
        },
      )
      .toBe(2);
    await expect(
      staff.getByRole('table', { name: /^One reading — / }).first(),
      'a single press is a single press, not a sweep permanently missing three readings',
    ).toBeVisible();
  }

  await expect(staff.getByRole('button', { name: /^Stop/ })).toHaveCount(0);

  // The console is a real screen and gets the same accessibility bar as every other one.
  const results = await new AxeBuilder({ page: staff })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await staffContext.close();
});

/**
 * **The sweep, driven end to end — M5-T5, and it lands WITH the milestone that adds the control.**
 *
 * ADR-0081's rule: a milestone claiming user-facing capability names its entry point and its journey
 * lands with it, not at enablement. This register records five capabilities that shipped with unit
 * tests and no door, and the most recent found its own drawer unreachable in the default path while
 * every unit test stayed green — because those tests mount the component and the defect was in the
 * seam between the component and the shell.
 *
 * **A second `test()` rather than an extension of the first**, and the reason is measured rather
 * than assumed: `playwright.staff.config.ts:30` sets `timeout: 120_000` PER TEST, and the first
 * test already spends most of a minute. Adding a sweep to it would leave the sweep racing the
 * budget rather than the product.
 *
 * **It presses "Check the probe works", not "Run all measurements"**, for the same measured reason:
 * `sweep-duration.ts` puts a full sweep at ~126 s, which does not fit a 120 s per-test timeout at
 * all. The short sweep exercises every seam that matters here — the plan, the loop, the per-step
 * POST, the sitting id — and differs only in frame count.
 */
test('a staff member takes every reading in one press', async ({ browser }) => {
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();

  /**
   * **Why a step was not recorded, rather than how many were not.**
   *
   * The panel tells an operator "measured but NOT recorded" and offers Retry, which is the right
   * copy for them and useless for diagnosis: the first run of this test reported two of four steps
   * unrecorded and there was nothing on the page, in the log, or in the API's piped output saying
   * whether that was a 429, a 422 or a dropped socket. A count is not a cause — the register's own
   * complaint about coarse instruments, met here by reading the responses the browser already has.
   */
  const storeFailures: number[] = [];
  const storeFailureBodies: string[] = [];
  staff.on('response', (response) => {
    if (
      response.request().method() !== 'POST' ||
      !response.url().includes('/staff/probe-results') ||
      response.ok()
    ) {
      return;
    }
    // The status is recorded **synchronously**, the body when it arrives. The assertion below reads
    // the status list, so it can never race a `text()` promise that has not settled; the body is
    // for the reader and is allowed to be late.
    const status = response.status();
    storeFailures.push(status);
    void response
      .text()
      .then((body) => storeFailureBodies.push(`${String(status)} ${body.slice(0, 300)}`))
      .catch(() => storeFailureBodies.push(`${String(status)} (body unavailable)`));
  });

  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');
  await staff.goto('/staff');

  // The console, or nothing to test. The verification branch is proved by the first test; this one
  // asserts it is already in rather than repeating that machinery, and says so if it is not.
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });

  // **The entry point named in the spec, pressed.** If this locator ever stops matching, the
  // capability has no door — which is the defect this test exists to prevent rather than to
  // describe.
  await staff.getByRole('button', { name: 'Check the probe works' }).click();

  const dialog = staff.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  // Its own duration, derived — not the constant every confirmation used to quote.
  await expect(dialog).toContainText(/This takes/);
  // And the promise that it produces no verdicts, because every reading runs once.
  await expect(dialog).toContainText(/none of them\s+can be graded|cannot be graded|can be graded/);
  await dialog.getByRole('button', { name: 'Check the probe' }).click();

  // A sweep is four steps, and a container drops frames badly, so the budget is generous and the
  // assertion is about the KIND of outcome rather than a number — the shape the existing probe
  // assertion already uses, which accepts a refusal as a correct answer.
  const result = staff.locator('[data-perf-probe-result]');
  await expect(result).toBeVisible({ timeout: 90_000 });

  const text = (await result.textContent()) ?? '';
  // Printed, because everything below branches on what the container managed and a skipped branch
  // is indistinguishable from a passing one in a green report.
  // eslint-disable-next-line no-console
  console.log(`SWEEP OUTCOME: ${text.slice(0, 600).replace(/\s+/g, ' ')}`);
  // eslint-disable-next-line no-console
  console.log(
    `SWEEP STORE FAILURES: ${storeFailureBodies.length === 0 ? 'none' : storeFailureBodies.join(' | ')}`,
  );

  /**
   * **A 4xx is a defect; anything else is the container.**
   *
   * This is the one assertion here that does not accept whatever the machine managed, and the
   * distinction is principled rather than convenient: a 5xx or a dropped socket is the environment,
   * and a container is entitled to produce one — but a 4xx means the client sent a body the server
   * refuses, which no amount of load can cause and no retry can fix, while the panel goes on
   * offering **Retry recording** for it.
   *
   * Verified red, and not hypothetically: the first run of this test reported two of four steps
   * "measured but NOT recorded", and the cause was `422 … property frames should not exist` on
   * every `revision-diff` reading — half of what "Run all measurements" produces, unstorable since
   * the day that scenario shipped, which is in as many words the complaint this epic was opened on.
   */
  expect(
    storeFailures.filter((status) => status >= 400 && status < 500),
    'the client sent a body the API refuses — a container cannot cause this and Retry cannot fix it',
  ).toEqual([]);

  // **The sitting summary names what happened to every step**, in the vocabulary the epic settled:
  // measured, refused, or not taken — never a bare count that hides which.
  expect(text).toMatch(/Sitting finished|You stopped this sitting/);

  // The overlay must be gone: it is `fixed inset-0`, so a leaked one covers the console and every
  // later assertion — including the axe sweep — would be about a canvas.
  await expect(staff.getByRole('button', { name: /^Stop/ })).toHaveCount(0);

  // **What reached the database, which is a different question from what was measured.** A sweep
  // records per step as each completes, so a container that refused one reading still stores the
  // others — that is the whole reason an interruption is cheap.
  const history = staff.getByRole('table', { name: SITTING_TABLE }).first();
  if (/measured/.test(text)) {
    await expect(history).toBeVisible({ timeout: 20_000 });
    // More than the header row. Asserted as a shape rather than a count, because how many of the
    // four steps this container manages is a property of the container.
    await expect(history.getByRole('row')).not.toHaveCount(1);
    // **And the NEWEST sitting is named as ONE act.** A sweep's steps POST separately, so the thing
    // that makes them one sitting is the client-minted `sweep_id` surviving four round trips into
    // the grouping — invisible to every unit test here, because those hand the model rows that
    // already carry it. If it did not survive, this reads `One reading` four times over.
    //
    // The newest rather than "exactly one": the history is installation-wide and a local database
    // accumulates across runs, so a count is a fact about how many times this suite has been run.
    // Asserted on `.first()` because the API returns newest first and this suite is serial.
    await expect(staff.getByRole('table', { name: SITTING_TABLE }).first()).toHaveAccessibleName(
      /^Sweep of \d+ readings? — /,
    );
  }

  // The console is a real screen and gets the same accessibility bar as every other one — and this
  // milestone added three controls, a disclosure and a per-step result block to it.
  const results = await new AxeBuilder({ page: staff })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await staffContext.close();
});

/**
 * Open the **Measure one thing** disclosure, whatever state it is already in.
 *
 * The three single-run selects moved behind a `<details>` in staff-probe M5, when the two sweep
 * buttons became the panel's primary controls — "which of eight combinations do I want?" is the
 * question an operator asks last. This journey went on driving them without opening it, and on the
 * first run after that rework it timed out at `selectOption` with the accessibility snapshot
 * showing a collapsed `"Measure one thing"` and **no combobox in the tree at all**.
 *
 * **Nothing below this tier could have reported it.** The panel's own unit suite opens the same
 * disclosure — its helper's docblock says why, in as many words — so it passed throughout. One
 * correct pattern applied to a control and not its neighbour, which is the shape this register
 * records most often, arriving here through a control that MOVED rather than one never wired.
 *
 * Idempotent by asking whether the select is reachable rather than by clicking blind: a `<summary>`
 * toggles, so a second unconditional click shuts it again and the failure names the select instead
 * of the click that caused it.
 */
async function openMeasureOne(page: Page): Promise<void> {
  const length = page.getByRole('combobox', { name: 'Length' });
  if (await length.isVisible()) return;
  await page.getByText('Measure one thing').click();
  await expect(length).toBeVisible();
}

/**
 * One row of the retention table, located by the table it names.
 *
 * Exists because two tables now share a period: an assertion scoped to the section matches every
 * row carrying that number, and the failure it produces names the number rather than the row.
 */
function rowFor(region: Locator, table: string): Locator {
  return region.getByRole('row').filter({ hasText: table });
}
