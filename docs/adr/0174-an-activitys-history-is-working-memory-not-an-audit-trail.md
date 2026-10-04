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
  an editor WBS-parent change), `PROGRESS`, `PLACEMENT` (batch moves, batch re-parent, dissolve),
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
  `resource_assignments`, and requires each to be **recorded** or **exempt with a reason**. (It had a third status, `pending-m2`, until
  the second milestone emptied that queue and deleted it.) No `VITE_` flag (ADR-0088 D1): rollback is the
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
  field, link (in-plan and cross-plan) and resource change made after this ships, including group
  moves, a batch re-parent and a dissolve, and including the links a survivor lost or regained when
  somebody deleted or restored the activity at their other end (second milestone, below).
- A second attributed store exists. It is mutable, so it can be wrong in ways the audit log cannot, and
  the UI says calculated dates are not listed and never says "audit".
- Every new write path to an activity, link or assignment must be recorded or exempted with a reason, or
  the census fails.
- **Measured 2026-10-04 (M1-T7), first pass — one bar missed;
  see "Rebuilt and re-measured" below.** Machine: 4 vCPU Intel Xeon @ 2.80 GHz,
  16 GB, **PostgreSQL 16.14** (not 17; `shared_buffers` 128 MB, `fsync` and `synchronous_commit` on),
  Node 22.22, API and database on the same host, a fresh scratch database per run, two full runs. Table:
  1,000,000 entries, 1,000 per activity across 1,000 activities (710 MB heap, 140 MB indexes). Harness:
  `apps/api/test/measure/activity-history.measure.ts` (`pnpm --filter @repo/api exec vitest run --config
vitest.measure.config.mts`, against a disposable database), plus the `EXPLAIN` text in the plan's M1-T7.
  - **Read page: PASS.** HTTP p95 over 200 runs of `GET …/history?limit=50` on a 1,000-entry activity:
    17.2 / 24.7 ms (cost reader, runs 1 / 2), 20.7 / 23.0 (non-cost reader), 23.3 / 25.8 (page ~500
    entries deep); bar < 50 ms. The history query itself is 0.06–0.24 ms in the database: the rest is the
    request (session, scope, activity lookup, actor names, serialisation).
  - **Merge lookup: PASS.** The recorder's probe is an `Index Scan` on `idx_activity_history_activity_recorded`
    under a `Limit` (4 buffers, 0.19 / 0.28 ms execution), and every read page is an `Index Scan` on the
    same index with `organization_id` as a filter — never a sequential scan, with a custom or a generic
    plan, with and without `has_non_cost_change`, first page and deep keyset page.
  - **Added write cost: MISSED on every operation.** Added p95 over 200 paired writes (150 for links),
    runs 1 / 2: activity PATCH merging into the open entry 4.8 / 3.8 ms; PATCH opening a new entry
    8.4 / 3.0; assignment update merging 5.5 / 4.1, opening 5.5 / 5.3; **link create 7.8 / 14.4** (bar 4).
    Bars are ≤ 2 ms for a single-object write and ≤ 4 ms for a link. The medians say it is not tail noise:
    added p50 was 2.9–4.9 ms for activity and assignment writes and 6.3 / 6.9 ms for a link create, in
    both runs. "Without" is the same service path with the recorder's four methods stubbed on the
    instance (no production toggle exists or was added), so it still pays the services' own before/after
    reads; the cost is the recorder's extra round trips (lock, probe, entry write, and the name lookups).
    The per-statement split was not measured. The design is unchanged and this goes back to
    database-architect, as the plan requires of a miss.
  - **HOT: yes for what a merge actually touches; no `fillfactor` warranted.** 380 of 400 merge updates
    (95 %, run 2; 378 of 400 in run 1) were heap-only at the default fillfactor, because a merge extends
    the newest entry and that row is still on a page with room. A merge forced onto 300 sampled rows
    from the bulk-loaded (full-page) region was 0 % HOT; `fillfactor` 90 raised that to 10 % and 80 to
    23 %, at 10 % and 22 % more heap — and those rows are older than the merge window, which a merge
    never reaches.
    The expiry cost per history row (replacing `HISTORY_ROWS_PER_ACTIVITY = 1`) and the real entry rate
    (the spec's estimate is 0.3–0.5 KB per entry and 6–55 MB a year on a busy plan, plus 20–40 % for links
    and resources) remain estimates until M3-T2.
- **Bars restated by the product owner, 2026-10-04.** After the first pass missed on every operation, the
  database-architect's diagnosis (`implementation-plan.md` M1-T7) showed over 90 % of the added cost was
  the per-statement round trip, not database work, and that the 2 ms figure had priced neither a round
  trip nor the feature's own before/after reads. The decision: build the recorder-internal reduction
  and the read trim, **keep the link bar at ≤ 4 ms p95**, **restate the single-object bar as ≤ 3 ms p95
  (slow end) including the before/after reads the feature added**, add an automatic statement-count
  check, and make no schema change, migration or database function.
- **Rebuilt and re-measured 2026-10-04 — the single-object bar is still MISSED; the link bar passed in
  run 1 and missed in run 2.** Machine: 4 vCPU Intel Xeon @ 2.10 GHz, 15 GB, PostgreSQL 16.14 (not 17),
  Node 22.22, one host, a fresh scratch database per run, two runs, 1,000,000 entries; the harness
  baseline now also omits the feature's `before` read. Added p50 / p95 ms, run 1 / run 2: activity PATCH
  merging 5.9 / 5.6 and 7.2 / 6.0; PATCH opening an entry 7.2 / 6.5 and 7.2 / 13.9; assignment update
  merging 5.7 / 4.3 and 5.7 / 6.0, opening 5.3 / 6.8 and 6.0 / 8.6; **link create 3.0 / 3.4 and 4.9 / 6.1**
  (the rebuild took 2–3 ms off it: it was 6.3 / 6.9 p50 and 7.8 / 14.4 p95). Read page p95 25.3 / 26.9
  ms first page, 21.4 / 22.3 deep (pass); 93–94 % of merge updates HOT. The four statements of a
  single-object save measure 0.67 + 0.67 + 1.01 + 0.98 = 3.3 ms p50 in isolation against a 5.7–7.2 ms
  request delta; the gap is unattributed. The design was not changed further and this returns to the
  product owner. Method and the per-operation statement counts before and after are in the plan's M1-T7.
- **Shipped on the statement count, by product-owner decision (2026-10-04, second decision that day).**
  After the rebuild's re-measurement above, the product owner chose to ship M1 with **the statement
  count as the binding bar**: a single-object save or a link write adds **at most three recorder
  statements**, pinned by `apps/api/test/activity-history-statements.e2e-spec.ts`, which is
  machine-independent. The millisecond figures stay recorded as **missed on this machine** rather than
  restated again, and re-measuring on the deployed host (where the unattributed 2–4 ms may or may not
  appear) is `docs/TECH_DEBT.md` #443.
- **Second milestone (2026-10-04): batches and knock-ons, recorded in the same three statements.**
  A batch (`RecordInput.batch`) holds the plan's history lock **exclusively** with no activity lock (one
  lock slot however many rows), never merges into or receives a merge from anything, and carries its
  origin: `PLACEMENT` for `updatePlacements` (which levelling's apply goes through), `updateParents` and a
  dissolve's promoted children; `LOGIC` with `ACTIVITY_DELETED` / `ACTIVITY_RESTORED` for the links a
  delete or restore took from or gave back to **surviving** activities, one entry per survivor, split
  into entries of at most 16 keyed items when a hub lost more. The deleted or restored subject has no
  entry. A cross-plan link is recorded on both endpoints as `xlink:` items, each in its own plan's
  history. **No resource-library action records anything**, because none touches an assignment; the
  census now pins that. The before-values cost no statement: the placements route widens a read it
  already makes, the re-parent uses the tree read it already makes, and the delete and restore sweeps
  `RETURNING` the rows they stamp instead of counting them. Every path issues **three recorder statements
  for one row or forty** (`activity-history-statements.e2e-spec.ts`; the per-row alternative measured 43
  for forty).
- **Measured 2026-10-04 (M2-T5), added time of a 2,000-row batch** — machine: 4 vCPU Intel Xeon @ 2.10 GHz,
  15 GB, PostgreSQL 16.14 (not 17), one host, a fresh scratch database per run, two runs, 8 interleaved
  pairs each, harness `apps/api/test/measure/activity-history-batch.measure.ts`. **A 2,000-row placement:**
  1,573 / 1,590 ms without recording, +80 / +68 ms with (5.1 % / 4.3 %): inside both bars (≤ 25 % and ≤ 150
  ms). **Deleting a WBS summary of 200 children with 2,000 outbound links, so 2,000 survivors:** 92 / 99 ms
  without, +114 / +98 ms with (124 % / 99 %): **inside the 150 ms absolute bar and outside the 25 % relative
  bar**, because the route's own work is a few set-based statements and the recording writes 2,000 rows.
  In-process, one 2,000-row call splits as lock 1.4–5.1 ms, probe 19–41, building and merging the plan
  in TypeScript 11–38, one entry insert 51–62. The 2,000-row placement route's own 1.5 s is the same in both
  arms; database-architect re-measured it at 0.42–0.65 s with and without `ANALYZE`, so missing
  statistics are not the cause, and the ADR-0053 M6 13 ms note measures a different operation (a
  resource-group delete's lock step), not this shape. The miss returned to database-architect (plan
  M2-T5 diagnosis): any design that keeps "every affected activity shows what happened" writes one row
  per survivor, which alone costs more than half of this route's own work, so the 25 % bar is not
  reachable without a cap or post-commit recording, both rejected.
- **Shipped on the absolute bar, by product-owner decision (2026-10-04, third decision that day).** For
  knock-on recording from a delete or restore, the **150 ms absolute** bar is binding; group moves keep
  both bars (they pass). On this host the added cost grows about 50 µs per affected activity, so a
  single delete reaches 150 ms at about 3,000 survivors — beyond a 2,000-activity plan, within reach of
  an imported 10,000-activity programme. The lookup trim the diagnosis proposes is
  `docs/TECH_DEBT.md` #444.
- Pre-existing and not made worse: `updatePlacements` and the recalculation write both row-lock many
  activities in no defined order (`docs/TECH_DEBT.md` #440).

## References

- `docs/specs/activity-change-history/` — spec, plan and data model
- ADR-0073 §3, ADR-0072, ADR-0085, ADR-0096, ADR-0125
