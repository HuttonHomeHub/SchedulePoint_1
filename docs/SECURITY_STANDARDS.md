# Security Standards

> Engineering security standards for SchedulePoint — **security is enabled by
> default**, not opt-in. This complements the vulnerability-reporting policy in
> [`SECURITY.md`](../SECURITY.md) and `CLAUDE.md` §14. Backed by ADR-0003
> (auth), ADR-0012 (authorisation) and ADR-0051 (guest share links).
>
> Sections marked **_not yet implemented_** are standards we hold ourselves to
> when the work is done. They are not descriptions of the running system, and
> must not be cited as though they were.

## Principles

- **Secure by default, deny by default.** Every endpoint is authenticated and
  authorised unless explicitly public; every input is validated.
- **Least privilege** everywhere (DB roles, tokens, containers, CI scopes).
- **Defence in depth** — no single control is trusted alone.
- **The server never trusts the client.** All authorisation is re-checked
  server-side.

## Authentication

- **Better Auth** (ADR-0003): sessions in **secure, http-only, same-site
  cookies**; credentials hashed with a strong adaptive algorithm; no tokens in
  JS-accessible storage.
- A global `AuthenticationGuard` establishes the principal; unauthenticated
  requests get **401**. Sessions expire and can be revoked.
- Re-authentication for sensitive account actions (password/email change) is a
  standard we intend to hold — **not yet implemented**.

## Authorisation — RBAC & permissions (ADR-0012)

- **RBAC with organisation (resource) scoping.** Roles are per-membership
  (`ORG_ADMIN` / `PLANNER` / `CONTRIBUTOR` / `VIEWER`, ADR-0016); capabilities
  depend on the principal's role **in the organisation owning the resource**.
- Code checks **permissions** (`activity:delete`), never role names, via a
  `PermissionsGuard` + `@RequirePermissions()` at the boundary and
  `principal.can(permission, organizationId)` in the service. Object-level rules
  (e.g. note author-ownership) are explicit service-layer checks; there is no
  policy-engine dependency.
- **Always pair a permission check with a resource-scope check.** Services call
  `resolveScope(principal, orgSlug)` and then `can(...)` against the resolved
  organisation id. A permission check without a scope check **is** the IDOR bug.
- **Cross-organisation access returns 404, not 403.** A 403 confirms the
  resource exists; the uniform 404 gives no existence oracle. The same rule
  governs guest share-link resolution (ADR-0051).
- **Deny by default:** endpoints are protected unless `@Public()`. That list is
  short and reviewed — health, version, invitation acceptance, and the guest
  share surface — and every addition needs a written justification.
- **External guests are a separate principal type.** `GuestPrincipal` has no
  memberships and no `can()`; member service methods take `Principal`, so
  passing a guest into one is a **compile error**. Keep it that way: a runtime
  `if (isGuest)` check inside a member method is a regression, not a shortcut.
- **The pen is not authorisation.** `assertHoldsPen` (ADR-0028) returns **423**
  and answers "is anyone else editing?", not "may you edit?". It never replaces
  a permission check, and a permission check never replaces it.

## Secret management

- **No secrets in git — ever.** Config comes from the environment / a secret
  manager; `.env` is ignored, `.env.example` documents shape only.
- Secrets are rotated and scoped; separate secrets per environment. CI uses
  minimally-scoped tokens. Secret scanning + push protection are enabled.

## Input validation & output encoding

- **Validate all input at the boundary** with `class-validator` DTOs and a
  global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
  Reject unknown fields; enforce types, ranges, lengths, and formats.
- **Bound every numeric field, not just the obviously dangerous ones.** Money is
  stored as `BIGINT` minor units and its DTOs carry an explicit `@Max` ceiling;
  durations, lags and rates carry ranges. An unbounded number is an overflow or
  a denial-of-service waiting to be found.
- Validate config at startup (Zod) — fail fast on bad config.
- **Output encoding / XSS:** the API returns JSON (no HTML rendering); the SPA
  escapes by default and must never inject unsanitised HTML
  (`dangerouslySetInnerHTML` is disallowed without sanitisation). Strict
  security headers via Helmet (API) and nginx (web), including a tight CSP.

## SQL injection

- **Prisma parameterised queries only.** No string-built SQL. On the rare raw
  query, use Prisma's tagged-template parameterisation — never interpolate user
  input.

## CSRF

- Cookie-based sessions ⇒ **CSRF protection on all state-changing requests**
  (Better Auth CSRF tokens + same-site cookies). Safe methods (GET/HEAD) are
  side-effect-free.

## Tokens

Two token families exist, and both follow the same rule: **mint high-entropy,
store only a hash**.

- Invitation tokens and guest share tokens are minted at 256 bits and stored as
  SHA-256 digests (`common/tokens/`). The plaintext is returned **once**, at
  creation, and is never recoverable afterwards.
- A guest share token travels in the URL **fragment** so it never reaches a
  referrer header or a server access log, and is presented as
  `Authorization: Bearer`.
- Every grant is **revocable**, optionally expiring, and cascades with its
  parent's soft delete. Resolution of an unknown, revoked or expired token is a
  uniform **404**.

## Rate limiting & abuse protection

- **Global rate limiting** (`@nestjs/throttler`), with **stricter limits on
  unauthenticated and sensitive endpoints** — the guest share routes carry their
  own tighter per-IP `@Throttle`. Return **429**.
- Guard against enumeration (uniform responses on auth and on share-token
  resolution), and cap payload sizes and pagination limits server-side.

## Audit logging (ADR-0072)

The standard, and what is actually built:

- **Append-only audit log** for security- and sensitive events: authentication,
  permission changes (membership roles, invitations, organisation creation, guest
  share links) and hierarchy deletions/restores — who, what, when, and before→after
  where relevant. Twenty actions from a closed vocabulary; a new one is a compile
  error until someone decides what it may record.
- Audit entries are **never mutated or deleted** and are separate from operational
  logs. **No secrets or full PII** in payloads: `changes` is an **allow-list** keyed
  by action, not a deny-list, so a field is invisible until a person names it, and a
  substring ban on `password`/`token`/`secret`/`hash` is the second chance.
- Membership and hierarchy events are written **inside the caller's transaction** —
  an action that cannot be recorded does not happen. Authentication events are
  best-effort for the opposite reason: refusing every sign-in because the audit
  table is unavailable turns a logging fault into an outage. Both trades are
  documented at their call sites.
- **Every route is gated on an audit decision.** A new endpoint that is neither
  audited nor explicitly excused with a named reason fails CI, so the gap cannot
  open silently.

### What "append-only" honestly means here

The guarantee is enforced by `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE`
(statement) triggers, set `ENABLE ALWAYS` so they also fire in a replication
session. That stops accident, and it stops application code — **it does not stop
the table's owner**, who can `ALTER TABLE … DISABLE TRIGGER`. In the shipped Docker
Compose stack the application role is a superuser, so the honest claim is
**tamper-resistant, not tamper-proof**.

That bound is stated rather than implied, and `apps/api/test/audit-reset.ts` is the
proof it is accurate: the e2e harness clears the table by disabling the trigger,
because nothing else can. Nothing in `src/` may import it. Getting a copy off the
box — the only real tamper-**evidence** — is gated on the deployment-target
decision ([`TECH_DEBT.md`](TECH_DEBT.md) #5).

Row attribution remains what it was and is still not an audit trail: every row
carries `created_by`/`updated_by` and timestamps, soft deletes are correlated by
`delete_batch_id`, and sensitive operations emit structured logs
([`OBSERVABILITY.md`](OBSERVABILITY.md)) which are rotated and mutable at the sink.
The audit table is the durable record; those are the corroboration, joined to it by
`correlation_id`.

Coverage widening (content edits, share grants, reads of the log itself) is
deliberately deferred and tracked — see ADR-0072 and
[`TECH_DEBT.md`](TECH_DEBT.md) #14.

## Dependency security

- **Dependabot** for updates; **CodeQL** + secret scanning in CI. Security
  updates are prioritised. **Justify every new dependency** (maintenance,
  footprint). `pnpm` build scripts are allow-listed, not run blindly.
- Pin the toolchain; `--frozen-lockfile` installs; review transitive additions.

## Docker & runtime security

- **Multi-stage builds**, minimal base images, **non-root** container user,
  read-only where possible, no secrets baked into images.
- Only necessary ports exposed; healthchecks defined; images carry **SBOM +
  provenance** (see [`DEPLOYMENT.md`](DEPLOYMENT.md)). Base images updated via
  Dependabot.
- **HTTPS everywhere** in deployed environments; internal services least-
  privileged and network-restricted.

## Data protection & privacy

- Encrypt in transit (TLS) and at rest (managed DB encryption).
- Minimise collected PII; never log secrets, tokens, or PII (redaction in the
  logger — see [`OBSERVABILITY.md`](OBSERVABILITY.md)). The application stores
  little personal data: an account's name and email, and authorship attribution
  on the rows a user creates.
- **Erasure/export for privacy requests is _not yet implemented_.** Deletion
  throughout the app is a **soft** delete (recoverable by design — see
  [`DATABASE.md`](DATABASE.md)); there is no hard-delete path and no export
  endpoint. Both are needed before the product handles a subject-access or
  erasure request, and neither should be bolted on without an explicit,
  audited path.

## Secure-by-default checklist (per endpoint/feature)

- [ ] Authenticated (or explicitly `@Public()` with justification)
- [ ] Permission check **and** resource-scope check, in the service
- [ ] Cross-organisation access returns **404**, not 403 — with a test proving it
- [ ] DTO validation; unknown fields rejected; numeric bounds enforced
- [ ] Structural plan writes assert the pen (**423**) where ADR-0028 applies
- [ ] Rate limiting appropriate to sensitivity
- [ ] No secrets/PII in logs
- [ ] Errors return safe messages (no internals/stack traces)
- [ ] Parameterised queries only
