# ADR-0012: Authorization — RBAC with resource scoping

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture, Security

## Context

Blank App is multi-tenant at the organisation level: users belong to one or more
organisations and may only act on data for organisations they're a member of, with
different capabilities (e.g. owner vs. member). We need an authorization model
that is expressive enough for this, simple to reason about, and enforced
consistently server-side. Authentication (who you are) is ADR-0003; this ADR is
about **what you may do**.

## Decision

**Role-Based Access Control (RBAC) with resource (organisation) scoping**, enforced
in the API.

- **Roles** are scoped to an organisation membership (e.g. `OWNER`, `MEMBER`,
  `VIEWER`), not global. A user's capabilities depend on their role _in the
  organisation that owns the resource_.
- **Permissions** are derived from roles (a role grants a set of permissions
  such as `item:create`, `item:delete`, `organisation:manage`). Code checks
  **permissions**, not role names, so the role→permission mapping can evolve.
- **Enforcement:** a global authentication guard establishes the principal; a
  `PermissionsGuard` + `@RequirePermissions()` decorator enforces required
  permissions; **resource-scope checks** verify the principal's membership/role
  for the specific resource (defence against IDOR). The client never makes trust
  decisions; the server always re-checks.
- **Policy layer:** permission→capability logic lives in an authorization
  service/policy (evaluated with **CASL** for richer object-level rules as they
  arise), keeping guards thin and rules testable.
- **Deny by default:** every endpoint is protected unless explicitly `@Public()`.

## Alternatives considered

- **Global roles only** — cannot express "owner of organisation A, viewer of B".
  Rejected.
- **ABAC / policy engine (OPA) from the start** — powerful but heavy; RBAC +
  scoping covers current needs, with CASL giving us object-level rules without a
  separate service. Revisit if policies grow complex.
- **Ad-hoc `if (user.role === …)` checks in controllers** — scatters and drifts;
  unauditable. Rejected in favour of guards + a policy layer.

## Consequences

- **Positive:** consistent, testable, least-privilege authorization; expresses
  multi-organisation membership; resistant to IDOR via scope checks; deny-by-default.
- **Negative / risks:** must always pair permission checks with resource-scope
  checks — enforced by the Security Reviewer agent and demonstrated in the
  reference feature.

## References

- `docs/SECURITY_STANDARDS.md`, `docs/BACKEND_ARCHITECTURE.md` (Authorisation),
  ADR-0003
