# Backlog

Candidate work that is **not yet scheduled**. This is a grooming space; once an
item is ready and prioritised, promote it to a GitHub issue (with acceptance
criteria) and, if it shapes the product, reflect it in [ROADMAP.md](ROADMAP.md).

> Convention: keep items outcome-focused. Prefix with a rough size —
> `S`/`M`/`L` — when known. Remove items once they become issues.

## Foundation follow-ups (near-term)

- `S` Add a PR-title/commit lint check to CI (belt-and-braces with the git hook).
- `S` Add `release-please`/Changesets bot permissions & branch protection rules.
- `M` Decide and document the hosting platform (see [TECH_DEBT.md](TECH_DEBT.md)).
- `M` Add automated accessibility checks into Playwright journeys.
- `S` Add an automated design-token contrast check (parse `globals.css`, verify
  WCAG AA for all fill/foreground pairs) and run it in CI.
- `M` Scaffold the web walking skeleton (entry point, providers, router, app
  shell, base shadcn/ui primitives) per `docs/FRONTEND_ARCHITECTURE.md`, then
  add the frontend libraries (TanStack Router/Query, RHF, Zod, CVA).
- `M` Consider a Nest schematic / generator (`nest g` or a small `scripts/`
  scaffolder) to create a feature from the template automatically, instead of
  copy-and-adapt (ADR-0015 alternative).
- `S` Add a runnable **frontend** feature template (once the web app boots) that
  mirrors the backend template, so `docs/REFERENCE_FEATURE.md`'s frontend section
  is CI-verified too.
- `M` Centralise the soft-delete filter via a Prisma client extension (so it's
  enforced globally, not per-repository) once a second model exists.

## Product (unscheduled)

> Blank App is a base repository with **no product backlog of its own**. When you
> build an application, list its candidate features here. Common building blocks
> the foundation already supports (add when a real feature needs them):
> authentication + accounts (wire Better Auth into the seam), organisation
> membership & invitations (RBAC is ready), notifications (BullMQ), file uploads
> (object storage), and internationalisation.

## Engineering / platform (unscheduled)

- `M` Observability: metrics + tracing backend selection.
- `M` Rate limiting and abuse protection on the API.
- `S` Bundle-size budget checks in CI for the web app.
- `M` Performance budget/Lighthouse CI on key pages.
- `S` Dependency license checking in CI.
