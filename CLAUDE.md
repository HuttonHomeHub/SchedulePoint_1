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
theme-aware (light/dark/system), and no one-off component styling — ever.** The
authenticated app is a **persistent app-shell** with a Client → Project → Plan
**Project Explorer** navigator (ADR-0029); row actions use the hand-rolled APG
`Menu` primitive (`components/ui/menu.tsx`) — never hover-only (see
[`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md) "Row / node actions").

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
- **ADR-0016** — Core identity & tenancy model + organisation role set
  (`ORG_ADMIN/PLANNER/CONTRIBUTOR/VIEWER`; External Guest modelled separately).
- **ADR-0017** — Release tagging & image publishing via GitHub Actions.
- **ADR-0018** — Self-migrating container image (entrypoint runs migrations).
- **ADR-0019** — Shared workspace packages ship compiled output (build contract).
- **ADR-0020** — CI builds & smoke-boots the container images.
- **ADR-0021** — Activity dependency graph: the DAG invariant & service-layer
  cycle prevention.
- **ADR-0022** — CPM execution & persistence model (synchronous recalculate
  endpoint; engine-owned batched write bypassing optimistic locking).
- **ADR-0023** — CPM scheduling date convention (continuous-internal /
  inclusive-display; data date, milestone rule, working-day calendar seam).
- **ADR-0024** — Working-day calendars (weekday mask + dated exceptions; pure
  factory at the engine port; org library + per-plan default; per-activity deferred).
- **ADR-0025** — Baselines: snapshot-copy model (non-FK `source_activity_id`),
  one-active-per-plan invariant (partial unique + plan lock), and server-side
  working-day variance.
- **ADR-0026** — TSLD canvas: Canvas 2D (layered, culled) with a WebGL escalation
  gate, the coordinate/viewport/hit-test/recalc model, and a parallel focusable DOM
  a11y layer (prototype-at-scale gate passed — draw ≤4ms p95 @ 2,000 activities).
- **ADR-0027** — Per-package release tagging (`api-vX.Y.Z`/`web-vX.Y.Z`) & per-image
  versions; supersedes ADR-0017's single-aggregate `vX.Y.Z` tag (which silently
  skipped a web-only release once web caught up to api's version).
- **ADR-0028** — Single-editor plan edit-lock: a `PlanLock` lease (heartbeat + TTL
  - explicit release) with a 423 `LockedError` write-gate (`assertHoldsPen`),
    graceful peer request→grace→take-over hand-off (Org-Admin immediate override),
    serialised by the existing plan advisory lock; the third concurrency layer above
    optimistic 409 and the advisory lock. Unblocks `VITE_TSLD_EDITING`.
- **ADR-0029** — Persistent app-shell & hierarchy navigator: evolve `_authed` into
  a mounted-once shell (top bar + Project Explorer rail + single workspace region),
  URL-derived selection, and a hand-rolled ARIA `tree` with lazy-load + virtualization.
- **ADR-0030** — Canvas-first plan workspace: the TSLD canvas as the primary
  workspace surface with a shared orientation-aware resizable-panel primitive
  (rail + activity panel), a header overflow menu, a responsive single-pane toggle,
  and a viewport-preserve amendment to ADR-0026's canvas resize; refines ADR-0029's
  single workspace region (behind `VITE_CANVAS_WORKSPACE`).
- **ADR-0031** — TSLD toolbar-item registry & command taxonomy: a declarative
  `ToolbarItem` registry feeding one APG `<Toolbar>`, a compiler-enforced 7-group
  taxonomy, three prominence tiers with responsive overflow, and pen-gated authoring
  as a group state (replacing the ADR-0028 `EditLockBanner` card); refines ADR-0030
  (behind `VITE_CANVAS_TOOLBAR`).
- **ADR-0032** — Canvas-first plan authoring: a live empty canvas (render when a
  timeline anchor exists), first-draw pins `plannedStart` to today, unified coalesced
  client-side auto-recalc, on-canvas activity types (Add split-button + milestones),
  and a two-click Link tool-mode replacing the edge-drag; frontend-only, amends
  ADR-0022/0023/0026/0031 (behind `VITE_CANVAS_AUTHORING`).
- **ADR-0033** — Scheduling modes & a de-overloaded plan start: split the conflated
  `plannedStart` into a mandatory project **data date** and an ephemeral **Go to date**
  view control; a plan-level `schedulingMode` (**Early** computed-earliest vs **Visual**
  hand-placed) plus a read-only **Late Start** overlay; an advisory `visualStart` fed
  through a **second, forward-only "effective-Visual" engine pass** (placements push
  successors) while the pure-network pass still owns early/late/float; engine-owned
  `visualConflict`/drift flags (placement highlighted, never auto-moved). Supersedes
  ADR-0032 M1/D2 + the "drop = SNET" default; amends ADR-0022/0023 (behind
  `VITE_SCHEDULING_MODES`).
- **ADR-0034** — Engine conformance & validation methodology: adopt the product owner's
  P6-class fixture as a versioned benchmark + living gap map (**north star, not parity**);
  three test tiers (engine-free structural CI gate, differential "flip-one-option-must-differ",
  golden snapshots); a **no-external-oracle** golden strategy (first-principles + documented
  SchedulePoint semantics per ADR-0035, self-baselined; any P6/open-source cross-check optional);
  the negative-case reject/repair/report contract; TS-port-not-Python-in-CI; and the
  `packages/engine-conformance` (engine-free) + `apps/api` (harness) split. See
  [`docs/specs/engine-conformance-framework/`](docs/specs/engine-conformance-framework/).
- **ADR-0035** _(Proposed overall; §1–§6 Accepted with M2, §7–§14/§22 Accepted with M4)_ —
  SchedulePoint CPM semantics: the documented golden contract for the fixture's ambiguous behaviours
  (P6-aligned defaults) — Retained-Logic default + data-date floor + suspend/resume,
  mandatory-constraints-break-logic (produce-and-flag; engine-owned `constraintViolated` +
  `constraintViolationCount`, §7 amendment), duplicate-edge reject, named cycle members, SF
  arithmetic, Expected-Finish/secondary/ALAP, TF≤0 default critical +
  Longest-Path/multiple-paths/start-finish-smallest options, LOE/zero-task/resource-dependent/WBS
  rules. Each decision Accepts with its owning milestone (M2/M4/M6); see the ADR's acceptance-status
  ledger.
- **ADR-0036** _(Accepted)_ — Hour/shift-granular calendars & durations: the **gating** M1 rework
  amending ADR-0023 (working-day → working-**minute** offsets) and ADR-0024 (weekday mask → intraday
  shift patterns + time-window exceptions + window-only base weeks); durations/lag in minutes,
  elapsed durations, per-relationship lag-calendar seam, O(log) walker + iteration cap/horizon
  (N11/N16), and a day→minute storage migration.
- **ADR-0037** _(Accepted)_ — Per-activity calendars & the engine's absolute-instant axis: the **gating**
  M5 decision moving the engine's internal frame from plan-calendar **offsets** to **absolute
  working-instants** (amends ADR-0023/0036 §1) so each activity schedules on its own resolved calendar
  port (activates the reserved `activities.calendar_id`, supersedes ADR-0024 §4's deferral); total float
  measured in the **activity's own** calendar (P6/ADR-0035); PRED/SUCC lag resolves to the endpoint
  calendar (completing M3); all-inherit path stays byte-identical (golden-suite parity gate).
- **ADR-0038** _(Accepted)_ — WBS activity hierarchy: an **adjacency-list `parentId` self-FK** on
  `activities` + a `WBS_SUMMARY` activity type, the foundation for WBS-summary rollup (ADR-0035 §24,
  M5-epic). Invariants (service-enforced): the parent tree is **acyclic** and **same-plan**, only a
  `WBS_SUMMARY` may be a parent, and a **summary carries no logic** (never a dependency endpoint). The
  parent tree is orthogonal to the dependency DAG (ADR-0021); soft-deleting a summary cascades to its
  subtree. Rejected: a materialized `wbs_code` path and an engine-only proof.
- **ADR-0039** _(Accepted)_ — Resource model & resource-calendar scheduling: an org-scoped
  `Resource` **library** (a `Calendar` sibling: `kind`, optional own `calendar_id`) + a
  `ResourceAssignment` join (`budgeted_units`, per-assignment `is_driving`) + a new
  `RESOURCE_DEPENDENT` `ActivityType` that schedules on its **driving resource's** calendar via
  the ADR-0037 port seam (M7 rungs 1–2). Lean/additive (cost/EV/max-units reserved); same-org,
  exactly-one-driver, `RESOURCE_IN_USE`, and assignment-cascade are service invariants; the
  no-resource path is byte-identical.
- **ADR-0040** _(Accepted)_ — Duration types & the resource-units model: the per-activity
  four-value `DurationType` enum (default `FIXED_DURATION_AND_UNITS_TIME`) + the per-driving-
  assignment `units_per_hour` rate, making the ADR-0039 model **dynamic** by keeping
  `Units = Duration × Units/Time` true via a **pure service-boundary** recompute (`resolveTriad`,
  F2/F3) — the **CPM engine is untouched** (M7 rung 4). Units/time lives on the driving assignment
  (resource `max_units_per_hour` stays reserved for levelling); `units_per_hour` NULL = triad inert
  = byte-parity; N19 (negative rate) / N20 (zero-rate divisor) boundary rejects. Additive; %-complete
  / earned-value columns deferred to a later rung.
- **ADR-0041** _(Accepted)_ — Resource levelling: an **opt-in, pure, second engine pass** (a
  deterministic **serial priority-list heuristic**) that runs after the unchanged CPM network pass to
  resolve resource over-allocation — delaying activities within total float first, then extending
  (`levelWithinFloatOnly` forbids extension). **Activates** the ADR-0039-reserved
  `resource.max_units_per_hour` as the capacity ceiling (NULL = uncapped; N21 negative reject) and
  consumes the ADR-0040 `units_per_hour` as demand, measured on each resource's own calendar (ADR-0037)
  via a bounded interval sweep. Composite tie-break (`levelingPriority` → total-float → early-start →
  id); mandatory/LOE/WBS/milestone/progressed activities never moved; **window conflict = extend-and-flag**
  (`levelingWindowExceeded`, Q1); the **network float/critical stays authoritative** with leveled
  start/finish + `levelingDelay` as an additive overlay (Q2). `levelResources` off (default) ⇒
  recalculate **byte-identical** (the parity gate). Levelling semantics accepted as ADR-0035 **§28** with
  the conformance slice (S10 / `levelling_test`). Supersedes nothing; amends ADR-0022 (execution).
- **ADR-0042** _(Accepted; EV4 flagged web deferred)_ — Percent-complete types & Earned Value: the per-activity `percentCompleteType`
  (Duration / Units / Physical) splitting **schedule** %-complete (drives the CPM remaining) from
  **performance/physical** %-complete (earns value, changes no date), and **Earned Value as a pure
  read-model** (a `GET …/schedule/earned-value` rollup — NOT a CPM write pass, NOT engine-owned columns, so
  the recalc parity gate is structurally trivial). Activates the ADR-0039-reserved cost columns
  (`resource.costPerUnit` rate + assignment/activity cost), amends ADR-0025 to snapshot a **cost baseline**
  (the committed PV curve), and reads the data date as the EV status date. Cost = assignment-derived **and**
  activity expense; PV = active baseline (live-budget fallback); default `EAC = BAC/CPI`; physical % = one
  manual field; money = `BIGINT` minor units + a per-plan `currencyCode`, rate coefficients `Decimal(18,4)`.
  Sliced EV1 (schema, dark) → EV2 (module + read endpoint + WBS rollup) → **EV3 (conformance, ADR-0035
  §29 Accepted + N22–N24)** → EV4 (flagged web `VITE_EARNED_VALUE`, deferred). Amends ADR-0025; builds
  on ADR-0037/0038/0039/0040.
- **ADR-0043** _(Accepted; Milestone 1 — live cross-plan solve deferred to M2)_ — Inter-project external
  dates: model programme/multi-plan interfaces as two nullable per-activity **imported instants**
  (`external_early_start` / `external_late_finish`, absolute working-instants) + a plan-level
  `ignore_external_relationships` toggle, clamped **inside the existing forward/backward passes** — external
  early start = **SNET-shaped** forward bound (data-date floored, later-of-two-wins), external late finish =
  **FNLT-shaped** backward bound (negative float if infeasible). External bounds are **soft** (never a
  mandatory pin, a hard pin still wins), the toggle drops **both** directions (P6 "ignore relationships to/
  from other projects", scenario **S09**), and an external-driven activity is flagged/counted
  (`externalDriven`/`externalDrivenCount`, optional-absent on the no-external path). `computeSchedule`'s
  signature is unchanged and absent inputs ⇒ byte-identical (the parity gate). Semantics accepted as
  ADR-0035 **§30** (+ N25 warn-and-clamp / N26 boundary reject). The **live cross-plan solve** (cross-plan
  edges, cross-plan DAG/authz/propagation, programme recalc) is deferred to a separately-ADR'd **Milestone
  2**. Amends ADR-0022/0023/0037; builds on the constraint machinery (ADR-0035 §7–§12).
- **ADR-0044** _(Accepted)_ — Resource loading curves, cost accrual & weighted activity steps (M7's final
  resource-side rung): the five named P6 loading profiles (UNIFORM/BELL/FRONT/BACK/DOUBLE_PEAK) shaping the
  histogram/curve read-model, a per-activity cost-accrual type, and weighted activity steps rolling up to a
  physical %-complete. Read-model/additive; the CPM engine and the parity gate are untouched. Semantics
  accepted as ADR-0035 **§31** (curves, N29) / **§32** (accrual) / **§33** (weighted steps, N27/N28).
- **ADR-0045** _(Accepted; inter-project **Milestone 2**)_ — Live cross-plan / programme scheduling: a
  first-class **cross-plan dependency** edge whose downstream bound is **derived above the pure engine** from
  the upstream plan's persisted computed dates and folded into ADR-0043's M1 external instants
  (later-of/tighter-of) — so `computeSchedule` stays byte-identical (no cross-plan edge ⇒ identical input).
  A **plan-level DAG** (nodes = plans) extends ADR-0021's acyclicity across plans, making a **programme
  recalc** a single topological pass that reuses ADR-0022's single-plan transaction per plan (deterministic
  lock order, pen asserted per plan, fail-fast 423). **Pull staleness** (`schedule_computed_at` compared
  across the upstream closure). New `cross_plan_dependencies` table (separate from `dependencies`), a
  `dependency:link_cross_plan` permission, and a flagged web surface (`VITE_PROGRAMME_SCHEDULING`).
  Semantics accepted as ADR-0035 **§30.5–§30.8** (+ N30–N33). Amends ADR-0021/0022/0043.
- **ADR-0046** _(Accepted; Notes M1)_ — Polymorphic entity notes: threaded, attributed,
  time-ordered annotations modelled as a **single polymorphic `notes` table** — an
  `entity_type` discriminator + **nullable typed parent FKs** (`plan_id`/`activity_id` now,
  `client_id`/`project_id` reserved) + a **fail-closed exactly-one-parent CHECK**
  (`ck_notes_exactly_one_parent`, `CASE … ELSE false`) — over per-entity tables, so
  client/project notes drop in with **no rework**. A denormalised `plan_id` on **every** note
  (an activity note carries its activity's `plan_id`) makes the `HierarchyLifecycleService`
  plan-cascade a **single** join-free `updateMany` sweep with no double-count; restore is
  batch-cohesion-guarded (no endpoint guard — a note has exactly one parent). Org-scoped,
  audited, soft-deleted, plain-text body 1–5000 chars; **non-scheduling — the CPM engine is
  untouched** and writes are not pen-gated (ADR-0028). Author-ownership on edit/delete is a
  service-layer check (M2). Builds on ADR-0012/0016; child-table precedents ADR-0025/0038/0044.
- **ADR-0047** _(Accepted)_ — Automatic redeploy of released images: an **opt-in, host-side pull
  trigger** (Watchtower) shipped **dormant** in `docker-compose.release.yml` behind a compose
  `autodeploy` profile, closing the "shipped but not live" gap (TECH_DEBT #29). It polls GHCR and
  pulls + recreates **only the label-enabled** `web`/`api` containers (never the db or itself) on a
  moved `:latest`, reusing the host's `docker login ghcr.io` credentials; the API self-migrates on
  recreate (ADR-0018), so the pull **is** the deploy. A `WATCHTOWER_MONITOR_ONLY` toggle gives
  notify-without-update (a manual gate). A GHCR webhook-receiver and a CI-side SSH deploy were
  rejected (inbound exposure / CI-held host credentials). Builds on ADR-0018/0027.

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
