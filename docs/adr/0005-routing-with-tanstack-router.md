# ADR-0005: Routing with TanStack Router

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Frontend architecture

## Context

Blank App is a single-page application served as static assets (see
`docs/ARCHITECTURE.md`). It needs client-side routing that is type-safe,
supports nested layouts, treats URL search params as first-class state (for
filters/pagination on data tables), and integrates with data prefetching and
authentication guards.

## Decision

We will use **[TanStack Router](https://tanstack.com/router)** with the Vite
plugin and file-based routes under `src/routes/`.

Reasons:

- **End-to-end type safety.** Route paths, path params, and **search params**
  are fully typed and validated (with schemas), eliminating a large class of
  runtime navigation bugs.
- **Search params as state.** First-class, typed, serialisable search-param
  APIs make table filters, sorting, and pagination shareable and reload-safe —
  a core need for a data-heavy SaaS (aligns with ADR-0004).
- **Data integration.** Route loaders integrate cleanly with TanStack Query for
  prefetching, and the router exposes built-in pending/error states that pair
  with our loading/error standards.
- **Nested layouts & guards.** Layout routes model the app shell (sidebar +
  header) once; `beforeLoad` guards implement the authentication flow
  (see `docs/FRONTEND_ARCHITECTURE.md`).

## Alternatives considered

- **React Router v7** — mature, ubiquitous, excellent docs. The strongest
  alternative. We chose TanStack Router primarily for its stronger type safety
  and typed search-param handling, which reduce long-term maintenance cost for
  data-heavy views. React Router remains a low-risk fallback if TanStack Router
  ever fails to meet our needs.
- **Next.js App Router** — implies adopting a full meta-framework and server
  runtime, which conflicts with our decoupled NestJS API + static SPA topology.
  Rejected for this project.

## Consequences

- **Positive:** typed navigation and search state; less defensive coding;
  consistent app-shell layouts; clean auth guards and prefetching.
- **Negative / risks:** smaller community than React Router; team must learn
  its patterns (documented). File-based routing conventions must be followed
  consistently — enforced in review.
- The library is added when the walking skeleton lands (roadmap M1); this ADR
  fixes the decision now so the architecture can assume it.

## References

- <https://tanstack.com/router>, ADR-0004, `docs/FRONTEND_ARCHITECTURE.md`
