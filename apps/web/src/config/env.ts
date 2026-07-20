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
 * gates (a11y, e2e, perf) were the pre-flip quality gate (a11y / ux / component / e2e) — now green with the documented blockers (TECH_DEBT #38/#39/#40/#41/#44) cleared.
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
 * ADR-0035 §30.5–§30.8). **OFF by default** — an in-progress, first user-visible slice of the live
 * cross-plan solve, gated until its quality gates (component / ux / a11y / e2e) are green. When on,
 * the web UI exposes the programme surface, layered on the static M1 inter-project surface
 * ({@link INTER_PROJECT_DATES_ENABLED}):
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
 * `VITE_PROGRAMME_SCHEDULING=true` to enable it in an environment.
 */
export const PROGRAMME_SCHEDULING_ENABLED = flagDefaultOff(
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
 * - **Update progress…** — opens `ActivityProgressDialog` for the selected activity (Contributor+).
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
