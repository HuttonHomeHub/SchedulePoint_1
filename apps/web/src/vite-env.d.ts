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
}
