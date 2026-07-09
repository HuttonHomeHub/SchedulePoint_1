# CLAUDE.md — Project Operating Manual

> This file is the permanent operating manual for the **SchedulePoint** repository.
> It is authored for both human engineers and AI assistants (Claude Code).
> **Keep it current.** Any change that alters architecture, standards, tooling,
> or process MUST update this file in the same pull request.

---

## 1. What this project is

**SchedulePoint** is a browser-based **construction scheduling** application
built around a **Time-Scaled Logic Diagram (TSLD)** as its primary editing
surface: planners draw activities directly on a timeline and connect them with
logic (in the tradition of the Graphical Path Method), rather than entering data
into a Gantt grid. It delivers the CPM/GPM feature set construction planners
actually use — four dependency types with lag, calendars, constraints, progress,
floats, baselines, and resources — with a live critical path and collaborative,
browser-native team use. See the full product context in
[`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md).

> **Current stage: foundation in place, application features not yet built.** The
> engineering foundation (tooling, structure, CI/CD, containers, docs, standards,
> delivery process, reference template) exists; SchedulePoint's domain/business
> code does **not** yet. Build features from the reference template (§12,
> ADR-0015) via the delivery process (§21). Do not assume domain code exists —
> check before referencing it.
>
> SchedulePoint is **multi-tenant**: users belong to one or more
> **organisations**; clients, projects, plans and their activities are
> organisation-scoped. Roles are **Org Admin, Planner, Contributor, Viewer**, and
> **External Guest** (per-plan share link) — see
> [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) §5 and ADR-0012.

## 2. Project philosophy

We optimise, in order, for: **correctness → clarity → maintainability →
performance**. Concretely:

- **Boring, proven technology** over novelty. Every dependency is a liability.
- **Small, reviewable changes.** One logical change per pull request.
- **Automate everything repeatable** — formatting, linting, testing, releases.
- **Documentation is part of the change**, not an afterthought.
- **Security and accessibility are requirements, not features.**
- **Leave the campsite cleaner than you found it**, but avoid drive-by churn in
  unrelated files.

## 3. Technology stack

| Concern        | Choice                                              |
| -------------- | --------------------------------------------------- |
| Monorepo       | Turborepo + pnpm workspaces                         |
| Language       | TypeScript (strict) on Node.js 22 LTS               |
| Frontend       | React 19 + Vite                                     |
| Styling / UI   | Tailwind CSS v4, shadcn/ui, Lucide icons            |
| Backend        | NestJS 11                                           |
| Database / ORM | PostgreSQL 17 + Prisma                              |
| API            | REST, documented with OpenAPI (`@nestjs/swagger`)   |
| Auth           | Better Auth (self-hosted) — see ADR-0003            |
| Testing        | Vitest (unit), Supertest (API e2e), Playwright (UI) |
| Containers     | Docker + Docker Compose; images on GHCR             |
| CI/CD          | GitHub Actions                                      |
| Versioning     | SemVer via Conventional Commits + Changesets        |
| Docs           | Markdown + Mermaid diagrams                         |

The rationale for the big decisions lives in [`docs/adr/`](docs/adr/).

## 4. Repository layout

```text
Blank App/
├── apps/
│   ├── web/          # React + Vite client (@repo/web)
│   └── api/          # NestJS REST API (@repo/api)
├── packages/
│   ├── config/       # Shared ESLint + tsconfig presets (@repo/config)
│   └── types/        # Shared cross-boundary types/DTOs (@repo/types)
├── docs/             # Architecture, guides, ADRs, roadmap, decisions
├── scripts/          # Repo automation (bootstrap, etc.)
├── .github/          # CI/CD workflows, issue/PR templates, CODEOWNERS
├── .changeset/       # Release/versioning state
├── CLAUDE.md         # ← you are here
└── (root configs)    # turbo, tsconfig.base, eslint, prettier, docker-compose…
```

## 5. Coding standards

- **TypeScript strict everywhere.** No `any` without a written justification;
  prefer `unknown` + narrowing. `noUncheckedIndexedAccess` is on.
- **Formatting is not a debate.** Prettier owns formatting; ESLint owns
  correctness. Never hand-format to fight the tools.
- **Naming:** `camelCase` for variables/functions, `PascalCase` for
  types/components/classes, `SCREAMING_SNAKE_CASE` for constants, `kebab-case`
  for file names (React components may use `PascalCase.tsx`).
- **Imports** are ordered/grouped automatically (`import/order`). Use the `@/`
  alias for intra-package imports and `@repo/*` for cross-package.
- **No dead code, no commented-out code.** Delete it; git remembers.
- **Errors:** never swallow. Fail loud in development, degrade gracefully in
  production, and always log with context.
- **Comments explain _why_, not _what_.** Match the density of surrounding code.
- **Frontend:** function components + hooks only. Co-locate state with the
  feature. Shared primitives live in `components/`, generated shadcn/ui parts in
  `components/ui/`.
- **Backend:** thin controllers, logic in services, validation via DTOs
  (`class-validator`). One feature per Nest module. Prisma access is wrapped in
  a `PrismaService`.

## 6. Documentation rules

- Documentation lives in Markdown; diagrams use **Mermaid** (rendered by GitHub).
- Every significant change updates the relevant doc(s). The reviewer checks this.
- **Architectural decisions** are recorded as ADRs in [`docs/adr/`](docs/adr/)
  (see ADR-0001 for the process). Never delete an ADR — supersede it.
- Keep `README.md` accurate as the front door; keep this file accurate as the
  operating manual; keep `docs/` as the deep reference.
- Public API changes update [`docs/API.md`](docs/API.md) and the OpenAPI spec.

## 7. Testing requirements

See [`docs/TESTING.md`](docs/TESTING.md) for the full strategy. In short:

- **Every bug fix ships with a regression test.** Every feature ships with tests.
- **Unit** (Vitest) for pure logic and components; **integration/e2e** (Supertest)
  for API endpoints against a real Postgres; **end-to-end** (Playwright) for
  critical user journeys.
- Target **≥ 80% line coverage** on changed code; coverage must not regress.
- Tests are deterministic and isolated — no shared mutable state, no reliance on
  wall-clock time or network unless explicitly mocked.
- CI (`pnpm test`) must be green before merge. Do not merge red.

## 8. Branching strategy

- **Trunk-based.** `main` is always releasable and protected.
- Work happens on short-lived branches: `feat/<slug>`, `fix/<slug>`,
  `docs/<slug>`, `chore/<slug>`.
- Open a PR early; keep it small; rebase (don't merge) `main` into your branch to
  stay current. Squash-merge into `main` with a Conventional Commit title.
- Never force-push `main`. Never commit directly to `main`.

## 9. Commit standards

- **[Conventional Commits](https://www.conventionalcommits.org/)** are enforced
  by commitlint (git hook + expected in PR titles).
- Format: `type(scope): subject` — e.g. `feat(api): add a recurring job scheduler`.
- Allowed types: `feat, fix, docs, style, refactor, perf, test, build, ci, chore,
revert`. Scopes: `web, api, config, types, db, ci, docs, deps, release, repo`.
- Breaking changes: append `!` (`feat(api)!: …`) and a `BREAKING CHANGE:` footer.
- Subject: imperative mood, lower-case, no trailing period, ≤ 100 chars.

## 10. Versioning strategy

- **Semantic Versioning** (`MAJOR.MINOR.PATCH`), driven by **Changesets**.
- User-visible changes add a changeset (`pnpm changeset`) describing the bump.
- While pre-1.0, breaking changes bump the **minor**; the public contract is not
  yet stable. The move to 1.0 is a deliberate, documented milestone.

## 11. Release & deployment process

Full detail in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Summary:

1. Merging changesets to `main` makes the **Release** workflow open/update a
   "Version Packages" PR.
2. Merging that PR bumps versions, updates `CHANGELOG.md`, and tags `vX.Y.Z`.
3. The tag triggers the **Publish container images** workflow, pushing `api` and
   `web` images to **GHCR** with SemVer + SHA tags, SBOM, and provenance.
4. Deployment promotes those immutable images through environments.

## 12. Frontend architecture, UI standards & design system

The frontend is designed to scale for the project's lifetime. The governing
documents (keep them authoritative):

- [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) — folder/
  feature structure, state, routing, data fetching, caching, forms, errors,
  loading, auth flow, theme, responsive strategy.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — tokens (colour, type,
  spacing, sizing, elevation, radius, motion, breakpoints) and component
  standards. Token implementation: `apps/web/src/styles/globals.css`.
- [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) — project-wide UX principles.
- [`docs/COMPONENT_LIBRARY.md`](docs/COMPONENT_LIBRARY.md) — component authoring,
  naming, and lifecycle.
- [`docs/FRONTEND_QUALITY.md`](docs/FRONTEND_QUALITY.md) — testing, a11y, perf,
  bundle, splitting, error boundaries, telemetry, logging.

Essentials: feature-first structure; server state in TanStack Query; URL state
in the router (TanStack Router); minimal client state; forms via RHF + Zod;
styling via semantic tokens + Tailwind v4 + shadcn/ui + CVA. **Mobile-first,
theme-aware (light/dark/system), and no one-off component styling — ever.**

### Backend architecture & standards

The backend is designed to last a decade. Governing documents:

- [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) — modular
  monolith, module boundaries, DI, validation, error handling, config,
  background jobs, caching, file storage, auth/authz, observability.
- [`docs/API.md`](docs/API.md) — REST/OpenAPI standards.
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema standards & philosophy.
- [`docs/SECURITY_STANDARDS.md`](docs/SECURITY_STANDARDS.md) — security
  engineering standards (secure by default).
- [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) — logging, correlation,
  health/readiness, metrics, tracing.
- [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) — caching, async, query
  optimisation, scalability.
- [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md) — the non-shipping
  feature **template** (`apps/api/examples/reference-feature/`, ADR-0014).

Essentials: NestJS modular monolith; **thin controllers → services → Prisma**;
**deny-by-default** auth with **RBAC + resource (organisation) scoping**; validated
DTOs; standard `{ data, meta }` / `{ error }` envelopes; **soft deletes,
auditing, optimistic locking**; structured logs with correlation IDs. When
building a feature, copy the non-shipping reference template in
`apps/api/examples/reference-feature/` (ADR-0014). **Security is on by default.**

## 13. Accessibility requirements

- Target **WCAG 2.2 AA**. This is a merge requirement, not a nicety.
- Semantic HTML first; ARIA only to fill genuine gaps.
- Full keyboard operability, visible focus, and correct focus management.
- Colour contrast ≥ 4.5:1 (text). Never encode meaning in colour alone.
- `eslint-plugin-jsx-a11y` runs in CI; Playwright journeys include a11y checks.

## 14. Security requirements

See [`SECURITY.md`](SECURITY.md). Baseline:

- **No secrets in git.** Config comes from environment/secret manager. `.env` is
  ignored; `.env.example` documents the shape.
- Validate and sanitise all input at the boundary (DTOs + Prisma parameterised
  queries; never string-build SQL).
- Least-privilege everywhere (DB roles, container users, CI token scopes).
- Dependencies are watched by Dependabot; code by CodeQL + secret scanning.
- Auth via Better Auth with secure, http-only, same-site cookies; hashed
  credentials; CSRF protection on state-changing requests.
- Security headers via Helmet (API) and nginx (web).

## 15. Performance goals

Directional targets (revisit with real data — see `docs/TECH_DEBT.md`):

- **Web:** Largest Contentful Paint < 2.5s on a mid-tier mobile over 4G; keep the
  initial JS bundle lean (code-split by route); Core Web Vitals in the "good"
  band.
- **API:** p95 latency < 200ms for typical reads under expected load; paginate
  all list endpoints; index every column used in a `WHERE`/`ORDER BY`.
- Measure before optimising. No premature optimisation; no un-measured claims.

## 16. Architectural decisions

Recorded as ADRs in [`docs/adr/`](docs/adr/). Current set:

- **ADR-0001** — Record architecture decisions (this process).
- **ADR-0002** — Monorepo with Turborepo + pnpm.
- **ADR-0003** — Authentication with Better Auth.
- **ADR-0004** — Frontend state management (server/URL/local/global split).
- **ADR-0005** — Routing with TanStack Router.
- **ADR-0006** — Styling and design tokens (Tailwind v4 + shadcn/ui + CVA).
- **ADR-0007** — Forms and validation (React Hook Form + Zod).
- **ADR-0008** — Backend as a modular monolith with layered modules.
- **ADR-0009** — Background processing with BullMQ + Redis.
- **ADR-0010** — Caching strategy with Redis (cache-aside).
- **ADR-0011** — File storage via an S3-compatible abstraction.
- **ADR-0012** — Authorisation: RBAC with resource scoping.
- **ADR-0013** — Observability with OpenTelemetry + Pino.
- **ADR-0014** — Reference feature kept as a non-shipping template.
- **ADR-0015** — Template-driven feature development (canonical standard).

A lighter-weight running log of smaller decisions is in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## 17. Known limitations & assumptions

- No application/domain code exists yet; docs describe intent and conventions.
- The web app has no entry point yet, so CI builds only the API and runs e2e
  with the dev server skipped until the walking skeleton lands (see
  `docs/TECH_DEBT.md`).
- Deployment target (managed host vs. self-hosted Kubernetes) is **not yet
  decided**; the container/registry foundation is deliberately platform-neutral.
- Single-currency, single-locale assumptions are **not** baked in — i18n/L10n is
  on the roadmap and code should avoid hard-coding currency/locale.

## 18. Roadmap, backlog & technical debt

- Direction: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Candidate work: [`docs/BACKLOG.md`](docs/BACKLOG.md)
- Debt register: [`docs/TECH_DEBT.md`](docs/TECH_DEBT.md)

## 19. Working agreement for AI assistants

When operating in this repo, Claude Code should:

1. **Never jump from an idea to implementation.** For a new feature/requirement,
   follow the delivery process (§21, [`docs/PROCESS.md`](docs/PROCESS.md)):
   understand → design → plan → **get approval** → build. Use the
   **feature-analyst** agent to produce the spec + plan.
2. **Build features from the reference template.** New features are created by
   copying the canonical template (`apps/api/examples/reference-feature/`) and
   adapting it — see [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md).
   **Do not diverge from its cross-cutting patterns** (layering
   controller→service→repository, deny-by-default auth + permission/scope checks,
   standard envelopes, DB standards, tests) **without a documented architectural
   reason — an ADR** (ADR-0015). Keep the template in step when you change a
   cross-cutting standard (`scripts/verify-template.sh` enforces it in CI).
3. **Prefer the smallest change that fully solves the task.** Do not scaffold
   application features unless explicitly asked.
4. **Match existing conventions** (this file + `docs/`). If a convention is
   missing, propose one here rather than inventing an undocumented one.
5. **Keep docs in lock-step** with code. Update the ADRs/CLAUDE.md/`docs/` when
   you change architecture, standards, or process.
6. **Never commit secrets**, disable TLS verification, or weaken security/a11y
   gates to make CI pass.
7. **Run `pnpm lint && pnpm typecheck && pnpm test`** (as applicable) before
   declaring work done, and report failures honestly.
8. **Use Conventional Commits** and add a changeset for user-visible change.
   Meet the Feature Completion Criteria (§21) before calling work done.

## 20. Specialised agents

Subagents live in [`.claude/agents/`](.claude/agents/) (see its
[README](.claude/agents/README.md) for details and when to use each).

**Discovery:**

- **feature-analyst** — run **first** on any new idea/requirement: produces the
  Feature Spec + Implementation Plan and stops for approval (never writes app
  code). See §21.

**Frontend:**

- **ui-architect** — design/evolve frontend architecture and draft ADRs; run
  **before** building non-trivial UI.
- **ux-reviewer** — UX consistency, hierarchy, state coverage, copy, responsive.
- **accessibility-reviewer** — WCAG 2.2 AA audit of UI changes.
- **component-reviewer** — component API, composability, token/variant usage,
  tests; catches one-off styling.
- **performance-reviewer** — bundle size, code splitting, lazy loading, render
  efficiency, Core Web Vitals.

**Backend:**

- **database-architect** — design schema/migrations/indexes; run **before**
  writing a migration.
- **api-reviewer** — REST/OpenAPI conventions, status codes, envelopes,
  pagination.
- **security-reviewer** — auth, RBAC + resource scoping (IDOR), validation,
  secrets, injection, rate limiting, Docker/deps.
- **backend-performance-reviewer** — query efficiency (N+1/indexes), caching,
  async/queue offload, transactions.
- **test-engineer** — design/write unit, API (Supertest), and e2e tests.
- **devops-reviewer** — Dockerfiles, compose, CI workflows, release, secrets.

Typical flow: **design** with ui-architect / database-architect → implement →
**review** with the relevant reviewers (e.g. api + security + backend-performance
for an endpoint; component + accessibility + ux for UI). Reviewers are read-only
and report blocking vs. suggested findings with file/line references.

## 21. Delivery process (introducing features)

Every new requirement follows [`docs/PROCESS.md`](docs/PROCESS.md) — **understand
→ design → plan → get approval → build.** Do not write application code before
the spec and plan are approved.

Pipeline: **1** business understanding → **2** functional requirements → **3**
technical analysis → **4** solution design (with Mermaid diagrams; ADR if
architecturally significant) → **5** implementation plan (Epic → Milestone →
Feature → Task → Steps, each with complexity/dependencies/risks/tests). Ask only
the **critical** questions; state defaults for the rest.

Artifacts use the [templates](docs/templates/): `feature-spec.md` (stages 1–4)
and `implementation-plan.md` (stage 5). A worked example is in
[`docs/examples/`](docs/examples/). The **feature-analyst** agent produces them.

**Feature Completion Criteria (Definition of Done):** code, tests, docs, security
review, performance, accessibility, Docker build, CI green, changelog/changeset,
and version-impact assessed — mirrored in the PR template.

**Change management:** architectural changes require an ADR (problem, options,
choice, trade-offs, consequences). **Repository maintenance:** periodically
review architecture, dependencies, security, performance, tech debt, docs, and
UI consistency, and recommend improvements.
