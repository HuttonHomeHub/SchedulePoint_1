# Decision log

A lightweight, chronological log of decisions that shape the project but don't
warrant a full [ADR](adr/). Significant, hard-to-reverse architectural choices
get an ADR instead (and may be linked from here).

> Format: newest first. Each entry records **what** was decided, **why**, and
> any **consequences**. Decisions are not edited once recorded — add a new entry
> to change course.

---

### 2026-07-09 — Hierarchy: denormalised org id + cascade soft-delete via a batch id

**Decision.** For the Client → Project → Plan hierarchy (and every descendant
table that follows it): (1) **denormalise `organization_id`** onto Project and
Plan — copied from the parent inside the create transaction, never from client
input — in addition to the parent FK; (2) implement delete as a **cascade soft
delete stamped with a shared `delete_batch_id`**, done in the service layer
inside one transaction (parent FKs stay `ON DELETE RESTRICT`), so restoring a
row restores exactly the batch it was deleted with. Restore is **top-down**:
a row can only be restored while its parent is active (`PARENT_DELETED`
otherwise). Both mechanics live in one shared `HierarchyLifecycleService`.

**Why.** Denormalised org id makes every scope/IDOR check and org-scoped query a
single indexed-column filter with no 2–3 table join (the invariant "a child's
org equals its parent's" is enforced in code). A batch id gives symmetric,
one-click cascade restore that matches the brief's soft-delete/restore-for-
planners intent and 90-day retention, without a DB cascade that would hard-delete.

**Consequences.** Recorded in [DATABASE.md](DATABASE.md) (schema, indexes) and
carried by ADR-0008/0012/0016 unchanged (no new ADR). If a second consumer
copies the cascade helper (e.g. the Activities slice), promote both conventions
to a short ADR then. The partial `delete_batch_id` indexes and the shared helper
are the enforcement points.

---

### 2026-07-09 — Web walking skeleton: code-based routing + a tsconfig-extends workaround

**Decision.** For the first web slice, define the TanStack Router route tree in
**code** (`createRoute`/`createRouter` in `apps/web/src/app/router.tsx`) rather
than the file-based route generator that `docs/FRONTEND_ARCHITECTURE.md` names as
the default. Separately, `apps/web/tsconfig.json` extends the shared preset via a
**direct relative path** (`../../packages/config/tsconfig/react.json`) instead of
the `@repo/config` package name.

**Why.** (1) The repo's `web` build is `tsc --noEmit && vite build`; the
file-based generator emits `routeTree.gen.ts` at dev/build time, which would need
to exist before the typecheck step — fragile in a clean CI checkout. Code-based
routing is first-class in TanStack Router, fully type-safe, and needs no codegen
step, keeping the build deterministic. (2) Vite's rolldown transform does not
resolve tsconfig `extends` through pnpm's `node_modules` symlink, so the preset's
own relative `extends` chain mis-resolved; a direct relative path resolves on real
paths for both `tsc` and the bundler.

**Consequences.** Routes are registered centrally; screen components live in
`routes/` and are wired in `app/router.tsx`. Migrating to file-based routing later
is mechanical (move each route object into a file) and can be revisited if the
route count grows. The tsconfig deviation is localised to `apps/web` and
documented inline.

---

### 2026-07-09 — Generalise the repository into a domain-neutral base ("Blank App")

**Decision.** Repurpose this repository from the Bills product into **Blank App**,
a reusable, domain-neutral starter to base future applications on. Renamed the
workspace (`bills` → `blank-app`) and the package scope (`@bills/*` → `@repo/*`),
generalised the resource-scoping model from "household" to "organisation", and
replaced product-specific docs (README, ROADMAP, BACKLOG, worked example) and
guidance with neutral equivalents. Domain assumptions (e.g. money-as-minor-units)
are now framed as **conditional** guidance rather than baked-in rules.

**Why.** The same production-grade foundation — tooling, CI/CD, containers,
architecture, standards, delivery process, agents, and the canonical feature
template — is valuable across many applications, not just one product. A clean
base avoids re-inventing it per project and keeps the quality bar consistent.

**Consequences.** No application/domain code exists; the schema has no models.
Starting a real app means replacing the product-facing docs and building the
first feature from the reference template (`docs/REFERENCE_FEATURE.md`). The
`@repo/*` scope is a convention teams may rename per fork.

---

### 2026-07-09 — Establish a formal delivery process for features

**Decision.** Introduce [`docs/PROCESS.md`](PROCESS.md): every new requirement
goes through business understanding → functional requirements → technical
analysis → solution design → implementation planning, is approved, and only then
implemented. Added feature-spec / implementation-plan templates, a worked
example, a Definition of Ready/Done (Feature Completion Criteria), and a
`feature-analyst` agent; wired the criteria into the PR template and CLAUDE.md.

**Why.** Prevent idea→code shortcuts; ensure every feature is understood,
designed, reviewed, and shipped to the same bar; make the method repeatable and
discoverable for humans and AI assistants.

**Consequences.** Slightly more up-front work per feature, repaid in fewer
reworks and clearer history. The process itself is versioned and evolves via
normal doc updates (and an ADR if it changes architecturally).

---

### 2026-07-08 — Adopt the requested stack for the foundation

**Decision.** Build the repository foundation around Turborepo + pnpm, React +
Vite (Tailwind v4 / shadcn/ui / Lucide), NestJS, PostgreSQL + Prisma, REST +
OpenAPI, Better Auth, Vitest/Supertest/Playwright, Docker + GHCR, GitHub
Actions, and SemVer via Conventional Commits + Changesets.

**Why.** A cohesive, TypeScript-end-to-end stack with strong typing, mature
tooling, and good local/CI ergonomics; matches the product's needs and the
team's direction.

**Consequences.** Established the monorepo layout, shared config/types packages,
and all tooling. Recorded the weightier choices as ADR-0002 (monorepo) and
ADR-0003 (auth).

---

### 2026-07-08 — Money stored as integer minor units

**Decision.** Represent monetary amounts as integers in minor units (e.g.
pence) with an explicit currency code; never floating point.

**Why.** Avoids binary floating-point rounding errors in sensitive data.

**Consequences.** DTOs, Prisma models, and UI formatting must follow this;
documented in [API.md](API.md) and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

### 2026-07-08 — Defer hosting-platform choice

**Decision.** Keep deployment platform-neutral for now (container-first) and
decide the concrete host later.

**Why.** Insufficient information at the foundation stage; premature lock-in is
costly.

**Consequences.** Tracked in [TECH_DEBT.md](TECH_DEBT.md) and the
[roadmap](ROADMAP.md); `docker-publish` targets GHCR so any container platform
can consume the images.
