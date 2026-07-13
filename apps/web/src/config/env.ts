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
 * Reads a boolean `VITE_` flag that defaults **OFF**: enabled only when the operator
 * explicitly opts in with `"true"`/`"1"`. Used for in-progress features whose quality
 * gates (a11y, e2e, perf) are not yet green — the feature ships dark on `main` and is
 * turned on per-environment during rollout, then flipped default-on once cleared
 * (how `VITE_NAV_TREE` / `VITE_TSLD_EDITING` each began).
 */
export function flagDefaultOff(value: string | undefined): boolean {
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
 * In-tree CRUD for the Project Explorer (ADR-0029 Phase 2). **ON by default**
 * (2026-07-12) now that the create/rename/delete affordances, the specialist-review
 * a11y fixes, and the flag-on Playwright journeys (`e2e/navigator-crud.spec.ts`) are
 * all green. Writers (Planner/Org Admin) get the row context menu (⋯ button,
 * right-click, ContextMenu/Shift+F10 key, touch long-press) and the rail-header
 * "New client" control; Contributors/Viewers keep a read-only tree (additional write
 * RBAC gate). Set `VITE_NAV_TREE_CRUD=false` to fall back to the navigation-only tree,
 * byte-for-byte (rollback / opt-out).
 */
export const NAV_TREE_CRUD_ENABLED = flagDefaultOn(import.meta.env.VITE_NAV_TREE_CRUD);

/**
 * Canvas-first plan workspace (ADR-0030, spec `docs/specs/canvas-first-plan-workspace.md`).
 * **ON by default** now that the M5 quality gates are green — the a11y/ux/perf review findings
 * are folded in, the flag-on Playwright journey (`e2e-workspace/workspace.spec.ts` via
 * `pnpm --filter @repo/web test:e2e:workspace`) is wired into CI, and the 538 unit tests pass.
 * When on, opening a plan renders the TSLD canvas as the primary workspace surface (filling the
 * shell's workspace region) with the activity table as a draggable, collapsible bottom panel.
 * Set `VITE_CANVAS_WORKSPACE=false` to fall back to the legacy long stacked plan-detail page,
 * byte-for-byte (emergency rollback / opt-out).
 */
export const CANVAS_WORKSPACE_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_WORKSPACE);

/**
 * Canvas-maximal chrome reclaim + the future-proof Toolbar architecture (ADR-0031, spec
 * `docs/specs/canvas-toolbar-architecture.md`). **ON by default** (2026-07-13) now that the M5
 * quality gates are green — the a11y (3 WCAG 2.2 AA blockers), ux, perf and component review
 * findings are folded in, the flag-on Playwright journey (`e2e-toolbar/toolbar.spec.ts` via
 * `pnpm --filter @repo/web test:e2e:toolbar`) is wired into CI, and the 597 unit tests pass. When
 * on, the plan workspace collapses the ADR-0030 stacked chrome bands into a slim header + a single
 * registry-driven `Toolbar` row over a full-height canvas (activities panel collapsed by default,
 * Diagram/Activities pane switch below `md`), moving secondary info into `View`/`Summary`/`Legend`
 * popovers and the `⋯` overflow. Layers on {@link CANVAS_WORKSPACE_ENABLED} (ADR-0030) — meaningful
 * only when the canvas-first workspace is on. Set `VITE_CANVAS_TOOLBAR=false` to fall back to the
 * ADR-0030 workspace, byte-for-byte (emergency rollback / opt-out). Remaining fast-follows: TECH_DEBT #31.
 */
export const CANVAS_TOOLBAR_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_TOOLBAR);

/**
 * Canvas-first plan authoring (ADR-0032, spec `docs/specs/canvas-first-authoring.md`). **OFF by
 * default** while it's built behind the flag: when on, a planner builds a plan directly on the TSLD
 * canvas — a blank draw-ready canvas on a new plan (anchored to `plannedStart ?? today`), an inline
 * start-date control, unified auto-recalculation after any structural edit, on-canvas activity types
 * (Task + Start/Finish milestone), and a two-click Link tool replacing the edge-drag gesture. Layers
 * on {@link CANVAS_TOOLBAR_ENABLED} (ADR-0031) — the Add/Link/start-date controls live in that
 * toolbar. Frontend only; no backend/DB/API change. Flag-off keeps today's behaviour byte-for-byte
 * (table-first authoring, manual recalc). Set `VITE_CANVAS_AUTHORING=true` to preview; it flips
 * default-on per milestone once each slice's a11y/e2e/perf gates are green.
 */
export const CANVAS_AUTHORING_ENABLED = flagDefaultOff(import.meta.env.VITE_CANVAS_AUTHORING);
