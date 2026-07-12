# Decision log

A lightweight, chronological log of decisions that shape the project but don't
warrant a full [ADR](adr/). Significant, hard-to-reverse architectural choices
get an ADR instead (and may be linked from here).

> Format: newest first. Each entry records **what** was decided, **why**, and
> any **consequences**. Decisions are not edited once recorded — add a new entry
> to change course.

---

### 2026-07-10 — Activity dependencies: `dependency:*` permission set + link cascade behaviour

**Decision.** For the M4 dependencies slice (ADR-0021, spec
`docs/specs/activity-dependencies.md`): (1) authorise logic edits with a **new
`dependency:*` permission namespace** — `dependency:read` granted to every member
(alongside the other `*:read`), `dependency:create/update/delete` to **Planner +
Org Admin only** (the same "hierarchy write" rule; deliberately **not**
Contributor). (2) When an activity (or an ancestor plan/project/client) is
soft-deleted, its **incident/contained dependencies are soft-deleted in the same
`delete_batch_id`** and reactivated on restore — but restore is **endpoint-guarded**:
a link is only reactivated when **both** its endpoints are active, so a link whose
other end was separately deleted stays soft-deleted (a bounded, documented edge
case). A directly-deleted dependency gets its own fresh batch and has **no
standalone restore endpoint** in this slice.

**Why.** A distinct `dependency:*` set keeps authorisation and audit legible
("who may edit the network" is separate from "who may edit an activity") and is
future-guest-friendly, at the cost of four extra permission codes — cheap. Folding
links into the existing cascade batch keeps delete/restore symmetric with the rest
of the hierarchy (one batch id, one transaction) rather than inventing a second
mechanism; the endpoint-guard prevents a restore from resurrecting a link to an
activity that no longer exists.

**Consequences.** `HIERARCHY_READ`/`HIERARCHY_WRITE` in
`apps/api/src/common/auth/org-permissions.ts` carry the new codes (unit-tested:
Contributor gets `dependency:read` only). The shared `HierarchyLifecycleService`
gains a `dependency` leaf and link-aware cascade/restore (A3) — touching
already-shipped M3 code, so it ships with full M3 regression coverage. These two
choices are recorded here rather than as ADRs (the DAG invariant, which _is_
cross-cutting, is ADR-0021); promote them if a reviewer judges them broadly
load-bearing.

### 2026-07-10 — Activity progress: dedicated endpoint, derived status, paired-constraint invariant

**Decision.** An activity's **progress** (percent complete + actual start/finish)
is reported through a dedicated `PATCH .../activities/:id/progress` endpoint that
requires only `activity:update_progress` (Contributor upward), separate from the
Planner-only `activity:update` that changes logic/definition. `status`
(`NOT_STARTED/IN_PROGRESS/COMPLETE`) is **not** client-settable — it is derived
server-side: a finish date (or 100%) → COMPLETE, a start date (or any %) →
IN_PROGRESS, else NOT_STARTED. Actual dates may be cleared with `null`; an actual
finish requires an actual start and cannot precede it (422). The definition
endpoints never accept progress or CPM-output fields, and this endpoint never
accepts definition fields.

**Why.** The brief's role model gives a **Contributor** the ability to record
progress without editing the schedule's logic — this endpoint + permission is the
first concrete realisation of that split (the first capability separating
Contributor from Viewer). Deriving `status` from the measurable numbers makes a
contradictory state (e.g. `COMPLETE` at 20%) unrepresentable, so clients send one
signal (%/dates) rather than two that can disagree. Using the actual-start signal —
not only the percentage — lets an activity be _in progress at 0%_ (started, no
measurable work yet), which construction planning needs.

**Consequences.** `UpdateActivityProgressDto` carries only `percentComplete`,
`actualStart`, `actualFinish`, `version`. The constraint type/date pairing is
enforced on key-presence in the service **and** by a DB `CHECK`
(`ck_activities_constraint_pair`) as defence-in-depth. The web progress editor
(C2) gates on `activity:update_progress` and shows the derived status read-only.

### 2026-07-10 — Recycle bin: one org-scoped `/deleted` endpoint over a keyset-merged union

**Decision.** Surface the hierarchy's soft-deleted rows through a single
org-scoped endpoint, `GET /organizations/:orgSlug/deleted`, that returns
clients, projects and plans together as a discriminated `DeletedHierarchyItem`
list (`kind`, `id`, `name`, `deletedAt`, `canRestore`), newest-deleted first and
cursor-paginated. It lists **every** soft-deleted row (not just batch roots) and
marks `canRestore = false` when an ancestor is still deleted, so the UI can show
the whole removed subtree and steer the user to restore the parent first
(surfacing the top-down `PARENT_DELETED` invariant without a failed request).
Reading it needs `client:read` (any member, consistent with the active-list
reads); restore keeps its existing per-entity, writer-only endpoints
(`POST .../{id}/restore`). Pagination is keyset over the union: each table is
queried for its own top `limit + 1` by `(deletedAt desc, id asc)` and the
service merge-sorts and slices; the id tiebreaker gives a total order across the
three tables (uuids are globally unique) and keeps a single cascade batch — which
shares one `deletedAt` — deterministically ordered and safe to page.

**Why.** The "recently deleted" screen is one unified, deletion-time-ordered view
with a per-row restore action; a combined endpoint serves it in one request and
centralises the parent-active (`canRestore`) computation server-side, rather than
making the client fan out to three per-entity `?deleted=true` lists and merge
three cursors. Reusing the existing per-entity restore endpoints avoids a second
way to restore. This resolves the deleted-list shape deferred in the hierarchy
plan (`docs/plans/hierarchy-crud.md`, Task E3 / risk row).

**Consequences.** The `order` query param is accepted but ignored (the list is
inherently newest-first) — the same repo-wide pattern already tracked as
[TECH_DEBT.md](TECH_DEBT.md) #19, now showing up in a new place rather than a
one-off exception. The endpoint over-fetches up to `3 × (limit + 1)` rows per
page — fine for the bounded recycle-bin set; if it ever grows hot, a raw
`UNION ALL` keyset query is the next step (TECH_DEBT.md #22). No new ADR: it
composes existing patterns (org scope resolver, `{ data, meta }` envelope,
soft-delete, RBAC) without changing a cross-cutting standard.

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

---

### 2026-07-11 — TSLD editing gesture-routing policy (M2)

**Decision.** On-canvas editing uses **one explicit "Add activity" mode** plus
**hit-zone routing** for everything else inside the default Select mode: empty
canvas → pan (M1, unchanged), bar body → reposition, bar end grab-zone →
dependency-draw, click → select. Only create-by-drag genuinely competes with pan,
so only it gets a mode toggle.

**Why.** Smallest mode surface, zero regression to the M1 pan/zoom path, and
discoverable affordances — see `docs/design/tsld-m2-editing.md` §1 and ADR-0026 D5.

**Consequences.** Hit classification is a pure `classifyHit` helper shared by paint
and pointer so they can't diverge; the gesture machine is a pure reducer. Revisit
if a fuller tool palette proves more discoverable.

### 2026-07-11 — Interim TSLD editing concurrency posture (M2)

**Decision.** Until a plan edit-lock exists, on-canvas editing ships **behind the
`VITE_TSLD_EDITING` flag (off by default)** and relies on **optimistic-locking
`version` 409s surfaced as a non-destructive conflict banner** — never a silent
overwrite.

**Why.** No edit-lock yet; the flag + version-409 banner is the safe interim path
(`docs/design/tsld-m2-editing.md` §3; plan risk "Editing ships before the edit-lock").

**Consequences.** Editing is dark in the default build. The lock (or hardened
concurrency) is the prerequisite to enabling the flag; tracked on the TSLD roadmap.

### 2026-07-11 — Defer client-side link legality pre-check (M2 Slice 2.3)

**Decision.** On-canvas dependency-draw highlights **any** other activity as a drop
target during the rubber-band; it does **not** yet run a client-side cycle/duplicate
**pre-check** to ring only _legal_ targets (ADR-0026 D5's "live legality feedback").
Illegal drops are caught authoritatively by the API (cycle/duplicate → 409) and shown
in the non-destructive conflict banner.

**Why.** The graceful-degradation path (server rejects, banner explains) is correct and
already in place; a live client pre-check duplicates server reachability logic and adds
per-move cost. Deferred to keep Slice 2.3 focused; the ADR contract is otherwise met.

**Consequences.** A user can attempt an illegal link and learn it's illegal only on
drop. Tracked as a follow-up to add the client pre-check (reusing the canvas's existing
`RenderEdge[]`) so the ring reflects legality before release.

**Addendum (follow-up delivered).** The client pre-check now ships (`render/link-legality.ts`):
a pure `linkLegality(pred, succ, type, edges)` mirrors the server invariants (self / duplicate
per `(pred,succ,type)` / cycle via successor→predecessor reachability, ADR-0021). During a draw
the hovered target rings by legality — legal solid, illegal dashed in the critical colour (colour
AND dash, WCAG 1.4.1) — and an illegal drop is short-circuited locally (banner + live region, no
doomed POST). `RenderEdge` gained `type` for the duplicate check. The server stays authoritative;
the pre-check only pre-empts drops the loaded graph already proves illegal.

### 2026-07-11 — Driving-edge definition (TSLD M3)

**Decision.** A dependency edge is **driving** iff its forward timing bound equals its
successor's computed early start — i.e. it is (one of) the binding relationship(s) that
set the successor's start. Computed in the engine from the forward-pass maps as a pure
O(E) post-step (no change to the forward/backward passes), persisted per edge as the
engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches
`version`/`updated_at`), exposed as `DependencySummary.isDriving`.

**Why.** Matches the CPM/GPM "driver" the TSLD promises ("drivers at a glance") and is
derivable with no extra graph traversal. When a constraint clamps a successor's start
above every incoming bound, no edge matches → none drives (the constraint drives),
which is the correct read. Reading only the forward maps means the computed dates are
unchanged, so the golden CPM suite still holds (parity preserved).

**Consequences.** `is_driving` is recomputed on every recalculate and is false until the
first calculation (or for any edge carrying slack). No new ADR — this is a local,
reversible engine-output refinement within ADR-0022's contract; recorded here per the
plan's "short ADR/DECISIONS entry" for the engine change.

**Accessible representation.** The driving distinction is not colour-only on the canvas
(heavier-solid vs thin-dashed) and is carried in **text** in the keyboard-accessible logic
editor (a "Driving" column in the predecessors/successors table — the fuller conforming
alternative). Folding a per-activity driving summary into the canvas's parallel listbox
description (`describeActivity`, alongside the existing "critical" cue) is **deferred to M5**
(accessibility hardening) — a tracked deferral, not a silent gap (CLAUDE.md §13).

**Addendum (M3 close-out).** M3 and M4 shipped their engine/schema/DTO/canvas/endpoint/
packer during the CPM + M2-editing slices; a survey confirmed only one live-refresh gap
remained. `useRecalculate` now also invalidates `dependencyKeys.byPlan`, so the driving-arrow
styling re-pulls after a **reposition-in-time / create-activity** edit (which recalc but don't
otherwise touch the dependency cache — link mutations already invalidate it themselves). The
server always recomputed/persisted `is_driving` correctly; this was purely a client-cache
staleness fix. With it, TSLD **M3** (live critical path + driving arrows) and **M4** (layout
persistence + auto-pack) are complete.

### 2026-07-11 — Free-2D bar drag over dominant-axis lock (TSLD M4)

**Decision.** On the TSLD canvas a body drag moves a bar in **both axes at once** — dx → a
new start day (an **SNET** constraint, recalcs) and dy → a new `laneIndex` (layout only, no
recalc). On drop it commits as **one** optimistically-locked write reporting **only the axes
that changed**: a lane-only move is the minimal `{ laneIndex, version }` PATCH (no recalc); a
time move (± lane) is one `PATCH …/activities/:id` carrying the SNET constraint (and the lane),
followed by the existing recalc. This supersedes the earlier dominant-axis-lock proposal.

**Why.** The user chose direct 2D manipulation as the most literal "drag it where you want it"
model. The two-write concern that had motivated axis-lock **dissolves for a single activity**
(M4's scope — multi-select stays deferred): the single-activity endpoint already accepts the
SNET fields + `laneIndex` + `version` atomically, so there is no ordering/atomicity gap. Per-axis
rounding (`round(dy / LANE_HEIGHT)`, `round(dx → day columns)`) gives a half-cell dead-zone on
each axis, so a mostly-horizontal drag doesn't accidentally re-lane (and vice-versa) — the main
free-2D risk, mitigated without extra threshold machinery.

**Consequences.** No new ADR and no amendment to ADR-0026 (D5/D6 already decide lane persistence
without recalc). Reversible: re-introducing axis-lock would be a gesture-machine-only change. The
keyboard equivalent for the new lane axis (`Alt+↑/↓` in the parallel listbox) ships in the same
slice (WCAG 2.1.1); the in-canvas time nudge and full keymap remain M5 work. The **batch
positions** endpoint is reserved for auto-pack (4.3) and future multi-drag, **not** the single-bar
path.

### 2026-07-11 — Auto-pack lane batch: all-or-nothing concurrency posture (TSLD M4)

**Decision.** "Auto-arrange lanes" repacks the drawn activities into the fewest
non-overlapping-in-time lanes with a pure, deterministic greedy first-fit
(`render/auto-pack.ts`, sorted by `(startDay, endDay, id)`, inclusive-finish per ADR-0023)
and persists **only the minimal set of lane changes** through the batch positions endpoint,
which is **all-or-nothing with per-row optimistic locking**: a single stale `version` refuses
the whole write (409), surfaced via the non-destructive conflict banner with auto-arrange-
specific copy. The action is opt-in (toolbar button + confirm dialog; **no undo yet**), is
**not** optimistically previewed (a bulk reorder reconciles on refetch), and triggers **no
recalc** (lane is layout, ADR-0026 D6). Undated activities are excluded (no x-span to pack).

**Why / contrast with ADR-0022.** The _engine-owned_ CPM batched write bypasses optimistic
locking because the engine is authoritative over the columns it writes; this _user-authored_
layout batch **enforces** it because the planner's `version` is exactly what concurrency must
protect — two planners auto-arranging the same plan must not silently clobber each other.
All-or-nothing matches the mental model: the pack is one operation, and a partial pack could
leave overlapping bars.

**Consequences.** No new ADR (ADR-0026 D5/D6 already decide opt-in auto-pack + layout-without-
recalc). The packer is pure and exhaustively unit-tested and never persists. Undo, and a manual
multi-drag (the batch endpoint's other future consumer), remain follow-up work.

### 2026-07-11 — TSLD accessibility model & canonical keymap (M5)

**Decision.** The TSLD's parallel accessible surface is a single `sr-only` `role="listbox"` driven by
**`aria-activedescendant`** (not roving `tabindex`) over the `aria-hidden` canvas, with the **canvas
ring** as the visible focus and **focus-follows-viewport** panning the minimum distance to keep the
ring on-screen (WCAG 2.4.7 / 2.4.11). The canonical keymap, focused on that listbox and documented
in-app via a `?` shortcuts sheet: `↑/↓/Home/End` navigate; `[`/`]` jump driving-first to the
predecessor/successor (trace the driving path); `Space` announces logic-tie + driving detail
(Tier 2); `Enter` opens the logic editor (Tier 3); edit keys (behind `VITE_TSLD_EDITING`): `Alt+↑↓`
lane, `Alt+←→` SNET day nudge, `n` create. The per-keystroke announcement stays lean (name, dates,
lane, float, critical); driving/ties are on demand, never folded into every keystroke.

**Why.** With the listbox `sr-only` and the visible focus being the _canvas ring_ (not a DOM
outline), roving `tabindex`'s payoff (a native focus ring, simple `:focus` styling) is worthless,
while `aria-activedescendant` keeps **one tab stop** and **one source of truth** — `selectedId`
drives the active option _and_ the ring, so keyboard and visual focus cannot diverge. This refines
the _technique_ ADR-0026 D7 named loosely ("roving tabindex", positioned proxies); the _architecture_
D7 fixed (parallel DOM over an aria-hidden canvas, canvas ring, `useAnnounce`) is unchanged.

**Consequences.** No new ADR and no D7 reversal — a local, reversible ratification. Chain navigation
and the three-tier disclosure are pure reads (ship flag-off in 5.1); the edit keymap + the
coalesce-and-serialize nudge policy harden in 5.2. `accessibility-reviewer` leads the WCAG 2.2 AA
sign-off (plan §M5).

---

## Plan edit-lock — web "pen" layer (edit-lock M2, 2026-07-11)

**Context.** M1 shipped the server edit-lock (ADR-0028): the lease endpoints, the 423 `LockedError`
write-gate (inert behind `PLAN_EDIT_LOCK_ENFORCED`), and the peer hand-off model. M2 is its
front-end realisation — the `features/plan-lock/` "pen" that acquires/holds the lock and gates the
on-canvas schedule editing. Three front-end choices needed settling; all confirmed against the M1
staged-rollout discipline (design: `docs/design/plan-edit-lock-web.md`).

**Decisions.**

- **The pen ships behind `VITE_PLAN_EDIT_LOCK` (default off)** — the mirror of the backend's
  `PLAN_EDIT_LOCK_ENFORCED`. Gating the already-shipped, flag-on activities table on `holdsPen` is a
  live behaviour change, so it must land inert. Rollout **ordering** (ADR-0028 §9): enable the FE
  flag first (users take the pen — harmless while the API still accepts non-holder writes), then flip
  enforcement. Off ⇒ `penManaged: false`: no polling, no heartbeat, no banner, `canEditSchedule ===
canWrite` — today's behaviour byte-for-byte.
- **Release-on-unload uses a keepalive `fetch` DELETE on `pagehide`**, not `navigator.sendBeacon`
  (which is POST-only, whereas release is a DELETE — using it would force a new POST-release alias
  into the M1 API). It fires only while holding; the 120 s TTL is the correctness backstop, so a
  missed beacon just costs the next Planner up to one TTL.
- **A 423 (`LOCKED`) is a lock-state event routed to `EditLockBanner`'s lost-control state**
  (invalidate the lock query → drop to read-only + distinct row-10 copy), kept separate from the 409
  `EditConflictBanner` ("changed elsewhere — refresh"). One surface per concern.

Capability flags (`canAcquire/canRequest/canTakeOver/canOverride`) are server-resolved — the client
renders per the flags and never re-derives lock policy. **No new ADR** (ADR-0028 governs the model,
the 423 vocabulary, the staged rollout, and polling); this note records the FE realisation.

**Addendum (M2 build).** The full ten-row banner (peer request / hand-off / take-over / admin
override) shipped **in M2**, not deferred to M3 as the design doc first scoped. The server
endpoints + hooks already exist and the capability flags are live for any Org Admin / post-grace
peer today, so a partial banner would have shown dead affordances; the component + a11y coverage
landed with the controls. What remains M3 is only the multi-actor Playwright hand-off journey
(TECH_DEBT #27). The row-6 grace countdown is an aria-hidden advisory; per-action announcements use
the banner's own `role="status"` live region as the single source (no duplicate `useAnnounce`).
