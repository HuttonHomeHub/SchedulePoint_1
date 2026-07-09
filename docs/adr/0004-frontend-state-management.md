# ADR-0004: Frontend state management

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Frontend architecture

## Context

The web client will grow to include data-heavy views (lists, detail pages,dashboards), forms, and cross-cutting UI concerns (theme, auth session, toasts).
Conflating _server state_ (data owned by the API) with _client state_ (ephemeral
UI) is the most common source of frontend complexity: manual caching, stale
data, over-fetching, and sprawling global stores.

We need a model that scales, keeps data fresh, and stays simple by default.

## Decision

We will explicitly separate state into four categories, each with one home:

1. **Server state → [TanStack Query](https://tanstack.com/query).** All remote
   data lives in the Query cache. It owns fetching, caching, deduplication,
   background refetch, retries, and optimistic updates. Components never store
   fetched data in `useState`.
2. **URL state → the router.** Filters, pagination, sorting, and the active
   entity live in the URL (search params / path), via TanStack Router
   (see ADR-0005). This makes views shareable, deep-linkable, and reload-safe.
3. **Local component state → `useState`/`useReducer`.** The default for
   anything that doesn't outlive or escape a component.
4. **Global client state → React Context + [Zustand](https://zustand.docs.pmnd.rs)
   only where justified.** Context for stable, low-frequency cross-cutting
   values (theme, auth session). Zustand for genuinely global, higher-frequency
   UI state (e.g. a command palette, multi-step wizard) — introduced only when
   a real need appears, not pre-emptively.

Rule of thumb: **if it comes from the API, it belongs in TanStack Query; if it
belongs in a shareable URL, it belongs in the router; otherwise keep it local.**

## Alternatives considered

- **Redux Toolkit for everything** — powerful but heavy; conflates server and
  client state and adds significant boilerplate for data that Query handles for
  free. Rejected as the default.
- **Only Context + `useState`** — leads to hand-rolled caching and prop/context
  drilling as the app grows. Rejected.
- **Jotai/Recoil (atomic)** — good, but Zustand is simpler and sufficient for
  the small amount of true global UI state we anticipate.

## Consequences

- **Positive:** minimal global state; data stays fresh automatically; fewer
  bugs from manual cache management; shareable URLs.
- **Negative / risks:** engineers must internalise the server-vs-client
  distinction (documented in `docs/FRONTEND_ARCHITECTURE.md`). Zustand must not
  become a dumping ground for server data — enforced in review by the
  Component Reviewer agent.
- Query key conventions and cache defaults are specified in
  `docs/FRONTEND_ARCHITECTURE.md` (Data fetching & caching).

## References

- `docs/FRONTEND_ARCHITECTURE.md`, ADR-0005 (routing), ADR-0007 (forms)
