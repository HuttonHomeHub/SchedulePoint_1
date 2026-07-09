# Security Standards

> Engineering security standards for Blank App — **security is enabled by default**,
> not opt-in. This complements the vulnerability-reporting policy in
> [`SECURITY.md`](../SECURITY.md) and `CLAUDE.md` §14. Backed by ADR-0003
> (auth) and ADR-0012 (authorisation).

## Principles

- **Secure by default, deny by default.** Every endpoint is authenticated and
  authorised unless explicitly public; every input is validated.
- **Least privilege** everywhere (DB roles, tokens, containers, buckets).
- **Defence in depth** — no single control is trusted alone.
- **The server never trusts the client.** All authorisation is re-checked
  server-side.

## Authentication

- **Better Auth** (ADR-0003): sessions in **secure, http-only, same-site
  cookies**; credentials hashed with a strong adaptive algorithm; no tokens in
  JS-accessible storage.
- A global authentication guard establishes the principal; unauthenticated
  requests get **401**. Sessions expire and can be revoked.
- Sensitive actions (password/email change, etc.) require re-authentication.

## Authorisation — RBAC & permissions (ADR-0012)

- **RBAC with organisation (resource) scoping.** Roles are per-membership;
  capabilities depend on the principal's role **in the organisation owning the
  resource**.
- Code checks **permissions** (`item:delete`), not role names, via a
  `PermissionsGuard` + `@RequirePermissions()`; a policy layer (CASL) handles
  object-level rules.
- **Always pair a permission check with a resource-scope check** (verify
  membership for the specific id) — this is the primary defence against **IDOR**.
- **Deny by default:** endpoints are protected unless `@Public()`.

## Secret management

- **No secrets in git — ever.** Config comes from the environment / a secret
  manager; `.env` is ignored, `.env.example` documents shape only.
- Secrets are rotated and scoped; separate secrets per environment. CI uses
  minimally-scoped tokens. Secret scanning + push protection are enabled.

## Input validation & output encoding

- **Validate all input at the boundary** with `class-validator` DTOs and a
  global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
  Reject unknown fields; enforce types, ranges, lengths, and formats.
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

## Rate limiting & abuse protection

- **Global rate limiting** (`@nestjs/throttler`), with **stricter limits on
  auth and other sensitive endpoints**. Return **429** with `Retry-After`.
- Guard against enumeration (uniform responses/timing on auth), and cap payload
  sizes and pagination limits server-side.

## Audit logging

- **Append-only audit log** for security- and sensitive events
  (authentication events, permission changes, sensitive mutations,
  deletions/exports): who, what, when, and before→after where relevant.
- Audit entries are **never mutated or deleted** and are separate from
  operational logs. **No secrets or full PII** in audit payloads.

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

- Encrypt in transit (TLS) and at rest (managed DB/bucket encryption).
- Minimise collected PII; never log secrets, tokens, full card/sensitive values,
  or PII (redaction in the logger — see [`OBSERVABILITY.md`](OBSERVABILITY.md)).
- Support erasure/export for privacy requests (hard delete path is explicit and
  audited).

## Secure-by-default checklist (per endpoint/feature)

- [ ] Authenticated (or explicitly `@Public()` with justification)
- [ ] Permission check **and** resource-scope check
- [ ] DTO validation; unknown fields rejected; limits enforced
- [ ] Rate limiting appropriate to sensitivity
- [ ] No secrets/PII in logs; audit entry for sensitive mutations
- [ ] Errors return safe messages (no internals/stack traces)
- [ ] Parameterised queries only
