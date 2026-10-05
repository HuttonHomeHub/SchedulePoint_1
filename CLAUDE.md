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

> **Current stage: the application is substantially built.** 25 API modules
> (`apps/api/src/modules/`), 35 Prisma models across 74 migrations, 1477 web
> source files with 47 Playwright suites beside the base journey, and
> 176 ADRs.
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
> Since 2026-07-31 the **application** has a test bed of its own (ADR-0066): a
> catalogue of documented seeded plans and hostile cases (37 at launch, 40 on
> 2026-09-23 — `pnpm check:playbook` prints the current count, so this line does
> not own it) created through the public REST API,
> keyed to [`docs/TEST_PLAYBOOK.md`](docs/TEST_PLAYBOOK.md), which says which plan
> proves what and what _wrong_ looks like. Use it before hand-building a plan to
> reproduce something — and note what it exists to cover: the conformance harness
> proves the **engine**, never a write path, a DTO or a guard.
>
> The **Gantt view shipped** on 2026-07-28 (ADR-0059, `VITE_GANTT_VIEW`
> default-on) — first read-only, with WBS rows, the baseline variance bar and
> a printed programme — and **became a working surface on 2026-08-17** (ADR-0095:
> in-cell editing with per-cell write scope, bar moves, dependency arrows behind a
> default-off toggle; typed dates followed in ADR-0134). It delivers the last
> outstanding Must-have in [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md) §8,
> which words it "read-primary; **edit supported**" — the start-edge resize that
> kept it "substantial" shipped in web 0.157.0 (ADR-0170). This paragraph said "read-only by
> design … Gantt editing is deferred as ADR-0059 M5" until the 2026-09-23 pass,
> five weeks after ADR-0095 shipped. This banner and the PR that shipped it both said
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
│   │   ├── src/modules/      #   25 feature modules
│   │   ├── src/modules/schedule/engine/  # The pure CPM/GPM engine
│   │   ├── src/common/       #   Auth, guards, filters, locks, lifecycle
│   │   ├── prisma/           #   Schema (35 models) + 74 migrations
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
  correctness. Never hand-format to fight the tools. A lint warning fails lint
  (`--max-warnings=0` on every workspace, ADR-0164) — there is no passing state
  that prints a finding nobody reads.
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

- **Trunk-based.** `main` is always releasable — and, by product-owner decision
  (2026-09-11), **not** protected. It carries no branch-protection rule and no ruleset,
  measured three ways that day (`branches?protected=true` → `[]`, `/rulesets` → `[]`,
  authenticated branch list → `protected: false` everywhere) and declined with those
  numbers and the exact steps in front of them. This bullet read "and protected" until
  then, which was false and had been for the project's life.
  **The consequence is one sentence and is not softened: no CI check can block a merge
  here, and none ever has** — not CodeQL, not the end-to-end suite, not the four gates
  ADR-0136 shipped. Every gate is **advisory at the merge boundary**. That is not the
  same as pointless: a gate that reports still tells you before you merge, which is where
  its value was. What replaces enforcement is **§19.9** — which is why that section is a
  rule and not fussiness.
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
  by commitlint — a git hook on every commit, and `.github/workflows/pr-title.yml` on the
  **pull-request title**, which is the subject that actually lands on `main` under
  squash-merge and the one message the hook never sees. That workflow checks the title with
  the ` (#N)` suffix GitHub appends, because a 94-character title is legal and the 101-character
  commit it becomes is not.
- Format: `type(scope): subject` — e.g. `feat(api): add a recurring job scheduler`.
- Allowed types: `feat, fix, docs, style, refactor, perf, test, build, ci, chore,
revert`. Scopes: `web, api, config, types, interchange, db, ci, docs, deps, deps-dev, release,
repo` — `deps-dev` is Dependabot's own output for a development-dependency bump
  (`.github/dependabot.yml` sets `prefix-development`), kept distinct from `deps` because
  `main`'s history already records which bumps were development-only.
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
   "Version Packages" PR's checks never **run**. Neither is a fault. (Read this
   before concluding a release didn't publish — that mistake has been made.)

   **This said the PR "never has any checks" until 2026-09-21, and that is not what
   a reader sees.** Measured on PR #657's head `54ece428` **while it was still
   open**: all three exist as check runs, `completed` with conclusion
   **`action_required`** — created and held pending workflow approval, not absent —
   so the PR reports `mergeable_state: unstable` rather than `clean`. They are
   **check runs, not commit statuses**: the statuses API answers `total_count: 0`
   throughout, so a reader who asks that one is told there is nothing there and is
   reading a different object. The practical consequence is the one the old wording
   described (nothing ran, nothing gates), but a reader checking for "no checks"
   finds three and reasonably stops. Merge it anyway: `main` carries no branch
   protection (§8), the diff is a generated version bump and two changelogs, and its
   content was already validated on the PR that produced the changeset.

   **Re-deriving those three run ids AFTER the merge does not reproduce that
   reading**, which is worth knowing before you conclude this paragraph is wrong.
   The workflow-run objects then read `completed` with conclusion **`failure`**, all
   three `updated_at` landing on the minute #657 merged, and
   `run_duration_ms: 62000` against a 62-second created→updated window — so the
   whole duration is the wait for approval and no job body ran (§19.9's usage
   check, agreeing with the `action_required` reading rather than the `failure`
   one). Whether that is a transition at merge or the two APIs disagreeing was
   **not established**, and one observation does not settle it. What is
   established is that the answer depends on when you take it, so take it on the
   **open** PR — which is the only moment you are deciding anything.

   **And `changeset-release/main` is REUSED across releases**, so the GitHub API
   lists a previous release's runs against the current Version Packages PR — #657
   carried a `PR title` run with conclusion `failure` from an iteration five hours
   earlier, on a different SHA. §19.9's "read the runs for the PR's **current
   head**" is what excludes it; a roster read without that clause reports a red
   check on a PR that has none. The paragraph above is why that compounds rather
   than being a one-off: #657's own three runs are now `failure` on that same
   reused branch, so the next Version Packages PR inherits **three** stale red
   entries rather than one.

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

Recorded as ADRs in [`docs/adr/`](docs/adr/) — **one line per ADR**, the reasoning lives in the
ADR file itself. (§16 carried a long narrative per ADR until 2026-09-29, ~133k tokens loaded into
every session and agent; those narratives are archived verbatim in
[`docs/ADR_REGISTER_HISTORY.md`](docs/ADR_REGISTER_HISTORY.md).) **A new ADR adds one line here**
— `check:adr-coverage` fails otherwise (ADR-0147). Current set:

- **ADR-0001** _(Accepted)_ — Record architecture decisions → [`0001-record-architecture-decisions.md`](docs/adr/0001-record-architecture-decisions.md)
- **ADR-0002** _(Accepted)_ — Monorepo with Turborepo and pnpm → [`0002-monorepo-with-turborepo-and-pnpm.md`](docs/adr/0002-monorepo-with-turborepo-and-pnpm.md)
- **ADR-0003** _(Accepted)_ — Authentication with Better Auth → [`0003-authentication-with-better-auth.md`](docs/adr/0003-authentication-with-better-auth.md)
- **ADR-0004** _(Accepted)_ — Frontend state management → [`0004-frontend-state-management.md`](docs/adr/0004-frontend-state-management.md)
- **ADR-0005** _(Accepted)_ — Routing with TanStack Router → [`0005-routing-with-tanstack-router.md`](docs/adr/0005-routing-with-tanstack-router.md)
- **ADR-0006** _(Accepted)_ — Styling and design tokens → [`0006-styling-and-design-tokens.md`](docs/adr/0006-styling-and-design-tokens.md)
- **ADR-0007** _(Accepted)_ — Forms and validation → [`0007-forms-and-validation.md`](docs/adr/0007-forms-and-validation.md)
- **ADR-0008** _(Accepted)_ — Backend as a modular monolith with layered modules → [`0008-backend-modular-monolith.md`](docs/adr/0008-backend-modular-monolith.md)
- **ADR-0009** _(Accepted)_ — Background processing with BullMQ + Redis → [`0009-background-processing-bullmq.md`](docs/adr/0009-background-processing-bullmq.md)
- **ADR-0010** _(Accepted)_ — Caching strategy with Redis → [`0010-caching-with-redis.md`](docs/adr/0010-caching-with-redis.md)
- **ADR-0011** _(Accepted)_ — File storage via an S3-compatible abstraction → [`0011-object-storage-abstraction.md`](docs/adr/0011-object-storage-abstraction.md)
- **ADR-0012** _(Accepted)_ — Authorization — RBAC with resource scoping → [`0012-authorization-rbac-scoped.md`](docs/adr/0012-authorization-rbac-scoped.md)
- **ADR-0013** _(Accepted)_ — Observability with OpenTelemetry + Pino → [`0013-observability-otel-pino.md`](docs/adr/0013-observability-otel-pino.md)
- **ADR-0014** _(Superseded by ADR-0057)_ — Reference feature as a non-shipping template → [`0014-reference-feature-as-non-shipping-template.md`](docs/adr/0014-reference-feature-as-non-shipping-template.md)
- **ADR-0015** _(Superseded by ADR-0057)_ — Template-driven feature development → [`0015-template-driven-feature-development.md`](docs/adr/0015-template-driven-feature-development.md)
- **ADR-0016** _(Accepted)_ — Core identity & tenancy model + organisation role set → [`0016-core-identity-tenancy-role-model.md`](docs/adr/0016-core-identity-tenancy-role-model.md)
- **ADR-0017** _(Accepted; single-aggregate-tag scheme superseded by ADR-0027)_ — Release tagging & image publishing via GitHub Actions → [`0017-release-tagging-and-image-publishing.md`](docs/adr/0017-release-tagging-and-image-publishing.md)
- **ADR-0018** _(Accepted)_ — Self-migrating container image → [`0018-self-migrating-container-image.md`](docs/adr/0018-self-migrating-container-image.md)
- **ADR-0019** _(Accepted)_ — Shared workspace packages ship compiled output → [`0019-shared-package-build-contract.md`](docs/adr/0019-shared-package-build-contract.md)
- **ADR-0020** _(Accepted)_ — CI builds and smoke-boots the container images → [`0020-ci-image-smoke-boot.md`](docs/adr/0020-ci-image-smoke-boot.md)
- **ADR-0021** _(Accepted)_ — Activity dependency graph — the DAG invariant & service-layer cycle prevention → [`0021-dependency-graph-dag-invariant.md`](docs/adr/0021-dependency-graph-dag-invariant.md)
- **ADR-0022** _(Accepted)_ — CPM execution & persistence model (synchronous endpoint + engine-owned write) → [`0022-cpm-execution-and-persistence-model.md`](docs/adr/0022-cpm-execution-and-persistence-model.md)
- **ADR-0023** _(Accepted; amended by ADR-0036 and ADR-0155)_ — CPM scheduling date convention (continuous-internal / inclusive-display) → [`0023-cpm-scheduling-date-convention.md`](docs/adr/0023-cpm-scheduling-date-convention.md)
- **ADR-0024** _(Accepted; amended by ADR-0036)_ — Working-day calendars (model, engine integration & scope) → [`0024-working-day-calendars.md`](docs/adr/0024-working-day-calendars.md)
- **ADR-0025** _(Accepted)_ — Baselines — snapshot-copy model, one-active-per-plan invariant & server-side working-day variance → [`0025-baselines-snapshot-and-variance.md`](docs/adr/0025-baselines-snapshot-and-variance.md)
- **ADR-0026** _(Accepted)_ — TSLD canvas — Canvas 2D rendering, coordinate/viewport model, interaction & accessibility architecture → [`0026-tsld-canvas-rendering-and-architecture.md`](docs/adr/0026-tsld-canvas-rendering-and-architecture.md)
- **ADR-0027** _(Accepted)_ — Per-package release tagging & per-image versions → [`0027-per-package-release-tagging.md`](docs/adr/0027-per-package-release-tagging.md)
- **ADR-0028** _(Accepted)_ — Single-editor plan edit-lock (advisory lease + peer hand-off + write gate) → [`0028-plan-edit-lock.md`](docs/adr/0028-plan-edit-lock.md)
- **ADR-0029** _(Proposed)_ — Persistent app-shell & hierarchy navigator — evolve `_authed` into a mounted-once shell, URL-derived selection, hand-rolled ARIA tree & virtualization → [`0029-persistent-hierarchy-navigator.md`](docs/adr/0029-persistent-hierarchy-navigator.md)
- **ADR-0030** _(Proposed)_ — Canvas-first plan workspace — the TSLD canvas as the primary surface, with a drag-resizable activity panel → [`0030-canvas-first-plan-workspace.md`](docs/adr/0030-canvas-first-plan-workspace.md)
- **ADR-0031** _(Proposed)_ — TSLD toolbar-item registry & command taxonomy — a declarative registry feeding one APG `<Toolbar>`, a fixed 7-group taxonomy, three prominence tiers, and pen-gated authoring → [`0031-tsld-toolbar-registry-and-taxonomy.md`](docs/adr/0031-tsld-toolbar-registry-and-taxonomy.md)
- **ADR-0032** _(Proposed)_ — Canvas-first plan authoring — a live empty canvas, coalesced auto-recalc, on-canvas activity types, and a two-click Link tool-mode → [`0032-canvas-first-plan-authoring.md`](docs/adr/0032-canvas-first-plan-authoring.md)
- **ADR-0033** _(Accepted; amended by ADR-0148 — the two scheduling modes are gone)_ — Scheduling modes & a de-overloaded plan start — Early/Visual authoring, a Late-Start overlay, advisory `visualStart`, and a mandatory data date → [`0033-scheduling-modes-and-canvas-planning.md`](docs/adr/0033-scheduling-modes-and-canvas-planning.md)
- **ADR-0034** _(Accepted)_ — Engine conformance & validation methodology → [`0034-engine-conformance-methodology.md`](docs/adr/0034-engine-conformance-methodology.md)
- **ADR-0035** _(Proposed; §28 and §31 amended by ADR-0166, §28 again by ADR-0168)_ — SchedulePoint CPM semantics (the golden contract) → [`0035-schedulepoint-cpm-semantics.md`](docs/adr/0035-schedulepoint-cpm-semantics.md)
- **ADR-0036** _(Accepted)_ — Hour/shift-granular calendars & durations (engine rework) → [`0036-hour-granular-calendars-and-durations.md`](docs/adr/0036-hour-granular-calendars-and-durations.md)
- **ADR-0037** _(Accepted)_ — Per-activity calendars & the engine's absolute-instant axis → [`0037-per-activity-calendars-and-instant-axis.md`](docs/adr/0037-per-activity-calendars-and-instant-axis.md)
- **ADR-0038** _(Accepted)_ — WBS activity hierarchy — adjacency-list parent tree & the WBS_SUMMARY type → [`0038-wbs-activity-hierarchy.md`](docs/adr/0038-wbs-activity-hierarchy.md)
- **ADR-0039** _(Accepted)_ — Resource model & resource-calendar scheduling → [`0039-resource-model-and-resource-calendar-scheduling.md`](docs/adr/0039-resource-model-and-resource-calendar-scheduling.md)
- **ADR-0040** _(Accepted)_ — Duration types & the resource-units model → [`0040-duration-types-and-resource-units.md`](docs/adr/0040-duration-types-and-resource-units.md)
- **ADR-0041** _(Accepted; amended by ADR-0071, ADR-0166 and ADR-0168)_ — Resource levelling — the opt-in resource-constrained pass → [`0041-resource-levelling.md`](docs/adr/0041-resource-levelling.md)
- **ADR-0042** _(Accepted)_ — Percent-complete types & Earned Value — the cost/EV read-model → [`0042-percent-complete-types-and-earned-value.md`](docs/adr/0042-percent-complete-types-and-earned-value.md)
- **ADR-0043** _(Accepted)_ — Inter-project external dates (activity-level external early-start / late-finish + ignore-external) → [`0043-inter-project-external-dates.md`](docs/adr/0043-inter-project-external-dates.md)
- **ADR-0044** _(Proposed; amended by ADR-0166)_ — Resource loading curves, cost accrual & weighted activity steps (the final resource-side rung) → [`0044-resource-curves-accrual-steps.md`](docs/adr/0044-resource-curves-accrual-steps.md)
- **ADR-0045** _(Accepted)_ — Live cross-plan / programme scheduling (inter-project Milestone 2) → [`0045-live-cross-plan-programme-scheduling.md`](docs/adr/0045-live-cross-plan-programme-scheduling.md)
- **ADR-0046** _(Accepted)_ — Polymorphic entity notes → [`0046-polymorphic-entity-notes.md`](docs/adr/0046-polymorphic-entity-notes.md)
- **ADR-0047** _(Accepted)_ — Automatic redeploy of released images (host-side pull trigger) → [`0047-automatic-redeploy-on-release.md`](docs/adr/0047-automatic-redeploy-on-release.md)
- **ADR-0048** _(Accepted)_ — Client-side command-stack undo/redo for plan authoring → [`0048-undo-redo-command-stack.md`](docs/adr/0048-undo-redo-command-stack.md)
- **ADR-0049** _(Proposed)_ — Canvas-axis-aligned resource strip — a shared-viewport sibling canvas layer → [`0049-canvas-axis-aligned-resource-strip.md`](docs/adr/0049-canvas-axis-aligned-resource-strip.md)
- **ADR-0050** _(Accepted)_ — Schedule interchange — canonical model + import pipeline → [`0050-schedule-interchange-canonical-model.md`](docs/adr/0050-schedule-interchange-canonical-model.md)
- **ADR-0051** _(Accepted; amended by ADR-0163)_ — External-Guest per-plan share links → [`0051-external-guest-share-links.md`](docs/adr/0051-external-guest-share-links.md)
- **ADR-0052** _(Accepted)_ — TSLD direct manipulation & canvas visual refresh → [`0052-canvas-direct-manipulation-and-visual-refresh.md`](docs/adr/0052-canvas-direct-manipulation-and-visual-refresh.md)
- **ADR-0053** _(Accepted)_ — Calendar scoping tiers & the resource management layer → [`0053-calendar-scoping-and-resource-management.md`](docs/adr/0053-calendar-scoping-and-resource-management.md)
- **ADR-0054** _(Accepted)_ — Canvas live feedback & GPM float/drift visualisation → [`0054-canvas-live-feedback-and-float-visualisation.md`](docs/adr/0054-canvas-live-feedback-and-float-visualisation.md)
- **ADR-0055** _(Accepted)_ — Surface scopes, a designed chrome band, and the canvas visual language → [`0055-designed-chrome-and-canvas-visual-language.md`](docs/adr/0055-designed-chrome-and-canvas-visual-language.md)
- **ADR-0056** _(Accepted)_ — TSLD time-axis legibility & preset framing → [`0056-tsld-time-axis-legibility-and-preset-framing.md`](docs/adr/0056-tsld-time-axis-legibility-and-preset-framing.md)
- **ADR-0058** _(Accepted)_ — Drift control — computed gates and the reconciliation pass → [`0058-drift-control-and-the-reconciliation-pass.md`](docs/adr/0058-drift-control-and-the-reconciliation-pass.md)
- **ADR-0059** _(Accepted)_ — The Gantt view's rendering substrate, and the view seam → [`0059-gantt-view-rendering-substrate-and-the-view-seam.md`](docs/adr/0059-gantt-view-rendering-substrate-and-the-view-seam.md)
- **ADR-0060** _(Accepted; §4 amended by ADR-0169)_ — The tabbed activity editor, per-scope save, the steps edit-lock gate, and the co-located progress model → [`0060-tabbed-activity-editor-and-per-scope-save.md`](docs/adr/0060-tabbed-activity-editor-and-per-scope-save.md)
- **ADR-0061** _(Accepted)_ — Dialog layout: form-layout primitives, and the two-pane editor → [`0061-dialog-layout-system.md`](docs/adr/0061-dialog-layout-system.md)
- **ADR-0062** _(Accepted)_ — Activity-editor convergence: Logic, Resources and Notes as tabs → [`0062-activity-editor-convergence-logic-resources-notes-as-tabs.md`](docs/adr/0062-activity-editor-convergence-logic-resources-notes-as-tabs.md)
- **ADR-0063** _(Accepted)_ — The pinned WBS band, and the canvas band model → [`0063-pinned-wbs-band-and-the-canvas-band-model.md`](docs/adr/0063-pinned-wbs-band-and-the-canvas-band-model.md)
- **ADR-0064** _(Accepted)_ — Canvas authoring flow — the tool-mode contract and recalculation quiescence → [`0064-canvas-authoring-flow.md`](docs/adr/0064-canvas-authoring-flow.md)
- **ADR-0065** _(Accepted)_ — Canvas link routing — orthogonal corridors that step around bars → [`0065-canvas-link-routing.md`](docs/adr/0065-canvas-link-routing.md)
- **ADR-0066** _(Accepted)_ — The seed catalogue, and the engine as the application's oracle → [`0066-the-seed-catalogue-and-the-engine-as-oracle.md`](docs/adr/0066-the-seed-catalogue-and-the-engine-as-oracle.md)
- **ADR-0067** _(Accepted)_ — The window-list editor, and storage honesty in calendar authoring → [`0067-calendar-shift-editor-and-storage-honesty.md`](docs/adr/0067-calendar-shift-editor-and-storage-honesty.md)
- **ADR-0068** _(Accepted)_ — A calendar carries an hours-per-day → [`0068-calendar-hours-per-day.md`](docs/adr/0068-calendar-hours-per-day.md)
- **ADR-0069** _(Accepted)_ — A shared lane-layout package, and packing an imported programme → [`0069-shared-lane-layout-and-packing-at-import.md`](docs/adr/0069-shared-lane-layout-and-packing-at-import.md)
- **ADR-0070** _(Accepted)_ — Sub-day durations and lags in the authoring surface → [`0070-sub-day-durations-and-lags-in-the-authoring-surface.md`](docs/adr/0070-sub-day-durations-and-lags-in-the-authoring-surface.md)
- **ADR-0071** _(Accepted; Gate B's scope amended by ADR-0166)_ — Per-assignment lag, and what it costs the levelling and Earned-Value parity arguments → [`0071-per-assignment-lag.md`](docs/adr/0071-per-assignment-lag.md)
- **ADR-0072** _(Accepted)_ — The append-only audit log, and what "append-only" honestly means here → [`0072-append-only-audit-log.md`](docs/adr/0072-append-only-audit-log.md)
- **ADR-0073** _(Accepted)_ — Which mutations earn an audit event, and who may read an actor-less one → [`0073-audit-coverage-and-actor-less-readability.md`](docs/adr/0073-audit-coverage-and-actor-less-readability.md)
- **ADR-0074** _(Accepted)_ — Account recovery, verification enforcement, and the web origin's first Content-Security-Policy → [`0074-account-recovery-verification-enforcement-and-csp.md`](docs/adr/0074-account-recovery-verification-enforcement-and-csp.md)
- **ADR-0075** _(Accepted)_ — Mail delivery is best-effort, and the failure belongs to the operator → [`0075-mail-delivery-is-best-effort.md`](docs/adr/0075-mail-delivery-is-best-effort.md)
- **ADR-0076** _(Accepted)_ — Wrong claims are a defect class, and three of them are computable → [`0076-wrong-claims-are-a-defect-class.md`](docs/adr/0076-wrong-claims-are-a-defect-class.md)
- **ADR-0077** _(Accepted)_ — The public screens' brand surface — a fourth scope, fixed dark in every theme, and what counts as a brand asset → [`0077-public-screens-brand-surface.md`](docs/adr/0077-public-screens-brand-surface.md)
- **ADR-0078** _(Accepted)_ — Canvas module boundaries — layer painters, a per-frame context, and extraction as a gated move → [`0078-canvas-module-boundaries.md`](docs/adr/0078-canvas-module-boundaries.md)
- **ADR-0079** _(Accepted)_ — Search that navigates: the find cursor, the Escape rule, and zoom-to-selection → [`0079-search-that-navigates.md`](docs/adr/0079-search-that-navigates.md)
- **ADR-0080** _(Accepted)_ — The canvas plural selection, and what a bulk action owes its subject → [`0080-canvas-plural-selection.md`](docs/adr/0080-canvas-plural-selection.md)
- **ADR-0081** _(Proposed)_ — A milestone is its entry point, and the journey is the gate → [`0081-milestone-entry-point-and-journey.md`](docs/adr/0081-milestone-entry-point-and-journey.md)
- **ADR-0082** _(Proposed)_ — A shaded menu item keeps its focus, and its reason → [`0082-disabled-menu-items-stay-reachable.md`](docs/adr/0082-disabled-menu-items-stay-reachable.md)
- **ADR-0083** _(Proposed)_ — A gated form field is read-only, not disabled → [`0083-shaded-form-fields.md`](docs/adr/0083-shaded-form-fields.md)
- **ADR-0084** _(Accepted)_ — A feature flag is a rollback contract with an expiry date → [`0084-feature-flag-retirement.md`](docs/adr/0084-feature-flag-retirement.md)
- **ADR-0088** _(Accepted)_ — Feature flags are classified, not scheduled → [`0088-flag-classification.md`](docs/adr/0088-flag-classification.md)
- **ADR-0089** _(Accepted)_ — One activity field vocabulary, and what a field group is → [`0089-activity-field-vocabulary.md`](docs/adr/0089-activity-field-vocabulary.md)
- **ADR-0090** _(Accepted)_ — The plan-workspace command surface — a row is a budget, and `order` is not a priority → [`0090-the-plan-workspace-command-surface.md`](docs/adr/0090-the-plan-workspace-command-surface.md)
- **ADR-0091** _(Proposed D1–D5; D6 Accepted)_ — A mode is not a command — surface scopes for the plan workspace's command band → [`0091-modes-density-and-the-command-band.md`](docs/adr/0091-modes-density-and-the-command-band.md)
- **ADR-0092** _(Accepted; M5 withdrawn)_ — The canvas dock, and the diagram's vertical budget → [`0092-the-canvas-dock-and-the-diagram-s-vertical-budget.md`](docs/adr/0092-the-canvas-dock-and-the-diagram-s-vertical-budget.md)
- **ADR-0093** _(Accepted)_ — An object action belongs on the object → [`0093-an-object-action-belongs-on-the-object.md`](docs/adr/0093-an-object-action-belongs-on-the-object.md)
- **ADR-0094** _(Accepted)_ — One meaning of "conflict", and a remedy on the object → [`0094-one-meaning-of-conflict-and-a-remedy-on-the-object.md`](docs/adr/0094-one-meaning-of-conflict-and-a-remedy-on-the-object.md)
- **ADR-0095** _(Accepted; amended by ADR-0170)_ — The Gantt becomes a working surface → [`0095-the-gantt-becomes-a-working-surface.md`](docs/adr/0095-the-gantt-becomes-a-working-surface.md)
- **ADR-0096** _(Accepted)_ — Deleted work expires, and purge is refused structurally → [`0096-deleted-work-expires-and-purge-is-refused.md`](docs/adr/0096-deleted-work-expires-and-purge-is-refused.md)
- **ADR-0097** _(Accepted)_ — The design-system rewrite — one theme, a closure instead of a list, the diagram inside the system, and the command surface reshaped → [`0097-a-theme-is-a-system-not-a-palette.md`](docs/adr/0097-a-theme-is-a-system-not-a-palette.md)
- **ADR-0098** _(Accepted)_ — The landing is the organisation overview → [`0098-the-landing-is-the-organisation-overview.md`](docs/adr/0098-the-landing-is-the-organisation-overview.md)
- **ADR-0099** _(Accepted)_ — Graphite — workstation density in rail chrome → [`0099-graphite-the-workstation-in-rail-chrome.md`](docs/adr/0099-graphite-the-workstation-in-rail-chrome.md)
- **ADR-0100** _(Accepted)_ — The canvas minimap — an invariant picture and a DOM rectangle → [`0100-the-canvas-minimap-an-invariant-picture-and-a-dom-rectangle.md`](docs/adr/0100-the-canvas-minimap-an-invariant-picture-and-a-dom-rectangle.md)
- **ADR-0101** _(Accepted)_ — An editor is a dialog, not a drawer → [`0101-an-editor-is-a-dialog-not-a-drawer.md`](docs/adr/0101-an-editor-is-a-dialog-not-a-drawer.md)
- **ADR-0102** _(Accepted)_ — The light corporate theme, and the scope that never reached the painter → [`0102-the-light-corporate-theme.md`](docs/adr/0102-the-light-corporate-theme.md)
- **ADR-0103** _(Accepted)_ — Paper is a surface, and the exported diagram is the diagram → [`0103-paper-is-a-surface.md`](docs/adr/0103-paper-is-a-surface.md)
- **ADR-0086** _(Accepted)_ — A staff identity that cannot reach a customer → [`0086-staff-principal.md`](docs/adr/0086-staff-principal.md)
- **ADR-0087** _(Accepted)_ — This application runs scheduled work, and its first job is a retention sweep → [`0087-scheduled-retention-sweep.md`](docs/adr/0087-scheduled-retention-sweep.md)
- **ADR-0085** _(Accepted)_ — Erasure collides with the audit log, and that collision is the decision → [`0085-privacy-operations.md`](docs/adr/0085-privacy-operations.md)
- **ADR-0106** _(Accepted)_ — A rule is a scene mark; its label is chrome → [`0106-a-rule-is-a-scene-mark-its-label-is-chrome.md`](docs/adr/0106-a-rule-is-a-scene-mark-its-label-is-chrome.md)
- **ADR-0107** _(Accepted)_ — A migration a pristine database cannot test → [`0107-a-migration-a-pristine-database-cannot-test.md`](docs/adr/0107-a-migration-a-pristine-database-cannot-test.md)
- **ADR-0108** _(Accepted; D2 amended by ADR-0169)_ — A modal guards the canvas and nothing else → [`0108-a-modal-guards-the-canvas-and-nothing-else.md`](docs/adr/0108-a-modal-guards-the-canvas-and-nothing-else.md)
- **ADR-0109** _(Accepted)_ — A command surface wraps, and the leading edge belongs to the work → [`0109-a-command-surface-wraps.md`](docs/adr/0109-a-command-surface-wraps.md)
- **ADR-0110** _(Accepted)_ — A gate is verified against the defect it names → [`0110-a-gate-is-verified-against-the-defect-it-names.md`](docs/adr/0110-a-gate-is-verified-against-the-defect-it-names.md)
- **ADR-0111** _(Accepted)_ — A shared primitive's keyboard contract is reviewed before release, not after → [`0111-a-primitives-keyboard-contract-is-reviewed-before-release.md`](docs/adr/0111-a-primitives-keyboard-contract-is-reviewed-before-release.md)
- **ADR-0112** _(Accepted)_ — A header row wraps, and a pen sentence is a fact → [`0112-a-header-row-wraps-and-a-pen-sentence-is-a-fact.md`](docs/adr/0112-a-header-row-wraps-and-a-pen-sentence-is-a-fact.md)
- **ADR-0113** _(Accepted)_ — Measure the problem, not just the remedy → [`0113-measure-the-problem-before-designing-the-remedy.md`](docs/adr/0113-measure-the-problem-before-designing-the-remedy.md)
- **ADR-0114** _(Accepted)_ — A row that cannot shrink is never asked to wrap → [`0114-a-row-that-cannot-shrink-never-wraps.md`](docs/adr/0114-a-row-that-cannot-shrink-never-wraps.md)
- **ADR-0115** _(Accepted)_ — A bound governs what it encloses, and the wrap was measured from one state → [`0115-a-bound-governs-what-it-encloses.md`](docs/adr/0115-a-bound-governs-what-it-encloses.md)
- **ADR-0116** _(Accepted)_ — A health finding is not a conflict, and a report never omits a check → [`0116-a-health-finding-is-not-a-conflict.md`](docs/adr/0116-a-health-finding-is-not-a-conflict.md)
- **ADR-0117** _(Accepted)_ — An icon-only control names itself, and a tooltip states its purpose → [`0117-an-icon-only-control-names-itself.md`](docs/adr/0117-an-icon-only-control-names-itself.md)
- **ADR-0118** _(Accepted)_ — A control height is one decision, and the input is an axis of it → [`0118-a-control-height-is-one-decision-with-an-input-axis.md`](docs/adr/0118-a-control-height-is-one-decision-with-an-input-axis.md)
- **ADR-0120** _(Accepted)_ — A documented obligation with no computed observer → [`0120-a-documented-obligation-with-no-computed-observer.md`](docs/adr/0120-a-documented-obligation-with-no-computed-observer.md)
- **ADR-0121** _(Accepted)_ — One stack derivation, two renderers, and a cap set by height rather than cost → [`0121-one-derivation-two-renderers-and-a-cap-set-by-height.md`](docs/adr/0121-one-derivation-two-renderers-and-a-cap-set-by-height.md)
- **ADR-0119** _(Accepted)_ — A group of buttons says which of them are alternatives → [`0119-a-group-of-buttons-says-which-of-them-are-alternatives.md`](docs/adr/0119-a-group-of-buttons-says-which-of-them-are-alternatives.md)
- **ADR-0122** _(Accepted)_ — A picture a screen reader cannot reach is not described by saying it is → [`0122-a-picture-a-screen-reader-cannot-reach-is-not-described-by-saying-it-is.md`](docs/adr/0122-a-picture-a-screen-reader-cannot-reach-is-not-described-by-saying-it-is.md)
- **ADR-0123** _(Accepted)_ — A search param is a string, and the shape is decided at the router → [`0123-a-search-param-is-a-string-and-the-shape-is-decided-at-the-router.md`](docs/adr/0123-a-search-param-is-a-string-and-the-shape-is-decided-at-the-router.md)
- **ADR-0124** _(Accepted)_ — A register parser finds by structure and refuses by declaration → [`0124-a-register-parser-finds-by-structure-and-refuses-by-declaration.md`](docs/adr/0124-a-register-parser-finds-by-structure-and-refuses-by-declaration.md)
- **ADR-0125** _(Accepted)_ — A delta is not a cause, and the snapshot already exists → [`0125-a-delta-is-not-a-cause.md`](docs/adr/0125-a-delta-is-not-a-cause.md)
- **ADR-0126** _(Accepted)_ — A baseline freezes the plan's shape, or a comparison invents it → [`0126-a-baseline-freezes-the-plans-shape-or-a-comparison-invents-it.md`](docs/adr/0126-a-baseline-freezes-the-plans-shape-or-a-comparison-invents-it.md)
- **ADR-0127** _(Accepted)_ — An overlay draws what it knows, and counts what it does not → [`0127-an-overlay-draws-what-it-knows-and-counts-what-it-does-not.md`](docs/adr/0127-an-overlay-draws-what-it-knows-and-counts-what-it-does-not.md)
- **ADR-0128** _(Accepted)_ — A measurement belongs on the machine that can take it → [`0128-a-measurement-belongs-on-the-machine-that-can-take-it.md`](docs/adr/0128-a-measurement-belongs-on-the-machine-that-can-take-it.md)
- **ADR-0129** _(Accepted)_ — Identity across two imports is the code, and the match is shown before what it produced → [`0129-identity-across-two-imports-is-the-code.md`](docs/adr/0129-identity-across-two-imports-is-the-code.md)
- **ADR-0130** _(Accepted)_ — One press takes every reading, and a sitting is what a reading belongs to → [`0130-one-press-takes-every-reading-and-a-sitting-is-what-a-reading-belongs-to.md`](docs/adr/0130-one-press-takes-every-reading-and-a-sitting-is-what-a-reading-belongs-to.md)
- **ADR-0131** _(Accepted)_ — A spec header states its approval, and a citation is what closes it → [`0131-a-spec-header-states-its-approval-and-a-citation-is-what-closes-it.md`](docs/adr/0131-a-spec-header-states-its-approval-and-a-citation-is-what-closes-it.md)
- **ADR-0132** _(Accepted)_ — An alert says whether it is an event or a standing condition → [`0132-an-alert-says-whether-it-is-an-event-or-a-standing-condition.md`](docs/adr/0132-an-alert-says-whether-it-is-an-event-or-a-standing-condition.md)
- **ADR-0133** _(Accepted)_ — A command surface declares its rows, and the pen leads the one it unlocks → [`0133-a-command-surface-declares-its-rows-and-the-pen-leads-the-one-it-unlocks.md`](docs/adr/0133-a-command-surface-declares-its-rows-and-the-pen-leads-the-one-it-unlocks.md)
- **ADR-0134** _(Accepted; amended by ADR-0170)_ — A typed date writes the constraint a drag writes → [`0134-a-typed-date-writes-the-constraint-a-drag-writes.md`](docs/adr/0134-a-typed-date-writes-the-constraint-a-drag-writes.md)
- **ADR-0135** _(Accepted)_ — A container hands focus back when somebody else removes the control you were on → [`0135-a-container-hands-focus-back-when-somebody-else-removes-the-control-you-were-on.md`](docs/adr/0135-a-container-hands-focus-back-when-somebody-else-removes-the-control-you-were-on.md)
- **ADR-0136** _(Accepted)_ — A rule is enforced where the artefact lands, and the roster is derived → [`0136-a-rule-is-enforced-where-the-artefact-lands.md`](docs/adr/0136-a-rule-is-enforced-where-the-artefact-lands.md)
- **ADR-0137** _(Accepted)_ — A notification is a record, and the build waits for somebody to notify → [`0137-notifications-are-a-record-and-the-build-waits-for-a-second-person.md`](docs/adr/0137-notifications-are-a-record-and-the-build-waits-for-a-second-person.md)
- **ADR-0138** _(Accepted)_ — A shard count is set by where the constraint changes hands → [`0138-a-shard-count-is-set-by-where-the-constraint-changes-hands.md`](docs/adr/0138-a-shard-count-is-set-by-where-the-constraint-changes-hands.md)
- **ADR-0139** _(Accepted)_ — A sentinel is not a calendar → [`0139-a-sentinel-is-not-a-calendar.md`](docs/adr/0139-a-sentinel-is-not-a-calendar.md)
- **ADR-0140** _(Accepted)_ — A diagnostic takes no input, so it cannot ask about anybody → [`0140-a-diagnostic-takes-no-input.md`](docs/adr/0140-a-diagnostic-takes-no-input.md)
- **ADR-0141** _(Accepted)_ — A thumbnail's legibility is a pitch, not a zoom → [`0141-a-thumbnails-legibility-is-a-pitch-not-a-zoom.md`](docs/adr/0141-a-thumbnails-legibility-is-a-pitch-not-a-zoom.md)
- **ADR-0142** _(Accepted)_ — A remedy is measured before it is built → [`0142-a-remedy-is-measured-before-it-is-built.md`](docs/adr/0142-a-remedy-is-measured-before-it-is-built.md)
- **ADR-0143** _(Accepted)_ — A console answers before it reports, and a page is what it is made of → [`0143-a-console-answers-before-it-reports.md`](docs/adr/0143-a-console-answers-before-it-reports.md)
- **ADR-0144** _(Accepted)_ — A landing question is costed before it is answered → [`0144-a-landing-question-is-costed-before-it-is-answered.md`](docs/adr/0144-a-landing-question-is-costed-before-it-is-answered.md)
- **ADR-0145** _(Accepted)_ — A screen is assembled from the archetypes, and a metric names what it measures → [`0145-a-screen-is-assembled-from-the-archetypes.md`](docs/adr/0145-a-screen-is-assembled-from-the-archetypes.md)
- **ADR-0146** _(Accepted)_ — A page has one measure, a column has a reason, and a fact belongs under its row → [`0146-a-page-has-one-measure-and-a-column-has-a-reason.md`](docs/adr/0146-a-page-has-one-measure-and-a-column-has-a-reason.md)
- **ADR-0147** _(Accepted)_ — The register a reader is briefed from is gated too → [`0147-the-register-a-reader-is-briefed-from-is-gated-too.md`](docs/adr/0147-the-register-a-reader-is-briefed-from-is-gated-too.md)
- **ADR-0148** _(Accepted; amended by #421)_ — Visual is the plan; the feasible window and the levelled ghost are overlays → [`0148-visual-is-the-plan.md`](docs/adr/0148-visual-is-the-plan.md)
- **ADR-0149** _(Accepted)_ — A corridor is chosen for what it crosses, and height was never the currency → [`0149-a-corridor-is-chosen-for-what-it-crosses.md`](docs/adr/0149-a-corridor-is-chosen-for-what-it-crosses.md)
- **ADR-0150** _(Accepted)_ — A leg is an obstacle, and the gutter is a channel → [`0150-a-leg-is-an-obstacle-and-the-gutter-is-a-channel.md`](docs/adr/0150-a-leg-is-an-obstacle-and-the-gutter-is-a-channel.md)
- **ADR-0151** _(Accepted)_ — The row is the unit, and a constant carries its justification → [`0151-the-row-is-the-unit.md`](docs/adr/0151-the-row-is-the-unit.md)
- **ADR-0152** _(Accepted)_ — A row is chosen for how its links will route → [`0152-a-row-is-chosen-for-how-its-links-will-route.md`](docs/adr/0152-a-row-is-chosen-for-how-its-links-will-route.md)
- **ADR-0153** _(Accepted)_ — An edit moves only the bar that caused an overlap → [`0153-an-edit-moves-only-the-bar-that-caused-an-overlap.md`](docs/adr/0153-an-edit-moves-only-the-bar-that-caused-an-overlap.md)
- **ADR-0154** _(Accepted)_ — A link says what drives, which way, and how long it waits → [`0154-a-link-says-what-drives-which-way-and-how-long-it-waits.md`](docs/adr/0154-a-link-says-what-drives-which-way-and-how-long-it-waits.md)
- **ADR-0155** _(Accepted)_ — A finish milestone is dated by the day it closes → [`0155-a-finish-milestone-is-dated-by-the-day-it-closes.md`](docs/adr/0155-a-finish-milestone-is-dated-by-the-day-it-closes.md)
- **ADR-0156** _(Accepted)_ — A SchedulePoint layout travels in an inert field that only SchedulePoint reads → [`0156-a-schedulepoint-layout-travels-in-an-inert-field.md`](docs/adr/0156-a-schedulepoint-layout-travels-in-an-inert-field.md)
- **ADR-0157** _(Accepted)_ — A mark's class is its hue and its shape, and the grid is the quietest mark → [`0157-a-marks-class-is-its-hue-and-its-shape.md`](docs/adr/0157-a-marks-class-is-its-hue-and-its-shape.md)
- **ADR-0158** _(Accepted)_ — A link leaves and enters at its node → [`0158-a-link-leaves-and-enters-at-its-node.md`](docs/adr/0158-a-link-leaves-and-enters-at-its-node.md)
- **ADR-0159** _(Accepted)_ — A route reads the text it is drawn beside, and a two-way track splits at its node → [`0159-a-route-reads-the-text-it-is-drawn-beside.md`](docs/adr/0159-a-route-reads-the-text-it-is-drawn-beside.md)
- **ADR-0160** _(Accepted)_ — A gate CI runs is a gate prepush runs → [`0160-a-gate-ci-runs-is-a-gate-prepush-runs.md`](docs/adr/0160-a-gate-ci-runs-is-a-gate-prepush-runs.md)
- **ADR-0161** _(Accepted)_ — A cross-plan link is the same link in one plan → [`0161-a-cross-plan-link-is-the-same-link-in-one-plan.md`](docs/adr/0161-a-cross-plan-link-is-the-same-link-in-one-plan.md)
- **ADR-0162** _(Accepted)_ — A zero-duration task keeps its date, is reported, and converts without moving the schedule → [`0162-a-zero-duration-task-keeps-its-date.md`](docs/adr/0162-a-zero-duration-task-keeps-its-date.md)
- **ADR-0163** _(Accepted)_ — A guest sees the plan as placed → [`0163-a-guest-sees-the-plan-as-placed.md`](docs/adr/0163-a-guest-sees-the-plan-as-placed.md)
- **ADR-0164** _(Accepted)_ — A lint warning is a failure, and a gate has no pass-with-findings outcome → [`0164-a-lint-warning-is-a-failure.md`](docs/adr/0164-a-lint-warning-is-a-failure.md)
- **ADR-0165** _(Accepted)_ — A long table renders the rows in view → [`0165-a-long-table-renders-the-rows-in-view.md`](docs/adr/0165-a-long-table-renders-the-rows-in-view.md)
- **ADR-0166** _(Accepted)_ — Resource load and levelling start where the bar is drawn → [`0166-resource-load-and-levelling-start-where-the-bar-is-drawn.md`](docs/adr/0166-resource-load-and-levelling-start-where-the-bar-is-drawn.md)
- **ADR-0167** _(Accepted; D1 and D3 amended by ADR-0168)_ — Applying levelling is a placement the planner makes → [`0167-applying-levelling-is-a-placement-the-planner-makes.md`](docs/adr/0167-applying-levelling-is-a-placement-the-planner-makes.md)
- **ADR-0168** _(Accepted)_ — Levelling follows the links → [`0168-levelling-follows-the-links.md`](docs/adr/0168-levelling-follows-the-links.md)
- **ADR-0169** _(Accepted)_ — An editor's working state lives for one opening → [`0169-an-editors-working-state-lives-for-one-opening.md`](docs/adr/0169-an-editors-working-state-lives-for-one-opening.md)
- **ADR-0170** _(Accepted)_ — The Gantt's start edge writes what the diagram's writes, counted in working days → [`0170-the-gantts-start-edge-writes-what-the-diagrams-writes.md`](docs/adr/0170-the-gantts-start-edge-writes-what-the-diagrams-writes.md)
- **ADR-0171** _(Accepted)_ — Routes load when they are opened, and the chunk groups that keep that fast → [`0171-routes-load-when-opened-and-the-groups-that-keep-that-fast.md`](docs/adr/0171-routes-load-when-opened-and-the-groups-that-keep-that-fast.md)
- **ADR-0172** _(Accepted)_ — A soft-delete filter is stated at the query, and the build refuses a read that states none → [`0172-a-soft-delete-filter-is-stated-at-the-query.md`](docs/adr/0172-a-soft-delete-filter-is-stated-at-the-query.md)
- **ADR-0175** _(Accepted)_ — A spent budget is reported as a spent budget → [`0175-a-spent-budget-is-reported-as-a-spent-budget.md`](docs/adr/0175-a-spent-budget-is-reported-as-a-spent-budget.md)
- **ADR-0173** _(Accepted)_ — A column's width is the planner's, kept on their device, and its drag has a typed twin → [`0173-a-columns-width-is-the-planners.md`](docs/adr/0173-a-columns-width-is-the-planners.md)
- **ADR-0174** _(Accepted)_ — An activity's history is working memory, not an audit trail → [`0174-an-activitys-history-is-working-memory-not-an-audit-trail.md`](docs/adr/0174-an-activitys-history-is-working-memory-not-an-audit-trail.md)
- **ADR-0057** _(Accepted)_ — Real modules replace the reference template → [`0057-real-modules-replace-the-reference-template.md`](docs/adr/0057-real-modules-replace-the-reference-template.md)
- **ADR-0104** _(Accepted)_ — A shell control whose subject is an organisation is withheld where there is none → [`0104-a-shell-control-whose-subject-is-an-organisation.md`](docs/adr/0104-a-shell-control-whose-subject-is-an-organisation.md)
- **ADR-0105** _(Accepted)_ — A register row is not a spec, and the trigger is capability-shaped → [`0105-a-register-row-is-not-a-spec.md`](docs/adr/0105-a-register-row-is-not-a-spec.md)
- **ADR-0176** _(Accepted)_ — Undo checks before it writes, and sets aside what it cannot apply → [`0176-undo-checks-before-it-writes-and-sets-aside-what-it-cannot-apply.md`](docs/adr/0176-undo-checks-before-it-writes-and-sets-aside-what-it-cannot-apply.md)

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
- **Retention is enforced on three tables and not on `audit_events`, and the difference is a
  decision.** `csp_reports` (30 days), `mail_events` (12 months) and `perf_probe_results`
  (365 days) are swept hourly since 2026-08-10 (ADR-0087) — this application's **first** scheduled
  work of any kind. This bullet said "two tables and not the third" until the 2026-09-08 pass;
  `perf_probe_results` joined `RETENTION_TABLES` at ADR-0128 and the prose was not swept, which is
  the same omission that epic had already found and fixed **in the code** — the `retention.configured`
  boot line named two tables when there were three. One layer out, unnoticed, for a day.
  `audit_events` is **not** swept,
  and may never be: it refuses `UPDATE` and `DELETE` in the database by `ENABLE ALWAYS` triggers, so
  ADR-0085 D3's own 12-month `auth.*` period stays unenforced rather than being bought with the
  structural guarantee ADR-0085 D1 refused to trade (`docs/TECH_DEBT.md` **#118a**). Two more things
  do not follow from "retention is enforced": the CSP period bounds **staleness, not data age**,
  because a violation still being reported never ages out (**#118b**), and nothing is deleted on the
  deployed host for a while yet — `csp_reports` and `mail_events` were created on 2026-08-09 and
  `perf_probe_results` on 2026-09-07, so the sweep correctly reports `deleted: 0` until the periods
  elapse.
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
  What #75 actually establishes — **and the first half of this sentence was
  itself withdrawn on 2026-09-01, which is why it now reads differently**: the
  "no §16 in ADR-0026" finding is **retracted**. ADR-0026 §9b records the
  retraction, and it is right — §9 says "on the **§16 target hardware
  envelope**", an unqualified cross-document reference in the same style as its
  neighbours, and `docs/PROJECT_BRIEF.md` **§16 Deployment** carries exactly the
  browser envelope it names. The real failure was subtler than an invented
  section: a citation that resolves at its origin and stops resolving the moment
  it is copied. This bullet carried the withdrawn version for two days after the
  ADR retracted it — the same propagation failure it was rewritten to record,
  one turn of the wheel later, found by the 2026-09-03 register sweep.
  What DOES stand, and is the half that matters: **4 ms was never a budget** but the measured p95 of a
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
  **Second reading set, 2026-09-08**, taken by the product owner on the ADR-0128
  panel — the two runs #75 had been waiting on since 2026-08-03, at a
  1912×1068 viewport against that set's ~1036×600 canvas. Two things change.
  **The 500-activity limb is measured for the first time and passes at both
  framings** (59.8 fps at Week, 57.2 at Fit, floor 45) — #75's own "genuinely
  open residue", closed. And **cost tracks bars drawn, not plan size**: Week/500
  draws 243 bars at 59.8 fps, Week/2000 draws 267 at 60.0 — four times the plan,
  0.2 fps — while Fit/2000 draws 1,792 at **23.3 fps, 6.7 short of §9's 30 fps
  floor**. So the "PASS at both zooms" verdict no longer holds unconditionally.
  **It is NOT recorded as a regression**: canvas area (~2.3× the pixels), the
  scene, and bars drawn (unrecorded in 2026-08-03's set) all differ, and one
  re-run at ~1036×600 would discriminate. Week is unchanged across both dates.
  The unattributed ~8 ms is still unattributed and still must not be guessed.
  **Five sittings on 2026-09-10 (#75 item 6 and its sub-items) settle it, and
  the 23.3 fps figure above must not be quoted on its own — it is the one
  reading in the whole set that nothing has reproduced.** Same machine, same
  painter and same scene (verified against the tree, not assumed). At
  **1920×1080 — 1.5 % MORE pixels and 1.8 % more bars than the 2026-09-08
  run — Fit/2,000 measures 32.2 fps**, 8.9 fps faster, against a repeat-measured
  noise floor of **0.4 fps**. More work on more pixels, quicker, which no
  monotonic cost model permits from geometry: **the difference is
  between-sitting machine state, not canvas size.** The probe records no power
  state (`docs/TECH_DEBT.md` #283), which is now the leading explanation —
  **deferred on a trigger, and deliberately not work**: the swing is already
  explained and §9 is met, so the field is worth capturing the next time two
  readings disagree, not before.
  **So §9's gate is MET at every judgeable point that reproduces** — 32.2 fps
  fullscreen, 34.8 and 35.2 at 1912×948, 39.5 at the small window, and 60.0 at
  Week at both scales. Three earlier claims are withdrawn with it: #75 item
  5(c)'s "missed at Fit at 2,000"; item 5(f)'s two-term model (whose per-bar
  term alone charges more than the whole measured step, so its area coefficient
  would have to be negative); and the vsync-quantisation hypothesis, which was
  invented to explain a steepness that turned out to be the cross-sitting
  artefact. Within one sitting the response is close to proportional: +10 % bars
  and +14 % area buy +9 % frame time. **#261's exhibit is contaminated by the
  same finding** — its 23.3-against-39.5 pair was never a clean size comparison
  — though its concern stands, since size does cost ~3 fps for 14 % more area
  and §9 still names no display. What survives every sitting unchanged is
  **Week: 60.0 fps, 0.00 pp dropped, at both 500 and 2,000** — the surface a
  planner works on — and **cost tracking bars drawn rather than plan size**.
  **A sixth sitting on 2026-09-21 (#75 item 8) reproduced the 2026-09-10
  figures at the identical 1912×948 viewport**: Fit/2,000 at **34.6 fps**
  against that set's 34.8 and 35.2, eleven days and a browser major version
  apart — 0.6 fps across all three — with Week again 60.0 fps and 0.00 pp at
  both scales. So the **23.3 fps reading of 2026-09-08 remains the one figure
  in this row that nothing has reproduced**, and reading it alone is the
  specific error this bullet warns against.
  **Every reading above pre-dates the painter that ships now** — ADR-0151
  (2026-09-22) and NetPoint-layout (2026-09-23) redrew the bar, the row and the
  link — **and a seventh sitting the same evening measured today's** (#75 item 9,
  the product owner's Surface Pro, DPR 1.5). Both epics' owed readings are taken:
  **Week passes at 500 and 2,000** (60.0 fps, 0.00 pp; FC-N8 passes, FC-L5
  passes combined). Fit/2,000 on that machine went **21.5 → 26.0 fps**, with
  about half the bars on screen at the 60 px pitch — **still under §9's 30 fps
  floor there**, in two sittings, while every Dell sitting since 2026-09-10
  meets it. Whether that fires #75's trigger is the product owner's call.
  **An eighth sitting on 2026-09-28 (#75 item 10, the Dell, `web` 0.152.0) is the first on the
  painter ADR-0157/0158/0159 shipped**: Week 60.0 fps and 0.00 pp at 500 and 2,000, and Fit/2,000
  **45.9 fps with 864 bars** against item 8's 34.6 fps with 1,658. The revision overlay's Fit delta
  there is +0.19 pp, inside a 1.11 pp spread, and Fit is still ungraded by policy.
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
   `scripts/prepush.sh` **derives** them from `package.json` precisely so
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
   read the check runs for the PR's **current head** (`get_check_runs`), **dedupe
   by check-run name keeping the most recently started**, and confirm every
   survivor is `completed` with `conclusion: success`.

   **The roster is a property of the pull request, not of the repository, so never
   count it.** Ten checks come from workflows here — `ci.yml`'s four jobs, one of
   which fans out to four `e2e-web` shards (`quality`, `e2e-api`, four shards and
   `image`), the PR-title check, and CodeQL's two entries; before ADR-0138 it was
   six, `ci.yml` having declared three jobs rather than seven. **Others are
   conditional on what the pull request touches and are declared in no workflow at
   all.** #595 (2026-09-14) carried an eleventh — a `.github/dependabot.yml`
   validation check served by Dependabot's own API — because it edited that file,
   so its `total_count: 11` was eleven distinct names with nothing stale in the
   list.

   **That is also why this stays prose rather than becoming a gate**, against
   ADR-0058's usual preference: the fixed ten could be derived from
   `.github/workflows/` easily enough, and deriving them would keep a number
   accurate while leaving the advice wrong. The number was never the thing worth
   protecting.

   So reading the list before merge is slightly longer and no less necessary: four
   of the ten are shards of what used to be one check, and `fail-fast` is off
   precisely so a second red shard is visible rather than cancelled. **"The
   end-to-end check is green" is no longer a single fact** — and neither is "there
   should be ten of them". The test is that every survivor of the dedupe is
   `completed` with `conclusion: success`, whatever the length.

   **The dedupe clause is not tidiness.** One SHA can carry two runs of the same
   check, and the older one keeps its conclusion for ever. PR #514 is the worked
   example: a 102-character title failed `pr-title.yml` at 23:50:36Z, the title was
   edited at ~23:51:20Z, the workflow re-ran on `edited` exactly as designed and
   passed at 23:51:25Z — and both runs sat on the unchanged head, one green, one
   red. That workflow's `concurrency` group with `cancel-in-progress: true` did not
   help, and correctly so: cancellation applies to runs that are **in progress**,
   and this one had finished 44 seconds before the edit.

   Without the clause, "every one is success" is **false for a PR that is
   perfectly mergeable** — so a reader either refuses it, or learns that some red
   checks are fine to wave through, which is the habit this whole section exists
   to prevent.

   **And the same trap has a second orientation, which is the dangerous one.** PR
   #558 (2026-09-13) carried two runs of that check on one head: `103673366836`
   started 04:35:09 on the **push** and passed, validating the title as it then
   stood; the title was edited at ~04:36, `103673491177` started 04:39:23 on the
   **edit**, and for three minutes it was `queued` while the older one sat there
   green.

   So #514 is stale-**red** beside current-green, and #558 is stale-**green**
   beside current-pending. The first merely blocks a reader. The second would let
   one through: a naive "is there a success for each name?" pass sees a success for
   every check and merges on a run that validated **a title the pull request no
   longer has** — and under squash-merge that title is the commit subject that
   lands on `main`, which is the one thing `pr-title.yml` exists to check.

   Dedupe-by-most-recently-started is what separates them, and it is the only thing
   that does. Both arise identically, so neither is a one-off: the workflow runs on
   `edited`, editing a title creates a run with **no new commit**, and the head
   therefore never moves.

   **A third orientation is `cancelled`, and it is the easiest to wave away.** PR
   #571 (2026-09-13) carried two runs of that same check on one head: run
   `34749224798` created 09:16:36 and **cancelled**, run `34749233467` created
   09:16:54 and **successful**, both `pull_request` on `e8fecae9`. Two events
   landed eighteen seconds apart — a push and a body edit, and the run API records
   only `pull_request`, not which action produced which, so do not read an order
   into it — and `cancel-in-progress: true` killed the one still running. The door
   is therefore wider than a title edit: **any two `pull_request` events close
   together** do it, and the workflow's own docblock discusses that concurrency
   group only as ineffective, never as a producer of a third conclusion.
   The duplicate shows up as a `cancelled` entry beside its successful twin, which
   is exactly what the dedupe removes — and no arithmetic finds it for you, because
   a roster longer than you expected is just as likely to be a conditional check as
   a stale run. It matters because `cancelled` is neither of the two
   conclusions above: it is not `success`, so an undeduped pass **refuses a
   perfectly mergeable PR** and sends the reader looking for a failure that never
   happened. The dedupe handles it; nothing else does.

   A later push sheds the stale run, because check runs are keyed to a **commit**
   — which is what makes the trap narrow and worth stating rather than harmless.
   The case that bites is a title corrected with **no new commit**, and that is how
   a title normally is corrected, since fixing one requires no push at all. So the
   stale failure clears only when something unrelated happens to advance the head,
   and the list itself never says which situation you are in.

   **This is the repository's only merge gate, which is why it is a rule and not
   fussiness.** `main` carries no branch protection, by decision (§8), so nothing on
   GitHub's side ever refuses a red suite. The six near-misses below would be an
   embarrassment on a protected repository; here they were the entire safety margin.

   A relayed
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

   **And when the checks are green, pin the merge to a SHA you OBTAINED — never one
   you completed from a short prefix.** `expectedHeadSha` is the only thing standing
   between "I read the checks for this commit" and "I merged whatever is there now",
   so it is worth nothing if it is guessed. Take the full value from the API, from
   `git rev-parse`, or from `git ls-remote`; a `git log --oneline` gives seven or
   eight characters and the rest is not inferable.

   **The reason this needs saying is that the failure lies to you.** A fabricated pin
   is rejected as `409 Head branch was modified` — the same message GitHub returns
   when somebody really did push — so the obvious reading is that the branch moved
   under you, and the obvious next step is to re-read the checks for a head that never
   changed. It happened on 2026-09-13 merging PR #564: the pin was invented, the
   remote tip was exactly what it had been, and `git ls-remote` settled it in one
   command. Compare the remote tip against your local `git rev-parse` **before**
   concluding anything moved.

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

14. **Spend the expensive model on decisions, not on keystrokes** (product owner, 2026-09-29).
    The standard does not change with the model; what changes is which model does which part.

    - **Opus plans, Sonnet builds, Haiku searches** — and each is pinned in an agent's
      frontmatter, never passed per call from memory. Planners (**feature-analyst**,
      **ui-architect**, **database-architect**) are Opus; implementation goes to the
      **builder** agent and every reviewer, which are Sonnet; read-only code search goes to
      the **explorer** agent, which is Haiku. Do not send implementation to
      `general-purpose`: it inherits the session's model, which is how twenty builder runs
      went to Opus before 2026-09-28 with nothing recording it.
    - **The main session runs Sonnet for build-and-ship stretches and Opus for planning.**
      The session model is the product owner's switch (`/model`), not the assistant's — so
      say when a switch point is reached: after a spec is approved (→ Sonnet), and before the
      next spec, a hard diagnosis or an unexpected gate failure (→ Opus).
    - **Start a fresh session at each batch or epic boundary.** Once a release is confirmed,
      write the hand-off to [`docs/HANDOFF.md`](docs/HANDOFF.md) — what shipped, what is next
      with its approved scope, open decisions, and anything environmental a new session would
      otherwise rediscover — commit it, and tell the product owner to start the next session
      from it. A long session re-reads its whole context on every turn: this one reached
      ~640k tokens before this rule existed.
    - **Keep always-loaded files small.** `CLAUDE.md` is loaded into every session and every
      agent run, so a paragraph added here is paid for hundreds of times. A new ADR adds **one
      line** to §16; reasoning belongs in the ADR, history in `docs/DECISIONS.md`.

## 20. Specialised agents

Subagents live in [`.claude/agents/`](.claude/agents/) (see its
[README](.claude/agents/README.md) for details and when to use each).

**Model routing is set in each agent's frontmatter** (§19.14): planners Opus, **builder** and
every reviewer Sonnet, **explorer** Haiku.

**Implementation and search:**

- **builder** — implements an approved brief (register row, plan milestone, folded finding);
  stops on any ADR-0105 trigger or schema change. Sonnet.
- **explorer** — read-only code search returning `path:line`. Haiku.

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
