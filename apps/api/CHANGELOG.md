# @repo/api

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Activity CRUD API — the leaf of the Client → Project → Plan → Activity
  hierarchy and the atomic unit of a schedule. Activities are created and listed
  under a parent plan (`POST`/`GET /organizations/:orgSlug/plans/:planId/activities`,
  cursor-paginated), and read/updated/soft-deleted/restored by id
  (`/organizations/:orgSlug/activities/:activityId` + `/restore`). Following the
  `plans` module: definition writes (name, code, description, type, duration,
  constraint, lane) are Planner + Org Admin only, org-scoped (anti-IDOR), with
  per-plan name and code uniqueness, optimistic locking, and soft-delete/restore
  via the shared four-level lifecycle (top-down `PARENT_DELETED` invariant). A
  milestone's duration is always coerced to 0, and a schedule constraint's type
  and date must be set (or cleared) together. Progress fields (status / % / actual
  dates) and the engine-owned CPM output columns are deliberately not writable
  here — progress gets its own Contributor-capable endpoint next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity authorisation and lifecycle foundation. New permission codes
  `activity:read|create|update|delete|restore` follow the same Planner+Org-Admin
  "write" rule as the rest of the hierarchy, plus a separate
  `activity:update_progress` granted to Contributor upward — the first capability
  that distinguishes a Contributor from a Viewer, letting them report progress
  (status / % complete / actual dates) without being able to change logic. The
  shared `HierarchyLifecycleService` is extended from three levels to four:
  deleting a plan (or project, or client) now cascades to its activities in the
  same `delete_batch_id`, restoring the parent brings them back, and an activity
  can be soft-deleted/restored on its own (restore requires its parent plan to be
  active — `PARENT_DELETED` otherwise). Adds the `ActivitySummary`/`ActivityType`/
  `ActivityStatus`/`ConstraintType` cross-boundary contracts to `@repo/types`. The
  existing 3-level cascade is covered by regression tests.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress endpoint — `PATCH /organizations/:orgSlug/activities/:activityId/progress`.
  This is the Contributor-capable path: it requires only `activity:update_progress`
  (granted to Contributor upward), so a Contributor can record progress without the
  Planner-only `activity:update` that changes logic or definition — the first
  capability that distinguishes a Contributor from a Viewer. It moves
  `percentComplete` and the actual start/finish dates only; `status` is derived
  server-side (finish/100% → COMPLETE, start/any % → IN_PROGRESS, else NOT_STARTED)
  so it can never contradict the numbers, and an actual finish must have a start and
  cannot precede it (422). Definition endpoints continue to reject progress fields
  and vice-versa.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Activity` domain table — the leaf of the Client → Project → Plan →
  Activity hierarchy and the atomic unit of a schedule — plus the `ActivityType`,
  `ActivityStatus` and `ConstraintType` enums and their migration. Each activity is
  plan-scoped with a denormalised `organization_id` (copied from the parent plan),
  soft-delete + `delete_batch_id`, audit columns (TEXT `created_by`/`updated_by`),
  and an optimistic-locking `version`; name — and optional `code` — are unique per
  plan among live rows via partial-unique indexes. The full field set is persisted
  now (definition: type/duration/constraint/lane; progress: status/percent/actuals;
  engine-owned CPM outputs: early/late dates, total float, critical flags; and a
  reserved `calendar_id`) so the deferred dependencies/calendars/CPM/canvas slices
  are additive. Schema + migration only — no module or endpoint behaviour yet.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Dependency CRUD API — the edges of a plan's schedule network. Dependencies
  are created and listed under a plan
  (`POST`/`GET /organizations/:orgSlug/plans/:planId/dependencies`, cursor-paginated),
  browsed by direction from an activity
  (`GET …/activities/:activityId/predecessors` and `…/successors`), and
  read/updated/soft-deleted by id (`/organizations/:orgSlug/dependencies/:dependencyId`).
  Following the activities module: writes are Planner + Org Admin only, org-scoped
  (anti-IDOR), with both endpoints loaded active and asserted to be in the same plan
  (no cross-plan links), the organisation/plan ids copied from the parent, per-plan
  `(predecessor, successor, type)` uniqueness (`409 DUPLICATE_DEPENDENCY`), a
  self-loop guard (`422 SELF_DEPENDENCY`), optimistic locking (type/lag only — the
  endpoints are immutable), and soft-delete via the shared lifecycle. Responses embed
  the endpoint activity summaries (no N+1). Cycle detection — the DAG guarantee of
  ADR-0021 — lands next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Guarantee the plan's dependency graph stays acyclic (ADR-0021). Creating a
  dependency now runs its load-check-insert inside one transaction under a
  plan-scoped advisory lock: it loads the plan's active edges, walks forward from
  the proposed successor, and rejects the link with `409 CYCLE_DETECTED` if the
  predecessor is already reachable (which would close a cycle). The lock serialises
  concurrent creates within a plan, so the mirror-insert race (`A→B` ‖ `B→A`)
  resolves to exactly one success and one conflict — a cycle can never be persisted.
  Different plans never contend. A pure `wouldCreateCycle` detector (O(V+E)) is
  unit-tested for self/2-node/longer cycles and large graphs; an e2e race test
  asserts the concurrency guarantee.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extend the shared HierarchyLifecycleService so soft-delete/restore includes
  activity dependencies (links). Deleting an activity now also soft-deletes its
  incident links (either direction) in the same batch; deleting a plan/project/
  client sweeps every link contained in the affected plans; a dependency can also
  be soft-deleted directly as its own leaf. Restore reactivates a batch's links
  **endpoint-guarded** — only where both endpoint activities are active — so a link
  whose other end was deleted separately stays soft-deleted (a bounded, documented
  edge case). The four-level M3 cascade/restore is unchanged and fully regression-
  covered.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity-dependency authorisation and contract foundation (ADR-0021). New
  `dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
  every member, `dependency:create/update/delete` for Planner + Org Admin only
  (deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
  (FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
  the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
  logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
  service-layer cycle-prevention strategy; DECISIONS.md records the permission
  namespace and link cascade/restore behaviour.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `ActivityDependency` schema — the typed, lagged logic edge between two
  activities that turns a plan's activities (nodes) into a schedule network. The new
  `dependencies` table carries a `DependencyType` enum (`FS`/`SS`/`FF`/`SF`, default
  `FS`) and a signed working-day `lag_days`, with denormalised `organization_id` and
  `plan_id` (both `RESTRICT` FKs, copied from the endpoints, never client input) and
  two `RESTRICT` FKs to `activities` via named self-relations
  (`Activity.predecessorLinks` / `successorLinks`). Follows the house standards: UUID
  v7 PK, snake_case, timestamptz UTC, TEXT audit ids, optimistic-locking `version`,
  soft delete + `delete_batch_id`. Integrity is enforced in the DB as defence in
  depth: a partial-unique index on `(predecessor_id, successor_id, type)` among live
  rows (per-type uniqueness — allows the SS+FF overlap ladder, blocks exact
  duplicates), a `CHECK` forbidding self-loops, and a `CHECK` bounding `lag_days` to
  −3650…3650, plus direction/plan/org and batch-restore indexes. Schema + migration
  only — the CRUD API, `dependency:*` permissions, cycle detection and lifecycle
  cascade land in follow-up tasks.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.0

### Minor Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the clients REST API — the top level of the Client → Project → Plan
  hierarchy. `GET/POST /organizations/:orgSlug/clients`,
  `GET/PATCH/DELETE /organizations/:orgSlug/clients/:clientId`, and
  `POST .../clients/:clientId/restore`. Reads are open to any member; create/
  update/delete/restore are Planner + Org Admin. Every route resolves the org
  scope from the caller's memberships (404 for non-members), names are unique per
  active org, updates use optimistic locking, and delete is a soft cascade to the
  client's projects and plans (restored together as one batch).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plans REST API — the leaf level of the Client → Project → Plan
  hierarchy and the future host of activities and the TSLD. Create and list are
  nested under a parent project
  (`GET/POST /organizations/:orgSlug/projects/:projectId/plans`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/plans/:planId` and
  `POST .../plans/:planId/restore`). Plans carry `status` (`DRAFT`/`ACTIVE`/
  `ARCHIVED`, default `DRAFT`) and an optional date-only `plannedStart`
  (`YYYY-MM-DD`, stored without timezone drift and validated as a real calendar
  day). Reads are open to any member; create/update/delete/restore are Planner +
  Org Admin. The parent project is resolved active and in-org first (404
  otherwise) and its organisation id is copied onto the plan; names are unique per
  project among active rows; updates use optimistic locking; delete is a soft
  delete (a plan is a leaf); and restore requires the parent project to be active
  (`PARENT_DELETED` otherwise).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the projects REST API — the middle level of the Client → Project → Plan
  hierarchy. Create and list are nested under a parent client
  (`GET/POST /organizations/:orgSlug/clients/:clientId/projects`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/projects/:projectId`
  and `POST .../projects/:projectId/restore`). Reads are open to any member;
  create/update/delete/restore are Planner + Org Admin. The parent client is
  resolved active and in-org first (404 otherwise) and its organisation id is
  copied onto the project (never taken from input); names are unique per client
  among active rows; updates use optimistic locking; delete is a soft cascade to
  the project's plans; and restore brings the batch back but requires the parent
  client to be active (`PARENT_DELETED` otherwise).

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisation recycle-bin endpoint (`GET /organizations/:orgSlug/deleted`):
  one deletion-time-ordered, cursor-paginated list of soft-deleted clients,
  projects and plans, each carrying a `canRestore` flag that is false while an
  ancestor is still deleted (surfacing the top-down restore invariant). Reading
  requires hierarchy read (any member); restore stays on the existing per-entity,
  writer-only `.../{id}/restore` routes. Pagination is keyset over the union of the
  three tables by `(deletedAt, id)`.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Client`, `Project`, and `Plan` domain-hierarchy tables (and the
  `PlanStatus` enum) plus their migration — the organisation-scoped containers the
  scheduling features hang off. Each follows the house standards (UUID v7 PKs,
  snake_case columns, timestamptz UTC, soft delete, audit, optimistic-locking
  `version`) and adds two reusable conventions: a denormalised `organization_id` on
  `Project`/`Plan` (copied from the parent for single-column scope/IDOR checks) and
  a `delete_batch_id` correlation column that groups a row and its subtree for
  cascade soft-delete and one-shot batch restore. Parent FKs are `ON DELETE
RESTRICT`; name uniqueness is per immediate parent among live rows via partial
  unique indexes. Schema and migration only — no module/endpoint behaviour yet.

### Patch Changes

- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- [#8](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/8) [`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container crashing on boot with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
  `@repo/types` shipped raw TypeScript (its `exports` pointed at `src/index.ts`),
  which tools transpile but plain Node cannot load — so the production image
  crashed when the compiled API `require`d it. `@repo/types` now builds to
  `dist/` (ESM + declarations) and its `exports` resolve to the compiled output at
  runtime, while the `development`/`types` conditions still point at source so
  dev, tests, and typecheck are unchanged. The API and web Docker builds compile
  `@repo/types` before the app, and `turbo dev` depends on it too.

- [#4](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/4) [`d69e335`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d69e335041f51290b4acdfb107ac22d69de2e510) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container build: `pnpm deploy` now passes `--legacy`. pnpm v10
  changed `pnpm deploy` to require `inject-workspace-packages=true` (or `--legacy`)
  and otherwise fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, which broke the
  `api` image build. The `--legacy` flag restores the pre-v10 deploy behaviour the
  multi-stage Dockerfile relies on.

- [#9](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/9) [`cd4b43c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cd4b43cbc8746d886ebed89d2293746d28de8166) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two production-image runtime crashes. The generated Prisma client was missing
  from the deployed image (`pnpm deploy` rebuilds node_modules from the store and
  drops it), so the API crashed with "@prisma/client did not initialize yet" — the
  Dockerfile now regenerates the client inside the deployed tree. And the logger
  no longer crashes in development mode when `pino-pretty` (a devDependency, absent
  from the production image) can't be loaded: it falls back to JSON logging.

- [#7](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/7) [`efbc61d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/efbc61d3fcc379826607fc289766d93ab9d141ce) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the API container self-migrating and publish GitHub Releases. The API image
  now ships the Prisma CLI + schema/migrations and applies pending migrations on
  startup (`prisma migrate deploy`) via its entrypoint, so a fresh database is
  migrated automatically — no out-of-band step. The release workflow now also
  creates a GitHub Release for each `vX.Y.Z` tag so the Releases tab reflects
  published versions.
- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation invitations and a transactional-mail port. Org Admins can
  invite by email with a role (`POST /organizations/:orgSlug/invitations`), list
  pending invites, and revoke them; invitees preview by token
  (`POST /invitations/preview`) and accept (`POST /invitations/accept`) to join.
  Tokens are stored hashed (raw value returned once + emailed), invitations expire,
  and accept is transactional. Adds a `MailService` port with a logging stub
  adapter (the accept URL is also returned so onboarding works without a provider)
  and the shared `InvitationSummary`/`InvitationPreview` contracts to `@repo/types`.
  Introduces a `410 Gone` error for expired/revoked invitations.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisations tenancy core. New `Organization` and `OrgMember` models
  (the canonical org-scoping foundation: UUID v7, soft-delete, audit, optimistic
  locking, partial-unique slug and one-membership-per-user indexes) and the
  `organizations` module: `POST /api/v1/organizations` (creator becomes Org Admin,
  atomically, with slug uniquification), `GET /api/v1/organizations` (the caller's
  orgs), and `GET /api/v1/organizations/:orgSlug` (404 for non-members —
  anti-enumeration). The auth seam now hydrates a principal's memberships and
  permissions from the database, so `/api/v1/me` returns real memberships and
  `principal.can(permission, orgId)` is enforced. Adds the shared
  `OrganizationSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add membership management. New endpoints under the organisation scope:
  `GET /api/v1/organizations/:orgSlug/members` (cursor-paginated roster with user
  profiles), `PATCH .../members/:memberId` (change role, Org Admin only, with
  optimistic locking and the last-Org-Admin invariant), and
  `DELETE .../members/:memberId` (soft-delete, Org Admin only, last-admin
  protected). Every route resolves the org scope from the caller's memberships
  (404 for non-members; 403 for insufficient role). Adds the shared
  `OrgMemberSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Establish the core identity & tenancy model and adopt the SchedulePoint
  organisation role set (ADR-0016). `OrganizationRole` is now
  `ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` (replacing the placeholder
  `OWNER / MEMBER / VIEWER`); External Guest is modelled separately, not as a
  member role. The reference-feature role→permission map and RBAC tests are
  updated in step. No runtime behaviour changes yet.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.

### Patch Changes

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
