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

/** Local-storage key for the persisted theme preference. */
export const THEME_STORAGE_KEY = 'schedulepoint-theme';

/** Reads a boolean `VITE_` flag (`"true"`/`"1"` → true), defaulting off. */
function flag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/**
 * On-canvas TSLD structural editing (M2). OFF by default: there is no plan
 * edit-lock yet, so on-canvas editing stays flagged until concurrency is
 * hardened (interim posture: optimistic-lock version-409 conflict banner, see
 * docs/design/tsld-m2-editing.md). With the flag off the diagram is the M1
 * read-only surface, byte-for-byte.
 */
export const TSLD_EDITING_ENABLED = flag(import.meta.env.VITE_TSLD_EDITING);
