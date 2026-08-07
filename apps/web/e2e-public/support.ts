import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The measured vocabulary of the public-screens layout suite (ADR-0077 M6-T1).
 *
 * Everything here is a **measurement helper**, not a driver. The suite's whole claim is that the six
 * pre-authentication routes hold their layout invariants at every size in every theme, and a claim
 * like that is worth exactly as much as the assertion that computes it.
 */

/**
 * The six viewports, and why each one is in the list.
 *
 * `320 × 568` is the WCAG 1.4.10 reflow floor and the size that caught the guest view
 * (`docs/TECH_DEBT.md` #98). `640 × 360` is a phone held **sideways** — the case that breaks a
 * vertically-centred `min-h-dvh` card, because the content is taller than the viewport and the
 * centring pushes its top edge above zero where it cannot be scrolled to. `768 × 1024` is the `md`
 * boundary itself (Tailwind v4's `md` is 48rem = 768px), so it is the first width at which the
 * brand panel becomes a column rather than a band. The other three are ordinary phone, tablet
 * landscape and laptop.
 */
export const VIEWPORTS = [
  { name: '320×568 (reflow floor)', width: 320, height: 568 },
  { name: '640×360 (phone landscape)', width: 640, height: 360 },
  { name: '375×812 (phone)', width: 375, height: 812 },
  { name: '768×1024 (md boundary)', width: 768, height: 1024 },
  { name: '1024×768 (tablet landscape)', width: 1024, height: 768 },
  { name: '1440×900 (laptop)', width: 1440, height: 900 },
] as const;

/**
 * The three **rendered** themes.
 *
 * The picker offers four, but `system` resolves to Light or Dark before anything paints
 * (`hooks/use-theme.tsx`), so it adds no fourth rendering and testing it would only be testing
 * `matchMedia`.
 */
export const THEMES = ['light', 'dark', 'corporate'] as const;
export type Theme = (typeof THEMES)[number];

/** The Tailwind `md` breakpoint, in pixels — the width at which the panel becomes a column. */
export const MD = 768;

/**
 * A public state this suite can reach from a URL alone, with the heading that identifies it and the
 * control a reader is meant to press.
 *
 * These ten are the **driven** states. `public-screens.spec.ts`'s closing docblock lists what is
 * synthesised and what is not covered at all — a suite that quietly measures ten of thirty-three
 * while reading as though it measured all of them is the defect class this repository keeps naming.
 */
export const URL_STATES = [
  { path: '/sign-in', heading: 'Sign in', primary: 'Sign in' },
  { path: '/sign-up', heading: 'Create an account', primary: 'Create an account' },
  { path: '/forgot-password', heading: 'Reset your password', primary: 'Send a reset link' },
  { path: '/reset-password', heading: 'That link is no longer valid', primary: 'Send a new link' },
  {
    path: '/reset-password?token=e2e',
    heading: 'Choose a new password',
    primary: 'Set new password',
  },
  {
    path: '/verify-email',
    heading: 'Verify your email',
    primary: 'Send another verification email',
  },
  { path: '/verify-email?verified=1', heading: 'Email verified', primary: 'Sign in' },
  {
    path: '/verify-email?error=TOKEN_EXPIRED',
    heading: 'That link did not work',
    primary: 'Send another verification email',
  },
  { path: '/accept-invite', heading: 'Invitation not found', primary: 'Sign in' },
  {
    path: '/accept-invite?token=e2e-no-such-token',
    heading: 'Invitation not found',
    primary: 'Sign in',
  },
] as const;

/**
 * Pin the rendered theme for every navigation in this page's context.
 *
 * **Before load, and that is not a detail.** `public/theme-boot.js` is parser-blocking by design —
 * it reads `localStorage` and stamps the root class before first paint, which is what makes the
 * anti-flash guarantee hold. Writing the key after `goto` would measure the theme the *previous*
 * navigation resolved.
 */
export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('schedulepoint-theme', value);
  }, theme);
}

/** The class the boot script stamps on `<html>` for each theme (Light is the unclassed default). */
const ROOT_CLASS: Record<Theme, string | null> = {
  light: null,
  dark: 'dark',
  corporate: 'corporate',
};

/** Assert the theme actually rendered, so a sweep cannot silently measure Light three times. */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  const classes = await page.evaluate(() => document.documentElement.className);
  const expected = ROOT_CLASS[theme];
  if (expected === null) {
    expect(classes, `theme ${theme}`).not.toMatch(/\b(dark|corporate)\b/);
  } else {
    expect(classes, `theme ${theme}`).toContain(expected);
  }
}

/**
 * The layout contract every landable public state holds, at every size, in every theme.
 *
 * `label` is threaded into each message because a failure inside a 180-cell sweep that says only
 * "expected 436 to be less than or equal to 320" costs a bisect to locate.
 */
export async function expectPublicLayout(
  page: Page,
  label: string,
  options: { primary: string; width: number },
): Promise<void> {
  const { width } = options;
  // 1. No horizontal scroll — WCAG 1.4.10 reflow. The direct measurement, and the one that caught
  //    the guest view at 436px against a 320px viewport (TECH_DEBT #98).
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(innerWidth);

  // 2. One page, one heading. The invariant `auth-shell-assertions.ts` holds in jsdom, re-asserted
  //    where CSS exists — a `hidden md:flex` / `md:hidden` responsive pair renders one copy in a
  //    browser and *two* in jsdom, so the unit assertion and this one fail in opposite worlds.
  await expect(page.locator('main'), `${label}: main landmarks`).toHaveCount(1);
  await expect(page.locator('h1'), `${label}: h1 count`).toHaveCount(1);

  // 3. The brand lockup: exactly one in the document, and **none in the accessibility tree**.
  //    The plan asked for "exactly once in the accessibility tree"; M4 then decided the panel is
  //    `aria-hidden` (the same three decorative facts on all six screens, already carried by
  //    `<title>` and the heading), so the honest pair is one node and zero roles. `getByRole`
  //    applies `aria-hidden`; `locator` does not — which is what makes these two lines a test of
  //    the decision rather than a restatement of the markup.
  await expect(page.locator('aside'), `${label}: brand panel nodes`).toHaveCount(1);
  await expect(page.getByRole('complementary'), `${label}: panel in a11y tree`).toHaveCount(0);
  await expect(page.getByText('SchedulePoint', { exact: true }), `${label}: lockups`).toHaveCount(
    1,
  );

  // 4. The primary action is reachable and nothing covers it. A tall state must **scroll**, not
  //    clip — the 640×360 landscape case, where a vertically-centred card can push its own top
  //    edge above the scrollable area.
  const primary = page
    .getByRole('button', { name: options.primary, exact: true })
    .or(page.getByRole('link', { name: options.primary, exact: true }));
  await expect(primary, `${label}: primary action`).toHaveCount(1);
  await primary.scrollIntoViewIfNeeded();
  await expect(primary, `${label}: primary in viewport`).toBeInViewport();
  const covered = await primary.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit === null || !(el === hit || el.contains(hit));
  });
  expect(covered, `${label}: primary action is covered by another element`).toBe(false);

  // 5. The panel's proportion, which is the whole responsive decision. Below `md` it is a band
  //    **above** the card; at `md` and up it is a column **beside** it. Compared against the `h1`'s
  //    own box rather than a class name, because a class says what was written and a box says what
  //    the browser did.
  const aside = await page.locator('aside').boundingBox();
  const heading = await page.locator('h1').boundingBox();
  expect(aside, `${label}: panel box`).not.toBeNull();
  expect(heading, `${label}: heading box`).not.toBeNull();
  if (aside && heading) {
    if (width < MD) {
      expect(
        aside.y + aside.height,
        `${label}: panel should be a band above the card`,
      ).toBeLessThanOrEqual(heading.y + 1);
    } else {
      expect(
        aside.x + aside.width,
        `${label}: panel should be a column beside the card`,
      ).toBeLessThanOrEqual(heading.x + 1);
    }
  }

  // 6. Below `md` the panel is a **band**, and a band carries the lockup only — spec §2.1 US-1.
  //    Both the motif and the tagline are `hidden md:block`. This assertion caught the tagline
  //    rendering at every width (the code disagreed with the approved criterion and nothing gated
  //    it, because jsdom has no breakpoints).
  const motif = page.locator('aside svg');
  const tagline = page.locator('aside p');
  if (width < MD) {
    await expect(motif, `${label}: motif below md`).toBeHidden();
    await expect(tagline, `${label}: tagline below md`).toBeHidden();
  } else {
    await expect(motif, `${label}: motif at md+`).toBeVisible();
    await expect(tagline, `${label}: tagline at md+`).toBeVisible();
  }

  // 7. …and a band is sized by its content, not by the leftover height of the screen.
  //    **Measured**: the band's content is 76px; in the M4 layout it stretched to 226–265px on a
  //    568px-tall phone — 47% of the screen — on every state short enough to leave slack. The bound
  //    is 25% of the viewport rather than a pixel count, because what the reader experiences is the
  //    *proportion* of their screen spent on decoration; at the two tightest sizes in the sweep that
  //    is 142px (320×568) and 90px (640×360) against a 76px band.
  if (width < MD && aside) {
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(
      aside.height,
      `${label}: brand band is stretched, not content-sized`,
    ).toBeLessThanOrEqual(viewportHeight * 0.25);
  }

  // 8. The card **floats** — M7's whole point, and the one thing a class name cannot tell you.
  //    `w-full max-w-[900px]` inside `p-4` means a bounded card with ground visible either side at
  //    every width in the sweep, not a full-bleed split. Measured as a box, so a later `max-w-none`
  //    or a lost gutter fails here rather than being noticed by a reader.
  const card = await page.locator('main').boundingBox();
  expect(card, `${label}: card box`).not.toBeNull();
  if (card) {
    expect(card.width, `${label}: card wider than the old app's 900px`).toBeLessThanOrEqual(901);
    expect(card.x, `${label}: card touches the left edge`).toBeGreaterThanOrEqual(1);
    expect(card.x + card.width, `${label}: card touches the right edge`).toBeLessThanOrEqual(
      innerWidth - 1,
    );
  }
}

/**
 * The rendered height of the card, for the assertion that it does not change between screens.
 *
 * Returns `null` if the card is not laid out, which a caller should treat as a failure rather than
 * a skip — a missing box means the page did not render, not that the invariant held.
 */
export async function cardHeight(page: Page): Promise<number | null> {
  const box = await page.locator('main').boundingBox();
  return box === null ? null : box.height;
}

/** The full rendered height of the document — what "the tallest state" means when it is measured. */
export async function contentHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

/** Sign up a fresh account and create an organisation with the given name; returns nothing. */
export async function onboard(page: Page, email: string, orgName: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Public Screens Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeHidden();
}

/**
 * Invite an address from the members screen and return the invitation URL.
 *
 * Read from the dialog's own read-only "Invitation link" field rather than from the API response,
 * because that field is the only place a real inviter ever sees it — if it stopped rendering the
 * URL, a suite reading the API would still pass.
 */
export async function inviteAndCaptureUrl(page: Page, email: string): Promise<string> {
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await page
    .getByRole('button', { name: /invite/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('button', { name: /send invitation|invite/i }).click();
  const field = dialog.getByLabel('Invitation link');
  await expect(field).toBeVisible();
  const url = await field.inputValue();
  expect(url, 'invitation link').toContain('token=');
  return url;
}

/** The `?token=…` path of an invitation URL, relative to `baseURL`. */
export function invitePath(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/**
 * Sign out through the app shell, leaving the browser on a signed-out session.
 *
 * **This helper shipped broken and unused.** Its locator guessed at three accessible names
 * (`account menu`, `open user menu`, and the literal name of one test's organisation) and the
 * control carries none of them — it is `aria-label={`Account: ${email}`}` (`account-chip.tsx:74`).
 * Nothing caught that because until ADR-0077 §9 added the sign-out confirmation journey, **no test
 * called it**: an unused helper is not a tested one, and a locator that matches nothing fails only
 * on the day somebody relies on it. Anchored on the real label now, and on `^Account:` rather than
 * the whole string so it does not become a second place the test's email address has to be spelt.
 */
export async function signOut(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

/** Locator for the single `<h1>`, for the states whose heading carries server-supplied text. */
export function heading(page: Page): Locator {
  return page.locator('h1');
}
