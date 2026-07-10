# Architecture Decision Records (ADRs)

This directory holds our Architecture Decision Records — short documents that
capture a significant, architecturally-relevant decision, its context, and its
consequences. The practice itself is described in
[ADR-0001](0001-record-architecture-decisions.md).

## Why

Decisions have long lifespans and their rationale is easily lost. ADRs give
future maintainers (human or AI) the _why_, not just the _what_.

## Conventions

- One decision per file, named `NNNN-title-in-kebab-case.md` (zero-padded,
  monotonically increasing).
- Statuses: `Proposed`, `Accepted`, `Superseded by ADR-XXXX`, `Deprecated`.
- **ADRs are immutable once accepted.** To change a decision, add a new ADR that
  supersedes the old one; update the old one's status to point at it. Never
  delete an ADR.
- Use [`_template.md`](_template.md) as the starting point.

## Index

| ADR                                                        | Title                                     | Status   |
| ---------------------------------------------------------- | ----------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)              | Record architecture decisions             | Accepted |
| [0002](0002-monorepo-with-turborepo-and-pnpm.md)           | Monorepo with Turborepo and pnpm          | Accepted |
| [0003](0003-authentication-with-better-auth.md)            | Authentication with Better Auth           | Accepted |
| [0004](0004-frontend-state-management.md)                  | Frontend state management                 | Accepted |
| [0005](0005-routing-with-tanstack-router.md)               | Routing with TanStack Router              | Accepted |
| [0006](0006-styling-and-design-tokens.md)                  | Styling and design tokens                 | Accepted |
| [0007](0007-forms-and-validation.md)                       | Forms and validation                      | Accepted |
| [0008](0008-backend-modular-monolith.md)                   | Backend modular monolith                  | Accepted |
| [0009](0009-background-processing-bullmq.md)               | Background processing (BullMQ)            | Accepted |
| [0010](0010-caching-with-redis.md)                         | Caching with Redis                        | Accepted |
| [0011](0011-object-storage-abstraction.md)                 | Object storage abstraction                | Accepted |
| [0012](0012-authorization-rbac-scoped.md)                  | Authorisation: RBAC + scoping             | Accepted |
| [0013](0013-observability-otel-pino.md)                    | Observability (OTel + Pino)               | Accepted |
| [0014](0014-reference-feature-as-non-shipping-template.md) | Reference feature → non-shipping template | Accepted |
| [0015](0015-template-driven-feature-development.md)        | Template-driven feature development       | Accepted |
| [0016](0016-core-identity-tenancy-role-model.md)           | Core identity & tenancy role model        | Accepted |
| [0017](0017-release-tagging-and-image-publishing.md)       | Release tagging & image publishing        | Accepted |
| [0018](0018-self-migrating-container-image.md)             | Self-migrating container image            | Accepted |
| [0019](0019-shared-package-build-contract.md)              | Shared-package build contract             | Accepted |
| [0020](0020-ci-image-smoke-boot.md)                        | CI image build & smoke-boot               | Accepted |
| [0021](0021-dependency-graph-dag-invariant.md)             | Dependency graph DAG invariant            | Accepted |
| [0022](0022-cpm-execution-and-persistence-model.md)        | CPM execution & persistence model         | Accepted |
| [0023](0023-cpm-scheduling-date-convention.md)             | CPM scheduling date convention            | Accepted |
