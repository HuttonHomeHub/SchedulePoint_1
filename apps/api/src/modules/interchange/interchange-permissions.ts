/**
 * This feature's permission codes (ADR-0050, C2). Following the reference-feature template, each feature
 * names its own codes here; the **grant** — which roles hold them — lives in the central role→permission
 * matrix (`common/auth/org-permissions.ts`), the single source `AuthContextService` uses to populate a
 * principal. `interchange:import` is granted to **Planner + Org Admin** there (a hierarchy-write rule,
 * deliberately not Contributor). This module references the code through the typed constant below so the
 * string is declared in exactly one place.
 */
export type InterchangePermission = 'interchange:import';

/** Import a foreign schedule file (XER now; MSPDI later) as a new plan. Planner + Org Admin. */
export const INTERCHANGE_IMPORT: InterchangePermission = 'interchange:import';
