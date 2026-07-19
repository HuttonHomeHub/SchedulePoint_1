# Decision log

A lightweight, chronological log of decisions that shape the project but don't
warrant a full [ADR](adr/). Significant, hard-to-reverse architectural choices
get an ADR instead (and may be linked from here).

> Format: newest first. Each entry records **what** was decided, **why**, and
> any **consequences**. Decisions are not edited once recorded — add a new entry
> to change course.

---

### 2026-07-19 — Notes: polymorphic single table, `plan_id` on every note, fail-closed parent CHECK (ADR-0046)

**Decision.** Threaded notes are a **single polymorphic `notes` table** (ADR-0046), not
per-entity tables: a `NoteEntityType` discriminator (`PLAN`/`ACTIVITY`; `CLIENT`/`PROJECT`
reserved) + nullable typed parent FKs (`plan_id`, `activity_id`) + a raw-SQL CHECK
`ck_notes_exactly_one_parent` written as `CASE entity_type … ELSE false` so a future enum value
inserted before its CHECK branch **fails closed** (never silently unenforced). A **denormalised
`plan_id` on every note** (an activity note carries its activity's `plan_id`) doubles as the
PLAN-note parent pointer (the `Activity` precedent) **and** the cascade key, so the
`HierarchyLifecycleService` plan-cascade is one join-free `updateMany WHERE plan_id IN (…)` with
no double-count; restore rides the parent's `delete_batch_id` with **no endpoint guard** (a note
has exactly one parent — the `activity_steps` precedent, unlike a dependency's two endpoints).

**Why.** The locked requirement is "drop client/project in later with no rework" — a polymorphic
table extends via a nullable column + one CHECK branch + one cascade sweep, where per-entity
tables would fork the module/table/component/cascade per type. Typed FKs (not a bare
`entity_id`) keep real referential integrity.

**Consequences.** `plan_id` does double duty (parent + scope) — documented, not to be "fixed"
into two columns; it goes nullable via a safe expand-only ALTER only when a parent-less
client/project note lands. Body is plain text 1–5000 (`ck_notes_body_length` backstop). The CPM
engine is untouched (notes are non-scheduling; migration is byte-parity). Author-ownership on
edit/delete, `updated_by` on edit, optimistic-`version` 409, and copy-scope-from-parent are
**service-layer** invariants the DB cannot enforce (M2). Full ADR: `docs/adr/0046-polymorphic-entity-notes.md`.

### 2026-07-17 — L1 resource-levelling schema: `leveling_priority` is nullable (NULL = unset), not defaulted

**Decision.** The client-settable levelling tie-break `activities.leveling_priority` (ADR-0041 §1,
lower = higher priority) is stored **`INT?` — NULLABLE with NO default**, where **NULL = unset** (the
planner has expressed no priority preference). The engine defines NULL ordering: **NULL sorts last /
neutral**, after every explicit integer (documented as ADR-0035 §28). The engine-owned leveled overlay
follows the established engine-column precedents: `leveled_start`/`leveled_finish` are `DATE?` mirroring
`early_start`/`early_finish`; `leveling_delay_minutes` is `INT?` (NULL = "not yet levelled") mirroring the
nullable engine ints `total_float`/`free_float`/`visual_drift_days`; `leveling_window_exceeded` and
`self_over_allocated` are `BOOLEAN NOT NULL DEFAULT false` mirroring `constraint_violated`/
`resource_driver_missing`. `resources.max_units_per_hour` is `DECIMAL(18,4)?` with **NULL = uncapped**
and a nullable-safe `>= 0` CHECK (N21). The two plan flags are `BOOLEAN NOT NULL DEFAULT false`.

**Why.** A `DEFAULT` on `leveling_priority` was deliberately rejected: since lower = higher, a `DEFAULT 0`
would silently make every existing activity **top priority**, and any other constant is an arbitrary
sentinel — either way conflating "no preference" with a real priority value. Nullable-no-default is the
optional-Planner-input precedent already set by `expected_finish`/`visual_start` (vs the always-present
`lane_index`/`schedule_as_late_as_possible` zero/false defaults), keeps the add metadata-only (no backfill),
and lets the engine own NULL ordering in one documented place. NULL `max_units_per_hour` = uncapped is the
parity-preserving default (an uncapped resource is never over-allocated, so the levelling pass has nothing
to resolve and the default recalc stays byte-identical); a `DEFAULT 0` would mean "zero capacity" and
silently over-allocate every existing resource. No plan-level count columns were added: the over-allocation
counts are computed in the schedule summary at read time, exactly like `constraintViolationCount`.

**Consequences.** L1 is fully additive and dark — nothing reads the new columns until the L2 engine pass
lands, and the migration replays clean (verified: `migrate deploy` + an empty schema diff apart from the
pre-existing `parent_id` partial-index declaration drift, and the N21 CHECK rejects a negative
`max_units_per_hour` while accepting NULL and 0). ADR-0035 gains a §28 (levelling semantics, incl. the
NULL-priority ordering) + N21, Accepted with the L3 conformance rung. `@repo/types`/DTOs (L1 later task)
must keep `leveling_priority` nullable and omit the engine-owned leveled columns from write DTOs.

### 2026-07-16 — M4-F8 duplicate-relationship policy: reject per-(pair, type), not per-pair

**Decision.** The "duplicate relationship is rejected" contract (ADR-0035 §13, N04) is scoped to an
**exact duplicate — the same ordered predecessor→successor pair _and_ the same relationship type**,
enforced by the write-path partial-unique index `uq_dependencies_pred_succ_type`. A **different-type**
relationship between the same pair (an FS **and** an SS) is **permitted**. A second FS on an existing
A→B FS is rejected `409 DUPLICATE_DEPENDENCY`; an SS on that pair is allowed (`201`).

**Why.** The fixture's N04 wording ("only one relationship per pair") was a simplification. P6 permits
one relationship of **each of the four types** between a pair, and the FS+SS **ladder**/overlap is a
standard construction technique (start B a bit after A starts, finish B a bit after A finishes) we
deliberately keep. N04's actual intent — never silently dedupe, always reject a _true_ duplicate — is
fully satisfied by per-(pair, type) uniqueness, so no destructive per-pair migration is warranted.

**Consequences.** ADR-0035 §13 gains an M4-F8 amendment paragraph; the CAPABILITY_MATRIX N04 and
section-1 topology rows flip to ✅. The behaviour already shipped with the dependency write-path — the
existing `test/dependencies.e2e-spec.ts` case (dup FS → 409, SS on the same pair → 201) is the
regression guard; the conformance N04 case points to it rather than duplicating the assertion.

### 2026-07-16 — M2 recalc modes: finish-side float + Actual-Dates = max(data date, actual start)

**Decision.** Two semantics for M2 progress ingestion (ADR-0035 §1):

1. **Total float is measured on the finish side** — `workingTimeBetween(earlyFinish, lateFinish)` on
   the activity's own calendar, replacing the previous start-side `lateStart − earlyStart`. For an
   **unprogressed** activity the two spans are equal (byte-identical goldens), but for a **progressed**
   activity the early-start-to-early-finish span is the _remaining_ work, so only the finish side
   reports float on the work that's left.
2. **Actual Dates mode** schedules an in-progress activity's remaining from **`max(data date, actual
start)`** (dropping all predecessor logic). Because N07 forbids an actual after the data date, the
   actual start is always ≤ the data date, so Actual Dates **coincides with Progress Override for the
   fixture's past-dated actuals** (S04 differs from S01 but equals S03 here). The two modes diverge
   only for a future actual start — an engine-level case the boundary rejects.

**Why.** Finish-side float is the P6 meaning for progressed work and is provably parity-preserving for
the planned case. Scheduling remaining from the actual start (rather than into the past) is the only
physically-sensible "actuals never move" reading; there is **no external oracle** (ADR-0034), so this is
SchedulePoint's documented golden and may be revised if a specific P6 behaviour is later required.

**Consequences.** S02/S03/S04 are runnable conformance differentials; S03 ≠ S02 is the definitive
retained-vs-override discriminator. Suspend/resume (ADR-0035 §4) is the one M2 clause still open.

### 2026-07-16 — M5 per-activity calendars: float on the activity's own calendar; activity → plan → 24/7 resolution

**Decision.** With per-activity calendars (ADR-0037), two semantics are locked:

1. **Total float** is measured on the **activity's own** calendar
   (`activityCalendar.workingTimeBetween(earlyStart, lateStart)`), not the plan calendar — matching
   P6 / ADR-0035. It is identical to today when an activity inherits the plan calendar, and changes
   the meaning of the day-denominated `total_float` column only for **mixed-calendar** plans.
2. **Calendar resolution order** is `activity.calendarId → plan.calendarId → null (all-days-work)`.
   A null activity calendar inherits the plan default; a null plan calendar is 24/7.

**Why.** Float in the activity's own working time is what a planner on that crew's calendar expects
("3 days of slack" = 3 of _their_ working days). Inheritance keeps the common case zero-config and the
all-inherit path byte-identical (the golden-suite parity gate). Both are the least-surprising choices
and match the P6 model the conformance fixture benchmarks against.

**Consequences.** The engine moved to an absolute-instant axis (ADR-0037) so the two calendars can
coexist. S05 (successor-calendar lag) became a runnable conformance differential; the per-relationship
lag-calendar capability row is now ✅. Resource calendars / LOE / WBS-summary remain separate M5-epic
rungs. Window-only calendars (turnaround/crane-hire) are honoured per-activity only once in-window
placement lands (an M5-epic edge case) — the conformance adapter keeps those on the plan calendar and
notes it, never silently mis-scheduling.

### 2026-07-15 — M3 lag-calendar scope: only the 24-Hour half is a differential (setting-sensitive → M5)

**Decision.** M3 (per-relationship lag calendars, ADR-0036 §6) realises **only the 24-Hour
(elapsed) lag calendar** as a runnable conformance differential. The fixture's
`lag_calendar_setting_sensitive` case (scenario S05, Predecessor-vs-Successor) is **re-scoped to
M5**, correcting the M3 acceptance in the implementation plan.

**Why.** S05 needs the predecessor and successor to schedule on **different** calendars for the
lag-calendar setting to change any date — i.e. per-**activity** calendars, which ADR-0024
deferred to M5. In M3 all activities schedule on the single plan calendar, so `PREDECESSOR`,
`SUCCESSOR` and `PROJECT_DEFAULT` all resolve to the same calendar; only `TWENTY_FOUR_HOUR`
(elapsed time) is behaviourally distinct. Claiming S05 in M3 would be a false differential (its
output can't differ from S01). The product owner approved landing all four enum options now
(Pred/Succ forward-wired, honest microcopy) with only 24-Hour asserted.

**Consequences.** The capability-matrix "Per-relationship lag calendar" row is **🟡** (24-Hour ✓,
setting-sensitive → M5); scenario **S06** is a runnable differential (`resultsDiffer(S06, S01)`),
**S05** stays `todo` → M5. The lag DTO/enum surface is complete now, so M5 adds no new API
surface — it only makes Pred/Succ resolve to distinct per-activity calendars. Engine detail: the
lag `applyLag` anchor→instant conversion is START/FINISH-aware (ADR-0023) so the forward/backward
walks invert across a non-working gap (no spurious negative float); undefined lag calendar stays
the literal `anchor + lag` fast path, so the golden suite is byte-identical.

### 2026-07-13 — On-canvas TSLD activity labels (extension within ADR-0026 D1)

**Decision.** The TSLD canvas now draws each activity's label (`{code} {name} · {n}d`) directly
on the diagram (spec `docs/specs/tsld-activity-labels.md`), realising the on-canvas text ADR-0026
D1 named-and-budgeted ("text is the dominant cost, and is budgeted") and deferred. It is an
**extension within ADR-0026 — no new ADR** (ui-architect confirmed: it changes no
coordinate/viewport/state/interaction/a11y decision, adds no dependency or data model, and the
DOM-overlay alternative is the very option ADR-0026 rejected). Key choices:

- **Canvas `fillText`, not a DOM overlay.** Activity labels have independent x's, move on both
  axes, and are far more numerous than the ruler's pooled labels (whose one-`translateX`/frame
  trick doesn't generalise) — canvas text folds into the single O(visible) base-layer repaint.
- **One shared identity builder.** `activityLabel(a)` (`code name`) in `render/a11y.ts` feeds
  `describeActivity`, `chainNeighbour`, **and** the bar label (`activityBarLabel` = identity +
  ` · Nd`), so the visible label and the accessible name never disagree on _which_ activity a bar
  is (WCAG 2.5.3). Duration is supplementary visual detail; the identity stays the shared prefix.
- **Adaptive placement, culled + LOD-gated.** Inside a wide-enough bar (truncated + ellipsised to
  fit — no clip needed), beside a short bar/milestone when the same-lane neighbour leaves room,
  else suppressed; hidden below `LABEL_MIN_PX_PER_DAY`. The visible set is bucketed by lane and
  x-sorted **once per frame** (O(v log v)) for the beside-neighbour x — never a per-label scan.
- **Contrast by paired tokens.** Inside text uses each fill's `*-foreground` token
  (`--color-primary/destructive/warning-foreground`); beside text uses `--color-foreground`. A
  new `render/measure.ts` memoises `measureText` widths (font-stable, keyed by text) so a label
  measures at most once ever.

**Consequences.** A sixth **"Labels"** view toggle (default on) joins the five existing ones; the
render model gains a pre-built `label: string` at the `to-render-model.ts` seam (stays enum-free).
The four label text tokens are recorded in `docs/DESIGN_SYSTEM.md`. Perf re-verified honestly on
the ADR-0026 real-Chromium spike **after correcting its label path** (the harness had drawn a bare
`fillText` on 2–6-char labels — it never exercised truncation, the width cache, or lane placement;
it now measures realistic `{code} {name} · {n}d` labels through the same code the painter runs):
**p95 9.4ms draw at 2,000 activities** (median 6ms), versus a **3.6ms** labels-off baseline in the
same harness — comfortably inside the ADR-0026 60fps CPU draw budget (≤16ms) with ~40% headroom.
(The earlier "3.9ms" figure was the labels-off draw mislabelled as with-labels; it is corrected
here.) The painter also computes each visible activity's screen rect **once per frame** (shared by
the bar/label/selection layers) to keep that headroom. No backend, schema, or auth change.
Single-locale LTR text is a documented v1 limitation (the shared builder is the future bidi/locale
seam).

### 2026-07-12 — Navigator in-tree CRUD: `Menu` primitive + shell-layer coordinator seam (ADR-0029 Phase 2)

**Decision.** In-tree create/rename/delete for the Project Explorer (ADR-0029's
named Phase 2, spec `docs/specs/navigator-in-tree-crud.md`) is built as an
**extension within ADR-0029 — no new ADR** — introducing two reusable pieces:
(1) a hand-rolled **`Menu`/`MenuItem`** design-system primitive
(`apps/web/src/components/ui/menu.tsx`) implementing the WAI-ARIA APG "Menu Button"
pattern on semantic HTML (portal-rendered, roving focus, Esc/click-away/Tab
dismissal, focus-return to the trigger) — **no new npm dependency**, mirroring the
`Dialog` focus conventions; and (2) a **`NavigatorCrud` coordinator** in the
composition layer (`apps/web/src/components/layout/navigator/`) that owns the
create/rename/delete dialogs and mutations. The shared tree emits CRUD **intents**
through a feature-local `NavigatorCrudContext` seam, so `features/navigator` never
imports a sibling feature (the coordinator is the single place that imports
clients/projects/plans) — honouring "features → shared, never sideways".

**Why.** The read-only navigator (Phase 1) forced writers out to a management page
and back to shape the hierarchy — the exact context-loss the navigator exists to
remove. ADR-0029 pre-designed the RBAC seam and explicitly named context-menu CRUD,
and this adds **no endpoint, data-model, or cross-cutting-standard change** (it
reuses the existing endpoints, form dialogs, `ConfirmDialog` cascade copy, mutation
hooks, optimistic locking, and soft-delete/Recently-Deleted flow), so it does not
clear the ADR bar. The only genuinely new artifact is the `Menu` primitive, hence
this log entry + its addition to the component inventory.

**Consequences.** Expansion state was **lifted to the shell** (shared by both rails
and the coordinator) so a freshly-created child can be revealed via `expandPath`;
selection remains a pure projection of the URL (ADR-0029), so a new **plan**
navigates (deep-link reveal selects it) while new **folders** are revealed by
expansion, not force-selected. Ships behind `VITE_NAV_TREE_CRUD` (off by default)
and additionally gated by write RBAC. Playwright journeys + the default-on flip
land as a separate, clearly-scoped follow-up once every a11y/journey gate is green.

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

## TSLD editing + edit-lock pen: web flags default ON (2026-07-12)

With every pre-enablement gate green — the flag-on Playwright harness (`test:e2e:edit`),
the a11y sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
(Firefox/Safari/Edge, TECH_DEBT #25a) — the two **web** feature flags now **default ON**
in the shipped bundle (`apps/web/src/config/env.ts`): `VITE_TSLD_EDITING` (on-canvas
create/move/link/relane) and `VITE_PLAN_EDIT_LOCK` (the edit-lock "pen"). A new
`flagDefaultOn` reader treats them as enabled unless explicitly set to `false`/`0`
(rollback / opt-out).

The server-side write-gate `PLAN_EDIT_LOCK_ENFORCED` **stays default-off** — the single
deliberate ops switch, enabled only after a bundle with the pen on is live (ADR-0028 §9
ordering; enabling it ahead of the web bundle would 423 the shipped
activities-table / dependency / recalculate flows). This is the ADR-§9-faithful path:
default flips step 1 (pen) and step 3 (canvas) on; step 2 (enforcement) remains config.

Testing split: the existing `playwright.config.ts` suite is pinned **flags-off**
(`VITE_TSLD_EDITING=false VITE_PLAN_EDIT_LOCK=false`) as the read-only / role-only
baseline regression net; the flags-on editing surface keeps its own `playwright.edit.config.ts`
harness. Recorded as an addendum to **ADR-0028 §9** (no new ADR — the model is unchanged;
only the web defaults flipped).

## Informative TSLD canvas — the viewport/command/ruler seam (2026-07-12)

**Context.** The "Informative TSLD canvas" slice (spec
`docs/specs/tsld-informative-canvas.md`, plan `docs/plans/tsld-informative-canvas.md`,
Task B1) adds a multi-row time-scale ruler, zoom presets + zoom −/+, layer toggles, a
TODAY marker and non-working shading — all client-only, within **ADR-0026**. The one
non-obvious architecture point is the seam between a **ref-authoritative viewport**
(ADR-0026 D3: `viewRef` mutated directly on pan/wheel with **no per-frame `setState`**,
repainted by the existing rAF `frame()` loop off `dirtyRef`/`interactionDirtyRef`) and
three new things that must react to that viewport: a DOM ruler that stays pixel-synced to
the bars, a toolbar that **commands** zoom, and a toolbar that **reflects** the active
zoom preset. This entry records that seam. **No new ADR** — it refines, not changes,
ADR-0026 D3/D7 and its "ruler labels are DOM chrome" note.

**Decisions.**

- **View state (zoom preset + 5 layer toggles) is LOCAL component state in `TsldPanel`,
  not URL.** This supersedes the spec's Q2 default and drops plan Task A3 (the URL search
  schema). `mode`/`fitSignal` already live as `TsldPanel` `useState`; the preset and the
  five toggles join them and pass down as props (`viewToggles`, and the active preset for
  the segmented control). _Why:_ the product owner chose it — the view is a transient,
  per-session reading preference, not a shareable document coordinate; keeping it out of
  the router avoids search-param churn/re-render on every toggle and removes a Zod
  parse/round-trip surface for no user-visible gain at this stage. _Consequence:_ the
  configured view is **not** deep-linkable or reload-stable; if shareability is later
  wanted, promoting these to URL search params (ADR-0004) is a localised `TsldPanel` +
  route change. The **live pan/zoom viewport stays ref-authoritative** regardless (it was
  never a candidate for either state home).

- **The ruler is a DOM overlay rendered _inside_ `TsldCanvas`'s host (`containerRef`),
  updated imperatively from the existing rAF `frame()` loop off the same `viewRef` /
  `sizeRef` the painter reads — never from lagged React state.** It sits last in the host
  (a top band, `aria-hidden`, `pointer-events-none` so pan/zoom/click pass through to the
  canvas beneath). Two-tier update, both driven from `frame()`:
  - **Pan (frequent, per-frame): a single pixel-exact `translateX`.** Because `pan()` only
    adds to `originX` at constant `pxPerDay`, every tick's screen x shifts by the _same_
    origin delta; so `bandContainer.style.transform = translateX(originX − buildOriginX)`
    is exact, not approximate — one style write per frame, no re-tile, no allocation.
    (Vertical pan / `originY` never affects the ruler; only `originX`/`pxPerDay` do.)
  - **Zoom / resize / pan-past-buffer (infrequent): re-tile.** A `rulerBuildRef` snapshots
    `{ pxPerDay, originX, width, height }` at the last build. Each frame compares the live
    `viewRef`/`sizeRef` against it: if `pxPerDay` changed (granularity keyed off `pxPerDay`
    changes the day/month/year rows), or the surface resized, or `|originX − buildOriginX|`
    exceeded the pre-tiled off-screen buffer, it rebuilds the tick DOM from the pure
    `rulerTicks(view, size)` (over the visible day span + buffer only — O(visible), never
    O(plan)), resets the transform to 0, and re-snapshots. Ticks are reconciled against a
    reusable element **pool** (update `textContent`/`left`/`width`, hide surplus) so re-tile
    allocates nothing steady-state. _Why imperative, not a throttled `setState`:_ reading
    `viewRef`/`sizeRef` inside the same `frame()` iteration that calls `paintScene`
    guarantees the ruler and the bars are drawn from **one** viewport snapshot per frame —
    they can never desync, even on a fast fling — and it keeps ADR-0026 D3's zero-`setState`
    rule intact for the whole interactive surface (mirroring the canvas painter exactly). A
    declarative ruler with `setState`-on-re-tile was considered and rejected: it re-renders
    on every wheel tick and risks a one-frame bar/ruler skew if a commit lands a frame late.

- **The toolbar commands zoom through a small imperative handle on `TsldCanvas`** (React 19
  `ref` prop + `useImperativeHandle`), not lifted state or a viewport callback:
  `zoomToPreset(level)` and `stepZoom(factor)`. Each calls the pure, centre-anchored
  `zoomToPreset`/`stepZoom` (render-model), assigns the result to `viewRef.current`, and
  sets `dirtyRef`/`interactionDirtyRef` — the same mutate-ref-and-mark-dirty path pan/wheel
  already use. **Fit stays on the existing `fitSignal` prop** (it already re-fits on
  `dataDate` change too — no reason to churn it). _Why a handle:_ a zoom command is a
  one-shot side-effect on a ref-authoritative object; there is no React state to lift, and
  lifting the viewport into state to let the toolbar compute the new view is exactly the
  per-frame-`setState` path ADR-0026 D3 forbids. The handle keeps the mutation inside the
  canvas, off React's render path.

- **The toolbar's active-preset (`aria-pressed`) is fed back by a coarse
  `onZoomStopChange(level)` callback that fires only when `presetOf(pxPerDay)` crosses a
  band boundary — never per frame.** `presetOf` maps a continuous `pxPerDay` to the single
  owning zoom band (boundaries at the geometric midpoints between `ZOOM_STOPS`), so exactly
  one preset is always lit and it changes only on a crossing. A `lastStopRef` holds the
  last-reported band; the crossing check runs **only at the discrete sites that change
  `pxPerDay`** — the wheel handler, `zoomToPreset`, `stepZoom`, and the fit block — not in
  the general per-frame loop (pan never changes `pxPerDay`, so the frequent path never
  touches it). On a crossing it updates `lastStopRef` and calls `onZoomStopChange`, which
  flips one small piece of `TsldPanel` state. _Tradeoff:_ nearest-band-owns means the
  control shows the closest scale even mid-wheel (stable, minimal `setState`) rather than
  going un-pressed between stops (truthful but flickery); the stable reading was chosen and
  matches the spec's C1 "derive pressed state from `presetOf` with a tolerance" risk note.

- **The new per-frame paint inputs enter via `sceneRef`, not new per-frame plumbing.**
  `TsldScene` gains `view: TsldViewToggles` (`{ dayGrid, monthGrid, yearGrid, today,
nonWorking }`), an optional `isWorkingDay: (dayOffset: number) => boolean` predicate (or
  `null` when the plan has no calendar), and `todayOffset: number | null`. These join the
  existing `sceneRef`-rebuild `useEffect` (which already marks dirty on prop change), so
  they are read once per paint off the ref with zero added per-frame allocation. The
  predicate is built at the mapping seam in `TsldPanel` (from the already-loaded
  `CalendarSummary` mask, plus `useCalendar` exceptions in Phase 2) and **must be
  `useMemo`-stable** (keyed on `calendarId` + exceptions) — an inline closure would re-run
  the effect and repaint every render. The render-model core stays calendar-agnostic
  (ADR-0024); `paintScene` calls the predicate only inside its existing culled visible-day
  grid loop (O(visible columns), one batched wash pass **below** the gridlines) and draws
  the today line above bars/below selection. `todayOffset` is `daysBetween(dataDate,
localTodayIso)` computed once in `TsldPanel`.

**Exact seam shape `TsldCanvas` exposes:**

- Props (all optional; absent ⇒ today's read-only surface, byte-for-byte): `viewToggles:
TsldViewToggles`, `isWorkingDay?: ((dayOffset: number) => boolean) | null`, `todayOffset?:
number | null`, `onZoomStopChange?: (level: ZoomLevel) => void`.
- Imperative handle (via `ref`): `interface TsldCanvasHandle { zoomToPreset(level:
ZoomLevel): void; stepZoom(factor: number): void; }`.
- Unchanged: `fitSignal` still drives Fit; `viewRef` stays the sole viewport authority.

**Risk to editing gestures — checked, none.** The gesture machine reads the viewport only
through `machineCtx()` → `viewRef.current`, and all ghost geometry is derived from the live
`viewRef` each interaction frame (`liveGhostRect`/`dayCellRect` take `view`), never cached in
screen px. So a zoom command or ruler update — which only ever _mutate `viewRef.current` and
set dirty_, exactly as pan/wheel already do — cannot desync an in-flight gesture: the ghost
simply re-derives at the new scale on the next interaction frame. The viewport is never moved
out of its ref, so ADR-0026 D3 holds and the M2/M4/M5 gesture, hit-test and focus-follow paths
are untouched. **No new ADR** (ADR-0026 governs the rendering/viewport/a11y architecture; this
records the readability-layer seam within it).

## M4 advanced constraints — acceptance gate & the violation-output contract (2026-07-16)

M4 lands ADR-0035's constraint clauses; this records the decisions the milestone's design gate (F0)
settles, so the engine slices that follow have a fixed contract. See ADR-0035 §7 amendment and the
acceptance-status ledger.

- **Violation output (§7, Q1).** Mandatory produce-and-flag replaces the current _silent parking_ of
  `MANDATORY_START`/`MANDATORY_FINISH` as MSO/MFO. The engine gains an **engine-owned per-activity
  `constraintViolated` boolean** (the pin overrides a stronger logic bound) and a plan-level
  **`constraintViolationCount`** that **replaces `parkedConstraintCount`** (nothing is parked any
  more). N15's soft case (a `START_ON_OR_AFTER` before the data date, honoured-and-noted) is a
  separate plan-level **`constraintWarningCount`**. Produced, never repaired — the boundary neither
  rejects nor rewrites a mandatory constraint. **No standalone ADR** (no new axis/invariant): recorded
  as the ADR-0035 §7 amendment. `constraintViolated` is engine-owned like the other CPM outputs
  (never client-settable), so the security posture matches `isCritical`/`totalFloat`.
- **ALAP modelling (§11, Q3).** As-Late-As-Possible is a **boolean `scheduleAsLateAsPossible`**, not a
  `ConstraintType` enum value — keeping `ConstraintType` strictly date-bearing. It is delivered as a
  display-only zero-free-float placement pass (the free-float=0 _assertion_ defers to M6, matrix
  "M4/M6").
- **Expected Finish shape (§9, Q2).** A plan-level recalc **option** (`useExpectedFinishDates`,
  mirroring M2's `progressRecalcMode`) plus a per-activity **`expectedFinish` date**, reusing M2's
  remaining-duration seam to resize remaining work to hit the target — not a per-activity boolean.
- **Zero-duration task ≠ milestone (§22).** The engine keys milestone-specific behaviour off an
  **`isMilestone(type)`** predicate, not `duration === 0`, so a zero-duration `TASK` keeps a real
  start+finish and loses the project-finish tie-break to a genuine finish milestone at the same
  instant. Delivered first (F1) behind the byte-parity golden gate.
- **Topology reporting (§13/§14) in scope.** F8 (duplicate-edge reject with the pair named; cycle
  reports naming the exact members) is included in M4 as the last, droppable slice.
- **Total-float mode coincidence (§18, M6-F3).** The plan-level `totalFloatMode`
  (`START`/`FINISH`/`SMALLEST`, default `FINISH`) is implemented, but SchedulePoint measures total
  float on the activity's **own** calendar for **both** the start and finish sides (ADR-0037 §4), so
  the three modes **coincide for every unprogressed activity** — advancing start and finish by the
  duration on one calendar preserves the working-time gap. Consequently the conformance fixture's
  mixed-calendar S13 divergence (`A4340/A7710/A11100/A5500`) is **deliberately not reproduced**
  (verified 0/4). The modes diverge only for a **progressed** activity (frozen actual start ⇒ zero
  start-float). P6's start-vs-finish split measures the two sides on different _neighbour_ calendars —
  a multi-calendar-measurement artefact we don't adopt (north-star, not parity). Recorded as the
  ADR-0035 §18 semantic; no standalone ADR (a consequence of ADR-0037's own-calendar-float decision).
- **Float-path output contract (§19, M6-F6).** `computeFloatPaths(activities, edges, options, target,
maxPaths)` is a pure, read-only analysis returning ranked **contiguous driving chains** into a target
  (not activities sorted by total float): `{ index, relativeFloat, activityIds }`, target-first.
  **Path 0** is the target's driving chain (`relativeFloat` 0); each activity's **non-driving**
  predecessors seed a frontier, and later paths pop the lowest-total-float branch and walk ITS driving
  chain through still-unassigned nodes — so every activity belongs to exactly one path and branch paths
  come out by non-decreasing relative float. `relativeFloat` = the entry activity's total float minus the
  target's; it may be **negative** when a branch is more critical than a floating target (a
  constraint-broken predecessor). Bounded by `maxPaths` + a per-chain depth guard (no blow-up on dense
  graphs). The read endpoint `GET .../schedule/float-paths?target=&maxPaths=` (schedule:read; relative
  float in working days; 422 if the plan has no start date; 404 for a target not in the plan) now exposes
  it — the analysis recomputes the schedule live via the shared engine-input builder, so it can never
  drift from a recalculate (ADR-0035 §19); no standalone ADR (a read-only analysis over the existing
  schedule + driving edges).
