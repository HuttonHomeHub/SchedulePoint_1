/**
 * The External-Guest request identity (ADR-0051 §3).
 *
 * A guest holds a revocable per-plan **share grant**, NOT an organisation
 * membership. This type is DELIBERATELY, STRUCTURALLY DISTINCT from
 * {@link Principal}: it has no `memberships` and no `can()`. Member service
 * methods take a `Principal`, so a `GuestPrincipal` can never flow into them —
 * a guest reaching a member surface is a **compile error**, not a runtime check
 * we could forget. Deny-by-default is preserved by construction.
 *
 * A guest is scoped to exactly ONE plan (and its owning organisation, carried so
 * reads can reuse the org-scoped repositories). `scope` is fixed to
 * `SCHEDULE_READ` in v1 and reserved so a future per-link `PlanShare.scope`
 * column can widen a specific link without changing this type.
 */
export type GuestScope = 'SCHEDULE_READ';

export class GuestPrincipal {
  constructor(
    /** The `PlanShare` row id backing this request (for audit/telemetry). */
    readonly shareId: string,
    /** The ONE plan this guest may read. */
    readonly planId: string,
    /** The plan's owning organisation — used only to scope repository reads. */
    readonly organizationId: string,
    /** Fixed read-only surface in v1 (reserved for future per-link scopes). */
    readonly scope: GuestScope = 'SCHEDULE_READ',
  ) {}
}
