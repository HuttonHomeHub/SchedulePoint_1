# ADR-0003: Authentication with Better Auth

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Founding maintainers

## Context

Blank App handles sensitive application data and therefore needs robust
authentication and session management. Requirements:

- **Self-hosted** — we own user data; no hard dependency on a third-party auth
  SaaS.
- **TypeScript-native** and comfortable in a NestJS + Prisma + PostgreSQL stack.
- Secure sessions (http-only, same-site cookies), credential hashing, CSRF
  protection, and a path to email/password plus OAuth providers and 2FA.

The stack proposal named **Better Auth**, "or a superior self-hosted
alternative with justification". This ADR records the evaluation.

## Decision

We will use **Better Auth** as the self-hosted authentication layer.

- It is framework-agnostic and TypeScript-first, integrates cleanly with Prisma
  and PostgreSQL, and provides sessions, account management, OAuth, and 2FA via
  plugins.
- The API owns all authentication and authorisation decisions; the client never
  makes trust decisions.
- We will keep authentication behind a thin internal boundary so the provider
  can be swapped if needed (see risk below).

## Alternatives considered

- **Auth.js (NextAuth)** — excellent, but its centre of gravity is Next.js; a
  weaker fit for a NestJS API + separate Vite SPA.
- **Lucia** — a good library, but its maintainers announced a wind-down /
  reduced-maintenance direction, making it a poor long-term bet.
- **Keycloak / Ory (Kratos/Hydra)** — very capable, standards-based identity
  platforms, but introduce a separate service to operate and a heavier
  operational and cognitive footprint than this stage warrants.
- **Roll our own** — highest risk for a security-critical component; rejected.

**Justification for Better Auth over the above:** it best matches our
self-hosted, TypeScript-native, Prisma/Postgres, API-owns-auth constraints with
the lowest operational overhead, while still covering OAuth/2FA needs as we grow.

## Consequences

- **Positive:** cohesive TypeScript integration, self-hosted control, quick to
  adopt, no extra service to run initially.
- **Negative / risks:** Better Auth is comparatively young; ecosystem maturity
  and long-term maintenance are risks (tracked in
  [`TECH_DEBT.md`](../TECH_DEBT.md) #7). We mitigate by isolating auth behind an
  internal boundary and monitoring releases/advisories.
- Requires a strong, per-environment `BETTER_AUTH_SECRET` (see
  [`.env.example`](../../.env.example)) and HTTPS in all deployed environments.

## References

- <https://www.better-auth.com>
- [`docs/ARCHITECTURE.md` §6](../ARCHITECTURE.md), [`SECURITY.md`](../../SECURITY.md)
