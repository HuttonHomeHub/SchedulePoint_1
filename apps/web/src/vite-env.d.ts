/// <reference types="vite/client" />

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
}
