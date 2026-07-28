# SchedulePoint documentation

This directory is the deep reference for SchedulePoint. The
[`CLAUDE.md`](../CLAUDE.md) operating manual at the repository root is the
source of truth for standards; these documents expand on specific areas.

## Index

| Document                                             | What it covers                                           |
| ---------------------------------------------------- | -------------------------------------------------------- |
| [PROJECT_BRIEF.md](PROJECT_BRIEF.md)                 | What SchedulePoint is: vision, users, MoSCoW scope       |
| [PROCESS.md](PROCESS.md)                             | Delivery process: idea → spec → design → plan → build    |
| [templates/](templates/)                             | Feature-spec & implementation-plan templates             |
| [examples/](examples/)                               | Worked example of the process (no code)                  |
| [ARCHITECTURE.md](ARCHITECTURE.md)                   | System design, components, data flow, boundaries         |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) | Frontend structure, state, routing, data, auth, theming  |
| [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)   | Modules, DI, validation, errors, jobs, cache, auth/z     |
| [DATABASE.md](DATABASE.md)                           | Schema standards & philosophy (Postgres + Prisma)        |
| [SECURITY_STANDARDS.md](SECURITY_STANDARDS.md)       | Security engineering standards (secure by default)       |
| [OBSERVABILITY.md](OBSERVABILITY.md)                 | Logging, correlation, health, metrics, tracing           |
| [PERFORMANCE.md](PERFORMANCE.md)                     | Caching, async, query optimisation, scalability          |
| [REFERENCE_FEATURE.md](REFERENCE_FEATURE.md)         | The backend implementation standard + its real exemplars |
| [API.md](API.md)                                     | REST conventions, versioning, error format, OpenAPI      |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                 | Design tokens, theming, component standards, a11y        |
| [UX_STANDARDS.md](UX_STANDARDS.md)                   | Project-wide UX principles and page standards            |
| [COMPONENT_LIBRARY.md](COMPONENT_LIBRARY.md)         | Component authoring, naming, and lifecycle               |
| [FRONTEND_QUALITY.md](FRONTEND_QUALITY.md)           | FE testing, a11y, perf, bundle, telemetry, logging       |
| [TESTING.md](TESTING.md)                             | Test strategy, tooling, coverage expectations            |
| [DEVELOPMENT.md](DEVELOPMENT.md)                     | Local environment setup and day-to-day workflow          |
| [DEPLOYMENT.md](DEPLOYMENT.md)                       | Release process, containers, environments                |
| [ROADMAP.md](ROADMAP.md)                             | Direction and milestones                                 |
| [BACKLOG.md](BACKLOG.md)                             | Candidate work, not yet scheduled                        |
| [DECISIONS.md](DECISIONS.md)                         | Lightweight running decision log                         |
| [TECH_DEBT.md](TECH_DEBT.md)                         | Known debt and remediation intent                        |
| [RECONCILE.md](RECONCILE.md)                         | The periodic drift check — trigger, checklist, findings  |
| [TOOLBAR_ROADMAP.md](TOOLBAR_ROADMAP.md)             | Which plan-toolbar controls are still placeholders       |
| [adr/](adr/)                                         | Formal Architecture Decision Records                     |
| [specs/](specs/)                                     | Per-feature specs & implementation plans — one dir each  |
| [runbooks/](runbooks/)                               | Operational procedures (e.g. feature-flag enablement)    |
| [archive/](archive/)                                 | Superseded documents, kept for the record only           |
| [plans/](plans/README.md)                            | Early features' plans — historical, ADR-cited, frozen    |

## Conventions

- Written in Markdown; diagrams use [Mermaid](https://mermaid.js.org) so they
  render on GitHub and stay diffable.
- Keep docs in lock-step with code — update them in the same PR as the change.
- Prefer linking to a single canonical explanation over duplicating it.
- **Relative links are gated.** `pnpm check:doc-links` runs in CI and fails on a
  relative link that does not resolve. If you delete something an ADR points at,
  unlink the reference to inline code rather than repointing it — the ADR should
  still read as written.
- **Say what is true, and mark what isn't yet.** Several of these documents
  describe standards for capabilities we have decided on but not built. Where
  that is the case it is stated inline, because a standard read as a
  description is how drift starts. If you find a claim that is no longer true,
  fix it in the pull request that finds it.
