# ADR-0200: A restore brings nothing back onto a deleted calendar

- **Status:** Accepted — 2026-10-17, with the API half (milestone 2 of the plan). D3 is built in milestone 3 and D5 in milestone 4.
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner — approved the spec on 2026-10-17 with the recommended default for
  every open question: Q1 refuse, Q2 keep the undo step, Q3 include the tier check), with Claude Code.
- **Amends:** [ADR-0176](0176-undo-checks-before-it-writes-and-sets-aside-what-it-cannot-apply.md) D3, for one reason.
- **Builds on:** ADR-0195 (a library row comes back as it was, or not at all), ADR-0096 (batch restore), ADR-0053
  (calendar tiers), ADR-0028 (the pen), ADR-0088 D1 (no flag), ADR-0105 (why this needed a spec) and ADR-0172 (a
  soft-delete filter is stated at the query).
- **Spec:** [`docs/specs/deleted-calendar-restore/spec.md`](../specs/deleted-calendar-restore/spec.md) ·
  **Plan:** [`implementation-plan.md`](../specs/deleted-calendar-restore/implementation-plan.md) · `docs/TECH_DEBT.md`
  #519 and #520

## Context

A plan or activity could come back from the bin pointing at a calendar that was itself deleted. The engine treats a
deleted calendar as no calendar and schedules round the clock, so the next recalculation finished the programme days
early and nothing on screen said why (#519). The calendar delete guard counts only live users, so a calendar used only
by deleted work can be deleted; no hierarchy restore looked at a calendar. ADR-0195 closed the same gap for resources
and treated the plan/activity case as a remedy (restoring the calendar marks the plans stale), not a cause.

A project-calendar restore, and a plan or project restore, also read their parent without a lock while a delete of
that parent sweeps its subtree before it stamps itself, so a restored child could be left active under a deleted
parent (#520).

## Decision

**D1 — Every hierarchy restore refuses when its batch binds a deleted calendar outside the batch.** Plan, project,
client, single-activity and batch restore all pass through `HierarchyLifecycleService.restoreBatch`, which collects the
calendar ids of the plans and activities in the batch, takes the calendar advisory lock on each in ascending id order,
and answers 409 `CALENDAR_DELETED` with `details.calendar` `{ id, name, deleteBatchId }` before its first write. A
calendar deleted in the same batch comes back with it and is not a blocker; an archived one is live (ADR-0053 §4).
This is ADR-0195's rule, extended; the refusal names the lowest id.

**D2 — The bin shows it in advance.** Plan, project and client rows with no deleted parent carry
`blockedBy` `{ relation: 'calendar' }`, so the row says what the restore would say and offers the existing
"Restore calendar first…" flow.

**D3 — Lock order.** A restore takes the calendar advisory locks, then every ancestor row `FOR SHARE`, top-down
(client, then project). A client or project delete takes its own root row `FOR NO KEY UPDATE` before it reads its
subtree. The two conflict, so a restore and a delete of an ancestor serialise and end consistently under READ
COMMITTED: restore first and the delete sweeps the restored child; delete first and the restore's locking read matches
nothing and is refused `PARENT_DELETED`. `CalendarsService.restore` takes the same shared locks. Shared locks do not
conflict with each other, and deletes request neither an ancestor nor a calendar lock, so no cycle forms.

**D4 — Undo keeps a step refused for `CALENDAR_DELETED`.** It is a `failed` result with a sentence that names the
calendar and says what to do; both stacks are untouched and the strip offers Try again. This amends ADR-0176 D3 for this
one reason: the cure is in the planner's hands, and a deleted activity is not listed in Recently deleted, so setting the
step aside would leave no way in the product to get that work back.

**D5 — A restore also refuses a calendar now in another project's tier** (Q3), because narrowing a calendar while the
holder sat in the bin is a second route to the same defect.

## Alternatives considered

- **Re-point the row to a default calendar.** There is no org default, only a calendar found by name; null means
  all-minutes, which is the defect. It changes dates nobody chose and breaks "comes back as it was".
- **Restore the calendar inside the plan restore.** Its batch may hold siblings nobody pressed for, and it needs
  `calendar:manage_org` inside a `plan:restore`. ADR-0195 rejected the same move for ancestors.
- **Make calendar delete count deleted users.** Hierarchy retention is off by default and purge is refused, so one
  deleted plan would make a calendar undeletable for ever.

## Consequences

- No restore path can make a plan or activity live on a deleted calendar. Rows already in that state are not repaired;
  restoring the calendar still marks their plans stale (ADR-0195 D7).
- Five public restore endpoints gain a refusal: pre-1.0, a minor bump. The schema is unchanged.
- Restore pays two batch-keyed reads and a handful of advisory locks; the delete cascades pay one row lock.
- Follow-on debt is filed rather than fixed here: the calendar narrowing guard counts only active referencers.

## References

- `docs/TECH_DEBT.md` #519, #520.
- ADR-0195, ADR-0176, ADR-0096.

## Acceptance-status ledger

| Decision                                 | Built in                                                                                 | Evidence                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D1 refuse on a deleted calendar          | `HierarchyLifecycleService.restoreBatch` (`lockBatchCalendars`, `assertCalendarsActive`) | `hierarchy-lifecycle.service.spec.ts`; `deleted-calendar-restore.e2e-spec.ts`; `library-restore.e2e-spec.ts` |
| D2 the bin predicts it                   | `RecycleBinRepository.findDeletedPage` (the `hb` lateral)                                | `deleted-calendar-restore.e2e-spec.ts`; `RecentlyDeletedTable.test.tsx`; `recently-deleted.spec.ts`          |
| D4 undo keeps the step                   | `CalendarDeletedFailure` (`replay.ts`), `calendarDeletedDetail` (`history-result.ts`)    | `commands.test.ts`, `use-plan-undo-redo.test.ts`, `history-result.test.ts`; `e2e-undo/undo.spec.ts`          |
| Bin query cost, restore latency at 2,000 | **Not measured.** Needs a database; owed on the scale seed (ADR-0142).                   | The batch-keyed lookup uses the three partial `delete_batch_id` indexes by reading, not by EXPLAIN           |
