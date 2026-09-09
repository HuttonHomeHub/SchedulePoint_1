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
  const staffContext = await browser.newContext();
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
    const history = staff.getByRole('table', {
      name: /Readings recorded on this installation/,
    });
    await expect(history.getByRole('cell', { name: 'CI container' }).first()).toBeVisible();
    // More than the header row, asserted as a shape rather than as a count: a scenario may be
    // measured at more than one scale, and each scale is its own row.
    await expect(history.getByRole('row')).not.toHaveCount(1);

    // **The three facts that decide whether a reading means anything** (M2-T1). All three were
    // stored on every row since this table shipped and rendered on none, against an acceptance
    // criterion the predecessor spec approved. Asserted here against a REAL stored row, because a
    // component test renders whatever fixture it was handed and cannot tell you the column is fed
    // by the field the API actually returns.
    await expect(history.getByRole('columnheader', { name: 'Canvas' })).toBeVisible();
    await expect(history.getByRole('columnheader', { name: 'Display' })).toBeVisible();
    await expect(history.getByRole('columnheader', { name: 'Attention' })).toBeVisible();
    // A real viewport and a real measured interval, not zeroes or blanks: the shapes are what a
    // wrong wiring would break, and a blank cell is what it would look like.
    await expect(history.getByRole('cell', { name: /^\d+x\d+ @[\d.]+x$/ }).first()).toBeVisible();
    await expect(history.getByRole('cell', { name: /^[\d.]+ ms$/ }).first()).toBeVisible();
    await expect(history.getByRole('cell', { name: /^(Held|Lost focus)$/ }).first()).toBeVisible();

    // **The entry point for M2-T3** (ADR-0081). The block is the deliverable `docs/TECH_DEBT.md`
    // #75 actually consumes, and until this milestone it could only be produced in the seconds
    // after a run. Clicking it here proves the control reaches a stored reading through the real
    // formatter — the clipboard write itself is asserted in the unit suite, since a headless
    // browser's clipboard permission is a property of the harness rather than of the product.
    await expect(history.getByRole('button', { name: 'Copy' }).first()).toBeVisible();
    await history.getByRole('button', { name: 'Copy' }).first().click();
    await expect(staff.getByText('Copied.').first()).toBeVisible();

    // And the caveat that says what the Canvas column is FOR, linked to the table rather than
    // merely placed above it — `DataTable` is a focusable region, so a landmark-navigating reader
    // lands inside it having skipped whatever sits above.
    const describedBy = await staff
      .getByRole('region')
      .filter({ has: history })
      .first()
      .getAttribute('aria-describedby');
    expect(describedBy, 'the table names its comparability note').not.toBeNull();
    await expect(staff.locator(`#${String(describedBy)}`)).toContainText('per megapixel');
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
  const rowsBefore = await staff
    .getByRole('table', { name: /Readings recorded on this installation/ })
    .getByRole('row')
    .count()
    .catch(() => 0);

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
    await expect(staff.getByText(/Recorded\./).first()).toBeVisible({ timeout: 15_000 });
    const rowsAfter = await staff
      .getByRole('table', { name: /Readings recorded on this installation/ })
      .getByRole('row')
      .count();
    expect(rowsAfter, 'a stopped press still added its completed reading').toBeGreaterThan(
      rowsBefore,
    );
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
 * One row of the retention table, located by the table it names.
 *
 * Exists because two tables now share a period: an assertion scoped to the section matches every
 * row carrying that number, and the failure it produces names the number rather than the row.
 */
function rowFor(region: Locator, table: string): Locator {
  return region.getByRole('row').filter({ hasText: table });
}
