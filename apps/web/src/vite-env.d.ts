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
  /** Advanced activity types — the Level-of-Effort (later WBS-summary) option in the Type picker (ADR-0035 §21/§24, M5-epic). "true"/"1" enables it; off by default. */
  readonly VITE_ADVANCED_ACTIVITY_TYPES?: string;
  /** Web resource surface — library screen + per-activity assignments (M7.1, ADR-0039). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCES?: string;
  /** Resource levelling — plan level-resources/within-float toggles, resource max units/hour, activity levelling priority, levelled summary overlay (ADR-0041). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCE_LEVELLING?: string;
  /** Earned-Value web surface — plan EAC/currency settings, resource cost rate, activity cost & %-complete, assignment cost, and the EV analysis panel (EV4b, ADR-0042). "true"/"1" enables it; off by default. */
  readonly VITE_EARNED_VALUE?: string;
  /** Resource loading-curves web surface — the per-assignment loading-curve picker (Uniform/Bell/Front-loaded/Back-loaded/Double-peak) + the Resource histogram read view (M7 rung 5, ADR-0044 §3). "true"/"1" enables it; off by default. */
  readonly VITE_RESOURCE_CURVES?: string;
  /** Inter-project / external dates web surface — activity external early-start/late-finish, plan ignore-external toggle, externally-driven summary count (F5, ADR-0043). "true"/"1" enables it; off by default. */
  readonly VITE_INTER_PROJECT_DATES?: string;
  /** Notes web surface — attributed note threads + composer on plans (plan-detail/workspace) and activities (Logic panel), plus the per-row count badge (Notes M3, ADR-0046). "true"/"1" enables it; off by default. */
  readonly VITE_NOTES?: string;
  /** TSLD canvas insight lenses — filter/search dimming, Colour-by (Criticality/Total-float/WBS), and the baseline ghost overlay, turning three Look-row toolbar placeholders into real client-side read lenses (docs/specs/canvas-lenses/). "true"/"1" enables it; off by default during build (flips on at M4). */
  readonly VITE_CANVAS_LENSES?: string;
  /** TSLD canvas navigation & authoring aids — Isolate logic path (dim off-chain), Next conflict (cycle flagged activities), wiring toolbar placeholders to shipped data (docs/specs/canvas-nav/). "true"/"1" enables it; off by default during build (flips on at M4). */
  readonly VITE_CANVAS_NAV?: string;
  /** TSLD canvas-axis-aligned resource strip — turns the `resource-view` toolbar placeholder into a demand strip pinned to the TSLD time axis (a Canvas 2D sibling layer painted by the `TsldCanvas` loop from the shared viewport), over the already-shipped resource-histogram read-model (Stage E, ADR-0049, docs/specs/canvas-resource-view/). Gated on VITE_RESOURCE_CURVES. "true"/"1" enables it; off by default during build (flips on after reviews, Task 6). */
  readonly VITE_CANVAS_RESOURCE_VIEW?: string;
  /** External-Guest per-plan share links web surface — the member Share dialog (toolbar `share` item: list/create/revoke a plan's guest links + one-time URL, gated on `plan:share`) + the public read-only `/share` guest view (session-less, token in the URL fragment), over the already-shipped F-M2 management + F-M3 guest-read endpoints (Stage F M4, ADR-0051, docs/specs/external-guest-share-link/). "true"/"1" enables it; off by default during build (flips on after the specialist reviews + Playwright journey). */
  readonly VITE_GUEST_SHARE_LINKS?: string;
  /** TSLD canvas direct manipulation + visual refresh — time-true link anchoring (lag walked on the relationship's lag calendar from the constrained edge; lead = left) + directional arrowheads, duration resize on both bar edges, a draggable lag anchor, and the token-resolved bar/link visual refresh (ADR-0052, docs/specs/canvas-direct-manipulation/). On by default (2026-07-25, M1–M5 landed); "false"/"0" rolls back to the legacy edge-drag zones and canvas paint, byte-for-byte. */
  readonly VITE_CANVAS_DIRECT_MANIPULATION?: string;
  /** Designed chrome band — the header row and (on a plan) the two toolbar rows rendered as ONE full-bleed band across the top, with the Project Explorer and the workspace below it; the toolbar reaches the band through a portal, so no plan state moves into the shell (ADR-0055, docs/specs/designed-ui/). Also stamps `data-designed-chrome` on <html>, activating the flagged token values. "true"/"1" enables it; off by default until the S5 enablement gate. */
  /** TSLD time-axis legibility — range-anchored zoom presets, tiered gridlines, an interpolated Today marker + pill, and ground-vs-non-working shading (docs/specs/tsld-toolbar-canvas-refinements/). "true"/"1" enables it; off by default until the M7 enablement gate. */
  readonly VITE_CANVAS_TIME_AXIS?: string;
  /** Tabbed activity editor — the 22-field single-submit dialog split into four tabs that save per write scope, with the progress model co-located (ADR-0060, docs/specs/activity-editor-restructure/). "true"/"1" enables it; off by default until the M6 enablement gate. */
  /** Activity-editor convergence — the per-activity Logic and Resources pop-outs folded into tabs of the editor above, rendering the same panels the dialogs render (docs/specs/activity-editor-logic-resources-convergence/). No permission change: the new scopes reuse the existing definition gate. "true"/"1" enables it; off by default until the M6 enablement gate. */
  readonly VITE_ACTIVITY_EDITOR_CONVERGENCE?: string;
  /** WBS improvements — managing a summary's membership from the summary, dissolving a grouping without deleting the work in it, the derived Unassigned bucket, and the pinned WBS band on the canvas (docs/specs/wbs-improvements/). "true"/"1" enables it; off by default until the enablement gate. */
  readonly VITE_WBS_IMPROVEMENTS?: string;
  /** ADR-0064 M1 — the additive canvas authoring-flow surface (band, confirmation, quiescence). */
  readonly VITE_CANVAS_AUTHORING_FLOW?: string;
  readonly VITE_CANVAS_LINK_ROUTING?: string;
  /** Canvas status & feedback M1 — the TSLD data-date line, pill, legend + text equivalents. Default off. */
  readonly VITE_CANVAS_DATA_DATE?: string;
  /** Search that navigates — Enter cycles the matches, centring, selecting and announcing each.
   *  Derived from VITE_CANVAS_LENSES; the search field is a lenses control. Default off. */
  readonly VITE_CANVAS_SEARCH_NAV?: string;
  /** ADR-0080 — the canvas plural selection and its bulk operations. Derived from
   *  VITE_CANVAS_DIRECT_MANIPULATION, because Shift is already the legacy link chord. Default on. */
  readonly VITE_CANVAS_MULTI_SELECT?: string;
  /** Activity copy, paste & duplicate (docs/specs/activity-copy-paste/) — Duplicate on the row menu
   *  and the canvas selection bar, band duplication, and Ctrl+C/Ctrl+V over a set. Default off. */
}
