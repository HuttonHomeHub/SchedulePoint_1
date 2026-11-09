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
 * **Precondition now satisfied by construction, not by a conjunct.** Authoring is meaningful ONLY
 * inside the toolbar-hosted, canvas-first workspace — the Add/Link/start-date controls live in that
 * `Toolbar`, and authoring **suppresses the edge-drag link gesture**. If authoring were on while
 * that host were off, edge-drag would be gone with no Link tool to replace it: a dead end for
 * on-canvas dependency creation (a11y review). This flag therefore carried
 * `&& CANVAS_TOOLBAR_ENABLED && CANVAS_WORKSPACE_ENABLED`. ADR-0088 D3 retired **both** parents, so
 * both conjuncts are gone — a retired parent drops its conjunct, because nobody can turn off what no
 * longer exists (ADR-0084 D4). The dead end is now unreachable because there is exactly one plan
 * surface and it always hosts the toolbar, which is a stronger guarantee than the conjunct was: a
 * boolean could be wrong, a deleted alternative cannot.
 *
 * This paragraph said "turning the workspace off turns authoring off too" until 2026-08-17 — in the
 * same commit that deleted the conjunct, two lines below the sentence. Found by the reconciliation
 * pass's devops review rather than by the author (ADR-0058).
 *
 * @enabled 2026-08-03 (a FLOOR — the earliest date the repository can prove; the real flip was earlier and is recorded nowhere, ADR-0084)
 */
export const CANVAS_AUTHORING_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_AUTHORING);

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
 *
 * @enabled 2026-08-03 (a FLOOR — the earliest date the repository can prove; the real flip was earlier and is recorded nowhere, ADR-0084)
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
 *
 * @enabled 2026-07-18
 */
export const RESOURCES_ENABLED = flagDefaultOn(import.meta.env.VITE_RESOURCES);

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
 *
 * @enabled 2026-07-18
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
 *
 * @enabled 2026-07-18
 */
export const EARNED_VALUE_ENABLED = flagDefaultOn(import.meta.env.VITE_EARNED_VALUE);

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
 *
 * @enabled 2026-07-18
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
 *
 * @enabled 2026-07-18
 */
export const INTER_PROJECT_DATES_ENABLED = flagDefaultOn(import.meta.env.VITE_INTER_PROJECT_DATES);

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
 *
 * @enabled 2026-08-03 (a FLOOR — the earliest date the repository can prove; the real flip was earlier and is recorded nowhere, ADR-0084)
 */
export const NOTES_ENABLED = flagDefaultOn(import.meta.env.VITE_NOTES);

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
 *
 * @enabled 2026-07-19
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
 *   levelingWindowExceeded), each centred + selected + announced. It cycled **five** flags until
 *   ADR-0094 narrowed the set to what a planner can act on: `externalDriven` left (an imported date
 *   driving an activity is normal on a programme, and the schedule summary strip already reports it)
 *   and negative total float left (one root cause counted N times down a chain, and the only member
 *   with no remedy — still visible via `isCritical` and the float colouring).
 * A third aid, **Snap to grid**, shipped here and was **deleted on 2026-08-13**. It rounded a dropped
 * `visualStart` to the nearest working day before the PATCH — but `compute.ts:335-338` wraps every
 * `visualStart` in `rollForwardToWorking` unconditionally, so the toggle had no observable effect in
 * either position, and the client's "nearest" could move a Saturday drop EARLIER than the engine
 * would. The optimistic ghost now previews the engine's forward roll instead
 * (`render/snap.ts:rollForwardToWorkingDay`) and the raw day is what is persisted.
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
 *
 * @enabled 2026-07-20
 */
export const CANVAS_NAV_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_NAV);

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
 *
 * @enabled 2026-07-20
 */
export const CANVAS_RESOURCE_VIEW_ENABLED =
  flagDefaultOn(import.meta.env.VITE_CANVAS_RESOURCE_VIEW) && RESOURCE_CURVES_ENABLED;

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
 *
 * @enabled 2026-07-21
 */
export const GUEST_SHARE_LINKS_ENABLED = flagDefaultOn(import.meta.env.VITE_GUEST_SHARE_LINKS);

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
 *
 * @enabled 2026-07-25
 */
export const CANVAS_DIRECT_MANIPULATION_ENABLED = flagDefaultOn(
  import.meta.env.VITE_CANVAS_DIRECT_MANIPULATION,
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
 *
 * @enabled 2026-07-27
 */
export const CANVAS_TIME_AXIS_ENABLED = flagDefaultOn(import.meta.env.VITE_CANVAS_TIME_AXIS);

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
 * **It was `AND`-ed with `ACTIVITY_EDITOR_TABS_ENABLED` until that flag retired** (ADR-0089): there
 * is no such thing as a Logic *tab* without the tabbed editor to hold it, so with tabs off and
 * convergence on the row menu's Logic and Resources items built an editor intent for a dialog that
 * never rendered — both entry points stranded on a surface that opened nothing. Deriving the
 * constant made that combination unrepresentable rather than merely untested (the security
 * review's finding on the combined diff). The editor is now unconditional, so the stranding is
 * unreachable and the conjunct has nothing left to guard against.
 *
 * Rollback: set `VITE_ACTIVITY_EDITOR_CONVERGENCE=false` and rebuild the web image. Nothing
 * persisted depends on it.
 *
 * @enabled 2026-07-29
 */
export const ACTIVITY_EDITOR_CONVERGENCE_ENABLED = flagDefaultOn(
  import.meta.env.VITE_ACTIVITY_EDITOR_CONVERGENCE,
);

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
 * **It was `AND`-ed with `ACTIVITY_EDITOR_TABS_ENABLED` until that flag retired** (ADR-0089), for
 * the ADR-0062 reason: the Members surface is a tab, and a tab with tabs off would have stranded
 * the summary's own entry point on an editor that never rendered. The editor is now
 * unconditional, so there is no such combination to make unrepresentable.
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
 *
 * @enabled 2026-07-30
 */
export const WBS_IMPROVEMENTS_ENABLED = flagDefaultOn(import.meta.env.VITE_WBS_IMPROVEMENTS);

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
 *
 * @enabled 2026-07-31
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
 * the prototype's 4 ms, which was never a budget and had never been re-measured before
 * that script existed (`TECH_DEBT` #75, which absorbed #59).
 * The product owner took the trade explicitly, and the open question is now whether **4 ms was ever
 * the right number** rather than whether this feature fits under it (`TECH_DEBT` #75). Recording it
 * here because "we enabled it and the budget was already blown" is exactly the kind of fact that
 * otherwise survives only in a pull-request comment.
 *
 * Rollback: set `VITE_CANVAS_LINK_ROUTING=false` and rebuild the web image. Nothing persisted
 * depends on it — routing is a per-frame display decision and no route is stored. The flag-off
 * parity gates (`link-routing.test.ts`, `paint.routing-budget.test.ts`) are kept and pinned rather
 * than weakened; they are the rollback contract, and they are also what makes the rollback cheap.
 *
 * @enabled 2026-07-31
 */
export const CANVAS_LINK_ROUTING_ENABLED =
  CANVAS_DIRECT_MANIPULATION_ENABLED && flagDefaultOn(import.meta.env.VITE_CANVAS_LINK_ROUTING);

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
 *
 * @enabled 2026-08-07
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
 *
 * @enabled 2026-08-07
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
 * **Default-ON** since 2026-08-08 (M5-T4), once the flag-on journey was green against a real API
 * with the pen enforced — which is where the epic's last three defects were found, none of them
 * visible to a unit suite. Flag-off the selection is structurally singular — only
 * `replace` and `clear` are reachable, so `ids.length <= 1` holds after any sequence of events, and
 * a structural test pins exactly that. Nothing else changes: the canvas paint, the toolbar, the
 * a11y tree and the `Space` binding are byte-for-byte today's (the flag-off parity suite is the
 * rollback contract).
 *
 * @enabled 2026-08-07
 */
export const CANVAS_MULTI_SELECT_ENABLED =
  CANVAS_DIRECT_MANIPULATION_ENABLED && flagDefaultOn(import.meta.env.VITE_CANVAS_MULTI_SELECT);
