/// <reference types="vite/client" />

/**
 * The web app's own package version, baked in at build time by Vite's `define`
 * (see `vite.config.ts`). Read it through `APP_VERSION` in `config/env.ts`.
 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** On-canvas TSLD structural editing (M2). "true"/"1" enables it; off by default. */
  readonly VITE_TSLD_EDITING?: string;
  /** The plan edit-lock "pen" front-end layer (ADR-0028). "true"/"1" enables it; off by default. */
  readonly VITE_PLAN_EDIT_LOCK?: string;
  /** The persistent app-shell + hierarchy navigator (ADR-0029). "true"/"1" enables it; off by default. */
  readonly VITE_NAV_TREE?: string;
  /** In-tree CRUD for the Project Explorer (ADR-0029 Phase 2). On by default; "false"/"0" disables it. */
  readonly VITE_NAV_TREE_CRUD?: string;
  /** Canvas-first plan workspace (ADR-0030). "true"/"1" enables it; off by default. */
  readonly VITE_CANVAS_WORKSPACE?: string;
  /** Canvas-maximal chrome reclaim + toolbar architecture (ADR-0031). "true"/"1" enables it; off by default. */
  readonly VITE_CANVAS_TOOLBAR?: string;
  /** Canvas-first plan authoring (ADR-0032). "true"/"1" enables it; off by default. */
  readonly VITE_CANVAS_AUTHORING?: string;
  /** Scheduling modes & de-overloaded plan start (ADR-0033). On by default; "false"/"0" disables it. */
  readonly VITE_SCHEDULING_MODES?: string;
  /** Per-activity working-time calendar picker (ADR-0037). On by default; "false"/"0" disables it. */
  readonly VITE_ACTIVITY_CALENDAR?: string;
  /** Progress ingestion controls — remaining/suspend/resume + recalc mode (ADR-0035, M2). On by default; "false"/"0" disables it. */
  readonly VITE_PROGRESS_INGESTION?: string;
  /** Advanced schedule constraints — secondary/ALAP/expected-finish + violation badge (ADR-0035, M4). On by default; "false"/"0" disables it. */
  readonly VITE_ADVANCED_CONSTRAINTS?: string;
  /** Float & critical plan settings — critical definition/total-float measure/open-ends toggle (ADR-0035, M6). "true"/"1" enables it; off by default. */
  readonly VITE_FLOAT_CRITICAL_SETTINGS?: string;
  /** Advanced activity types — the Level-of-Effort (later WBS-summary) option in the Type picker (ADR-0035 §21/§24, M5-epic). "true"/"1" enables it; off by default. */
  readonly VITE_ADVANCED_ACTIVITY_TYPES?: string;
  /** Web resource surface — library screen + per-activity assignments (M7.1, ADR-0039). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCES?: string;
  /** Duration types & the resource-units triad — the activity duration-type picker + the driving assignment's units/time rate (M7 rung 4, ADR-0040). "true"/"1" enables it; off by default. */
  readonly VITE_DURATION_TYPES?: string;
  /** Resource levelling — plan level-resources/within-float toggles, resource max units/hour, activity levelling priority, levelled summary overlay (ADR-0041). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCE_LEVELLING?: string;
  /** Earned-Value web surface — plan EAC/currency settings, resource cost rate, activity cost & %-complete, assignment cost, and the EV analysis panel (EV4b, ADR-0042). "true"/"1" enables it; off by default. */
  readonly VITE_EARNED_VALUE?: string;
  /** Cost-accrual web surface — the activity "Cost accrual" select (Start / Uniform / End) governing when cost is recognised in the EV read's PV time-phasing (M7 rung 5, ADR-0044 F1). "true"/"1" enables it; off by default. */
  readonly VITE_COST_ACCRUAL?: string;
  /** Weighted activity-steps web surface — the per-activity "Steps" editor (name/weight/% list) whose weighted-mean rolls up the physical %-complete (M7 rung 5, ADR-0044 §2). "true"/"1" enables it; off by default. */
  readonly VITE_ACTIVITY_STEPS?: string;
  /** Resource loading-curves web surface — the per-assignment loading-curve picker (Uniform/Bell/Front-loaded/Back-loaded/Double-peak) + the Resource histogram read view (M7 rung 5, ADR-0044 §3). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCE_CURVES?: string;
  /** Inter-project / external dates web surface — activity external early-start/late-finish, plan ignore-external toggle, externally-driven summary count (F5, ADR-0043). "true"/"1" enables it; off by default. */
  readonly VITE_INTER_PROJECT_DATES?: string;
  /** Live cross-plan / programme scheduling web surface — the activity-panel cross-plan links section, the programme recalc control + result/423/422 handling, and the staleness banner (inter-project M2, F8, ADR-0045). "true"/"1" enables it; off by default. */
  readonly VITE_PROGRAMME_SCHEDULING?: string;
  /** Notes web surface — attributed note threads + composer on plans (plan-detail/workspace) and activities (Logic panel), plus the per-row count badge (Notes M3, ADR-0046). "true"/"1" enables it; off by default. */
  readonly VITE_NOTES?: string;
  /** Client-side undo/redo for plan authoring (ADR-0048). "true"/"1" enables it; off by default while it ships dark (M1 records commands with no visible UI; M3 adds the controls). */
  readonly VITE_UNDO_REDO?: string;
  /** TSLD toolbar quick-wins — wires five previously-"Coming soon" toolbar buttons (Recenter-on-today, Comments, Update-progress, Add-note, Clear-visual-placement) to already-shipped features (docs/specs/toolbar-quick-wins/). "true"/"1" enables it; off by default during build (flips on at M3). */
  readonly VITE_TOOLBAR_QUICK_WINS?: string;
  /** TSLD canvas insight lenses — filter/search dimming, Colour-by (Criticality/Total-float/WBS), and the baseline ghost overlay, turning three Look-row toolbar placeholders into real client-side read lenses (docs/specs/canvas-lenses/). "true"/"1" enables it; off by default during build (flips on at M4). */
  readonly VITE_CANVAS_LENSES?: string;
  /** TSLD canvas navigation & authoring aids — Isolate logic path (dim off-chain), Next conflict (cycle flagged activities), Snap to grid (round Visual drops to a working day), wiring three toolbar placeholders to shipped data (docs/specs/canvas-nav/). "true"/"1" enables it; off by default during build (flips on at M4). */
  readonly VITE_CANVAS_NAV?: string;
  /** TSLD export & print — turns the `export`/`print` toolbar placeholders into real client-side deliverables: Schedule (CSV), Diagram (PNG/PDF), Browser Print, off already-shipped data + the canvas renderer (docs/specs/export-print/). "true"/"1" enables it; off by default during build (flips on at M5). */
  readonly VITE_EXPORT_PRINT?: string;
  /** On-canvas advanced activity types — the single "Level of Effort (hammock)" Add-menu item that arms a canvas endpoint-pick tool (pick start driver → finish driver → LOE + SS/FF edges as one undoable action), over the already-shipped LOE engine/API (Stage D, docs/specs/canvas-activity-types/). "true"/"1" enables it; off by default during build (flips on after reviews, Task 4). */
  readonly VITE_CANVAS_ACTIVITY_TYPES?: string;
  /** TSLD canvas-axis-aligned resource strip — turns the `resource-view` toolbar placeholder into a demand strip pinned to the TSLD time axis (a Canvas 2D sibling layer painted by the `TsldCanvas` loop from the shared viewport), over the already-shipped resource-histogram read-model (Stage E, ADR-0049, docs/specs/canvas-resource-view/). Gated on VITE_RESOURCE_CURVES. "true"/"1" enables it; off by default during build (flips on after reviews, Task 6). */
  readonly VITE_CANVAS_RESOURCE_VIEW?: string;
  /** Schedule interchange web review UI — the project plan-create "Import from file…" entry + the dry-run review dialog (report table + approximation/repair/drop lists + download) + commit → open-plan, over the already-shipped `@repo/interchange` pipeline + the `interchange` dry-run/commit endpoints (Stage C2 M1, ADR-0050, docs/specs/schedule-interchange/). Additionally gated on the caller holding `interchange:import`. "true"/"1" enables it; off by default during build (flips on after the M1 specialist reviews). */
  readonly VITE_SCHEDULE_INTERCHANGE?: string;
  /** External-Guest per-plan share links web surface — the member Share dialog (toolbar `share` item: list/create/revoke a plan's guest links + one-time URL, gated on `plan:share`) + the public read-only `/share` guest view (session-less, token in the URL fragment), over the already-shipped F-M2 management + F-M3 guest-read endpoints (Stage F M4, ADR-0051, docs/specs/external-guest-share-link/). "true"/"1" enables it; off by default during build (flips on after the specialist reviews + Playwright journey). */
  readonly VITE_GUEST_SHARE_LINKS?: string;
  /** Entry-route UX improvements — plan notes as a right-side drawer (opened from the Comments toolbar button) + a Resources action on the canvas selection bar, over the already-shipped notes + resource-assignment features (docs spec — entry-route quick wins). "true"/"1" enables it; off by default during build (flips on after the specialist reviews). */
  readonly VITE_ENTRY_ROUTES?: string;
  /** TSLD canvas direct manipulation + visual refresh — time-true link anchoring (lag walked on the relationship's lag calendar from the constrained edge; lead = left) + directional arrowheads, duration resize on both bar edges, a draggable lag anchor, and the token-resolved bar/link visual refresh (ADR-0052, docs/specs/canvas-direct-manipulation/). On by default (2026-07-25, M1–M5 landed); "false"/"0" rolls back to the legacy edge-drag zones and canvas paint, byte-for-byte. */
  readonly VITE_CANVAS_DIRECT_MANIPULATION?: string;
  /** Library scoping & manageability web surface — the calendar ORG/PROJECT tier (scope badge/filter, the project Calendars section, the scope choice on create, tier-grouped pickers), the resource parent tree + non-assignable GROUP kind, archive/restore, URL-backed server-side library search, the shared searched combobox pickers, and the interchange calendar-tier import option (ADR-0053). On by default (2026-07-26, M1-M6 landed); "false"/"0" rolls the whole surface back, byte-for-byte. */
  readonly VITE_LIBRARY_SCOPING?: string;
  /** TSLD canvas live feedback + GPM float/drift visualisation — the in-flight ghost carrying the dragged bar's own label/progress/glyph while its source recedes, a cursor date chip + ruler guideline, start/finish dates flanking each bar behind a Dates toggle, hollow float/drift tails, and relationship slack on the selected activity's links (ADR-0054, docs/specs/canvas-live-feedback/). "true"/"1" enables it; off by default until the M6 draw-budget measurement + specialist reviews. */
  readonly VITE_CANVAS_LIVE_FEEDBACK?: string;
  /** Designed chrome band — the header row and (on a plan) the two toolbar rows rendered as ONE full-bleed band across the top, with the Project Explorer and the workspace below it; the toolbar reaches the band through a portal, so no plan state moves into the shell (ADR-0055, docs/specs/designed-ui/). Also stamps `data-designed-chrome` on <html>, activating the flagged token values. "true"/"1" enables it; off by default until the S5 enablement gate. */
  readonly VITE_DESIGNED_CHROME?: string;
  /** Canvas visual language — the diagram on a ground of its own with alternating month bands, so months are countable without labels (ADR-0055 §4, docs/specs/designed-ui/). "true"/"1" enables it; off by default until the S5 draw-budget gate. */
  readonly VITE_CANVAS_VISUAL_LANGUAGE?: string;
  /** TSLD time-axis legibility — range-anchored zoom presets, tiered gridlines, an interpolated Today marker + pill, and ground-vs-non-working shading (docs/specs/tsld-toolbar-canvas-refinements/). "true"/"1" enables it; off by default until the M7 enablement gate. */
  readonly VITE_CANVAS_TIME_AXIS?: string;
  /** Gantt view — a grid-and-bar projection of the same model, reached through the TSLD | Gantt view switch, for the audience that does not read logic diagrams (ADR-0059, docs/specs/gantt-view/). Read-only in the first slices. "true"/"1" enables it; off by default until the M6 enablement gate. */
  readonly VITE_GANTT_VIEW?: string;
  /** Tabbed activity editor — the 22-field single-submit dialog split into four tabs that save per write scope, with the progress model co-located (ADR-0060, docs/specs/activity-editor-restructure/). "true"/"1" enables it; off by default until the M6 enablement gate. */
  readonly VITE_ACTIVITY_EDITOR_TABS?: string;
  /** Activity-editor convergence — the per-activity Logic and Resources pop-outs folded into tabs of the editor above, rendering the same panels the dialogs render (docs/specs/activity-editor-logic-resources-convergence/). No permission change: the new scopes reuse the existing definition gate. "true"/"1" enables it; off by default until the M6 enablement gate. */
  readonly VITE_ACTIVITY_EDITOR_CONVERGENCE?: string;
  /** WBS improvements — managing a summary's membership from the summary, dissolving a grouping without deleting the work in it, the derived Unassigned bucket, and the pinned WBS band on the canvas (docs/specs/wbs-improvements/). "true"/"1" enables it; off by default until the enablement gate. */
  readonly VITE_WBS_IMPROVEMENTS?: string;
  /** ADR-0064 M1 — the additive canvas authoring-flow surface (band, confirmation, quiescence). */
  readonly VITE_CANVAS_AUTHORING_FLOW?: string;
  readonly VITE_CANVAS_LINK_ROUTING?: string;
  /** ADR-0067 — author a calendar's working HOURS, not just its working days. Default off. */
  readonly VITE_CALENDAR_SHIFT_EDITOR?: string;
  /** ADR-0070 — type a duration or lag in days, hours and minutes. Default off. */
  readonly VITE_SUB_DAY_DURATIONS?: string;
  /** ADR-0071 M4 — set how far into an activity a resource joins it. Default off. */
  readonly VITE_ASSIGNMENT_LAG?: string;
  /** Audit F4 — the Float paths panel: what binds after the critical path, and by how much. Default ON. */
  readonly VITE_FLOAT_PATHS?: string;
  /** ADR-0072 — the audit log screens: an organisation's history, and your own. Default off. */
  readonly VITE_AUDIT_LOG?: string;
  /** ADR-0073 C1 — narrow the audit log by category, outcome and date range. Default off. */
  readonly VITE_AUDIT_FILTERS?: string;
  readonly VITE_AUDIT_SELF_SECURITY?: string;
}
