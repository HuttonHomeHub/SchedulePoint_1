/// <reference types="vite/client" />

/**
 * The web app's own package version, baked in at build time by Vite's `define`
 * (see `vite.config.ts`). Read it through `APP_VERSION` in `config/env.ts`.
 */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** The persistent app-shell + hierarchy navigator (ADR-0029). "true"/"1" enables it; off by default. */
  /** Canvas-first plan workspace (ADR-0030). "true"/"1" enables it; off by default. */
  /** Canvas-first plan authoring (ADR-0032). "true"/"1" enables it; off by default. */
  readonly VITE_CANVAS_AUTHORING?: string;
  /** Scheduling modes & de-overloaded plan start (ADR-0033). On by default; "false"/"0" disables it. */
  /** Earned-Value web surface — plan EAC/currency settings, resource cost rate, activity cost & %-complete, assignment cost, and the EV analysis panel (EV4b, ADR-0042). "true"/"1" enables it; off by default. */
  readonly VITE_EARNED_VALUE?: string;
  /** Notes web surface — attributed note threads + composer on plans (plan-detail/workspace) and activities (Logic panel), plus the per-row count badge (Notes M3, ADR-0046). "true"/"1" enables it; off by default. */
  readonly VITE_NOTES?: string;
  /** TSLD canvas direct manipulation + visual refresh — time-true link anchoring (lag walked on the relationship's lag calendar from the constrained edge; lead = left) + directional arrowheads, duration resize on both bar edges, a draggable lag anchor, and the token-resolved bar/link visual refresh (ADR-0052, docs/specs/canvas-direct-manipulation/). On by default (2026-07-25, M1–M5 landed); "false"/"0" rolls back to the legacy edge-drag zones and canvas paint, byte-for-byte. */
  readonly VITE_CANVAS_DIRECT_MANIPULATION?: string;
  /** Designed chrome band — the header row and (on a plan) the two toolbar rows rendered as ONE full-bleed band across the top, with the Project Explorer and the workspace below it; the toolbar reaches the band through a portal, so no plan state moves into the shell (ADR-0055, docs/specs/designed-ui/). Also stamps `data-designed-chrome` on <html>, activating the flagged token values. "true"/"1" enables it; off by default until the S5 enablement gate. */
  /** Tabbed activity editor — the 22-field single-submit dialog split into four tabs that save per write scope, with the progress model co-located (ADR-0060, docs/specs/activity-editor-restructure/). "true"/"1" enables it; off by default until the M6 enablement gate. */
  /** WBS improvements — managing a summary's membership from the summary, dissolving a grouping without deleting the work in it, the derived Unassigned bucket, and the pinned WBS band on the canvas (docs/specs/wbs-improvements/). "true"/"1" enables it; off by default until the enablement gate. */
  readonly VITE_WBS_IMPROVEMENTS?: string;
  /** ADR-0064 M1 — the additive canvas authoring-flow surface (band, confirmation, quiescence). */
  readonly VITE_CANVAS_AUTHORING_FLOW?: string;
  readonly VITE_CANVAS_LINK_ROUTING?: string;
  /** Canvas status & feedback M1 — the TSLD data-date line, pill, legend + text equivalents. Default off. */
  readonly VITE_CANVAS_DATA_DATE?: string;
  /** ADR-0080 — the canvas plural selection and its bulk operations. Derived from
   *  VITE_CANVAS_DIRECT_MANIPULATION, because Shift is already the legacy link chord. Default on. */
  readonly VITE_CANVAS_MULTI_SELECT?: string;
  /** Activity copy, paste & duplicate (docs/specs/activity-copy-paste/) — Duplicate on the row menu
   *  and the canvas selection bar, band duplication, and Ctrl+C/Ctrl+V over a set. Default off. */
}
