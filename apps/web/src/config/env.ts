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
