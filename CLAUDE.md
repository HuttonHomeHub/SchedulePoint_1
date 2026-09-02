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

> **Current stage: the application is substantially built.** 23 API modules
> (`apps/api/src/modules/`), 29 Prisma models across 58 migrations, 1136 web
> source files with 41 Playwright suites beside the base journey, and
> 122 ADRs.
> **These six numbers are now a computed gate, not a promise.** `pnpm check:counts`
> re-derives every one of them and fails if this paragraph disagrees, so a stale
> figure stops a build instead of misleading a reader (ADR-0076). It became a gate
> because prose could not hold the line: this line said "recounted 2026-08-04" and
> was wrong on 2026-08-05 — two ADRs, twenty-one source files and two suites out —
> one day after a recount whose own wording warned the reader to distrust it.
> Telling people to re-run `ls | wc -l` is exactly the vigilance ADR-0058 says to
> replace with a check.
> The CPM/GPM engine is real and its conformance matrix is closed (ADR-0034).
> Read the code before assuming anything is missing — this banner said the
> opposite for months after it stopped being true, which is exactly the failure
> it now warns against.
>
> Since 2026-07-31 the **application** has a test bed of its own (ADR-0066): 37
> documented seeded plans and hostile cases created through the public REST API,
> keyed to [`docs/TEST_PLAYBOOK.md`](docs/TEST_PLAYBOOK.md), which says which plan
> proves what and what _wrong_ looks like. Use it before hand-building a plan to
> reproduce something — and note what it exists to cover: the conformance harness
> proves the **engine**, never a write path, a DTO or a guard.
>
> The **Gantt view shipped** on 2026-07-28 (ADR-0059, `VITE_GANTT_VIEW`
> default-on) — read-only by design, with WBS rows, the baseline variance bar and
> a printed programme. It **substantially** delivers the last outstanding
> Must-have in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) §8, which words it
> "read-primary; **edit supported**" — Gantt editing is deferred as ADR-0059 M5,
> so that line is not yet closed. This banner and the PR that shipped it both said
> "closing the last Must-have" until the brief was re-read: the same trust-the-
> document failure the paragraph above warns about, one paragraph later. Hosting
> is **settled** (Docker Compose + ADR-0047 auto-pull, `docs/TECH_DEBT.md` #5) —
> this banner listed it as the open question until 2026-08-04. New work still follows the delivery
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
│   ├── api/                  # NestJS REST API (@repo/api)
│   │   ├── src/modules/      #   23 feature modules
│   │   ├── src/modules/schedule/engine/  # The pure CPM/GPM engine
│   │   ├── src/common/       #   Auth, guards, filters, locks, lifecycle
│   │   ├── prisma/           #   Schema (29 models) + 58 migrations
│   │   └── test/             #   Supertest API e2e specs (+ test/pairwise/)
│   └── seed-cli/             # `schedulepoint-seed` — seeds the catalogue (ADR-0066)
├── packages/
│   ├── config/               # Shared ESLint + tsconfig presets (@repo/config)
│   ├── interchange/          # Pure schedule-interchange model/parsers (ADR-0050)
│   ├── layout/               # Pure lane packer, shared by the canvas + importer (ADR-0069)
│   ├── engine-conformance/   # Engine-free conformance fixture + loaders (ADR-0034)
│   ├── seed/                 # Pure SeedSpec model + pairwise/scale/negative builders (ADR-0066)
│   ├── seed-http/            # The seeder as an ordinary REST client (ADR-0066)
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
- **Which seeded plan demonstrates which capability** — and what _wrong_ looks like
  for each — is [`docs/TEST_PLAYBOOK.md`](docs/TEST_PLAYBOOK.md) (ADR-0066), gated
  by `pnpm check:playbook`.
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
- **After a squash-merge, reset the branch from `main` before doing anything else**
  — `git fetch origin main && git checkout -B <branch> origin/main`. A squash
  replaces the branch's commits with one new commit, so a branch that carries on
  from its old tip now holds history `main` will never contain. The next PR from it
  is **unmergeable** (`mergeable_state: dirty`), and because GitHub cannot compute
  a merge ref, **CI never starts** — the PR looks like it is waiting for checks
  that will never arrive. This is not hypothetical: it happened to the long-lived
  agent branch after PR #193, and again after the release PR that followed it.
  If the branch has already grown work past the merge, rebase that work onto the
  new base (`git cherry-pick`/`git rebase --onto`) rather than merging `main` in —
  a merge re-adds the changeset files the release already consumed and deleted,
  which silently double-bumps the next version. Then `git push --force-with-lease`:
  the discarded commits are already on `main` in squashed form, so nothing is lost.

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
(ADR-0055). **Mobile-first, and no one-off component styling — ever.** The product has
**one theme**, declared at `:root` (ADR-0097) — light, dark and system were withdrawn,
and the mechanism that would carry a future dark variant is kept live rather than
deleted, so "never branch on theme in JS" still holds and still matters. The
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
- **ADR-0006** — Styling and design tokens (Tailwind v4 + CVA). Its shadcn/ui +
  Radix clause was **never adopted** — primitives are hand-rolled on the APG;
  see the ADR's status line.
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
    optimistic 409 and the advisory lock. Unblocked on-canvas editing, whose flag
    (`VITE_TSLD_EDITING`) is **still live** (`apps/web/src/config/env.ts:114`,
    consumed at `TsldPanel.tsx:1311`) and sits in ADR-0084 batch 3. This line said it
    "retired in batch 1 — the pen is unconditional" until 2026-08-09: it was retired
    in batch 1 and **put back the same day**, because CI found the base Playwright
    config pins it off for six editing specs. The banner was written from the plan
    rather than from the outcome, which is ADR-0076 Class 1 inside the register's own
    first batch.
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

- **ADR-0062** _(Accepted; M0–M6 landed, `VITE_ACTIVITY_EDITOR_CONVERGENCE` **default-on**
  2026-07-29)_ — Activity-editor convergence: Logic, Resources and Notes as tabs. ADR-0060 made one
  activity one editor and then left two of that activity's surfaces outside it — the row menu opened
  the editor for three items and separate modals for the other two, and the Logic modal's "Add …"
  buttons opened a **third** dialog on top of it to do the thing that surface exists for. The
  load-bearing call is that the panels are **extracted, not reimplemented**: `ActivityLogicPanel` and
  `ActivityResourcesPanel` are the _same components_ the dialogs render, so a tab and a dialog cannot
  drift — a drift that would be invisible, since each looks right alone and only a reader who opens
  the same activity two ways would ever see one is a version behind. The extraction's proof is that
  **every pre-existing suite passed unchanged** through it. Adding a link becomes an **inline
  section** below the two tables (the list/manage archetype, amending ADR-0032 M5), with direction as
  a **field** rather than a fact carried by which button you pressed. Permissions do not change, and
  that is checkable rather than asserted: Logic and Resources **reuse the `definition` gate object**
  (an identity test pins `gating.logic === gating.general`) while Notes join the **progress** rule,
  because ADR-0046 deliberately does not pen-gate them — which is exactly why ADR-0060's per-scope
  save had to exist first. The flag is **derived** (`ACTIVITY_EDITOR_TABS_ENABLED && …`), since a tab
  without the editor to hold it would strand both entry points on a surface that opens nothing.
  **M6 is the gate pass**: it caught the Resources tab **hiding** its assign form instead of shading
  it with a reason (raised independently by ux and component — the lit-but-inert dead end inverted),
  a tab order that followed build order rather than the subject, a steps save bar that never passed
  `saved` — in a panel with **no unit coverage at all**, because the suite named for steps covers the
  legacy dialog — and the strandable flag pair. All folded with regression tests; the accessibility
  review found no blocking failure and its four nits are TECH_DEBT #64 (widened)/#66/#67/#68, with
  the component review's second finding as #69. Frontend-only: the CPM engine, the API and the
  recalc parity gate are untouched, and the flag-off parity suites are kept as the rollback contract.

- **ADR-0063** _(Accepted; M0–M6 landed, `VITE_WBS_IMPROVEMENTS` **default-on** 2026-07-30)_ —
  The pinned WBS band, and the canvas band model. ADR-0038 gave activities a parent tree; nothing
  in the product then let a planner **see the programme at band level**, or fix a mis-built
  grouping without deleting the forty activities inside it (the only delete is the ADR-0038
  subtree cascade). The band is a **fourth canvas layer**, top-pinned, painted from the **same
  `viewRef`** and importing `screenXOfDay`/`daysBetween` verbatim — column alignment with the
  scene is definitional, not arithmetic that has to be kept in step, which is the ADR-0059
  "the time axis is shared, not reimplemented" rule applied inside one picture. It is
  **select-only**, and that is what the object permits rather than a scoping compromise: a
  summary's dates are an engine rollup, so there is nothing on it to drag and no good answer to
  what dragging one would mean for its children. Depth is capped at **0–2 stacked** (depth 0
  alone is often one node — a bar spanning the whole plan is a decoration; uncapped makes the
  band's height data-dependent, taking the canvas away a row at a time). Summaries **leave the
  scene** when the band is on, so the invariant that matters is stated as a test rather than a
  paragraph: **the count of AT-reachable activities does not change across the toggle** —
  ADR-0026 D7's hand-built DOM layer is the only way an AT user reaches a bar. Building it showed
  the drafted "move them to a band DOM group" to be the worse option and it is not what shipped:
  the listbox reads the plan's activities rather than what the scene paints, so the invariant
  holds **by construction**, with no second list to keep in step. The specific thing most likely to break is quiet:
  three features (`create popover`, cursor readout, drag ghosts) convert canvas-y to container-y
  by adding `RULER_HEIGHT`, correct only while the ruler is the sole thing above the scene — so
  that constant becomes one derived `sceneTopOffset` routed through every call site, with its own
  regression test band-on and band-off. The **Unassigned** bucket is **derived** (`features/wbs/
model/wbs-groups.ts`, shared with the Gantt row model so the two cannot disagree) and is
  announced but not selectable; a persisted bucket was rejected because it would change
  `computeSchedule`'s input for **every plan in the system** — the byte-identity ADR-0034 exists
  to protect — for a display feature. **Dissolve** (`POST …/dissolve`) is recorded here as the
  inverse of building a band, including the part users get wrong: restoring a dissolved summary
  brings back **the summary only**, so the client records it as a non-undoable boundary that
  truncates the stack (the ADR-0048 M2 cascade rule). Amends ADR-0049 (bands at both ends),
  ADR-0052 M4 and ADR-0055 §4/ADR-0056 (one more `View▾ ▸ Structure` member); references
  ADR-0038 rather than editing it. **The CPM engine and the recalc parity gate are untouched.**
  **M4b** adds the table's other half — a selection column and a bulk-assign bar sharing the Members
  panel's minimal, version-carrying batch — and settles a rule the epic had not needed until then:
  **selecting is a read**, so the checkboxes are not gated on the write right, because the bar they
  open is the only place that says why the write is shut. **M5** puts the band into the exported
  picture and the derived bucket into the printed programme, on **one** shared derivation
  (`features/wbs/model/wbs-band-source.ts`) — two answers to "how tall is the band and what does the
  scene still paint" would have differed eventually, and only in a printed programme. **M6** is the
  gate pass, and it earned its place again: four defects that had passed a human read. A summary
  selected while the band was on lost its **entire selection-actions bar** — the band lifts
  summaries out of the scene, the anchor lookup only consulted the scene, and `visibility: hidden`
  took Dissolve out of the tab order as well as out of sight, so turning the band on silently
  disabled the canvas's own actions on every phase it drew. The Assign button used the native
  `disabled` attribute on a control that flips twice per save (the `ScopeSaveBar` lesson, re-learnt).
  `dissolve` bumped its children's `version` and returned `204`, so a cached child was stale with
  nothing saying so — it now returns the promoted rows. And it read those children's new parent from
  a snapshot taken **before** the lock it takes to make that read safe: a silently wrong tree
  produced by a transaction that looked correctly serialised. Two more findings are recorded rather
  than rushed (`docs/TECH_DEBT.md` #71–#74). The flag-on journey `apps/web/e2e-wbs/` (its own CI
  step) proves the permission model and the no-activity-lost invariant against a real API with the
  pen enforced — the only place the optimistic-`version` trap is testable at all.

- **ADR-0064** _(Accepted; M1–M3 landed + the enablement review folded, released in `web-v0.62.0`;
  `VITE_CANVAS_AUTHORING_FLOW` **default-on** 2026-07-31)_ —
  Canvas authoring flow: the tool-mode contract and recalculation quiescence. Opened on two reports
  from one driving session — six link attempts producing **zero** dependencies, and one link
  recorded the wrong way round — and its first act was to **diagnose rather than fix**. The
  `e2e-authoring-flow` harness drives the two-click pick against a real API with the pen enforced,
  sweeping the inter-click delay across the 500 ms debounce, and **measures** which bar each pixel
  is (probing in `select` mode and reading the canvas's own parallel listbox) before and after the
  pick, so "a click was dropped", "the scene moved" and "something else" produce different evidence.
  Every case recorded one dependency, in click order, map unchanged: the reversed link is closed
  **unreproduced**, not fixed. What the same session's other report _does_ explain is that the Link
  trigger armed **nothing** — so the planner was still in Add mode and drew two activities, which is
  also the shape most likely to be reported as a reversal. Two of the spec's own `[VERIFIED]` claims
  were wrong, including "Escape does nothing for the Add tool": the test written to fail on it
  passed first run. The decisions: **one arm/disarm contract** across all four modes (both
  split-buttons arm from the primary region, Escape returns to `select`, the open link pick takes
  the first Escape and the tool the second, every transition announced); a **mode statement band in
  the chrome above the scene, never over it** — the canvas already carries three overlays and a
  fourth eventually lands on the bar you meant to click; a link confirmation naming the
  **direction** with an ADR-0048 Undo; **token-based, capped recalculation holds** so the bars
  cannot move between a planner's two clicks, released in an effect cleanup because a leaked hold
  fails silently; and keyboard pick parity seeded **into** the canvas gesture so keyboard and
  pointer are one pick. **The CPM engine is not imported** — the ADR-0034 parity gate is untouched
  by construction; quiescence changes when the client asks, never what the server computes.
  **The enablement review (§7) is part of the milestone.** Five specialists over the combined diff;
  performance passed, four blocked on **five** defects that had passed a human read — a confirmation
  that replayed on every later arming beside an Undo bound to a _different_ edit (the guard field
  was always `'link'` and only read inside a `mode === 'link'` branch, so it could never be false);
  both split buttons restoring focus to their `tabIndex={-1}` caret (WCAG 2.4.3); the Link tool's
  pointer picks and both drop routes silent while the keyboard path announced (WCAG 4.1.3 — and one
  of those drops fires with no user gesture); a Cancel that announced "unavailable" while staying
  lit during a save it cannot abort; and three untested seams. **Four of the five are one correct
  pattern applied to a control and not its neighbour** — not design errors, inconsistencies inside a
  diff whose own docblocks described the right thing. Every fix carries a regression test verified
  to fail against the old code first. Seven non-blocking findings are `docs/TECH_DEBT.md` #76.

- **ADR-0065** _(Accepted; ADR-0064 M2, `VITE_CANVAS_LINK_ROUTING` **default-on** 2026-07-31)_ —
  Canvas link routing: orthogonal corridors that step around bars. A line drawn straight through an
  unrelated bar makes the reader disprove a relationship the picture appears to assert, which is
  the opposite of what a TSLD is for. Obstacle awareness is **one optional parameter of the existing
  `routeOrthogonal`** — absent, it returns exactly what it always returned, point for point — so the
  parity argument is structural: there is one route function, and a second `routeOrthogonalAvoiding`
  would have drifted invisibly (the ADR-0062 finding). The per-lane interval index is derived from
  the **same `activityRect` the bar layer draws from** (a milestone is a diamond, a summary a wider
  bracket; a second opinion would disagree exactly when it mattered), rebuilt per frame over the
  **culled** set, and the corridor search is **bounded and fixed-order** — determinism matters more
  than the shape, because a route that varies between frames reads as the diagram twitching. The
  arrowhead grows in **length only** (8 px, half-width pinned to `FAN_OUT_STEP_PX`): widening the
  barbs would push each head across its neighbour in a fanned bundle. **Diagonals are rejected** —
  on a time-scaled diagram x _is_ time, so a diagonal asserts work across the days it crosses, and
  that channel already belongs to ADR-0056's hatch and ADR-0054's tails; the ten-shape Net Point
  taxonomy is a vocabulary for describing routes, not ten branches to keep consistent.
  **The measurement is the notable part.** `apps/web/scripts/measure-link-routing.mjs` paints the
  real painter against a real 2D context in Chromium — and reports that the **pre-existing** painter
  runs at 16.7–23.1 ms p95 at 2,000 activities, i.e. **4–6× ADR-0026 §16's ≤ 4 ms**, which had never
  been measured (TECH_DEBT #59 said so; nobody had run it). Routing adds 3.4–5.9 ms on top. The
  number was put to the product owner with a recommendation to leave the flag off; the decision was
  to **enable it and reopen the budget instead**, since a target set before the canvas carried
  bands, tails, hatching, dates and arrowheads — and never once met — is more likely wrong than nine
  accepted features are. That is now `docs/TECH_DEBT.md` **#75**, which asks what to measure (frame
  pacing under rAF, not one function's wall-clock), on what plan, on what hardware, before setting a
  number to replace §16's. **M3 (§5) bundles near-identical corridors onto one trunk** — a hub's
  dozen verticals two pixels apart is a comb, not a picture of logic — with the rule that bundling
  may **never** snap a corridor back through the bar M2 moved it off (a free-check per corridor,
  because otherwise the newest feature silently reverts the previous one on exactly the dense plans
  where both matter), and moving the **line only**: lag anchors, handles and hit zones keep today's
  per-edge geometry, which the bundler structurally cannot reach. Re-measured, bundling costs
  nothing detectable — and it does not _save_ anything either, so the plan's "M3 is the remedy for
  the cost" reading is recorded as **not holding**. The CPM engine is not imported; the ADR-0034
  parity gate is untouched.

- **ADR-0066** _(Accepted; M0–M5 landed)_ — The seed catalogue, and the engine as the
  application's oracle. The ADR-0034 harness feeds `computeSchedule` — a pure function — so all 117
  capability keys are proven **at the engine** and none **at the application**; two defects found on
  one day (the importer coercing `TT_LOE` to a task, `parentId` never reaching the engine) were
  green at the engine and wrong in the product, and no gate could have caught either. So: plans
  created through the **public REST API** in five tiers — fixture, per-capability, pairwise, scale,
  hostile — with `docs/TEST_PLAYBOOK.md` naming which plan proves what and `pnpm check:playbook`
  gating that its rows resolve **in both directions**. The load-bearing decision is that the
  pairwise differential builds the engine's input **from the `SeedSpec`, never from the persisted
  rows**: reading the database back would reuse the very assembly both defects lived in, and the
  comparison would agree with itself. What it found is the argument restated as evidence — three
  write-path gaps no existing gate could report (TECH_DEBT #78/#79/#80, the largest being that
  ADR-0036's intraday shift patterns are authorable by nothing), a scale generator that held every
  declared shape number while being **one queue** (96% critical, ten years for 500 activities), a
  draw benchmark measuring the cull rather than the painter, and — from the M5.4 round trip — the
  exporter still downgrading every Level of Effort to a task, kept alive by a docblock describing
  importer behaviour that had already been corrected. **The CPM engine is not modified and the
  ADR-0034 parity gate is untouched.**

- **ADR-0067** _(Accepted; M0′–M4 landed, `VITE_CALENDAR_SHIFT_EDITOR` **default-on** 2026-08-01)_ —
  The calendar shift editor, and storage honesty. ADR-0036 moved storage and the CPM engine to
  working-**minutes** with intraday shift patterns a year ago; **nothing in the product could author
  one**, because the calendar form offered seven weekday checkboxes and a checkbox can say only
  _whether_ a day works. The editor replaces them with a per-day list of `HH:MM` periods on ONE
  shared `WindowListEditor` — the same primitive the dated-exception editor uses, because a window is
  authored in two places and two editors would drift about ordering, overlap and midnight in a way
  only a planner who authored the same hours both ways would ever see. Times are **text, not
  `<input type="time">`**: a full day ends at 24:00 and the native control stops at 23:59, and
  reading `00:00` back as 24:00 was rejected as read-time inference. A night shift **is two windows
  on two days** and is written that way, with both named aloud. Presets are **verbs** — applying one
  writes windows and then has no further existence, so nothing persists which preset produced a
  week. **M4 is the epic's own premise landing on itself**: five specialist gates over the combined
  diff found ten blocking defects in code that had already passed a human read, the largest a **dead
  end** for the very shape the epic exists to support — a calendar with no working week could be
  created by the Window-only preset and then never saved again, refused by a hidden rule with no
  control on screen to satisfy it. The flag-on journey (`apps/web/e2e-calendar-shifts/`, its own CI
  step) earned its place on its first run by finding that a menu opened from inside a modal
  `<dialog>` was unclickable — a modal dialog is in the browser's **top layer** and the menu
  portalled to `document.body`, which no z-index can reach and no unit test can see, because jsdom
  has no top layer.

- **ADR-0068** _(Accepted)_ — A calendar carries an **hours-per-day** (P6's `day_hr_cnt`). It is the
  day↔minute factor for every day-denominated field measured on that calendar, derived **once** at
  the moment shifts are written and stored — never on read, because a standing derivation would make
  the factor a function of the shift rows, so shortening one Friday would silently reinterpret every
  stored duration. `durationDays × hoursPerDay × 60` replaces `× 1440`, so "5 days" on an eight-hour
  calendar is 2,400 working minutes and not 7,200; baselines **freeze** the factor at capture; the
  `TWENTY_FOUR_HOUR` lag calendar stays pinned at 1440. **The CPM engine never sees it** — its
  `WorkingTimeCalendar` port is `addWorkingTime`/`workingTimeBetween` over shift and exception rows
  only, so the ADR-0034 recalc parity gate is structurally untouched. P6's `day_hr_cnt` now
  round-trips through interchange in both directions (ADR-0050's mapping table moved in lock-step);
  MSPDI has no per-calendar equivalent and reports the drop rather than inventing a figure.

- **ADR-0069** _(Accepted)_ — A shared lane-layout package, and packing an imported programme. An
  import gave each activity a `laneIndex` equal to its **position in the source file**, so a
  500-activity programme opened as 500 lanes holding one bar each — the on-ramp from P6, and the
  first picture a planner sees of a schedule they already know, was noise. `packLanes` (written for
  the canvas's Auto-arrange, refined by ADR-0064's predecessor hint) moves to **`@repo/layout`** and
  is called by the interchange commit as a **third phase** — necessarily after the recalc, because
  the packer packs by time and an imported activity has no dates until then, and inside the same pen
  window, because writing `lane_index` is an ordinary plan mutation. A second server-side packer was
  rejected for the ADR-0065 `routeOrthogonal` reason: two implementations would drift, and **the
  drift would be invisible** — only someone comparing an imported plan against the same plan after
  pressing Auto-arrange would ever see it. Phase 3 is **best-effort and deliberately asymmetric with
  phase 2**: a recalc failure means wrong dates and rolls the import back, a layout failure means a
  correct plan arranged badly, which one press of Auto-arrange fixes. **The CPM engine is not
  imported and the recalc parity gate is untouched** — `lane_index` is presentation and
  `computeSchedule` has never seen it.

- **ADR-0070** _(Accepted; M0–M6 landed, `VITE_SUB_DAY_DURATIONS` **default-on** 2026-08-02)_ — Sub-day durations and
  lags in the authoring surface. ADR-0036 moved storage and the engine to working **minutes** a year
  ago, ADR-0068 made a _day_ a per-calendar quantity, and `api-v0.34.0` put `durationMinutes` /
  `lagMinutes` on the public DTOs — and **nothing in the product could type one**: a four-hour lift
  or a 30-minute cure lag could be imported, scheduled, levelled and exported, and never entered.
  The same shape as ADR-0067, one field along, found the same way (ADR-0058's _verify the claim_,
  applied to the 25 activity-update DTO fields against the web editor). The field becomes **text**
  with a `d`/`h`/`m` grammar (`2d 4h`, `90m`, `1.5d`); a **bare number still means days**, which is
  what makes it not a migration. Weeks are **refused, not guessed** — a construction week is five
  days to one planner and seven to another and SchedulePoint has no setting to disambiguate. The
  load-bearing decision is that `hoursPerDay` is a **required parameter** of the parser and the
  formatter, never defaulted: after ADR-0068 defaulting to 24 reads a planner's `1d` on an
  eight-hour calendar as three days' work and defaulting to 8 does the reverse, both silently and
  both changing dates — so the compiler enforces the ordering. The factor is read from the calendar
  the **form** currently selects (a planner can change calendar and duration in one edit, and only
  the client knows the pending choice); where it cannot be resolved the field degrades to whole
  working days, which is the same code path as flag-off, so the rollback contract and the
  not-yet-loaded state cannot rot separately. It also closed a live defect: a canvas move resent the
  **rounded** duration, flattening a sub-day activity to zero on every drag. Cross-plan lag is
  deliberately out of scope (its DTO carries no minutes). **The CPM engine is not imported and the
  ADR-0034 parity gate is untouched** — this changes only which of two already-supported write
  fields the client sends.

  **M4–M6 finish it.** The table read-outs show a sub-day value exactly instead of `0 d` — which is
  also what the Duration column prints for a **milestone**, so the one screen listing a plan's work
  was showing real activities as having none; the whole-day branch prints the row's **own**
  `durationDays`/`lagDays` rather than re-deriving from minutes, after the epic's flag-off parity
  test caught the first version rounding a four-hour lag up to `+1d`. The flag flipped only once
  `apps/web/e2e-sub-day/` (its own CI step) drove both fields against a **real API with the pen
  enforced** on an eight-hour calendar, asserting the stored minutes read back from the API rather
  than the DOM under test. That journey earned its place on its first run, twice: the plan's calendar
  never reached `CreateActivityButton`, so on the surface where every activity is first created the
  duration field rendered, looked right and quietly refused `4h`; and a duration typed before the
  calendar list resolved could be **overwritten** by the re-seed, because `useDurationSeed` asked a
  `dirtyFields` flag captured by the render its effect belonged to — a keystroke and a network
  response are independent events, so the effect read a stale `false`. The fix stops asking a flag
  and asks the field: a `readDuration()` getter called inside the effect, re-seeding only if the
  value is still what it saw at open (`docs/TECH_DEBT.md` #83, closed). Both are the ADR-0067/ADR-0064
  shape — a correct pattern applied to one control and not its neighbour, invisible to every gate
  that does not run the real thing.

- **ADR-0071** _(Accepted; M1–M3 landed, `VITE_ASSIGNMENT_LAG` **default-on** 2026-08-02; **filed
  2026-08-04**)_ — Per-assignment lag, and what it costs the levelling and Earned-Value parity
  arguments. `engine/resource-histogram.ts` had taken a per-assignment `lagMinutes` since the
  ADR-0044 rung-5 slice and **nothing in SchedulePoint could store one** — the ADR-0067/ADR-0070
  shape again, one field along. An unsigned, activity-calendar-framed, constant-defaulted column
  shifts the effective span to `[start + lag, finish)`; the levelling parity argument **changes**,
  and the ADR says so in those words rather than asserting it still holds (Gate A / Gate B split
  amending ADR-0041 §7); Earned Value gains a per-component PV phasing model, described as one
  rather than smuggled in (extending ADR-0042/0044); the engine's own guard is a **typed error and
  a 422, not a 500**; and interchange takes a shape now and a parser only once a real export has
  been read.
  **This entry, and the ADR's own filing, are the drift finding.** The document lived at
  `docs/specs/assignment-lag/adr-0071-draft-per-assignment-lag.md` for its whole epic — maintained
  through M6 and the flag flip — and was never moved into `docs/adr/` on approval, so a decision
  cited **by number** in `docs/DATABASE.md`, `docs/TECH_DEBT.md`, three other ADRs, two migrations
  and `packages/types` was absent from the register. The audit-log spec **found it** while choosing
  its own number, recorded the collision correctly, and routed around it. Noticing drift and
  stepping over it leaves the register exactly as wrong as not noticing — ADR-0058's rule needs the
  second half.

- **ADR-0072** _(Accepted; M1–M3 landed, `VITE_AUDIT_LOG` **default-on** 2026-08-03)_ — The
  append-only audit log, closing TECH_DEBT #14. Row attribution plus structured logs are not an
  audit trail: `updated_by` says who touched a row last and nothing about who was **refused**, and
  a log line is not evidence. The record is a single `audit_events` table made append-only **in the
  database** — `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE` triggers, `ENABLE ALWAYS`, so the
  application role cannot bypass them — which makes the honest claim tamper-**resistant**, not
  tamper-proof, and the ADR says so. Payloads pass an **allow-list per action** (a `NEVER_RECORD`
  substring ban catches `token`/`hash` independently), and a **route census** derived by reflecting
  the live Nest tree fails if a route that changes who can do what stops being audited. M1 covers
  membership, invitations, organisations, the five `auth.*` events and hierarchy delete/restore;
  M3 adds share links and **measures** the storage (1M rows: ~592 B/row, both reads sub-millisecond)
  to answer the partitioning question with data rather than instinct. **The CPM engine is not
  imported**, and auditing the recalculation is forbidden — a recalculation is deterministic from
  inputs that are themselves auditable, so a row saying "the schedule was recomputed" is noise, not
  evidence. Note the census's actual shape before relying on it: its six assertions force a route
  **to be** audited (and force every route to be classified, once, one way), but **nothing forbids
  auditing one** — so `ENGINE_DERIVED` is a rule with a documented reason, not a gate. The
  implementation plan for ADR-0073 states the opposite; if that protection is wanted it has to be
  written. Coverage widening is ADR-0073.

- **ADR-0073** _(Accepted per-milestone; C1 landed, `VITE_AUDIT_FILTERS` **default-on** 2026-08-04)_
  — Which mutations earn an audit event, and who may read an actor-less one. ADR-0072 met a real
  reader within hours: they created and deleted activities, opened the log, found nothing, and asked
  why — then said sign-ins were missing too. Neither observation was a fault, and both were the
  **screen's**. What first contact exposed is one failure in three costumes — **the log records
  things nobody can find**: a failed sign-in carries neither `organization_id` nor an actor, so both
  reads filter it out and the single most useful row an audit log has is reachable only from `psql`;
  there is no filter on either side, so seven event kinds arrive in one undifferentiated stream; and
  88 mutating routes sit in `UNAUDITED_ROUTES`. The load-bearing decision is that coverage is
  **derived from two tests — durability and blast radius — not from a list of opinions** about which
  endpoints are interesting, so a route added later is classified by the same rule rather than by
  whoever is reviewing. Content edits are **permanently excluded**, not deferred again. And the
  ordering is a hard gate rather than a preference: **the filter precedes the coverage**, because a
  `VITE_` constant is a client build-time value and cannot gate a server-side producer (the ADR-0060
  M0 rule) — so the day the first coverage producer merges every reader's feed gains two to three
  orders of magnitude more rows, flag or no flag, and a log with no filter at that moment is
  unusable for everyone with no rollback that helps.
  **C1 also found what the gates could not.** The index question was **measured** rather than
  asserted, and the measurement changed a decision: at 1M rows a zero-match filter combination costs
  681–954 ms against 0.35 ms unfiltered, because with no index on `action` Postgres walks the whole
  organisation partition to prove an absence — so the cheapest way for a caller to reach the worst
  case in the system was the one combination already established to be incapable of returning a row.
  That combination (`auth.*` on the organisation route) is now a **422, not a documented no-op**;
  documenting it and accepting the request anyway was the first draft, and is TECH_DEBT #19 in a new
  costume. Two reviewers independently caught a docblock claiming a cap sat above the vocabulary
  when it sits exactly on it, and the accessibility gate caught the live region announcing
  **"Showing 0 events" for both empty states** — "nothing recorded yet" and "nothing matches what
  you asked for" are different facts, honoured in the visible copy and collapsed in the one channel
  a screen-reader user has, which is the distinction the whole milestone exists to make. **The CPM
  engine is not imported and the recalc parity gate is untouched.** Filing ADR-0071 is part of this
  ADR's own record: choosing a number surfaced that ADR-0071 had never been filed despite being
  cited by shipped code, and it was filed rather than routed around.
  **C2 (`VITE_AUDIT_SELF_SECURITY` default-on 2026-08-04)** makes a failed sign-in readable by the
  account it named, closing TECH_DEBT #91. The attempted address is resolved to a user id at **write
  time** into `subject_id` — not at read time, because addresses get reassigned and a read-time join
  would silently move one person's history into another's — and surfaced by an **opt-in projection**
  (`?include=attempts`) whose absence is byte-identical, which is what lets the web half sit behind a
  flag with no server flag. Attribution is **forward-only**: the table refuses `UPDATE`, so earlier
  rows can never be attributed, and that is stated rather than worked around. C2.1 **observed** three
  things instead of assuming them — the stored label keeps the caller's casing while the user row is
  lowercased (so the normaliser is `toLowerCase()` and **nothing else**; trimming would attribute a
  probe to an account that input could never have reached), a malformed body still writes a row, and
  Better Auth's rate limiter is 3-per-10s per IP but stored **in process memory**, so the bound is
  per-replica and horizontal scaling silently multiplies it. C2.3's measurement again contradicted
  the plan: the plan said the remedy was two merged keyset queries **rather than** an index, but the
  existing actor index is partial on `actor_user_id IS NOT NULL` and therefore **structurally cannot**
  serve rows where that column is null — 49–52 ms sequential scan against 7.1 ms indexed, for 576 kB
  on a 145 MB table, so the index ships and the merge is recorded as the remaining constant-factor
  move.
  **The C2.5 gates earned their place, and one of them corrected the author.** Security found nothing
  blocking. Accessibility passed the markup but caught that the safety caveat was reachable only by
  reading serially — a landmark-navigating reader lands _inside_ the table region, so the note is now
  `aria-describedby`-linked to it. UX found the copy **wrong in substance**: it opened "someone tried
  to sign in as you", when the commonest cause of the row is the reader's own mistyped or stale
  password, on the one screen framed around a security concern. It now says so first. UX also caught
  that the milestone had shipped with **only its rollback contract tested** — the parity suite proved
  what the screen does not do, and nothing proved an attempt row reached the reader with the column
  and sentence that make it legible; that suite now exists. The journey found two more: an assertion
  scoped to the document rather than the row passed on the prose alone, and **My activity sits
  outside any organisation**, so the nav link the test clicked is not rendered there at all.
  **C3 is the coverage itself, and C3.0 measured before a producer shipped.** ADR-0072 gated the
  rung on an estimate nobody had made; the check counts from the seed catalogue's own `SeedSpec`s
  rather than from persisted rows, because an append-only table cannot be cleaned — narrowing the
  catalogue is cheap before a producer exists and impossible after. Measured **3,200 link creates
  for a 2,000-activity programme against an estimate of 2,500 (1.28×)**, inside a 5× gate; the
  catalogue ships unchanged. **C3.1** lands family D — an activity deleted, restored, dissolved or
  regrouped, and a link added or removed — each inside the existing transaction after the existing
  `assertHoldsPen`, and each **one row per user action, never per swept row**: deleting a summary
  with forty-one descendants records one event carrying scalar counts. It also fixes a promise that
  had never worked (spec §0.1): family C's cascade counts were specified as a nested
  `CascadeCounts` and could not have been recorded, because the redactor reduces any non-scalar to a
  type marker **by design** — so a delete of 412 activities said only that a batch happened. Two
  departures from the spec's own shape, both because the spec was wrong about a case the API
  permits: `activity.reparented` gains `parentCount` (a batch may name a different destination per
  row, which `{ movedCount, parentName }` would render identically to "moved to the top level" —
  absence a reader cannot distinguish from a fact, the defect this milestone exists to remove), and
  `activity.dissolved` is filed under **plan-structure, not deletions**, because a dissolve keeps
  the work. The census's `CONTENT_EDIT` splits into two **permanent** reasons plus a third,
  `PENDING_COVERAGE`, that is honestly a queue — pinned as a snapshot so the failure caught is a
  route quietly _arriving_ there, and emptied when C3.4 lands. **The CPM engine is not imported and
  the recalc parity gate is untouched.**
  **C3.2** adds family E — the rules other people's work is judged by. These are **updates**, which
  the durability test says do not earn a row; they are here on the blast-radius test, and a fourth
  positive census assertion now pins that, because a reader applying Test 1 alone would move them
  back with a plausible reason and remove the only explanation the log offers for "everything moved
  overnight". The plan's governance field set is **one `const`** that the redactor's allow-list
  **spreads** rather than restating, so a field removed from the set stops being recordable in the
  same commit; the producer diffs by **value**, because the settings dialog resends the whole form
  and a presence check would record fifteen changes each time a planner moved one. A calendar row
  names the **kind** of working-time edit and not the rows — the hours are non-scalar, but the
  reason to withhold them is the reader's, since a dump of seven days' windows buries the fact the
  row exists to carry — and all three exception routes fold into that one action, because an
  exception **is** working time. `baseline.captured` is the catalogue's only audited **create**, on
  the same test: a baseline is the standard every later variance is measured against.
  **C3.3** adds family F — library governance over ADR-0053 — and its sharp case is **archive**,
  which looks least like it needs a log and needs one most: an archived calendar or resource keeps
  scheduling **identically**, keeps every existing binding live, takes no lock and no cascade, and
  refuses only a **new** usage — so nothing breaks, nobody is told, and the whole effect surfaces
  days later as somebody asking why they can no longer pick something they used last month. Archive
  and unarchive are **two actions rather than one with a boolean**, because a reader filters on
  "what was retired?" and not "what had its flag written?"; a **tier move is a second row on the
  same request** (the first route in the census mapping to two actions), sharing a `correlation_id`
  so "these happened together" is recoverable without collapsing two questions into one; and a
  GROUP delete writes **one row carrying `resourceCount`**, never one per descendant. The two
  archive paths gained a transaction so the row shares the write's fate — an insert **beside** the
  update, not a lock around it, which is the ADR-0053 §4 property left intact. The web copy says
  **"Calendar retired"**, because the screen has to make the distinction the model makes.
  **C3.4** closes the coverage with family G — `interchange.imported`, the catalogue's only import.
  An imported plan arrived **whole**, from a file that is not retained, so once the tab is closed
  nothing distinguishes it from a plan somebody typed. Its producer is **the one that cannot sit in
  its write's transaction**, and the plan said it should: `audit_events` is append-only in the
  database, and the import's phase 2 **hard-deletes** the plan when the recalculation fails — so a
  row written with the graph would outlive its subject and permanently claim an import that was
  rolled back. It is written at the point of no return instead, which inverts the residual risk to
  a **missing** row rather than a false one: silence, which is the right way round. The payload
  names the file, the format and the size; `findingCount` is a scalar, because the report is a
  document and a count says "go and read it" without pretending to be it. This slice also **deletes
  `PENDING_COVERAGE`** — the one census reason that was a queue rather than a decision — and
  replaces it with an assertion that every reason is a decision somebody made, so the next route is
  classified by the two tests rather than deferred with a note.
  **C4 is the gate pass, and it earned its place for the fourth epic running.** Six specialists over
  the combined diff: security and backend-performance passed with nothing blocking (both re-derived
  the epic's own measurements from the final code rather than trusting them); the other four blocked
  on **six defects that had passed a human read**. The largest is the epic's own rule landing on
  itself — the action-filter cap shipped in C1 as the literal `20` with a paragraph explaining why no
  chip selection could reach it, and C3's nineteen new actions made **Deletions + Access 21**, so two
  chips offered side by side returned **422**. It is now derived from `AUDIT_ACTIONS` and cannot fall
  behind again. Next: the one producer written **outside** a transaction called `record()`, which
  fails its caller — so a successful import would have returned 500, invited a retry that creates a
  second plan, and skipped the pen release, under a comment describing the opposite trade. And the
  organisation log's own "what this records" sentence listed family D and none of E, F or G, in the
  milestone that added them; it now states the **rule** rather than an inventory, because an
  inventory goes stale every time the vocabulary grows. **Four of the six are one correct pattern
  applied to a control and not its neighbour** — the ADR-0064/ADR-0067 shape again. Every fix carries
  a regression test verified to fail first; six non-blocking findings are `docs/TECH_DEBT.md` #93.

- **ADR-0074** _(Accepted; M0–M5 landed, `VITE_ACCOUNT_SETTINGS` + `VITE_PASSWORD_RESET`
  **default-on** 2026-08-05)_ — Account recovery,
  verification enforcement, and the web origin's first Content-Security-Policy. SchedulePoint had
  **no password reset at all**, and not as a missing screen — as a **server refusal**: `createAuth()`
  configures no `sendResetPassword`, so Better Auth throws `RESET_PASSWORD_DISABLED`. No
  change-password, no session-less resend, no account surface to host them (`/me` is `@Get()` only).
  The only route back into a locked account ran through an operator with database access. Found the
  ADR-0058 way — the product owner asked whether login/admin was complete and the answer came from
  grepping `apps/web/src`, which returns **zero** matches for
  `forgetPassword|resetPassword|changePassword`.
  **Two blocking findings outrank every screen in the epic, and both are one configuration key in
  this app's wiring rather than a library defect.** Reset tokens would be stored **cleartext** —
  `processIdentifier` returns the identifier unchanged when no `verification` key is configured, and
  there is none, so the row would hold the literal `reset-password:<token>` for an hour, failing the
  bar `common/tokens/token.ts` set for this repo's own tokens (ADR-0016/0051: "a database leak never
  exposes a usable token"). And a completed reset would **leave every session alive**
  (`revokeSessionsOnPasswordReset` unset), which is the whole failure a reset exists to close. The
  ordering between them is load-bearing rather than tidy: hashing must merge **before** the endpoint
  is enabled, which makes the cleartext window **empty** and not merely short.
  **The load-bearing decision, and the precedent this ADR exists to set: _a client surface whose gate
  is a server-side condition is branched on runtime evidence, never on a `VITE_` constant_** — the
  generalisation of ADR-0060's M0 rule. `AUTH_REQUIRE_EMAIL_VERIFICATION` arms **three latent dead
  ends** at once (sign-up returns no session because `requireEmailVerification` **overrides**
  `autoSignIn`, and the client reports success then bounces with no message; sign-in 403s and
  re-sends nothing because only `sendOnSignUp` is set; invitation-accept instructs the user to verify
  with no way to do so). Those three ship **unflagged**, because a build-time constant cannot know
  which world the server is in — so a flag would be _actively worse than none_, stranding every new
  sign-up on a flag-off bundle against a flag-on server. Where the gate really is a product decision,
  two flags split by prerequisite (`VITE_ACCOUNT_SETTINGS`, no server dependency;
  `VITE_PASSWORD_RESET`, blocked on the mail work) — with the routes and the sign-in **link** in one
  flag, because a link to a conditionally-registered route is a link to nothing and **typecheck
  cannot catch it** (`...(FLAG ? [route] : [])` widens to include the route in both branches).
  Both flipped **default-on** 2026-08-05; the split earned its keep, because
  `VITE_PASSWORD_RESET`'s prerequisite turned out to be a **deployment fact** — mail confirmed
  sending on the host — rather than a code state, and reset's enumeration-safe copy makes a silent
  delivery failure indistinguishable from success to the one person who needs it to work.
  **M5 is the epic's own premise landing on itself, and it arrived from the journey rather than a
  reviewer.** Five specialist gates folded first; then `e2e-account/verification.spec.ts` — the only
  test that follows a real emailed link, through a real redirect, against a server with the switch
  actually on — failed, and the cause was **two more product defects**, established by driving the
  whole HTTP chain and proving it correct before changing anything. TanStack Router's default
  `parseSearch` is `parseSearchWith(JSON.parse)`, so `?verified=1` reached the route as the **number**
  `1` and a `typeof === 'string'` test discarded it: a verification that had succeeded rendered the
  "still waiting" screen, with the unit suite green throughout because every screen test mocks
  `useSearch` and never crosses the parser (`docs/TECH_DEBT.md` #96). And sign-up sent no
  `callbackURL`, so the **first** verification email — the one every new member receives — verified
  the address and dropped the reader on `/`, where the guard bounced them to `/sign-in` saying
  nothing: the same dead end M2 exists to close, one send path along, the resend fixed and its
  sibling not.
  The CSP is **derived from what the code loads**, not templated: no external origins at all, `blob:`
  load-bearing for `img-src` because the print surface renders a live object-URL `<img>`, `data:`
  deliberately absent. The inline theme-boot script **moves to a static file rather than being pinned
  by hash**, because a hash mismatch **fails closed and silently** — before first paint, in enforce
  mode only, on the deployed origin only, across two files with no compiler relationship. The mode is
  an **operator variable**, since hard-coding it makes rollback a release; `NGINX_ENVSUBST_FILTER=^CSP_`
  is essential or envsubst eats nginx's own `$scheme`/`$host`. `Permissions-Policy` is **enumerated,
  never blanket-denied** — `clipboard-write` is a controlled feature and two Copy buttons depend on
  it. **HSTS is excluded deliberately**: the container only listens on plain 8080 and cannot know the
  browser's scheme (TECH_DEBT #89), and HSTS is sticky.
  **The report-only window did its job, and what it found became a gate.** It reported a real
  `script-src`/`eval` violation on the deployed origin — Zod 4's `allowsEval()` probe, a swallowed
  `new Function('')` whose _attempt_ the browser still reports (`config/zod-jitless.ts` now sets
  Zod's own `jitless` flag; `'unsafe-eval'` was rejected, since it re-opens string-to-code across the
  origin to buy JIT speed on a few login forms). The finding outranks the fix: the policy was
  **derived by reading `apps/web/src` and validated by a person watching a console**, and **neither
  method can see what a _dependency_ does at runtime** — Zod's probe is not in our source at all.
  Every other invariant here has a computed gate (ADR-0058); this one had vigilance, which caught it
  once, in production, after release. So `apps/web/e2e-csp/` (`test:e2e:csp`, its own CI step) serves
  the **real** policy — parsed out of `docker-compose.yml`, never restated — over the **production
  build**, because the dev server is the wrong artefact twice over: it serves unbundled modules, and
  its inline react-refresh preamble would report a violation production can never have, i.e. a
  permanently red gate, which is how gates get deleted rather than fixed. It was **verified red
  first** (remove the `zod-jitless` import and the exact production shape reappears), and it states
  what it does **not** cover — canvas export, the printed programme, and `upgrade-insecure-requests`,
  which report-only ignores by specification.
  Three credential events earn audit rows — and the route census **structurally cannot see them in
  either direction** (`audit-coverage.structural.spec.ts:45-47`), so nothing would have failed a PR
  omitting them, which is the argument for doing them now. `auth.password_reset_requested` is itself
  an enumeration oracle and takes the ADR-0073 C2.2 attribution pattern with self-projection only.
  The existing user base is migrated by **backfilling only accounts that already hold a membership**
  — enforcement's value is prospective, and the membership predicate structurally excludes the one
  risky case a blanket backfill would grant (a squatted address holding a _pending_ invitation) —
  with the real count measured against the deployed database, never estimated. **The CPM engine is
  not imported and no migration runs**, so the ADR-0034 parity gate is untouched by construction —
  in its honest form: there is nothing to hold parity _for_. Supersedes nothing; builds on
  ADR-0003/0012/0016/0051/0060/0072/0073.

- **ADR-0075** _(Accepted; M0–M3 landed 2026-08-05)_ — Mail delivery is best-effort, and the
  failure belongs to the operator. Closes the open half of `docs/TECH_DEBT.md` #94 as a decision
  **not to build**: sending from application code before handing off to Better Auth, so a failure
  could abort the request, would create an **enumeration oracle** — under
  `AUTH_REQUIRE_EMAIL_VERIFICATION` a sign-up for an address that already exists returns a
  synthetic 200 with **no send** (`sign-up.mjs:163` + `sign-up.mjs:203-241`, which hashes the password anyway to
  equalise timing), so a delivery-failure signal would make "that address was free" distinguishable
  from "that address is taken" on an unauthenticated endpoint. Also rejected: the wrapper, which
  **bypasses Better Auth's rate limiter** (it runs at the router's `onRequest`, so `auth.api.*`
  never reaches it) — a security regression bought to improve an error message. So the signal is
  operator-facing: one alertable `event: 'mail.send_failed'` naming which of the three messages
  failed; a **bounded, warn-only** boot handshake logging host and port and **never** the
  credential inside `MAIL_SMTP_URL`; and a `/verify-email` screen that asserts intent rather than
  delivery and offers an exit that is not another resend (if the transport is down, Resend fails
  too). The boot check never fails the boot and is never part of `/health/ready` — the host
  recreates containers unattended (ADR-0047), so a 03:00 relay blip would otherwise take the API
  down and keep it down. **What it cannot prove is stated rather than implied**: a credential that
  authenticates but cannot send, an asynchronous bounce, and a relay that breaks after boot.
  The characterisation suite's assertions **do not change**, which is the clearest statement of
  what the fix is. It also corrected an alert instruction in `docs/DEPLOYMENT.md` that **could not
  fire** — operators were told to watch a Better Auth line that stopped being reachable when the
  adapter began catching first (ADR-0074 M5-T1) — and the same file's claim that no password-reset
  flow existed, which it contradicted 47 lines later. **The brief for this ADR was itself wrong**:
  it asserted sign-up had no enumeration concern, in three artefacts, before anyone read
  `sign-up.mjs`; the wrong version is preserved in the suite's docblock rather than replaced,
  because ADR-0058's rule failing on a same-day assertion is more instructive than a clean file.
  The CPM engine is not imported and no migration runs.

- **ADR-0076** _(Accepted)_ — Wrong claims are a defect class, and three of them are computable.
  Extends ADR-0058, and written because that ADR's rule (_verify the claim; do not trust the
  document_) failed **three times in one session, in three distinguishable ways**. **Class 1, a
  count nobody re-derived**: the stage banner's six figures were all wrong at the 2026-08-04
  reconciliation pass, were corrected with a note telling the reader to re-run `ls | wc -l` if the
  date was not today's, and five of six were wrong again **one day later** — advice that is correct
  and cannot work, because a reader who trusts the number never checks the date. **Class 2, a claim
  about a dependency's internals**: 34 file-and-line citations into `better-auth`/`better-call` that
  whole decisions rest on (ADR-0074 hashes reset identifiers because `processIdentifier` returns
  them unchanged; ADR-0075 rejects an abort design because sign-up answers a duplicate with a
  synthetic 200), **none of that code in this repository and nothing here watching it** — a minor
  bump moves every line while the prose keeps reading as authoritative. **Class 3, a claim the
  author asserted and never checked**, which is not a documentation problem and happened twice in
  one milestone: ADR-0075's brief asserted sign-up had no enumeration concern (false, and repeated
  in three artefacts before anyone opened `sign-up.mjs`), and then that same ADR's **own risk
  table** said mail had "no request-path cost" (false — four endpoints sat on a live SMTP round trip
  bounded only by nodemailer's ten-minute socket default). Classes 1 and 2 become computed gates —
  `pnpm check:counts` re-derives the banner, `pnpm check:claims` pins each citation's
  **package@version + path + anchor** and refuses any citation absent from
  `scripts/dependency-claims.json`, so **a Dependabot bump of either package fails CI**, which is
  the intended cost: the bump is exactly when the citations need re-reading. All 34 were verified
  accurate while seeding. Class 3 is **not computable** and gets a process rule instead, labelled as
  the weak one (§19.10): a decision-bearing claim names the command, file or test that established
  it, and **a claim inherited from the brief is checked like any other** — both Class 3 failures
  entered through a brief. The CPM engine is not imported and no product behaviour changes.

- **ADR-0077** _(Accepted; M0–M8 landed 2026-08-06)_ — The public screens' brand surface: a fourth
  scope, fixed dark in every theme, and what counts as a brand asset. The six pre-authentication
  routes are **the only part of SchedulePoint a stranger meets** — `/sign-in` is the front door,
  since `router.tsx:109` redirects every unauthenticated arrival to it and there is no landing
  route — and they were the one significant surface that never had a design pass: a 384 px card on
  a page where `--background` and `--card` are **the same white**, so figure/ground separation in
  the default theme is a 1px border. Adds a fourth ADR-0055 surface scope, `brand`, with a
  **complete 17-token family** in all three theme blocks; it is **dark navy in every theme**, which
  is a deliberate documented exception to "theme-aware light/dark/system" and is stated here
  because undocumented it reads as a bug and gets "fixed". `chrome` was rejected for it: in the
  light theme `--chrome` is near-white, so binding the panel there reproduces the flat screen, and
  the only escape re-values a token the authenticated top bar depends on. The panel carries a
  **token-drawn TSLD motif, not a photograph** — a photo weighs 200–600 kB on the LCP path of the
  coldest page in the product, needs an image pipeline this repo does not have, and defeats the one
  gate ADR-0055 built, since `token-contrast.test.ts` computes ratios between **tokens** and cannot
  see a JPEG. The motif draws from the brand family's own rebound names rather than `--chart-*`,
  which is not in `REBOUND_NAMES` and would therefore keep the page theme's values on a fixed navy
  panel (Corporate's `--chart-2` lands at ~1.4:1) — and both escapes fail an existing set-equality
  gate. **No feature flag** (ADR-0061's reasoning, strengthened: unlike ADR-0055 S5 this _adds_ a
  family rather than re-valuing existing tokens, so flag-off parity is structural); the mitigation
  is a commit boundary, with the panel landing as one revertible commit. The epic also repairs
  **four blocking defects found on the way**, all independent of the redesign: six dead-end states
  (including a resend button that unmounts its own form while telling the reader to try again), a
  stale `<h1>` on two screens, the last surviving native `disabled` submit, and an **unhandled 429**
  that is live in production and invisible in development because `rateLimit` is
  `enabled: options.isProduction`. That message names no number of seconds, because
  `@better-fetch/fetch` builds its error from body + status + statusText and **discards response
  headers**, so `X-Retry-After` is unreachable. **No "Remember me"**: `rememberMe` defaults to
  `true`, so every session is already remembered and a checkbox could only ever offer to make one
  _less_ persistent. The design pass corrected five claims in its own brief — the largest being
  ~33 landable states rather than ~20, the most useful that `sign-in`'s heading is **not** stale, so
  "fix all three" would have changed a correct screen (ADR-0076's rule, third consecutive brief to
  fail it). **M0 also found ADR-0076's own gate passing for the wrong reason**: `check:claims`
  matched one citation form, so every citation into a `.js` file was invisible to it, as was the
  prose form (`file.mjs`, lines **234**) that this epic's artefacts had been pushed into by a
  third hole — the scan could not tell a dependency from this repository's own tooling. All three
  fixed, and the widening immediately surfaced two load-bearing dependency citations that had sat in
  the tree unregistered (`nodemailer`'s `_formatError`, `zod`'s `allowsEval` probe). The register is
  now 40 claims across five packages; the residual basename blind spot is `docs/TECH_DEBT.md` #101.
  **M7 restores the old app's login and finishes an argument the epic had only half-made** (§8). M6
  shipped a full-bleed two-column split; the product owner asked for the previous Flask app's
  **floating box** back, keeping the one thing the new design did better — a card that is the same
  height on every screen, so it does not resize under the reader's cursor between Sign in and
  Register. The measurements are the old app's, read from its stylesheets rather than matched by eye
  (900px card, `135deg` gradient, 3px amber seam over the middle half of the panel's right edge), and
  the photograph comes **back** — reversing §3, whose load-bearing objection (a photo is invisible to
  the contrast gate) does not apply once the navy wash is a **token** and every word sits on the wash
  rather than the image. The load-bearing decision is a **fifth surface scope, `auth`**: §2 pinned
  the panel because a signed-out visitor never chose a theme, and that argument had been applied to
  only half the screen — the card beside the pinned panel still followed the theme, so a Dark-mode
  visitor met a fixed navy panel joined to a dark card, one screen wearing two identities. Now the
  whole login is theme-invariant and the theme picks up after sign-in, where the reader chose it.
  It costs nothing at the components: `Input`'s five tokens are all rebound names, so the fields
  repaint with **no component change at all** — while `--card` deliberately is **not** one of the 17,
  which is why `AuthShell` owns its own container rather than wrapping a `Card`. **And the computed
  matrix caught what copying a design cannot**: adding `auth` failed 18 assertions on two real WCAG
  1.4.11 failures in the _old app's own values_ — its amber focus ring is 2.02:1 on white and its
  field outline 2.22:1 on the field fill. Neither is noticeable by looking, because a focus ring you
  cannot see looks exactly like a focus ring you have not triggered; both are now derived down to
  3.01–3.36:1 at the same hue. The old app's leading field icons are deliberately **not**
  reproduced (§8.6) — that is an icon slot on the shared `Input` primitive, with every consumer in
  the product downstream of it.
  **M8 brings the old app's alerts back, and its rule is one sentence: _a field's problem belongs
  to the field; the alert belongs to the form_** (§9). The product owner reported seeing "password
  insufficient on signup displayed in two places"; it was not a sign-up bug but **all five** auth
  forms, because `FormErrorSummary` listed every message in a tinted box while each `TextField`
  printed the same sentence under its own control. It had a second door nobody had noticed:
  `ChangePasswordForm` injects the _server's_ wrong-password message through `setError`, and the
  summary could not tell a resolver error from an injected one — so the sentence that component's
  own docblock says "lands on the field, not in a form banner" landed in **both**. The summary is
  not deleted, because a bare removal is a real WCAG 4.1.3 regression for the second and later
  fields of a multi-error submit (RHF focuses only the first); it stops **restating** and becomes a
  **count**, shown only from two problems up. The old app's geometry is reproduced exactly (4px left
  accent bar, 30% tint, leading icon) and its **hex values deliberately are not** — the
  colour-literal lint rule exists because a literal cannot follow a surface scope and is invisible
  to the contrast matrix, and nothing is lost: the old app's own pairs measure 10.12 / 8.14 / 8.04:1
  against tokens already gated at ≥4.5. Its floating auto-fading **placement** is also not copied
  (auto-dismissal fails WCAG 2.2.1). `--success-text` joins the vocabulary as the **eighteenth**
  rebound name — the family had words for failure, caution and fact and none for "that worked", so a
  green success had to reach for the global `--success`, a solid button fill that follows the page
  theme and would have painted Dark's mint on the pinned white login card. Coverage closed three
  real gaps (sign-out said **nothing at all**; invitation-accept was the one server failure
  bypassing the shared translation layer; the resend field had no format check) and deliberately
  left two alone after checking that they are correct rather than inconsistent. Every gate that
  fired was informative: the once-only assertion was verified red first, the seam test caught a
  **docblock** naming a family token, and `e2e-public`'s `signOut()` helper turned out to have
  shipped with a locator matching nothing — never noticed because nothing had ever called it.
  **The CPM engine is not imported and no migration runs.**

- **ADR-0078** _(Accepted; S0–S1 landed 2026-08-07)_ — Canvas module boundaries: layer painters, a
  per-frame context, and extraction as a gated move. **Amends ADR-0026 §8**, which is most of what
  makes this cheap: that decision already specified `render/` as _"layer painters (grid, bars,
  edges)"_ — **plural** — plus `viewport/`, `a11y/` and `hooks/`, none of which were ever created.
  The drift is not one bad decision but fourteen accepted features (ADR-0033 → ADR-0065) each adding
  correctly to the nearest existing place, until `paintScene` was 808 lines across **fourteen**
  comment-delimited layers (the brief said thirteen; 3.2 and 3.2b share a number). Three
  consequences are already in the register, which is what makes it debt rather than taste: #85
  carries a standing instruction not to remove two `react-hooks/refs` suppressions until this
  happens, #76's two measured hoists are unreachable without a per-frame context, and #75 cannot
  attribute a millisecond to a layer while the painter is one function. And
  `render/link-routing.test.ts` imports ten symbols forming exactly that module **from
  `./render-model`** — a test named for a module that does not exist, which is a small live piece of
  misinformation of exactly the ADR-0058 class.
  **The decisions.** `paintScene` decomposes into pure layer painters each taking one **`PaintFrame`**
  — holding only what is derived once per frame and shared by **two or more** layers, so it is a
  context and not a bag; `rects`/`laneRows` stay **lazy**, preserving today's ordering, because
  building them eagerly would be **invisible to every existing gate** (`activityRect` makes no `ctx`
  calls) and is therefore exactly the optimisation that must be resisted here and done deliberately
  as #76. The edge layer **returns a value**: it collects lag geometry that layers 3.2/3.2b draw two
  hundred lines later, which is the one place the "layers are independent" story is false, and a
  closure variable hides it. `hooks/` and `a11y/` are created (they hold React, which does not belong
  beside a pure painter); `render/` is recognised as the home of viewport and hit-test. Extraction is
  a **barrel-preserving move** — the three barrels keep every export, so 30 consumers and their
  suites are untouched and act as the before/after oracle, and **a refactor PR changes no behaviour,
  no performance characteristic and no test assertion**. Comments move verbatim: these files' comments
  record defects that shipped. Where nothing pins a seam the characterisation test lands **first,
  verified red** — the whole-scene golden log (S1, landed), the Escape precedence table, and the
  ADR-0026 D3 React-render-count invariant, which has **never** been asserted though the whole frame
  budget rests on it. Most of the rest is **extract-when-touched** by standing rule, and `TsldPanel`
  is **explicitly deferred** rather than overlooked.
  **S1 is also the ADR's own premise landing on it.** Writing the golden log produced two
  corrections to its author rather than to the painter: a layer-ordering assertion went red against a
  perfectly correct painter, because `palette.selection` is written by the **edge** layer too (the
  ADR-0052 M5 incident-link highlight, `paint.ts:1297`) some 200 entries before the ring at 1823 — so
  first-occurrence cannot identify that layer; and typecheck caught two enum values asserted from
  memory rather than read (`MILESTONE` does not exist; `constraint` is a bare `'start' | 'finish'`).
  Filing this ADR also surfaced that **`docs/adr/README.md` was missing seven ADRs** (0071–0077) —
  the ADR-0071 failure one level up, in the index rather than the register — repaired in the same
  commit rather than stepped over. **The CPM engine is not imported and no migration runs**, so the
  ADR-0034 recalculation parity gate is untouched by construction.

- **ADR-0079** _(Accepted; M0–M5 landed, `VITE_CANVAS_SEARCH_NAV` **default-on** 2026-08-07)_ —
  Search that navigates: the find cursor, the Escape rule, and zoom-to-selection. The TSLD's search
  field **filtered and did not find** — typing dimmed the non-matching bars and left the planner to
  spot the survivors, which on a 500-activity import (60–80 lanes, about a dozen visible at the Day
  preset) is scrolling a wall looking for something not greyed out. Every other cycle in the product
  already worked the other way; search was the one live-derived set with no way to walk it. Enter /
  Shift+Enter now centre, select and announce each match in turn, sharing **one comparator** with
  Next-conflict (`render/ordering.ts` — the existing conflicts suite passed unchanged, which was the
  acceptance condition) and **one predicate** with the lens dimming (`matchesActivityFilter`, pinned
  structurally), so the two cycles cannot walk a plan differently and Enter cannot skip a bar the
  canvas left un-dimmed.
  **The load-bearing decision amends ADR-0064: _an Escape typed into a text field belongs to that
  field_.** The canvas's Escape handler is a native `window` listener, so it fired wherever focus
  was — a planner refining a search query with the Link tool armed lost the tool to a keystroke
  aimed at the text, which is the exact defect class ADR-0064 was opened on arriving through a door
  that decision did not have. The fix is a **target guard**, not `stopPropagation` from the field:
  the toolbar is portalled into the chrome band (ADR-0055 S2), so whether a React handler reaches a
  `window` listener depends on the native bubble path through the portal target — an assumption the
  spec refused to make. The guard is about text **entry**, not "anything that is not the canvas", so
  Escape on a toolbar button still disarms; a guard written as `target !== canvas` would have taken
  that away silently, and there is a test for it. Its **accepted consequence** is a two-step Escape
  in the field — clear the query, then hand focus to the diagram — because a rule that removes the
  only route to a behaviour is not a scoping decision but a defect: without step 2 the guard is a
  dead end for anyone driving from the keyboard.
  **The flag-on journey is the rollout record, not a formality.** `apps/web/e2e-search-nav/` (its own
  CI step) failed on its **first run**, twice, on defects no unit suite here could report — the
  Escape rule had been specified and never implemented, and the jump announcement was being
  overwritten four jumps in by a stale debounced filter count re-arming on every re-render. Both
  timers are correct alone; only a real browser runs them against each other, and the component tests
  mount the toolbar in isolation where a native `window` listener does not exist at all. Three of the
  journey's own assumptions were also wrong and each correction improved it. **The CPM engine is not
  imported and the ADR-0034 recalculation parity gate is untouched**; the flag-off parity suites are
  kept and pinned as the rollback contract. Filed as **0079** rather than the `0078` its own plan
  names, because that number was taken between the plan and the milestone — recorded rather than
  routed around, which is the ADR-0071 lesson the plan itself cited.

- **ADR-0080** _(Accepted; M0–M5 landed, `VITE_CANVAS_MULTI_SELECT` **default-on** 2026-08-08)_ —
  The canvas plural selection, and what a bulk action owes its
  subject. Every plan-shaping gesture on the TSLD acted on **exactly one bar**: a planner
  re-sequencing a phase — twelve activities that all move a fortnight — did it twelve times, and the
  twelfth was as likely to be dropped a day out as the first. The table had learnt this already
  (ADR-0063 M4b); the canvas, which is the surface this product exists to be, had not. A selection
  becomes a **set with a primary** — the primary being the most recently added **survivor**, never
  an index, because an index into a shrinking set is a bug waiting for the right delete — so the
  forty singular consumers (edge handles, the activity panel, `aria-activedescendant`) read
  `primaryId` and get exactly what they had. The flag is **derived** from
  `VITE_CANVAS_DIRECT_MANIPULATION`, because `Shift` is already the legacy link chord: the overlap
  is structurally impossible rather than avoided by care.
  **"Selecting is a read" decided more than it looked like it would.** The marquee is not pen-gated
  (the ADR-0063 M4b rule), and three consequences followed that no plan named: the canvas's Escape
  branch is gated on `editing`, so the marquee needed an **ungated** one or the tool arms for a
  Viewer and traps them; the interaction canvas has to mount **without the pen**, or the sweep is
  invisible to exactly the person with no other feedback; and the write-busy refusal does not apply,
  because an in-flight save is no reason to refuse a read. Each is one line; together they are the
  difference between a tool and a dead end.
  One `idsIntersecting` predicate serves both the marquee and the shift-click span, pinned by a
  structural test — the ADR-0065 `routeOrthogonal` argument, where two implementations drift and the
  drift is **invisible** because each looks right alone. A span is in **plan order, not screen
  order**: screen order would change with the zoom. `Space` toggles (APG) and the logic summary
  moves to **`i`**, which forces the keyboard cursor to become separate state — Space must not move
  focus — and `Shift+Arrow` extends **vertically only**, because `Shift+←/→` is the ADR-0052
  duration nudge and taking it would remove a shipped accelerator to add a navigation one nobody
  asked for. `Escape` is the **last rung** (tool → open pick → selection), by guards rather than by
  hoping two listeners fire in a helpful order.
  A bulk delete's undo is **one id-stable `restore-batch`**, not N re-creates (CQ-4): re-creating
  would restore the bars and silently lose the links **between** them. A chain is ordered by **time,
  not pick order** (a marquee expresses no sequence), previewed with names and arrows before any
  write, and cycle-checked against the **resulting** graph — A→B and B→C are each legal against a
  plan holding C→A, and edge-by-edge checking passes them and then fails mid-loop, leaving a partial
  chain that makes the plan look finished. **The CPM engine is not imported and the ADR-0034 recalc
  parity gate is untouched.**
  **Two of this epic's own plan claims were wrong**, both found by checking rather than by failing:
  M2-T4 specified a split-button on a `Select` toolbar item that **does not exist**, and M2-T5 cited
  the export scene at lines that are `isAddingActivity`. A spot-check of five decision-bearing
  citations found two stale — the ADR-0076 Class 2/3 failure inside a document written for this
  epic, which is why the remaining milestones verified every citation before relying on it.
  **The flag-on journey earned the flip, and found four more defects doing it** — none visible to
  any unit suite. `bulk` was wired into `plan-workspace.tsx` and **not** into
  `plan-workspace-toolbar.tsx`, which is the layout the toolbar flag selects, so the bar was
  unreachable in the shipped app while every unit test passed (the ADR-0064 §7 "one host and not
  its neighbour" shape). A bulk delete **dropped focus to `<body>`** — a native `<dialog>` restores
  focus from inside the effect that closes it, _after_ the handler asked for the listbox, and the
  element it restored to had unmounted with the selection — which is a WCAG 2.4.3 failure and also
  silently disables Ctrl+Z, because the accelerators are a React `onKeyDown` on the workspace root.
  The deletion announcement was then **overwritten by the focus it needed** (the listbox announces
  the row it lands on), so it now speaks inside the focus frame. And **Reverse was sticky across
  previews**, opening the next chain already flipped with nothing on screen saying so. Two of the
  journey's own assumptions were wrong too: five unconstrained activities all start at the data date
  and chain **alphabetically**, so the fixture needs distinct dates or the direction assertion tests
  the alphabet; and one undo is a restore, a recalculation and a refetch, which outruns Playwright's
  5 s default poll — checked in `psql` rather than reported as "the links did not come back".

- **ADR-0081** _(Proposed)_ — A milestone is its entry point, and the journey is the gate. Written
  because W5 (activity copy/paste, `docs/specs/activity-copy-paste/`) shipped a **whole milestone
  that was unreachable**: `bandMembers` and `bandCopyConfirmation` landed with unit tests, a
  measurement harness timed a band copy against a real API, the milestone read as done in the commit
  log — and both entry points excluded a `WBS_SUMMARY`, so no planner could reach it and its unit
  tests were validating dead code. Three independent reviews found it separately. The cause is
  ADR-0058's rule failing one level up: **a plan is a document too**, and working through its task
  list is evidence the tasks were done, not that a capability exists. **It is the fourth recorded
  instance of the class, not the first** — ADR-0080 shipped `bulk` wired into one host and not the
  layout its flag selects, ADR-0062 M6 hid a form instead of shading it, ADR-0059 M6 lit an inert
  zoom control — so the ADR treats it as an escalation of a standing pattern rather than a
  departure, which is what points the fix at the journey rather than at W5's authors. Three decisions: a milestone
  claiming user-facing capability **names its entry point** or declares itself dark; the **flag-on
  journey lands with the first user-facing milestone**, not at enablement (the only one of the three
  that is enforcement rather than intention — M2's hole survived a plan, a spec, a measurement, unit
  tests and a human read, and died the first time something drove the real product); and a
  measurement harness **says in its own docblock** where it bypasses the product, because
  `measure-band-copy` made M2 look _more_ finished than any previous milestone while no UI path
  existed — a better tool made the hole harder to see. A structural "every barrel export has a
  non-test caller" gate was **proposed and then rejected on measurement**: 129 findings on one
  predicate, 49 on a tighter one, and neither would have caught `bandMembers`, whose own tests called
  it. The defect was never an uncalled symbol; it was a capability with no entry point, which is not
  a property of a symbol. The ADR records two of its own claims being asserted before they were
  checked — the rejected gate, and a sentence about a docblock that said close to the opposite — as
  ADR-0076 Class 3 occurring twice inside the ADR written about it. **No product code changes.**

- **ADR-0082** _(Proposed)_ — A shaded menu item keeps its focus, and its reason. `docs/TECH_DEBT.md`
  #111 read as a markup inconsistency — the activities-table row menu **omits** Edit, Duplicate,
  Dissolve and Delete without the ADR-0028 pen while the canvas selection bar shades the same actions
  and links a reason — and turned out to be a decision about the **primitive**: `Menu`'s roving focus
  deliberately skipped `aria-disabled` items, so shading one made the option visible and its reason
  **unreachable by keyboard**, which is the same defect one layer down. So `itemsOf` stops filtering,
  which is the load-bearing change and the only one that makes a reason readable at any call site.
  It repairs three things at once that nobody had connected: `ToolbarOverflow` already renders a
  bespoke disabled row whose **two comments assert it is focusable and "an arrow-key stop"** while
  the filter excluded it — verbatim the failure `ToolbarButton` records having shipped once, sitting
  undiscovered in the primitive's own neighbour; `onKeyDown`'s `indexOf` returns `-1` when focus sits
  on a filtered item, so **ArrowUp lands on the second-to-last item** (reachable today wherever an
  item becomes disabled while focused); and a menu whose items are **all** disabled focuses nothing
  on open, leaving focus on the trigger **outside the portal**, where the container's React handler
  never sees the arrows. The APG's _Developing a Keyboard Interface_ practice names "Menu items in a
  Menu or menu bar" in its keep-focusable list, so removing the filter is a **return** to the pattern
  the primitive says it implements. `MenuItem` gains `disabledReason` expressed exactly as
  `ToolbarButton` expresses it — an `sr-only` **sibling** plus `aria-describedby`, never folded into
  the name — and the row menu shades from the **same `ScopeGate` object** the editor already uses
  (`editorGating.general`), pinned by an identity assertion rather than a second `{ writable, reason }`
  assembled beside it. Because "shade, never hide" degenerates without a rule, the ADR states the
  discriminating one: **omit** when the action does not apply to the object, when a flag is off, or
  when there is nothing to show at all; **shade with a reason** when it is shut by a state the reader
  can change or by their role. Plus one clause that earns its keep three times — **a menu whose every
  item would be shaded renders no trigger**, which preserves today's Project Explorer behaviour,
  removes the focus trap rather than making it more reachable, and stops a Viewer meeting a menu of
  nothing but refusals. Two consumers are **knowingly left alone and filed rather than fudged**
  (`docs/TECH_DEBT.md` #114): `plan-actions-menu.tsx` gates on a bare `canWrite` boolean with **no
  reason sentence and no way to tell a role from a missing pen**, so writing one would be guessing —
  and a guess saying "your role" to someone who merely lacks the lock is precisely the
  false-statement defect this ADR records shipping twice; and `Combobox` skips disabled options by
  arrow key, which the same APG list covers, but is a separate primitive whose consumers are outside
  what #111 needs. The ADR also **corrects its own author**: #111 was raised as an accessibility
  blocker and the independent assessment found **no applicable success criterion** — it is a
  design-system and usability defect against ADR-0062 M6, which is reason enough, and the overstated
  citation is corrected rather than quietly dropped. No feature flag (ADR-0061's reasoning, stronger
  here: a primitive's accessibility posture plus a gating derivation, with no new capability).
  **The CPM engine is not imported and no migration runs.**

- **ADR-0083** _(Proposed)_ — A gated form field is **read-only, not disabled**, and the mechanism
  differs per control because the platform does not offer the same states — not because we prefer
  variety. Text and textarea take `readOnly`; a checkbox takes `aria-disabled` plus a
  `preventDefault` guard; a native `<select>` keeps native `disabled` as a **named exception with
  its cost stated**; our own `Combobox` takes `readOnly` because we control it. The discriminator is
  clean: a control whose only operation is changing its value gets `aria-disabled` and a guard; a
  control with operations beyond that — caret, selection, copy — gets `readOnly`. Extends ADR-0082
  from the menu tier, and for the **inverse** reason, which is the part worth keeping: a menu item's
  content _is_ its function, so a menu of refusals renders no trigger; a field's content is its
  **value**, so a form of shaded fields is exactly what the reader came for.
  **The finding nobody had noticed is a trap in the other direction.** Making a gated field
  _readable_ removes its WCAG 1.4.3/1.4.11 exemption — `disabled:opacity-50` is lawful today only
  because the control is inactive. So the treatment dims the **chrome** and never the **value**
  (`--field` → `--muted`, border stays `--input`, value keeps full contrast), and
  `token-contrast.test.ts` must carry the new pair **before** the CSS is written, not after.
  It **narrows rather than overturns** `DESIGN_SYSTEM.md`'s "native `disabled` is fine when nothing
  flips underneath the user" clause: that clause's own example ("no permission") is not static,
  because the ADR-0028 pen flips under a reader who did nothing — and static-vs-flipping is the
  wrong axis for a field anyway, since a button's loss is operability and a field's is readability.
  The button ruling is untouched. It also found that `disabled` on a field means **five different
  things** today and one of them is legitimate: an unloaded picker has nothing to read, so native
  `disabled` keeps that job — a blanket ban would have been wrong.
  **Blast radius settled with its method recorded** (38 props on a `*Field` across 8 files, two
  files carrying 30), because three passes had produced three numbers and the disagreement was
  never about the code: the larger figures counted `disabled=` on any component. `AssignmentRow`'s
  case is a **different** fix — it _unmounts_ its editors rather than disabling them, a guaranteed
  focus drop to `<body>`, and needs a read-only render. Two claims are marked **reasoned from
  specification, not observed** (real AT announcement of `readonly` + `aria-describedby`, and
  whether Chrome/Safari suppress the picker on a `readonly` date input) and must be checked before
  this is Accepted. **The CPM engine is not imported and no migration runs.**

- **ADR-0084** _(Accepted)_ — A feature flag is a rollback contract with an expiry date. `env.ts`
  declares 58 `VITE_` flags and `flagDefaultOff` is called **zero** times: every one is default-on,
  i.e. a rollback contract left behind by the epic that shipped it. That is right on the day a
  feature flips — the enablement milestones keep finding defects a human read missed — and wrong a
  month later, when the flag-off branch has never been run by anybody and its parity suite asserts
  that an unused configuration still works. **The cost is not the `if`; it is that every flag-off
  branch is a second product, maintained on every change to the code around it forever.** So: a
  machine-read `@enabled YYYY-MM-DD` tag on every declaration, a 30-day horizon (≈ a dozen releases
  on a host that auto-pulls each one — ADR-0047 — which is the real unit of confidence), and
  `pnpm check:flags` enforcing a **dated schedule rather than a cliff**, because a 30-day horizon
  with no schedule fails on day one twenty-seven times and a gate that does that gets deleted
  rather than fixed (ADR-0058). **Fourteen flags reached the gate with no enablement date recorded
  anywhere** — not the docblock, not the ADR, not recoverable from git; they take the earliest date
  the repository can prove, marked as a **floor**, which can only make a flag look younger than it
  is and is therefore never premature. Batch 1 retired **one** flag,
  `VITE_NAV_TREE_CRUD`. It first retired three, and **CI caught the other two**: a whole
  `playwright*.config.ts` can BE a flag-off harness — the base config pins `VITE_TSLD_EDITING` and
  `VITE_PLAN_EDIT_LOCK` off so that "the read-only TSLD surface and the role-only (no-pen) editing
  journeys stay covered" — and D5 had named only the unit parity suites. Six editing specs sat
  clicking controls the now-unconditional pen shades until they timed out. Both flags are back in
  batch 2 with the reason recorded, and the gate gained a fifth assertion (verified red on 22
  configs) so a retirement cannot strand a pinned harness again. `VITE_CANVAS_TOOLBAR` moved to batch 2 **with
  the reason written down**: it is not an `if` but a ~270-line alternative layout, and ADR-0080
  records that layout causing a shipped defect — an argument for retiring it, not for keeping it.
  **The ADR's own D4 was drafted backwards and `check:flags` failed on its first run**, against the
  register shipped in the same commit: a _child_ must not retire before its parent, because the
  child's retirement declares the feature permanent while the surviving parent can still switch it
  off. ADR-0076 Class 3, caught by the gate written beside it.

- **ADR-0088** _(Proposed)_ — Feature flags are classified, not scheduled. Supersedes ADR-0084's
  calendar (D2/D3/D4a/D4b), keeps its tag, its delete-the-harness rule and its unused `keep` field.
  Opened by the product owner asking whether retiring them was right at all, and the answer is that
  **the estate is not one population**. The load-bearing finding is that a `VITE_` flag **cannot be
  switched off on a deployed container and never could**: Vite inlines `import.meta.env.VITE_*` at
  build time, `apps/web/Dockerfile` declares one `VITE_` build arg, `docker-publish.yml` passes
  **none**, and `.dockerignore` strips `**/.env` from the build context — so every published image
  carries every flag at its default, on. ADR-0084 argued throughout about "a rollback contract";
  for the operator there has never been one, and `.env.example` said otherwise beside three flags on
  the one file they edit. The argument was already in the repo thirty lines above the flag block,
  about the CSP, and nobody had read it that way.
  So classification replaces age. **Class A** — the flag selects which of two different JSX roots a
  component returns — is the "second product maintained forever", and there are **two**
  (`VITE_CANVAS_TOOLBAR`, `VITE_CANVAS_WORKSPACE`). The discriminator is **computed, and the
  measurement is why the clause reads as it does**: "appears in a ternary" matches 48 of 57 flags and
  is useless; the shipped rule matches exactly the two an architect found by reading. **Class B** —
  ~28 one-line guards, including both flags that blew up batch 1 (`TsldPanel.tsx:1311` and
  `use-plan-edit-lock.ts:227` are one line each) — formally **keeps**, giving ADR-0084 D6's field its
  first occupants. **Class C** — pinned by a Playwright harness — replaces the coverage first, never
  on a deadline. Class A retires on epic-touch under a cap set at **the measured count, ratcheting
  down after each retirement**, so an alternative surface **beyond** that count fails CI while the
  conversation is still cheap. (This said "a cap of three, so a fourth… fails CI" until 2026-08-10 —
  wrong twice over, and copied from ADR-0088's Consequences section, which contradicted that ADR's
  own D3. The cap is a number in `flag-retirement.json`; prose restating it goes stale at every
  retirement, so it no longer does.)
  Three things are recorded because they are uncomfortable. `check-flags.mjs` matches `'true'` and
  `'false'` identically — **135 no-op pins against 10 real harnesses** — so batch 2 would have failed
  on the cheapest possible cause before reaching the work. The base journey's six editing specs prove
  role-only editing in **a world no shipped bundle can produce**, which is worse than covering a
  rollback path. And a search of every ADR and ~19 enablement retrospectives — documents that list
  every defect they found — credits a **unit-level** flag-off parity suite with exactly **one** catch
  in the project's history (ADR-0070's `+1d` rounding); every other catch belongs to a flag-on journey
  or a specialist review. Seventeen flags have no off-branch test at all.
  **Nothing about the running application changes** — every flag is already on and unreachable.

- **ADR-0089** _(Accepted; M0–M7 landed 2026-08-11)_ — One activity field vocabulary, and what a
  field group is. An activity's ~20 definition fields were rendered by **two components sharing no
  code** — the New-activity dialog and the tabbed editor — and nine features had each added a field
  to both, by hand, twice. `docs/TECH_DEBT.md` #122 blamed the alternative-surface flag for the
  cost and was **wrong**: the editor's own docblock said _"creation stays with
  `ActivityFormDialog`"_, so retiring the flag alone would have left the monolith alive as the
  create surface with every field those nine features added. The receipts belonged to create and
  edit being two components (ADR-0060), not to the flag. **The divergence set was re-derived from
  code rather than trusted** — the spec listed nine, a reviewer found a tenth incidentally, and the
  characterisation suite found **~26 measurable differences**. Six were defects a planner could
  hit: an activity nested under an unresolvable summary rendered as **top level** while the save
  re-sent the real parent (screen and record disagreeing, which is worse than either being wrong);
  a `MANDATORY_*` constraint rendered as **no constraint at all** with its date filled in below it;
  the option keeping the Type selector honest was a **one-way door**; the editor removed the
  duration field for three types and **said nothing**; a resource-dependent calendar was `disabled`
  rather than read-only; and cost fields were withheld from every duration-derived type, so a
  **payment milestone** could not be given its value on the only surface that creates one (the API
  accepts it — established by running a Supertest case, not by reading the DTO).
  **The decisions.** A field is rendered by exactly one component, gated by a partition test that
  imports the four Zod scope shapes and asserts every key has exactly one owning group — it catches
  what a per-group suite structurally cannot, a field claimed twice or by nobody. A group takes
  **exactly one concrete `UseFormReturn`, and the compiler is the enforcement** (RHF's generics are
  invariant, so a general-scope group cannot register a scheduling field); three weaker instruments
  sit on top, **each recorded with its blind spot**, because two earlier drafts of this decision
  overclaimed their mechanism — the first claimed the `FieldGateProvider` forced it, which is false
  since that hands seven scopes one shared object by identity and a `general`+`cost` group would
  have been a **disclosure path**. A cross-scope fact is host-resolved and passed as a plain prop
  (D2b), which is what stops the next one being solved with a second form prop. **Creation is one
  act with one permission, so it is one scope by construction** — a single submit over four scope
  forms, with focus suppressed at each form and **one** ordered decision at the host, because four
  forms each focusing their own first problem is four competing calls whose winner is whichever
  promise settles last. Validation goes through each scope's `handleSubmit` and not `trigger`,
  which is a behaviour fix rather than a style choice: `trigger()` never sets `isSubmitted`, and
  that flag is exactly what turns re-validation on, so a corrected field kept showing its old error
  until the planner submitted again.
  **Five decision-bearing claims failed once executed, and every one was a document trusted instead
  of checked.** D4's verdict was backwards — the plan said to converge the editor onto create's
  live value, and the characterisation case written to pin D4 calls that behaviour a one-way door
  in its own comments, in the same repository, before the plan was written. D2's label row was
  backwards, with the reason sitting in the editor's own suite since it shipped. Two copy
  placements were resolved and then corrected. And during M6 a migrated test case was **claimed as
  "already covered" and was not** — caught by spot-checking the claim rather than accepting it,
  restored, and verified red; that is precisely the failure ADR-0084 D5 exists to prevent, found
  because the rule says to check and not because anything failed. The flag retired at **M5, after**
  the divergences closed, which made M6 small: by then the monolith's edit half had no renderer
  left and was dead code rather than a path to migrate. Its two flag-off harnesses were
  **converted before the flag went** — the ADR-0084 batch-1 lesson applied in advance.
  **The CPM engine is not imported and no migration runs**, so the ADR-0034 parity gate is
  untouched by construction.

- **ADR-0090** _(Accepted; M1–M5 landed 2026-08-12, M6 deferred on a measurement)_ — The plan-workspace command surface: a row
  is a budget, and `order` is not a priority. Opened as a layout complaint — the two-row TSLD
  toolbar "doesn't work well" on a 24" 1920×1080 monitor, and its behaviour on a Surface Pro was
  unknown — and it turned out to sit on a **live defect in shipped software**. The command surface
  carries **46 registered items** across two rows, and `computeOverflow` sums only _item_ widths
  (`Toolbar.tsx:172-181`): it sees none of the row's own chrome — the container's `gap-1` (`:322`)
  and each group's `gap-1` + `ml-1 border-l pl-2` (`:331`). So the row believes it fits when it does
  not, the `⋯` never renders, and the surplus is paid by controls falling out of an
  `overflow-hidden` box. **Measured in Chromium on a plan with a computed schedule: at 1920×1080 @
  100% Row 1 exceeds its container by 109 px, no `⋯` renders at all, and `legend` and `shortcuts`
  are painted at 0 px visible — pointer-unreachable, keyboard-reachable only** (a browser scrolls a
  hidden box to reveal focus). At **1440** the `⋯` itself has 0 px visible while holding the only
  route to ~15 commands; at **960** it has none on either row, alongside two pinned `render` items
  that could never demote. The failure is **WCAG 2.2 §2.5.8 Target Size (Minimum), AA**, with no
  exception available — the Equivalent exception fails _because_ there is no `⋯`. 2.1.1 is
  **satisfied**; 2.4.11 and 1.4.10 do **not** apply.
  **What this ADR is really about is the method.** It was drafted without a shell and ended in two
  falsifiable predictions for that reason; **both were falsified on the first run**, along with its
  headline claim that a 2560 px monitor was needed before the labels appear — at 1920, 21 of 24
  inline items _are_ labelled, and **the labels are why the row breaks**. Those figures are
  withdrawn in place rather than deleted. Then a **five-specialist review of the plan, before
  approval**, found blocking defects in the repair itself, three of them reached independently by
  two reviewers each: the first draft proposed to _measure_ group chrome from the DOM, which is
  derived from the very overflow state the calculation sets, and would have oscillated at the `help`
  group — i.e. at `legend` and `shortcuts`, i.e. at exactly the two controls the milestone exists to
  fix. The chrome is now **derived** from static registry data with named constants (the
  `LABEL_CHROME_PX` pattern). A second convergence: the proposed gate would have **passed a control
  shrunk to zero visible width** — a 0-width box has 0 overhang and is still in the DOM, which is
  this defect's exact shape — so the gate asserts pointer reachability via `elementFromPoint`.
  **The existing accessibility gate structurally cannot see any of this**, verified by running
  axe-core 4.12.1: `target-size` is tagged `wcag22aa` while the scan requests `wcag2a`/`wcag2aa`,
  **and** it ships `enabled: false`. "The axe scan is green" was true and meaningless.
  Sliced **M1 the repair (ships alone)** → M2 consolidation (46 items → ~24 stops, nothing deleted,
  12 commands behind _named_ triggers) → M3 the responsive ladder + touch → M4 the header merge →
  M5 the gate pass → **M6 retiring `VITE_CANVAS_WORKSPACE`**, the estate's last Class A flag, whose
  deferral trigger this epic fires. The product owner approved shipping M1 alone knowing it will
  probably withdraw today's labels until M2 restores them: a correct icon-only row beats an
  unclickable labelled one. **Frontend-only — the CPM engine is not imported and no migration runs**,
  so the ADR-0034 recalculation parity gate is untouched by construction.
  **M2–M4 landed as measured, and every milestone's headline number was re-derived rather than
  carried.** M2 took 44 toolbar stops to 28 and bought both rows their labels at 1920 for the first
  time; M3 added four responsive bands off the row's own container with 48 px hysteresis, folded the
  four viewport commands into `Zoom ▾`, and made both rows fit inside their container at **every**
  width from 2133 down to 768, retiring the fit gate's floor from 1440. Along the way the gate found
  the split-button caret failing WCAG 2.5.8 at **23 × 36** — a dispute the plan could only frame as
  "arithmetic against arithmetic" — because the gate swept `[data-toolbar-item]`, which sits on an
  item's _focusable_ control, and a caret is deliberately `tabIndex={-1}`. **M4 is where measuring
  first paid for itself**: `design.md` §2.1's three vertical figures were all wrong (45/199/717
  against a measured 53/257/533, the last overstating canvas by 35 %), and folding the identity line
  into the band **gained exactly nothing** — relocating a row inside one column removes nothing. The
  8 px it did gain came from matching the rows' rhythm, and `m4-vertical-stack.md` says so rather
  than quoting 8 px as a success.
  **M5's gate pass found the register's newest shape of drift.** M2-T6 specified deleting the
  row-caption gutters and a per-row `groupLabels` override; M2 shipped without either and **nothing
  recorded it** — every prior instance here is a document describing the code wrongly, and this is a
  document describing work correctly and the work not happening, which ADR-0058's rule cannot catch
  because there was no false claim to verify. It also caught this ADR's own M3-b reasoning: _"only
  `Zoom ▾` names the subject"_ — and the trigger renders the current preset, so on the epic's own
  target device a planner hunting for **Fit to plan** met a button labelled "Week". Both fixed, with
  two more instances of one correct pattern applied to a control and not its neighbour, and a
  regression test that **passed green against the broken code** for a reason recorded one file over.
  **M6 is deferred on a number that did not exist when it was scheduled**: all seven flag-off
  harnesses were probed and **all seven fail — 27 specs**, none of them a configuration edit. The
  trigger is re-recorded with that measurement rather than left to rot, per the milestone's own rule
  that deferring is a decision and ignoring is a defect.

- **ADR-0091** _(Proposed; M0 landed 2026-08-12)_ — A mode is not a command. ADR-0090 fixed the row's
  **fit**; using the result on a 24" monitor showed the deeper thing, which is that the command
  surface **has no vocabulary for anything that is not a command** — a mode, a fact and a subject all
  render as a button in a row, because a button in a row is the only thing the registry can make.
  `Early | Visual` and `Diagram | Gantt` do not _do_ anything; they set how everything else behaves,
  which is `Start editing`'s relationship to the toolbar, and that control sits on the identity line.
  So the cluster moves beside the pen — **without leaving the registry**, because rendering four
  segmented controls by hand rebuilds roving `tabindex`, group labelling, ADR-0082 reason wiring,
  `demotionGroup` pairing and the fit gate's reach, each of which this register has recorded shipping
  wrong once. `tier: 3` becomes **admitted-last rather than exiled** (which is why the `⋯` never
  empties at 3840 px), zoom presets move into `View ▾` — **relocating ADR-0056 §1, not withdrawing
  it** — and the identity line folds into the command band for three bands above the canvas.
  **M0 measured before anything was decided, because ADR-0090's first recorded consequence is that it
  was wrong three times for having been drafted without a shell** — and it falsified two working
  assumptions. The identity content is **849 px, not the ~450–500 estimated**, so a merged row at 1920
  needs 2290 against a 1904 container: **386 px over**, of which 223 is pure redundancy (`You're
editing this plan.` and an `Editing` badge, beside a button reading `Stop editing`) and the rest has
  only one candidate, which is a real loss. And keeping the four viewport commands inline at **every**
  width overflows Row 1 at **1440** on its own — the spec rated that risk high at 768. The two
  decisions therefore **compete for the same slack**, which is written into the ADR so a milestone
  under pressure cannot quietly resolve it the other way.
  **Then D4 — the three-band merge, the epic's headline — was withdrawn by measurement before a line
  of it was built, and that is the entry's most useful part.** `Toolbar` resolves its density from
  **its own `clientWidth`**, which is honest while Row 1 is the full-width row and becomes _leftover
  width_ the moment anything sits beside it: merged, Row 1's toolbar gets ~891 px, falls below every
  band floor, and **withdraws every plain-button label at 1920** — silently reversing ADR-0090 M2's
  headline win on the monitor this epic was opened about. It is not tunable (staying `comfortable`
  post-merge leaves 368 px for content measuring 1013), and **no gate could have caught it**:
  `readRow` measures each toolbar inside its own box, and a `flex-1` child always fits, so the fit
  gate would have gone green while the row went wordless. Put to the product owner with the numbers;
  they kept the labels, which is the call they had already made once. The original complaint — "the
  4 rows are unnecessary" — is therefore **declined rather than solved**, and the entry says so.
  **The instrument was wrong too, and that is the ADR-0058 finding.** The vertical-stack harness asked
  for six bands and reported **five** for the whole of ADR-0090 M5: the plan-header lookup was
  `h1.closest('header')`, M4-T2 turned that element into a `<div>`, and the missing band was
  `.filter()`ed out rather than failing. Every surviving number stayed correct — `aboveCanvas` read a
  plausible 249 — so there was nothing for a reader to catch; it was findable only by arithmetic
  (135 − 45 − 44 = 46 px unaccounted for). A band that cannot be located now **throws**. The search
  icon was likewise established by probe rather than by reading CSS — **COVERED**, not absent or
  zero-box, with its geometry already correct, so the fix is paint order alone. **The CPM engine is
  not imported and no migration runs**, so the ADR-0034 parity gate is untouched by construction;
  `database-architect` is not engaged because there is no schema change to design, not because one was
  judged too small.
  **The epic shipped and the product owner said it looked awful, and the reason is the most useful
  thing in this entry: nobody had ever measured the screen it is judged on.** Their Surface Pro is
  2880×1920 at 175% = **1646 CSS px**; every figure in ADR-0090 and ADR-0091 came from 1920, 1440,
  1024 or 768. Measured at 1646 for the first time, **both rows were roughly half empty and
  withholding labels anyway** — Row 1 with 684 px of slack, Row 2 with 811 — so the whole remaining
  programme, all of which frees width, could not have fixed it. Two causes. Row 1's was
  `resolveLayoutMode` reading the toolbar's **own leftover width** as the room it has, so the
  finish chip beside it took 136 px (1630 → 1494), below the 1536 floor, and the viewport commands
  lost their labels: **the same conflation that withdrew D4 above, now shipped**, and quietly
  telling the `shrink-0` mode row that a 3840 px display is `collapsed`. One `ToolbarBandProvider`
  fixes all three, and the invariant is written where it will be read — _the band width may never
  be an input to a fit decision_. Row 2's was real: the full label set is 1591 px of items plus
  ~134 of chrome against a 1630 container, **established by forcing the labels on and watching two
  commands demote** rather than by arithmetic, which is what settled a shortfall three prior
  estimates had put at 25, 60 and 199 px. Three labels shortened, long form moved to `description`
  so WCAG 2.5.3 survives. 1646 is now permanent in both the harness and the fit gate.
  Two further things are recorded rather than absorbed. A **coarse-pointer** run — the first ever
  taken in this repository, because Playwright defaults to a fine one — shows Row 2 losing all nine
  labels again in tablet mode (`docs/TECH_DEBT.md` #133); the product owner uses the keyboard, so it
  is debt rather than a defect. And **three journeys broke across this work and each was found by
  CI rather than by me**, because I fixed the suite CI named instead of sweeping all 31; the rule
  that replaces that judgement is in #133's neighbours — after any label or layout change, run every
  journey, and locate a toolbar control by `[data-toolbar-item]` rather than by its copy.
  **M7 is the degradation ladder, and it is the first time this surface's arithmetic has been
  testable at a desk.** The product owner used `web-v0.86.1` and called it half-baked: the `⋯` should
  be hidden unless in use and always at the right-hand end, labels should fall one at a time rather
  than all at once, commands should go icon-only before anything enters the menu, the date picker
  should fold into Go-to-today, and the shortcuts item should move. All of it landed, and the epic's
  own rule — measure, do not reason — changed a decision three times. **Costing the `⋯` correctly is
  a net narrowing on the day it lands**, and it narrows past the one width this epic exists to serve:
  Row 2 went 12/14 labelled to **5/14 at 1646**, so it could not ship without tier-3 admission to
  hand the width back. **`CHROME_RESIDUAL_PX` was calibrated against a measurement artefact** — its
  Row 2 figure was two split-button carets, which fall outside `data-toolbar-item` for the harness
  and inside the measured wrapper for `Toolbar`, so the primitive had always counted them; the honest
  residual is 21 px and 9 px, not 27 and 51, and the 44 px that recovers is the same width seen
  twice. And **a shrink-to-fit row must never demote**, because on such a row `clientWidth` is an
  _output_: the `shrink-0` mode row lost `Diagram` and `Gantt` to a transient narrow first pass,
  collapsed to **37 px holding nothing but the `⋯`**, and could never recover — three journeys failed
  looking for a view switch that no longer existed, and all three had passed on the released commit,
  established by running them there rather than assuming.
  The load-bearing change is that **the pass stopped measuring its own output**: a plain button is
  wider when labelled, so labelling widened the row and the widened row could not afford labels; a
  constant was damping that loop rather than removing it, and the damping was itself the defect — an
  8 px-per-item bias that left a **72 px band of widths in which Row 2 was stable both labelled and
  unlabelled**, and which a planner got depended on the order they had resized in. Plain-button widths
  are now derived from the CVA and only `render` items are measured, so the pass has no output on its
  input side. It also moved out of `Toolbar.measure` into a pure `computeLadder`, which is why an
  oscillation sweep and a prefix property can be asserted at all: `measure` early-returns at
  `available <= 0`, so under jsdom this arithmetic had never once run.
  Two placements are **knowing reversals recorded rather than done quietly**. The Project-finish
  read-out returns to the registry as a `presentational` item, reversing ADR-0090 M2-T3's placement
  while keeping its principle, because the `⋯` cannot leave `role="toolbar"` — it is a roving stop,
  the arrow keys are a handler on the container, and the fit gate scopes its sweep to that element,
  so moving it out would take it out of the gate's reach **silently**. And keyboard shortcuts leave
  the command surface for the account menu, entry point only: the sheet, its state and the `?` binding
  are untouched, reached through a registration seam so the header stays plan-unaware.
  **The gate gained two assertions and was found to have two holes of its own.** S9 (the `⋯` is the
  row's rightmost control) and S10 (a trailing group really is trailing — 281 px adrift with a second
  `ml-auto`, because a flex line splits free space **equally** between every auto margin rather than
  giving it to the last) were both verified red first, and S9 is documented as _not_ catching S10's
  case, which was checked rather than assumed. The pre-existing holes: `reachableSet` looked only for
  `[role="menuitem"]`, so every toggle in the `⋯` was uncountable — harmless only while tier-3 items
  were _permanently_ in the menu and therefore never in the reference set — and S3 counted read-outs
  as commands, so the finish chip's correct withdrawal at 960 read as a command with no route.

- **ADR-0092** _(Accepted; M1–M4 landed 2026-08-13, M5 deferred on a product-owner decision)_ — The
  canvas dock, and the diagram's vertical budget. The product owner used the ADR-0091 M7 release and
  reported four things that were not about the command surface two epics had spent themselves
  fitting: the helper band "taking up canvas space", the canvas sitting "in its own box with rounded
  edges", and the selection bar that "gets in the way and obscures some other activities". Measured
  at **1646** — their Surface Pro, and the width ADR-0091's own retrospective established two epics
  had never used — the workspace carried **249 px of chrome above 558 px of canvas, 31 %**, before
  any transient strip appears.
  Two earlier decisions explain why nobody had noticed. **ADR-0064's rule is right and was priced
  only against the alternative it rejected**: a statement lives in reserved chrome, never as an
  overlay — but chrome above the scene pushes the scene _down_, and that was never costed. And
  ADR-0031 Fork-2 left the singular selection bar **floating**, with `docs/TECH_DEBT.md` #31
  recording the obstruction from the day it shipped. So the workspace shipped **both answers to one
  question** and gave the worse one to the commoner case.
  **The dock is the answer, and it keeps ADR-0064 intact at no height.** Every transient strip — the
  armed-tool statement, the link confirmation, both selection bars, the conflict banner, the
  empty-plan notice — portals into the **Activities handle row, which already existed**: 36 px with a
  word at one end, a button at the other, and the whole width between them empty. Measured: arming a
  tool and selecting an activity each cost the canvas **0 px**, asserted as an equality. The
  in-place fallback when no outlet is registered is the **parity contract**, which is why 4,750
  existing tests passed through untouched. Clearing the outlet **by node identity** is load-bearing:
  two weaker rules were written and each broke the case the other fixed — a bare `null` empties the
  dock on half the transitions, and an `isConnected` guard inverts that (React runs a ref cleanup
  _before_ detaching), portalling the strips into a node leaving the document, present in no
  accessibility tree, with nothing on screen looking wrong. The second was found by the fourth unit
  case, not by reading.
  **`Snap to grid` is deleted, and the product owner's report was exactly right.** The toggle had no
  effect — `compute.ts:335-338` rolls every `visualStart` forward unconditionally — and what it _did_
  change was the tie-break **direction**, for the worse: it rounded to the NEAREST working day,
  writing a Saturday drop back as **Friday**, earlier than the planner placed it, and then the engine
  rolled from the client's answer. The PATCH now carries the raw dropped day and the ghost previews
  the engine's roll. Its journey (`apps/web/e2e-workspace-chrome/`) is **the first in this repository
  to run in Visual mode at all** — the other fourteen canvas configs pin `VITE_SCHEDULING_MODES` off,
  each for a good local reason, and the unrecorded consequence was that the one placement rule a
  planner exercises by dragging a bar had no end-to-end cover. That is precisely where the defect was.
  **The finding it did not go looking for**: deleting the button turned `e2e-toolbar-fit` S4 red at 960. The button was not the cause, it was the **cover** — `Analysis` and `Share & export` painted
  their labels at every width while every other trigger goes icon-only below 1024 (145 px between
  them), and Row 2 fitted at 960 only because `snap-to-grid` was the last **demotable** item the
  ladder could sacrifice. The ADR-0064 §7 shape for the fifth epic running. S11 pins it in **both**
  states, because asserting only the narrow half passes equally against a control with no label
  anywhere (TECH_DEBT #126's four blank buttons, one costume along).
  **M5 — merging the identity line into the app header — was a hard requirement and is WITHDRAWN on
  its own numbers**, which is the entry's other useful part. Tidying yields 456 px: the merge fits at
  1920, is 134 px short at 1646 and 340 px short at 1440, and closing 1646 costs the organisation nav
  (~517 px), the brand wordmark (~120 px, 14 px short and therefore not a fit) or icon-only mode
  switches (~200 px, reversing ADR-0091 M7 from the same week). Put to the product owner with those
  figures **and with what the merge is worth** — the identity row is 45 px of 240 px, so about 8 %
  more canvas — they withdrew it. Recorded as a withdrawal rather than a deferral, because a deferral
  is work still owed: this is a requirement its own measurement disqualified, the same way ADR-0091
  D4 went. The remaining 195 px is the better target and wants a fresh measurement. The empty-plan
  prompt **stays in the dock** (D6a) — one place for every strip beats a rule with one hole in it,
  and the cost is stated. Closes `docs/TECH_DEBT.md` #31's fast-follow and #125. **The CPM engine is
  not imported and no migration runs.**

- **ADR-0093** _(Accepted; landed 2026-08-13)_ — An object action belongs on the object. The product
  owner asked whether the toolbar's `Report progress` was warranted, having noticed it was clickable
  only with an activity selected while a second button doing the same thing sat at the foot of the
  canvas under the same condition — and that this looked like the only button landing in two places.
  It was, and the **enumeration** is the finding rather than the impression: four command-surface
  items consult the selection and only that one had a dock twin; none of the dock's eleven items has
  a command-surface twin except `progress`. The two were indistinguishable in permission, in
  precondition and in effect. The duplication was added **knowingly** — the dock item's docblock says
  it mirrors the toolbar command's gate — so nothing was wrong in either file and a human read of
  either kept finding a correct item with a correct comment. **The wrongness existed only in the
  relationship**, which is why the rule ships as a derived structural gate rather than a convention:
  `selection-duplication.structural.test.ts` builds both rosters from the two registries (a
  hard-coded list is the ADR-0073 C4 defect in miniature) and carries a **second** assertion that the
  dock still offers the action, because the general one would pass equally if BOTH copies vanished
  and a green suite could not then distinguish "the duplicate is gone" from "the capability is gone"
  — the ADR-0081 shape. Both verified red first. The discriminator is the deliverable: **an action
  whose subject is the selected object belongs on the object's surface; the command surface carries
  actions whose subject is the plan or the view.** That is the mirror of ADR-0091, whose subject was
  a command surface with no vocabulary for a mode, a fact or a subject; this is an **object action
  wearing a command's clothes**. Amends ADR-0031's taxonomy and supersedes
  `workspace-layout/design.md` §42 — whose reason ("a Contributor's primary action must not be
  buried") was **right and is better served by the dock**, which puts it on the object under exactly
  the same condition.
  **The Gantt asymmetry inverted on reading, and the measurements corrected the author twice.** It
  was first offered as a reason to KEEP the item — the only selection-driven route in that view —
  until ADR-0059 §4 ("the first ship is read-only") made it a hole in that story rather than a
  feature of it; a Gantt row menu was rejected for the same reason (editing by the side door).
  **The width argument is withdrawn**: removing a 163 px labelled item bought Row 2 **no label**
  (13 inline / 11 labelled either side at 1646), its width going straight back into the ladder — the
  third consecutive epic whose width expectation its own measurement contradicted (ADR-0091 D4,
  ADR-0092 M4), which now looks like a property of the ladder rather than three coincidences. What it
  bought instead was unreachable by reasoning: `clear-visual-placement` returns inline and the **`⋯`
  disappears from Row 2 entirely**, so every command there is directly reachable — with the honest
  consequence that the promoted item is one of the two write affordances still reachable from a Gantt
  selection, i.e. this makes it _more_ prominent. And the plural-selection finding was **confirmed
  and overstated**: the guard does suppress the dock bar while the command item stayed enabled, but
  the plural bar prints "N activities selected — X is the subject of single-activity actions", so the
  product names the rule on screen; it is a two-surface inconsistency, not a silent action, corrected
  in place. That correction's own first measurement read the **Project Explorer's** row menus and
  would have reported a false pass — this epic's subject in miniature. The Gantt cost is **accepted,
  not mitigated**, and inherited by the Gantt-editing epic through `docs/BACKLOG.md` rather than
  promised here. **The CPM engine is not imported and no migration runs.**

- **ADR-0094** _(Accepted; M0–M5 landed 2026-08-14)_ — One meaning of "conflict", and a remedy on the
  object. The product owner asked for three things about the **Next conflict** button — shade it when
  there is nothing to review, put the count on it, and offer a fix when you land on one — and reading
  the code to answer them turned up a fourth nobody had reported, because it is invisible from either
  side: the Filter menu's **Has conflict** lens matched `visualConflict` **alone** while the cycle one
  item away counted the whole set. Nothing was wrong in either file; the wrongness lived only in the
  relationship (the ADR-0093 shape), and it was unreportable **because** of the other two defects —
  the count existed only mid-cycle and the button lived in the `⋯`, so nobody could ever see the two
  numbers disagree. Putting the count on the bar is exactly what would have exposed it. So the fix is
  a computed gate, with a **pinned positive case** so it cannot be satisfied by an empty set, and a
  blind spot stated in its own docblock: it proves the rule is sourced once and cannot prove the two
  read an equally fresh list, which is the journey's half.
  **The plan's own central justification was false and was reversed before anything was built.** It
  said to fold the count into the button's label and explained the earlier refusal as "a consequence
  of tier 3"; the comment it cited says nothing about tier and opens _"The plan said to fold this into
  `next-conflict`'s label. Measurement says do not."_ A context-bearing label re-runs the width ladder
  on every click — moving controls under the planner's cursor between two presses of the same button —
  and reduces the accessible name to a status. ADR-0076 Class 3, caught by reading the file.
  The conflict set **narrows five → three** on the product owner's call, and `negativeFloat` is the
  instructive loss: one root cause counted N times down a chain, which a planner cannot act on, and the
  only member with no remedy — so dropping it removed a whole "no button, explanation only" state, a
  graph-aware stage and a four-consumer signature change. What remains is a **total
  `Record<ConflictKey, ConflictRemedy>`**: adding a flag becomes a typecheck failure rather than a
  conflict reaching a planner with nothing behind it.
  The remedy goes on the **object**, because the cycle already selects it. A second on-canvas strip was
  designed, costed and **withdrawn** — it would have re-created the duplicate ADR-0093 removed one day
  earlier, and that ADR's gate **could not have seen it**, since it compares two registries and a third
  is invisible to it. `clear-visual-placement` therefore **moves** to the selection bar rather than
  being duplicated (its `isEnabled` consulted the selection, which is ADR-0093's discriminator
  verbatim), with the duplication gate **verified RED against the two-copy state first**. One of the
  three remedies then renders **nothing**: `visualConflict`'s fix is that moved item, and a
  conflict-flavoured twin beside it would be ADR-0093's defect reproduced **inside one surface**, one
  day after removing it between two.
  **M0-T1's measurement found a pre-existing defect in the shared ladder**, and its own first
  hypothesis was wrong in a way worth keeping: the obvious cause of Row 1 laying out 8 px past its
  container at 1024 was the new read-out, and giving it a band floor changed the overhang by **exactly
  zero px** — the fixture plan has no conflicts, so that chip was never rendering there. The real cause
  was `computeLadder` charging the `⋯` **inside** the `budget < 0` branch, so the shortfall test asked
  _"is this row short without the button it is already rendering?"_ Any row over by less than the
  button's own width answers no. Fourth consecutive epic whose width expectation its own measurement
  contradicted.
  **M5's gates found three more, one of them reached independently by all three reviewers.**
  `srDescription` — added so an AT user could learn the count the `aria-hidden` chip carries visually —
  reached the inline button and stopped: the overflow forwarded `disabledReason` and nothing else, and
  `MenuItem` had no channel for a description on an **enabled** item at all. Not hypothetical, and the
  journey is how that was settled: it hit the demotion on its **first run**, because
  `next-conflict-status` cannot demote and the ~130 px it takes the instant a plan HAS a conflict
  pushed the button it labels off the row — the epic's purpose inverting in the only state it exists
  for. A command now outranks the read-out that describes it; the read-out cannot take the lower rank,
  because it has none. The ux gate separately found the `visualConflict` remedy carrying no signal at
  all (last on the bar, neutral icon, nine controls to hunt), fixed by the **icon** and not the
  position, since a per-context order would re-run the ladder as the selection changes. And two reviews
  called `ConflictRemedyControl`'s zero rendered coverage blocking — which M4-T2's own definition of
  done had said first. **The CPM engine is not imported and no migration runs.**

- **ADR-0095** _(Accepted; M0–M4 + M5-T3 landed 2026-08-17)_ — The Gantt becomes a working
  surface. ADR-0059 shipped the chart read-only and deferred editing; ADR-0093 then took `Report
progress` off the command surface because **an object action belongs on the object**, and its
  replacement — the ADR-0092 canvas dock — was canvas-only. The product owner accepted that
  **explicitly on the basis that the Gantt would pick it up**, so the Gantt had a selection and
  nothing to do with it. The bar is now the dock's, **called** twice rather than built twice
  (`canvas: null` makes zoom-to-selection and isolate absent rather than shaded), the grid takes
  in-cell editing with **per-cell write scope** (ADR-0060's ruling at cell granularity — a grid-wide
  "can edit" would remove a Contributor's progress write while a Planner holds the pen), bars move
  by pointer and by `Alt+←/→` (**not** the bare arrows, which were already treegrid disclosure), and
  dependency arrows land behind a default-off `View ▾` toggle.
  **ADR-0059 §4's objection to arrows is answered by the GEOMETRY, not by the substrate**, and
  neither that ADR nor this epic's first spec said so: its phrase is about **routing**, whose cost is
  independent of the render target — but TSLD bars share lanes while Gantt rows are one bar per row,
  so a link here is an elbow through whitespace. That is a structural test, not a paragraph. Culling
  is **at least one endpoint in the window**, measured (p95 71–74, sort-independent, at 2,160
  activities / 3,200 links) rather than argued, and the cap **always reports its withheld count**.
  **Three defects were found by measuring or reading rather than from a report.** `GRID_WIDTH` was a
  literal disagreeing with its own columns, and measuring before adding one found **Float rendering
  80 px on top of the chart**, painted over the bars by the pinned block's own `z-10`. TECH_DEBT
  #135's fix had closed the bars and left **four** more sites reading the early dates — the text
  cells (the accessible carrier), the sort, the chart's framed extent (so a pushed bar fell outside
  its own chart) and a verbatim duplicate resolver. And `check:frontend-only`, a gate written for
  this epic, opted in from CI on `contains(github.head_ref, 'gantt')` — which **can never be true**
  on this repository's one long-lived agent branch: ADR-0088's no-op flag pins in a second costume,
  written the same week by the same hand that recorded them.
  **The M6 gate pass blocked on all five reviews**, the largest a **data-loss path** (arrow keys in
  an open cell bubbled to the grid, moving focus off an unsaved edit that F2 then overwrote
  silently), plus a row menu rendering every **pen-gated** action as live — found by the first test
  ever written against it, which `coverage.structural.test.ts` structurally could not demand — and a
  print path whose props were threaded while its only caller was not, contradicting the commit
  message that introduced them. Two reviewers were **partly wrong** and that is recorded: the React
  Compiler's analysis does run (in `eslint-plugin-react-hooks` v7), though not at build time.
  M5 shipped the row menu, **bar labels** and the **constraint badge**, and named the columns
  chooser, Indent/Outdent, Insert and view memory as unbuilt rather than implied; **all four landed
  2026-08-18** and released as `web-v0.92.0`, closing `docs/TECH_DEBT.md` #136 — along with #137,
  the shortcuts sheet that had been inert in this view because it was mounted inside `TsldPanel`,
  which the Gantt does not render. The view memory's own finding is the one worth carrying: the
  flag-on journey found on its first run that switching the Predecessors column **on** was
  unrepresentable in the URL, because `useUrlFilterState` deletes any param equal to `''` and "hide
  nothing" serialised to exactly that — while the unit case asserting that very distinction passed
  throughout, since it hands the parser `''` directly and never crosses the hook that deletes it.
  The parser was right and the **encoding** could not survive the round trip. `PROJECT_BRIEF.md`
  §8's "edit supported" is still called **substantially** met rather than closed: the start-edge
  resize is deliberately absent (D4), and Gantt dependency arrows ship default-off.

- **ADR-0096** _(Accepted; M0–M5 landed 2026-08-18, released `api-v0.50.0` / `web-v0.93.0`)_ —
  Deleted work expires, and purge is refused structurally. Opened on three complaints about the
  recycle bin — long and unstructured, an unhelpful "Restore its parent first", a duplicated
  heading — and reading the code changed two of the three answers. A cascade stamps **one**
  `delete_batch_id` across a subtree and `restoreBatch` is keyed on it, so most of those messages
  described work the product **already does**: the list groups by deletion event and the message
  disappears because the situation does, leaving only the case grouping cannot dissolve — a blocker
  in a **different** batch — which now names it and offers a two-press restore. The requested
  **purge is refused**, and structurally rather than by preference: its safeguard ("transfer purged
  content to the Super Admin account") asks for exactly the reach ADR-0086 makes a **compile
  error**, and the alternative of relaxing `audit_events`' `ENABLE ALWAYS` triggers was already
  rejected by ADR-0085 D1. What the request was _for_ is served by **expiry** — nothing had ever
  expired, which is why the list grows forever — making this the product's **first _aimable_ hard
  delete of customer content** (interchange's rollback cannot be pointed at existing data). It
  ships **off**, behind a retroactive 90-day clock and one release of notice, because an unawaited
  sweep at boot means a single release cannot both preview and arm it.
  **The load-bearing decision is that the expiry deletes by _ownership scope_, never by
  `delete_batch_id`** (D5): the cascade leaves `resource_assignments` and
  `cross_plan_dependencies` unstamped (`docs/TECH_DEBT.md` #139), so a batch-keyed delete passes on
  a bare plan and violates a foreign key on exactly the plans that matter — resourced ones and
  programme-linked ones. Proven against a real database with the negative control naming the
  constraint. D7 records the spec's claim that `RESTRICT` forces level-order deletion as **false**,
  refuted independently by two reviewers: the RI check is an `AFTER ROW` trigger evaluated at the
  END of the statement, so a 40-deep WBS chain goes in one statement.
  **The gate pass earned its place for the sixth epic running.** Six specialists; security passed
  having re-derived the epic's own numbers from the code, the other five blocked on seven findings.
  Three were measured rather than argued — Prisma does not chunk an `{ in: [...] }` list, so a
  cascade over **16,384 activities** threw a bind-parameter error the catch block reported as "the
  next tick will retry it", leaving the subtree permanently unexpirable, hourly, forever, under a
  reassuring message. The arming switch itself was **inverted**: `z.coerce.boolean()` is
  `Boolean(value)`, so `'false'` parsed to `true` and `.env.example` ships that exact line (D10).
  A missing re-entrancy guard the sibling job carries deliberately; a budget bounding the big-batch
  case and not the mirror one (100k ordinary deletions ≈ 17 minutes); focus dropped to `<body>` on
  a dialog's Cancel/close/error paths, third instance of that class here; and all five delete
  confirmations claiming a deadline that does not exist on an unarmed host — the epic's own honesty
  rule failing one screen along from the screen that enforces it.
  **Two more came from CI and both exposed the gate rather than the code.** `scripts/frontend-only.json`
  still declared the finished gantt-editing epic active, so the first branch to legitimately change
  `apps/api/` was refused on behalf of a parity argument that was not its own — a stale gate does not
  go quiet, it goes **wrong about a different epic**. And the BASE Playwright journey still asserted
  the pre-ADR-0096 screen, because `scripts/e2e-local.sh` mapped `web:<suite>` to
  `test:e2e:<suite>` and the base is `test:e2e` with **no suffix** — the suite covering the shipped
  default was the one thing the documented pre-push gate could not run. Both fixed, `web` added as a
  target, and `docs/TESTING.md` gains the rule: change a screen, run the base journey.
  **The CPM engine is not imported and the ADR-0034 recalculation parity gate is untouched** — in
  its honest form: there is nothing here to hold parity for. Builds on ADR-0046/0072/0073/0085/0086/0087.

- **ADR-0097** _(Accepted; A, B, D1, E, F landed 2026-08-19; C and D1's band merge WITHDRAWN on
  measurement; D2 deferred out of the epic)_ — A theme is a
  system, not a palette. The
  product owner called the `.corporate` skin _"a badly designed skin"_ and asked for it to become
  the theme the app is designed to, then widened the mandate three times — to layout and
  typography, then to _"I remove all restraints"_, then to a single theme with the mechanism kept.
  Reading the code turned the adjective into a work item: **a theme in this application can
  structurally express nothing but colour.** All 117 of `.corporate`'s declarations are colours, and
  `.dark`/`.corporate` declare **zero** non-colour tokens — so "designed" could only ever have meant
  "recoloured", and every spacing, type, elevation and motion decision in the product is a literal
  somewhere. **`--radius` is declared once, at `:root`**, which is the whole finding in one line.
  **The single-theme answer does most of the work by making `:root` _be_ the theme block.** A
  flash becomes structurally impossible rather than avoided: every stored value — `dark`, `light`,
  `system`, garbage, or a throwing store — resolves to "stamp nothing", so `theme-boot.js` and
  `use-theme.tsx` cannot disagree about what to paint because neither paints anything. The
  mechanism stays **live rather than vestigial** (`THEME_SELECTORS` is a one-element list, `Theme`
  stays a union, the boot script keeps running and keeps its test), and the cost of adding dark
  back is stated rather than hand-waved: **a block of values and one entry** — ~110 declarations
  against today's `.dark`'s ~117, so the new axes do not make it materially more expensive. The
  caveat is not softened: choosing those values is a week of design judgement, and a dark diagram
  whose colours carry meaning needs its plot separations **re-derived, not re-tinted**.
  **Completeness stops being a count and becomes a property.** ADR-0055 §1's "complete (17 tokens)
  or it is a trap" had been patched three times by three different people each finding a token
  outside the family and adding it. The replacement rule: _the defect is never "a token is not
  rebound" — it is a **pair whose two halves are governed by different scopes**_. The page becomes
  an explicit `--page-*` family, `REBOUND_NAMES` is **computed by closure and asserted** rather
  than authored, and `Card`/`Popover` become **resets** rather than exceptions — which closes a
  **latent** split pair (`CardDescription`'s rebound `--muted-foreground` on an unbound `--card`).
  Latent and verified so: it is compilable, one component move from real, and nothing would report
  it.
  **The diagram joins the design system**, which is ADR-0055's original defect surviving in the one
  place ADR-0055 never reached: `resolveTsldPalette` resolves from `document.documentElement`, so a
  bar's fill is the **page's** `--primary` painted on a ground that is not the page, and the
  contrast matrix has **no canvas pair at all**. The canvas becomes a surface scope and the painter
  does not change a line. **Scopes go 5 → 6**, and that line said 6 → 5 until 2026-08-19: the plan
  was to retire `auth` on the ground that it existed only because ADR-0077 §2 had been applied to
  half a screen. `migration.md` made that a **check rather than an assumption**, and the check
  reversed it — measured, **15 of its 18 tokens differ from the page and 12 perceptibly**, led by a
  focus ring ADR-0077 M7 derived specifically to clear WCAG 1.4.11. The theme collapse removes the
  scope's original _reason_, not its _values_. Every "five scopes" in the epic's own documents was
  corrected the day it was measured; this register was not, which is the ADR-0071 failure — noticing
  and stepping over leaves the register exactly as wrong as not noticing. A gate is still
  **deleted**: the cascade-trap assertion that exists only because a flag layer shadows a
  theme-scoped one.
  **The command surface is reshaped rather than fitted a fourth time.** `TOOLBAR_GROUPS` is already
  `frame · lens · find · tools · object · output · help` — a **menu structure**; ADR-0031 designed
  the menus and three epics rendered them as a row and made the row fit. Five menus, eight commands,
  one band: the registry is untouched and the **renderer** replaced, deleting the label pass, the
  band floors, the hysteresis, the `⋯` and `CHROME_RESIDUAL_PX`. It is **gated on its own
  measurement with the falsification condition written first**: under 120 px of slack at 1646 and it
  is withdrawn.
  **One of the spec's own decision-bearing claims was stale and is corrected here rather than
  carried**: it costed the reshape partly on `CHROME_RESIDUAL_PX` over-charging Row 2 by ~47 px, and
  **ADR-0091 M7 had already fixed that** — the constant is `16` today, its docblock records
  recovering the 44 px, and the over-charge it describes is the pre-M7 state. The reshape's case
  therefore rests on the menu argument alone, which is the stronger half anyway. ADR-0076 Class 2
  inside a document written for this epic — the same shape ADR-0080 recorded, found the same way,
  by opening the file instead of trusting the sentence.
  **Two findings arrived that nobody was looking for.** The product has **never decided a
  typeface** — no `@font-face` anywhere, no font file in `public/`, and `globals.css:278` opens with
  `'Inter'`, so the product's face is whatever the reader's machine happens to have and every width
  measurement in this repository was taken in whichever one resolved there. That is the canvas
  finding one layer along: a value that looks decided, is cited, and was never set. And the
  single-theme promise dies quietly unless it is gated, so **no design token may be declared outside
  a theme block or a scope-rebind block**, with a theme contract asserted for every selector — a
  spacing scale hardcoded at `:root` being exactly how it would go.
  Sequenced A–F around one question, _how soon can somebody look at a whole screen in the new
  language_: **A** foundations (nearly all invisible), **B** the organisation landing page as the
  first fully-realised screen, then **C** the command surface, **D** the workspace shape, **E** the
  diagram, **F** the rest. **C is now WITHDRAWN on its own falsification condition** — the single
  menu band measures 1619 px against a 1646 px container, **27 px of slack against the 120 px its
  spec demanded** and 7 px at the worst point of the measured trigger spread, overflowing from 1440
  down. The dominant term is the one §5 risk 2 named: a real plan name is **227 px**, and the
  harness's first run used `Logic` at 37 px and reported 307 px of slack and a PROCEED. Two further
  faults in that harness are recorded rather than tidied — triggers priced from "anything painting
  text" (which sweeps in both halves of two segmented controls and a read-out), and a verdict
  produced from an `undefined` because the edit adding the worst-case field silently failed to
  apply, `undefined >= 120` being `false`: the right answer from a missing number. The gate now
  throws when it has nothing to judge. **The diagnosis is not withdrawn, only the single-band answer
  to it**, and it stands on the two of its four symptoms that survived verification — the other two
  described behaviour ADR-0091 M7 had already fixed. Fourth consecutive epic whose width expectation
  its own measurement contradicted, and the fourth in the same direction. **B's condition is not negotiable** — it is built from the archetypes,
  never a bespoke layout that happens to look right, because a beautiful one-off on the flagship
  screen would falsify this epic's thesis on its first outing. No new `VITE_` flag: ADR-0088
  established that a `VITE_` constant is inlined at build time and is not an operator rollback, so
  the rollback is a commit boundary. **The CPM engine is not imported and no migration runs.**
  **The epic closed 2026-08-19 with two of its own proposals disproved by the instruments it
  insisted on, which is what the method was for.** Beside C, **D1's band merge went the same way and
  its evidence was a browser**: it shipped, and `e2e-gantt` then failed twice on the **view switch**
  — the one control that moves a planner between the two views of their plan — reachable only
  through an overflow menu at every width. Four shrink arrangements were measured and none fits the
  header while keeping the four modes visible, because the identity wants ~1170 px against ~861 px
  at 1280; the approving estimate had said 795 px and +250 px of slack. **Fifth** consecutive width
  expectation contradicted by its own measurement. `aboveCanvas` returned to 240 px — the 45 px
  given back exactly — and the product owner chose to leave it withdrawn. **D2 (the docked activity
  editor) is deferred out of the epic** by the same decision: it is a workflow change, and ADR-0060's
  per-scope save and unsaved-work guard are dialog-shaped, so it wants its own design pass.
  **Landing F's lesson is that three quarters of it did not exist.** Its select conversion was
  scoped at ~35 call sites and is **three**: the discriminator was written "server-paged", and
  applying it to the first candidate showed all four of that dialog's pickers use `apiFetchAllPages`
  — the opposite — so the rule would have left a 2,000-option `<select>` in place while reading as
  decided; corrected to **unbounded by the data model**. Its row-action half was scoped at ~10 tables
  "where `UX_STANDARDS.md` specifies the APG row menu", and that standard's subject is **dense list
  and tree rows** while the named table already cited it as compliant; re-counted by subject-labelled
  row actions rather than by `size="sm"` occurrences, **one** table was crowded. Each step needed a
  count rather than a reading, and the estimate moved ten → two → one. F also found the drift class
  **one layer in**: `account-chip.tsx`'s own docblock described a theme radio group "with four
  themes" in a file with zero references to `useTheme` — not a document describing the code wrongly
  but the code describing itself wrongly, where a reader is likeliest to trust it.

- **ADR-0098** _(Accepted; M0–M5 landed 2026-08-19)_ — The landing is the organisation overview.
  `/orgs/:slug` is where **every sign-in lands**, and it showed a centred card saying "Select a plan
  from the Project Explorer" — a description of the rail one column away, answering neither question
  a planner actually arrives with. It also carried a **second screen nobody had ever seen**: a
  `VITE_NAV_TREE`-off branch reading "The schedule editor arrives in an upcoming update", roughly a
  year after the editor shipped and unreachable in every published image (ADR-0088), deleted with
  the flag rather than corrected. **Recently changed** is ordered by
  `GREATEST(plan, newest activity, newest dependency)` — **not** `plans.updated_at`, which does not
  move when an activity is edited, so the naive ordering ranks a plan somebody worked in all morning
  below one whose name was corrected last week **and every row still looks correct**. Names resolve
  through `org_members` and never through `users`: that join is the control, not a convenience, and
  `changedBy` is a discriminated union (`MEMBER`/`FORMER_MEMBER`/`UNKNOWN`) because a nullable name
  collapses two different facts into an absence a reader cannot tell from a defect.
  **Sections and counts the caller may not read are OMITTED, never zeroed** — ADR-0082's "when every
  item would be shaded, show no trigger at all" applied at **section** granularity, because a zero is
  a fact about the organisation and an absence is a fact about the reader. **"Jump back in" stores
  ids and never names**, which is what makes a rename correct itself and a plan the reader has lost
  access to disappear rather than 404 on click; the key carries the user id and sign-out sweeps it,
  since the query cache dies with the tab and `localStorage` does not; and the ids ride on the
  request the screen already makes, **measured** by the journey rather than asserted. Its **four
  failure modes are indistinguishable by design** (deleted / another organisation's / unreadable /
  never real), with the API e2e comparing whole payloads rather than three empty arrays — an oracle
  is a difference. The wordmark becomes the route home **at the header call site only**, never
  inside `BrandMark`, which the public screens also render; "Overview" leaves the nav **after** the
  page has content, and that sequencing is the decision. **No feature flag** (ADR-0088 D2's Class A
  shape, plus D1's finding that a `VITE_` flag is not an operator rollback at all). Six dashboard
  sections are rejected **by name**, including count tiles and an activity feed the audit log
  permanently cannot back.
  **The screen is assembled from the ADR-0097 archetypes and that is a gate**, verified red against
  a hand-rolled frame. Two archetypes changed because it needed them to — `PageContainer` gained a
  `narrow` measure (at the default, a plan's name and its change time sat ~800px apart at 1646) and
  `SectionCard` became a named `<section>`, which arrived from the journey rather than a reviewer.
  **Three of my own gates were defective and are recorded rather than quietly fixed**: one was
  vacuous (it matched sign-in's description copy, not the wordmark, and passed against a real
  injected link), the ADR-0097 weight ratchet was counting `font-medium` inside its own docblocks so
  that writing down reasoning pushed it towards failing, and `forgetAllForUser` used
  `Object.keys(storage)`, which works only because the Web Storage API happens to expose stored keys
  as own properties. **The CPM engine is not imported and no migration runs.**

- **ADR-0099** _(Accepted; M0–M10 landed 2026-08-20)_ — Graphite: workstation density in rail
  chrome. Four consecutive epics (ADR-0090/0091/0092/0094) worked the plan workspace's command
  surface and each asked the same question — **does the row fit?** The answer was always "nearly",
  so the answer was always to shave; ADR-0097 Landing C proposed the one genuinely different shape
  and killed it on a **width** criterion a menu-driven design cannot win and a row-shaped one always
  can. The instrument could only ever select the incumbent. The register had recorded the symptom
  four times and read it as an estimation problem; four identical failures are evidence the **frame**
  is wrong. What settled it was **looking**: `scripts/shoot.mjs` had existed since ADR-0097 and its
  shot list covered nine screens and **not the plan workspace**. The first correct screenshot showed
  what no measurement had reported — a letterboxed diagram between 192 px of chrome and a table
  owning the bottom third, five controls dead on arrival before the pen is taken, and the loudest
  thing on the canvas being the weekend hatching. Five layout studies went to the product owner, who
  chose a hybrid: workstation **density** inside a rail-and-drawer **chrome model**.
  **The decisions.** No top bar — a fixed icon rail on the leading edge, top to bottom. One context
  drawer on the trailing edge, resizable, replacing the modal activity dialog. One command strip
  carrying every command, with modes on the rail (a mode is not a command — ADR-0091's own thesis)
  and object actions on the object (ADR-0093's rule, unchanged). A status bar for facts, where
  `Recalculate` stops being a button pretending to be a status. The Gantt grid **beside** the chart.
  A graphite palette with one rule — **cool means interface, warm means attention** — so anything
  blue is pressable and warm is reserved for the schedule speaking. **Values only, no new
  structure**: ADR-0097's 31-name vocabulary rebound per surface scope is kept exactly, which is
  what makes the epic affordable at all.
  **The palette was computed before anything was drawn, and two of the first choices failed** — the
  critical/non-critical pair at **1.23:1** (the single most important distinction in the product,
  differing in hue and almost nothing else) and a white label on the critical fill at 3.77:1. Both
  are now separated on **lightness**, and the selection ring sits **outside** the bar because no one
  ring colour clears both fills.
  **M0 measured before anything was built, and said NO.** The strip as drawn is 302 px over at
  1646 — the sixth consecutive epic in this register whose width expectation was contradicted by its
  own measurement, and the **first caught before building**. It exists because Graphite deletes the
  `⋯` that made the previous five embarrassing rather than broken. The fix was derived from what
  each thing _is_: modes to the rail (−400 px), the finish read-out to the status bar (−127 px),
  five document commands into one `Plan ▾` (−283 px). Reduced strip fits at every measured width
  with 182–718 px of slack.
  **M2 proved the grid is a no-op** by pixel-diffing every screen at three widths — a `sha256`
  comparison could not, because the screenshot harness mints a tenant per run and paints its name
  into the header, so a byte comparison reports "everything changed" for a milestone whose whole
  condition is "nothing changed". It also retired `VITE_DESIGNED_CHROME` **ahead of its batch and
  against its own `keep`**: the register's reason ("guard-only") stopped being true in the same
  commit, because a grid cannot render the flag-off composition without a second JSX root — ADR-0088's
  Class A discriminator. Both harness pins were **converted first, not stranded** (the ADR-0084
  batch-1 lesson applied in advance).
  **M3's measurement changed the milestone.** Deleting the 56 px top bar bought **12 px**, because
  the identity line had been merged into that bar and took a row of its own — ADR-0092 M4's
  "relocating a row inside one column removes nothing", happening to the milestone that quotes it,
  and it would have shipped as a 56 px headline had the harness not been run against the before
  state. The line moved into the **mode row** instead (whose only other occupants are four buttons
  and the pen status, unlike the header that made the same merge impossible at 1280), giving
  240 → **184 px** above the canvas and +9.7 % of diagram at 1646. A **skip link** landed with it:
  there was none in `apps/web/src`, and none was obviously needed while the header came first.
  **M4 answers the product owner's requirement with geometry, not measurement**: the band spans the
  grid columns the drawer sits inside, so opening it redistributes width between the stage and the
  drawer and changes the band by **zero** — asserted in a browser at three drawer states (open/closed
  alone passes equally against a band reserving a fixed width) and **verified red**. The drawer is
  the first **non-modal persistent panel** in this codebase, so every protection a modal gets free is
  a decision: Escape is the **outermost rung** of ADR-0080's ladder deferring to `defaultPrevented`,
  never a new listener; focus never moves in on a subject change; the empty state is explicit.
  **Three defects the gates found, one of them in a gate.** The six organisation destinations
  rendered **twice** (rail icons and drawer list), surfacing as a strict-mode locator resolving to
  two elements rather than as anything anyone saw. The drawer **named its subject twice**, caught by
  the _weight_ ratchet rising by one — a gate for a different thing catching a real duplication
  because the duplicate had to be styled. And the **sizing ratchet still had the hole the weight
  ratchet had already fixed**: it scanned raw text, so documenting an arbitrary value counted as
  using one, and it went red at the exact moment its own rule was being obeyed. Comments are stripped
  now and the ceiling re-measured 20 → 18 rather than left where it was.
  **Two process findings are recorded rather than absorbed.** `reuseExistingServer` is true outside
  CI, so a dev server left over from a _different_ harness is silently adopted and a config's flag
  pins never apply — that produced **three consecutive false diagnoses in one session** (a palette,
  then a refactor, then very nearly a product defect) when the cause was an API server carrying
  `PLAN_EDIT_LOCK_ENFORCED=true`, hidden because `nest start --watch` puts the environment on the
  **child** process. `scripts/e2e-local.sh` now refuses to run while anything answers on 3000 or 5173. And a **sweep measures the tree it runs against**: one was left running while the next
  milestone was written, so every suite after the first edit failed on a half-applied change and
  none of it was a finding.
  **M5 merges the two command rows and keeps everything the ADR said it would delete.** Three
  command rows become one: `ToolbarRow` goes `'mode' | 'look' | 'do'` → `'mode' | 'strip'`, and the
  four mode segments move to the rail as **registry items on a vertical toolbar**, never hand-rolled
  buttons — the five modal tools need arm/disarm, Escape precedence, announcement and pen gating,
  and hand-rolling is how one control gets a rule and its neighbour does not. Measured,
  `aboveCanvas` falls 240 → 184 (M3) → **135**, and the canvas at 1646 goes 576 → **681 (+18 %)**.
  The ADR's own Consequences said the width ladder, band floors, hysteresis, `CHROME_RESIDUAL_PX`
  and the `⋯` "become unnecessary and are deleted with the row they served"; M5-T1 measured the
  reduced strip against 768–1920 and it fits at neither 1280 nor 1440, so **the ADR was corrected
  and all five are kept** — along with the tier model, whose bullet was struck for the same reason
  one paragraph later: its protasis ("a single strip that fits") is false.
  **The real cost was found rather than predicted, and it is one property wearing three costumes:
  eleven pinned `render` items now share one budget.** ADR-0090 M3 earned the 768 floor by removing
  pinned items from Row 1, and the load it left was **split across two rows**; one row makes it
  additive. Instrumented at 768, the ladder had already demoted **all twelve** demotable commands
  into the `⋯` and the eleven survivors sum 720 px against a 752 px container — so
  `PINNED_FLOOR_WIDTH` rises **768 → 960** and the strip scrolls below that (`docs/TECH_DEBT.md`
  #147; corroborated independently by `graphite-strip.json`, which puts the boundary in the same
  place). Then `ToolbarItem.priority`, which defaults to `-order`, **stopped being an inert
  convenience and started deciding what a planner can reach**: it dropped `Next conflict` — ranked 90
  by a rule that was about **Row 1** — reproducing verbatim the ADR-0094 M2 defect that a shading
  nobody opens the menu to see is not a shading; and it dropped `Recalculate`, ranked **−7 because
  it registered eighth**, into the `⋯` at every width from 768 to 2133, where the only spinning cue
  that a recalculation is running cannot spin at anybody. Both are now ranked deliberately, with
  the reason in the registry. **All three were found by journeys, none by a unit suite.**
  **Two more findings are the instruments, not the product.** The first fix attempted — narrowing
  `recalculate`'s `showLabel: 'always'` — returned the **identical** 866 px, because the probe showed
  that command had been inside the `⋯` at every width for the whole epic; it was reverted rather than
  kept as harmless, since the comment written with it asserted a measurement that was false
  (ADR-0076 Class 3), and a change that helped a little would have shipped. And raising the floor
  unmasked a **latent bug in the fit gate itself**: S9 compared `getBoundingClientRect` values
  gathered inside the sweep that calls `scrollIntoView`, so the first time the row genuinely scrolled
  it named `export` as the row's rightmost control while the product was correct throughout —
  invisible until now because the row had never overflowed at any measured width.
  **And one of M5's own write-ups was wrong in the way this register warns about most.** Three suites
  located the toolbar by **selector string** rather than by role+name, so their axe `.include()`
  calls were left naming deleted rows; that was first written up as "a scan matching nothing, green
  for having tested nothing" — the shape #124 records — and then the dependency was opened:
  `axe-core`'s `validateContext` (`axe.js:19564-19569`) **throws** on an empty include, so all three
  would have gone red loudly. A breakage, not a hole. Corrected in place rather than rewritten, because reaching for the
  register's own favourite failure mode instead of reading the code is ADR-0076 Class 2 committed in
  the same document that was praising an instrument for catching one; the citation is now in
  `scripts/dependency-claims.json`.
  **M6–M9 each lost their headline task to a re-read of the problem, and that is the epic's most
  transferable finding.** M7's plan was to re-host the canvas dock in the status bar; reading it
  showed ADR-0092 had already put the dock where it belongs and the re-host would have **reversed**
  that decision. M8's §A15 fork asked which of two Gantt layouts to build and the answer was
  neither — ADR-0095 had shipped the grid beside the chart already. M9 was empty on the same test.
  What survived was in each case a smaller, different thing: a status bar of facts, a draggable grid
  splitter, a screenshot. `docs/RECONCILE.md`'s rule is _verify the claim_, and a **plan's problem
  statement is a claim** — one nothing in this process was re-verifying, because a milestone that
  fixes something does not go back and edit the spec that complained about it.
  **M10 is the gate pass, and it earned its place for the seventh epic running.** Six specialists;
  security and frontend-performance passed having re-derived the epic's own numbers from the final
  code (measured **+1.9 kB gzip** for 163 files, and zero commits under `render/`, so TECH_DEBT #75's
  known overage is not attributable here). The other three blocked, and the largest finding is this
  register's own favourite shape landing on the epic that keeps quoting it: **the drawer had no entry
  point.** `m6-activity-context.md` T4 says "the three ADR-0060 intents open the drawer"; registering
  a subject only ever made a rail button appear, so pressing **Edit** opened the modal at every width
  unless the planner had separately discovered that button. The milestone's headline capability was
  dark in the default path, with its unit tests green throughout because they mount the editor and
  not the shell — ADR-0081, fifth recorded instance.
  **Fixing it produced two more defects that only a browser could report**, and both took two wrong
  guesses first. The shell can only agree to show the drawer **one commit** after the route asks, and
  in that gap the modal still rendered `open` — so `Dialog`'s effect called `showModal()`, focus went
  into the top layer, and the next commit swapped the chrome and unmounted it, leaving focus on
  `<body>`: WCAG 2.4.3, and every workspace keyboard accelerator silently dead with it. A layout
  effect does **not** fix that, because React flushes a commit's passive effects before the re-render
  a layout effect schedules; the shipped answer is derived rather than latched — _no modal while a
  drawer could hold this instead_ — which also stops a modal popping over a planner who has
  deliberately pointed the drawer at the Explorer. And Escape does something different from what I
  twice assumed: with focus on the dock button no inner rung of ADR-0080's ladder claims the press,
  so the shell's outermost one takes it, the selection survives, and focus lands on the rail button.
  Each was established by a probe recording the actual sequence (`in BUTTON[Close dialog]` → `out` →
  `dialog removed`), not by reading.
  Two further blocking findings were **missing tests rather than defects**, and both were structurally
  invisible: `PlanStatusBar` had no **branch** coverage, and M8's own written acceptance condition ("the three sites read one value; a structural test
  says so") had never been met, leaving unpinned the exact arithmetic ADR-0095 shipped wrong once.
  **The status-bar half of that sentence was itself a Class 3 claim and is corrected here.** It read
  "no coverage direct or indirect… every suite that renders the toolbar renders it zero times", and
  the 2026-08-20 reconciliation pass disproved it in one command: `plan-workspace-toolbar.test.tsx`
  mounts `TestChromeHost`, which has carried a `status` slot since M7, and asserts on `Finish` — the
  bar's own label. So it was rendered and read. What was true is narrower and still worth the file:
  that coverage is incidental and single-branch, and says nothing about pending, the singular/plural
  count, or the recalculating cue. An unverified claim about missing verification, inside the
  milestone whose subject is exactly that.
  `m6-activity-context.md`'s acceptance table is **corrected rather than edited**: three of its six
  rows were wrong in both directions — Close and Escape do **not** need a discard guard (the hooks
  live above the `shell` call, so a portal returning nothing unmounts the fields and not the
  component, which that same file already says about a different route), and what the table missed
  entirely was focus. Every fix carries a regression test verified red first; six non-blocking
  findings are `docs/TECH_DEBT.md` #149.
  **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched by construction.

- **ADR-0100** _(Accepted; M0–M4 landed 2026-08-21)_ — The canvas minimap: an invariant picture
  and a DOM rectangle. The last unbuilt Should-have on the primary surface, built measure-first:
  M0 wrote a falsification condition **before** the prototype (paired same-session runs, treatment
  ≤ baseline + 2.0pp with the baseline spread stated in the verdict) and PASSED it on both
  fixtures; M0-T2 re-derived the need from measured extents (the working presets frame 0.3–8.6%
  of both plans' day spans at 1646 — the time axis carries the argument) and rewrote the spec's
  problem statement from its numbers. The load-bearing split: the picture is a **cached bitmap
  rebuilt on scene change only**, and everything that moves between scene changes — the viewport
  rectangle, the selection marker, the Today vertical — is **DOM beside it** (the agreement round
  caught selection and Today drafted into the bitmap: both would go stale against a dirty rule
  that never fires for them, ADR-0056 F6a one layer down). The rectangle being DOM is ADR-0026
  D7's expensive half, free from the platform. `worldExtent` is extracted to the geometry leaf and
  derived **exactly once** (structural test, verified red against the three pre-existing inline
  copies); x shares `screenXOfDay` while y deliberately does not share `screenYOfLane` — measured,
  `cull()` returns 255 of 2,160 bars at a whole-plan viewport, so the obvious reuse is a
  correctness bug, pinned. Paint order is the decimation policy (critical drawn last survives the
  1px merge); the build is a counting-stub gate (zero text work, two fillStyle bar passes). M0-T5
  proved the PRE-EXISTING `zoomToSelection` lane-framing defect live and **filed it** (#152)
  rather than absorbing it. No `VITE_` flag (ADR-0088); entry point `View ▾ ▸ Panels ▸ Minimap`,
  which the journey drives on its first user-facing milestone (ADR-0081) — and that journey
  earned its place twice before M4: it caught the reload-opener focus drop no unit test could
  see, and established by screenshot that a short plan's rectangle legitimately fills the box.
  **The M4 gate pass found six defects that had passed a human read and every unit gate**, the
  sharpest invisible to every non-browser instrument: the frame token pair was never aliased in
  `@theme inline`, so the rectangle painted NO colour in a real browser while the contrast gate
  stayed green (it resolves `:root` names — it now asserts reachability too); the drag anchor
  was read off the INFLATED display rectangle (~8 days off at the Day preset, Escape restoring
  the wrong viewport — fixed with a pure `sceneWindowRect` and a delta-from-true-centre drag);
  and the minimap's Today was derived in UTC while the scene's is local-calendar (the ADR-0059
  shared-axis rule applies to the clock). Also folded: a WCAG 1.4.1 lightness fringe for
  critical bars, a 600 px responsive withdrawal, and the ADR's own decision 10 naming the
  rejected persistence option as the decision. M4-T2 re-derived the M0 numbers against the
  shipped code (+0.76 pp, PASS; the probe's compositing asymmetry did not reproduce).
  Non-blocking findings are `docs/TECH_DEBT.md` #155; the AT observations still owed are #154.
  **The CPM engine is not imported and no migration runs.**

- **ADR-0101** _(Accepted; landed 2026-08-21)_ — An editor is a dialog, not a drawer. The product
  owner opened the released app and reported the activity editor as cramped and full of scrollbars,
  and asked whether docking it had been the right call. It had not been, and the sharper finding is
  that the call was never made: **ADR-0097 D2 deferred the docked editor on 2026-08-19 with the
  words "it wants its own epic and its own design pass", and Graphite M6 shipped it the next day as
  a sub-task of a shell epic.** The arithmetic nobody had put side by side: ADR-0061 widened this
  form to `xl` — 896 px, with a section rail — **because 448 px had already proved unusable**, and
  the context drawer caps at **420 px**. So a form judged too narrow at half its designed width was
  docked into a third of it. ADR-0099 M10 then found the rail leaving "about 92 px of content beside
  it" and fixed the **symptom** by switching to the horizontal tab strip, so on a 1920 px desktop the
  editor ran its sub-768 px layout permanently: four tabs overflowing sideways inside a panel
  scrolling vertically over a table scrolling sideways of its own. The editor returns to
  `modalShell` (already extracted, already the live path below 1024 px), stops being a drawer
  subject, and the drawer keeps the Project Explorer — which is what it is shaped for. The rule, in
  the product owner's words: **an editing surface belongs in a dialog**; a drawer is for what you
  read beside your work. One D2 prediction is recorded as **wrong**: the unsaved-work guard was not
  the casualty — M6 extended it to cover the subject changing under an open editor, which a modal
  cannot do, and that is kept. Three things are named rather than left: the drawer-subject
  mechanism now has **no production registrant** (#156, with both exits written down);
  `drawer-entry-point.test.tsx` mounts a **synthetic probe route**, which is why it stayed green
  through the removal and why it never proved anything registers a subject (ADR-0081 one level
  along); and the screenshot harness gains `plan-workspace-editor`, because the shot list covered
  the workspace and **stopped at the route**, so the editor on it had never been photographed by
  anything — which is how a four-scrollbar panel reached a user. Two colour values are softened as
  **labelled stopgaps** ahead of the light corporate theme: the page foreground measured
  **14.62:1** on the canvas ground (more than triple AA, double AAA — the halation profile behind
  "hard on the eyes"), and the non-working hatch's 0.177 → 0.300 step is what stripes the diagram.
  The structural cause is #157: **every colour gate here asserts a floor and none asserts a
  ceiling**, so values could only ever be pushed apart. A ceiling is deliberately NOT gated now —
  halation is a dark-ground phenomenon and the product is going light, so gating it for a theme
  being replaced is work thrown away. **The CPM engine is not imported and no migration runs.**

- **ADR-0102** _(Accepted; M0–M3 landed 2026-08-21)_ — The light corporate theme, and the scope that
  never reached the painter. The product owner called the dark Graphite palette "awful in all
  respects" and "very hard on the eyes over a long period"; it is replaced, chrome and canvas,
  keeping ADR-0097's single-theme architecture exactly. `docs/specs/graphite/design.md:98-116` is
  literally headed **"The palette is OPEN"**, so this closes an open question rather than reversing
  a settled one.
  **The theme was largely recovered rather than designed.** The `.corporate` block ADR-0097 deleted
  is intact at `44f1c59^`, bounded **by content rather than by the quoted line range** — which the
  plan's own risk note demanded and which earned its keep on the first command, since the brief's
  range overruns by 290 lines and the overrun is **invisible to a name count**. Measured: not one of
  its 117 names has since disappeared, **61 of 271 declarations do not move at all**, and the real
  judgement is concentrated in ~30 diagram tokens. That **falsifies ADR-0097's own costing in the
  helpful direction** — the declaration count was right, the "week of design judgement" was
  substantially already spent, for everything except the one surface ADR-0099 re-derived afterwards.
  **The M1/M2 boundary does not hold at the token level**: 23 of the plot family's 31 members alias
  the page family, so re-valuing the page's ink broke twelve assertions, every one in the canvas
  scope and none in the page. The milestones are separable in what they **derive** and not in what
  they **break**. The criticality ladder is **solved rather than chosen**, and its binding constraint
  is not the ground but the **label**: white on the on-schedule blue is 3.56:1, so the lightest fill
  takes dark ink — which is exactly what the recovered reasoning meant by capping separation at
  1.70:1 "subject to a white inside-label", and costs nothing because the recovered chrome already
  puts navy on its amber primary. Every fill inverts to darker-than-ground and **its label inverts
  with it, as one edit**.
  **The contrast ceiling `docs/TECH_DEBT.md` #157 asked for is NOT built, and that is an answer.** A
  ratio ceiling must sit below 14.61 to have caught the defect and above 12.64 not to reject the
  recovered palette's own card text: a window under two points wide, tuned to two data points, in
  which the rule would enforce **halation** — a property of light ink on a dark ground, which does
  not occur on the ground it would guard. A second candidate (a ground-luminance band) is
  **withdrawn before writing**: it fails on day one against `--card` at L = 1.000.
  **The epic's most useful finding is not a colour.** `resolveTsldPalette`'s 88 token reads named
  the `@theme inline` aliases — and an alias declared at `:root` as `--color-primary: var(--primary)`
  is substituted **on the element that declares it**, so a surface rebind can never reach it
  (verified in Chromium on a four-line page). ADR-0097 Landing E's guard was therefore **necessary
  and not sufficient**: making `root` a required parameter changed which element was asked and not
  one value that came back, so **the canvas painter had never once used the canvas surface scope**.
  Tailwind was never affected — `inline` is exactly what compiles `bg-primary` to `var(--primary)`
  rather than the frozen alias — which is why every DOM surface was always right and only the canvas
  was wrong, and why it survived until the page's primary went navy while the diagram's stayed blue.
  **The contrast matrix is structurally incapable of reporting it**, because it follows the rebind
  itself when it resolves a scope. Two more instances were on the **guest share view**, the one
  screen an outsider sees: it mounted `TsldPanel` outside `CanvasSurfaceProvider` — which
  `canvas-surface.tsx`'s own docblock predicts in as many words, _"a future host mounts the canvas
  outside the provider"_ — and the legend painted the page's family beside the diagram's bars.
  **Two defects only photographs found**, both with every gate green: the weekend hatch, whose
  1.10:1 dark step becomes **9:1** on a light wash (the hatch is reported rather than asserted, and
  a floor cannot express "too loud"); and the minimap frame, whose gate is `max(stroke, halo) >= 3`
  and therefore polarity-agnostic **by design**, so it stayed green with a white stroke on a
  near-white ground while the halo carried every assertion. Nothing about that gate changes. The
  instrument was widened first — **12 → 25 shots**, including the **exported PNG itself**, whose
  absence is what let `docs/TECH_DEBT.md` #158 ship: twelve screens photographed and never once what
  the product _produces_. **#158 stays open**, because the light theme hides its symptom and not its
  cause. The `auth` scope was **re-measured** rather than assumed — 17 of 31 tokens differ, 14
  perceptibly — and survives on its values, its original ADR-0077 §2 reason having lapsed at
  ADR-0097. Seven claims are recorded as corrected in the ADR's own closing section, including two
  inherited from the brief and one where a correct measurement produced a wrong inference.
  **The CPM engine is not imported and no migration runs.**

- **ADR-0103** _(Accepted; W3-M1 and W3-M2 landed 2026-08-22)_ — Paper is a surface, and the
  exported diagram is the diagram. Two rows filed a day apart turned out to be one defect seen from
  two ends: the exported PNG/PDF and the printed diagram resolved their ground from the app's live
  theme (so Graphite printed a near-black panel inside white paper chrome), and the export composed
  **six** scene keys against the canvas's **25**. #164 was filed as two missing layers; enumerating
  both compositions showed **seven**, including `todayFraction`, which no document named until a
  review — the screen draws a fractional Today line with a pill, the deliverable drew a whole-day
  line with none. Nobody decided any of it: nine features each added correctly to the screen and
  nobody re-read the export. The sharpest instance is **link routing**, since ADR-0065 exists
  because a line through an unrelated bar makes the reader disprove a relationship the picture
  appears to assert — live, in the file a planner sends to someone who was not in the room.
  `[data-surface="print"]` becomes a fifth `FAMILIES` entry and a seventh contrast scope (amending
  ADR-0055 §1 and ADR-0097 D1): 31 members, three **literal** because paper is light by
  declaration, nine aliasing `--plot-*` — the members the painter reads — and nineteen aliasing
  `--page-*`, because the scope's subtree includes the Gantt programme's table where diagram values
  would be wrong. **A scope must govern a subtree or it is a pack wearing a scope's name**, and that
  is a decision rather than a description because it shipped inert for one commit: 31 rebinds with
  no consumer while both stylesheets still read the family by raw name.
  **Four of the epic's defects were in the GATES, not the product**, which is its transferable
  finding. The parity gate could be silenced by a comment containing an unbalanced brace; the
  pre-push script hard-coded the roster it was written to check; an assertion counted ground tones,
  so a restored layer could go missing behind a green test; and the paper scope's own seam gate had
  never been told the family existed. The spec's headline claim was also wrong — the month band's
  polarity inversion is **not** an argument for paper-derived values, because `--print` is maximum
  lightness so nothing can be lighter than paper, and the same document had accepted the inversion
  250 lines earlier. Every export unit suite runs in jsdom, where the resolver takes its fallbacks,
  so they exercise the branch that is correct and **can never reach the branch that ships**;
  `apps/web/e2e-export/` decodes the real download instead. Leaves `docs/TECH_DEBT.md` #166 (a
  whole-plan export culls weekends entirely — worse on paper, which has no zoom) and #167 (five
  scene keys are lens state, so the export is the default picture rather than the planner's).
  **The CPM engine is not imported and no migration runs.**

- **ADR-0086** _(Accepted; M1–M6 landed 2026-08-09)_ — A staff identity that cannot reach a
  customer. The product owner asked for "a super god user"; the motivating example — email-down
  alerts — turned out to need no principal at all (an alert is an outbound POST), but the question
  underneath was real, and reading the code produced an argument nobody had made: **every staff
  operation on this installation happens over `psql` and is completely unaudited.** `audit_events`
  is append-only in the database, and a shell is outside that boundary entirely — so the most
  privileged acts in the product were the only ones with no record of who performed them. A staff
  identity built this way is therefore a security **improvement**, not a new hole.
  The load-bearing decision is that `StaffPrincipal` copies `GuestPrincipal` **exactly** — no
  memberships, no `can()`, no `organizationId`, no role — so it is not assignable to `Principal` and
  staff reaching customer data is a **compile error**, not a check somebody remembers. The rejected
  alternative was a `STAFF` role or an `isStaff` flag, which puts a new branch into twenty modules'
  org-scope assertions, where each branch is a potential IDOR. `AuthContextService` is not modified;
  the cross-org 404 invariant is **untouched**, not merely respected. Declining the product owner's
  offer of the canvas is the largest simplification in the epic: reaching the canvas means holding a
  `Principal`, which destroys the property everything else rests on.
  **Reads are audited, inverting the ordinary rule deliberately** — on this surface the read _is_
  the privileged act, so ADR-0073's durability test would have left the most privileged surface
  recording nothing. A seventh census assertion derives from the **path**, so a staff route added
  later is covered the day it is written. The audit row records that a panel was reached and never
  what was on it: the console reads customer addresses (CQ-1, which overruled the domain-only
  proposal), and putting those in the one table that refuses `DELETE` is what ADR-0085 D3 spent a
  decision avoiding.
  **The epic's own gates found what human reads did not, four times.** M2 shipped **unable to serve
  a single request** — `ck_audit_events_actor_shape` is a fail-closed `CASE … ELSE false` and the new
  `STAFF` label had no branch — with 1,589 unit tests green, because every one of them mocks Prisma.
  M3's journey caught `apiFetch('/api/v1/staff/me')` against an `API_BASE_URL` that is already
  `/api/v1`, invisible to component tests that mock `apiFetch` and assert back whatever path they are
  handed. M4's CSP sink **could not receive a report from any browser** — the body parser was
  registered for `application/json` alone — and lost a violation's first burst to two clocks in one
  statement. Each was found by something that ran the real thing, and each is recorded where it
  happened rather than in a postmortem.
  **M6 is the fifth time, and the largest — the epic's own thesis landing on it (ADR-0086 D8).** The
  approved spec called an audited **denial** non-negotiable in five separate places; the code shipped
  silence, with a test asserting the silence and a comment justifying it — "recording one would make
  the log an inventory of who tried". The security review found it. The argument is answerable and
  was answering the wrong question: an inventory of who tried to reach the most privileged surface in
  the product is precisely the evidence this epic exists to create, and the part that would be an
  oracle — **which** of the three conditions failed — was already withheld by the redactor's empty
  allow-list. The reversal had also never been written back into the ADR, which is the ADR-0071
  failure one document along. Two consequences worth carrying: the row is `recordBestEffort` behind a
  `.catch()`, because `record()` would answer an unwritable `audit_events` with a **500** and make the
  staff surface distinguishable from an unmapped route by status code — an oracle bought with the
  mechanism meant to close one; and its actor is `USER`, never `STAFF`, which forced the activity
  panel to filter on the **`staff.` action namespace** rather than actor type, or it would hide the
  one row a reader most needs to see. Seven more blocking findings folded with it, including a
  declared-but-uncompletable cursor pagination found **independently by two reviewers**, a dual-hat
  banner D4 decided and nobody built, and an activity read that sequentially scanned a table which
  grows forever — measured 23–40 ms at 500,334 rows against 0.02–0.13 ms indexed. That index taught
  something worth keeping: Postgres matches a partial index by **expression equality, not pattern
  containment**, so a strictly _narrower_ predicate also seq-scans, and the filter literal is now
  pinned by a structural test because changing it reverts the read with nothing failing anywhere.
  A `csp_reports` table was hand-written after a launched design agent returned nothing; the review
  that followed found four defects, two of them fatal. **That is why "every schema change goes
  through the database-architect agent" is now unconditional in §19 and §20** — including the clause
  that matters most, that deciding a change is too small to need it is the judgement the agent
  exists to make.
  **The CPM engine is not imported and the ADR-0034 parity gate is untouched** — in its honest form:
  there is nothing here to hold parity for.

- **ADR-0087** _(Accepted; M0 landed 2026-08-10)_ — This application runs scheduled work, and its
  first job is a retention sweep. Two tables documented a period and **nothing enforced either** —
  `csp_reports` 30 days, `mail_events` 12 months, both effectively forever — while
  `csp_reports` is written by an **unauthenticated** endpoint that strips the query string but not
  the path, so unique rows are mintable at 1.73 M/day per IP (≈600 MB), and `mail_events.recipient`
  holds the customer address ADR-0085 spent a decision keeping erasable. There was **no scheduler in
  the application at all** (verified across every `package.json`), so the first question was not
  "what period" but "what runs anything". The answer is `HeartbeatService`'s shape — one
  `setInterval`, `.unref()`'d, no timer when disabled, no Redis, no queue, no dependency — with its
  costs **stated** (per replica, non-durable, no retry) and each accepted _because of what this job
  is_: idempotent and time-predicated, so a second run finds nothing and a restart is repaired by the
  next tick. ADR-0009 is **narrowed, not superseded**, and D2 names the trigger to reopen it
  (durability, retries, exactly-once, fan-out, enqueue-from-a-request, visible progress) so "we have
  a scheduler" does not become the answer to every future background need. **The sweep may never
  touch `audit_events`** — ADR-0085 D1's refusal to relax the `ENABLE ALWAYS` triggers stands, so
  D3's own period **remains unenforced** and TECH_DEBT #118 splits rather than closes. No audit
  event, with ADR-0073's two tests applied in writing **and** the admission that the route census
  reflects over controller metadata and a lifecycle hook has none — so it can see this decision in
  neither direction, making it a recorded rule rather than a gate (the ADR-0072 `ENGINE_DERIVED`
  mistake, not repeated). **D6 is the measured correction**: the spec proposed
  `id IN (SELECT id …)`, and measurement showed the planner's OUTER lookup degrades to a sequential
  scan as the batch grows or the table shrinks — 160 ms over 499 k rows at batch 10,000, and
  **10.8× slower on the smaller table** — so the delete became O(table), the one property a batched
  delete exists to guarantee. `ctid` is always a Tid Scan; batch 1,000 (5.6 / 3.8 ms), interval
  1 hour (the idle batch measures **0.03 ms**), cap 50,000. No schema change, confirmed rather than
  assumed, so the conditional database-architect task did not open.
  **M3 is the first user-facing milestone and names its entry point** (ADR-0081): a **Retention**
  section on `/staff`, on the existing `GET /staff/health` response rather than a route of its own —
  a second route earns a census entry and writes a second `staff.panel_read` row on every page load,
  buying a tidier DTO name with a noisier audit log. Its leading answer is **derived from the data,
  not reported by the sweep**: `RetentionStatusStore` is in memory and resets on restart, so a
  last-run timestamp cannot separate "the sweep is working" from "the sweep never armed" — the same
  inverted signal `HeartbeatService` exists to solve one layer out — while the age of the oldest
  surviving row is true of the database on a replica that has this instant booted. The section keeps
  three pairs apart that a careless sentence collapses (empty table vs. oldest-row-is-new,
  has-not-swept vs. swept-and-deleted-nothing, disabled vs. idle), and **disabled shows no last-run
  time at all**, because a timestamp beside "disabled" reads as health. There is **no `VITE_` flag**:
  the staff console has none, and the real rollback is server-side, which a build-time constant
  structurally cannot gate (the ADR-0060 M0 / ADR-0074 rule). **M4** alerts after **three**
  consecutive failed runs — one is not news, because the next tick is the retry, and a channel that
  cries wolf gets muted (ADR-0075) — through a `postAlert` extracted **verbatim** from
  `OperationalAlertService` as a **function**, not the injected service the plan named, so that
  service's constructor never changed and `operational-alert.service.spec.ts` stayed the
  before/after oracle with every assertion intact (the ADR-0078 barrel-preserving argument). Its
  docblock states what it **cannot** detect — a sweep that never armed — and points at the panel's
  derived `overdue` as the primary detector. The threshold test found a real defect rather than
  confirming one: a sweep that **threw** called `record([], at)`, which finds no failed table and
  therefore **reset** the counter, so a sweep crashing on every tick was filed as a clean run —
  silencing the alert and painting the console healthy during the one failure mode nobody
  anticipated.

- **ADR-0085** _(Accepted; decision only — nothing is built)_ — Erasure collides with the audit log,
  and that collision is the decision. `docs/BACKLOG.md` carried "Privacy operations" as an `M`
  sized as work — "a hard-delete path and a data-export path". It is not work yet; it is a genuine
  conflict, and picking it up as a ticket means resolving that conflict by whichever half the
  implementer opened first. **`audit_events` refuses `UPDATE` and `DELETE` in the database**, by
  `BEFORE UPDATE OR DELETE` / `BEFORE TRUNCATE` triggers declared `ENABLE ALWAYS` so the application
  role cannot bypass them — and it deliberately holds the address a failed sign-in named
  (ADR-0073 C2 keeps the caller's own casing). A right-to-erasure request therefore meets a
  guarantee this product made on purpose, three ADRs ago, at the strongest layer available. So
  erasure is **anonymisation of the actor** — the `users` row is tombstoned, the unique index is
  preserved by a non-routable address, and all **54** attribution columns keep pointing at the same
  id — never deletion of the record. **Relaxing the triggers is rejected**: it converts a
  _structural_ guarantee into a _procedural_ one, changing the answer to "could these rows have been
  altered?" from "not by the application role" to "only by the erasure path, which we believe was
  used correctly". Reading the schema first also found what a plan written from the backlog line
  would have missed — `invitations` holds addresses for people who **never became users**, the
  clearest-cut case in the system and the one case that IS a hard delete. The `auth.*`
  `subject_label` is bounded by **retention** rather than per-subject deletion (a rule applied to all
  rows alike cannot be aimed), with the period left unset because it is a legal question and
  inventing a number would be ADR-0076 Class 3. Export is **organisation-scoped** first, not
  subject-scoped: a subject export here is a name, an email and a list of ids, which tells its reader
  almost nothing. **Build trigger named** — the first organisation outside the product owner's own,
  or a real subject request — because an unconditioned `M` stays exactly one priority below whatever
  is being done.

- **ADR-0106** _(Accepted; M0–M4 landed 2026-08-22)_ — A rule is a scene mark; its label is
  chrome. The TSLD painted three date marks — the cursor readout, `Today` and `Data date` — as pills
  at a **fixed screen y** on the scene canvas, so a label printed over whichever lane the planner had
  panned to the top; at 1646 on the flagship plan the words `Data date` print across the first
  activity's name. What makes it an ADR rather than a constant is what the code was careful about:
  each row constant was **derived** from the row above with a docblock about not "silently
  reintroducing the collision", and `paint.test.ts` asserted both derivations — **and both guards
  asked whether the pills collided with EACH OTHER. Nothing ever asked what was underneath them.**
  The labels move into the existing 40 px ruler as DOM, on two rows (transient y 12–26, persistent
  26–40); the rules stay on the canvas, because a full-height vertical means something at every lane
  and a date label means nothing at any of them. `RULER_HEIGHT` and `sceneTopOffset` are untouched,
  so the diagram gains no chrome and loses none.
  **Checking the register row changed the work three times.** Its table and its title describe ONE
  pan position (`fitToContent` pins `originY = 32`, `pan()` is unclamped), so "the first two lanes"
  is one frame of a continuum and any criterion has to hold for an arbitrary `originY`; the pills
  were **already chrome** by behaviour, so `screenYOfLane`'s many consumers were never in the blast
  radius the row's deferral paragraph feared — which is why it sat for two days; and the **export
  never carried the defect at all** (`drawTitleBand` fills the top 96 px opaquely, so these pills
  have never reached a PNG), which turns parity into a structural claim and files the real question
  with #164/#166/#167.
  **The row geometry is an output of measurement, not a spec constant.** The design pass proposed y
  4–20 / 22–38; photographed occupancy put the band's rows at 0–12 / 12–26 / 25–39, so those would
  have covered the year label — pinned at x = 0, one per view, the only ruler content a reader
  cannot reconstruct from a neighbour — and a left-clamped marker is the **common** case, since
  `fitToContent` frames from the plan start. The rejected fallback (extend `dropOverprintedSticky`
  to suppress a sticky label a marker overprints) trades the harder problem for the easier one.
  **On overlap `Data date` keeps its word and `Today` loses its**, on numbers rather than taste: the
  two collide within 0.5 days at Day, 1.1 at Week, 3.4 at Month, 13.5 at Quarter and 40.5 at Year, so
  the escalation trigger written before the measurement does not fire — and the accepted cost is
  stated, that at the two overview presets the word is often withheld, where the marks are one
  position anyway and Today keeps a dashed rule that is a channel in its own right.
  **The two guards are replaced by two that look outward**: a unit case pinning both rows inside the
  band and clear of the year row, and a browser case asserting no visible marker's rect intersects
  the scene canvas's — at two pan positions, two presets, and with and without the pen, alongside "at
  least one marker is visible" so a green run cannot mean there are none. The second **could not have
  been written before**: it is a question about two elements in a real layout and jsdom has none, so
  the old guards were the strongest thing a unit test could say and were about the wrong subject for
  a year. The golden oracle's first re-baseline since ADR-0078 S1 was audited line by line against a
  written list rather than taken with `-u` — exactly the 16 pill lines and two totals, nothing added,
  re-verified red. **The CPM engine is not imported and no migration runs.** Six things were
  corrected on the way, each by running something rather than reading: a stale typeface risk note
  inherited from ADR-0097 (the product HAS decided one — Space Grotesk — which also exposes
  TECH_DEBT #173, that the canvas painter alone does not use it); a measurement harness that measured
  the **bars**, caught by its own control; the same harness then finding **nothing at all** because
  it scanned each pill's text baseline row; a journey label that was wrong about which audience it
  covered (`recalculate()` ends in a reload, which drops the pen); a 1.5:1 contrast floor between the
  two fills drafted and withdrawn on measurement at 1.48:1, with the reason written down; and a
  `leading-[14px]` that tripped the sizing ratchet.
  **The M4 gate pass found a seventh, and all three blocking reviews reached it separately.** The
  transient readout shipped painted with `bg-card`/`text-card-foreground` — ADR-0097 **resets**,
  absent from the canvas rebind, so they resolve the page's white card at **1.13:1** against the
  ruler ground, under a docblock claiming it used the bar colour (which the old chip did). That is
  `docs/TECH_DEBT.md` #162 repeated one file over four days later, in the one treatment of three
  the epic's own new contrast block did not cover — the shape the ADR quotes about the guards it
  deletes, occurring inside it. A second finding was **answered rather than fixed**, and the answer
  is better than the proposed remedy: the transient row can cover the ruler's sticky month label,
  and biasing its clamp would move the readout off the guideline it names, whereas
  `formatCanvasDate` renders `D MMM` so **the covering label carries the covered fact** — now a
  test rather than a paragraph. The pass also found a defect in a **gate**:
  `reset-fills.structural.test.ts` scanned raw text, so the docblock explaining why this treatment
  must not use `bg-card` counted as using it — the fourth scan-matching-prose in this repository,
  whose sibling had already fixed itself the same way. Five non-blocking findings are #174.

- **ADR-0107** _(Accepted; M0–M6 landed 2026-08-23)_ — A migration a pristine database cannot
  test. Better Auth 1.7 scopes account identity by an `issuer` column — `TEXT NOT NULL`, no default,
  `UNIQUE (issuer, accountId)`, read by the sign-in predicate — and the library had been pinned
  `~1.6.28` in both workspaces specifically to stop it arriving unattended. Measured first: at 1.7
  **without** the column, `scripts/e2e-local.sh api` fails **522 of 559** tests across 37 of 42 files.
  **The decision worth recording is not "add a column" but what to do when the failure mode is a
  property of the data and every automatic gate runs against data that cannot exhibit it.**
  `prisma migrate diff` generates one `ADD COLUMN "issuer" TEXT NOT NULL`, which **succeeds on an
  empty table and fails on a populated one** — so CI, which provisions a pristine container, goes
  green on `migrate deploy`, the drift check and all 565 tests, while the failure lands on the
  deployed host inside `docker-entrypoint.sh` under `set -e` (ADR-0018), where the first run leaves
  `P3018` and **every retry reports `P3009` forever**: a restart loop needing
  `prisma migrate resolve --rolled-back`, on a host that auto-pulls releases (ADR-0047) with nobody
  watching. Both halves verified against a real database rather than reasoned about.
  So five ordered steps, and **the ordering is load-bearing twice**: the `DEFAULT` lands **after**
  the backfill (in step 1 it would silently give a non-credential row the credential issuer; after
  step 3 the guard is free to abort loudly), and the repair lands **first**, so a row it fixes is a
  row the unique index no longer refuses. **The `DEFAULT` exists for the rollback, not the library** —
  1.7 always writes the value explicitly, and without a default the stated rollback (redeploy the
  previous image) **fails**, because a pre-1.7 image writes no `issuer` and its sign-up dies against a
  `NOT NULL` column: a rollback causing a worse outage than the fault. The design and the spec had
  written those two halves independently and neither noticed the other until they were read side by
  side. It was then **demonstrated by a gate run for another reason**: the e2e suite runs at 1.6.28
  against the migrated schema, and the account row it created through the real sign-up path read
  `issuer = local:credential` — a value 1.6.28 never writes — with `account_id = user_id`, the premise
  the repair rests on, observed in the product rather than read off `sign-up.mjs`. The suite's
  pass/fail said nothing about either.
  **1.7's predicate gained TWO new conjuncts, not one**, and no `issuer` backfill helps the second:
  1.6.28 matches `providerId === "credential"` alone, 1.7.1 also requires
  `issuer === credentialIssuer && accountId === userRecord.user.id`. A row failing the third answers
  `INVALID_EMAIL_OR_PASSWORD` — the user is told their password is wrong — and reset-password then
  takes the **create** branch and writes a second credential row, so the product appears to heal
  itself while the data goes wrong. The product owner chose to repair those rows with the deployed
  table deliberately unmeasured.
  **The guard on that repair is where this ADR is most worth reading, because the first one was wrong
  in two ways at once and both were found by re-reading the finished file rather than by anything
  failing.** It refused to repair a row when a correct one already existed, on the stated grounds that
  repairing it would create the duplicate step 5 refuses — and **that reason was false** (a correct
  row and a stale row carry different `account_id`s, so they are not a unique violation at all), with
  the false half written into the migration's comment **and** a test name, the test passing throughout
  because it asserted the right rows for a reason that was not true. Meanwhile it **missed the shape
  that actually breaks**: a user with two _wrong_ rows has no correct row, so neither was excluded,
  both were repaired to the same `account_id`, the index refused the duplicate and the whole migration
  aborted — the restart loop above, caused by the repair meant to help, reproduced against Postgres
  before anything changed. The shipped guard is a **count** (repair only where the user has exactly
  one credential row, which cannot collide because there is nothing to collide with); two wrong rows
  leave that user locked out, which is where they already were, because a migration has no basis for
  choosing which row is theirs.
  Two releases, so the halves fail separately. The test **reads the SQL from the shipped migration
  file**, never restated, and each of its six cases was **verified red against the specific defect it
  guards** — with two blind spots recorded in the file rather than left implicit, since two cases pass
  equally against the wrong thing and their discriminator is a sibling case.
  **Both workspaces take the bump, and the reason is not the bundle.** `apps/api` was bumped first
  with `apps/web` left behind, and `pnpm check:claims` then reported **52 claims OK against
  `better-auth@1.6.28`** while the API loaded 1.7.1 — green, against a version the application no
  longer ran, which is `docs/TECH_DEBT.md` #178's stated "dangerous direction, the quiet one",
  observed live. It is structural: the resolver takes the **first** matching store directory and
  `verifiedAgainst` holds **one version per package**, so a split estate leaves the claims register
  unable to describe the code that ships, whichever way it is set. The bundle falsification condition
  was measured anyway — **+74 bytes gzip** against a 5,120 threshold — so the two arguments agreed and
  there was nothing to escalate. #178 is **worked around, not closed** (the workaround is "only ever
  install one version of a cited package", which held only because the split was ours to remove), and
  **#181 is filed here**: a `ref` is `basename:lines` and carries no version, so a citation into 1.7.1
  at a line coinciding with a registered 1.6.28 one **passed the gate** and read as re-read evidence.
  Fixing either is a shared-gate change and fires ADR-0105's trigger, so neither was smuggled into a
  dependency bump. **The CPM engine is not imported and the ADR-0034 parity gate is untouched** — in
  its honest form: there is nothing here to hold parity for.

- **ADR-0108** _(Accepted; M0–M5 landed 2026-08-23)_ — A modal guards the canvas and nothing else.
  `apps/web` had **no `beforeunload` handler and no router blocker anywhere** — zero matches for
  either — so a planner with unsaved activity edits could reload or close the tab and lose them with
  no prompt and no record. The backlog had carried this for months with a justification that had
  **gone stale**: it blamed the Graphite drawer for making it easier to hit, and ADR-0101 had
  reversed that two days earlier (the editor returned to `modalShell`; `registerDrawerSubject` has
  zero production callers, TECH_DEBT #156). The gap was real; the stated reason was not, and was
  corrected before any code was written.
  **The unit is a report of scopes, not a boolean**, because ADR-0060 saves per **write scope**: an
  `isDirty` flag cannot name what is at risk, and cannot separate work that could still be saved from
  work that cannot. `savable` carries the product owner's decision that a pen taken mid-edit is
  **warned about anyway** — the work is unsaved and unsavable, and letting it go silently reads as
  the application discarding an edit rather than the lock being taken.
  **It fixed a live defect before adding any capability.** `dirtyScopeNames` named **three** scopes
  and the editor holds **six** — the three Progress panels each own a form — and `requestClose`
  returns `onClose()` outright when that array is empty, so a changed weighted step closed **in
  silence**. That is TECH_DEBT #63's second half, now closed.
  **The trap that would have shipped it broken was measured, not reasoned about**: `@tanstack/history`'s
  unload path (`dist/esm/index.js:247-257`) **never calls `shouldBlockFn`** — it reads
  `enableBeforeUnload ?? true` and treats `true` as block. Registered with the default it prompts on
  **every reload of every page**, including a clean one, while the in-app half behaves perfectly and
  every unit test stays green. Both callbacks must also be referentially stable or the blocker
  re-registers per render: inline arrows measured **6 registrations against 1**.
  **Registration tokens are minted by the hook** (`useId`), never supplied by the caller, or two
  mounts of one component share an entry and the first to unmount deletes the survivor's — a guard
  that silently stops guarding. Both naive designs were verified red against **different** tests.
  **Scope is four surfaces, on a measured inventory** — 25 components, 32 RHF instances, and exactly
  **one** holding user input outside react-hook-form: `CalendarFormDialog`'s working week, which
  lives in `useState` on purpose and is therefore **invisible to `formState.isDirty`**. It registers
  on an explicit value comparison, pinned by a test verified red against registering on `isDirty`
  alone — the refactor a later reader would think reasonable. `ActivityCreateDialog` had no guard of
  any kind, around twenty fields across four scope forms.
  **What a modal actually guards is stated because the backlog implied otherwise**: the editor is a
  modal `<dialog>` in the browser's **top layer**, so it intercepts clicks behind it and an in-app
  link was never reachable while it was open — for a test or a planner. The guard's value is reload,
  tab close and browser navigation. **One channel is recorded as open rather than claimed**: a
  browser Back does not reach the blocker in this app, established by instrumenting
  (`shouldBlockFn` **never called**, guard mounted, URL unchanged).
  **The census gate caught itself on its first run**, which is the most transferable part. Its
  "nothing is unclassified" assertion passed perfectly — because the glob matched **zero files**, so
  there was nothing to be unclassified; the **pinned positive case** is what failed. That is the
  ADR-0093 lesson (a green suite that cannot tell "all classified" from "found nothing") landing on
  this epic's own gate. **The CPM engine is not imported and no migration runs.**

- **ADR-0109** _(Accepted; M1–M5 landed 2026-08-24)_ — A command surface wraps, and the leading
  edge belongs to the work. Four consecutive epics (ADR-0090/0091/0092/0094) worked this product's
  command surface and a fifth (ADR-0099) rebuilt the shell around it; each asked _does the row
  fit?_ and each answered by shaving something. The product owner's verdict after all five was that
  it still looked poor, and their complaints were specific: the overflow menu was not what had been
  agreed, all commands should be visible when there is room, and the colour scheme "was working in
  the old SchedulePoint repo but somehow doesn't here". They then **set the rulebook aside for one
  epic** — recorded in `docs/specs/workspace-redesign/README.md` with an explicit obligation to
  rewrite the standards afterwards, which this ADR and the pass beside it discharge.
  **The diagnosis came from reading the old Flask app rather than describing it from memory, and it
  inverted both halves.** That app's toolbar **wrapped** — `flex-wrap` over five labelled group
  cards holding fifteen buttons — so it never needed an overflow. The premise all four command
  epics tuned, that a command surface must stay one row tall, was **never a requirement anybody had
  stated**; it was inherited, and the `ResizeObserver`, the width cache, the priority ranking, the
  band floors, the hysteresis and the `⋯` were all consequences of it. And the palette was never
  wrong: `--chrome` has held `#14213D` since ADR-0102 and `--chrome-primary` its `#FCA311`. What was
  missing were **surfaces** — `chrome-band.tsx` was the shell's only chrome surface and it was a
  flat `border-b` bar with the page's white running edge to edge above and below it.
  **D1: a command surface wraps; it never hides.** ~1550 lines deleted — `toolbar-ladder.ts`,
  `ToolbarOverflow.tsx`, the `e2e-toolbar-fit` journey with its config and CI step, and the
  measuring machinery inside `Toolbar`. The gate goes **with** the ladder rather than staying green:
  a gate whose subject no longer exists does not become a safety net by continuing to pass, it
  becomes a claim that something is checked when nothing is. The cost is stated rather than glossed
  — a surface that wraps has a height that is a function of its width. **D2: the leading edge
  belongs to the work.** The 48 px tool rail is deleted and the Explorer docked, resizable 200–420
  and folding to a 34 px spine; the rail's four jobs return to a header row that renders at every
  width again. It is a **reversal whose premise changed underneath it**: ADR-0099 D2's argument was
  "one panel, two subjects", and ADR-0101 left the other subject with no production registrant at
  all (TECH_DEBT #156), so it had quietly become one subject reached through a switcher. **D3:
  Recalculate is attached to the condition it answers** — auto-recalculation has fired on every
  structural edit since ADR-0032 M3, so on a healthy plan that command re-ran a calculation that had
  already run. **D4: the diagram is ruled both ways and its ground is quiet** — the weekend hatch
  goes, the month band defaults off (its switch stays), lane hairlines arrive, derived from the
  **viewport** so the layer is O(visible lanes) and never O(plan). **D5: no flag** (ADR-0088 D1 — a
  `VITE_` constant is inlined at build time and has never been an operator rollback).
  **Two of the plan's own tasks described work that was already shipped** — arrowheads have been
  filled and batched since ADR-0065, the criticality ladder gated at 1.5:1 since ADR-0097 Landing E
  — recorded rather than re-implemented, the fourth time §19's re-verify-the-problem rule has paid.
  **And the estate sweep earned its keep three times over.** It found a real accessibility defect I
  had introduced: the status bar's Recalculate carried its `sr-only` reason INSIDE the button, so
  the linked text was concatenated into the **name** as well as the description and the control
  announced itself as "Recalculate Start editing to" — `ToolbarButton` avoids this with one line I
  had not copied, and the unit case could not catch it because it asked for `{ name: /Recalculate/ }`,
  which a polluted name still matches. It found that six `e2e-gantt-editing` specs had been using an
  unconditional Recalculate press as a **cache-invalidation lever** after seeding through the API —
  a reliance nobody had written down, which a conditional control silently removes. And it found a
  journey leaning on a lever that should not exist: `e2e-programme` pressed Recalculate on an
  unedited plan to move ADR-0045's pull-staleness, where the honest act is an edit. **The CPM
  engine, the REST API and the database are untouched** — `apps/web` only, which is what makes the
  whole redesign revertible.

- **ADR-0110** _(Accepted; M0–M4 landed 2026-08-25)_ — A gate is verified against the defect it
  names. Three complaints against `web-v0.103.0` — the header sits on two rows and must fit on one,
  the activities panel and the status bar look combinable, the toolbar's label heights differ and
  draw the eye. What the epic turned out to be about is narrower and more useful than any of them:
  **four separate times, something that looked like evidence was not.** Twice it was my own
  instrument, once a feature that passed every test while being visibly broken, once a gate written
  that day and blind to the exact defect it cited as its reason for existing.
  **D1: the plan's facts have two hosts and a mandatory fallback.** The workspace foot carried two
  bands and both said "Activities" — the row's heading and the status bar's activity count, one
  subject rendered twice. The count now names the panel and gives its size, and the canvas gains
  ~25 px wherever that row exists. Where the facts render is decided by a **registry rather than a
  branch** (outlet + in-place fallback, the `CanvasDockProvider` shape), because below `md` the
  activities bar **is not mounted at all** — measured, not inferred — so a literal merge would have
  deleted the plan's facts on exactly the screens with least room to lose them, which is ADR-0081's
  defect shipped green. ADR-0092's 0 px dock guarantee survives, re-measured with the facts present.
  **D2: one geometry on the command deck.** A plain command stacked its label under its icon while a
  split-button or popover trigger kept it beside; nobody chose that — `Deck.tsx` applied the stacked
  geometry on the `ToolbarButton` branch only and every `render`-branch item bypassed it. One `if`
  with a side effect on layout. All 27 controls are inline; worst within-row label spread **12 → 3
  px**, deck height **116 → 108** at 1920/1646/1440 and **116 → 224 at 1280**, the last put to the
  product owner with the number and accepted knowingly. **`docs/TECH_DEBT.md` #185 is answered and
  was wrong about the size of its own prize**: it calls un-stacking "the single biggest term in the
  height" and it is worth **8 px** — the 116 px was a **wrapping** cost, since 2089 px of items fit
  exactly two lines at every width from 1280 to 1920.
  **D3: M3 is withdrawn on its own falsification condition.** The one-row header was the firmest of
  the three requirements ("this needs to fit on one line without question") and it does not fit: at
  1440 in the worst pen state the merged row is **536 px short** against a written +120 px bar,
  because the pen sentence reaches 432 px where an Org Admin views a plan someone else holds — and
  in eight of ten lock states that sentence is the only thing naming who holds it. **Fourth costing,
  third withdrawal**; the difference is that the condition was written before the measurement and
  the number is on the page. **The complaint is therefore unfixed, and that is stated rather than
  implied.**
  **D4: a collapse that collapses the thing it is collapsing is not a collapse.** Tailwind's
  `@container` applies `contain: inline-size`, so the facts — an auto-width `shrink-0` flex item —
  **collapsed to 24 × 48 px** with all five present in the DOM and overflowing. Every gate passed:
  the unit suites run in jsdom, which has no layout; `factsText` still read the whole sentence; and
  SC-5's 0 px dock equality passed **because the broken facts were taking no width** — a gate
  satisfied by the thing it protects being broken. Withdrawn rather than repaired, because the query
  asked the wrong question: what decides whether the facts should shed labels is whether the **row**
  is tight, which is known at the row.
  **D5 is the title.** M1 restored the WCAG 2.5.8 target-size sweep ADR-0109 D1 deleted along with
  the width ladder it tested — correctly deleted, but it was the **only** automated cover 2.5.8 had
  (`#186`), and axe cannot replace it (`target-size` is tagged `wcag22aa` while every scan here
  requests `wcag2a`/`wcag2aa`, **and** the rule ships `enabled: false`). The replacement was written
  with both of ADR-0090 M5's recorded traps in mind and **still could not see a split button's
  caret** — the exact control class it exists to protect, and the one ADR-0090 records shipping at
  23 × 36 under a previous gate that was also sweeping the wrong element and also reporting green.
  `ToolbarSplitButton` spreads `data-toolbar-item` onto the **primary** button; the caret is its
  **sibling** with no such attribute, so the descent to a focusable control never ran, under a
  docblock claiming "a split button contributes both halves". So: **a gate is not finished when it
  passes; it is finished when it has been made to fail by the defect it was written for.** The sweep
  now enumerates every pointer target in the deck in one pass and was verified red at 12 × 36 naming
  all three carets. Closing `#186` with a blind sweep would have been worse than leaving it open,
  because a green gate stops anyone looking.
  **D6: the ADR index is gated, not remembered.** ADR-0078 S1 found seven ADRs missing from
  `docs/adr/README.md` and repaired them by hand; writing this one found ADR-0109 missing again,
  because `check-adr-coverage.mjs` validates coverage and never read the index. It now checks both
  directions. **The CPM engine is not imported and no migration runs.**

- **ADR-0111** _(Accepted; 2026-08-26)_ — A shared primitive's keyboard contract is reviewed
  before release, not after. Twice in two days a change to a primitive's keyboard model passed
  every automated gate, a human read and a real-browser journey, and was wrong — the second time
  **inside the fix for the first**, and already released. `#189`: `Deck` vetoed all six navigation
  keys for any form field, which is correct for a `<textarea>` and left **18 of 27 commands with no
  keyboard route** for its single-line search input (WCAG 2.2 §2.1.1, level A), because focusing
  that field also makes it the roving stop and the deck's only Tab entry point. Not a keyboard
  **trap**, so nothing looking for traps saw it: focus was never stuck, only the commands were
  unreachable. `#192`: the fix narrowed the veto by `tagName` alone and broke the shipped
  `Go to date` field, whose `<input type="date">` steps its segment with the vertical arrows —
  **worse than the defect it replaced**, since it destroyed an interaction already open rather than
  failing to leave one.
  **The decision is deliberately not a gate, and owes the argument because ADR-0058 says prefer
  one.** Every defect in this class is a statement about what a real browser does with a real focus
  ring — a single-line input ignoring the vertical arrows and a date input not, a modal's top layer
  swallowing a portalled menu, `preventDefault` without `stopPropagation` still reaching an ancestor
  through the React tree. jsdom has no layout, no top layer and no focus ring, so the unit tier
  **structurally cannot ask**; a journey can, but only about a path somebody thought to drive, and
  nobody writes one for "press ArrowUp in the date field" before suspecting it. A gate can be built
  for any **known** rule — `#192`'s tests are exactly that — but not for the next one, which is
  every instance so far. So: the weak instrument (§19.11), labelled as one, and cheap — two agent
  runs against a diff, minutes, **before** a release rather than after. Its honest failure mode is
  named in its own Consequences: a rule whose trigger is "I am about to change a primitive's
  keyboard model" depends on noticing that that is what you are doing, which is precisely what did
  not happen between `#189` and `#192`. **The CPM engine is not imported and no migration runs.**

- **ADR-0112** _(Accepted; M1–M5 landed 2026-08-26)_ — A header row wraps, and a pen sentence is a
  fact. The product owner's firmest complaint against `web-v0.103.0` — _"the header being split over
  two rows … needs to fit on one line without question"_ — costed four times and withdrawn three,
  always on a number. So the epic's first act was to **repair the instrument** and its second to
  write the falsification condition down before running it. `inkOf` summed **leaf rectangles**, which
  never counts a button's own padding, and the composed row it fed understated the merge by
  **266 px** — more than twice the +120 px bar the decision turned on. Measured by a shrink-to-fit
  probe that composes the real occupant nodes, the merge needs **1482 px** against containers of
  1222/1382/1588/1862, so only 1920 cleared the bar and **1646 missed it by 14 px**. The instrument
  is credible because it was pointed at something already known: today's identity row needs **1218
  against 1222** — four pixels, which is exactly what shipped, truncating any real plan name.
  **D1** moves the pen's **sentence** to the plan's facts row and keeps its badge and every ADR-0028
  hand-off control beside the plan — ADR-0093's discriminator applied to a model rather than to a
  command, worth 155 px and closing a live truncation. `containerRef` stays on the controls, because
  attached to the moved sentence its focus-return and `scrollIntoView` both fire against the status
  bar and **a test asserting only "focus is not on `<body>`" passes against that**. **Its cost is
  recorded rather than glossed**: `UX_STANDARDS.md` says a control belongs beside the condition it
  answers, and for six of ten lock states the two are now at opposite ends of the screen. Put to the
  product owner with the width consequence (reverting needs ~1749 px against a 1588 container), the
  decision was to ship and revisit **from use rather than from review**; three alternatives were
  costed and declined. **D4** is the header row itself: asked where a _wrapping_ row breaks on its
  own, the answer is a container of **1480 px** — one line at 1646 and 1920, two at 1440 and 1280,
  which is the approved threshold exactly with **no constant to maintain**, and it disposes of
  Tailwind's `2xl` being four pixels short. `flex-1` on the identity slot defeats it entirely.
  Measured: `aboveCanvas` **295 → 250** at 1646, canvas **483 → 528 (+9.3 %)**, no width regressing —
  and the 45 px comes out of the **command band**, not the header, so ADR-0092 M4's "relocating a row
  inside one column removes nothing" did not happen here.
  **Three of the epic's own claims were false and none was caught by reading.** A comment called one
  line "the single line the one-row header turns on"; the journey was run against that line restored
  to its broken form and **passed**, which is how the real load-bearing line was found one level up.
  `TestChromeHost`'s docblock had claimed since Graphite M7 that a gate pinned every
  `ChromeSlotName`, and **nothing referenced that type from a test at all** — adding `identity`
  produced exactly the silent gap it promises to prevent. And an `sr-only` badge copy added out of
  caution announced twice on focus return, found by `e2e-edit` going red on an ambiguous locator.
  Two more instrument defects in the same probe (labels outliving their DOM; a composed row
  double-counting once a real one existed, returning a figure four pixels from the truth by luck),
  and `scripts/e2e-sweep.sh` — the thing that exists because a search is scoped by what you
  remember — was itself wrong in both directions, naming a deleted suite and omitting **seven**,
  including the one measuring WCAG 2.5.8. Its list is derived now. Accessibility passed with nothing
  blocking, having worked the flex-wrap arithmetic by hand. No `VITE_` flag (ADR-0088 D1). **The CPM
  engine is not imported and no migration runs.**

- **ADR-0113** _(Accepted; landed 2026-08-26)_ — Measure the problem, not just the remedy. The
  product owner asked to maximise the canvas and brought four ideas: default the activities panel
  collapsed, re-section the header, fold the command deck onto one line by moving Author to the
  canvas foot, and trim the armed-tool tips. They were ranked by estimate — the panel first at
  ~205 px, the deck second at 58 px, the header third at nothing — and **that ranking was wrong at
  the top and the bottom**. Two of the four did not exist as work.
  **The panel already defaults collapsed** (`useState(true)`, session-local, only its height
  persisted). It was ranked the biggest lever from a screenshot in which the product owner had
  expanded it — and **two of the three screenshots they sent show it collapsed**. Expanding costs a
  measured **265 px**, constant at both widths, which is a planner's choice. **There is no hidden
  space below the canvas either**: in the default state the pane reaches the viewport bottom, and at
  1920 the chrome above is **209 px** against a **776 px canvas — 72 % of the screen**. The ~283 px
  suspected below it was the panel, because the vertical harness expands it to measure — **which is
  also why ADR-0112's headline "+9.3 %" described a state the product never starts in**; the 45 px
  delta was measured correctly and the denominator was the expanded canvas, so the honest figure is
  **+6.0 %**, and both are now given with the state named.
  **The one-line deck is withdrawn on measurement, not deferred.** It needed Author to leave the
  command band, and the canvas foot cannot hold it: that row is ADR-0092's dock, whose region is
  924 px at 1920 and **650 px at 1646** against Author's **608** — 42 px left, less than the shortest
  transient strip, so arming a tool or selecting an activity would grow the row to two lines
  (`min-h-9`, not `h-9`). All four cards on one line need 2618 px against 1862. **The route named for
  finding the width was the wrong component**: ADR-0090 M2-T6's caption gutters were **row** captions
  in the two-row `Toolbar` that ADR-0109 D1 deleted, while the deck's captions are focusable
  disclosure buttons that fold their group and hold roving tab stops — a register entry cited from
  memory and told to the product owner as owed work, which is ADR-0076 Class 2 inside a
  recommendation rather than a document.
  **What shipped** is the header in **three sections** on `justify-between` — 582 / 620 / 256 px of
  content, so the gaps are 202 px at 1920 and 65 at 1646 and nothing truncates above a 1458 container
  — and armed-tool statements that keep their mode word and their `Esc` and drop the explanation,
  while **keeping two clauses against the brief** (`or click for a day`, `Ctrl to add`) because their
  own comments record them as undocumented shortcuts rather than explanations. **True centring was
  rejected on measurement**: it caps the outer sections at equal shares, so section 1 gets 472 px
  against the 582 it needs at 1646 — **110 px of the plan name**, against an estimate of ~10 that had
  been put to the product owner. The accepted cost is written down: on a **wrapped** line
  `justify-between` places a lone item at flex-start, and no CSS has both, since `ml-auto` restores
  the crammed look on a full line.
  Every previous instance of this register's _verify the claim_ rule is a document describing the code
  wrongly. This one is different: **the problem statement came from a person looking at their own
  screen, and it was still stale — because the state they were looking at was one they had put the
  product into.** **The CPM engine is not imported and no migration runs.**

- **ADR-0114** _(Accepted; M0–M7 landed 2026-08-27)_ — A row that cannot shrink is never asked to
  wrap. The product owner sent four screenshots of `web-v0.108.0` and called the foot **juggling**:
  the plan's facts and the object-action bar swapped sides every time the activities panel opened.
  Measuring first found what no screenshot showed and nobody had reported — the bar was not moving,
  it was **clipped**. `Clear visual placement` was already off-screen on the 24" monitor and `Edit`,
  `Duplicate` and `Delete` were pointer-unreachable at 1646; content measured **1753 px at both
  widths**, so the row neither wrapped nor scrolled. **Both mechanisms that should have prevented it
  were live and neither could reach the other**: `Toolbar` wraps unconditionally, the dock outlet is
  `flex min-w-0 flex-1 flex-wrap`, and the bar between them carried `shrink-0` — which takes
  `max-content` and never shrinks, so the outlet's width was never imposed on it and the wrapping
  toolbar inside was never asked to break a line. The workspace body's `overflow-hidden` took the
  surplus silently. **And the obvious explanation for why it went unreported is one this epic's own
  measurement disproved**: focusing a clipped control moves its rect by **zero**, because the clip is
  an ancestor's `overflow-hidden` with nothing scrollable to move, so "keyboard-reachable" was never
  true. It shipped because nothing LOOKED wrong — a control that is not painted looks exactly like a
  control that does not exist. One word (`shrink-0` → `min-w-0`) fixed it, shipped **first and
  alone**, with an `elementFromPoint` sweep verified red naming all four controls. It costs ADR-0092
  its **0 px equality**, stated rather than absorbed: that guarantee held only because the bar could
  not wrap, i.e. it was being paid for by hiding controls.
  **The rest is the juggle removed at its cause rather than tuned.** One `PlanActivitiesFootRow`
  renders in **both** states with the **facts leading** — the spec's first draft had them the other
  way, which would have slid the facts sideways on every selection, the same juggle one axis over. A
  mode statement is withheld **per kind** where the armed trigger already says the word (three of
  six), amending ADR-0064, which was right about reserved chrome and never costed the 410 px it takes.
  The pen's sentence keeps its live region and stops painting, with the holder's name on the pill. The
  dock shows **at most one** transient strip.
  **The measurements contradicted the plan twice, in opposite directions.** Freeing 164 px bought
  **zero** height — a wrapping row breaks between **items**, not by total width — the sixth
  consecutive width expectation on this surface contradicted by its own measurement, and the first
  where the arithmetic was right and the **model** was wrong. Then one 46 px rename bought a line at
  **both** widths (41 px at 1920, 77 at 1646; canvas **+36 / +40**), the 1646 result unpredicted. The
  deck's card geometry then cost that line straight back — its `px-2` consumed exactly the 15 px of
  margin left — so the shared variant carries background and radius only. Two qualifications are
  recorded rather than smoothed: the 1920 margin is 15 px, and every figure is the row's **narrowest**
  state. The two largest savings were **declined by the product owner** as a different epic: folding
  four editor doors into one `Edit ▾` (226 px) and the IA critique behind it.
  **The gate pass blocked on eight defects, two of them reached independently by two reviewers.** The
  largest is this epic's own correct rule applied one milestone late: `hostsDock` exists because an
  outlet inside a `display: none` pane portals its contents where nobody can reach them, and M4 added
  `PlanFactsOutlet` to the same row **ungated**, forty lines below that docblock — so below `md` the
  plan's facts, its schedule state, its only `Recalculate` and the pen's `role="status"` region all
  vanished, while three docblocks said they moved to the shell. jsdom could not see it (no layout,
  `useMediaQuery` defaults wide); the journey now needs one `setViewportSize` call. Second, the new
  `Deck` fold-guard reads `isActive` and **Add and Link never published it** — Add's lived in the
  flag-OFF arm of a ternary — so the guard protected the one tool whose statement this epic KEPT and
  neither it withdrew, and `Deck.test.tsx` could not see it because its fixture is a shape the real
  registry does not contain: ADR-0081 **with the test as the concealer**. Third, D4's accounting
  stopped at the `locked` tone, leaving a planner whose pen was taken with a changed badge, a bare
  Dismiss and no words. Fourth, the shortcuts sheet the spec named as the mitigation for withdrawing
  three statements was never touched — and **both reviewers corrected my framing**: the old band was
  plain visible DOM, so the loss is to every sighted planner, not to keyboard users. Fifth, **this ADR
  contradicted the measurement it cites**, the disproved keyboard sentence surviving in three places
  including two lines above a citation of the section refuting it (ADR-0076 Class 3, one hand, one
  epic). Plus a comment claiming the fit gate cannot see the bar in the commit that widened it;
  `docs/TECH_DEBT.md` #124 still `open` and still calling the bar unable to overflow four days after
  it was measured overflowing by 408 px — **a deferral whose reason has lapsed reads exactly like one
  whose reason still holds**; and the new sweep shipped without the zero-size filter its own model
  carries. One of the architecture review's claims was itself wrong and is corrected rather than
  absorbed. Every fix carries a regression test verified red first.
  **The CPM engine is not imported and no migration runs.**

- **ADR-0115** _(Accepted; M0–M7 landed 2026-08-27)_ — A bound governs what it encloses, and the
  wrap was measured from one state. Five layout observations about the released workspace, and a
  sixth thing nobody reported that outranked all of them: selecting a single activity made the foot
  row **wrap**, costing the diagram **36 px at 1646 — the product owner's own screen — and 76 px at
  1440**. That is ADR-0114 M1's own consequence followed one step further than that ADR followed
  it; `shrink-0` → `min-w-0` stopped clipping four unreachable controls and started eating the
  diagram, and the abstract loss of ADR-0092's 0 px dock guarantee was recorded while the number
  never was. **It is now 41 px in both states at 1920 and 1646**, and `dock.spec.ts` asserts that as
  an **equality** — its old `<= 120 px` bound could not tell the fixed state from the broken one,
  because the pre-epic worst case was 117.
  **At 1440 the epic is a net loss at rest and the ADR says so**, rather than leaving the 58 px D7
  costs and the 76 px D1/D5 win in separate paragraphs that each read as a gain: 560 → 502 px of
  canvas at rest. Both of the product owner's screens are unaffected, which is why they kept it.
  **Four of the five answered differently from how they were asked.** The foot row had **no surface
  scope at all** — `(page)`, transparent, one grey hairline — rather than a different colour, and
  joins `chrome` as a **scope rather than a card**, which is what makes it free: `Surface`
  contributes a background, a foreground and an attribute and **no geometry**, so the band's radius
  and amber edge are deliberately not copied. Swapping the two halves moves nothing, because the
  dock is `flex-1 basis-0%` — making ADR-0114's stated reason for the previous order **false as
  implemented** (ADR-0076 Class 3, in a document three days old), so the order now rests on the
  argument that survives: the object bar gets a fixed leading edge where every button used to shift
  by however wide the facts happened to be. Two-line facts cost **nothing**, the whole price being
  `gap-4` setting a 16 px **row** gap as well as a column gap. And of the 48 controls behind the
  eight `▾` triggers only **13 are commands** — 24 are `View ▾` checkboxes — so the deck's genuine
  1,176 px of spare line at 1920 had almost nothing worth putting in it.
  **The load-bearing correction is that a bound governs what it encloses.** `max-w-64` first sat on
  the row that also carries `ScheduleStateRegion` and `PenStatusOutlet`, and **every measurement ran
  after a recalculation — the one state where the schedule region renders nothing**, so the readings
  never contained two of the row's five content sources. Two independent reviews caught it and the
  browser settled it: injecting the real stale sentence took the facts to three lines and the row
  from 41 px to **53 px at every width, with no selection at all** — a strictly worse version of the
  defect the epic exists to close. Re-scoped onto the facts alone it also **finishes what M1 could
  not**, handing 231 px back and taking 1440 from 117 px to 41.
  **Two decisions were withdrawn on their own measurement.** The approved fix — moving two viewport
  commands to the deck, correct by ADR-0093's subject test — takes the deck from two lines to three
  at 1646: **58 px to save 36**, the seventh consecutive contradicted width expectation here and the
  first where the arithmetic was right and the **model** was wrong, because a wrapping row breaks
  between _items_. And always-showing the object bar (ADR-0082's clause: a surface every item of
  which would be shaded renders no trigger) would make the wrap permanent.
  `Clear visual start` is **omitted** outside Visual mode on ADR-0082's own discriminator — an Early
  plan has no hand-placed start, so there is nothing for a reason to say — with the applicability
  test a separate predicate the existing gate calls, since `BulkActionGate` is shared with the
  plural bar. `Edit plan` stops being rendered twice from one memo, which ADR-0093's structural gate
  **cannot see** because it compares two registries and neither copy is a registry item.
  **The ADR keeps five things it got wrong**, because the corrections are the useful part: that
  two-line facts were "never free" (one Tailwind class); that the pen sentence was 126 px of the
  facts (a phantom, clipped to 1 × 1); that `docs/TECH_DEBT.md` #202 and #203 did not exist (they do
  — the register writes modern rows as `## 202.` and the grep, and the `git show` used to "confirm"
  it, shared one defect, with **both** reviewing agents reporting the same absence); that deck slack
  was the constraint on promotion; and **six instrument defects**, each recorded where it happened.
  Two of the three lens toggles offered to the product owner for promotion **did not exist** — one
  was already on the deck and one is not a lens at all — which is Class 3 one step upstream of a
  document, in a choice put to somebody else (`docs/TECH_DEBT.md` #204). **The CPM engine is not
  imported and no migration runs.**

- **ADR-0116** _(Accepted; M0–M5 landed and released 2026-08-28 — `api-v0.54.0`/`web-v0.109.0`; M6 landed the same day as its own slice)_ — A health
  finding is not a conflict, and a report never omits a check. The DCMA 14-point assessment as a
  **pure read model** — `GET …/schedule/health-check`, `schedule:read`, computed from persisted
  rows: **the CPM engine is not imported and the ADR-0034 parity gate is untouched by
  construction**, pinned by an import ban verified red, and the read takes no lock, no transaction
  and no pen, which is an advantage over both benchmark endpoints rather than a resemblance. The
  load-bearing vocabulary call: a health finding is structural (how the plan is built) and a
  conflict is engine-owned (what this recalculation hit) — ADR-0094 removed negative float from the
  conflict set for reasons right for a navigation cycle and wrong for an assessment, so the same
  fact lives in one vocabulary and not the other, the two are provably disjoint (G1/G2), and the
  panel explains the disagreement in a planner's words. **Nothing is omitted or faked**: the
  response is total over a closed 14-member union and "cannot assess" is a 200 with a typed reason
  rendered as a sentence — `PLAN_NOT_SCHEDULED` is the seed catalogue's own resting state, not an
  edge case (M0-T1). Thresholds and the offender cap travel **in the payload** (G3, comment-stripped
  scan — which caught its own docblock on first run, the fourth scan-matching-prose gate here); the
  report is role-invariant with **G4** rejecting any cost-shaped field name, so one URL produces one
  document, which is what makes it a handover artefact. The docked panel joins the right edge's
  one-dock rule **as a set** (`right-docks.ts` — a third participant needs six pair statements and
  the failure is that five get written); the printed report carries full offender lists with the
  cap in words (paper has no "load more"). **The spec's own Gantt-reveal claim was wrong and a
  reviewer found it**: selection alone scrolls nothing in the Gantt, so offender activation got its
  own reveal channel with the precedence written beside the existing two. Metric 12's real what-if
  test is M6, measurement first, carrying its own weaker parity sentence (computes read-only,
  persists nothing — proved, not asserted) that must never be swapped with D1's. **No schema change
  and no `VITE_` flag**; two out-of-scope defects found on the way are filed as #205.
  **The M5 gate pass blocked on five of six reviews, and the sharpest finding was the epic's own
  gate**: G4's key pattern was line-anchored, so a Prettier-clean single-line
  `{ …, cost: 0 }` and a banned-named shorthand property both sailed past the scan whose docblock
  claimed to catch exactly that — proven by running the mutations live, fixed whole-file with both
  bypasses pinned as fixtures, verified red against the real mutation. The rest are the register's
  recurring shapes: the printout stating provenance the live panel withheld (D9 applied to half
  the renderings); one correct pattern applied to a control and not its neighbour three more times
  (the fill token as ink where its sibling used `-text`, a bespoke error div beside a sibling
  dock's `NoticeStrip`, a live region dropping the informational count the visible summary
  states); a role-shut remedy rendered as silence against the ADR-0082 rule the code itself cited;
  an axe scan certifying only the all-PASS state no real plan shows; and two wrong citations (the
  DTO `count` description inverted, a 429 text citing TBD rows — now measured: all four loaders
  sub-1 ms at 2,000 activities, independently re-derived by the security review). Deferred
  suggestions are #206, with reasons.
  **M6 landed as its own slice, and its first verdict rule was wrong in exactly the way the test
  exists to catch**: the draft measured the max-over-all project finish, and the injected subject's
  OWN finish grows by 600 days unconditionally — so a MANDATORY pin masking the whole downstream
  chain read as PASS, caught by the fixture written to fail it and fixed by watching the
  **completion carrier** (the control run's latest-finishing activity), verified red first. The
  route carries D7's weaker sentence on its own OpenAPI, its throttle is the committed formula's
  **14/60 s** from a measurement whose falsification condition was committed before the run
  (260.5 ms p95 at scale-500, 846.5 ms at 2,000 — 1.18–1.22× a recalculate; the run also put the
  first number on #74's unmeasured recalculate), and the non-mutation e2e was verified red by
  persisting once deliberately. Three plan deviations recorded rather than smoothed: the
  metric-12 placeholder pin is kept-and-reframed (the report route is unchanged; the plan's
  delete instruction assumed an in-place upgrade), `NO_CRITICAL_PATH` joins the reason union, and
  the PLAN_START_REQUIRED e2e was withdrawn because the no-start state is unreachable through the
  public API (pinned in the service unit suite instead).

- **ADR-0117** _(Accepted; fix-slice M-B landed 2026-08-28)_ — An icon-only control names itself,
  and a tooltip states its purpose. The product had no tooltip primitive: icon-only commands leaned
  on the hover-only `title`, unreadable to keyboard focus and to touch — so the deck's six
  `ICON_ONLY` glyphs named themselves to a mouse and to nobody else (#131). `useTooltip` is a
  hand-rolled APG **hook** (the `usePopoverPanel` trigger argument), meeting **WCAG 1.4.13 in
  full** with each clause a red-verified test: Dismissible (Escape claimed **only while open** —
  the ADR-0080 ladder condition — via `preventDefault` **alone**: `stopPropagation` is
  deliberately absent, because an ambient overlay must yield the press to the window/React rung it
  was aimed at — the M-B pre-merge review blocked on the draft that had it, and this entry said
  "and `stopPropagation`" until the M-G gate pass caught the same wrong claim here (ADR-0076
  Class 3, in the register entry describing the decision); focus unmoved), Hoverable (150 ms
  grace, pointer may rest on the tip), Persistent (no
  auto-dismiss timer exists). Hover opens at 400 ms, focus immediately, and a coarse-pointer
  **long-press** opens the name **without firing the command** — the following click swallowed in
  `onClickCapture`. **The load-bearing option is `purpose`, and it has no default**: `'name-echo'`
  renders `aria-hidden` with no `aria-describedby` (linking a tip that restates `aria-label` makes
  a reader hear "Zoom in, Zoom in"), `'description'` renders `role="tooltip"` linked while open —
  the caller states which case they are in, so the double-announcement failure cannot be reached by
  omission. Positioned by the ONE clamp and portalled by the ONE target (`overlay-position.ts`) —
  M-C landed first precisely so this could not become a third copy. `ToolbarButton`'s icon-only
  branch drops `title` for the **character-identical** string through the tip; the labelled branch
  keeps its title (a visible name needs no echo — the discriminator table is the authoring rule in
  `docs/DESIGN_SYSTEM.md`). Reviewed by accessibility + component reviewers **before merge**
  (§19.13 — the class that shipped twice in two days). #204(a)'s premise had lapsed before this
  landed (ADR-0115 restored `zoom-to-selection`'s label) — corrected in the register rather than
  stepped over; the primitive still covers any future icon-only control by construction. **The CPM
  engine is not imported and no migration runs.**

- **ADR-0118** _(Accepted; M0–M3 landed 2026-08-29)_ — A control height is one decision, and the
  input is an axis of it. The product published **three different** target-size rules — 44 px
  unconditional (`UX_STANDARDS.md`), ≥ 24 preferring 44 (`DESIGN_SYSTEM.md:453`), and a scale
  defaulting to **36** (`:113`) — met by nothing, and **never measured, because no gate here had
  ever run with a coarse pointer.** `e2e-toolbar-fit` once carried both a §2.5.8 sweep and a
  coarse-geometry block; ADR-0109 D1 deleted that suite, `#186` noticed the sweep was gone and
  lifted it into `e2e-workspace-fit`, and **nothing noticed the coarse half** — half a deleted gate
  restored, half not, with no row recording the difference. 44 px is also **§2.5.5 AAA, not AA**,
  which reviewers had been reading as a compliance requirement.
  **Measured before anything was designed, against five conditions committed in their own commit
  first.** The coarse pointer moves **width only** — 46 comparable targets, height differs on
  **zero**, width on 29, every one the `px-2` → `px-3` swap worth exactly 8 px — so an input axis
  **introduces** a distinction rather than formalising one, and D2 argues for it on those terms.
  44 px costs the deck **+16 px, not the ≥ 36 predicted**: the deck holds **two rows**, so a taller
  control makes them taller rather than wrapping a third, and the cost is `2 × 8`, linear. The
  prediction was wrong by more than a factor of two and landed on the **exact pixel of its own
  falsification boundary**, recorded that way rather than rounded to either side. Coarse-only 44 px
  therefore costs a mouse user **0 px** and a touch user **16 of 808 (2.0 %)** — so CQ-2 does not
  fire and the command surface needs no exemption — and a coarse projection of the existing sweep
  costs **~2.5 s against a 90 s bar**, so CQ-3 does not escalate to a sibling suite.
  Two defects it found are **not touch defects** and are recorded as such (`#213`): two plan-header
  controls **painted and not clickable** at 390, and a **20 px** breadcrumb (a _candidate_ §2.5.8
  failure — that SC exempts inline text, and this register overstated an SC once). An approved plan
  clause was never built while its own risk table claims it shipped (`#214`). And **four instruments
  were caught lying**, one of them mid-audit: a token comparison of `2.25rem` against `36px` that
  reported "the token governs nothing"; `e2e-local.sh` exiting **0** having run no test; a dialog
  probe that measured nothing while looking like a result; and a `grep … | head` that returned ten
  of 26 references and nearly turned a true claim into a false correction. `command-surface.spec.ts`'s
  "~25 s fixture" is **7.5 s**, a docblock number nobody had run and the plan quoted forward.
  **M2–M3 built it, and three of the ADR's own dispositions did not survive the work** (D6).
  Coarse-pointer controls under the house rule went **46 → 1**, the survivor being the breadcrumb —
  the epic's ONE named exception, and the attempt to fix it is the finding: a
  `pointer-coarse:min-h` box measured **16 × 44** at 390, worse on the axis already failing,
  because a truncated crumb's width IS the space left over. **#153 closes against its own remedy
  and against the plan**: both said the Legend's close moves up to `icon-lg` (44), written before
  D2 narrowed the rule to `pointer: coarse`, so following it would have applied a rule this ADR had
  already withdrawn; all three panel controls unify on `icon` and `icon-lg` is deleted, its docblock
  having cited a `UX_STANDARDS.md` floor M1 rewrote. §19 says re-verify a plan's **problem** — here
  the plan's **remedy** had gone stale against its own epic three milestones later. **#145 closed by
  measurement**: its own conclusion was that 44 px is "a product-wide control-height question
  (`--control-h`)", and the axis answered it for the native `<select>` and the `Combobox` at once —
  then the re-run found the half nobody had asked about, the open list's 32 px options.
  **D5's "painted and not clickable" turned out to be OFF-SCREEN**, at x = 409 and x = 565 against a
  390 px viewport: the mode cluster's `shrink-0` takes `max-content` and can never be asked to give
  anything back, so the wrapping row beside it was never asked to break a line — ADR-0114 M1 one
  surface along, fixed at **zero** vertical cost. **F3b, the condition M0 left NOT MEASURED, is
  answered** by a harness that opens a dialog rather than querying for one, and it found the dialog
  close at 36 × 44 — a raw `✕` in a text-sized button beside a `Sheet` that had used the icon button
  all along. Widening the gate exposed three holes in the gate itself, each fixed rather than worked
  around: a failure naming `(unnamed)`; `display: none` read as "painted at zero size", which would
  have retired the assertion that catches ADR-0090 M1's real defect; and a row below a scroller's
  fold read as unreachable, where the discriminator is ADR-0114's own — whether there is anything
  scrollable to move.
  **The CPM engine is not imported and no migration runs.**

- **ADR-0120** _(Accepted; M0–M7 landed 2026-08-30)_ — A documented obligation with no computed
  observer. Two rules in this repository were written down, agreed and unobserved, and both decayed
  in the direction hardest to notice: the document keeps reading as authoritative.
  `docs/TECH_DEBT.md` decides what gets picked up next, and **14 of its 138 rows carried a status a
  parser could find** — so three candidates went to the product owner and one had been fixed three
  weeks earlier, in a commit naming four unrelated ADRs; a sweep then found **six of seven** verified
  rows fixed and never closed. `docs/RECONCILE.md`'s pass ran "at each epic boundary", and its own
  record of when that last happened was an **unsorted table with a banner contradicting its newest
  row** — a reader auditing that file _specifically for staleness_ got it wrong on the first attempt.
  **The load-bearing decision is the exit convention, and it is written into the script because the
  tempting discriminator has no stable answer**: exit 1 is for an obligation whose remedy is an edit
  to the file that failed, exit 2 for one whose remedy is somebody's judgement. `check:debt-status`
  blocks (type a status); `check:reconcile-due` warns (run a pass and think). `prepush.sh` gains a
  third result state, which was a **prerequisite rather than a preference** — `run()` sends a passing
  gate's output to a log, so an advisory gate was previously **completely silent**.
  **The warning is ignorable and the ADR says so** rather than designing it away; escalation-to-failure
  was refused as a blocking gate with extra steps, reaching the same `--no-verify` bypass by a longer
  route. What it buys is that the state is computed and visible instead of requiring someone to read
  an unsorted table correctly — a smaller claim than "this cannot recur", and the true one.
  The 106 rows without a status became **`unverified`, not `open`**: writing `open` on a row nobody
  has checked asserts the very claim this epic exists to remove, and accepting `unverified` is what
  let the gate be armed at all (ADR-0058 — a gate that fails on day one gets deleted rather than
  fixed). Gate A was **report-only until the repair was done**; the red run against the un-repaired
  register is committed, because the red state is now gone and that output is the only record the
  gate ever had anything to find.
  **The epic's own subject then landed on it, and this entry is the corrected version.** Gate A
  shipped calling `sections(md, 2)` — level-2 headings only — while `docs/TECH_DEBT.md:100-103`
  states the register's own convention as `### <number>. <title>`, **always**, with `##` as drift
  three rows had picked up. So it read _only the drifted rows_: **31 numbered rows invisible, 29 of
  them with no status**, while it printed "88 detailed rows (88 with a status, 0 without)" over a
  document where that was false — and I reported that line to the product owner as proof the
  register was clean. It survived a red run, a repair pass and an arming because **A9, the assertion
  written to answer "did we read less than we think?", counted `^## ` too**: both sides of the
  comparison shared one blind spot, so it agreed with itself. A9's control is now derived
  independently, and every figure this entry once carried was an undercount — the red run's 118
  findings were really 147, and `red-run.md` is **headed with that correction rather than re-run**,
  because the file records what the gate reported and the gap is the D5 lesson in numbers. Seventh
  recorded instance of a check whose subject was not what it believed; first where the check was the
  one written to close that class.
  **The threshold is derived and coupled to the enforcement choice**: T = 8 filed since the last pass, from p75 = 7.50,
  firing on 3 of 11 intervals and catching both recorded failures. T = 10 fires on exactly the two
  intervals somebody complained about — tuning to two data points — and T = 8's extra firing is
  affordable **only because the gate warns**; had it blocked, 10 would be right. The spec treated
  those as independent decisions. An ADR is a **proxy for an epic** (~1.7 per epic), so it counts the
  wrong noun, which is acceptable only because it is stated.
  **The ratchet's history is the argument for having one.** Specified 66, measured 42, shipped 43:
  66 conflated the compact table with the 24-row Closed-numbers ledger — a permanent record that only
  grows — so it would have permitted 24 new rows before firing, a gate that exists, passes and
  protects nothing. Then numbering an orphan row whose number cell was **prose** made it countable,
  42 → 43, and **A7 refused the stale value in the same commit that changed the count**. Along the
  way: `#169` was nearly deleted because its heading said `HALF CLOSED`, and half closed is open;
  three apparent vocabulary violations were vocabulary words wearing punctuation, so the rows were
  made readable rather than the gate widened; and prettier **de-indented a fixture**, which kept its
  name, lost the property it pinned, and would have passed against a broken parser
  (`scripts/lib/fixtures/` is now in `.prettierignore`). **The CPM engine is not imported and no
  migration runs.**

- **ADR-0121** _(Accepted; M0–M4 landed 2026-08-31)_ — One stack derivation, two renderers, and a
  cap set by height rather than cost. The resource histogram showed **one resource at a time**; the
  product owner noticed while using the app and asked two falsifiable things — whether that was
  really the limit, and whether P6 stacks with colour. Both were true, and the source they supplied
  is worth reading for what it **complains** about: P6 stacks by adding one filter dialog per
  segment, which its own advocates call "really tedious" for the case every real programme has.
  ADR-0053 M3 already gave resources a `parentId` and a non-assignable `GROUP` kind, so stacking by
  **trade group** is a re-partition of the same derivation rather than a second pipeline — a
  dropdown where P6 wants five dialogs, which is where this beats it outright. **Three claims in my
  own brief were wrong and were corrected before it became a spec** (§19.11): the ramp has twelve
  members, not the ten I reported from a truncated `grep`; over-allocation shading **is** built, as
  an ADR-0041-driven lens; and the limit-line framing the brief leaned on is not supported by the
  source at all.
  **The load-bearing decision is the one that nearly did not get made, because the code looked
  right: a colour has two forms, and which one a renderer gets is that renderer's business.**
  `stackSeries` emits `var(--chart-n)`, correct for its first consumer, since a `var()` follows the
  ADR-0055 surface scope and re-values with the token. The canvas strip then indexed the same ramp
  and published it straight to the painter — and **Canvas 2D's `fillStyle` setter discards an
  unparseable value and keeps the previous colour**, with no throw, no warning and no visual error
  state. Verified in Chromium rather than reasoned about. So the stack would have painted as **one
  solid block**: the feature's entire premise, telling the trades apart by colour, silently absent,
  with every unit test green because jsdom has no canvas and a test asserting the `fill` string
  passes on exactly the value a browser refuses. That is ADR-0100 M4's minimap defect in this same
  token family, and `resolveLensPalette` has resolved this **exact ramp** correctly since ADR-0049
  — so it is one correct pattern applied to a control and not its neighbour, the **sixth** recorded
  instance. The fix goes where the indexing rule already lives (the ramp is a `stackSeries`
  parameter), because resolving at the call site would be a second copy of the `i % length` rule;
  the painter additionally **throws in development** on an unresolved fill.
  **Both committed falsification conditions FAILED, and both remedies were applied rather than
  either criterion softened.** Condition 1, paint cost, failed on a **discontinuity nobody
  expected** — +14.7 ms against a +2.0 ms bar at Fit, and a sweep found a cliff at **nine** segments
  (0.5 ms at eight, ~10 ms at nine) with `p50` flat across the whole range, so a tail rather than
  fill rate. Two hypotheses were **falsified** by experiment (sub-pixel bands: an even split fails
  identically; distinct fill colours: nine segments in four colours still fails) and the arithmetic
  does not explain it either, nine being ~13 % more fills than eight and not 20×. Unattributed and
  filed as `docs/TECH_DEBT.md` **#226** rather than guessed at. Condition 2, legibility at 72 px,
  then cut the cap much further — **height, not cost, was the binding constraint**: on the spec's
  skewed profile six named bands put the fifth trade at 1.04 px and the aggregate at **0.52 px**,
  below a pixel and unidentifiable in the screenshot the condition is judged against. `6 → 0.52`,
  `5 → 1.05`, `4 → 2.13`, `3 → 4.40` px, so `STRIP_STACK_CAP` is **3** against the dialog's **8**.
  The two surfaces differ in **how many** segments they name and never in what a segment means —
  the divergence the remedy ladder sanctions, and why `cap` was a parameter from the first commit.
  **What the cap costs is stated rather than left to be rediscovered**: on an EVEN six-trade split
  every band is 9.43 px and all six would have been legible, so three trades are folded for no
  visual reason. A data-driven cap was rejected because it makes a segment's presence a property of
  the plan rather than of its rank, and a constant tuned to whichever profile reads best is the
  number-tuned-to-the-answer the condition exists to prevent.
  The harness needed one correction before its answer was worth anything: at the Week preset ~15 of
  104 buckets fit and the scale is the whole plan's peak, so framing from day zero grades the
  quietest fortnight of a two-year programme against a scale set by its busiest. The first run did
  exactly that. **`database-architect` was deliberately not engaged** — there is no model, column,
  index, constraint or migration, confirmed against the diff — and that is recorded so "the agent
  was not run" cannot read as an oversight. Filing the epic's rows also found **#227**: 70 of 100
  detailed register rows use a heading form `docs/TECH_DEBT.md` itself forbids, and
  `check:debt-status` cannot report it because ADR-0120's correct fix widened the parser to read
  both levels.
  **The gate pass blocked on four of six reviews, and its two largest findings are decisions that
  were written down and not built** — the ADR-0081 shape twice in one epic, each reached
  independently by two reviewers. The strip's **legend** was decided by name in the spec (_"the
  chrome panel already exists … the legend joins them"_), listed as a development step, and never
  written: so an `aria-hidden` canvas carried four coloured bands with **nothing on screen naming
  any of them**, colour as the sole channel with no alternative — WCAG 1.4.1, on the surface the
  epic exists to improve. And the dialog chart's **segment boundary** is that inverted: the whole
  1.4.11 case for a stack is that adjacent fills never clear 3:1 against each other because a
  ground-coloured rule sits between them, the canvas painter drew one, the DOM chart drew bare
  backgrounds — the argument true of one renderer and asserted of both, with the ramp's worst
  adjacent pair at 1.46:1. Four more were the author's, one of them this register's favourite shape
  aimed squarely back: the panel resolved its palette from `document.documentElement` under a
  comment written **in the `var()` fix commit** claiming it read the canvas surface and citing
  ADR-0102 by number — code and comment landing together and disagreeing, invisible to every test
  because jsdom returns `''` from either root. Plus the painter re-summing bucket totals (D1's rule
  broken by D1's own author), `groupSeries` walking one level where the spec and the control's label
  both say top-level, and a table caption claiming _"ordered by total, largest first"_ over a table
  that sorted nothing — both fixtures coincidentally descending, so the false caption shipped green.
  The coverage gaps were the plan's own written requirements, and one of them is sharper than a
  gap: `stack-record.structural.test.ts` asserted against a **private mirror** of the table's
  logic and imported no component, so the regression its own docblock describes would have left it
  passing. **The CPM engine is not imported and no migration runs.**

- **ADR-0119** _(Accepted; landed 2026-08-30)_ — A group of buttons says which of them are
  alternatives. The plan header's mode row held four controls — `Early mode | Visual mode |
Diagram | Gantt` — which are **two independent two-way switches**, and ADR-0031's closed
  seven-group taxonomy put all four in `lens`, so `Toolbar` rendered **one region, one accessible
  name, four identical gaps**. That last part is provable rather than photographic: `gap-1` is
  applied uniformly to every child of a group and the only differentiating chrome is gated on
  `i > 0`, i.e. it separates _taxonomy_ groups — there was no code path by which the gap between
  `Visual mode` and `Diagram` could differ from the gap between `Early mode` and `Visual mode`. **A
  planner who read it as one four-way choice, and expected `Gantt` to replace `Visual mode`, was
  reading the picture correctly.** A taxonomy group may now render as N named sub-groups when its
  items declare one; the taxonomy stays closed, which is the smaller amendment. The precondition is
  **all-or-nothing** and the refusal is the load-bearing half — a partial partition leaves an
  unnamed region, a container a reader must enter to discover holds nothing they were told about.
  `demotionGroup` becomes **`segment`**: it had no runtime consumer since ADR-0109 D1 deleted the
  demotion pass, and its two surviving invariants cited `companionsOf`, a function that went with
  it (`#193`). **No WCAG success criterion applies and the ADR says so plainly** — 1.3.1 does not
  apply because both channels were equally silent, 4.1.2 is met, 2.4.6 is strained not failed; this
  register overstated such a citation once (ADR-0082) and the correction is recorded rather than
  quietly dropped.
  **The divider nearly did not ship, and the instrument was wrong before the product was.** It
  costs width on a row that _wraps_, so its failure mode is 48 px of canvas — the surface eight
  consecutive epics have contradicted their own width expectations about. The verdict rule was
  committed **before** the run and the product owner pre-approved shipping the accessible names
  alone if it cost a line. Measured, `aboveCanvas` is **228.0 px at 1646 with and without it, as an
  equality**, and the shipped figures match the pre-build prediction to the pixel. But the first run
  reported **+5 px against a predicted +13** — which passes every rule just as 13 does, so the
  verdict would have been identical and the recorded number wrong. The probe had styled a _button_,
  whose existing `px-2` an inline `padding-left` replaces rather than adds to; the real candidate is
  a `role="group"` div. Caught only because the prediction was written down first and the probe
  prints the node it touched.
  **The gate pass earned its place for the eighth epic running, and its sharpest finding was in the
  ADR.** ADR-0119's first draft rejected visible per-pair captions on the ground that "the hairline
  plus the existing caption `MODE` already carry the visual half" — and that caption is one
  `aria-hidden` word spanning both switches, so it asserted the single umbrella the change exists to
  remove. **A false claim used as evidence for a decision**, ADR-0076 Class 3, inside the document
  making the decision. The same contradiction ran through the accessible channel: a region named
  `Plan mode` containing a group named `Plan view`, which an AT user heard as the container denying
  its own child. Both fixed — the caption deleted (it carried no information, and deleting it _buys_
  width), the toolbar renamed `Plan mode and view` — on the rule that **a compound name is wrong for
  a group and right for a container of two groups**. Also folded: `partitionBySegment` moved into
  `toolbar-registry.ts` beside its field rather than living in a React module a pure-rule test had
  to import; a development-only warning when a partition is refused, because the next consumer
  inherits no structural test; `groupLabels` restored as defence in depth, since the fallback
  otherwise names the region `Display` and reintroduces the collision; a one-segment case, because
  the spec's "byte-identical apart from the group's name" was **not quite true** with one flag off;
  and two docblocks corrected for overstating what they protect. **The CPM engine is not imported
  and no migration runs.**

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

- **ADR-0104** _(Accepted)_ — A shell control whose subject is an organisation is withheld where
  there is none. Three of the thirteen `_authed` routes are not organisation-scoped —
  `/onboarding`, `/account`, `/me/activity` — and the shell rendered the Project Explorer on all
  three: ~298 px of drawer at 1646 saying _"Select an organisation to browse"_, on `/onboarding`
  beside a card asking the reader to create their first organisation. **The rule was never missing;
  it was applied to four controls in the same 48 px rail and not their fifth** — the below-`lg`
  trigger, the six destinations, `BrandLink` and `OrgSwitcher` all withheld correctly, and the
  Explorer's button sat forty lines from the destinations block, ungated. So the shell derives the
  fact **once** and every consumer reads it. **Omitted, not shaded** (ADR-0082's third omit clause);
  the objection worth answering is that a reader on `/account` with three organisations _can_ change
  the state, and they cannot change it **here** — choosing one navigates elsewhere, and the switcher
  two rows up is already that affordance. The same rule on all three routes, keyed on the **route**
  and never on memberships, because memberships come from a query and a membership-keyed rule would
  paint and then shift ~298 px a beat later.
  **The cause sat one layer below the symptom**: `useExpansionState(orgSlug ?? '')` persisted
  expansion state for **an organisation named empty string**, so the shell did not model the
  absence, it modelled a blank presence. **The Escape rung is the sharp consequence** — guarding on
  `drawer.collapsed` alone would have called `drawer.collapse()` on `/account`, persisted it, and
  announced a panel closing that was never open; a fix that suppressed the Explorer by _collapsing_
  the drawer would have passed every other assertion and shipped exactly that. Proven by a test
  verified red, asserted against a `setItem` spy rather than the resting value.
  **Three unit suites had used the broken state as their fixture** (`app-shell.test.tsx` mocked
  `useParams: () => ({})` and asserted the Explorer **is** present), which is one layer past
  ADR-0081: not a capability with no entry point, but **a defect with a suite that pins it**.
  Built without a spec — see ADR-0105 — with the spec produced afterwards as a **check**, written
  blind to the implementation; it reached the same design independently and found four things that
  had been missed. **The CPM engine is not imported and no migration runs.**

- **ADR-0105** _(Accepted)_ — A register row is not a spec, and the trigger is capability-shaped.
  `docs/PROCESS.md` says "**any** new requirement or feature" and has no defect exemption, but an
  unwritten one had been operating: a `docs/TECH_DEBT.md` row treated as standing in for the spec.
  That is sound for a contained fix and wrong the moment the work grows a surface — and the person
  deciding which case they are in is the person about to skip the step. It failed twice in one
  session; the second time the parent epic's **own approved spec** said of the milestone that
  produced the row that its output is register rows _"and the work it may generate is specified
  after it runs"_. **The trigger is capability-shaped, and that is measured rather than chosen**:
  across 181 non-release commits, 43% carry a spec, and **file count is a poor discriminator — at
  its best threshold a size rule still misclassifies 23%**, so a size trigger would have been
  instinct wearing evidence's clothes. The strongest predictor is adding a Playwright config, at
  **at least 26 of 28**. A register row therefore covers stages 1–2 only while the change stays
  inside the behaviour it describes and adds **no new surface**; the full spec and plan become
  mandatory on a new user-facing entry point, a Playwright config or CI step, a component's public
  contract, a shared gate, or the schema — and crossing a trigger **mid-flight stops the work**.
  **It is a review-time prompt in the PR template, not a computed gate**, and the reason is
  arithmetic: the obvious diff-based check ("adding a journey must touch `docs/specs/`") would fail
  **26 of the 28 historical cases**, because a milestone commit of an already-spec'd epic touches no
  spec file. An earlier draft declined the gate for a _different and false_ reason — that the
  history holds two legitimate exceptions — which collapsed when those two commits were opened
  (one changes product code, one changes backend authorisation). Same decision, different reasoning,
  and the ADR records the correction rather than the tidy version. **No product code changes.**

A lighter-weight running log of smaller decisions is in
[`docs/DECISIONS.md`](docs/DECISIONS.md).

## 17. Known limitations & assumptions

- **The staff console is live but unwired** (ADR-0086, 2026-08-09). Five panels exist and every
  route is audited; what does **not** exist yet is anybody receiving the two signals it added.
  `MAIL_ALERT_URL` and `HEARTBEAT_URL` are compose edits on the host, both empty by default, and
  until they are set a broken relay still reaches nobody — which is the exact failure
  `docs/TECH_DEBT.md` #100 records, so that row stays **open on the operator half**. Likewise
  `STAFF_EMAILS`: empty means nobody is staff, which is the safe default and also means the console
  is unreachable until an operator opts in. Do not read "shipped" as "in use" for this epic — the
  opposite of the mistake the bullet below this one records.
- **Retention now covers customer hierarchy too, and it is off.** ADR-0096's expiry
  permanently deletes soft-deleted clients/projects/plans past
  `RETENTION_HIERARCHY_DAYS` (90) — see the hard-delete bullet below for what that
  means. `RETENTION_HIERARCHY_ENABLED` defaults to **`false`**, so on any host
  that has not opted in, **nothing has ever been permanently deleted** and
  Recently deleted's countdown is a preview rather than a promise. Do not read
  "shipped" as "deleting" here.
- **Retention is enforced on two tables and not on the third, and the difference is a decision.**
  `csp_reports` (30 days) and `mail_events` (12 months) are swept hourly since 2026-08-10
  (ADR-0087) — this application's **first** scheduled work of any kind. `audit_events` is **not**,
  and may never be: it refuses `UPDATE` and `DELETE` in the database by `ENABLE ALWAYS` triggers, so
  ADR-0085 D3's own 12-month `auth.*` period stays unenforced rather than being bought with the
  structural guarantee ADR-0085 D1 refused to trade (`docs/TECH_DEBT.md` **#118a**). Two more things
  do not follow from "retention is enforced": the CSP period bounds **staleness, not data age**,
  because a violation still being reported never ages out (**#118b**), and nothing is deleted on the
  deployed host for a while yet — both tables were created on 2026-08-09, so the sweep correctly
  reports `deleted: 0` until the periods elapse.
- **Four accepted ADRs have no implementation** — background jobs + Redis
  (0009), caching (0010), object storage (0011), and OpenTelemetry metrics and
  tracing (0013, of which only Pino is wired). Nothing in the running system
  depends on them and none of their dependencies are installed. Do not cite
  them as existing capability; see `docs/ARCHITECTURE.md` §10. The mail port has
  a **real SMTP adapter** (`common/mail/smtp-mail.service.ts`), selected whenever
  `MAIL_SMTP_URL` is configured; the logging implementation is the **fallback**
  when it is not, so on a stock dev environment mail is still only logged. This
  bullet called the port "a logging stub" until the 2026-08-04 pass, which is
  the read that leads to building a second mail path — and `docs/BACKLOG.md`
  still listed "Mail transport" as an unbuilt foundation until 2026-08-05, in
  the one file that decides what gets built next. **The deployed host has a real
  transport configured and sending** (product owner, 2026-08-05), which is what
  unblocked `VITE_PASSWORD_RESET`. What is still missing is knowing a send
  **failed**: Better Auth swallows the rejection after handoff, so a broken
  relay produces silently unrecoverable accounts (`docs/TECH_DEBT.md` #94).
- **Every deletion a user can reach is a soft delete — and two paths behind it are
  not.** `deleted_at` is set, the row stays, and the recycle bin restores it. **The
  retention expiry is the first hard delete that can be AIMED at existing data**
  (ADR-0096 D2, 2026-08-18): a client, project or plan sitting in the bin past
  `RETENTION_HIERARCHY_DAYS` is permanently removed with its whole subtree, by a
  timer inside the API. It ships **off** (`RETENTION_HIERARCHY_ENABLED`, default
  `false`) and is armed by an operator, and the clock is **retroactive** — the day
  it is armed, everything already past the period goes on the first tick, which is
  at boot. There is no purge button and there never will be: `POST …/purge` is
  refused structurally (D1), so the timer is the only thing in the product that
  does this. Each expiry writes one `hierarchy.expired` audit row inside the
  deleting transaction, and that row **outlives the thing it names permanently**,
  because `audit_events` refuses `DELETE` (ADR-0085 D1). **The second path is
  older, and this bullet said "there is no hard-delete path" until 2026-08-18:**
  interchange's failure compensation (`interchange.service.ts:1134-1139`) issues
  real `deleteMany`s across assignments, dependencies, activities and the plan
  lock when phase 2's recalculation fails, honouring the "nothing is created on
  failure" contract for a plan the importer had just created and nobody had yet
  seen. That is not an erasure path — it cannot be aimed at existing data — but
  the absolute phrasing was wrong in a load-bearing way: **ADR-0073 C3.4's
  decision about when to write `interchange.imported` turns on exactly this**,
  because a row written inside the transaction would outlive its subject and
  permanently claim an import that was rolled back. Plan for that when reasoning about retention or a
  right-to-erasure request. (An **append-only audit log** and a **data-export
  path** were both listed here as missing until the 2026-08-04 reconciliation
  pass; both had shipped. The log is ADR-0072/0073 — `audit_events`, append-only
  in the database. Export is `GET …/plans/:id/export/:format` for XER and MSPDI
  (ADR-0050 M4) plus the TSLD's CSV/PNG/PDF and the printed programme
  (ADR-0059 M4). Neither is an org-wide account export, which is still absent.)
- **Hosting is decided** (settled 2026-08-01, `docs/TECH_DEBT.md` #5): Docker
  Compose on the product owner's host, with releases pulled automatically. A
  _different_ target — managed host, or self-hosted Kubernetes — has not been
  costed, and does not need to be until one of #5's three triggers fires; the
  container/registry foundation is deliberately platform-neutral so that stays a
  decision rather than a rewrite. This bullet said the target was "not yet
  decided" until the 2026-08-04 pass, three days after #5 recorded the opposite
  — a settled decision reading as work owed, which is the mirror image of the
  failure the rest of this section warns about. What is **not** undecided is
  whether releases reach anyone: the product owner runs the Docker Compose stack with the
  ADR-0047 Watchtower profile **enabled**, so a merged release is pulled and
  recreated on that host and **every release is reviewed by a person**. Anything
  shipped default-on is in use. This paragraph said the opposite for months — that
  a release "does not reach users until an operator acts" — which is the ADR-0058
  failure exactly: it described the shipped default and never checked the operator.
  Do not reason about this product as if it were unused (corrected 2026-07-30).
- Cross-browser e2e coverage is Chromium-first: the Playwright config defines
  firefox/webkit projects but the journeys are exercised mainly on Chromium.
- **The canvas draw budget: this bullet was wrong on every count until 2026-08-31,
  and it is worth reading why.** It said the painter "runs 4–6× over the stated
  ≤ 4 ms p95 (ADR-0026 §16)". `docs/TECH_DEBT.md` **#75** had corrected all of
  that on **2026-08-03** — four weeks earlier — and nothing propagated the
  correction here, so the operating manual kept teaching the superseded version
  to every reader and every agent briefed from it. It was caught only when a
  performance reviewer, handed this framing as established fact, went and read
  the row.
  What #75 actually establishes: **there is no §16 in ADR-0026** (its sections
  run to §9a, and every "§16" citation in this repository points at a section
  that does not exist); **4 ms was never a budget** but the measured p95 of a
  throwaway prototype, recorded as a PASS against a ≤ 16 ms frame; and the real
  gate in §9 is **frames per second** — ≥ 45 fps @ 500, ≥ 30 fps @ 2,000 under
  sustained pan.
  Measured on real hardware (2026-08-03, 2,016 activities): at **Week** zoom
  3.9 ms p95 with **0 of 600 frames dropped** — genuinely smooth, and that is the
  zoom a planner works at. At **Fit** (whole-plan) zoom 8.9 ms p95, comfortably
  inside a 16.7 ms frame, and yet **10.2 % of frames dropped** with the interval
  p95 at 33.4 ms — whole missed vsyncs. So the fps gate is met and **a planner
  panning that plan still sees judder**, which is a stronger finding than the row
  set out to make: a budget expressed as paint duration is the wrong **quantity**,
  not merely the wrong number. Roughly 8 ms per frame is unattributed and #75 says
  plainly it must not be guessed. The headless figures (16.7–23.1 ms) are
  software-rasterised and explicitly not the target envelope.
  Do not restate either the alarming or the reassuring half of this alone — both
  are half-truths, which is how the wrong one survived here for four weeks.
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

   **A `docs/TECH_DEBT.md` row is not a spec** (ADR-0105). It covers stages 1–2
   only while the change stays inside the behaviour that row describes and adds
   **no new surface**. The full spec and plan become mandatory — whatever the
   size, and **even once the work has started** — the moment it adds a
   user-facing entry point, a Playwright config or CI step, a component's public
   contract, a shared gate, or a schema change. Crossing a trigger mid-flight
   means the work **stops** and the spec is written. This rule exists because
   "it's only a defect fix" was decided twice in one session by the person about
   to skip the step, the second time against an epic whose own approved spec
   promised the follow-on work would be specified.

2. **Build features to the implementation standard.** Match the layering
   (controller → service → repository), deny-by-default auth with permission and
   org-scope checks, standard envelopes, DB standards and tests described in
   [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md), starting from the
   nearest real exemplar (`modules/clients`, `modules/notes`, `modules/share`).
   **Do not diverge from those cross-cutting patterns without a documented
   architectural reason — an ADR** (ADR-0057, superseding ADR-0015). There is no
   template to keep in step: the exemplars are real modules under real tests.
3. **Every schema change goes through the database-architect agent — always.**
   A model, a column, an index, a constraint, a data migration: no exceptions, and
   no self-assessment of whether this one is big enough to need it. If the agent
   returns nothing, fails, or is slow, **re-run it**; an unavailable agent is a
   reason to wait, never a reason to proceed. A migration is checksummed the moment
   it lands and applies to a real database, so a mistake costs a second migration in
   every environment rather than an edit. Product-owner instruction, 2026-08-09.
4. **Prefer the smallest change that fully solves the task.** Do not scaffold
   application features unless explicitly asked.
5. **Match existing conventions** (this file + `docs/`). If a convention is
   missing, propose one here rather than inventing an undocumented one.
6. **Keep docs in lock-step** with code. Update the ADRs/CLAUDE.md/`docs/` when
   you change architecture, standards, or process.
7. **Never commit secrets**, disable TLS verification, or weaken security/a11y
   gates to make CI pass.
8. **Run the pre-push gate** in [`docs/TESTING.md`](docs/TESTING.md) "Before you
   push". **It is one command — `pnpm prepush`** — and running its parts by hand
   is how a gate gets missed: this bullet used to name
   `pnpm lint && pnpm typecheck && pnpm test` plus two `check:*` scripts, and
   `scripts/prepush.sh` derives **ten** of them from `package.json` precisely so
   nobody has to keep a list in their head. Following the old wording on
   2026-08-22 sent an ADR to CI that `check:adr-coverage` refused, in a change
   whose whole subject was filing one — a documented gate that could not fail
   locally because the instruction did not name it. **plus
   `scripts/e2e-local.sh api` when you touched `apps/api`, plus
   `scripts/e2e-local.sh web:<suite>` when you added or changed a flag-on
   Playwright suite** — before declaring work done, and report failures
   honestly. The e2e half is not optional and not "CI's job": a journey runs
   against a real browser and a real API, so no unit suite can tell you a
   locator, an accessible name or a collapsed panel is wrong. Omitting it cost
   five CI rounds on the ADR-0063 enablement journey, every failure in the test
   rather than the product, every one visible in the first local run. **A local
   database is available and always has been** — that gap was a process gap, not
   a tooling one.
9. **A GitHub `check_suite` event is not proof that CI passed.** Before merging,
   read the check runs for the PR's **current head** (`get_check_runs`) and
   confirm every one is `completed` with `conclusion: success`. A relayed
   "no check in this suite failed" event is a weaker claim than it reads as, in
   three distinct ways, **all three of which occurred on one afternoon**
   (2026-08-22, six times across PRs #347, #349 and #351):

   - **one app can own several suites**, so a suite completing says nothing
     about the run whose jobs you care about;
   - the event can name a **superseded** suite, cancelled by a newer push;
   - the event can name an **older head**, because a push while CI is running
     leaves earlier events queued behind it.

   In the sharpest instance the relay reported success for an app while **two
   jobs inside that same run** — the end-to-end suite and lint/typecheck/unit —
   were both still `in_progress`. Acting on any of the six would have merged a
   PR whose tests had not finished. The event is a good reason to **look**; it is
   not the answer.

   This is not a defect to fix; it is what the signal means. `get_check_runs` on
   the PR is the cheap check, and it caught all six.

   **And `get_check_runs` is itself not the last word when a job sits `queued`.**
   On 2026-08-26 PR #394's three CI jobs read `queued` there for **53 minutes**
   while the run holding them had already finished: the run itself reported
   `completed` / `conclusion: failure`, updated four seconds after it was created.
   `get_workflow_run_usage` settled which was true — **`run_duration_ms` 4000** —
   so nothing had executed and the queue was a display of jobs that would never
   start. The two APIs disagreed and the more reassuring one was wrong.

   So when a job has been `queued` for longer than a runner normally takes, ask
   the **run**, not the check: `get_workflow_run` for its status and conclusion,
   and `get_workflow_run_usage` for **`run_duration_ms`** — a run that reports
   seconds cannot have executed a job body, whatever the check says. That is also
   what distinguishes a runner-allocation failure from a real one, and therefore
   what makes a single re-run the right response rather than a way of not reading
   a log.

   **Not `billable`.** That field reads `0` for every job in this repository —
   it is **public**, so Actions minutes are free and nothing is ever billed. This
   paragraph said "0 ms means no job body ran" for one commit, which was **false
   the moment it was written**: the very next run, 37 minutes of real work with
   every job green, reported `total_ms: 0` beside `run_duration_ms: 2245000`. A
   decision-bearing claim asserted without checking (ADR-0076 Class 3), inside the
   commit whose subject was checking claims.

10. **Use Conventional Commits** and add a changeset for user-visible change.
    Meet the Feature Completion Criteria (§21) before calling work done.
11. **A claim that decides something must carry its evidence** (ADR-0076). When a
    spec, ADR, plan, risk table or docblock asserts a fact about behaviour — a
    cost, a guarantee, a failure mode, "there is no oracle here", "this is not on
    the request path" — say what was **run or read** to establish it: the command,
    the file and line, or the test. Not a pointer to another document.

- **Re-verify a spec's PROBLEM statement, not only its design.** A problem goes
  stale in the one direction nobody checks: somebody fixes it and the document
  keeps complaining. ADR-0097 Landing C's spec listed four symptoms and **two
  were false**, both describing behaviour ADR-0091 M7 had already changed — plus
  a deletion list naming two constants M7 had already removed, and a
  `CHROME_RESIDUAL_PX` cost M7 had already recovered. Three stale claims in one
  document, all from the same milestone, because **a milestone that fixes things
  does not go back and edit the specs that complained about them**. Everything in
  this process re-verifies the solution's citations; nothing was re-verifying the
  problem's. See [`docs/DECISIONS.md`](docs/DECISIONS.md), 2026-08-19.

- **A milestone that claims user-facing capability lands with a journey that
  drives the real product — flag or no flag.** ADR-0081 states this rule in terms
  of "the flag-on journey", and Graphite ships no `VITE_` flag (ADR-0088 D1), so
  the rule was not reached for — and its M6 shipped a drawer with **no entry
  point**, the fifth recorded instance of the class, caught by a specialist review
  rather than by anything automatic. The rule's subject is the **capability**, not
  the flag. A targeted unit suite is not a substitute: the suites for that
  milestone mounted the editor, and the defect was in the seam between the editor
  and the shell.

- **The brief is not evidence.** A claim inherited from the task that started
  the work gets checked like any other. Both recorded instances of this
  failure entered through a brief and were repeated into three or four
  artefacts before anyone opened the file that disproved them.
- **Claims about a dependency's internals are registered**, not just cited:
  add the package, path, line range and an anchor to
  `scripts/dependency-claims.json`. `pnpm check:claims` fails on a citation
  that is not there, so this is a gate rather than a habit.
- This applies to the **decision-bearing** claims, not every sentence. A rule
  that applies everywhere is followed nowhere, and both failures were in the
  small set of statements that changed what got built.

12. **Approved work runs to completion. A status report is not a stopping point.**
    When the product owner has approved a plan or said "drive this to completion",
    the only two reasons to stop are: **every milestone is done**, or **an answer is
    needed that only they can give**. Nothing else qualifies — not a finished
    milestone, not a good moment to summarise, not a long turn.

    - **The failure mode is ending the turn, and it is silent.** On 2026-08-08 an
      approved programme lost **seven and a half hours** between two milestones
      (`ce4e6c5` at 23:33, `b710cbd` at 07:03). Nothing failed and nothing was
      blocked: a milestone landed, a progress report was written, the turn ended,
      and the session sat idle until the product owner typed. From the inside that
      is indistinguishable from working — which is exactly why it needs a rule
      rather than an intention.
    - **So chain the work inside the turn.** Finish a slice, commit it, push it,
      and start the next one **in the same turn**. Report at the end of the turn,
      not instead of continuing.
    - **And arm a wake-up as the FIRST action of the turn** (`send_later`,
      ~25 minutes), carrying the remaining milestone list. Not last, not "before
      the turn ends". A turn boundary is a real limit; being unable to cross it
      alone is not a reason to stop, because the tool to cross it exists. This
      session used that tool to babysit a pull request and not to continue the
      work — which is the whole lesson.
    - **"Before the turn can end" is what this bullet said until 2026-08-25, and
      that wording is the defect.** It permits arming last, and arming last means
      remembering at exactly the moment you are least likely to: a wake-up fired
      at 15:57, was not re-armed, and the session sat idle 16:03–18:02 while the
      product owner had twice asked for continuous progress. Correct advice that
      cannot work is ADR-0076 Class 3 — the same shape as a stage banner telling
      its reader to re-run `ls | wc -l`.
    - **So the instruction lives in the fired message, not in this file.** A
      wake-up's own first line orders its own re-arming, which is the only part
      of the mechanism that does not depend on anybody consulting a document.
      That is ADR-0058's move one layer over — replace vigilance with something
      the machine carries — and 2026-08-25 is the evidence: four wake-ups fired,
      three re-armed themselves correctly, and the fourth stopped only because
      its terminal condition had been met. **It is still not a gate**, and cannot
      be: nothing in CI can observe whether a session re-armed. Treat it as the
      weak instrument §19.11's last bullet describes, and give the message a
      written **terminal condition** so "stop" is a fact it can check rather than
      a judgement it has to make.
    - **Re-arm in RESPONSE TO A FIRING, not whenever progress happens — and if you
      arm one out of band, delete the outstanding trigger first.** On 2026-08-26
      two were live at once: one armed at 11:16 in response to a firing, and a
      second armed at 11:33 mid-turn after a pull request was opened, without the
      first having fired. The older was due at 11:39 carrying **"Branch is pushed;
      no PR opened yet"** and a milestone listed as remaining that had already
      landed. Had it fired it would have sent the session to write an ADR that
      existed and open a pull request that was open. The bullet above puts the
      re-arming instruction inside the fired message precisely so the mechanism
      cannot go stale — and this is the mechanism going stale anyway, by being
      duplicated, which no amount of care inside one message can prevent. Found
      only because the product owner asked whether the wake-ups were working.
      `list_triggers` shows what is outstanding; `delete_trigger` removes it.
    - **And if the chain looks dead, re-arm anyway — a firing you have not yet
      been told about cannot be responded to.** On 2026-08-27 a wake-up fired at
      16:06:24 (`trig_016ak7uGrZ3n9Tn7z2ebCLr8`, `ended_reason:
run_once_fired`) and its notification was delivered **at 16:47 — about
      forty-one minutes late**, after the product owner had already asked
      whether the wake-ups were working. Nothing re-armed in between, so the
      loop sat dead with the epic half-built. That is the previous bullet's own
      failure one day later and in the opposite direction: it guards against
      **two** live triggers, and this was **none**.
      **The first version of this bullet said the notification "never
      surfaced", and committed that as fact twenty-five minutes before it
      arrived.** It was late, not lost — an ADR-0076 Class 3 claim asserted
      about a delivery channel whose latency nothing here measures, written into
      the register bullet whose whole subject is not trusting an unobserved
      event. The remedy below does not change, because it covers both cases;
      only the diagnosis was wrong, and it is corrected in place rather than
      quietly edited.
      The bullet above puts the re-arming instruction inside the fired message
      so the mechanism cannot go stale, and that is exactly why it cannot cover
      this case — the instruction is _in the message that was never read_. So
      the rule gains its second half: **whenever you touch an epic whose
      terminal condition is unmet and `list_triggers` comes back empty, arm
      one.** That is a state you can check, rather than an event you have to
      have noticed. It is still not a gate and cannot be: nothing in CI can
      observe whether a session is armed. Weak instrument, per §19.11's last
      bullet — but a checkable state beats a remembered event.
    - **And check the terminal condition is reachable before arming it.** One
      written the same day as this bullet required the work to be "merged and
      released, tag and publish job confirmed" — for a documentation change with
      **no changeset**, which opens no Version Packages PR and cuts no release.
      A loop whose exit test can never pass does not stop; it re-arms forever
      while looking diligent. The failure is the same Class 3 shape as the wording
      three bullets up, committed in the message that fixed it: state the
      condition, then ask what would actually make it true.
    - **If something genuinely needs an answer**, ask it, then **keep working on
      everything that does not depend on it**. A blocking question blocks one
      milestone, not the programme.

13. **A shared primitive's keyboard contract is reviewed before release** (ADR-0111).
    Changing which keys `Deck`, `Toolbar`, `Menu`, `Combobox`, `Tabs`, `Dialog` or a
    `*Field` claims — or where focus goes when one opens, closes, unmounts or shades —
    means running **accessibility-reviewer** (and **component-reviewer** where more than
    one primitive implements the rule) **before** the change ships, not at the next
    epic's gate pass.

    It is not a gate and cannot be. Every defect in this class is a statement about what
    a real browser does with a real focus ring — that a single-line input ignores the
    vertical arrows and a date input does not, that a modal's top layer swallows a
    portalled menu, that `preventDefault` without `stopPropagation` still reaches an
    ancestor through the React tree. jsdom has none of those things, so the unit tier
    structurally cannot ask; a journey can, but only about a path somebody thought to
    drive, and nobody writes one for "press ArrowUp in the date field" before suspecting
    it. **Twice in two days such a change passed every gate here and was wrong — the
    second time inside the fix for the first, already released** (`docs/TECH_DEBT.md`
    #189, then #192). Both were found in minutes by a reviewer that executed the
    component. Treat it as the weak instrument §19.11's last bullet describes.

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

- **database-architect** — design schema/migrations/indexes. **Every schema change goes through
  this agent, without exception** — a new model, a new column, a new index, a new constraint, a data
  migration. This is not "run it when the change looks significant": the judgement about whether a
  change is significant is the judgement the agent exists to make, so making it yourself is skipping
  the step. **Product-owner instruction, 2026-08-09**, after `csp_reports` was hand-written when a
  launched agent returned nothing — the honest failure there was deciding that an unavailable agent
  meant proceeding rather than re-running it, which is exactly the shortcut that only ever gets
  taken under time pressure. **If the agent fails, is empty, or is slow, re-run it. Waiting is the
  cheap option; a migration is the expensive one**, because it applies to a real database, it is
  checksummed the moment it lands, and correcting it costs a second migration in every environment
  rather than an edit.
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
the spec and plan are approved. **A tech-debt row substitutes for stages 1–2 only
while the change adds no new surface** — see that file's "What a tech-debt row
does and does not substitute for" and ADR-0105 for the triggers, which are about
what a change **adds** rather than how large it is.

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
and version-impact assessed — mirrored in the PR template. "Tests" means the
[pre-push gate](docs/TESTING.md) has been **run**, including the e2e half where
the change touches `apps/api` or a flag-on journey — not that tests exist. CI is
the second opinion, never the first.

**Change management:** architectural changes require an ADR (problem, options,
choice, trade-offs, consequences). **Repository maintenance:** run the
**reconciliation pass** ([`docs/RECONCILE.md`](docs/RECONCILE.md), ADR-0058) at
each epic boundary, with a three-month hard floor — architecture, dependencies,
security, performance, tech debt, docs and UI consistency. Its rule is _verify
the claim; do not trust the document_: "review periodically" produced months of
drift, including a stage banner in this file that described a repository with no
domain code while nineteen modules were shipping.
