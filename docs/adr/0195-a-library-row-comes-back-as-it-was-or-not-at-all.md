# ADR-0195: A library row comes back as it was, or not at all

- **Status:** Accepted — 2026-10-17. The spec was approved by the product owner on 2026-10-17 with the recommended
  default for every open question (Q1 refuse a name or code clash and name the live item; Q2 block with "Restore
  calendar first"; Q3 list a dissolved group as "Empty resource group"; Q4 record the pre-existing
  restored-onto-a-deleted-calendar gap as a debt row and do not fix it here).
- **Spec:** [`docs/specs/restore-resources-calendars/feature-spec.md`](../specs/restore-resources-calendars/feature-spec.md)
  §4 · **Plan:** [`implementation-plan.md`](../specs/restore-resources-calendars/implementation-plan.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0053](0053-calendar-scoping-and-resource-management.md) §3 (the 2026-10-03 "no restore" paragraph)
  and [ADR-0096](0096-deleted-work-expires-and-purge-is-refused.md) (the bin's contract, and the scope of D2's sentence).
- **Builds on:** ADR-0012 (RBAC with resource scoping), ADR-0072/0073 (restore earns an audit event), ADR-0088 D1 (no
  flag), ADR-0105 (why this needed a spec), ADR-0119 / ADR-0123 (the filter control and its URL param) and ADR-0172
  (a soft-delete filter is stated at the query).

## Context

Deleting a resource or a calendar is final in practice. Both libraries stamp `delete_batch_id` so that a restore could
bring a deleted branch back together, but no restore exists (spec F2, F3), the recycle bin lists clients, projects and
plans only (F1), and the group-delete confirmation says so. A naive restore would create four hazards the forward paths
forbid: an active resource on a deleted calendar (F9), a resource under a parent that is no longer a group or is now
too deep (F10), a false "expires in N days" line on something that never expires (F13), and bin grouping that breaks
when a row carries a blocker that is not its parent (F14).

## Decision

**D1 — Resources and calendars join the bin; the restore is per-entity, batch-keyed and all-or-nothing.** It lives in
`ResourcesService` and `CalendarsService`, each of which already owns its soft delete. `HierarchyLifecycleService` is not
extended: resources are not a hierarchy level. If any row in a batch is blocked nothing is restored, and rows deleted
separately never come back with it.

**D2 — A name or code clash is refused, and the refusal names the holder.** 409 `NAME_TAKEN` / `CODE_TAKEN` with
`details.conflicts[]`, an archived holder included. There is no auto-rename: a resource `code` is the interchange
identity (ADR-0129), and ADR-0053 §4 already chose "restore is a guarded, conflict-capable operation".

**D3 — A blocker is a parent or a dependency, served per row, parent first.** `blockedBy.relation` is `'parent'` or
`'calendar'`. The parent relation is computed whatever batch the parent is in, which keeps members as members; only a
row with no deleted parent surfaces the first deleted calendar referenced anywhere in its batch, so a group root shows
its child's deleted calendar. That order is what keeps `groupDeletions` choosing the right root.

**D4 — Library rows do not expire, and `expiresAt` is served per row.** Resources and ORG calendars: `null`. A PROJECT
calendar: its project's `deletedAt + retentionDays` when that project is deleted. The web still withholds every
sentence unless retention is active. ADR-0096 D2's scope (clients, projects, plans) is unchanged.

**D5 — `resource:restore` and `calendar:restore`, in `HIERARCHY_WRITE`.** An ORG calendar additionally needs
`calendar:manage_org`, with the gate order restore code, then load, then `manage_org`.

**D6 — A dissolved group restores empty.** The resources that moved up stay where they are. Dissolve stays not undoable.

**D7 — A calendar restore stamps the plans that already reference it.** `markScheduleInputsChanged` is called in the
same transaction. The engine is not touched (ADR-0034 parity: no file under `apps/api/src/modules/schedule/` changes).

## Alternatives considered

See the spec's §4 table: extending `restoreBatch`, auto-rename, restoring onto the plan calendar, a client-computed
expiry, a server-side `kind` filter, a flag, and partial restore. Each is rejected there with its reason.

## Consequences

- A deleted resource or calendar is recoverable, and the delete confirmations say so.
- The pre-existing gap that a plan or activity can be live on a deleted calendar (F11) is remedied for the restore case
  and not closed; it is recorded in `docs/TECH_DEBT.md`.
- The bin can grow with library rows because they never expire. Revisit if a tenant's library bin passes ~1,000 rows.
- `GET …/deleted` items gain `subtype`, `expiresAt` and `blockedBy.relation`, and `kind` widens. Pre-1.0 that is a minor.
- No schema change is expected; whether the widened bin query needs an index is decided by measurement and by the
  database-architect agent (spec §4 "Database changes").

## Acceptance-status ledger

Built 2026-10-17 on `work/restore-library`. The readings were taken the same day on the local database and
headless Chromium; the e2e, red-first and journey runs below are on rebased main `149ee791`.

| Decision                                               | Built in                                                  | Evidence                                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| D1 per-entity, batch-keyed, all-or-nothing             | `ResourcesService.restore`, `CalendarsService.restore`    | `resources.service.spec.ts`, `calendars.service.spec.ts`; `test/library-restore.e2e-spec.ts`                                       |
| D2 refuse a clash, name the holder                     | `assertNoLiveHolder`; the calendar pre-check              | the unit specs; the e2e                                                                                                            |
| D3 a blocker is a parent or a dependency, parent first | `RecycleBinRepository.findDeletedPage`                    | `recycle-bin.service.spec.ts`, `group-deletions.test.ts`; `recycle-bin.e2e-spec.ts`                                                |
| D4 library rows do not expire                          | `expiresAt` per row                                       | `recycle-bin.service.spec.ts`, `expiry-copy.test.ts`, `RecentlyDeletedTable.test.tsx`                                              |
| D5 `resource:restore`, `calendar:restore`              | `org-permissions.ts`                                      | `org-permissions.spec.ts`                                                                                                          |
| D6 a dissolved group restores empty                    | no special case                                           | `library-restore.e2e-spec.ts`                                                                                                      |
| D7 a calendar restore stamps the plans using it        | `markScheduleInputsChanged` in `CalendarsService.restore` | `schedule-inputs.structural.spec.ts`; the e2e                                                                                      |
| Bin query cost                                         | `test/measure/recycle-bin-library.measure.ts`             | Measured, no index (below)                                                                                                         |
| Engine untouched                                       | nothing under `apps/api/src/modules/schedule/` changed    | the diff of that directory against the base commit is empty, read 2026-10-17                                                       |
| Journeys                                               | `apps/web/e2e/recently-deleted.spec.ts`                   | `e2e-local.sh web` 28 passed (the 7 library and filter journeys among them); `web:library` 3 passed; the filter fits at 1024 x 600 |

### The bin query reading (2026-10-17)

One organisation, 5,000 resources and 5,000 calendars (the ADR-0053 ceiling) with a deleted minority: 1,560
resources (60 groups of 25, a fifth of the children on a deleted calendar), 400 calendars, 600 plans, 50
projects. First page of 101 rows, 15 runs, wall time of the repository call:

| Query                    | p50     | p95     | Execution (EXPLAIN ANALYZE) |
| ------------------------ | ------- | ------- | --------------------------- |
| three tables, as on main | 1.3 ms  | 2.6 ms  | 0.7 ms                      |
| five tables, as shipped  | 11.2 ms | 15.5 ms | 6.8 ms, 2,333 buffers       |

p95 is about 13x the old query and about 8% of the 200 ms read target in `docs/PERFORMANCE.md` (CLAUDE.md §15).
The plan sequentially scans `resources` and `calendars` filtered by organisation (98 and 81 buffers) and hash-joins
the parent table; the batch-wide calendar lookup runs for the 101 page rows only, through
`idx_resources_delete_batch_id`. **Decision: no index.** The partial index
`(organization_id, deleted_at DESC, id) WHERE deleted_at IS NOT NULL` goes to database-architect when either
(a) p95 for a 101-row page passes 100 ms on this harness (the scan is linear in the organisation's library, so
roughly ten times this seed, about 50,000 resources, by extrapolation and not by measurement), or (b) a tenant's
library bin passes ~1,000 rows, the point CLAUDE.md's risk row already names.

### Red-first matrix (2026-10-17)

Each naive mutation applied alone to the shipped code, the named `library-restore.e2e-spec.ts` tests run, the
source restored (the tree was clean of source changes after every run).

| Mutation                                 | Tests that went red                                              |
| ---------------------------------------- | ---------------------------------------------------------------- |
| skip the deleted-parent check            | later-deleted group; restore by a member's id                    |
| skip the tree guard in restore           | parent no longer a group; tree too deep                          |
| drop the supplied branch height          | tree too deep                                                    |
| skip the name and code holder check      | name clash; archived holder; code clash                          |
| skip the calendar check                  | own calendar deleted; whole group refused for a child's calendar |
| drop the calendar advisory locks         | restore against a calendar delete (8 rounds)                     |
| restore by parent links as well as batch | group restore leaves an earlier-deleted child deleted            |
| restore every exception, not the batch   | calendar: exception removed earlier stays removed                |
| do not stamp the plans                   | calendar restore re-dates the plan (F11)                         |
| skip the project-active check            | calendar swept with its project                                  |
| skip the calendar name pre-check         | calendar name clash, archived holder                             |

**Two findings from running it.** (1) My first mutation of the tree guard hit `create`, the first match in the
file, and stayed green; re-aimed at the restore it is red, which is why this table names the restore. (2)
Removing the organisation filter from the any-state load alone, or from all three of the load, the batch read and
the write, leaves the foreign-id test green: a fourth layer, the scoped re-read of the root inside the same
transaction, throws and rolls the write back. That is defence in depth working and not a vacuous test, and it
means no single mutation proves the filter; the test asserts the behaviour (404, row still deleted).

## References

- Spec: [`restore-resources-calendars`](../specs/restore-resources-calendars/feature-spec.md)
- [ADR-0053](0053-calendar-scoping-and-resource-management.md), [ADR-0096](0096-deleted-work-expires-and-purge-is-refused.md),
  [ADR-0129](0129-identity-across-two-imports-is-the-code.md)
