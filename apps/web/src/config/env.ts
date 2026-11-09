/**
 * Typed, validated access to the client runtime configuration. Only
 * `VITE_`-prefixed variables reach the browser bundle; never put secrets here
 * (see SECURITY.md). Access config through this module — never `import.meta.env`
 * scattered across the code (docs/FRONTEND_ARCHITECTURE.md → Configuration).
 */

/**
 * Base path for the API. Relative by default so requests are same-origin
 * (cookies flow, no CORS): Vite proxies `/api` to the backend in dev, and nginx
 * proxies it in production.
 */
export const API_BASE_URL = '/api/v1';

/** Base path for the Better Auth handler (sign-in/up/out/session). */
export const AUTH_BASE_URL = '/api/auth';

/** Legacy local-storage key of the withdrawn theme preference; `ThemeProvider` only deletes it (ADR-0097). */
export const THEME_STORAGE_KEY = 'schedulepoint-theme';

/**
 * The web client's own build version, baked in at compile time by Vite's `define`
 * ({@link __APP_VERSION__}, see `vite.config.ts`). Shown next to the API's version in
 * the app shell; a compile-time constant needs no runtime env var and can't drift.
 */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * Reads a boolean `VITE_` flag that defaults **ON**: enabled unless built with
 * `"false"`/`"0"`. Build-time only: a `VITE_` constant is inlined into the bundle, so no published
 * image can switch one off (ADR-0088 D1) and a flag is a temporary seam, never a rollback.
 */
export function flagDefaultOn(value: string | undefined): boolean {
  return value !== 'false' && value !== '0';
}

/**
 * Reads a boolean `VITE_` flag that defaults **OFF**: enabled only when the operator explicitly
 * opts in with `"true"`/`"1"`. Every flag in this file starts here, and moves to
 * {@link flagDefaultOn} in its own enablement task once its gates are green.
 *
 * **It has no consumer right now**, and that is the normal resting state of this helper rather than
 * a sign it is dead: every flag passes through it for the length of one epic and then leaves.
 * The last flag to leave it moved to {@link flagDefaultOn}, and the next flag will
 * need it on day one. Covered by `env.test.ts` regardless of consumers, including the case-sensitivity
 * that makes `"TRUE"` read as off — so it cannot rot unnoticed between epics.
 *
 * Do not delete it as dead code, and do not describe a specific consumer here: a named consumer is
 * a fact with a short half-life, and the last one to be written down was corrupted by a later edit
 * into two spliced halves naming five long-closed debt items, noticed only when it went away.
 */
export function flagDefaultOff(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
