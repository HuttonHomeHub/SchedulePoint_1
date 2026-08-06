import { expect, type Page } from '@playwright/test';

/** Helpers for the flag-ON chrome-band suite (ADR-0055 S2) — a sibling of `e2e-designed-ui`. */

/** The picker's four options — see `hooks/use-theme.tsx`. */
export type ThemeChoice = 'light' | 'dark' | 'system' | 'corporate';

const THEME_STORAGE_KEY = 'schedulepoint-theme';

/**
 * Choose a theme the way a returning user has one: written to storage before the app boots,
 * so the very first paint is the theme under test. Setting it after load would scan a shell
 * that had already rendered (and been measured) in the default.
 */
export async function setTheme(page: Page, theme: ThemeChoice): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [THEME_STORAGE_KEY, theme] as const,
  );
}

/** Sign up + create an organisation; returns the org slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `chrome-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Chrome Tester');
  await page.getByLabel('Email').fill(`chrome-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Chrome Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client, so the Project Explorer has a row to render (and to hover). */
export async function createClient(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('link', { name })).toBeVisible();
}

/** The computed foreground/background pair of an element, as `rgb()` strings. */
export interface ComputedPair {
  color: string;
  background: string;
}

/**
 * The page-side resolver, shared by {@link computedPair} and {@link computedPairOf}.
 *
 * Two things it has to get right, both learned the hard way:
 *
 * 1. `getComputedStyle().color` returns the colour **as authored** — our tokens are OKLCH, so
 *    it hands back `oklch(0.556 0 0)`. Reading three numbers out of that and treating them as
 *    sRGB channels yields a ratio near 1:1 for every pair, which would make the whole suite
 *    pass vacuously. So each colour is painted into a 1×1 canvas and read back as real pixels
 *    — whatever the browser actually renders is what gets measured.
 * 2. Nearly every element is `transparent`, so the backdrop has to be found by walking up.
 *    Compositing the ink over that backdrop then also handles translucent inks correctly.
 */
/** Paint a CSS colour over a backdrop and read the rendered pixel — the ground truth. */
async function toRgb(page: Page, colour: string, backdrop?: string): Promise<string> {
  return page.evaluate(
    ([value, under]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      if (under !== undefined) {
        ctx.fillStyle = under;
        ctx.fillRect(0, 0, 1, 1);
      }
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${r}, ${g}, ${b})`;
    },
    [colour, backdrop] as const,
  );
}

async function renderPair(page: Page, raw: ComputedPair): Promise<ComputedPair> {
  const background = await toRgb(page, raw.background, 'rgb(255, 255, 255)');
  return { background, color: await toRgb(page, raw.color, background) };
}

/**
 * Read an element's ink and the first opaque fill behind it, both as rendered pixels.
 */
export async function computedPair(page: Page, selector: string): Promise<ComputedPair> {
  const raw = await page.evaluate((css) => {
    const element = document.querySelector(css);
    if (!element) throw new Error(`no element matches ${css}`);
    let backdrop = 'rgb(255, 255, 255)';
    for (let node: Element | null = element; node; node = node.parentElement) {
      const fill = getComputedStyle(node).backgroundColor;
      if (fill && fill !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(fill)) {
        backdrop = fill;
        break;
      }
    }
    return { color: getComputedStyle(element).color, background: backdrop };
  }, selector);
  return renderPair(page, raw);
}

/** As {@link computedPair}, for a pair already read from the page (e.g. via a Playwright locator). */
export async function resolvePair(page: Page, raw: ComputedPair): Promise<ComputedPair> {
  return renderPair(page, raw);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: string): number {
  const parts = rgb.match(/[\d.]+/g);
  if (!parts || parts.length < 3) throw new Error(`unparseable colour "${rgb}"`);
  const [r, g, b] = parts.map(Number) as [number, number, number];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between a computed pair. */
export function contrast(pair: ComputedPair): number {
  const a = luminance(pair.color);
  const b = luminance(pair.background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Create a project under the currently-open client and open its detail screen. */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: /^Band Client/ }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name }).click();
}

/** Create a plan under the currently-open project and open it — this mounts the toolbar. */
export async function createPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name }).click();
}
