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
 *
 * PRE-ENABLEMENT GATE (M5 5.2, a11y sign-off): before setting VITE_TSLD_EDITING
 * true outside dev/test, manually confirm in Chrome, Firefox, Safari and Edge
 * that the `Alt+←/→` time-nudge does NOT trigger native Back/Forward history
 * navigation (preventDefault is the mitigation, but browser-chrome accelerators
 * aren't guaranteed suppressible everywhere). Tracked in docs/TECH_DEBT.md #25.
 */
export const TSLD_EDITING_ENABLED = flag(import.meta.env.VITE_TSLD_EDITING);

/**
 * The plan edit-lock "pen" front-end layer (ADR-0028, edit-lock M2). OFF by
 * default so the pen ships **inert** — the mirror of the backend's
 * `PLAN_EDIT_LOCK_ENFORCED`. With the flag off, `usePlanPen` reports
 * `penManaged: false`: the lock-status query never polls, no heartbeat runs, the
 * `EditLockBanner` renders nothing, and schedule-editing affordances fall back to
 * today's role-only gating — current behaviour byte-for-byte.
 *
 * ROLLOUT ORDERING (ADR-0028 §9): enable `VITE_PLAN_EDIT_LOCK` in an environment
 * FIRST — users then acquire the pen on every editing entry point (harmless while
 * the backend still accepts non-holder writes) — and only THEN flip
 * `PLAN_EDIT_LOCK_ENFORCED` on the API. Flipping enforcement first would 423 the
 * shipped activities-table / dependency / recalculate flows.
 */
export const PLAN_EDIT_LOCK_ENABLED = flag(import.meta.env.VITE_PLAN_EDIT_LOCK);
