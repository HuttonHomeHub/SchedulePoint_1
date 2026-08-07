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
 * The web client's own build version, baked in at compile time by Vite's `define`
 * ({@link __APP_VERSION__}, see `vite.config.ts`). Shown next to the API's version in
 * the app shell; a compile-time constant needs no runtime env var and can't drift.
 */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * Reads a boolean `VITE_` flag that defaults **ON**: enabled unless the operator
 * explicitly opts out with `"false"`/`"0"`. Used for shipped features that are on
 * by default but must stay switchable off (rollback / a controlled rollout).
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
 * {@link AUDIT_LOG_ENABLED} moved to {@link flagDefaultOn} on 2026-08-03,
 * {@link AUDIT_FILTERS_ENABLED} took its place and moved on 2026-08-04,
 * {@link AUDIT_SELF_SECURITY_ENABLED} the same day, and the next flag will need it on day one. Covered by `env.test.ts` regardless of consumers, including the case-sensitivity
 * that makes `"TRUE"` read as off — so it cannot rot unnoticed between epics.
 *
 * Do not delete it as dead code, and do not describe a specific consumer here: a named consumer is
 * a fact with a short half-life, and the last one to be written down was corrupted by a later edit
 * into two spliced halves naming five long-closed debt items, noticed only when it went away.
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
 * Canvas-first plan authoring (ADR-0032, spec `docs/specs/canvas-first-authoring.md`). **ON by
 * default** now that M1–M5 shipped and their quality gates are green — the a11y/ux/component/perf
 * review findings are folded in, the flag-on Playwright journey (`e2e-authoring/authoring.spec.ts`
 * via `pnpm --filter @repo/web test:e2e:authoring`) is wired into CI, and the unit suite passes.
 * When on, a planner builds a plan directly on the TSLD canvas — a blank draw-ready canvas on a new
 * plan (anchored to `plannedStart ?? today`), an inline start-date control, unified auto-recalculation
 * after any structural edit, on-canvas activity types (Task + Start/Finish milestone), and a two-click
 * Link tool replacing the edge-drag gesture. Frontend only; no backend/DB/API change. Set
 * `VITE_CANVAS_AUTHORING=false` to fall back to table-first authoring + manual recalc + edge-drag
 * linking, byte-for-byte (emergency rollback / opt-out).
 *
 * **Precondition enforced, not just documented:** authoring is meaningful ONLY inside the
 * toolbar-hosted, canvas-first workspace — the Add/Link/start-date controls live in that `Toolbar`,
 * and authoring **suppresses the edge-drag link gesture**. If authoring were on while the toolbar or
 * workspace were off, edge-drag would be gone with no Link tool to replace it — a dead end for
 * on-canvas dependency creation (a11y review). So this flag is gated on both host flags: turning
 * either host off turns authoring off too (and edge-drag returns, byte-for-byte).
 */
export const CANVAS_AUTHORING_ENABLED =
  flagDefaultOn(import.meta.env.VITE_CANVAS_AUTHORING) &&
  CANVAS_TOOLBAR_ENABLED &&
  CANVAS_WORKSPACE_ENABLED;

/**
 * Scheduling modes & a de-overloaded plan start (ADR-0033, spec
 * `docs/specs/scheduling-model-and-canvas-planning-modes.md`). **ON by default** (flipped at M5
 * enablement; set `VITE_SCHEDULING_MODES=false` to disable). It adds: a plan-level **Early / Visual**
 * scheduling mode + a read-only **Late Start** overlay; a display-only **Go to date** control split
 * out from the project start; and **Visual Planning**, where dragging a bar records an advisory
 * `visualStart` (no SNET constraint) that pushes successors and flags logic conflicts rather than
 * auto-correcting. (The **mandatory** project start shipped at M1 and is live independent of this
 * flag.) Layered on the canvas authoring host — the mode selector and Go-to-date live in the
 * toolbar-hosted workspace — so it is meaningful only when that surface is on; turning the host off
 * turns this off too.
 */
export const SCHEDULING_MODES_ENABLED =
  flagDefaultOn(import.meta.env.VITE_SCHEDULING_MODES) && CANVAS_AUTHORING_ENABLED;

/**
 * Per-activity working-time calendars (ADR-0037, M5 — engine conformance framework). **ON by default**.
 * The picker is a thin "Plan default (inherit)" ↔ specific-calendar `Select` (writing
 * `activities.calendar_id`) that reuses the same primitive and states as the already-reviewed
 * plan-calendar picker (M5-D2), and the activities table shows an activity's own calendar when it isn't
 * inheriting. Everything behind it — the settable API field, the absolute-instant engine, and the
 * conformance proof — is already live; only the picker is gated. Set `VITE_ACTIVITY_CALENDAR=false` to
 * hide it. The engine schedules each activity on its resolved calendar
 * (`activity.calendarId → plan.calendarId → 24/7`) regardless of this flag; the flag only governs
 * whether a planner can *pick* it in the web UI.
 */
export const ACTIVITY_CALENDAR_ENABLED = flagDefaultOn(import.meta.env.VITE_ACTIVITY_CALENDAR);

/**
 * Progress ingestion — retained-logic recalc (ADR-0035, M2). **ON by default** (quality gates cleared
 * — component/a11y/ux reviews and the repair-warnings follow-up). When on, the progress editor gains a
 * **remaining duration** input plus **suspend / resume** dates, and the plan settings gain a **recalc
 * mode** picker (Retained Logic / Progress Override / Actual Dates). Everything behind it — the
 * settable API fields, the engine's progress classification, and the conformance proof (S02/S03/S04) —
 * is already live; the flag only governs whether a planner can *edit* the new fields in the web UI
 * (percent + actual dates were always editable). Set `VITE_PROGRESS_INGESTION=false` to roll back to
 * the percent-plus-actual-dates editor.
 */
export const PROGRESS_INGESTION_ENABLED = flagDefaultOn(import.meta.env.VITE_PROGRESS_INGESTION);

/**
 * Advanced schedule constraints (ADR-0035 §7–§11, M4). **ON by default** now that its quality gates are
 * cleared — the accessibility (pass), component (pass), and UX (blockers folded in: shared
 * `CheckboxField`, plain section chrome, expected-finish copy/guard) reviews are green. When on, the
 * activity form gains a **secondary constraint** (a second type + date driving the backward pass,
 * ADR-0035 §10), an **As-late-as-possible** toggle (ADR-0035 §11) and an **expected-finish** date
 * (ADR-0035 §9); the plan settings gain an **Expected-finish scheduling** toggle
 * (`useExpectedFinishDates`); and a **Conflict** badge surfaces an engine-flagged `constraintViolated`
 * activity (a mandatory pin that broke logic, produced-and-flagged, ADR-0035 §7). Everything behind it —
 * the settable API fields, the engine's constraint passes, and the conformance proof (S12/N10) — is
 * already live; the flag only governs whether a planner can *edit and see* the new fields in the web UI.
 * Set `VITE_ADVANCED_CONSTRAINTS=false` to roll back to the moderate-constraint editor.
 */
export const ADVANCED_CONSTRAINTS_ENABLED = flagDefaultOn(
  import.meta.env.VITE_ADVANCED_CONSTRAINTS,
);

/**
 * Float & critical plan settings (ADR-0035 §17/§18/§20, M6). **ON by default** now that its quality
 * gates have cleared (component/ux/a11y reviews folded in during M6-F7) — the picker is a plan-settings
 * card built on the same reviewed primitives as the other plan settings. When on, the plan settings gain
 * three controls: a **critical-path definition** (Total float / Longest path), a **total-float measure**
 * (Finish / Start / Smallest), and a **make-open-ends-critical** toggle. Everything behind it — the
 * settable API fields, the engine's float & critical computation, and the conformance proof
 * (S07/S08/S11/S13) — is already live; the flag only governs whether a planner can *edit and see* the
 * three options in the web UI. Set `VITE_FLOAT_CRITICAL_SETTINGS=false` to hide them (rollback / opt-out).
 */
export const FLOAT_CRITICAL_SETTINGS_ENABLED = flagDefaultOn(
  import.meta.env.VITE_FLOAT_CRITICAL_SETTINGS,
);

/**
 * Advanced activity types (ADR-0035 §21/§24, M5-epic). **ON by default** now that its quality gates have
 * cleared — the LOE (F4) and WBS (F8) web surfaces went through the component/ux/a11y reviews (F8's
 * blocking copy/state findings folded in). Gates whether the activity form's Type picker offers
 * **Level of Effort** (a span-derived hammock: duration from its SS-predecessor start to its
 * FF-successor finish, never driving or critical) and **WBS summary** (a branch roll-up: dates from the
 * earliest start / latest finish of the activities grouped under it, carrying no logic), plus the WBS
 * **parent** picker that nests activities under a summary. The engine, API and conformance proof for both
 * are live (F1–F7); the flag only governs whether a planner can *pick* them. Set
 * `VITE_ADVANCED_ACTIVITY_TYPES=false` to hide them (rollback / opt-out). The deferred canvas summary/LOE
 * span-bars and navigator visual nesting (TECH_DEBT #37) are independent of this picker.
 */
export const ADVANCED_ACTIVITY_TYPES_ENABLED = flagDefaultOn(
  import.meta.env.VITE_ADVANCED_ACTIVITY_TYPES,
);

/**
 * Web resource surface (M7.1, ADR-0039). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a brand-new dark surface whose quality
 * gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the app gains an org-scoped
 * **Resources** library screen (list/create/edit/delete resources) reachable from the top nav, and a
 * per-activity **Resources** row action that opens an assignment editor (assign/edit/unassign, with a
 * driving-resource toggle that a MATERIAL resource can never take — ADR-0039 `MATERIAL_CANNOT_DRIVE`).
 * Everything behind it — the resource library + assignment API and the driving-resource-calendar
 * engine wiring — is already live; the flag only governs whether the web UI exposes it. Set
 * `VITE_RESOURCES=false` to disable it (rollback / opt-out).
 */
export const RESOURCES_ENABLED = flagDefaultOn(import.meta.env.VITE_RESOURCES);

/**
 * Duration types & the resource-units triad (M7 rung 4, ADR-0040). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a new dark
 * surface whose quality gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the activity form gains a **duration type**
 * picker (Fixed Duration & Units/Time (default) / Fixed Duration & Units / Fixed Units / Fixed
 * Units/Time) and — inside the per-activity resource assignment editor (itself behind
 * {@link RESOURCES_ENABLED}) — a **units/time (rate)** field on the driving assignment, with a live
 * preview of the duration the server will derive for a units-driven type. Everything behind it — the
 * settable `durationType` / `unitsPerHour` fields, the write-boundary `resolveTriad` recompute, and the
 * conformance proof — is already live; the flag only governs whether the web UI exposes it. The rate
 * field is meaningful only alongside the resource surface, so it appears only when BOTH this flag and
 * {@link RESOURCES_ENABLED} are on; the duration-type picker (a plain activity attribute) needs only
 * this flag. Set `VITE_DURATION_TYPES=false` to disable it (rollback / opt-out).
 */
export const DURATION_TYPES_ENABLED = flagDefaultOn(import.meta.env.VITE_DURATION_TYPES);

/**
 * Resource levelling (ADR-0041, the M7 levelling rung). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a new dark surface whose
 * quality gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the web UI exposes the levelling controls:
 *
 * - **Plan levelling settings** — a `Level resources` toggle (the opt-in switch for the second
 *   levelling pass) and, when it is on, a `Level within float only` toggle (delay only within total
 *   float, never extending the schedule).
 * - **Resource capacity** — a `Max units/hour` field on the resource form (the availability ceiling
 *   the levelling pass respects; blank = uncapped).
 * - **Activity levelling priority** — a `Levelling priority` field on the activity form (lower wins the
 *   resource when two activities contend; blank = lowest priority).
 * - **Levelled overlay** — the schedule summary gains the levelled project finish and the levelled /
 *   window-exceeded / self-over-allocated counts once a plan has levelled.
 *
 * Everything behind it — the plan `levelResources`/`levelWithinFloatOnly` options, resource
 * `maxUnitsPerHour`, activity `levelingPriority`, the opt-in second engine pass and its engine-owned
 * levelled overlay + summary counts — is already live; the flag only governs whether the web UI exposes
 * it. Set `VITE_RESOURCE_LEVELLING=false` to disable it (rollback / opt-out).
 */
export const RESOURCE_LEVELLING_ENABLED = flagDefaultOn(import.meta.env.VITE_RESOURCE_LEVELLING);

/**
 * Earned-Value web surface (EV4b, ADR-0042). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a brand-new dark surface whose
 * quality gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the web UI exposes the cost &
 * Earned-Value surface:
 *
 * - **Plan Earned-Value settings** — an `EAC method` picker (CPI (default) / Remaining-at-budget /
 *   CPI × SPI) and a plan `currency` (ISO-4217) field.
 * - **Resource cost rate** — a `Cost per unit` field on the resource form.
 * - **Activity cost & %-complete** — a `%-complete type` picker (Duration / Units / Physical), a
 *   `Physical % complete` field (shown when the type is Physical), and `Budgeted` / `Actual` expense
 *   money fields on the activity form.
 * - **Assignment cost** — `Budgeted cost` / `Actual cost` / `Actual units` on a resource assignment.
 * - **Earned-Value analysis** — a KPI + per-activity/WBS table panel reading
 *   `GET …/schedule/earned-value` (cost:read-gated → a friendly "restricted" state for non-Planners).
 *
 * Everything behind it — the settable cost inputs on the create/update DTOs (EV4a) and the
 * `earned-value` read endpoint — is already live; the flag only governs whether the web UI exposes it.
 * Money on the wire is **integer minor units** in the plan's `currencyCode` (see `lib/format-money`).
 * Set `VITE_EARNED_VALUE=false` to disable it (rollback / opt-out).
 */
export const EARNED_VALUE_ENABLED = flagDefaultOn(import.meta.env.VITE_EARNED_VALUE);

/**
 * Cost-accrual web surface (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — its quality gates
 * (a11y / ux / component / e2e) and documented pre-flip blockers (TECH_DEBT #38/#39/#40/#41/#44) are
 * now cleared. When on, the activity form's
 * "Cost & earned value" fieldset gains a **Cost accrual** select (Start / Uniform / End):
 *
 * - **Cost accrual** — governs WHEN the activity's cost is recognised in the Earned-Value read's
 *   Planned-Value time-phasing (Start = whole cost at the start, End = at the finish, Uniform = spread
 *   linearly). It changes no date — only the cost / cash-flow S-curve.
 *
 * Everything behind it — the settable `accrualType` create/update activity field and the accrual-aware
 * PV time-phasing in the `earned-value` read — is already live; the flag only governs whether the web
 * UI exposes the picker. The cost **S-curve chart** (the period-trend series) is a later, separate
 * slice. Set `VITE_COST_ACCRUAL=false` to disable it (rollback / opt-out).
 */
export const COST_ACCRUAL_ENABLED = flagDefaultOn(import.meta.env.VITE_COST_ACCRUAL);

/**
 * Weighted activity-steps web surface (M7 rung 5, ADR-0044 §2 / ADR-0035 §33). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a
 * brand-new dark surface whose quality gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the activities table
 * gains a per-activity **Steps** row action that opens an editor for the activity's weighted progress
 * checklist:
 *
 * - **Activity steps** — an editable ordered list of steps (name, relative weight, % complete) with
 *   add / remove / reorder, saved in one bulk `PUT …/activities/:activityId/steps`. When an activity
 *   has steps, its PHYSICAL %-complete rolls up as the weighted mean `Σ(wᵢ·pᵢ)/Σ(wᵢ)` and wins over the
 *   manual `physicalPercentComplete` (all-zero weights fall back to the manual field). A live preview of
 *   the rolled-up % is shown in the editor.
 *
 * Everything behind it — the settable `ActivityStep` rows, the bulk-replace endpoint, and the read-time
 * `rollupPhysicalPercent` resolver — is already live; the flag only governs whether the web UI exposes
 * the editor. Set `VITE_ACTIVITY_STEPS=false` to disable it (rollback / opt-out).
 */
export const ACTIVITY_STEPS_ENABLED = flagDefaultOn(import.meta.env.VITE_ACTIVITY_STEPS);

/**
 * Resource loading-curves web surface (M7 rung 5, ADR-0044 §3 / ADR-0035 §31). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — its quality gates
 * (a11y / ux / component / e2e) and documented pre-flip blockers (TECH_DEBT #38/#39/#40/#41/#44) are
 * now cleared. When on, the web UI exposes resource
 * loading curves:
 *
 * - **Loading-curve picker** — a per-assignment curve select (Uniform / Bell / Front-loaded /
 *   Back-loaded / Double-peak) on the resource-assignment dialog (create form + each assigned row),
 *   naming the named P6 profile the resource-histogram read distributes the assignment's budgeted units
 *   by across the activity span. `UNIFORM` (the default) is a flat load.
 * - **Resource histogram** — a read view (a bar chart with a keyboard-navigable data-table equivalent
 *   for WCAG 2.2 AA) of the plan's `GET …/schedule/resource-histogram`, showing each resource's
 *   curve-shaped units over time.
 *
 * Everything behind it — the settable `curveType`, the pure `resource-histogram.ts` read-model, and the
 * `GET …/schedule/resource-histogram` endpoint — is already live; the flag only governs whether the web
 * UI exposes the picker + histogram. Set `VITE_RESOURCE_CURVES=false` to disable it (rollback / opt-out).
 */
export const RESOURCE_CURVES_ENABLED = flagDefaultOn(import.meta.env.VITE_RESOURCE_CURVES);

/**
 * Inter-project / external dates web surface (F5, ADR-0043 / ADR-0035 §30). **ON by default** (flipped 2026-07-18; pre-flip blockers cleared) — a
 * brand-new dark surface whose quality gates (a11y, ux, component reviews, e2e) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared. When on, the web UI
 * exposes external / inter-project dates:
 *
 * - **Activity External dates** — an `External early start` and `External late finish` date pair on the
 *   activity form (imported commitments from another project: the later of logic and the external early
 *   start drives; an external late finish earlier than logic shows as negative float).
 * - **Plan Ignore external relationships** — an on/off plan toggle that drops all external early-start
 *   and late-finish bounds so the plan schedules on its own logic (P6's "ignore relationships to/from
 *   other projects").
 * - **Externally-driven count** — the schedule summary strip surfaces `externalDrivenCount` (how many
 *   activities an external bound drove this recalc) when it is above zero.
 *
 * Everything behind it — the settable `externalEarlyStart` / `externalLateFinish` activity fields (with
 * the N26 `EXTERNAL_FINISH_BEFORE_START` reject), the plan `ignoreExternalRelationships` option, the
 * engine's two soft clamps and the engine-owned `externalDrivenCount` summary — is already live; the
 * flag only governs whether the web UI exposes it. Set `VITE_INTER_PROJECT_DATES=true` to enable it in
 * an environment.
 */
export const INTER_PROJECT_DATES_ENABLED = flagDefaultOn(import.meta.env.VITE_INTER_PROJECT_DATES);

/**
 * Live cross-plan / programme scheduling web surface (inter-project **Milestone 2**, F8; ADR-0045 /
 * ADR-0035 §30.5–§30.8). **ON by default** (now its component/ux/a11y/e2e gates are green) — the
 * first user-visible slice of the live cross-plan solve. When on, the web UI exposes the programme
 * surface, layered on the static M1 inter-project surface ({@link INTER_PROJECT_DATES_ENABLED}):
 *
 * - **Cross-plan links** — a section in the activity panel (the SUCCESSOR activity's home, ADR-0045
 *   CQ-2) to draw a **live** inter-project link from an upstream activity in ANOTHER plan of the org:
 *   an org-scoped endpoint picker (client → project → plan → activity), the FS/SS/FF/SF type + signed
 *   lag + lag-calendar inputs (mirroring the intra-plan dependency editor), and a link list with
 *   delete. Same-plan (N31) is caught client-side; cycle (N30) / duplicate (N33) surface the shared
 *   `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` copy from the server.
 * - **Recalculate programme** — an action beside the existing Recalculate that runs the synchronous
 *   `…/schedule/recalculate-programme` solve (the plan's upstream cross-plan closure, upstream-first),
 *   with a result panel (per-plan summaries + the summed missing-upstream N32 warning), the **423
 *   `PROGRAMME_PLANS_LOCKED`** blocked-plans path (with the pen request/override hint), and the **422
 *   `PROGRAMME_TOO_LARGE`** too-large path.
 * - **Stale banner** — shown (`role="status"`) when the plan summary carries `scheduleStale` (an
 *   upstream plan was recalculated more recently), prompting a programme recalculate.
 *
 * The whole surface is unobtrusive: it appears only for a plan that actually has cross-plan edges (the
 * summary's `scheduleStale` field is present only then). Everything behind it — the cross-plan link
 * CRUD, the derivation seam, the programme-recalc orchestration and the staleness read — is already
 * live on the API (F2–F7); the flag only governs whether the web UI exposes it. Set
 * `VITE_PROGRAMME_SCHEDULING=false` for a byte-for-byte rollback.
 */
export const PROGRAMME_SCHEDULING_ENABLED = flagDefaultOn(
  import.meta.env.VITE_PROGRAMME_SCHEDULING,
);

/**
 * Notes web surface (Notes M3, ADR-0046). **ON by default** — the quality gates (component / ux / a11y
 * / e2e) are green and the reviewer blockers are resolved. When on, the web UI exposes attributed,
 * time-ordered note **threads** on plans and activities (the "weekly progress journey"):
 *
 * - **Activity notes** — a **Notes** section in the activity Logic panel (thread + composer for that
 *   activity), plus a small per-row **count badge** on the activities table (fed by one batch
 *   `activity-counts` query, never an N+1).
 * - **Plan notes** — a **Notes** section on the plan detail route and the canvas plan workspace.
 *
 * Who can write is role-derived (Contributor / Planner / Org Admin write; Viewer reads) — notes are
 * **not** pen-gated (the progress precedent, ADR-0046). Editing/deleting is limited to the note's own
 * author (a 403 the API enforces; the UI shows the controls only to the author), with the optimistic
 * `version` giving a 409 "updated elsewhere" path. Everything behind it — the notes CRUD + the batch
 * counts read — is already live on the API (M2); the flag only governs whether the web UI exposes it.
 * Set `VITE_NOTES=false` to hide the web surface in an environment (the API is unaffected).
 */
export const NOTES_ENABLED = flagDefaultOn(import.meta.env.VITE_NOTES);

/**
 * TSLD toolbar quick-wins (spec `docs/specs/toolbar-quick-wins/`). **OFF by default during build** —
 * it will flip on after the specialist reviews (a11y / ux / component / perf) are green (M3). When on,
 * it wires five previously-"Coming soon" TSLD toolbar buttons to already-shipped features — no new
 * domain capability, no API/schema/engine change:
 *
 * - **Go to today** — pans the canvas to today's date line (reuses the `goToDate` left-inset view jump).
 * - **Comments** — reveals + focuses the plan-level notes thread (`PlanNotesSection`, `VITE_NOTES`).
 * - **Report progress…** — opens `ActivityProgressDialog` for the selected activity (Contributor+).
 * - **Add note** — opens the selected activity's Logic panel at its Notes section (`VITE_NOTES`).
 * - **Clear visual placement** — drops the selected bar's hand-placed `visualStart` (Visual mode, pen).
 *
 * **ON by default** (2026-07-19, product sign-off) now that the five commands are wired to already-
 * shipped features and the accessibility / ux / component / performance / security / test reviews are
 * green. Each of the five ids resolves to its real {@link ToolbarItem} when on, and to its existing
 * `placeholderItem()` "Coming soon" stub when off — so `VITE_TOOLBAR_QUICK_WINS=false` restores the
 * placeholders byte-for-byte (emergency rollback / opt-out).
 */
export const TOOLBAR_QUICK_WINS_ENABLED = flagDefaultOn(import.meta.env.VITE_TOOLBAR_QUICK_WINS);

/**
 * Client-side command-stack undo/redo for plan authoring (ADR-0048, spec `docs/specs/undo-redo/`).
 * **ON by default** (2026-07-19, product sign-off) now that M1–M3 have landed and their a11y / ux /
 * component reviews + the flag-on Playwright journey are green. When on, structural plan edits
 * (reposition / relane / definition update / create / delete / dependency add-remove / `visualStart` /
 * auto-arrange) push an inverse onto a bounded (50), per-plan, per-pen-session in-memory stack, and the
 * toolbar Undo/Redo + `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` · `Ctrl+Y` keys replay plan **INPUTS** through
 * the existing REST mutation hooks — never engine-owned derived columns. The normal ADR-0032 auto-recalc
 * redraws the outputs, so the CPM engine and its recalc **parity gate are untouched**. Undo is pen-gated
 * exactly like a first-class edit: every inverse flows through the unchanged `assertHoldsPen` (423) +
 * RBAC + org-scope + optimistic `version` gates, so the client stack can never escalate.
 *
 * BACK/FORWARD SUPPRESSION (the pre-flip gate, cf. {@link TSLD_EDITING_ENABLED}): that `Cmd/Ctrl+Z`
 * doesn't trigger the browser's Back is asserted on **Chromium** by the flag-on Playwright journey
 * (`e2e-undo/undo.spec.ts` via `pnpm --filter @repo/web test:e2e:undo`); the **Firefox / Safari / Edge**
 * manual sweep is the same operator gate `VITE_TSLD_EDITING` used (docs/TECH_DEBT.md #25) — do it before
 * wide rollout.
 *
 * Set `VITE_UNDO_REDO=false` to ship it inert (no store, no keybindings, placeholder toolbar items) —
 * byte-for-byte the prior behaviour (emergency rollback / opt-out).
 */
export const UNDO_REDO_ENABLED = flagDefaultOn(import.meta.env.VITE_UNDO_REDO);

/**
 * TSLD canvas insight lenses (spec `docs/specs/canvas-lenses/`). **OFF by default during build** —
 * it will flip on after the specialist reviews (a11y / ux / component / perf) are green (M4). When
 * on, it turns three shaded Look-row toolbar placeholders into real client-side read lenses over
 * already-shipped data — no new API/schema/`@repo/types`/CPM-engine change (the recalc parity gate is
 * untouched):
 *
 * - **Filter / Search** — a live search field + a Filter menu (Critical / Has constraint / Has
 *   conflict) that **dim** every non-matching bar (shade-don't-remove; geometry, lanes and logic
 *   lines stay put), mark the parallel listbox, and announce the match count.
 * - **Colour by…** — recolour bars by Criticality (default, byte-for-byte today's fills) / Total-float
 *   bucket / WBS group, with a mode-aware Legend and the retained critical outline (never colour-only).
 * - **Baseline overlay** — ghost outline bars behind the live bars at the active baseline's captured
 *   dates (reusing the shipped variance read), with a Legend key; disabled-with-reason otherwise.
 *
 * **ON by default** (2026-07-19, product sign-off) now that the three lenses are wired to shipped data
 * and the performance / accessibility / ux / component / security / test reviews are green (every
 * blocking finding folded: ghost-culling, theme-reactive colour via {@link useThemeVersion}, band-paired
 * label ink ≥ 4.5:1, roving-tabindex-safe search, Filter reason + pressed state). Each of the four ids
 * resolves to its real behaviour when on, and to its existing stub when off — `search` renders the
 * disabled `SearchFieldControl`, and `filter`/`colour-by`/`baseline-overlay` render their
 * `placeholderItem()` "Coming soon" stubs — and the `TsldScene` carries no
 * `dimmedIds`/`barFill`/`barInk`/`baselineGhosts`, so `VITE_CANVAS_LENSES=false` restores the toolbar AND
 * the canvas paint byte-for-byte (emergency rollback / opt-out). The driving-resource Colour-by mode is a
 * deferred fast-follow (needs `VITE_RESOURCES`); the colour machinery is mode-generic so it drops in
 * additively.
 */
export const CANVAS_LENSES_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_LENSES);

/**
 * TSLD canvas navigation & authoring aids (spec `docs/specs/canvas-nav/`). When on, it turns three
 * shaded Look/Do-row toolbar placeholders into real client-side commands over already-shipped engine
 * output + freshly-shipped seams — no new API/schema/`@repo/types`/CPM-engine change (the recalc parity
 * gate is untouched):
 *
 * - **Isolate logic path** — dims every activity NOT on the selected activity's transitive
 *   predecessor+successor chain (full, or a driving-only sub-chain from `DependencySummary.isDriving`),
 *   reusing the Stage A `dimmedIds` dim seam (unioned with any active filter dim) + the a11y listbox mark.
 * - **Next conflict** — cycles the plan's flagged activities (constraintViolated / visualConflict /
 *   externalDriven / levelingWindowExceeded / negative total float), each centred + selected + announced.
 * - **Snap to grid** — a Visual-mode, pen-gated session toggle that rounds a dropped `visualStart` to the
 *   nearest working day (via the existing `isWorkingDay`) before the existing `setVisualStart` PATCH.
 *
 * **ON by default** (2026-07-20, product sign-off) now that the three aids are wired to shipped engine
 * output and the accessibility / ux / component / performance / security / test reviews are green (every
 * blocking finding folded: Isolate split-button toggle-off, aria-hidden conflict chip against the shared
 * announcer, focus-to-listbox on cycle, snap-day announcement, both-dimmed listbox marker, flag-gated
 * conflict scan). Each of the three ids resolves to its real behaviour when on, and to its existing
 * `placeholderItem()` "Coming soon" stub when off — and the `TsldScene` carries no new `dimmedIds`
 * contribution and the Visual drag path is unchanged — so `VITE_CANVAS_NAV=false` restores the toolbar
 * AND the canvas paint AND the a11y tree byte-for-byte (emergency rollback / opt-out). Isolate/Next-
 * conflict are view-only (every role); Snap is an authoring aid (pen + Visual mode).
 */
export const CANVAS_NAV_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_NAV);

/**
 * TSLD export & print (spec `docs/specs/export-print/`, Stage C1). When on, it turns the two shaded
 * Do-row toolbar placeholders (`export`, `print`) into real client-side deliverables over
 * already-shipped data + the shipped canvas renderer — no new API/schema/`@repo/types`/CPM-engine
 * change (the recalc parity gate is untouched):
 *
 * - **Export ▾** — an APG menu-button, grouped Schedule / Diagram: **Schedule (CSV)** (the activity
 *   table as an Excel-safe, injection-safe, UTF-8-BOM CSV; relabelled **All activities (CSV)** with a
 *   conditional **Matching activities only (N)** item when a Stage-A filter / Stage-B isolate lens is
 *   narrowing the set), plus **Diagram — whole plan / current view** as both **PNG** (off-screen
 *   `paintScene` in a light print palette) and **PDF** (lazy `import('jspdf')`, absent from the initial
 *   bundle). Each output carries a distinct filename and announces "Preparing…" then the outcome; a
 *   failure raises a visible dismissable banner.
 * - **Print…** — a browser-print of the whole diagram via the image path (print-only container +
 *   `@media print` stylesheet).
 *
 * **ON by default** (2026-07-20, product sign-off) now that the four outputs are wired and the six
 * specialist reviews (security / devops / performance / accessibility / ux / component) are green (every
 * blocking finding folded: per-extent filenames, visible error surface, in-flight announcement, honest
 * column-superset doc, whitespace-aware CSV injection guard, Schedule/Diagram menu sections). Each of the
 * two ids resolves to its real behaviour when on, and to its existing `placeholderItem()` "Coming soon"
 * stub when off — the `export`/`print` shapes are spread into both branches so they can't drift — so
 * `VITE_EXPORT_PRINT=false` restores the toolbar, canvas paint and a11y tree byte-for-byte (emergency
 * rollback / opt-out); no export module or jsPDF chunk loads. `share` (ADR-0012 guest link) + XER/MSP
 * interchange are C2, out of scope; app-handled `Ctrl/Cmd+P` is a documented deferred fast-follow.
 */
export const EXPORT_PRINT_ENABLED = flagDefaultOn(import.meta.env.VITE_EXPORT_PRINT);

/**
 * On-canvas advanced activity types — the **Level of Effort (hammock)** endpoint-pick tool (Stage D,
 * spec `docs/specs/canvas-activity-types/`). When on, the canvas Add split-button's two disabled "Soon"
 * placeholders (Level of effort + Hammock) collapse into ONE live **Level of Effort (hammock)** menu
 * item that arms a canvas endpoint-pick tool-mode: pick a start driver, then a finish driver, and
 * SchedulePoint composes a `LEVEL_OF_EFFORT` activity plus its SS (start → LOE) and FF (LOE → finish)
 * edges as one undoable action, then recalcs and redraws. The armed trigger shows "Pick start driver" →
 * "Pick finish driver", the item shades below two activities, the tool disarms and announces on
 * commit/cancel, and a keyboard-picked start survives a pointer-picked finish (single-sourced pick).
 * Frontend-only over the already-shipped LOE engine/API (M5-epic, ADR-0035 §21) — no new
 * API/schema/`@repo/types`/CPM-engine change (the recalc parity gate is untouched); a raw `HAMMOCK`
 * create is never wired (the engine has no distinct Hammock — the LOE **is** the span-derived hammock).
 *
 * **ON by default** (2026-07-20, product sign-off) now that the five specialist reviews (accessibility /
 * ux / component / performance / test) are green (Task 4; every blocking finding folded: disarm-on-
 * commit, Escape announcement, cross-modality pick, armed-trigger state, <2-activities gate). Flag-off ⇒
 * the Add menu keeps today's disabled "Soon" placeholders byte-for-byte and the LOE tool-mode is
 * unreachable (`VITE_CANVAS_ACTIVITY_TYPES=false` = emergency rollback / opt-out).
 */
export const CANVAS_ACTIVITY_TYPES_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CANVAS_ACTIVITY_TYPES,
);

/**
 * TSLD canvas-axis-aligned resource strip + over-allocation highlight (spec
 * `docs/specs/canvas-resource-view/`, Stage E; ADR-0049 — the render-layer decision, amends ADR-0026).
 * It turns the `resource-view` Look-row toolbar placeholder into a real lens that toggles a **demand strip
 * pinned to the TSLD time axis** — a Canvas 2D **sibling layer** (the third ADR-0026 layer: scene ·
 * interaction · strip) painted by the existing `TsldCanvas` rAF loop from the SAME `viewRef`, so the
 * per-bucket demand bars sit under the diagram's day/week/month columns and pan/zoom with the canvas with
 * zero desync. Strip _chrome_ (the resource picker, the reused bucket-size `Select`, the reused accessible
 * `<table>`) is DOM in a `ResourceStripPanel`; strip _bars_ are canvas. A sibling `over-allocation` lens
 * flags over-allocated activity bars with a rising-histogram shape badge (+ listbox marker + polite count
 * announcement) derived from the shipped levelling flags. It reads the already-shipped **demand read-model**
 * (`useResourceHistogram` / `GET …/schedule/resource-histogram`) — frontend-only, no
 * API/schema/`@repo/types`/CPM-engine change (the recalc parity gate is untouched).
 *
 * **ON by default** (2026-07-20, product sign-off) now that the five specialist reviews (component / ux /
 * accessibility / performance / test) are green and every blocking finding is folded (shared-table
 * extraction, panel-occlusion, stuck-toggle, focus-visible, integration/hook tests). Still **gated on
 * `RESOURCE_CURVES_ENABLED`** (the histogram data source): with the resource surface off there is no data
 * to strip, so `resource-view` stays its "Coming soon" placeholder. Flag-off (or curves-off) ⇒ the
 * `resource-view`/`over-allocation` items are their placeholders AND `TsldCanvas` reserves no strip band
 * and paints byte-for-byte today's (`VITE_CANVAS_RESOURCE_VIEW=false` = emergency rollback / opt-out).
 */
export const CANVAS_RESOURCE_VIEW_ENABLED =
  flagDefaultOn(import.meta.env.VITE_CANVAS_RESOURCE_VIEW) && RESOURCE_CURVES_ENABLED;

/**
 * Schedule interchange — the web review UI for importing a foreign schedule file (Stage C2, M1;
 * ADR-0050, spec `docs/specs/schedule-interchange/`). **ON by default** (2026-07-20, product sign-off)
 * now that the five specialist reviews (security / backend-performance / a11y / api / devops) are green
 * and every blocking finding is folded (the graph-size DoS ceiling, the batched-commit timeout, the
 * Dockerfile image break, the a11y error/announce gaps, the 413 code), and the flag-on Playwright
 * journey — which caught and fixed the pen-enforcement recalc 423 — passes in CI. When on, the project
 * plan-create surface gains an **Import from file…** entry (gated additionally on the caller holding
 * `interchange:import` — Planner + Org Admin) that opens a dry-run **review dialog**: pick a `.xer`, the
 * app POSTs it to the dry-run endpoint and renders the returned `InterchangeReport` (mapped
 * activity/relationship/calendar counts + the approximation / repair / drop findings as accessible
 * lists, downloadable), then **Confirm import** commits it — creating the plan server-side (calendars +
 * activities + dependencies, recalculated) and opening the new plan on the TSLD canvas.
 *
 * Everything behind it — the pure `@repo/interchange` parse/map/validate pipeline and the thin
 * `interchange` API module's dry-run + commit endpoints — is always live (RBAC-gated, Tasks 1.2–1.5);
 * this flag only governs whether the web UI exposes the entry + dialog. `VITE_SCHEDULE_INTERCHANGE=false`
 * (or the caller lacking `interchange:import`) ⇒ the plan-create surface is byte-for-byte today's — no
 * entry point, no dialog, and the review code is never reached (emergency rollback / opt-out).
 */
export const SCHEDULE_INTERCHANGE_ENABLED = flagDefaultOn(
  import.meta.env.VITE_SCHEDULE_INTERCHANGE,
);

/**
 * External-Guest per-plan share links — the flagged web surface (Stage F / F-M4; ADR-0051, spec
 * `docs/specs/external-guest-share-link/`). **OFF by default during build** — an in-progress dark
 * surface that flips on only after its specialist reviews (component / ux / a11y / performance /
 * security) and the Playwright journey are green. It layers on the already-shipped backend: the F-M2
 * management endpoints (`POST/GET/DELETE …/plans/:planId/shares`) and the F-M3 session-less guest reads
 * (`GET /api/v1/share/plan|activities|dependencies`, `Authorization: Bearer sp_share_…`). When on, the
 * web UI exposes BOTH halves of the feature:
 *
 * - **Member Share dialog** — the TSLD toolbar's `share` item (a plain `placeholderItem()` "Coming
 *   soon" stub while off) becomes a real command opening a `ShareLinksDialog`: it lists a plan's links
 *   (label, created, expiry, active/revoked, last-accessed), creates one via a RHF + Zod form (optional
 *   label + optional expiry) showing the one-time guest URL with a Copy button, and revokes per row. The
 *   whole affordance is gated on the caller holding `plan:share` (Planner + Org Admin, `canSharePlan`).
 * - **Public guest view** — the `/share` route (a sibling of `_authed`, NO session guard, NO app-shell
 *   chrome) reads the token from `location.hash`, calls the F-M3 endpoints with a Bearer header and NO
 *   cookies, and renders the plan read-only (slim header + the read-only TSLD canvas). Any 404 is a
 *   uniform "This share link is no longer available." (no existence oracle); the route is `noindex`.
 *
 * Everything behind it — the management + guest-read API — is always live (RBAC-gated / token-guarded);
 * this flag only governs whether the web UI exposes the dialog + registers the `/share` route.
 *
 * **ON by default** (2026-07-21) now that every pre-enablement gate is green — the five specialist
 * reviews (security / accessibility / ux / component / performance, all PASS after the review fold) and
 * the flag-on Playwright journey (`e2e-share/share.spec.ts`: create → open guest URL → read-only + no
 * member chrome → revoke → unavailable). Set `VITE_GUEST_SHARE_LINKS=false` for a byte-for-byte rollback:
 * the toolbar `share` item reverts to its `placeholderItem()` "Coming soon" stub, no `/share` route is
 * registered, and none of the share code is reached (emergency opt-out).
 */
export const GUEST_SHARE_LINKS_ENABLED = flagDefaultOn(import.meta.env.VITE_GUEST_SHARE_LINKS);

/**
 * Entry-route UX improvements (spec — "entry-route" quick wins). **ON by default** now that its
 * accessibility / component / UX reviews are green and folded in (set `VITE_ENTRY_ROUTES=false` to roll
 * back). Frontend-only, over already-shipped features
 * (notes + progress + resource assignments + weighted steps) — no new API/schema/`@repo/types`/CPM-engine
 * change (the recalc parity gate is untouched). When on, it changes where shipped affordances are reached:
 *
 * - **Plan notes as a right-side drawer** — the plan Notes thread (`VITE_NOTES`) moves out of the
 *   always-inline block above the canvas into a right-anchored **non-modal** `Sheet` the toolbar
 *   **Comments** button opens (the canvas behind stays live), reclaiming the wasted vertical space.
 * - **Canvas selection-bar actions** — the floating selection bar gains **Report progress** (role-gated,
 *   Contributor+), **Resources** (additionally gated on `VITE_RESOURCES`, the per-activity assignment
 *   editor) and **Steps** (additionally gated on `VITE_EARNED_VALUE` + `VITE_ACTIVITY_STEPS`, hidden for a
 *   duration-derived selection) — each until now reachable only from the activities-table row menu.
 *
 * Every half rides existing endpoints/dialogs; the flag only governs where they are surfaced. Set
 * `VITE_ENTRY_ROUTES=true` to enable it in an environment. Flag-off ⇒ the plan notes stay inline, the
 * selection bar carries only its base three actions, and none of the new code is reached — byte-for-byte
 * the prior behaviour (emergency rollback / opt-out).
 */
export const ENTRY_ROUTES_ENABLED = flagDefaultOn(import.meta.env.VITE_ENTRY_ROUTES);

/**
 * TSLD canvas direct manipulation + visual refresh (ADR-0052, spec
 * `docs/specs/canvas-direct-manipulation/`). **ON by default** (2026-07-25) now that all five
 * milestones (M1–M5) have landed with their specialist reviews (a11y / ux / component / perf) and
 * the ADR-0026 draw-budget benchmark green. When on, every dependency link anchors at the point in
 * time its lag actually constrains — `lagDays` walked from the constrained edge on the
 * relationship's lag calendar (plan working days; `TWENTY_FOUR_HOUR` elapsed, ADR-0036 §6), a lead
 * walking left — and carries a directional arrowhead at its successor end, with the driving
 * weight/dash cue retained (WCAG 1.4.1); the bar-end grab-zones become duration **resize handles**
 * (finish edge M2, mode-aware start edge M3) with a draggable lag anchor, and the bars + links get
 * the token-resolved **visual refresh** (M4/M5). No API or engine change — the recalc parity gate
 * is structurally untouched. Set `VITE_CANVAS_DIRECT_MANIPULATION=false` to fall back to the legacy
 * edge-drag zones and paint, byte-for-byte (emergency rollback / opt-out — the parity paint test).
 */
export const CANVAS_DIRECT_MANIPULATION_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CANVAS_DIRECT_MANIPULATION,
);

/**
 * Library scoping & manageability — the web surface for the ORG / PROJECT calendar tier, the
 * resource hierarchy, the archive lifecycle and server-side library search (ADR-0053, spec
 * `docs/specs/library-scoping-and-manageability/`). **ON by default** (2026-07-26) now that every
 * milestone (M1 calendar-scope API → M2 calendar-scope web → M3 resource hierarchy → M4 archive +
 * search + the shared combobox → M5 interchange tiering) has landed and the M6 enablement gates are
 * green — the ux / accessibility / api / backend-performance reviews are folded in and the flag-on
 * Playwright journey (`e2e-library/library.spec.ts` via `pnpm --filter @repo/web test:e2e:library`)
 * is wired into CI. When on:
 *
 * - the **calendar library** screen gains a `Scope` badge column (Organisation / a named project)
 *   and a scope filter (Organisation · Project · All), reading the M1 `?scope=org|project|all` list;
 * - the **project detail** screen gains a *Calendars* section listing the calendars usable in that
 *   project — its own plus every organisation one — off the M1
 *   `GET …/projects/:projectId/calendars` endpoint;
 * - **creating** a calendar gains a scope choice: the shared organisation library (additionally
 *   gated on `calendar:manage_org`) or the project it was opened from, and a calendar can be moved
 *   between tiers (narrowing is refused with a 409 while anything outside the project uses it);
 * - the **plan** and **activity** calendar pickers read that project-usable list and group their
 *   options by tier, while the **resource** picker stays organisation-only (the API hard-rejects a
 *   project calendar on a resource — the pool is org-global, ADR-0039);
 * - the **resource library** nests under a `parent` tree with a non-assignable `GROUP` kind;
 * - both libraries gain **archive / restore** (an archived row keeps scheduling every assignment it
 *   already has, but leaves every picker) and a server-side **search** field, and every picker is
 *   the shared APG `Combobox` reading a searched, paginated list — closing the 20-row truncation
 *   defect;
 * - **importing** a schedule tiers its calendars to the target project by default, with an opt-in
 *   "add global calendars to the organisation library" choice (gated on `calendar:manage_org`).
 *
 * Frontend-only: every endpoint, error code and permission behind it shipped with M1/M3/M4/M5, and
 * the CPM engine is untouched (the ADR-0034 recalc parity gate is structurally trivial). Set
 * `VITE_LIBRARY_SCOPING=false` for a byte-for-byte rollback: no scope column, filter, section,
 * grouping, tree, archive control or search field renders, every picker falls back to its native
 * `<select>`, and every list requests today's default (the shared organisation library) — the
 * flag-off parity suites.
 */
export const LIBRARY_SCOPING_ENABLED = flagDefaultOn(import.meta.env.VITE_LIBRARY_SCOPING);

/**
 * Canvas **live feedback & GPM float/drift visualisation** (ADR-0054, spec
 * `docs/specs/canvas-live-feedback/`). Default **off** until its M6 enablement gate — the
 * specialist reviews and, critically, the ADR-0026 draw-budget measurement at 2,000 activities
 * with every new layer enabled. When on, the TSLD canvas answers the two questions a
 * time-scaled logic diagram exists to answer — *when*, and *how much room*:
 *
 * - an in-flight gesture reads as **the bar itself moving**: the source bar dims and the ghost
 *   carries the real bar treatment (label, progress, milestone diamond) rather than a bare
 *   rectangle (amends ADR-0052 §4's deliberately-minimal ghost, which was right only while the
 *   source stayed fully painted beside it);
 * - a **date chip tracks the cursor** through every gesture and on idle hover in an edit mode,
 *   with a vertical guideline to the ruler and the hovered day's tick emphasised — and it states
 *   the datum actually being chosen (the tentative *finish* on a finish-edge resize, the *start*
 *   on a reposition), read through the same `dayColumnAt` mapping the gesture commits with, so
 *   the number shown can never disagree with the edit performed;
 * - each bar's **start and finish dates draw flanking it** behind a `Dates` view toggle,
 *   level-of-detail culled by zoom and collision (flanking, not inside: an inside date competes
 *   with the name label and vanishes on any bar narrower than its text);
 * - **total float draws as a hollow tail right** of the bar and **drift as a hollow tail left**,
 *   behind a lens toggle — the Graphical Path Method idiom, comparable across the whole diagram
 *   at a glance in a way a per-link number is not. Drift is engine-owned (`visualDriftDays`,
 *   ADR-0033) and is **absent in Early mode by construction**: an early-start schedule already
 *   places everything as early as logic allows, so drift is non-zero only under Visual mode or a
 *   constraint. That absence is correct, not a defect;
 * - **relationship slack** annotates the **selected** activity's links only — a number on every
 *   edge of a real network obscures the structure the diagram exists to show.
 *
 * Frontend-only: every datum (dates, `totalFloat`, `visualDriftDays`) is already on the wire, so
 * there is no API, DTO, schema or engine change and no code path from any of this back into
 * `computeSchedule` — the ADR-0034 recalc parity gate is structurally untouched. Set
 * `VITE_CANVAS_LIVE_FEEDBACK=false` for a byte-for-byte rollback to the ADR-0052 surface (the
 * flag-off parity suites).
 */
export const CANVAS_LIVE_FEEDBACK_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CANVAS_LIVE_FEEDBACK,
);

/**
 * The **designed chrome band** (ADR-0055 S2–S3, spec `docs/specs/designed-ui/`). Default **ON**
 * since 2026-07-26 (S5-T4), once the deferred specialist gates ran over the whole epic diff and
 * every blocking finding was folded — **accessibility** (the `--input` control boundary at 1.26:1
 * sitewide, `bg-muted` resolving light-on-light inside the Corporate chrome, the account menu's
 * theme radios with no programmatic group, and a `globals.css` comment claiming a contrast
 * coverage the suite did not have), **ux** (the client-row accent bar ADR-0055 §3 promised but
 * never shipped, and the unstated breadcrumb-seam decision, now named in the ADR), **component**
 * (catalogue gaps, `ToggleChip`'s zero consumers logged as debt — since closed: it is now the
 * calendar dialog's working-days picker) and **performance** (pass, no blockers). Light's and
 * Dark's own chrome values landed first and separately (S5-T1) so that the flag-off parity suites
 * still meant something on the day they were most needed.
 *
 * When on, the shell stops being "a centred header above a rail" and becomes one **full-bleed
 * chrome band**: the header row and, on a plan, the two toolbar rows render as a single navy
 * (Corporate) / neutral (Light, Dark) band across the top, with the Project Explorer and the
 * workspace below it. The toolbar reaches the band through a **portal**, so the React tree — and
 * therefore `usePlanWorkspaceModel`, `useTsldToolbarContext` and every registry predicate — is
 * untouched, and the shell never becomes plan-aware (which would contradict ADR-0029). Route
 * bodies keep their `max-w-6xl` measure cap: chrome is full-bleed, content is not.
 *
 * The flag also stamps `data-designed-chrome` on `<html>`, which is what activates the flagged
 * token-value layer in `styles/globals.css` (S3's light Corporate rail). That is deliberate: it
 * makes the rollback byte-for-byte for **colour** as well as structure, rather than leaving a
 * value change stranded behind a structural flag.
 *
 * Frontend-only — no API, DTO, schema or engine change. Set `VITE_DESIGNED_CHROME=false` for a
 * byte-for-byte rollback: `ChromePortal` becomes an identity wrapper, the shell renders today's
 * `column[ header ][ row(rail | main) ]`, the header re-centres at `max-w-6xl`, and the root
 * attribute is absent so every token keeps today's value (the flag-off shell parity suite).
 */
export const DESIGNED_CHROME_ENABLED = flagDefaultOn(import.meta.env.VITE_DESIGNED_CHROME);

/**
 * The **canvas visual language** (ADR-0055 S4, spec `docs/specs/designed-ui/`). Default **ON**
 * since 2026-07-26 (S5-T4), once the browser draw measurement was made and recorded: at 2,000
 * activities the band pass sits **inside the baseline's own run-to-run spread** — several runs
 * land below it — so its cost is smaller than the noise floor rather than merely small. Method,
 * hardware and the caveat that this was NOT the ADR-0026 §9 device envelope are written down in
 * `docs/specs/designed-ui/implementation-plan.md` (S5-T2).
 *
 * When on, the diagram sits on a ground of its own with **alternating month bands**: a planner can
 * count months without reading a single label, which is the one thing a time-scaled diagram should
 * make free. Banding is *ground*, not a gridline, so it deliberately does not follow the `Month
 * grid` toggle, and its parity comes from the absolute month ordinal — calendar-derived, so the
 * stripes cannot invert when the viewport pans.
 *
 * The cost is one `fillStyle` and at most `visibleMonths + 1` `fillRect` per frame, with zero text
 * — pinned by `render/paint.band-budget.test.ts` in the counting-stub style, which asserts the
 * *shape* of the cost rather than milliseconds (a CI runner's absolute timings are noise).
 *
 * Frontend-only, and the painter is the only thing that changes: no API, DTO, schema or engine
 * change. Set `VITE_CANVAS_VISUAL_LANGUAGE=false` for a byte-for-byte paint — the
 * scene simply carries no `monthBands`, so the band layer is skipped entirely.
 */
export const CANVAS_VISUAL_LANGUAGE_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CANVAS_VISUAL_LANGUAGE,
);

/**
 * TSLD time-axis legibility (ADR-0056, spec `docs/specs/tsld-toolbar-canvas-refinements/`, M2–M5).
 * **ON by default** since 2026-07-27 (M7) — gates range-anchored zoom presets (M2), tiered
 * gridlines (M3), the interpolated Today marker + pill (M4) and ground-vs-non-working shading
 * (M5); flipped once the whole diff cleared its specialist review pass (ux/accessibility/
 * component/performance), including the day/month gridline-contrast fix (WCAG 1.4.1) and
 * threading the raised zoom ceiling through a required `maxPxPerDay` parameter so it can never
 * leak into the flag-off zoom range. Set `VITE_CANVAS_TIME_AXIS=false` for a byte-for-byte
 * rollback to the pre-epic zoom/grid/today/non-working surface.
 *
 * Frontend-only: every input (zoom scale, calendar boundaries, `todayIso`) is already on the
 * wire — no API, DTO, schema or engine change, and no path back into `computeSchedule`. Flag-off
 * is byte-for-byte today's zoom/grid/today/non-working surface (`ZOOM_STOPS`, the single grid
 * pass, whole-day today, the flat non-working fill).
 */
export const CANVAS_TIME_AXIS_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_TIME_AXIS);

/**
 * Gantt view (ADR-0059, spec `docs/specs/gantt-view/`). **ON by default since 2026-07-28** (M6),
 * after the epic shipped in slices (M0 seam → M1 grid + bars → M2 WBS → M3 baseline variance →
 * M4 printed programme) and the deferred review pass over the combined diff was folded — which
 * caught a lit-but-inert zoom control in the Gantt (the preset delegated only to the canvas handle,
 * null with no canvas mounted) and the canvas-only viewport commands that now shade with a reason.
 * M5 (editing) stays deferred by design: the brief says read-primary.
 *
 * Gates the `view-mode` toolbar switch (TSLD | Gantt — the slot ADR-0031 §296 reserved and
 * ADR-0055 §8.4 declined to ship while only one view existed) and the Gantt surface itself.
 * Flag-off, no switch renders and no `?view=` value is honoured: the workspace is byte-for-byte
 * today's TSLD, which is the rollback contract the parity suites pin.
 *
 * Frontend-only. The view reads persisted computed columns (`earlyStart`…`totalFloat`,
 * `isCritical`, `parentId`, `percentComplete`) that are already on the wire — no API, DTO, schema
 * or permission change, and **no path back into `computeSchedule`**, so the ADR-0034 recalc
 * parity gate is untouched by construction.
 */
export const GANTT_VIEW_ENABLED = flagDefaultOn(import.meta.env.VITE_GANTT_VIEW);

/**
 * Tabbed activity editor (ADR-0060, spec `docs/specs/activity-editor-restructure/`). **ON by
 * default** (flipped 2026-07-29 at the M6 gate). Replaces the 22-field single-submit
 * `ActivityFormDialog` with a four-tab editor (General / Scheduling / Progress / Cost) that saves
 * **per write scope**, and co-locates the progress model that was spread across four dialogs.
 *
 * Per-scope save is not a styling choice. Progress writes are deliberately not pen-gated
 * (ADR-0028 Q-C) while definition writes are, so one merged Save would fuse a Contributor's
 * capability with a Planner's and quietly remove the former.
 *
 * The M6 gate is why this is on. Four specialist reviews over the combined M1–M5 diff found six
 * defects in code that had already passed a human read — a dropped calendar Combobox with its
 * loading/error states, Save buttons that blurred to `<body>` on every save, a reason sentence
 * placed beside its control instead of associated with it, an invented pen message that was false
 * whenever nobody held the pen, a missing discard confirmation, and a duplicated save bar already
 * diverging between its two copies. All six are folded, with regression tests; two lower-priority
 * findings are recorded as TECH_DEBT #63/#64. That is the epic's own premise landing on itself, and
 * it is the reason the flip is a separate decision from the build.
 *
 * Flag-off renders the three existing dialogs byte-for-byte — the rollback contract the parity
 * suites pin, kept rather than weakened. Frontend-only: no schema, DTO or engine change, and no
 * path into `computeSchedule`. (The steps edit-lock gate that shipped alongside this epic is
 * **not** behind this flag: a server check cannot be gated by a client build-time constant — see
 * ADR-0060 §5.)
 */
export const ACTIVITY_EDITOR_TABS_ENABLED = flagDefaultOn(
  import.meta.env.VITE_ACTIVITY_EDITOR_TABS,
);

/**
 * Activity-editor convergence (ADR-0062; spec
 * `docs/specs/activity-editor-logic-resources-convergence/`). **ON by default since 2026-07-29**,
 * once the four specialist gates ran over the combined M0–M5 diff and every blocking finding was
 * folded with a regression test: the Resources tab **hid** its assign form instead of shading it
 * with the reason (raised independently by ux and component — the lit-but-inert dead end inverted),
 * the tab order followed build order rather than the subject, the steps save bar never passed
 * `saved` (in a panel with no unit coverage at all, because the suite named for steps covers the
 * legacy dialog), and this flag pair could be set to a stranded combination — see below.
 *
 * Turns the two remaining per-activity pop-outs — the **Logic** dialog (predecessors, successors,
 * cross-plan links, notes) and the **Resources** dialog (assignments) — into tabs of the ADR-0060
 * editor, so one activity is one surface instead of an editor plus two modals reached from the
 * same row menu. `ActivityLogicPanel` and `ActivityResourcesPanel` are the *same components* the
 * dialogs render, so a tab and a dialog can never drift apart.
 *
 * It rides on ADR-0060's per-scope save and changes **no permission**: the Logic and Resources
 * scopes reuse the existing `definition` gate object rather than re-expressing it, which an
 * identity test pins (`gating.logic === gating.general`). Adding a link needs the pen exactly as it
 * did from the dialog; the server is unchanged and remains the only trust boundary.
 *
 * Flag-off, every entry point opens the dialog it opens today — the rollback contract the parity
 * suites pin. Frontend-only: no schema, DTO, permission or engine change, and no path into
 * `computeSchedule`. Note that flag-off is **not** byte-for-byte the pre-epic surface: the inline
 * add-link form (M1) landed unflagged in the Logic dialog, deliberately and early so it soaks.
 *
 * **It is `AND`-ed with {@link ACTIVITY_EDITOR_TABS_ENABLED}, not read alone.** There is no such
 * thing as a Logic *tab* without the tabbed editor to hold it: with tabs off and convergence on,
 * the row menu's Logic and Resources items would build an editor intent for a dialog that never
 * renders, stranding both entry points on a surface that opens nothing. Deriving the constant makes
 * that combination unrepresentable rather than merely untested (the security review's finding on
 * the combined diff), and the flag-matrix suite asserts all four combinations.
 *
 * Rollback: set `VITE_ACTIVITY_EDITOR_CONVERGENCE=false` and rebuild the web image. Nothing
 * persisted depends on it.
 */
export const ACTIVITY_EDITOR_CONVERGENCE_ENABLED =
  ACTIVITY_EDITOR_TABS_ENABLED && flagDefaultOn(import.meta.env.VITE_ACTIVITY_EDITOR_CONVERGENCE);

/**
 * **WBS improvements** (`VITE_WBS_IMPROVEMENTS`, default **on** since 2026-07-30) — making the shipped WBS
 * (ADR-0038) workable rather than merely present: managing a summary's membership from the summary
 * itself, dissolving a grouping without deleting the work it contains, showing the activities that
 * belong to no summary at all, and expressing the programme shape on the canvas.
 *
 * The API half (the batch membership write and dissolve) is deliberately **not** behind this flag:
 * a `VITE_` constant is a client build-time value and cannot gate a server check, and both
 * endpoints are permission-, pen- and scope-gated regardless of whether any UI reaches them. Nor is
 * the honest WBS delete warning, which is a strict improvement that stands alone.
 *
 * **It is `AND`-ed with {@link ACTIVITY_EDITOR_TABS_ENABLED}**, for the ADR-0062 reason: the
 * Members surface is a tab, and a tab with tabs off would strand the summary's own entry point on
 * an editor that never renders. Deriving the constant makes that combination unrepresentable
 * rather than merely untested.
 *
 * **Default-on 2026-07-30 (ADR-0063 M6)**, once the deferred specialist gates had run over the
 * whole epic diff and every blocking finding was folded with a regression test. Those gates found
 * four defects that had passed a human read — a summary selected while the band is on lost its
 * entire selection-actions bar (the band lifts summaries out of the scene, and the anchor lookup
 * only consulted the scene, so Dissolve left the screen AND the tab order for exactly the objects
 * the band exists to show); the bulk-assign Assign button used the native `disabled` attribute,
 * which blurs to `<body>` the instant it flips, on a control that flips twice per save; dissolve
 * mutated its children's `version` and returned `204`, so a cached child was silently stale; and it
 * read those children's new parent from a snapshot taken **before** the lock it takes to make that
 * read safe. The flag-on Playwright journey (`apps/web/e2e-wbs/`) proves the permission and
 * no-activity-lost claims against a real API with the pen enforced — the only place the
 * optimistic-`version` trap is testable, since a mocked fetch accepts any version.
 *
 * Rollback: set `VITE_WBS_IMPROVEMENTS=false` and rebuild the web image. The API endpoints stay
 * reachable but unreferenced, which is harmless, and nothing persisted depends on the flag. Every
 * flag-off parity suite is **kept and pinned** (`vi.mock` of `@/config/env`) rather than weakened —
 * that is the rollback contract, not scaffolding.
 */
export const WBS_IMPROVEMENTS_ENABLED =
  ACTIVITY_EDITOR_TABS_ENABLED && flagDefaultOn(import.meta.env.VITE_WBS_IMPROVEMENTS);

/**
 * **Canvas authoring flow** (`VITE_CANVAS_AUTHORING_FLOW`, default **on** since 2026-07-31) — the
 * *additive* half of
 * ADR-0064 M1: a mode statement band that says which tool is armed and what click it expects, a link
 * confirmation carrying the direction that was created plus an Undo, keyboard parity for the Link
 * tool's two-click pick, quiescence of the coalesced recalculation while a pick is open, and an
 * empty-plan state that names the first gesture.
 *
 * The epic's **defect fixes** deliberately ship *outside* this flag (the Link trigger arming its
 * tool, the uniform disarm contract, the create popover's label and submit). Gating them would mean
 * writing parity suites that pin a bug, and keeping two copies of the mode logic in one file — which
 * ADR-0061 explicitly rejected for the dialog refactor. The split is CQ-3's recorded decision, not a
 * convenience.
 *
 * It is **`AND`-ed with {@link CANVAS_AUTHORING_ENABLED}**, for the ADR-0062 reason: every surface
 * here states or steers a canvas-first authoring tool, and with canvas-first authoring off there is
 * no armed tool to state. Deriving the constant makes that pair unrepresentable rather than merely
 * untested.
 *
 * Rollback: set `VITE_CANVAS_AUTHORING_FLOW=false` and rebuild the web image. Nothing persisted
 * depends on it — the recalculation hold is in-memory and released on every exit path, so a flag
 * flip mid-session cannot leave one open. The flag-off parity suites are kept and pinned rather
 * than weakened; they are the rollback contract.
 */
export const CANVAS_AUTHORING_FLOW_ENABLED =
  CANVAS_AUTHORING_ENABLED && flagDefaultOn(import.meta.env.VITE_CANVAS_AUTHORING_FLOW);

/**
 * **Canvas link routing** (`VITE_CANVAS_LINK_ROUTING`, default **on** since 2026-07-31) —
 * ADR-0064 M2 / ADR-0065: a link's
 * vertical corridor steps aside when a bar stands in it, instead of being drawn straight through
 * the bar. The geometry is obstacle-aware only when the painter hands it an interval index; absent,
 * `routeOrthogonal` returns exactly what it always returned, so **flag-off is byte-identical by
 * construction** rather than by a second code path (`link-routing.test.ts` asserts that
 * point-for-point over a fixture corpus, and `paint.routing-parity.test.ts` asserts it through the
 * painter).
 *
 * It is **`AND`-ed with {@link CANVAS_DIRECT_MANIPULATION_ENABLED}**: the routing is reached through
 * the refreshed link path's fanned-out anchors (`scene.visualRefresh`), which is the only branch
 * that composes `routeOrthogonal` directly. With direct manipulation off there is no such branch to
 * enter, so deriving the constant makes the inert pair unrepresentable rather than merely untested.
 *
 * **Default-on with the cost known, not assumed.** `scripts/measure-link-routing.mjs` paints the
 * real painter against a real 2D context in Chromium at 2,000 activities: routing adds
 * **+3.4–5.9 ms p95**, on a baseline that is itself 13–23 ms — i.e. already 4–6× over ADR-0026
 * §16's stated ≤ 4 ms, which had never been measured before that script existed (`TECH_DEBT` #59).
 * The product owner took the trade explicitly, and the open question is now whether **4 ms was ever
 * the right number** rather than whether this feature fits under it (`TECH_DEBT` #75). Recording it
 * here because "we enabled it and the budget was already blown" is exactly the kind of fact that
 * otherwise survives only in a pull-request comment.
 *
 * Rollback: set `VITE_CANVAS_LINK_ROUTING=false` and rebuild the web image. Nothing persisted
 * depends on it — routing is a per-frame display decision and no route is stored. The flag-off
 * parity gates (`link-routing.test.ts`, `paint.routing-budget.test.ts`) are kept and pinned rather
 * than weakened; they are the rollback contract, and they are also what makes the rollback cheap.
 */
export const CANVAS_LINK_ROUTING_ENABLED =
  CANVAS_DIRECT_MANIPULATION_ENABLED && flagDefaultOn(import.meta.env.VITE_CANVAS_LINK_ROUTING);

/**
 * **The calendar shift-pattern editor** (`VITE_CALENDAR_SHIFT_EDITOR`, default **ON** since
 * 2026-08-01) — the authoring half of ADR-0036, behind ADR-0067.
 *
 * ADR-0036 moved storage and the CPM engine to working-**minutes** with intraday shift patterns:
 * split shifts, night shifts crossing midnight, asymmetric weeks with a half-day Friday. The engine
 * has scheduled all of it for a year. `api-v0.34.0` and the commits after it made every shape
 * authorable through the REST API. **Nothing in the product could still author one** — the calendar
 * form offered seven weekday checkboxes, which can say only *whether* a day works.
 *
 * Flag ON replaces those checkboxes with a per-day list of `HH:MM` periods, built on the shared
 * `WindowListEditor` — the same primitive the dated-exception editor uses, because a window is
 * authored in two places and two editors would drift about ordering, overlap and midnight
 * (ADR-0067 §2).
 *
 * Times are **text, not `<input type="time">`**: storage ends a full day at 24:00 and the native
 * control stops at 23:59 (spec Q2). Reading `00:00` back as 24:00 was rejected outright — it is
 * read-time inference, and 00:00 is a legitimate start.
 *
 * Rollback: set `VITE_CALENDAR_SHIFT_EDITOR=false` and rebuild the web image. Nothing persisted
 * depends on it: the API accepts both the mask and explicit shifts, and a calendar authored with
 * the editor keeps scheduling identically with the flag off — it simply becomes uneditable at
 * minute granularity again, which the form says out loud rather than implying the mask is the whole
 * truth. The flag-off parity suite is kept, not weakened; it is the rollback contract.
 *
 * Flipped default-on once the M4 gate pass finished: five specialist reviews over the combined
 * diff, ten blocking defects folded with regression tests, the `capability-shift-calendars` seed
 * plan reaching six capability keys no plan had ever reached, and the flag-on journey
 * (`apps/web/e2e-calendar-shifts/`) green against a real API. That journey earned its place on its
 * first run: it found that a menu opened from inside a modal `<dialog>` was unclickable, because a
 * modal dialog is in the browser's top layer and the menu portalled to `document.body`. No unit
 * test could have seen it — jsdom has no top layer.
 */
export const CALENDAR_SHIFT_EDITOR_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CALENDAR_SHIFT_EDITOR,
);

/**
 * **Sub-day durations and lags** (`VITE_SUB_DAY_DURATIONS`, default **OFF**) — ADR-0070, the
 * authoring half of ADR-0036's minutes.
 *
 * ADR-0036 moved storage and the CPM engine to working minutes; ADR-0068 made a *day* a
 * per-calendar quantity; `api-v0.34.0` put `durationMinutes` and `lagMinutes` on the public DTOs so
 * a sub-day value could be authored and read back exactly. **Nothing in the product could type
 * one** — the activity editor offered a whole-number *days* box and the dependency editor a
 * whole-number *days* lag, so a four-hour lift or a 30-minute cure lag could be imported,
 * scheduled, levelled and exported, and never entered.
 *
 * Flag ON reads both fields as text with a `d`/`h`/`m` grammar (`2d 4h`, `90m`, `1.5d`) and sends
 * the minute-denominated field; a **bare number still means days**, so every value a planner has
 * already learnt to type keeps its meaning.
 *
 * Rollback: set `VITE_SUB_DAY_DURATIONS=false` and rebuild the web image. Nothing persisted depends
 * on it — the API has accepted both `durationDays` and `durationMinutes` since `api-v0.34.0`, and a
 * sub-day duration authored with the flag on keeps scheduling identically with it off; it simply
 * reads back rounded to whole days again, which the field's label says out loud. The flag-off parity
 * suite is kept, not weakened: it is the rollback contract.
 *
 * The flag exists at all — unlike ADR-0061's deliberately unflagged layout work — because this
 * changes **which field of the write DTO carries the value**. A wrong day↔minute factor is a wrong
 * date, silently, so the rollback has to be a switch rather than a revert.
 */
export const SUB_DAY_DURATIONS_ENABLED = flagDefaultOn(import.meta.env.VITE_SUB_DAY_DURATIONS);

/**
 * **Per-assignment join lag** (`VITE_ASSIGNMENT_LAG`, default **ON** since 2026-08-02) — ADR-0071
 * M4/M6, the planner's
 * half of the engine-surface audit's F6.
 *
 * The CPM engine, the resource histogram, the levelling pass and the Earned-Value read have all
 * carried a per-assignment join lag since ADR-0071 M0–M3 — so a crane arriving four days into a
 * fortnight schedules, loads, levels and earns correctly, and **nothing in the product could set
 * one**. It could be imported, and that was the whole of it. This flag is the field.
 *
 * Flag ON adds a "Joins after" control to the assign form and to each assignment row, reading the
 * ADR-0070 `d`/`h`/`m` grammar against the activity's **saved** calendar — not the calendar a
 * pending edit has selected, because an assignment write does not carry the calendar with it and
 * converting against an unsaved choice would store minutes measured on a calendar the activity does
 * not have. Where the factor is unresolved the field keeps hours and minutes and refuses days,
 * naming the reason; that is the same code path a rollback leaves behind, so the degraded state and
 * the flag-off state cannot rot separately.
 *
 * Flipped default-ON by M6, once the deferred specialist gates ran over the whole M0–M5 diff and
 * every blocking finding was folded — a silently-wrong `2d4h` on the degraded path, a Save button on
 * the native `disabled` attribute, an assign-form refusal that registered with nothing and announced
 * nothing, an entry route that never received the day factor and so was permanently degraded, and a
 * placeholder offering an example in the unit its own label was refusing. The flag-on journey
 * (`apps/web/e2e-assignment-lag/`, its own CI step) proves the factor, the pen and the optimistic
 * `version` against a real API.
 *
 * Rollback: set `VITE_ASSIGNMENT_LAG=false` and rebuild the web image. Nothing persisted depends on
 * it — `lagMinutes` has been on the assignment DTOs since ADR-0071 M0, an existing lag keeps
 * scheduling, loading and earning exactly as it does now, and the flag-off surface simply stops
 * showing it. The flag-off parity suite is kept, not weakened: it is the rollback contract.
 */
export const ASSIGNMENT_LAG_ENABLED = flagDefaultOn(import.meta.env.VITE_ASSIGNMENT_LAG);

/**
 * **The Float paths panel** (`VITE_FLOAT_PATHS`, default **ON** since 2026-08-02) — the
 * engine↔planner surface audit's F4, and its last open finding.
 *
 * The engine has computed the ranked contiguous driving chains into an activity since M6-F6
 * (ADR-0035 §19, conformance scenario S11), and `GET …/schedule/float-paths` has exposed them
 * since the reconciliation pass that followed. **Nothing in the product ever called it.** So the
 * question a planner actually asks — _if I compress the critical path, what binds next and by how
 * much?_ — could be answered by SchedulePoint's engine and only read in the tool SchedulePoint
 * exists to replace.
 *
 * Flag ON adds a **Float paths** item to the toolbar's `find` group and a non-modal panel that
 * ranks the chains, plus path emphasis in **both** the Diagram and the Gantt view — it is an
 * analysis, not a canvas viewport command, so it is live in both (the ADR-0059 M6 lesson inverted).
 * The relative float is rendered from `relativeFloatMinutes`, never the deprecated day field: that
 * field divides by a flat 1440 and total float is measured on the activity's own calendar
 * (ADR-0037 §4, ADR-0068), so on an eight-hour calendar one working day of float rounded to `0`.
 * Fixing that at the API was M0 of this epic and shipped first, unflagged and alone.
 *
 * The panel fetches on open with `staleTime: 0`. That is a measured decision, not a guess: unlike
 * its sibling read-models the endpoint runs a full `computeSchedule` per request, and the harness
 * `apps/api/scripts/measure-float-paths.mjs` put it at **100.4 ms p95 — 0.61× a recalculate** on a
 * 540-activity plan. Cheaper than the write a planner already presses a button for; and because the
 * analysis is derived from the live schedule, a stale float path is a *wrong* float path.
 *
 * **Flipped default-ON by M4**, once the five specialist gates ran over the whole M0–M3 diff and
 * every blocking finding was folded. That milestone earned its place again — twelve blocking
 * defects in code that had already passed a human read, and most of them the house's own recurring
 * shape, a correct pattern applied to one control and not its neighbour:
 *
 * - The **Gantt never fed the workspace selection**, so the toolbar's selection-aware items
 *   answered with a stale *canvas* selection while the Gantt showed something else — and were
 *   shaded forever in a session that started there. Found by the design review, before a line of
 *   the panel existed.
 * - **Isolate logic path** was lit and inert in the Gantt, driving canvas state nothing there reads.
 * - The **bucket row** faded with the rest and carried no text marker, while the activity rows it
 *   sits among all did (WCAG 1.4.1).
 * - Closing the panel by its own **X or Escape** stranded focus on `<body>`; only re-pressing the
 *   toolbar item restored it (WCAG 2.4.3).
 * - Every **non-success state was silent** — busy, never-calculated, target-gone, failed — while
 *   the success path announced carefully (WCAG 4.1.3). The two announcement effects could also
 *   clobber each other in one commit, on a live region that holds one message and has no queue.
 * - A **negative** relative float rendered bare, and announced as "−1d above the driving path".
 * - The **never-calculated** state invented a second sentence for a 422 that already had shared
 *   copy, and offered no way to act on it.
 * - The Gantt's **bring-into-view re-centred the grid on every unrelated recalculation**, yanking
 *   the planner's scroll back after they had deliberately moved away.
 *
 * The flag-on journey (`apps/web/e2e-float-paths/`, its own CI step) proves the unit against a real
 * API on a real eight-hour calendar: a branch carrying one working day of float reads `+1d`, which
 * is the defect the whole epic descends from.
 *
 * Rollback: set `VITE_FLOAT_PATHS=false` and rebuild. There is no schema, no write path, no
 * permission and no pen here — flag-off is byte-for-byte the prior product: no toolbar item, no
 * panel, no query, no scene contribution. The flag-off parity suite is the rollback contract and is
 * kept rather than weakened (the ADR-0053 M6 rule).
 */
export const FLOAT_PATHS_ENABLED = flagDefaultOn(import.meta.env.VITE_FLOAT_PATHS);

/**
 * **The audit log** (`VITE_AUDIT_LOG`) — the web surface for ADR-0072, and the closing half of
 * `docs/TECH_DEBT.md` #14. **ON by default** (2026-08-03).
 *
 * The API records eighteen events across membership, invitations, the organisation, authentication
 * and hierarchy deletes/restores, into an append-only table, and exposes two reads. Until this flag
 * flipped, **nothing in the product could see any of it** — the shape this repository keeps finding
 * (ADR-0067's shift patterns, ADR-0070's sub-day durations): a capability that is stored, enforced
 * and exported, and that no screen can reach.
 *
 * Flag ON adds two screens, one nav entry and one account-menu item:
 *
 * - **Audit log** (`/orgs/$orgSlug/audit-log`), Org Admin only. The nav entry is hidden for every
 *   other role, and that is a courtesy rather than the control — the API answers 403 regardless,
 *   and a non-member gets 404 before it (anti-enumeration).
 * - **My activity** (`/me/activity`), for anyone, from the account menu. It takes NO user id: the
 *   actor comes from the session, so there is no parameter to tamper with and no permission to
 *   hold. That is why an ordinary member can read their own sign-in history without an Org Admin
 *   handing it over — and why it sits in the account menu rather than the organisation nav, since
 *   it spans every organisation the reader belongs to and carries the org-less auth rows too.
 *
 * Both render the same `AuditEventList`, differing only in scope and in whether the actor column is
 * shown (on `/me` every row is the same person). Two tables would drift about how a role change
 * reads, and only a reader who opened both would ever see it.
 *
 * `ipAddress` and `userAgent` are recorded and deliberately **not** rendered: the ordinary reader
 * here is an Org Admin looking at a membership history, and a colleague's home IP on that screen is
 * a privacy cost with no matching benefit. Showing them is a decision with its own scope.
 *
 * Rollback: set `VITE_AUDIT_LOG=false` and rebuild the web image. There is no write path, no
 * mutation and no pen here — flag-off is byte-for-byte the prior product: no routes registered, no
 * nav entry, no queries. The API keeps recording either way, which is the point of shipping the
 * producers first: the log is being written long before anyone can read it, so the first screen
 * shows real history rather than an empty table.
 */
export const AUDIT_LOG_ENABLED = flagDefaultOn(import.meta.env.VITE_AUDIT_LOG);

/**
 * The audit log's **filter bar** (ADR-0073 C1) — category chips, an outcome control and a date
 * range on both audit screens, with the chosen filter in the URL so a narrowed view survives a
 * reload and can be pasted to a colleague.
 *
 * **ON by default since 2026-08-04 (C1.5)**, and the flip is a hard precondition for the coverage
 * milestone rather than a preference. The producers that milestone adds are server-side, and a
 * `VITE_` constant is a client build-time value that cannot gate a server-side record (the ADR-0060
 * M0 rule). So the day the first coverage producer merges, every reader's feed gains two to three
 * orders of magnitude more rows — flag or no flag. Had the filter still been off at that moment the
 * log would have been unusable for everyone, with no rollback that helps.
 *
 * Rollback: set `VITE_AUDIT_FILTERS=false` and rebuild the web image. Flag-off is byte-for-byte the
 * prior screens — no bar renders and the client sends no filter parameter at all, so the request is
 * the one it sent before. Pinned by `audit-filter.parity.test.tsx`, which is **kept** after the flip
 * rather than weakened: that suite is the rollback contract (ADR-0053 M6), not scaffolding.
 */
export const AUDIT_FILTERS_ENABLED = flagDefaultOn(import.meta.env.VITE_AUDIT_FILTERS);

/**
 * Failed sign-ins against the reader's own address, on **My activity** (ADR-0073 C2).
 *
 * The single most useful row an audit log has to offer — somebody trying to get into your account —
 * has until now been readable by nobody: it carries no organisation and no actor, and both reads
 * filter on exactly those columns, so it was reachable only from `psql` (TECH_DEBT #91). C2.2
 * attributes it to the account it named; this flag turns on the surface that shows it.
 *
 * **ON by default since 2026-08-04 (C2.5).** Only the client half is flagged, and it cannot be
 * otherwise: the write-time attribution is a server-side record and a `VITE_` constant is a client
 * build-time value (the ADR-0060 M0 rule). The server's own parity is structural instead — absent
 * `include=attempts` the widened read's `where` is exactly what it always was, measured at 0.20 ms
 * and unchanged.
 *
 * Rollback: set `VITE_AUDIT_SELF_SECURITY=false` and rebuild the web image. Flag-off, this screen
 * sends no `include` parameter at all and shows no actor column, so it is byte-for-byte what it
 * was. Pinned by `audit-self-security.parity.test.tsx`, which is **kept** rather than weakened —
 * that suite is the rollback contract (ADR-0053 M6). Its sibling
 * `audit-self-security.flag-on.test.tsx` pins the other half, and exists because this milestone
 * first shipped with only the rollback covered: nothing proved an attempt row reached the reader
 * with the column and the sentence that make it legible.
 */
export const AUDIT_SELF_SECURITY_ENABLED = flagDefaultOn(import.meta.env.VITE_AUDIT_SELF_SECURITY);

/**
 * The `/account` screen: change your password, see and resend your address verification
 * (ADR-0074 M3). **ON by default** since 2026-08-05, once the M5 gate pass and both flag-on
 * journeys were green.
 *
 * **This flag is legitimate, and its sibling `VITE_PASSWORD_RESET` is a different kind of gate.**
 * Everything behind this one already works against today's server: `sendVerificationEmail` is
 * configured, and `/change-password` has always been reachable — there was simply no screen. So
 * the flag gates a **product decision** (is this surface ready?), not a server capability.
 *
 * Contrast the M2 work, which ships **unflagged**: those surfaces branch on whether the server has
 * `AUTH_REQUIRE_EMAIL_VERIFICATION` on, and a `VITE_` constant is baked into the bundle long before
 * an operator sets that (the ADR-0060 M0 rule). A flag there would strand a flag-off bundle against
 * a flag-on server — worse than none. **A client surface whose gate is a server-side condition is
 * branched on runtime evidence; a client surface whose gate is a product decision takes a flag.**
 *
 * Rollback: set `VITE_ACCOUNT_SETTINGS=false` and rebuild the web image. Flag-off, no `/account`
 * route is registered and the account menu has no entry for it, so the app is byte-for-byte what it
 * was. Pinned by `account-settings.parity.test.tsx`, kept rather than weakened — that suite is the
 * rollback contract (ADR-0053 M6).
 */
export const ACCOUNT_SETTINGS_ENABLED = flagDefaultOn(import.meta.env.VITE_ACCOUNT_SETTINGS);

/**
 * The signed-out password-reset flow: `/forgot-password`, `/reset-password`, and the
 * **"Forgot your password?" link on sign-in** (ADR-0074 M4). **ON by default** since 2026-08-05.
 *
 * **Its prerequisite was a deployment fact, not a code state, and that is why it flipped second.**
 * `sendResetPassword` is configured in `createAuth()`, so the endpoint no longer throws
 * `RESET_PASSWORD_DISABLED` — but a reset link that is composed and then not delivered is *worse*
 * than a missing screen: the enumeration-safe copy says "if that address has an account we've sent
 * a link" whatever happened, so a silent transport failure is indistinguishable from success to the
 * one person who needs it to work. The flip was therefore held until the product owner confirmed
 * `MAIL_SMTP_URL`/`MAIL_FROM` are set and sending on the deployed host (2026-08-05). Where that is
 * not true, `SmtpMailService` is not selected at all and mail is only logged — see
 * `common/mail/mail.service.ts` and `docs/TECH_DEBT.md` #94, which is the half of this still open:
 * a send that fails *after* the handoff is invisible to the person waiting for it.
 *
 * **The link and both routes share this one constant, and splitting them is the failure this
 * comment exists to prevent.** A "Forgot your password?" link pointing at a conditionally-registered
 * route is a link to nothing, and **`pnpm typecheck` cannot catch it**: `...(FLAG ? [route] : [])`
 * widens to `(typeof route)[]`, so the registered-route union contains the route in *both* branches
 * and `<Link to="/forgot-password">` compiles either way. The flag structure is the gate; the
 * parity suite pins the link's absence specifically.
 *
 * Rollback: set `VITE_PASSWORD_RESET=false` and rebuild the web image. Flag-off, neither route is
 * registered and sign-in carries no link, so the app is byte-for-byte what it was. Pinned by
 * `password-reset.parity.test.tsx`, kept rather than weakened (ADR-0053 M6).
 */
export const PASSWORD_RESET_ENABLED = flagDefaultOn(import.meta.env.VITE_PASSWORD_RESET);

/**
 * The TSLD **data-date line** (`VITE_CANVAS_DATA_DATE`, default **OFF** during build) — canvas
 * status & feedback M1 (spec `docs/specs/canvas-status-and-feedback/`, proposing ADR-0078). It
 * flips on at that epic's M6 gate once the specialist reviews and the flag-on journey are green.
 *
 * When on, the canvas draws the schedule's **data date** — the origin of its own coordinate
 * system (`screenXOfDay(0)` is literally its x) and the pivot of the whole progress model
 * (ADR-0033) — as a solid 2px foreground-hue vertical with a `Data date` pill, distinguishable
 * from the dashed Today line by shape and weight, never hue alone (WCAG 1.4.1). When the two
 * lines round to the same pixel, exactly one draws (the data-date treatment) with one merged
 * `Data date · today` pill. The mark is named in the legend and the export legend, toggleable
 * under `View▾ ▸ Markers`, and stated once in text for the activities listbox
 * (`aria-describedby`, not a live region).
 *
 * **Deliberately NOT `AND`-ed with another flag** (unlike the ADR-0062-shaped derived pairs):
 * the status line is meaningful on every canvas surface — authoring or read-only, toolbar-hosted
 * or legacy — so there is no host flag whose absence would strand it, and tying it to one would
 * only remove the line from surfaces where it is still a fact.
 *
 * **Default-on since 2026-08-07**, once the M6 gate pass over the combined epic diff was folded
 * (three blocking findings: the keyboard settle silence, the stranded empty-plan focus, and the
 * two-owner announcement race — none of them in this milestone's own code, all of them found by
 * running the gates the epic budgeted for).
 *
 * Rollback: set `VITE_CANVAS_DATA_DATE=false` and rebuild the web image. Flag-off the scene
 * carries no `dataDateLine`, so the painter's layer never runs and the frame is **byte-for-byte**
 * today's paint (`paint.data-date-parity.test.ts` — the rollback contract, kept rather than
 * weakened); no `View▾` toggle, legend entry, export-legend entry or listbox sentence renders.
 * Nothing persisted depends on it — the line is a per-frame display decision over a value
 * (`dataDate`) that has always been on the wire.
 */
export const CANVAS_DATA_DATE_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_DATA_DATE);

/**
 * TSLD search that navigates (spec `docs/specs/canvas-search-navigation/`). When on, the canvas
 * search stops being only a filter and becomes a **find** control: Enter / Shift+Enter cycle the
 * matches, each jump centres the bar, selects it and announces it, an n-of-m readout says where
 * the planner is, and `Zoom to selection` lets them read what they landed on.
 *
 * **Derived** from `CANVAS_LENSES_ENABLED`, deliberately, and for the ADR-0062 reason: the search
 * field itself is a lenses-flag control, so a build with this on and lenses off would register
 * keyboard behaviour and an n-of-m readout for a field that does not render. A flag whose feature
 * has no host is worse than no flag — it is a behaviour with nowhere to happen.
 *
 * **Default-ON since 2026-08-07** (ADR-0079), once the flag-on journey `apps/web/e2e-search-nav/`
 * ran green against a real API with the pen enforced. That journey is the rollout record rather
 * than a formality: it failed on its first run on **two live defects** — an armed tool disarmed by
 * an Escape typed into the search field (ADR-0064's contract, arriving through a door that decision
 * did not have), and the jump announcement overwritten by a stale debounced filter count. Neither
 * was reachable by any unit suite here, because the component tests mount the toolbar alone and
 * cannot see a native `window` listener or two debounces racing in one live region.
 *
 * Flag-off: the search field keeps today's filter-only
 * behaviour exactly, Enter does nothing, no readout renders and no cursor state is held — the
 * canvas paint, the toolbar and the a11y tree are byte-for-byte today's (the flag-off parity suite
 * is the rollback contract). Frontend-only: no API, DTO, schema or migration, and the CPM engine is
 * not imported, so the ADR-0034 recalculation parity gate is untouched by construction.
 */
export const CANVAS_SEARCH_NAV_ENABLED =
  CANVAS_LENSES_ENABLED && flagDefaultOn(import.meta.env.VITE_CANVAS_SEARCH_NAV);

/**
 * TSLD canvas **multi-select and bulk operations** (spec + plan in
 * `docs/specs/canvas-multi-select/`, approved 2026-08-07). When on, the canvas selection becomes a
 * set rather than one id: ctrl/cmd-click toggles, shift-click takes the bounding rectangle, a
 * marquee sweeps, and a bulk bar acts on the whole set in one write and one undo step.
 *
 * **Derived** from {@link CANVAS_DIRECT_MANIPULATION_ENABLED}, and the reason is a keyboard
 * collision rather than a layering preference: the legacy edge-drag reads `Shift` as the
 * start-to-start chord, and this epic gives `Shift`+click the span meaning. The two must never be
 * live at once, so the `&&` makes that unrepresentable instead of documented. A test asserts it.
 *
 * **Default-off** until the M5 gate pass. Flag-off the selection is structurally singular — only
 * `replace` and `clear` are reachable, so `ids.length <= 1` holds after any sequence of events, and
 * a structural test pins exactly that. Nothing else changes: the canvas paint, the toolbar, the
 * a11y tree and the `Space` binding are byte-for-byte today's (the flag-off parity suite is the
 * rollback contract).
 */
export const CANVAS_MULTI_SELECT_ENABLED =
  CANVAS_DIRECT_MANIPULATION_ENABLED && flagDefaultOff(import.meta.env.VITE_CANVAS_MULTI_SELECT);
