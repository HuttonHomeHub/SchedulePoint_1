# ADR-0174: An activity's history is working memory, not an audit trail

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** James Ewbank (product owner — CQ-1 every organisation member, never a guest; CQ-2 kept as
  long as the activity; CQ-3 links and resources from the first release; CQ-4 lane-only moves not
  recorded; CQ-5 a net-zero change inside the merge window leaves no entry; follow-ups: links recorded on
  both ends, names stored as they were at the time, knock-on entries on survivors), with Claude Code
  (data model: database-architect)
- **Builds on:** ADR-0073 §3 (names this feature and excludes it from the audit log), ADR-0072 (the
  append-only log this is deliberately **not**), ADR-0085 D1 (erasure by anonymisation), ADR-0096
  (expiry, which now deletes history explicitly), ADR-0060 / ADR-0169 (per-scope saves), ADR-0048 (undo),
  ADR-0028 (the pen), ADR-0062 / ADR-0101 (the editor and its tabs), ADR-0081 (entry point and journey),
  ADR-0088 D1 (no flag), ADR-0110 (a gate is verified against the defect it names)
- **Spec:** [`docs/specs/activity-change-history/`](../specs/activity-change-history/feature-spec.md)

## Context

ADR-0073 §3 excluded ordinary content edits from the audit log **permanently** and named the feature that
would answer "who changed this duration?" — a per-activity history with "a different table, a different
retention story and a different read model". The product owner asked for it on 2026-10-03, with links and
resource assignments recorded from the first release. Neither `updated_by` (who touched the row last,
about anything), the audit log (an organisation feed, no field edits) nor revision comparison (a
baseline has no author) can say who changed one activity's duration, link or crane, or when.

## Decision

- **D1 — A separate table, mutable by design, never called an audit trail.** `activity_history_entries`
  is an ordinary table: a merge `UPDATE`s an entry, a net-zero change `DELETE`s it, expiry `DELETE`s
  it. It carries no trigger and is **not tamper-resistant**; the audit table refuses `UPDATE` and
  `DELETE` in the database (ADR-0072) and this one must allow both. No copy, route or document may call
  it an audit trail or an "audit log".
- **D2 — What one entry is.** One person's continuous work on one activity in one of five scopes:
  `DEFINITION` (the editor's General / Scheduling / Cost saves, Gantt cell edits, single-bar drags,
  an editor WBS-parent change), `PROGRESS`, `PLACEMENT` (batch moves, batch re-parent, dissolve — M2),
  `LOGIC` (link create / change / delete) and `RESOURCES` (assignment create / change / delete, and the
  duration change the ADR-0040 triad makes in the same write). A write **merges into the activity's
  latest entry** when that entry is by the same user, in the same scope, quiet for at most
  `MERGE_QUIET_GAP_MS` (60 s) and at most `MERGE_MAX_SPAN_MS` (10 min) old, and neither side is a batch.
  The lookup is "the latest entry for this activity"; actor and scope are compared after it, never put
  into it, so my older entry cannot merge past a colleague's newer one. A merged item keeps its original
  `from` and takes the newest `to`. If every item is then net-zero (`from` equals `to`) the entry is
  deleted. The two constants are server constants, so changing them affects only new entries and needs
  no migration (ADR-0151): 60 s joins "drag, look, drag again" and the client already coalesces a held
  arrow key into one request per 150 ms (`use-coalesced-nudge.ts`), and 10 min stops an afternoon of
  nudging becoming one entry that hides three hours.
- **D3 — Inputs only.** The engine's outputs (early / late dates, floats, critical, violation flags,
  the levelled overlay, a link's `is_driving`) and derived status are never recorded: they move whenever
  anything upstream moves and recording them would bury real edits and imply a cause the product cannot
  establish (ADR-0125). Lane-only moves are not recorded (CQ-4); a lane change travels only inside an
  entry that already has another item. A description is stored as `{ len, h }` (length plus truncated
  SHA-256), never the text, so net-zero is exact and entries stay small.
- **D4 — Transactional, before-values read inside the transaction, serialised by a history lock.** The
  recorder runs inside each write's transaction, so a failed record fails the write (a best-effort record
  after commit would leave a silent gap a reader cannot detect). Before-values are read inside the
  transaction before the version-gated update; the gate guarantees that the row read is the row
  replaced. Recorded times are `clock_timestamp()` read **after** the history lock is held, strictly
  increasing per activity (`GREATEST(t, latest.last_recorded_at + 1 ms)`), never `now()`, which is the
  transaction's start and could date an entry before one it has already observed. Merge safety is a
  **two-level transaction advisory lock** (`common/db/activity-history-lock.ts`) taken in one statement:
  each distinct plan **shared** in ascending id order, then each recorded activity **exclusive** in
  ascending id order. Two rules make it deadlock-free by construction: **the history lock is the last
  lock a transaction takes** (after it the transaction writes only history rows, the audit row and
  commits, and those take `FOR KEY SHARE`, compatible with every activity `UPDATE`'s
  `FOR NO KEY UPDATE` because both unique indexes on `activities` are partial), and **one recorder call
  per transaction**, so every acquisition is a single total order. A link write holds neither endpoint's
  row lock, which is why the activity row lock alone cannot be the merge guarantee. Two paths gained a
  transaction to record at all: `DependenciesService.update` and `ResourceAssignmentService.remove`, and
  `ActivitiesService.updateProgress` likewise.
- **D5 — Links on both ends; links and resources named as they were.** A link write records one
  `link:<id>` item on the predecessor (`dir: OUT`) and one on the successor (`dir: IN`), each merging
  against its own latest entry. The other activity or the resource is named in a descriptor
  (`other` / `resource`) as it was at the write, refreshed on a merge and never compared for net-zero; a
  later rename or deletion never rewrites an entry. A link removed and re-created by the ADR-0048 undo
  has a new id, so that is two items, not net-zero — honest, because it is a different row.
- **D6 — Actor by id only.** `actor_user_id` is the opaque Better Auth id with no foreign key; the name
  is resolved at read time, so erasure (ADR-0085 D1) scrubs the user row and every entry resolves to the
  tombstone with no further work. Activity, resource and linked-activity names inside `changes` are
  content, with the same status as `activities.name`, which erasure also leaves alone.
- **D7 — Readers.** Every organisation member with `activity:read` (Viewers included); cost items only
  with `cost:read`, stripped server-side with `has_non_cost_change` in the keyset predicate so a page is
  never short; never an External Guest (no route on the guest surface, ADR-0051).
- **D8 — Retention and deletion.** An entry lives as long as its activity (CQ-2); there is no age sweep.
  The foreign key into `activities` is `ON DELETE RESTRICT` and the three permanent-deletion sites delete
  history **explicitly**: the ADR-0096 expiry runner (counted in `ExpiryCounts.activityHistoryEntries`,
  charged to the run's activity budget at `HISTORY_ROWS_PER_ACTIVITY` rows per activity, shipping at an
  unmeasured, deliberately pessimistic `1`, and reported as `activityHistoryCount` on the
  `hierarchy.expired` audit row), the interchange compensation, and a schema-derived test-cleanup helper
  (`test/clear-activity-tree.ts`). `RESTRICT` rather than `CASCADE` because a cascade runs uncounted
  inside the `DELETE FROM activities` statement, so the budget could not see it, and because
  `hierarchy-expiry.structural.spec.ts` then refuses a runner that forgets the table. **The rollback
  hazard is stated rather than hidden:** a pre-feature image run after entries exist fails expiry and
  import compensation with `23503` on plans that have history until the image moves forward again;
  nothing is lost and expiry ships disabled.
- **D9 — A coverage census, no flag, engine untouched.** `activity-history-coverage.structural.spec.ts`
  lists every write to an activity's input columns and to `dependencies`, `cross_plan_dependencies` and
  `resource_assignments`, and requires each to be **recorded**, **pending M2** (a snapshot queue the
  second milestone empties) or **exempt with a reason**. No `VITE_` flag (ADR-0088 D1): rollback is the
  commit boundary, with D8's hazard. History is a side record of inputs — no column on a scheduling
  table, no DTO field, nothing `computeSchedule` reads — and a structural spec pins that history imports
  nothing from `schedule/engine` and `schedule/` imports nothing from history.

## Alternatives considered

- **Record in the audit log** — ADR-0073 §3 rejects it permanently; the log cannot merge or delete rows.
- **A trigger or Prisma `$extends`** — would also catch the engine's write and version bumps, and cannot
  know the actor's scope or the merge rule.
- **Snapshot the whole activity per write and diff at read** — larger rows; merge and redaction move into
  the read path; links and assignments are separate rows anyway.
- **Row locks on the endpoint activities in id order** — a new multi-row row-locker that can deadlock with
  the recalculation write and `updatePlacements`, which both row-lock many activities in no defined order.
- **Per-activity advisory locks for batches** — 2,000 lock-table slots per batch.
- **`CASCADE` from activities** — uncounted, so unbudgetable in expiry.
- **Record a link on the successor only** — "who hung this on my activity?" becomes unanswerable from the
  predecessor.
- **No merging, or merging on read** — a thirty-second fiddle becomes a dozen entries, or pagination is
  unstable.
- **A `VITE_` flag** — ADR-0088 D1.

## Consequences

- "Who changed this, and when?" is answerable from the activity editor's **History** tab for every
  single-activity field, link and resource change made after this ships. Group moves, batch re-parent,
  dissolve, cross-plan links and the knock-on effects of deleting something else are the second
  milestone; until then they are queued in the census, not silently absent.
- A second attributed store exists. It is mutable, so it can be wrong in ways the audit log cannot, and
  the UI says calculated dates are not listed and never says "audit".
- Every new write path to an activity, link or assignment must be recorded or exempted with a reason, or
  the census fails.
- **Unmeasured, and stated as such.** The recording cost (target ≤ 2 ms p95 per single-object write,
  ≤ 4 ms for a link write), the read p95 (< 50 ms at 1,000 entries), the expiry cost per history row
  (replacing `HISTORY_ROWS_PER_ACTIVITY = 1`) and the real entry rate (the spec's estimate is 0.3–0.5 KB
  per entry and 6–55 MB a year on a busy plan, plus 20–40 % for links and resources) are estimates
  until their measurement tasks run; this ADR will be amended with the numbers.
- Pre-existing and not made worse: `updatePlacements` and the recalculation write both row-lock many
  activities in no defined order (`docs/TECH_DEBT.md` #440).

## References

- `docs/specs/activity-change-history/` — spec, plan and data model
- ADR-0073 §3, ADR-0072, ADR-0085, ADR-0096, ADR-0125
