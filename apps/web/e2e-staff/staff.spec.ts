import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Locator, type Page } from '@playwright/test';

import { firstUrlIn, SmtpSink } from '../e2e-account/smtp-sink';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';

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
 * 1. **A non-staff member sees "Page not found", not "access denied".** The API answers every non-staff
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
/**
 * The sitting INDEX's caption (`probe-sittings.tsx:384`), which renders **iff**
 * `sittings.length > 1` — the same expression that supplies the comparability caveat's id
 * (`:229`). That is why it is the right thing to read: the two cannot disagree, because one
 * expression drives both. Counting rows, or asking the database, could.
 */
const SITTING_INDEX = 'Every sitting recorded on this installation, newest first';

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

/**
 * **An unmatched address under an organisation (#463, `docs/specs/in-shell-not-found/`).**
 *
 * Three claims only a real browser can settle, against the real router and the real API:
 *
 * 1. **Foreign = nonexistent, for every shape of address.** The guarantee is not "looks like
 *    `/no-such-path`" (a cold load of `/orgs/x/nope` now asks for the organisation list, which
 *    `/no-such-path` never does) but that a slug the member is not in and a slug nobody holds are
 *    indistinguishable: same settled page, same requests. Driven for an unmatched path and for a
 *    real route name, which redirects instead.
 * 2. **The shell never paints for a non-member.** With the organisation list held back, a
 *    `MutationObserver` records any node of the shell attaching; the pending skeleton is the only
 *    thing on the page for either slug.
 * 3. **A member's mistype keeps the shell**, with focus on the heading, one `<main>`, one `<h1>`, a
 *    working link back, no live region, no overflow at two widths, and axe clean.
 */
async function inOrganisationNotFound(
  member: Page,
  memberContext: BrowserContext,
  { slug, foreignSlug, goneSlug }: { slug: string; foreignSlug: string; goneSlug: string },
): Promise<void> {
  const NOT_FOUND = { level: 1, name: 'Page not found' } as const;
  const SHELL = 'a[href="#main"], nav[aria-label="Project Explorer"], #main';

  // ------------------------------------------------ 1. Foreign = nonexistent, every shape
  const normalise = (text: string, target: string): string => text.split(target).join('<slug>');
  async function settle(path: string, target: string) {
    const page = await memberContext.newPage();
    const requests: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/'))
        requests.push(`${request.method()} ${normalise(pathname, target)}`);
    });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const picture = {
      url: normalise(new URL(page.url()).pathname, target),
      title: await page.title(),
      h1s: await page.getByRole('heading', { level: 1 }).allTextContents(),
      mains: await page.locator('main').count(),
      shell: await page.locator(SHELL).count(),
      requests: requests.sort(),
    };
    await page.close();
    return picture;
  }
  // `a/b` is a deeper unmatched path and `nope/` a trailing-slash variant: neither may tell a
  // foreign slug from a nonexistent one any more than `nope` does.
  for (const shape of ['nope', 'a/b', 'nope/', 'members']) {
    const foreign = await settle(`/orgs/${foreignSlug}/${shape}`, foreignSlug);
    const gone = await settle(`/orgs/${goneSlug}/${shape}`, goneSlug);
    expect(
      gone,
      `/orgs/<slug>/${shape}: a foreign slug and a nonexistent one are one picture`,
    ).toEqual(foreign);
    if (shape !== 'members') {
      expect(foreign.h1s, 'an unmatched address is the root not-found').toEqual(['Page not found']);
      expect(foreign.shell, 'and it is outside the shell').toBe(0);
    } else {
      expect(foreign.url, 'a real route redirects a non-member home, as it always did').toBe(
        `/orgs/${slug}`,
      );
    }
  }

  // ------------------------------------------------ 2. No shell, ever, for a non-member
  for (const target of [foreignSlug, goneSlug]) {
    const page = await memberContext.newPage();
    await page.addInitScript((selector: string) => {
      const seen = window as unknown as { shellSeen: boolean };
      seen.shellSeen = false;
      const check = (): void => {
        if (document.querySelector(selector)) seen.shellSeen = true;
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true });
      check();
    }, SHELL);
    // Held back for longer than the router's 1000 ms pending threshold, so the skeleton shows.
    await page.route(/\/api\/v1\/organizations(\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await route.continue();
    });
    await page.goto(`/orgs/${target}/nope`);
    await expect(page.getByTestId('route-pending'), `${target}: the skeleton shows`).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('heading', NOT_FOUND)).toBeVisible({ timeout: 10_000 });
    expect(
      await page.evaluate(() => (window as unknown as { shellSeen: boolean }).shellSeen),
      `${target}: no node of the shell attached at any point of the load`,
    ).toBe(false);
    await page.close();
  }

  // ------------------------------------------------ 3. A member's mistype keeps the shell
  await member.setViewportSize({ width: 1368, height: 912 });
  const heading = member.getByRole('heading', NOT_FOUND);
  const overview = member.getByRole('link', { name: 'Go to the organisation overview' });
  const trail = member.getByRole('navigation', { name: 'Breadcrumb' });

  async function expectInShell(label: string): Promise<void> {
    await expect(heading, `${label}: the one heading`).toBeVisible();
    await expect(heading, `${label}: focus moved to it`).toBeFocused();
    await expect(
      member.locator('nav[aria-label="Project Explorer"]'),
      `${label}: Explorer`,
    ).toBeVisible();
    await expect(member.locator('main'), `${label}: one main`).toHaveCount(1);
    await expect(member.getByRole('heading', { level: 1 }), `${label}: one h1`).toHaveCount(1);
    expect(await member.title(), `${label}: title`).toBe('Page not found · SchedulePoint');
    await expect(overview, `${label}: link`).toHaveAttribute('href', `/orgs/${slug}`);
    await expect(trail.getByRole('link').first(), `${label}: first crumb`).toHaveText('Overview');
    await expect(trail.locator('[aria-current="page"]'), `${label}: current crumb`).toHaveText([
      'Page not found',
    ]);
    await expect(member.locator('main [role="alert"]'), `${label}: no alert`).toHaveCount(0);
  }

  // Cold arrival.
  await member.goto(`/orgs/${slug}/nope`);
  await expectInShell('cold');
  // Tab from the heading lands on the next control in reading order: the link.
  await member.keyboard.press('Tab');
  await expect(overview, 'Tab from the heading reaches the link').toBeFocused();

  // Client-side arrival: from inside the app, with a marker that a document reload would erase.
  await member.goto(`/orgs/${slug}`);
  await expect(member.locator('nav[aria-label="Project Explorer"]')).toBeVisible();
  await member.evaluate((path) => {
    (window as unknown as { marker: number }).marker = 1;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/orgs/${slug}/plans/abc/x`);
  await expectInShell('client-side');

  // Client-side to a DIFFERENT unmatched path under the same organisation re-uses the match, so
  // focus must come back to the heading from wherever the reader had moved it.
  await overview.focus();
  await expect(overview, 'focus is off the heading').toBeFocused();
  await member.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/orgs/${slug}/another/unmatched`);
  await expect(heading, 'a second unmatched path pulls focus back to the heading').toBeFocused();

  // Pressing the link reaches the overview without a document reload.
  await overview.click();
  await expect(member).toHaveURL(new RegExp(`/orgs/${slug}$`));
  expect(
    await member.evaluate(() => (window as unknown as { marker?: number }).marker),
    'the link navigated client-side',
  ).toBe(1);

  // Two widths: no horizontal overflow, axe clean once focus has settled.
  for (const width of [1368, 320]) {
    await member.setViewportSize({ width, height: width === 320 ? 568 : 912 });
    await member.goto(`/orgs/${slug}/nope`);
    await expect(heading, `${width}: focus settled`).toBeFocused();
    const overflow = await member.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      main:
        (document.querySelector('main')?.scrollWidth ?? 0) -
        (document.querySelector('main')?.clientWidth ?? 0),
    }));
    expect(overflow.document, `${width}: the document does not overflow`).toBeLessThanOrEqual(0);
    expect(overflow.main, `${width}: main does not overflow`).toBeLessThanOrEqual(0);
    const axe = await new AxeBuilder({ page: member })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations, `${width}: axe`).toEqual([]);
  }

  // A mistyped plan id is the same picture, drawn for the entity: the API answers a plan that does
  // not exist with 404, which `EntityLoadFailure` renders as a destination rather than an alert.
  await member.setViewportSize({ width: 1368, height: 912 });
  await member.goto(`/orgs/${slug}/plans/00000000-0000-4000-8000-000000000000`);
  const planHeading = member.getByRole('heading', { level: 1, name: 'Plan not found' });
  await expect(planHeading, 'a missing plan: the heading, in the shell').toBeVisible();
  await expect(planHeading, 'a missing plan: focus moved to it').toBeFocused();
  const planAxe = await new AxeBuilder({ page: member })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(planAxe.violations, 'a missing plan: axe').toEqual([]);
  await expect(member.locator('nav[aria-label="Project Explorer"]')).toBeVisible();
  await expect(member.locator('main [role="alert"]'), 'a missing plan: no alert').toHaveCount(0);
  await expect(overview, 'a missing plan: the way home').toHaveAttribute('href', `/orgs/${slug}`);

  await member.setViewportSize({ width: 1920, height: 1080 });
}

test('a staff member reaches the console; a member cannot tell it exists', async ({ browser }) => {
  const stamp = Date.now();
  const memberEmail = `staff-outsider-${stamp}@example.com`;

  // ---------------------------------------------------------------- An ordinary member
  const memberContext = await browser.newContext();
  // The in-shell not-found check below runs at 320 px, which is the reader's view after Continue
  // anyway (ADR-0179); the same context serves the sections that run at 1368.
  await acknowledgeViewportNotice(memberContext);
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
  await expect(member.getByRole('heading', { name: 'Page not found' })).toBeVisible();
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

  // **Parity (#459): `/staff` is not distinguishable from an address that was never a page.** The
  // unit suites each assert one half; only a real browser against the real guard can compare the
  // settled pages and the API bodies with each other.
  const created = await member.request.post('/api/v1/organizations', {
    data: { name: `Parity ${stamp}` },
    headers: { Origin: 'http://localhost:5173' },
  });
  const slug = ((await created.json()) as { data: { slug: string } }).data.slug;
  expect(slug, 'the member has an organisation to mistype under').toBeTruthy();
  // **A second account's organisation**, which `member` is not in: the parity comparison below needs
  // a slug that EXISTS and is not theirs, as well as one that does not exist (#463).
  const ownerContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage();
    await signUpOrIn(owner, `staff-owner-${stamp}@example.com`, 'Org Owner');
    const foreignCreated = await owner.request.post('/api/v1/organizations', {
      data: { name: `Foreign ${stamp}` },
      headers: { Origin: 'http://localhost:5173' },
    });
    const foreignSlug = ((await foreignCreated.json()) as { data: { slug: string } }).data.slug;
    expect(foreignSlug, 'a second account owns an organisation the member is not in').toBeTruthy();
    expect(foreignSlug).not.toBe(slug);
    const goneSlug = `no-such-org-${stamp}`;
    const settled: Array<{
      path: string;
      title: string;
      lang: string;
      metas: string[];
      mains: number;
      main: string;
      h1s: Array<string | null>;
    }> = [];
    // `/orgs/<slug>/nope` for a slug the member is NOT in — foreign and nonexistent — must settle to the
    // root picture exactly as `/staff` does. The member's own organisation moved into the shell (#463)
    // and is asserted separately below.
    for (const path of [
      '/staff',
      '/staff/',
      '/staff/x',
      '/no-such-path',
      `/orgs/${foreignSlug}/nope`,
      `/orgs/${goneSlug}/nope`,
    ]) {
      await member.goto(path);
      const h1 = member.getByRole('heading', { level: 1, name: 'Page not found' });
      await expect(h1, `${path}: the one heading`).toBeVisible();
      await expect(h1, `${path}: focus moved to it`).toBeFocused();
      await expect(member.getByRole('link', { name: 'Go to the home page' })).toHaveCount(1);
      settled.push({
        path,
        ...(await member.evaluate(() => ({
          title: document.title,
          lang: document.documentElement.lang,
          metas: [...document.querySelectorAll('head meta')].map((meta) => meta.outerHTML).sort(),
          mains: document.querySelectorAll('main').length,
          main: (document.querySelector('main')?.outerHTML ?? '').replace(/\s+/g, ' '),
          h1s: [...document.querySelectorAll('h1')].map((node) => node.textContent),
        }))),
      });
    }
    const { path: _first, ...reference } = settled[0]!;
    for (const { path, ...picture } of settled) {
      expect(picture, `${path} settles to the same page as /staff`).toEqual(reference);
    }
    expect(reference.title).toBe('Page not found · SchedulePoint');
    expect(reference.mains).toBe(1);

    await inOrganisationNotFound(member, memberContext, { slug, foreignSlug, goneSlug });
  } finally {
    await ownerContext.close();
  }

  // Every call carries the browser's Origin, as the page's own requests do: the CORS headers answer
  // the Origin, not the route, so sending it on one call only would compare two kinds of request.
  const asBrowser = { headers: { Origin: 'http://localhost:5173' } };
  const apiCalls = [
    () => member.request.get('/api/v1/staff/me', asBrowser),
    () => member.request.post('/api/v1/staff/me', asBrowser),
    () => member.request.get('/api/v1/staff/no-such-route', asBrowser),
    () => member.request.get('/api/v1/x', asBrowser),
  ];
  // The throttle's own headers and per-request values are residue (spec §2), not parity.
  const volatile = (name: string): boolean =>
    ['date', 'x-correlation-id'].includes(name) || name.startsWith('x-ratelimit-');
  const answers = [];
  for (const call of apiCalls) {
    const response = await call();
    answers.push({
      status: response.status(),
      body: await response.text(),
      headers: Object.fromEntries(
        Object.entries(response.headers()).filter(([name]) => !volatile(name)),
      ),
    });
  }
  const [firstAnswer, ...otherAnswers] = answers;
  expect(firstAnswer?.body).toBe('{"error":{"code":"NOT_FOUND","message":"Not found"}}');
  for (const answer of otherAnswers) expect(answer).toEqual(firstAnswer);
  await memberContext.close();

  // -------------------------------------------------- Allowlisted, but unverified: still refused
  // The squatting control. `AUTH_REQUIRE_EMAIL_VERIFICATION` is OFF in this config — exactly the
  // configuration in which an allowlisted address that nobody has proved ownership of would
  // otherwise become staff — and the refusal is byte-identical to a stranger's.
  const squatterContext = await browser.newContext();
  const squatter = await squatterContext.newPage();
  await signUpOrIn(squatter, UNVERIFIED_STAFF_EMAIL, 'Unverified Ops');
  await squatter.goto('/staff');
  await expect(squatter.getByRole('heading', { name: 'Page not found' })).toBeVisible();
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
  await expect(
    staff.getByRole('heading', { name: /^(Staff console|Page not found)$/ }),
  ).toBeVisible({
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
  // **Grouped by task since the redesign (ADR-0178), and each condition is its own box.** The group
  // headings are the page's `h2`s and the boxes are `h3`s inside them, so a screen-reader user
  // navigating by heading walks Conditions, then Mail, Clearing old records, and so on. Mail and
  // Clearing old records used to be one card; they share a response, not a box.
  for (const group of ['Conditions', 'This installation', 'Tools', 'Record']) {
    await expect(staff.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
  }
  await expect(staff.getByRole('heading', { level: 3, name: 'Mail', exact: true })).toBeVisible();
  await expect(
    staff.getByRole('heading', { level: 3, name: 'Clearing old records', exact: true }),
  ).toBeVisible();
  await expect(
    staff.getByRole('heading', { level: 3, name: 'Browser security reports' }),
  ).toBeVisible();
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
  // ---------------------------------------------------- FC-1a: the summary comes FIRST, in the DOM
  //
  // **"The first viewport" is a sighted-user concept.** It is the right criterion for the visual
  // redesign and it is NOT an accessibility guarantee, so it cannot stand in for one: somebody
  // navigating linearly, by heading, or by "read all" has no fold. The AT-equivalent is that the
  // summary precedes every section in DOM ORDER and links to each condition it reports — asserted
  // here in DOM terms, independent of pixels, and at the two-column breakpoint, because the
  // pre-column unit assertions say nothing about the grid (`feature-spec.md` §8.11).
  //
  // This is also what forbids CSS `order` and a dense auto-flow in `PageGrid`: a two-column layout
  // satisfies WCAG 1.3.2 only while the DOM sequence IS the reading sequence, and the natural
  // implementation of "two columns" breaks that silently, because nothing looks wrong.
  const sectionNames = await staff
    .locator('section[aria-labelledby]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.querySelector('h2, h3')?.textContent?.trim() ?? '(unnamed)'),
    );
  expect(
    sectionNames.length,
    'the sweep found no sections — every check below is vacuous',
  ).toBeGreaterThan(4);
  expect(sectionNames[0], 'the status summary must be the first section in the DOM').toBe('Status');

  // Every condition the summary reports carries a link to the section that answers it — and the
  // whole row is the target (WCAG 2.5.8), which is the shape ADR-0090 and ADR-0110 both record
  // shipping wrong as a caret nobody could hit.
  const summary = staff.getByRole('region', { name: 'Status' });
  const summaryLinks = summary.getByRole('link');
  expect(await summaryLinks.count(), 'the summary reports no checks').toBeGreaterThan(0);
  for (const href of await summaryLinks.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href') ?? ''),
  )) {
    expect(href).toMatch(/^#staff-section-/);
    // The destination exists and can receive focus — an anchor that moves the viewport without
    // moving focus leaves a keyboard reader where they were, looking at something else.
    const target = staff.locator(`${href}`);
    await expect(target).toHaveAttribute('tabindex', '-1');
  }

  await expect(
    staff.getByRole('heading', { name: 'Clearing old records', exact: true }),
  ).toBeVisible();
  // Scoped to the section, never the document — the ADR-0073 C2.5 finding, where a document-scoped
  // assertion passed on the page's prose alone and proved nothing about the table.
  const retention = staff.getByRole('region', { name: /what is cleared, and when/i });
  await expect(retention.getByText('Policy violation reports')).toBeVisible();
  await expect(retention.getByText('Mail events')).toBeVisible();
  // The third table, which the staff performance probe added. It appears here without any edit to
  // the panel — the rows are derived from the API's list.
  //
  // **This asserted `perf_probe_results` until 2026-09-12, and its own comment explained why: the
  // label "falls back to the raw table name if nobody supplies one, which is why the name is
  // asserted rather than assumed".** Both halves were true and the conclusion was backwards — it
  // pinned the unpolished fallback as the expectation, so the one gate that drives this panel
  // against a real API was protecting the defect. Found by PHOTOGRAPHING the console (`#165(e)`),
  // not by anything failing; the label is now in `retention-copy.ts` and the mechanism that let it
  // be missing is `#310`. This is the same shape `#165` records in `app-shell.test.tsx` — an
  // area's own suite using the broken state as its fixture — one tier out, in a journey.
  await expect(retention.getByText('Performance readings')).toBeVisible();
  // Each configured period as the API reports it, and scoped to ITS OWN ROW. Not `/\d+ days/` — a
  // regex would pass on whatever number arrived, including a default the server is not using.
  //
  // The row scope is not fastidiousness: two tables now share a 365-day period, so a
  // section-scoped `getByText('365 days')` matches twice and fails on strict mode. That is exactly
  // how this assertion broke when the third table landed — the slice that added it never ran this
  // journey, and the failure names a number rather than the table it belongs to.
  await expect(rowFor(retention, 'Policy violation reports').getByText('30 days')).toBeVisible();
  await expect(rowFor(retention, 'Mail events').getByText('365 days')).toBeVisible();
  await expect(rowFor(retention, 'Performance readings').getByText('365 days')).toBeVisible();
  // The sweep runs at boot (`onApplicationBootstrap`), so by the time a browser has signed up,
  // verified an address and signed in twice, this process HAS swept — which makes the "not swept
  // yet" wording the wrong assertion here and the presence of a real last-run line the right one.
  //
  // `.*` and not `.* ago`: the first version of this assertion demanded "ago" and failed against a
  // perfectly correct panel reading **"Last swept just now"**, because the API boots seconds before
  // the browser arrives and `agoLabel` says "just now" under a minute. The journey was written from
  // the shape of the copy rather than from a run — which is the failure this step exists to catch.
  await expect(
    staff.getByText(/Working\. Last ran .*; runs every (hour|\d+ minutes)\./),
  ).toBeVisible();

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
    //
    // **Named rather than positional, since the staff-console design epic's M1.** This read
    // `getByRole('region').filter({ has: history }).first()`, which was unambiguous only while
    // `DataTable`'s scroll container was the ONLY region containing this table. `Panel` now composes
    // `SectionCard`, which renders a named `<section>` — also a region, also containing the table,
    // and PRECEDING it in document order — so `.first()` returned the section, which carries no
    // `aria-describedby`, and this assertion failed against a perfectly correct page. Predicted by
    // the design review before the change and confirmed on the first run (spec §8.6). `.last()`
    // would also work and is positional; the region is named by its caption (`data-table.tsx:225`),
    // so naming it says which region is meant instead of relying on nesting order.
    const describedBy = await staff
      .getByRole('region', { name: SITTING_TABLE })
      .first()
      .getAttribute('aria-describedby');
    expect(describedBy, 'the table names what describes it').not.toBeNull();
    const ids = String(describedBy).split(/\s+/).filter(Boolean);
    // **Two descriptions are ALWAYS owed, and the caveat is not one of them.** This message read
    // "the sitting describes itself as well as citing the shared caveat" and could not prove the
    // second half: `describedBy` is `[factsId, CAP_ID, …, comparabilityId?]`
    // (`probe-sittings.tsx:527-539`), so `[facts, cap]` satisfies a count of two with no caveat
    // present — which is exactly the state that failed in the sweep while this line stayed green.
    // The caveat is asserted below, against the condition that actually governs it.
    expect(ids.length, 'the sitting cites its own facts and the cap note').toBeGreaterThan(1);

    let described = '';
    for (const id of ids) {
      const target = staff.locator(`#${id}`);
      // A dangling id is worse than a missing one: assistive technology reports a description that
      // resolves to nothing, which a reader cannot tell from a description that was never there.
      await expect(target, `#${id} resolves to an element`).toHaveCount(1);
      described += `${(await target.textContent()) ?? ''}\n`;
    }

    // **The RULE, not a figure.** This asserted `per megapixel` until 2026-09-12, so it was pinned
    // to a coefficient derived from a reading #261 has since withdrawn — and the assertion would
    // have gone red for the correction rather than for a regression. What it exists to prove is
    // that the shared caveat is among the descriptions the table names, which the rule's own words
    // carry (`docs/TECH_DEBT.md` #165(e)).
    // And the block's OWN facts, which differ per sitting and are what decide whether the numbers
    // in this particular table mean anything. Unconditional: every block has them.
    expect(described, "this sitting's own machine facts").toContain('CI container');
    // Likewise the cap note, which M7 wired to the block and not only to the index — and which
    // nothing asserted until `docs/TECH_DEBT.md` #347, so that fix had no regression test.
    expect(described, 'the cap note reaches the block, not only the index').toContain(
      'Older sittings are not listed',
    );

    /**
     * **The comparability caveat is CONDITIONAL, and this now reads the condition off the page
     * rather than inheriting it from the database** (`docs/TECH_DEBT.md` #347).
     *
     * It asserted the caveat unconditionally, and that is a precondition the spec neither creates
     * nor checks: the paragraph renders only when there is a second sitting to compare with
     * (`probe-sittings.tsx:145`, a deliberate decision with its reasoning written above it —
     * before that it is advice about an act the reader cannot perform). This block runs in the
     * MEASURED branch, where the test has just taken a reading of its own — so on a database with
     * no prior sitting that reading is the only one, the caveat is absent, and the assertion
     * fails. **Reproduced deterministically**: emptying `perf_probe_results` and re-running gives
     * the sweep's exact error, every time. It passed locally only because the machine happened to
     * have written sittings earlier.
     *
     * **Both states are asserted rather than one being skipped.** A skipped assertion is
     * indistinguishable from a passing one in a green report (ADR-0093, and this file's own rule
     * fifty lines up about which branch ran), so the absence is pinned as firmly as the presence —
     * which also makes this a regression test for the decision itself, in both directions.
     */
    const manySittings = (await staff.getByRole('region', { name: SITTING_INDEX }).count()) > 0;
    if (manySittings) {
      expect(described, 'the shared comparability caveat').toContain('same canvas size');
    } else {
      expect(
        described,
        'one sitting: the caveat is advice about a comparison the reader cannot make',
      ).not.toContain('same canvas size');
    }
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

  // Every GET of the history, by the page's own request events: a response is not the question,
  // because a cached or aborted one would still be a request somebody made.
  const probeReads: string[] = [];
  staff.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      new URL(request.url()).pathname.endsWith('/staff/probe-results')
    ) {
      probeReads.push(request.url());
    }
  });

  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');
  await staff.goto('/staff');

  // The console, or nothing to test. The verification branch is proved by the first test; this one
  // asserts it is already in rather than repeating that machinery, and says so if it is not.
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });

  // ------------------------------------------------------- Performance arrives folded (ADR-0178 D-3)
  // The history read happens once on load; folding the tools must not mean reading it again when
  // they open, because each read is an audited act in a table that refuses DELETE.
  await expect.poll(() => probeReads.length, { message: 'one history read on load' }).toBe(1);
  const performance = staff.getByRole('region', { name: 'Performance' });
  const openTools = performance.getByRole('button', { name: 'Open performance tools' });
  await expect(openTools).toHaveAttribute('aria-expanded', 'false');
  await expect(
    performance.getByText(/(Last measured .+|Not measured on this installation yet\.)/),
  ).toBeVisible();
  await expect(
    performance.getByRole('button', { name: 'Check the probe works' }),
    'folded means not rendered, not clipped',
  ).toHaveCount(0);

  await openTools.click();
  const hideTools = performance.getByRole('button', { name: 'Hide performance tools' });
  await expect(hideTools).toHaveAttribute('aria-expanded', 'true');
  await expect(hideTools, 'focus stays on the button that was pressed').toBeFocused();
  await expect(performance.getByRole('button', { name: 'Check the probe works' })).toBeVisible();
  await staff.waitForLoadState('networkidle');
  expect(probeReads, 'opening the box made no request').toHaveLength(1);

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

    // **The index, driven — because a capability with no journey is one nobody has proved reaches a
    // planner** (ADR-0081, and this repository's fifth recorded instance of a milestone shipping
    // dark). The history expands the newest sitting and indexes the rest; the unit suite proves the
    // rules and cannot prove that a press in a real browser moves a real sitting into the slot.
    //
    // Conditional on a second sitting existing, which on a local database it does after the first
    // run and in a fresh container it may not — so the branch is announced rather than skipped
    // silently, for the same reason the M3 diagnosis above is printed.
    const index = staff.getByRole('table', { name: /Every sitting/ });
    if (await index.isVisible().catch(() => false)) {
      // **The caption, not `aria-label`.** `DataTable` names its table with a `sr-only` `<caption>`,
      // which is what `SITTING_TABLE` resolves against — so reading the attribute returned `null`
      // for every state and the comparison below was `'' !== ''`, i.e. permanently red against a
      // perfectly correct product. Caught on this assertion's first run; the instrument was wrong.
      const shownName = async (): Promise<string> =>
        (await staff
          .getByRole('table', { name: SITTING_TABLE })
          .first()
          .locator('caption')
          .textContent()) ?? '';
      const shownBefore = await shownName();

      // The second row's control: row 1 is the sitting already shown, whose button is shaded.
      const others = index.getByRole('button', { name: /^Show / });
      const count = await others.count();
      // eslint-disable-next-line no-console
      console.log(`INDEX DIAGNOSIS: ${String(count)} sittings listed`);

      if (count > 1) {
        await others.nth(1).click();
        // The slot holds a DIFFERENT sitting — asserted as a change rather than as a fixed name,
        // because which sittings a local database holds is a property of how often this ran.
        await expect
          .poll(shownName, {
            message: 'pressing Show moved a different sitting into the detail slot',
          })
          .not.toBe(shownBefore);
        // Non-vacuous: a comparison against an empty string would pass against a table that had
        // vanished, which is how the first version of this assertion was wrong.
        expect(shownBefore).not.toBe('');

        // **Focus did not drop**, which is the reason the shaded control is `aria-disabled` and
        // never natively `disabled`: the button under the reader's finger changes state as a
        // consequence of their own press, and the native attribute blurs to `<body>` at exactly
        // that moment (WCAG 2.2 §2.4.3). jsdom has no focus ring, so only this tier can ask.
        await expect(others.nth(1)).toBeFocused();
      }
    }
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
 * Open the **Performance** box, whatever state it is already in.
 *
 * It arrives folded (ADR-0178 D-3, staff console redesign M4), so every step that drives a measuring
 * control starts here. Idempotent by asking for the **Open** button rather than clicking blind: the
 * label becomes **Hide** once it is open, and a second unconditional click would shut it again and
 * report the control it then could not find instead of the click that caused it. (A plan-loading
 * press reloads the page with the box already open, which is why the question is asked each time.)
 */
async function openPerformance(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Open performance tools' });
  if (await open.isVisible()) await open.click();
  await expect(page.getByRole('button', { name: 'Hide performance tools' })).toBeVisible();
}

/**
 * Open the **Measure one thing** disclosure, whatever state it is already in.
 *
 * The three single-run selects sit behind a disclosure, because "which of eight combinations do I
 * want?" is the question an operator asks last. This journey went on driving them without opening
 * it once, and timed out at `selectOption` with the accessibility snapshot showing a collapsed
 * `"Measure one thing"` and **no combobox in the tree at all**.
 *
 * **Nothing below this tier could have reported it.** The panel's own unit suite opens the same
 * disclosure, so it passed throughout: one correct pattern applied to a control and not its
 * neighbour, arriving here through a control that MOVED rather than one never wired.
 *
 * Idempotent by asking whether the select is reachable rather than by clicking blind: the trigger
 * toggles, so a second unconditional click shuts it again and the failure names the select instead
 * of the click that caused it.
 */
async function openMeasureOne(page: Page): Promise<void> {
  await openPerformance(page);
  const length = page.getByRole('combobox', { name: 'Length' });
  if (await length.isVisible()) return;
  await page.getByRole('button', { name: 'Measure one thing' }).click();
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

/**
 * **The diagnostics panel, driven end to end — ADR-0140 M3.**
 *
 * ADR-0081's rule: a milestone claiming user-facing capability names its entry point and its
 * journey lands with it. That rule has been paid for twice in this very file's epic — M2 shipped a
 * route that could not serve a request with 1,589 unit tests green, and a later milestone shipped a
 * drawer with no door — so the locator below is the point of the test rather than a step in it. If
 * `Run diagnostics` ever stops matching, the capability has no route to it, and no unit suite in
 * the repository can notice: they mount the panel, and the seam that breaks is between the panel
 * and the console.
 *
 * **Four things are only testable here.** That the panel is registered on the real route at all;
 * that a press reaches a route which runs raw SQL against a real database (the unit tests mock
 * Prisma and the component tests mock the query, so between them nothing executes a `SELECT`); that
 * the audit row this read writes does not make the request fail, which is exactly how ADR-0086's M2
 * died; and that the payload the browser renders contains no customer name or id — asserted over
 * the whole rendered panel rather than over the fields somebody remembered to check.
 *
 * **A third `test()` rather than an extension**, for the measured reason the second one gives:
 * `playwright.staff.config.ts` sets a 120 s per-test timeout and the first test spends most of a
 * minute on sign-up and verification.
 */
test('a staff member runs the diagnostics and can paste the result', async ({ browser }) => {
  // `clipboard-read` as well as `-write`: the block is the deliverable, so this test reads it
  // back rather than trusting the "Copied." announcement, which is a claim about the
  // handler's success branch and not about what is on the clipboard.
  const staffContext = await browser.newContext({
    permissions: ['clipboard-write', 'clipboard-read'],
  });
  const staff = await staffContext.newPage();

  // The read's HTTP outcome, captured rather than inferred. A count of zero on screen is a correct
  // answer on an empty estate AND what a silently failed request would leave behind, so the status
  // is recorded to tell those apart — the second test's own lesson: a count is not a cause.
  const statuses: number[] = [];
  staff.on('response', (response) => {
    if (response.url().includes('/staff/diagnostics')) statuses.push(response.status());
  });

  // **History to count, written through the real API as an ordinary member.** The three history
  // rows are counts over `activity_history_entries`, and a press over an empty table would pass on
  // a query that counted nothing at all. A save by a member is the write path the counts are
  // about, so the fixture is made there rather than below it (ADR-0066). The member is a separate
  // context: the staff account is deliberately not a member of anything (ADR-0086 D1).
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUpOrIn(member, `staff-history-${Date.now()}@example.com`, 'History Author');
  const orgRes = await member.request.post('/api/v1/organizations', {
    data: { name: `History ${Date.now()}` },
  });
  expect(orgRes.ok()).toBe(true);
  const base = `/api/v1/organizations/${((await orgRes.json()) as { data: { slug: string } }).data.slug}`;
  const created = async (path: string, data: object): Promise<{ id: string; version: number }> => {
    const res = await member.request.post(`${base}${path}`, { data });
    expect(res.ok(), `${path} must succeed`).toBe(true);
    return ((await res.json()) as { data: { id: string; version: number } }).data;
  };
  const client = await created('/clients', { name: 'History client' });
  const project = await created(`/clients/${client.id}/projects`, { name: 'History project' });
  const plan = await created(`/projects/${project.id}/plans`, {
    name: 'History plan',
    plannedStart: '2026-01-01',
  });
  const first = await created(`/plans/${plan.id}/activities`, {
    name: 'Excavate',
    durationDays: 5,
  });
  const second = await created(`/plans/${plan.id}/activities`, { name: 'Pour', durationDays: 3 });
  // A definition edit and a link, so there is an entry in each of two scopes.
  const edited = await member.request.patch(`${base}/activities/${first.id}`, {
    data: { name: 'Excavate (revised)', version: first.version },
  });
  expect(edited.ok()).toBe(true);
  await created(`/plans/${plan.id}/dependencies`, {
    predecessorId: first.id,
    successorId: second.id,
  });
  await memberContext.close();

  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');
  await staff.goto('/staff');

  // The console, or nothing to test. The verification branch is proved by the first test.
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });

  // **Nothing has run.** The hook is `enabled: false`, and this is the assertion that says so about
  // the shipped route rather than about the hook's options: arriving at `/staff` must not itself
  // count as somebody asking a question about customer data, because every one of those questions
  // writes a durable audit row.
  expect(statuses, 'arriving at /staff must not run the diagnostics').toEqual([]);

  // The copy control is shaded with a reason, not hidden (ADR-0082). Reachable, focusable, and its
  // refusal is a description rather than part of its name.
  const copy = staff.getByRole('button', { name: 'Copy results' });
  await expect(copy).toHaveAttribute('aria-disabled', 'true');

  // ---------------------------------------------------------------- The entry point, pressed
  await staff.getByRole('button', { name: 'Run diagnostics' }).click();

  // **The zero-count checks are folded behind one button** (D-12), so the journey opens them before
  // asking for a heading by name: a check that found nothing is a fact the panel states as a count
  // and shows on request, and which of the sixteen are folded depends on the database's contents.
  await expect(staff.locator('[data-diagnostics-result]')).toBeVisible({ timeout: 30_000 });
  const showAllChecks = staff.getByRole('button', { name: /^Show all \d+$/ });
  if (await showAllChecks.isVisible()) await showAllChecks.click();

  // Both registry entries answer. Located by their labels, which are the accessible headings a
  // reader navigates by — the first test's lesson about locating by role and name rather than by a
  // `data-` hook that says nothing about what anybody sees.
  await expect(staff.getByRole('heading', { name: /Day factor divergence \(driving/ })).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(
    staff.getByRole('heading', { name: /Day factor divergence \(inherited/ }),
  ).toBeVisible();

  expect(statuses, 'the read must have succeeded, not merely returned').toEqual([200]);

  // The three history readings (staff server readings M1). The e2e database persists across runs,
  // so the assertion is that each answers about a non-empty table, not what the table holds: the
  // member's save and link above guarantee at least two entries begun in the window.
  for (const label of [
    'History entries begun in the last four weeks',
    'Of those, link and resource entries',
    'History entries larger than half a kilobyte',
  ]) {
    await expect(staff.getByRole('heading', { name: label })).toBeVisible();
  }

  // **Counts only.** Asserted over the whole panel rather than over named fields: the point is that
  // nothing leaks, and a field-by-field check only ever proves it about the fields somebody thought
  // of. A UUID anywhere here would be an id, and an id is the whole disclosure ADR-0086 D6 protects.
  // Scoped to the result block by a `data-` hook — the one place a leak could appear, and the
  // only assertion here that must NOT be page-wide: the Accounts and Staff-activity panels on the
  // same screen legitimately render ids and addresses, so a page-scoped check would fail for a
  // reason that has nothing to do with this panel. (`[data-perf-probe-result]` above is the same
  // convention, for the same reason.)
  const rendered = (await staff.locator('[data-diagnostics-result]').textContent()) ?? '';
  expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  // Both zero shapes are legitimate here — the e2e database's contents are not this suite's to
  // control — so the assertion is that a SENTENCE was produced, in one of the three forms the pure
  // formatter can emit, rather than a bare number or an empty block.
  expect(rendered).toMatch(
    /No work of this shape exists|None of the .* examined is affected|\d+ of \d+ activit/,
  );

  // ---------------------------------------------------------------- The deliverable
  // The block is the point, not the panel: a number that stays on one operator's screen answers
  // nothing, and #86's owed M0-T3 is closed by pasting this into a measurement record.
  await expect(copy).not.toHaveAttribute('aria-disabled', 'true');
  await copy.click();
  await expect(staff.getByText('Copied.', { exact: true })).toBeVisible();

  const clipboard = await staff.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('SchedulePoint staff diagnostics');
  expect(clipboard).toContain('API version');
  expect(clipboard).toContain('accepts no parameter');
  // The history rows are in the deliverable, with a non-zero denominator and a non-zero window
  // count — a zero on either would mean the SQL ran and counted nothing the fixture just wrote.
  expect(clipboard).toMatch(
    /History entries begun in the last four weeks \(history-entries-last-28-days\)\n\s+examined\s+[1-9]\d*\n\s+affected\s+[1-9]\d*/,
  );
  // H-2: the member's link is a LOGIC entry begun just now, so it is counted.
  expect(clipboard).toMatch(
    /Of those, link and resource entries \(history-entries-links-and-resources-28-days\)\n\s+examined\s+[1-9]\d*\n\s+affected\s+[1-9]\d*/,
  );
  expect(clipboard).toContain('History entries larger than half a kilobyte');
  expect(clipboard).toMatch(/no plan is above ADR-0174 CQ-2's retention trigger/);

  await staffContext.close();
});

/**
 * **The plan-loading probe, driven end to end — `docs/TECH_DEBT.md` #433, ADR-0081.**
 *
 * The locator for the control is the point of the test, as it is for the diagnostics one above: the
 * unit suites mount the section, and the seams that break are between the section, the runner it
 * imports lazily, the router function the runner reaches, and a **real reload and a real
 * navigation** — none of which jsdom performs.
 *
 * **What this can and cannot assert.** It runs on `pnpm dev` (`playwright.staff.config.ts`), whose
 * caching differs from both the preview server and the `web` image, and which serves unbundled
 * `/src/` modules. So it asserts that the reading is complete and internally consistent, never what
 * it contains: the contents are verified against the defect by hand (`m2-measurement.md`).
 *
 * **Spec S3, recorded rather than argued.** The press must make no request to `/api/` that a plain
 * reload of `/staff` does not, so the set of API paths a plain reload makes is taken first, in the
 * same page, and the press has to land on exactly that set.
 *
 * **A fourth `test()` rather than an extension**, for the reason the second and third give: the
 * per-test timeout is 120 s and sign-up spends part of it.
 */
test('a staff member measures plan loading in one press', async ({ browser }) => {
  const staffContext = await browser.newContext({
    permissions: ['clipboard-write', 'clipboard-read'],
  });
  const staff = await staffContext.newPage();

  let apiPaths = new Set<string>();
  staff.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiPaths.add(`${request.method()} ${url.pathname}`);
  });

  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');
  await staff.goto('/staff');
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });

  // ---------------------------------------------------------------- The baseline: a plain reload
  apiPaths = new Set();
  await staff.reload();
  await expect(staff.getByRole('heading', { name: 'Staff console' })).toBeVisible({
    timeout: 30_000,
  });
  await openPerformance(staff);
  await expect(staff.getByRole('button', { name: 'Measure plan loading' })).toBeVisible();
  await staff.waitForLoadState('networkidle');
  const baseline = [...apiPaths].sort();
  expect(baseline.length, 'a plain reload of /staff makes API requests of its own').toBeGreaterThan(
    0,
  );

  const copy = staff.getByRole('button', { name: 'Copy plan loading report' });
  await expect(copy, 'nothing to copy before a measurement').toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // ---------------------------------------------------------------- The entry point, pressed
  apiPaths = new Set();
  await staff.getByRole('button', { name: 'Measure plan loading' }).click();
  await staff
    .getByRole('alertdialog', { name: 'Measure plan loading?' })
    .getByRole('button', { name: 'Measure', exact: true })
    .click();

  // The page reloads and navigates by itself; nothing is touched from here to the result.
  const result = staff.locator('[data-loading-result]');
  await expect(result).toBeVisible({ timeout: 90_000 });
  await staff.waitForLoadState('networkidle');
  expect(staff.url(), 'the second limb is a navigation to a different URL').toContain(
    'reading=revisit',
  );

  // ---------------------------------------------------------------- Every limb, taken
  await expect(
    result.getByText('development build: not a reading of the live server'),
  ).toBeVisible();
  const limbs = [
    ['reload', /^Reload \(reload\): taken$/],
    ['revisit', /^Revisit \(navigate\): taken$/],
    ['network', /^From the network \(nothing cached\) \(no-store fetch\): taken$/],
  ] as const;
  for (const [name, heading] of limbs) {
    const lines = (await result.locator(`[data-limb="${name}"] li`).allTextContents()).map((l) =>
      l.trim(),
    );
    expect(lines[0], `the ${name} limb was not taken: ${lines.join(' | ')}`).toMatch(heading);

    const observed = Number(/^Code files observed: (\d+)$/.exec(lines[1] ?? '')?.[1]);
    const split =
      /^From cache: (\d+), revalidated: (\d+), downloaded: (\d+), not exposed: (\d+)$/.exec(
        lines[3] ?? '',
      );
    expect(observed, `${name}: observed count`).toBeGreaterThan(0);
    expect(split, `${name}: the split line`).not.toBeNull();
    const parts = (split ?? []).slice(1).map(Number);
    expect(
      parts.reduce((a, b) => a + b, 0),
      `${name}: cache + revalidated + downloaded + not exposed must equal the files observed`,
    ).toBe(observed);
  }
  await expect(result.locator('[data-cache-control]')).toContainText('Cache-Control');

  // The result takes focus, because a reload leaves nothing focused (ADR-0135).
  await expect(staff.getByRole('heading', { name: 'Plan loading reading' })).toBeFocused();

  // ---------------------------------------------------------------- Spec S3: no extra API request
  expect(
    [...apiPaths].sort(),
    'a press must make no API request that a plain reload of /staff does not',
  ).toEqual(baseline);

  // ---------------------------------------------------------------- The deliverable
  await expect(copy).not.toHaveAttribute('aria-disabled', 'true');
  await copy.click();
  const clipboard = await staff.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('SchedulePoint plan-screen loading reading');
  expect(clipboard).toContain('Reload (reload): taken');
  expect(clipboard).toContain('Revisit (navigate): taken');
  expect(clipboard).toContain('Cache-Control');
  expect(clipboard).toContain('Build: development build: not a reading of the live server');

  const axe = await new AxeBuilder({ page: staff })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations).toEqual([]);

  await staffContext.close();
});

/**
 * **Staff console M1 — the accessibility fixes, each in a real browser.**
 *
 * Four of the six defects are statements about what Chromium does with focus, `inert` and a 320 px
 * viewport, which jsdom has none of: that pressing a button whose handler used to unmount it drops
 * focus to `<body>`, that a live region inside an inert subtree reaches nobody, and that a button
 * with no `flex-wrap` leaves the viewport. The unit suites mount the components and cannot ask.
 *
 * **A fifth `test()` rather than an extension**, for the reason the second gives: the per-test
 * timeout is 120 s and the probe check is the long step here.
 *
 * WCAG 2.2 reflow (SC 1.4.10) is driven at 320 px even though the design targets are a desktop
 * monitor and a Surface: it is a merge requirement, not a layout.
 */
test('the console keeps focus, shading, announcements and reflow honest (M1)', async ({
  browser,
}) => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

  // **More than one page of unverified accounts, made through the real sign-up route.** A page is
  // 25 (`staff-health.service.ts`), and the database persists, so the count a previous run left is
  // not something this test may lean on: it adds its own and asserts only that the list grows.
  const seedContext = await browser.newContext();
  const stamp = Date.now();
  for (let i = 0; i < 26; i += 1) {
    const res = await seedContext.request.post('/api/auth/sign-up/email', {
      data: {
        name: `Unverified ${String(i)}`,
        email: `staff-m1-${String(stamp)}-${String(i)}@example.com`,
        password: PASSWORD,
      },
      headers: { Origin: baseURL },
    });
    expect(res.ok(), `sign-up ${String(i)} must succeed`).toBe(true);
  }
  await seedContext.close();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');
  await staff.goto('/staff');
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });

  // ---------------------------------------------------------------- M1-T1: paging keeps focus
  const accounts = staff.locator('#staff-section-accounts');
  const accountRows = accounts
    .getByRole('table', { name: 'Unconfirmed accounts, oldest first' })
    .getByRole('row');
  const showOlder = accounts.getByRole('button', { name: 'Show more' });
  await expect(showOlder).toBeVisible();
  const firstPage = await accountRows.count();
  const firstAddress = await accountRows.nth(1).textContent();

  const accountRequests: string[] = [];
  staff.on('request', (request) => {
    if (request.url().includes('/staff/accounts')) accountRequests.push(request.url());
  });

  await showOlder.focus();
  await showOlder.click();
  // The same button, still there: it is shaded and renamed rather than replaced, so focus is where
  // the reader left it. Verified red against the per-cursor query, where the whole body was swapped
  // for a spinner and `document.activeElement` was `<body>`.
  await expect(accountRows).not.toHaveCount(firstPage);
  expect(await accountRows.count(), 'the next page is appended').toBeGreaterThan(firstPage);
  await expect(accountRows.nth(1), 'the first page is still there').toHaveText(firstAddress ?? '');
  expect(
    await staff.evaluate(() => document.activeElement?.closest('#staff-section-accounts') !== null),
    'focus stayed inside the Accounts section',
  ).toBe(true);
  expect(accountRequests, 'one request for the next page, none for the first').toHaveLength(1);

  // ---------------------------------------------------------------- M1-T2: resting shading
  const copy = staff.getByRole('button', { name: 'Copy results' });
  await expect(copy).toHaveAttribute('aria-disabled', 'true');
  expect(
    await copy.evaluate((el) => getComputedStyle(el).pointerEvents),
    'a control that rests shaded must stay under the pointer so its reason can be reached (#458)',
  ).not.toBe('none');

  // ---------------------------------------------------------------- M1-T5: reflow at 320 px
  await staff.setViewportSize({ width: 320, height: 640 });
  await expect
    .poll(() => staff.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: '/staff at rest must not scroll sideways at 320 px (WCAG 1.4.10)',
    })
    .toBe(true);
  const atRest = await new AxeBuilder({ page: staff })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(atRest.violations).toEqual([]);

  // ---------------------------------------------------------------- M1-T3/T4: the overlay
  await openPerformance(staff);
  await staff.getByRole('button', { name: 'Check the probe works' }).click();
  await staff.getByRole('alertdialog').getByRole('button', { name: 'Check the probe' }).click();

  const overlay = staff.getByRole('region', { name: 'Measurement in progress' });
  await expect(overlay).toBeVisible();
  const stop = overlay.getByRole('button', { name: 'Stop' });
  await expect(stop).toBeVisible();
  await expect(overlay).toContainText('Stopping keeps what is already measured.');

  const box = await stop.boundingBox();
  const viewport = staff.viewportSize();
  expect(box, 'Stop has a box').not.toBeNull();
  expect(
    (box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= (viewport?.width ?? 0),
    `Stop is inside the 320 px viewport (box ${JSON.stringify(box)})`,
  ).toBe(true);

  // **The announcer is outside the inert subtree, and it speaks.** While the run is going `<main>` is
  // inert, which removes everything inside it from the accessibility tree, so the panel's own
  // region cannot be heard. `[data-testid="announcer"]` is a sibling of `<main>`.
  const announcer = staff.locator('[data-testid="announcer"]');
  await expect(staff.locator('main[inert]')).toHaveCount(1);
  await expect(staff.locator('main[inert] [data-testid="announcer"]')).toHaveCount(0);
  await expect(announcer).toHaveText(/^Step 1 of 4/, { timeout: 30_000 });

  const overlayAxe = await new AxeBuilder({ page: staff })
    .include('[aria-label="Measurement in progress"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(overlayAxe.violations).toEqual([]);

  // Escape is Stop. Whichever step the run is in, the sitting says it was stopped, and says it once
  // through the announcer rather than from inside the region `inert` just lifted from.
  await staff.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0, { timeout: 60_000 });
  await expect(announcer).toHaveText(/You stopped this sitting|Sitting finished/, {
    timeout: 15_000,
  });

  await staffContext.close();
});

/**
 * **Staff console M3 — the grouped page, read and acted on (ADR-0081, ADR-0178).**
 *
 * The milestone's entry points are the "On this page" list, the status rows, **Refresh** and a
 * condition's **How to fix**, and none of them can be seen by a unit suite: each is a statement
 * about where a real browser puts focus, what a real cache requests and what a real audit table
 * records.
 *
 * **This suite's server has a mail transport (the SMTP sink) and an armed sweep, and no alert URL.**
 * So the standing condition available to act on is *Alerts* (`MAIL_ALERT_URL`), not the plan's
 * "no transport" recipe, which would mean a second server configuration — a new Playwright config,
 * which ADR-0105 says needs a spec. The shape asserted is the same.
 *
 * **The audit cost is read back from the server, not inferred from the requests.** Every read of a
 * staff panel writes a `staff.panel_read` row to a table that refuses `DELETE`, so "exactly six per
 * Refresh" is asserted twice: by counting the browser's requests, and by diffing the activity list
 * (the Staff activity table collapses consecutive reads into one row, so it cannot be counted by
 * eye).
 */
test('a staff member reads the console by group and acts on a condition', async ({ browser }) => {
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');

  const SIX = [
    '/staff/health',
    '/staff/csp-reports',
    '/staff/accounts',
    '/staff/installation',
    '/staff/activity',
    '/staff/probe-results',
  ];
  let requests: string[] = [];
  staff.on('request', (request) => {
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path.startsWith('/staff/') && !path.endsWith('/staff/me')) requests.push(path);
  });
  const countOf = (path: string): number => requests.filter((p) => p === path).length;

  await staff.goto('/staff');
  await expect(
    staff.getByRole('heading', { name: 'Staff console' }),
    'the first test verifies this account; this one assumes it',
  ).toBeVisible({ timeout: 30_000 });
  await expect(staff.getByText(/^Read at /)).toBeVisible({ timeout: 30_000 });

  // ------------------------------------------------ A load is six reads, and never the diagnostics
  for (const path of SIX) expect(countOf(path), `${path} on load`).toBe(1);
  expect(countOf('/staff/diagnostics'), 'arriving must not run the diagnostics').toBe(0);

  // ------------------------------------------------------------------ The groups, in order
  const h2s = await staff.locator('main h2').allTextContents();
  expect(h2s.map((text) => text.trim())).toEqual([
    'Status',
    'Conditions',
    'This installation',
    'Tools',
    'Record',
  ]);

  // SC-12: the rows keep the page's order. Printed as well as asserted, so the measured reading of
  // the state this suite's server is in is on record.
  const rowOrder = await staff
    .getByRole('region', { name: 'Status' })
    .getByRole('link')
    .allTextContents();
  console.warn(`status row order: ${rowOrder.join(' | ')}`);
  expect(rowOrder).toEqual([
    'Mail delivery',
    'Clearing old records',
    'Browser security reports',
    'Unconfirmed accounts',
    'Alerts',
  ]);

  // ----------------------------------------------- A status row moves focus to the box that answers
  await staff.getByRole('region', { name: 'Status' }).getByRole('link', { name: 'Alerts' }).click();
  const alerts = staff.locator('#staff-section-alerting');
  await expect(alerts).toBeFocused();

  // The setting name is behind How to fix and nowhere else, and it is absent from the DOM until the
  // control is pressed (it is `hidden`, not `sr-only`).
  await expect(alerts).toContainText('Off: nobody is told when emails fail');
  expect(await alerts.textContent()).not.toContain('MAIL_ALERT_URL');
  const howToFix = alerts.getByRole('button', { name: 'How to fix' });
  await expect(howToFix).toHaveAttribute('aria-expanded', 'false');
  await howToFix.click();
  await expect(howToFix).toHaveAttribute('aria-expanded', 'true');
  await expect(alerts.getByText('MAIL_ALERT_URL')).toBeVisible();

  // --------------------------------------------------- The nav moves focus to a group, and back up
  await staff
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: 'Tools' })
    .click();
  await expect(staff.locator('#staff-group-tools')).toBeFocused();
  await staff.locator('#staff-group-tools').getByRole('link', { name: 'Back to top' }).click();
  await expect(staff.locator('#staff-top')).toBeFocused();

  // ------------------------------------------------------------------ Refresh: six reads, six rows
  const readTime = async (): Promise<string> =>
    (await staff.locator('time[datetime]').first().getAttribute('datetime')) ?? '';
  const panelReads = async (): Promise<string[]> => {
    const res = await staff.request.get('/api/v1/staff/activity');
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as unknown;
    const rows = (Array.isArray(body) ? body : (body as { data: unknown[] }).data) as {
      id: string;
      action: string;
    }[];
    return rows.filter((row) => row.action === 'staff.panel_read').map((row) => row.id);
  };

  await expect(staff.getByText('Each refresh is recorded in Staff activity.')).toBeVisible();
  const before = await panelReads();
  const timeBefore = await readTime();
  requests = [];

  const refresh = staff.getByRole('button', { name: 'Refresh' });
  await refresh.focus();

  // **Make a box's sentence move, or the silence below proves nothing.** Staff activity is capped
  // at 50 and a Refresh adds six rows to it, so on a busy host its count never changes and "no box
  // spoke" would pass whatever the mute did. The real response is fetched and served back with one
  // entry removed, so the sentence goes from N to N - 1.
  const countBefore = Number(
    /Staff activity: (\d+) entries\./.exec(
      (await staff.getByText(/^Staff activity: \d+ entries\.$/).textContent()) ?? '',
    )?.[1],
  );
  expect(countBefore, 'the Activity box states a count').toBeGreaterThan(0);
  await staff.route('**/api/v1/staff/activity**', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as unknown;
    const trimmed = Array.isArray(body)
      ? body.slice(0, -1)
      : { ...(body as { data: unknown[] }), data: (body as { data: unknown[] }).data.slice(0, -1) };
    await route.fulfill({ response, json: trimmed });
  });
  // Records any text change inside a box's own live region, from the click to the end of the window.
  await staff.evaluate(() => {
    const spoken: string[] = [];
    const page: string[] = [];
    (window as unknown as { __boxSpeech: string[] }).__boxSpeech = spoken;
    (window as unknown as { __pageSpeech: string[] }).__pageSpeech = page;
    new MutationObserver((records) => {
      for (const record of records) {
        const element =
          record.target instanceof Element ? record.target : record.target.parentElement;
        const region = element?.closest('[aria-live="polite"]');
        if (region?.getAttribute('data-testid') === 'announcer') {
          if (region.textContent) page.push(region.textContent);
        } else if (region) {
          spoken.push(region.textContent ?? '');
        }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await refresh.click();
  await expect(staff.locator('[data-testid="announcer"]')).toHaveText(/^Refreshed\./, {
    timeout: 30_000,
  });
  await expect(refresh).toBeFocused();
  // One polite sentence per Refresh (ADR-0178 D8): the page announcer holds it and no box's own
  // region does. Read a beat later, so a box that speaks late (the mute ending too early) is caught.
  await staff.waitForTimeout(500);
  await staff.unroute('**/api/v1/staff/activity**');
  await expect(
    staff.getByText(`Staff activity: ${String(countBefore - 1)} entries.`),
    'the sentence moved, and is reachable as plain text',
  ).toBeVisible();
  expect(
    await staff.evaluate(() => (window as unknown as { __boxSpeech: string[] }).__boxSpeech),
    'no box speaks on Refresh',
  ).toEqual([]);
  expect(
    new Set(
      await staff.evaluate(() => (window as unknown as { __pageSpeech: string[] }).__pageSpeech),
    ).size,
    'the page announcer spoke one sentence',
  ).toBe(1);
  for (const path of SIX) expect(countOf(path), `${path} on Refresh`).toBe(1);
  expect(countOf('/staff/diagnostics'), 'Refresh must never run the diagnostics').toBe(0);
  expect(await readTime(), 'the header time moved').not.toBe(timeBefore);

  const after = await panelReads();
  // The diff's own read (the `before` fetch) is one of the new rows: it landed after `before` was
  // listed. Six from Refresh plus that one is seven, and `after` itself is not in its own list.
  const fresh = after.filter((id) => !before.includes(id));
  expect(
    fresh,
    'exactly six audited reads for one Refresh, plus the one the diff made',
  ).toHaveLength(7);

  // ---------------------------------------- One failed read: both boxes say so, one button heals them
  await staff.route('**/api/v1/staff/health', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{}}' }),
  );
  await refresh.click();
  const tryAll = staff.getByRole('button', { name: 'Try again for all' });
  await expect(tryAll).toBeVisible({ timeout: 30_000 });
  await expect(staff.getByText(/box(es)? could not be read/)).toBeVisible();
  await staff.unroute('**/api/v1/staff/health');
  await tryAll.click();
  await expect(tryAll).toHaveCount(0, { timeout: 30_000 });
  await expect(staff.getByText('Working: none failed in the last 24 hours').first()).toBeVisible();

  // ------------------------------------------- `/staff#performance` opens the box and focuses it
  await staff.setViewportSize({ width: 1280, height: 800 });
  await staff.goto('/staff#performance');
  await expect(
    staff.getByRole('region', { name: 'Performance' }).getByRole('button', {
      name: 'Hide performance tools',
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(staff.locator('#performance')).toBeFocused();

  // ------------------------------------------------------------------------ Axe, at both widths
  // With the Performance box open, so the controls, the history and the plan-loading section are in
  // the page the scan and the reflow assertion read.
  for (const width of [1280, 320]) {
    await staff.setViewportSize({ width, height: 800 });
    await expect
      .poll(() => staff.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
        message: `/staff must not scroll sideways at ${String(width)} px (WCAG 1.4.10)`,
      })
      .toBe(true);
    const axe = await new AxeBuilder({ page: staff })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(axe.violations, `axe at ${String(width)} px`).toEqual([]);
  }

  await staffContext.close();
});
