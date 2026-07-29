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

> **Current stage: the application is substantially built.** 19 API modules
> (`apps/api/src/modules/`), 25 Prisma models across 41 migrations, ~590 web
> source files with 17 flag-scoped Playwright suites, and 60 ADRs. The CPM/GPM
> engine is real and its conformance matrix is closed (ADR-0034). Read the code
> before assuming anything is missing — this banner said the opposite for months
> after it stopped being true, which is exactly the failure it now warns against.
>
> The **Gantt view shipped** on 2026-07-28 (ADR-0059, `VITE_GANTT_VIEW`
> default-on) — read-only by design, with WBS rows, the baseline variance bar and
> a printed programme. It **substantially** delivers the last outstanding
> Must-have in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) §8, which words it
> "read-primary; **edit supported**" — Gantt editing is deferred as ADR-0059 M5,
> so that line is not yet closed. This banner and the PR that shipped it both said
> "closing the last Must-have" until the brief was re-read: the same trust-the-
> document failure the paragraph above warns about, one paragraph later. What
> remains undecided is the **deployment target**. New work still follows the delivery
> process (§21) and the implementation standard (§12), which is demonstrated by
> real modules rather than by a template to copy (ADR-0057).
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
| Styling / UI   | Tailwind CSS v4, hand-rolled APG primitives, Lucide |
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
SchedulePoint/
├── apps/
│   ├── web/                  # React + Vite client (@repo/web)
│   │   ├── src/features/     #   Feature-first app code
│   │   ├── src/components/   #   Shared primitives (ui/) + app shell (layout/)
│   │   └── e2e*/             #   Playwright suites — one per feature flag
│   └── api/                  # NestJS REST API (@repo/api)
│       ├── src/modules/      #   19 feature modules
│       ├── src/modules/schedule/engine/  # The pure CPM/GPM engine
│       ├── src/common/       #   Auth, guards, filters, locks, lifecycle
│       ├── prisma/           #   Schema (25 models) + 41 migrations
│       └── test/             #   Supertest API e2e specs
├── packages/
│   ├── config/               # Shared ESLint + tsconfig presets (@repo/config)
│   ├── interchange/          # Pure schedule-interchange model/parsers (ADR-0050)
│   ├── engine-conformance/   # Engine-free conformance fixture + loaders (ADR-0034)
│   └── types/                # Shared cross-boundary types/DTOs (@repo/types)
├── docs/                     # Architecture, guides, ADRs, roadmap, decisions
├── scripts/                  # Repo automation (bootstrap, etc.)
├── .claude/agents/           # Specialised review/design subagents
├── .github/                  # CI/CD workflows, issue/PR templates, CODEOWNERS
├── .changeset/               # Release/versioning state
├── CLAUDE.md                 # ← you are here
└── (root configs)            # turbo, tsconfig.base, eslint, prettier, docker-compose…
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
  feature. Shared app-level components live in `components/layout/`;
  design-system primitives live in `components/ui/` and are **hand-rolled on
  semantic HTML + the WAI-ARIA APG** — there is no Radix dependency, and adding
  a component library is an ADR-level decision.
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
revert`. Scopes: `web, api, config, types, interchange, db, ci, docs, deps, release, repo`.
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
2. Merging that PR bumps versions, updates each `CHANGELOG.md`, and tags
   `api-vX.Y.Z` / `web-vX.Y.Z` (per-package, ADR-0027).
3. **The same Release run then publishes the images.** Its `publish` job calls
   `docker-publish.yml` as a **reusable workflow** (`uses:`), pushing `api` and
   `web` to **GHCR** with SemVer + SHA tags, SBOM and provenance — only for the
   app(s) that actually released.
   **The tag does not trigger anything.** A tag pushed with the default
   `GITHUB_TOKEN` cannot start another workflow run, so a `push: tags` trigger
   would never fire for a changesets-cut release; `release.yml` calls the
   publisher directly instead. Two consequences worth knowing before you go
   looking for a failure: `docker-publish.yml`'s **own** run list shows only
   manual `workflow_dispatch` runs, because reusable-workflow calls appear as
   jobs of the **caller's** run; and the same `GITHUB_TOKEN` rule is why the
   "Version Packages" PR never has any checks. Neither is a fault. (Read this
   before concluding a release didn't publish — that mistake has been made.)
4. Deployment promotes those immutable images through environments — automatic
   where an operator has enabled the Watchtower `autodeploy` profile (ADR-0047),
   manual otherwise.

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
styling via semantic tokens + Tailwind v4 + CVA, rebound per **surface scope**
(ADR-0055). **Mobile-first,
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
- [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md) — the implementation
  standard, and the real modules that exemplify it (ADR-0057).

Essentials: NestJS modular monolith; **thin controllers → services → Prisma**;
**deny-by-default** auth with **RBAC + resource (organisation) scoping**; validated
DTOs; standard `{ data, meta }` / `{ error }` envelopes; **soft deletes,
auditing, optimistic locking**; structured logs with correlation IDs. When
building a feature, start from the nearest exemplar — `modules/clients` for the
canonical shape, `modules/notes` for cascades, `modules/share` for an auth
boundary (ADR-0057). **Security is on by default.**

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
- **ADR-0048** _(Accepted)_ — Client-side command-stack undo/redo for plan authoring: a **client-side,
  per-plan, per-pen-session, in-memory command stack** that undoes plan **inputs only** (reposition/
  relane/update/create/delete/dependency/`visualStart`) by composing inverses from the **existing** REST
  mutations, then lets the ADR-0032 coalesced recalc redraw — so the CPM engine and the recalc **parity
  gate are structurally untouched**. Each inverse rides the unchanged `assertHoldsPen` (423) + RBAC +
  org-scope + optimistic (409) gates (the API stays the sole trust boundary — undo can't escalate).
  Linear history (new edit clears redo), depth 50, cleared on plan switch / pen release / reload;
  conflict = **abort-and-refetch + clear-redo** (no silent skip/auto-retry/merge). Delete-undo is
  **re-create** (new id) in M1–M2; id-stable/cascade-clean restore is an **optional M4** additive
  endpoint reusing soft-delete/`deleteBatchId` (no schema change). Progress edits out of scope
  (non-pen-gated). No schema/API for M1–M3; behind `VITE_UNDO_REDO` (default off). A server-persisted
  undo log and full-plan snapshots were rejected for v1. Builds on ADR-0022/0028/0031/0032/0033.
- **ADR-0050** _(Accepted; interchange M1 — behind `VITE_SCHEDULE_INTERCHANGE`)_ — Schedule interchange:
  canonical model + import pipeline: a **format-agnostic canonical model** + per-format parsers (XER now,
  MSPDI at M3) + a mapper to a SchedulePoint import-DTO graph + an ADR-0035-aligned **validate/repair/
  report** step + a two-phase **dry-run→commit** pipeline, housed in a **pure `@repo/interchange` package**
  (ADR-0019 build contract) consumed by a thin persisting `interchange` module that reuses existing domain
  services. **Import-first** (XER→MSPDI); **`.mpp` excluded** (proprietary binary, no permissive reader);
  **export deferred**; import target is **always a new plan**. A **living mapping-contract table** documents
  every approximation/drop (best-effort fidelity is reported, never silent); the per-import
  `InterchangeReport` is its runtime instance. M1 imports the core network (project/activity/relationship/
  calendar); WBS/constraints/progress/resources are M2. The **CPM engine + recalc parity golden suite are
  untouched**. Builds on ADR-0034/0035 (conformance + reject/repair/report), ADR-0021 (DAG), ADR-0022/0023/
  0036 (recalc/dates/calendars), ADR-0038/0039/0040 (WBS/resources, M2), ADR-0009 (BullMQ), ADR-0012/0016
  (RBAC + tenancy — `interchange:import`).
- **ADR-0051** _(Accepted; guest-share M1 — behind `VITE_GUEST_SHARE_LINKS`)_ — External-Guest per-plan
  share links: the brief's long-deferred fifth role (ADR-0016 "modelled separately"), modelled as a
  **revocable, hashed, per-plan `PlanShare` grant** dereferenced by a **session-less bearer token** and
  enforced by a **parallel `GuestPrincipal` + `ShareTokenGuard`** that is **structurally distinct** from the
  member `Principal` (guest→member method flow is a compile error — deny-by-default by construction). Token
  minted 256-bit / stored SHA-256 (invitation-token precedent, extracted to `common/tokens/`), presented in
  the URL **fragment** as `Authorization: Bearer` (never in referrer/server logs); **uniform-404** resolve
  (no existence oracle); revocable + optionally-expiring; plan soft-delete **cascades** to `plan_shares`.
  Fixed read-only **`SCHEDULE_READ`** scope (header/calendar/activities+progress/logic/summary) — **no**
  cost/EV/notes/resources/baselines; new **`plan:share`** permission (Planner + Org Admin only); the app's
  **first unauthenticated data-read endpoint** + **first rate-limiter** (`@nestjs/throttler` on
  `/api/v1/share/*`). **Read-only, write-free — the CPM engine, pen model (ADR-0028) and recalc parity gate
  are untouched.** Sliced F-M1 (schema+token+guard, dark) → F-M2 (management API) → **F-M3 (guest reads +
  rate-limit — landed)** → **F-M4 (flagged web — landed, behind `VITE_GUEST_SHARE_LINKS`, default off)**.
  Builds on ADR-0003/0012/0016; cascade precedent ADR-0046.
  **F-M3** ships the session-less `@Public()` `ShareGuestController` behind the `ShareTokenGuard` under
  `/api/v1/share/*` (`GET plan`/`activities`/`dependencies`, cursor-paginated) — token-only scope (plan+org
  from the `GuestPrincipal`, never a request param: anti-IDOR by construction), field-stripped read DTOs,
  `noindex`+`no-referrer` headers, a tighter per-IP `@Throttle` (30/60 s vs the global 100/60 s), and a
  coalesced fire-and-forget `last_accessed_at` touch. Persisted CPM columns only (no engine call).
  **F-M4** adds the flagged web surface (`VITE_GUEST_SHARE_LINKS`, default off): the member **Share
  links** dialog on the TSLD toolbar (`share` item — list/create/revoke + one-time URL, gated on
  `plan:share`) and the public read-only `/share` guest view (a sibling of `_authed`, session-less,
  token in the URL fragment, `noindex`). Flag-off ⇒ the toolbar keeps its "Coming soon" placeholder and
  no `/share` route registers (byte-identical).
- **ADR-0052** _(Accepted; M1–M5 landed — behind `VITE_CANVAS_DIRECT_MANIPULATION`, **default on**
  2026-07-25)_ — TSLD
  direct manipulation & canvas visual refresh: **frontend-only** composition on the existing PATCH
  mutations + the ADR-0032 coalesced recalc (**engine/API/DB untouched — the recalc parity gate is
  structurally untouched**; flag-off paints byte-for-byte, the parity paint test). The bar-end
  grab-zones become **resize handles** in `select` mode (linking stays the ADR-0032 two-click tool —
  an amendment to ADR-0032 M5); **time-true GPM lag anchoring** measured on the relationship's **lag
  calendar** (working-day walk, `TWENTY_FOUR_HOUR` elapsed; lead = left; zero-lag = today's edges;
  bounded/memoised injected walk — amends ADR-0026's edge-endpoint routing) + directional
  **arrowheads** with the driving weight/dash cue retained; **start-edge resize** is mode-aware
  (EARLY: SNET+`durationDays`, VISUAL: `visualStart`+`durationDays` — amends ADR-0033). Sliced
  **M1** time-true anchors + arrowheads (render-only) → **M2** finish-edge resize → **M3**
  start-edge resize + lag drag → **M4/M5** the bar/link **visual refresh** (token-resolved, inside
  the Canvas-2D ≤ 4 ms p95 @ 2,000 budget) — all landed. Builds on
  ADR-0021/0022/0023/0028/0036/0048.
- **ADR-0053** _(**Accepted** — every section; the library-scoping epic's web surface is **live**,
  `VITE_LIBRARY_SCOPING` **default-on** 2026-07-26)_ — Calendar scoping tiers & the resource
  management layer: give calendars P6's missing **project tier** — a `CalendarScope { ORG, PROJECT }`
  discriminator + a nullable `calendars.project_id` (FK RESTRICT) pinned together by a **fail-closed**
  `CASE … ELSE false` CHECK (the ADR-0046 precedent), with name uniqueness split into **two partial
  uniques** (per-org for ORG, per-project for PROJECT; cross-tier reuse deliberately allowed). Constant
  `DEFAULT ORG` ⇒ every existing row keeps today's behaviour with **no data migration** — the M1
  acceptance bar. The tier is an invariant, not a convention: **ONE shared guard**
  `assertCalendarUsableBy({ calendarId, organizationId, projectId, currentCalendarId })` is called at **every** seam
  (`plan.calendarId`, `activity.calendarId`, `resource.calendar_id` — where `projectId: null` **hard
  rejects** any project calendar, 422 `RESOURCE_REQUIRES_ORG_CALENDAR`), under the existing calendar
  advisory lock; cross-org stays **404** (no existence oracle), in-org wrong tier is **422
  `CALENDAR_WRONG_SCOPE`**. The per-relationship lag calendar is a `LagCalendarSource` **enum**, not an
  FK — **no seam**, locked in by a structural seam-set test. Scope change: **widen free, narrow guarded**
  (409 `CALENDAR_SCOPE_NARROWING_BLOCKED` with per-class counts, under the lock); project soft-delete
  **cascades** its calendars + exceptions in the same `delete_batch_id` (never an ORG calendar); new
  **`calendar:manage_org`** permission (Planner + Org Admin — zero capability change) gates shared-library
  writes. The resource pool deliberately stays **one org-global pool** (levelling/over-allocation depend
  on it); its manageability comes later as an adjacency-list `parent_id` + a non-assignable `GROUP` kind
  (§3, M3), `archived_at` (§4, M4) and interchange tiering (§5, M5). **The CPM engine is untouched** —
  it resolves a calendar BY ID and never sees `scope`/`project_id`/`archived_at`, so the ADR-0034 recalc
  parity gate is structurally trivial. Builds on ADR-0012/0016/0024/0036/0037/0038/0039/0046/0050.
  **M4 (§4) adds the archive lifecycle, server-side search and the shared picker:** a nullable
  `archived_at` on **both** libraries — **orthogonal to soft delete**, so an archived row stays valid,
  keeps every existing reference live and **keeps scheduling identically**, is hidden from pickers, and
  refuses only **NEW** usages (422 `RESOURCE_ARCHIVED` on assignment _create_ — _update_ still succeeds;
  422 `CALENDAR_ARCHIVED` inside the same shared guard, which gains a **non-optional `currentCalendarId`**
  so re-submitting an existing binding is not "new" and an entity on an archived calendar stays editable).
  Archiving is deliberately **NOT blocked by use** — the whole point, and the only way to retire a calendar
  `CALENDAR_IN_USE` refuses to delete (CQ-5); it takes no lock, no cascade (a `GROUP`'s subtree is not
  archived) and no in-use count, and an archived referencer still **blocks** a §2 narrowing. An archived
  row **keeps its name/`code`** (the partial uniques stay `deleted_at`-only) so **unarchive can never
  fail** — the accepted cost is a 409 carrying the archived row's id. Server-side `q` + `kind`/`scope`/
  `archived` filters on both list routes with cursor pagination; **no index changes** (measured: 0.21 ms
  default page / 2.9 ms worst-case search at 5,000 rows with 40% archived — the candidate partial saved
  0.14 ms for 1,296 kB, and narrowing `idx_calendars_project_id`/`idx_resources_parent_id` would be a
  cascade-correctness bug), with `pg_trgm` GIN the documented measure-first escalation. Web: **one shared
  hand-rolled APG `Combobox`** (`components/ui/combobox.tsx`, the `menu.tsx` precedent) replacing the raw
  `<Select>` pickers — controlled server search, grouped/annotated options, `aria-activedescendant`,
  announced result counts, and the "render the current value even when outside the filtered page" rule
  generalised. Interchange (CQ-4) **matches + auto-unarchives + reports a finding** for resources; for calendars
  M5 answered it **not applicable** (an import never reuses a calendar, so there is nothing to match).
  **M5 (§5) makes interchange respect the tier:** the pure mapper (`@repo/interchange`) decides each
  imported calendar's tier and **reports every decision** — a calendar an imported **resource** holds
  is **forced `ORG`** (a resource is org-global; the commit re-asserts it and fails the transaction
  otherwise), a source **global** (`CA_Base`) calendar lands `PROJECT` with a "promote it" finding
  unless the new optional `globalCalendarScope: 'ORG'` upload field opts in, and everything else lands
  `PROJECT` **pinned to the target project** — so a fresh import adds **zero rows to the org library**.
  P6's `clndr_type` (previously neither read nor emitted) now round-trips: read on import to drive the
  tier, emitted on export from `scope` + resource-reference. **MSPDI has no equivalent** (`IsBaseCalendar`
  is inheritance, not a tier) — import is always `PROJECT`, export reports the tier as a **drop**. A name
  the target tier already holds is **suffixed + reported, never reused** (two calendars sharing a name can
  have different working weeks), which also fixes importing two files with a shared calendar name into one
  project. The ADR-0050 mapping-contract table is updated in lock-step; the CPM engine is untouched.
  **M2 (landed)** gives §1–§2 their **web surface** behind `VITE_LIBRARY_SCOPING` (default off): a `Scope`
  badge column + an Organisation/Project/All filter on the calendar library; a **Calendars section on the
  project-detail screen** (the project's only detail surface — no separate settings route) reading
  `GET …/projects/:projectId/calendars`; a scope choice on **create** (the shared library disabled with an
  explanation without `calendar:manage_org`, the project implied when created from one); confirmed
  **promote / narrow** tier moves; **tier-grouped `<optgroup>`** plan + activity calendar pickers fed by
  that project-usable list (so a picker can never offer a calendar the write seam would 422), with the
  resource picker deliberately **organisation-only**; and one shared `lib/api/calendar-scope-errors` mapper
  turning the two 422s and the narrowing 409 (**with its per-class counts**) into actionable sentences.
  Frontend-only — no API/schema/engine change; flag-off is byte-for-byte the prior surface (a dedicated
  flag-off parity suite pins every touched screen).
  **M3 (landed)** accepts **§3, the resource hierarchy**: `resources.parent_id` (an adjacency-list
  self-FK, the ADR-0038 WBS precedent) plus a new non-assignable **`GROUP` `ResourceKind`** — a grouping
  node with **no calendar, capacity or cost** (the same-row, fail-closed `CASE … ELSE false`
  `ck_resources_group_no_scheduling_fields`) that may **never be an assignment endpoint** (422
  `GROUP_NOT_ASSIGNABLE`). Those two facts make the levelling / histogram / EV parity argument
  **structural** — all three read from `resource_assignments`, so a node that cannot be assigned cannot
  enter demand, capacity or cost; **the CPM engine is untouched** (`EngineResource` is still
  `id`/`capacity`/`calendar`, pinned by a structural test). The pool stays **one org-global pool**: this
  is navigation, not a tier. Acyclicity, same-org, "only a GROUP may parent" and **depth ≤ 10** (measured
  as parent-depth **+ moved-subtree height**) are service invariants held under a new **org-scoped**
  `resource-tree` advisory lock — a per-resource lock cannot serialise two **mirror** reparents, which
  take different keys. Deleting a GROUP counts `RESOURCE_IN_USE` across its **whole subtree** and
  soft-deletes that branch under **one** `delete_batch_id` (lock order: tree lock → per-resource locks
  ascending by id). Reads add `?parentId=<uuid>|null` and a `parentId` on every row — deliberately **no
  `tree=true`**, since the client already pages the library and nests it. Two migrations, because
  Postgres forbids using an enum label in the transaction that added it. Web surface behind the existing
  `VITE_LIBRARY_SCOPING` (depth-first rows + a `Group` column + a "Not assignable" badge + a parent
  picker; groups excluded from the assignment picker), flag-off byte-for-byte.
  **M6 (landed) is the enablement milestone:** `VITE_LIBRARY_SCOPING` flips **default-ON**
  (2026-07-26) once the deferred specialist gates ran over the whole epic diff and every blocking
  finding was folded — **ux** (the two library screens' filters moved into typed **URL search
  params**, so a filtered view is deep-linkable and survives a reload; a shared `SearchField`
  primitive with a leading Lucide icon and a real, keyboard-operable clear button; the combobox's
  raw `▾` glyph replaced with `ChevronDown`; **"Load more" made keyboard-reachable** as the last row
  in the arrow-key sequence — WCAG 2.1.1; archive badge/filter/action added to the project Calendars
  section, which previously made an archived project calendar vanish from the one screen listing
  it), **accessibility** (the combobox renders its `emptyOption` label as the selection instead of
  blanking — "None"/"Inherit" is the most common state of all; the assignment resource error wired
  to its control on both branches; the library tables **announce their settled result count** —
  WCAG 4.1.3 Status Messages), **api** (the missing 422/409 OpenAPI declarations on the resource
  create/update routes, and the calendar-scope 422 newly reachable on activity create/update) and
  **backend-performance** (the GROUP-delete **per-descendant advisory-lock loop batched into one
  `unnest` statement** — measured ~830 ms → ~13 ms for a 2,000-row subtree, all of it previously
  spent holding the org-wide resource-tree lock). It also closes TECH_DEBT #55 by adding the
  `globalCalendarScope` import control (a `calendar:manage_org`-gated checkbox that re-runs the
  dry-run, so the report always describes the import being confirmed), and adds the flag-on
  Playwright journey `apps/web/e2e-library/library.spec.ts` (`pnpm --filter @repo/web
test:e2e:library`, its own CI step) proving the tier boundary and the archive-is-not-delete
  distinction end to end. The flag-off parity suites are **kept and pinned** (`vi.mock` of
  `@/config/env` with `LIBRARY_SCOPING_ENABLED: false`) rather than weakened — that is the rollback
  contract.

- **ADR-0054** _(Accepted; M1–M6 landed — `VITE_CANVAS_LIVE_FEEDBACK` **default-on**)_ — Canvas
  live feedback & GPM float/drift visualisation: **frontend-only** work on the existing painter —
  full-fidelity drag ghosts with source-bar dimming, a cursor date chip + guideline + ruler tick,
  flanking start/finish date labels behind a `Dates` toggle with its own level-of-detail rule, the
  GPM float & drift tails lens, and relationship slack on the selected activity's links. The
  engine, the API and the recalc parity gate are untouched; the draw budget is held by
  counting-stub gates (`paint.dates-budget.test.ts` and siblings) that assert the **shape** of the
  per-frame cost rather than a millisecond count, because a CI runner's absolute timings are noise.
- **ADR-0055** _(**Accepted** — S0–S5 landed; `VITE_DESIGNED_CHROME` and
  `VITE_CANVAS_VISUAL_LANGUAGE` **default-on** 2026-07-26)_ — Surface scopes, a designed chrome
  band, and the canvas visual language. The load-bearing idea is **surface scopes**: ONE semantic
  token vocabulary **rebound per surface** (`chrome`, `panel`, page) by a `[data-surface]` rule, so
  `text-muted-foreground` inside the navy header resolves to a grey validated **against navy** and
  no descendant component learns where it is. The families are deliberately **absent from
  `@theme inline`** — `bg-chrome` does not compile, `<Surface>` is the only route in
  (`surface-seams.structural.test.ts`) — and **`inline` is load-bearing**: without it utilities
  compile to a value resolved once at `:root` and every scope silently stops working, with no error
  and a diff that looks like a tidy-up. Each family is **complete (17 tokens) or it is a trap**: the
  original bug was a three-token header stub whose secondary text fell through to the page grey and
  vanished on navy. `--input` is a **separate token from `--border`** — a divider is decoration
  (1.4.11-exempt), a control's outline identifies the control and is gated at 3:1. Structure and
  values land **separately** (S2–S4 structure, S5 values) so the flag-off parity suites still mean
  something on the day they are needed, and the flag layers carry values behind a root attribute so
  a rollback is byte-for-byte for **colour** as well as markup. The plan toolbar reaches the band
  through a **portal**, keeping the shell plan-unaware (ADR-0029) — which is why the keyboard scopes
  had to become React handlers first (React events follow the React tree; native listeners do not).
  S4 adds an opaque canvas ground + **alternating month bands** whose parity is the absolute month
  ordinal, so panning cannot invert the stripes; its cost is pinned by call count and was measured
  in a browser to sit **inside the baseline's own run-to-run spread** at 2,000 activities. The
  epic's own gates — a computed contrast matrix over 3 themes × 3 scopes × 2 flag states, a
  structural seam test, and a lint rule rejecting colour literals in `className`/`style` — exist
  because every defect it fixes had shipped past a human reviewer, a component reviewer and an axe
  suite: the class names were right.

- **ADR-0056** _(Accepted; M7 flipped `VITE_CANVAS_TIME_AXIS` default-on, 2026-07-27)_ — TSLD
  time-axis legibility & preset framing: **range-anchored zoom presets**
  (`pxPerDayForPreset(level, width)` derives `pxPerDay` at pick time from a target visible range,
  not a fixed constant; `presetOf`/`isAtPreset` take the canvas width as a **required**,
  compiler-enforced parameter, and a preset is a command — resizing preserves the chosen scale,
  never re-derives it); **three gridline tiers** (day/month/year, each its own colour + weight,
  drawn day→month→year so a coarser boundary wins at a coincident x — never dash, since that
  channel is already the Today line's and the ADR-0054 cursor guideline's); a **fractional,
  self-refreshing Today marker** (`todayDayFraction` interpolates the dashed line to the actual
  time of day; a `useNow(60_000)` hook — the render path's **first timer**, pausing while the tab
  is hidden — repairs the pre-existing midnight-staleness defect; a `Today` pill mirrors the
  ADR-0054 cursor chip's geometry, offset so the two never collide); and **ground vs. non-working
  by kind** (a `CanvasPattern` diagonal hatch over the non-working wash, O(1) per column via a
  memoised offscreen tile reusing the ADR-0054 float-tail hatch's rhythm, guarded to the existing
  flat fill when the offscreen 2D context is unavailable; the month-band ground gains its own
  `View▾ → Structure → Month bands` switch, **amending ADR-0055 §4**, while
  `VITE_CANVAS_VISUAL_LANGUAGE` stays the gate and default). Frontend-only; the ADR-0034 recalc
  parity gate is structurally untouched. **M7** ran the deferred specialist reviews over the
  combined M2–M5 diff, folding a day/month gridline-contrast fix (WCAG 1.4.1) and threading the
  raised zoom ceiling through a required `maxPxPerDay` parameter (so it can never leak into the
  flag-off path — a component-review finding), then flipped the flag default-on.

- **ADR-0058** _(Accepted)_ — Drift control — computed gates and the reconciliation
  pass: documentation drift is a defect class with its own gates. Adds a doc-link
  checker (`pnpm check:doc-links`), coverage **ratchets** set at the measured floor
  (API 74% / web 87%, not the aspirational 80% — a gate that fails on day one gets
  deleted rather than fixed), and `passWithNoTests: false`; these join the
  schema-drift check, the token-contrast matrix, the structural seam test and the
  flag-off parity suites. What cannot be gated — "does this prose still describe the
  system?" — goes to a **reconciliation pass** at each epic boundary with a
  three-month floor ([`docs/RECONCILE.md`](docs/RECONCILE.md)). Written after four
  passes found: this file describing a repo with no domain code beside 19 modules; a
  coverage bar asserted in four places that had never been collectable (the provider
  was not installed); docs specifying Radix, CASL, OpenTelemetry, BullMQ and a
  `lib/telemetry.ts` that do not exist; and README badges pointing at a repository
  that does not exist. Rule: **verify the claim; do not trust the document** — the
  ADR count in the banner above drifted again while this ADR was being written.

- **ADR-0059** _(Accepted; M0–M4 + M6 landed, `VITE_GANTT_VIEW` **default-on** 2026-07-28)_ — The
  Gantt view's rendering substrate and the view seam. The brief's last outstanding
  Must-have (§8), built because **the people a planner reports to do not read logic
  diagrams** — today the only way to hand a QS something they recognise is to export
  to XER and open it in the tool we exist to replace. The load-bearing call is that
  the Gantt renders as **virtualized DOM rows, not Canvas 2D**: ADR-0026 chose canvas
  for thousands of simultaneously-visible items at arbitrary 2-D positions with routed
  links, and virtualization removes that premise for a vertical list of one bar per
  row — so choosing canvas would import ADR-0026's hand-built parallel a11y layer to
  solve a problem the DOM solves natively. The time axis is **shared, not
  reimplemented** (`render/time-scale.ts` + ADR-0056 presets — a second date→pixel
  implementation is how two views drift about where a Monday is). The view is a
  **peer** behind the `view-mode` slot ADR-0031 §296 reserved, URL-backed
  (`?view=tsld|gantt`), which **amends ADR-0055 §8.4** — that decision's stated
  condition (an inert half) no longer holds for Gantt, though `Network` stays out.
  First ship is **read-only with no dependency arrows** (arrows would drag the
  rejected substrate back in through the side door). **No backend work at all** — every
  field is already computed, persisted and exposed; the CPM engine is not imported,
  so the ADR-0034 recalc parity gate is untouched by construction. **Unblocked and
  shipped** the WBS summary bar (ADR-0038, `TECH_DEBT #37`) and the baseline variance
  bar ADR-0025 deferred "until a Gantt exists". **M4** adds a **printed programme**
  (§6): a detached print document rather than a print stylesheet, because printing a
  virtualized list prints only the rows on screen — a programme cropped to a scroll
  position, which looks authoritative and omits work. It renders every row, fits the
  span to the page, and delegates pagination to a native `<thead>` so the headings and
  the ruler repeat per page; the container/lifecycle convention is extracted to
  `lib/print-document.ts` and shared with the TSLD image path. The in-app **PDF**
  button stays canvas-only and is deliberately not wired to the Gantt. **M6** flipped
  the flag once the deferred review pass over the combined diff was folded — which
  caught a **lit-but-inert** zoom control (the preset delegated only to the canvas
  handle, null with no canvas mounted; canvas-only viewport commands now shade with a
  reason) — and added the flag-on journey `apps/web/e2e-gantt/` with its own CI step,
  including the browser-measured proof that the live row count is bounded by the
  viewport and not the plan. **M5 (editing) stays deferred by design.**

- **ADR-0060** _(Accepted; M0–M6 landed, `VITE_ACTIVITY_EDITOR_TABS` **default-on** 2026-07-29)_ —
  The tabbed activity editor, per-scope save, the steps edit-lock gate, and the co-located progress
  model. The load-bearing decision is that the editor saves **per write scope, not per dialog**,
  because the scopes it spans do not share a permission: definition writes need the pen (ADR-0028),
  progress writes deliberately do not (Q-C), and steps joined the pen side here — so one merged Save
  would have to pick one rule and would quietly remove a Contributor's ability to report progress
  while a Planner holds the lock. Per-scope save is structural, not a layout preference, and the
  three Save buttons on the Progress tab are its honest consequence. **M0 is the one API change**
  (`PUT …/steps` now asserts `assertHoldsPen`, closing a client/server disagreement the client had
  always assumed); it is not behind the flag, because a `VITE_` constant is a client build-time
  value and cannot gate a server check. Progress is co-located because it was spread across four
  dialogs — the schedule % that moves dates, the physical % that earns value and moves nothing, the
  weighted steps that silently override it, and the selector choosing between them, which sat in a
  fifth place. All three entry points (**Edit** / **Report progress** / **Steps**) now build one
  `ActivityEditorIntent` and open one editor, with the per-scope gate derived **once** by the plan
  workspace: `canEditSchedule` has already fused role and pen into one boolean, so a host given only
  that cannot say which is missing and would eventually differ from its sibling.
  **M6 is the epic's own premise landing on itself.** Four specialist reviews over the combined diff
  found six defects in code that had already passed a human read — a dropped calendar `Combobox`
  with its loading/error states and `RESOURCE_DEPENDENT` reason (a field that renders, looks right,
  and reports a calendar the activity does not have); Save buttons on native `disabled`, which blurs
  to `<body>` and flips twice per save; a reason sentence beside its control rather than
  `aria-describedby`-linked to it; an invented pen message that was **false** whenever nobody held
  the pen; no confirmation before discarding unsaved work across three independently-dirty scopes;
  and a save bar duplicated across two files, already diverging in how it typed its gate. All six
  folded with regression tests, plus a flag-on Playwright journey (`apps/web/e2e-activity-editor/`,
  its own CI step) that proves the permission model against a real API with the pen enforced — the
  only place the optimistic-`version` trap can be tested, since a mocked fetch accepts any version.
  Two findings are recorded rather than rushed (TECH_DEBT #63/#64), and the Cost-tab doc drift is
  resolved **toward the code**: hiding a tab whose values the reader may not see beats shading it,
  which would claim the activity has no cost. Supersedes nothing; builds on ADR-0028/0042/0044/0053.

- **ADR-0061** _(Accepted)_ — Dialog layout: form-layout primitives, and the two-pane
  editor. Every dialog body was the same shape — one `flex flex-col gap-4` around one
  field or around nine — so the structure could not say which fields belonged together
  or which mattered; and `Dialog` defaults to `max-w-md`, so both the four-tab activity
  editor and the eight-field resource form were **448px** wide (the editor's Scheduling
  tab ~940px tall, Save below the fold). The fix is a **vocabulary, not a stylesheet**:
  `FormSection` (a named group — `role="group"` + a real `<h3>`, because a `<legend>`
  only captions as first child and a fieldset's `min-width: min-content` overflows a
  narrow dialog), `FieldGrid` (two columns only where two controls are one decision; a
  **container query**, since a dialog's width comes from its size preset and not the
  viewport) and `ContextStrip` (the read-only facts an edit is about — withheld entirely
  before first recalculation, because a row of em dashes reads as breakage). The activity
  editor alone takes the **rail-beside-pane** layout at a new `xl` size, for the same
  reason per-scope save was structural in ADR-0060: its scopes carry **different
  permissions** and a horizontal strip has nowhere to say so, so a Contributor now sees
  which sections are shut on arrival. `Tabs` gains `orientation="vertical"` (with its
  consumer, which is what its own "no orientation prop" docblock was guarding against)
  and a discriminated `TabMarker` — count/dot/locked had been inferred from whether a
  number was present, which is how "3 problems" and "you cannot edit this" rendered as
  the same dot. **Deliberately unflagged**: this is a structural refactor of nine dialog
  bodies with no behavioural difference, and gating it would mean two copies of each in
  one file; the existing suites query by role and label, which is exactly the contract it
  preserves. The authoring rule lives in `docs/DESIGN_SYSTEM.md` §"Form layout" so the
  next dialog is not a judgement call. Amends ADR-0060's layout, not its save model.

- **ADR-0057** _(Accepted)_ — Real modules replace the reference template: deletes
  `apps/api/examples/reference-feature/`, `scripts/verify-template.sh` and the CI
  template job, superseding ADR-0014/0015. With 19 real modules built to the
  standard, a synthetic `ReferenceItem` taught less than the code it modelled while
  costing a standing "keep it in step" obligation and a working-tree-mutating verify
  script (which destroyed uncommitted work once, TECH_DEBT #52). `docs/REFERENCE_FEATURE.md`
  keeps the standard and now names three exemplars — `modules/clients` (canonical
  shape), `modules/notes` (cascade + polymorphic parent), `modules/share` (auth
  boundary). "Must copy the template" becomes "must match the standard"; divergence
  still needs an ADR.

A lighter-weight running log of smaller decisions is in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## 17. Known limitations & assumptions

- **Four accepted ADRs have no implementation** — background jobs + Redis
  (0009), caching (0010), object storage (0011), and OpenTelemetry metrics and
  tracing (0013, of which only Pino is wired). Nothing in the running system
  depends on them and none of their dependencies are installed. Do not cite
  them as existing capability; see `docs/ARCHITECTURE.md` §10. The mail port is
  a **logging** stub — invitation emails are logged, not sent.
- **No append-only audit log** exists; row attribution plus structured logs are
  not an audit trail (`docs/TECH_DEBT.md` #14). There is likewise no hard-delete
  or data-export path — every deletion is a soft delete.
- Deployment target (managed host vs. self-hosted Kubernetes) is **not yet
  decided**; the container/registry foundation is deliberately platform-neutral.
  Auto-deploy exists but ships dormant, so a release does not reach users until
  an operator acts (ADR-0047, `docs/TECH_DEBT.md` #5/#29).
- Cross-browser e2e coverage is Chromium-first: the Playwright config defines
  firefox/webkit projects but the journeys are exercised mainly on Chromium.
- The engine's draw-performance budget (ADR-0026 §16) has never been measured on
  the hardware envelope it names — a mid-tier laptop and iPad-class Safari. CI
  runners cannot stand in for that (`docs/TECH_DEBT.md` #59).
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
2. **Build features to the implementation standard.** Match the layering
   (controller → service → repository), deny-by-default auth with permission and
   org-scope checks, standard envelopes, DB standards and tests described in
   [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md), starting from the
   nearest real exemplar (`modules/clients`, `modules/notes`, `modules/share`).
   **Do not diverge from those cross-cutting patterns without a documented
   architectural reason — an ADR** (ADR-0057, superseding ADR-0015). There is no
   template to keep in step: the exemplars are real modules under real tests.
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
choice, trade-offs, consequences). **Repository maintenance:** run the
**reconciliation pass** ([`docs/RECONCILE.md`](docs/RECONCILE.md), ADR-0058) at
each epic boundary, with a three-month hard floor — architecture, dependencies,
security, performance, tech debt, docs and UI consistency. Its rule is _verify
the claim; do not trust the document_: "review periodically" produced months of
drift, including a stage banner in this file that described a repository with no
domain code while nineteen modules were shipping.
