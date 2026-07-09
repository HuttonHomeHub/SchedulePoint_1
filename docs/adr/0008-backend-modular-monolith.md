# ADR-0008: Backend as a modular monolith with layered modules

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture

## Context

Blank App needs a backend that a small team can build quickly and evolve safely for
a decade, without prematurely paying the operational tax of microservices. It
must have clear internal boundaries so it _could_ be split later, strong
testability, and a single deployable artifact.

## Decision

Build the API as a **modular monolith** using **NestJS feature modules**, with a
consistent **layered structure inside each module**:

- **Controller** — HTTP surface only: routing, request/response DTOs,
  validation, OpenAPI annotations, status codes. No business logic.
- **Service** — use-case/business logic; orchestrates repositories and other
  services; owns transactions.
- **Repository (Prisma)** — data access; the only layer that touches Prisma.
  Encapsulates queries so the persistence detail never leaks upward.
- **DTOs / mappers** — typed request/response models and domain↔DTO mapping.

**Dependency rule:** dependencies point inward — controller → service →
repository. Nothing depends on the controller. Modules communicate only through
their **exported providers** (public surface); internal providers stay private.
**No feature module imports another's internals**; shared concerns live in a
`common` module or shared packages (`@repo/types`).

**Dependency injection** is NestJS's constructor injection throughout. Depend on
**interfaces/abstract classes** for infrastructure seams (auth, storage, cache,
clock) so implementations are swappable and easily faked in tests. Providers use
explicit tokens where an interface has multiple implementations.

## Alternatives considered

- **Microservices from day one** — premature; adds network, deployment, and
  data-consistency complexity we don't yet need. The modular monolith keeps the
  option open (modules are seams for future extraction). Rejected for now.
- **Unstructured "fat controllers" / active-record models** — fast initially,
  unmaintainable at scale; business logic scatters and becomes untestable.
  Rejected.
- **Full hexagonal/onion architecture with ports/adapters everywhere** — sound
  but heavier than warranted; we adopt its useful core (inward dependencies,
  infrastructure behind interfaces) without ceremony.

## Consequences

- **Positive:** one simple deployable; fast local dev; clear, testable
  boundaries; logic isolated from HTTP and persistence; future extraction
  possible along module lines.
- **Negative / risks:** discipline required to keep layers/boundaries clean —
  enforced by the API Reviewer agent and documented in
  `docs/BACKEND_ARCHITECTURE.md`. A shared database means module data isolation
  is by convention, not by force.

## References

- `docs/BACKEND_ARCHITECTURE.md`, `apps/api/examples/reference-feature/` (template)
