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

/**
 * Reads a boolean `VITE_` flag that defaults **ON**: enabled unless the operator
 * explicitly opts out with `"false"`/`"0"`. Used for shipped features that are on
 * by default but must stay switchable off (rollback / a controlled rollout).
 */
function flagDefaultOn(value: string | undefined): boolean {
  return value !== 'false' && value !== '0';
}

/**
 * Reads a boolean `VITE_` flag that defaults **OFF**: disabled unless the operator
 * explicitly opts in with `"true"`/`"1"`. Used while a feature is still being built
 * up behind a flag so `main` stays releasable (flag-off = the prior behaviour).
 */
function flagDefaultOff(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/**
 * On-canvas TSLD structural editing (M2). **ON by default** (2026-07-12) now that
 * every pre-enablement gate is green — see below. Set `VITE_TSLD_EDITING=false` to
 * fall back to the M1 read-only surface, byte-for-byte (rollback / opt-out).
 *
 * CONCURRENCY PRECONDITION — MET. The plan edit-lock (ADR-0028) has landed: the
 * `features/plan-lock` "pen" (behind {@link PLAN_EDIT_LOCK_ENABLED}, also on by
 * default) makes a Planner take an exclusive lock before the canvas editing
 * affordances go live. NB the server-side write-gate `PLAN_EDIT_LOCK_ENFORCED`
 * remains **default-off** and is enabled by config as a separate, deliberate step
 * AFTER the web pen is confirmed deployed (ADR-0028 §9 rollout ordering) — never
 * flip enforcement ahead of the web bundle or non-holder writes would 423.
 *
 * PRE-ENABLEMENT GATES — ALL GREEN. The `Alt+←/→` time-nudge must NOT trigger
 * native Back/Forward history navigation (preventDefault is the mitigation, but
 * browser-chrome accelerators aren't guaranteed suppressible everywhere): asserted
 * automatically on **Chromium** by the flag-on Playwright suite (`keyboard-edit.spec.ts`
 * via `pnpm --filter @repo/web test:e2e:edit`) and MANUALLY CONFIRMED PASSING on
 * **Firefox / Safari / Edge** (2026-07-12, docs/TECH_DEBT.md #25a). Procedure:
 * docs/runbooks/tsld-editing-enablement.md.
 */
export const TSLD_EDITING_ENABLED = flagDefaultOn(import.meta.env.VITE_TSLD_EDITING);

/**
 * The plan edit-lock "pen" front-end layer (ADR-0028, edit-lock M2). **ON by
 * default** (2026-07-12). Set `VITE_PLAN_EDIT_LOCK=false` to ship the pen inert:
 * `usePlanPen` then reports `penManaged: false` — the lock-status query never polls,
 * no heartbeat runs, the `EditLockBanner` renders nothing, and schedule-editing
 * affordances fall back to role-only gating (rollback / opt-out).
 *
 * ROLLOUT ORDERING (ADR-0028 §9): the web pen is on by default; the API's
 * `PLAN_EDIT_LOCK_ENFORCED` is NOT (it stays a deliberate config switch). Keep that
 * order — enable enforcement only once a bundle with the pen on is live, so users
 * are already acquiring the pen on every editing entry point (harmless while the
 * backend still accepts non-holder writes). Flipping enforcement first would 423 the
 * activities-table / dependency / recalculate flows.
 */
export const PLAN_EDIT_LOCK_ENABLED = flagDefaultOn(import.meta.env.VITE_PLAN_EDIT_LOCK);

/**
 * The persistent app-shell + hierarchy navigator (ADR-0029). **ON by default** now
 * that M1 (shell) and M2 (the accessible Client → Project → Plan tree) have landed
 * with their journeys and a11y gates green — the mounted-once shell (top bar +
 * collapsible/resizable Project Explorer rail + single workspace region) is the
 * default navigation surface. Set `VITE_NAV_TREE=false` to fall back to the previous
 * header-only layout, byte-for-byte (emergency rollback / opt-out).
 */
export const NAV_TREE_ENABLED = flagDefaultOn(import.meta.env.VITE_NAV_TREE);

/**
 * In-tree CRUD for the Project Explorer (ADR-0029 Phase 2). **OFF by default**
 * while the create/rename/delete affordances are built up slice by slice; set
 * `VITE_NAV_TREE_CRUD=true` to opt in. Flag-off is exactly today's navigation-only
 * tree (no context menu, no "⋯" trigger, no root "New client" control), so `main`
 * stays releasable throughout the rollout. Gated additionally by write RBAC — even
 * on, Contributors/Viewers see a read-only tree. Flipped default-on in the final
 * rollout task once every journey + a11y gate is green.
 */
export const NAV_TREE_CRUD_ENABLED = flagDefaultOff(import.meta.env.VITE_NAV_TREE_CRUD);
