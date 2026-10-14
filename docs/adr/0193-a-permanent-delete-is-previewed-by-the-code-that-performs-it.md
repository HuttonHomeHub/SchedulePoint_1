# ADR-0193: A permanent delete is previewed by the code that performs it, and arming is a host act

- **Status:** Accepted — 2026-10-14. The spec was approved by the product owner on 2026-10-14 with every default in
  its §6 (switched on by a host `.env` setting; a preview command; the 90-day note in the delete confirmations; no
  organisation needs extra notice). D1 and D3 are built (milestone 1); the preview's use in CI (milestone 2) and the
  switch-on itself (milestone 5) are not yet.
- **Spec:** [`docs/specs/recycle-bin-clear-out/feature-spec.md`](../specs/recycle-bin-clear-out/feature-spec.md) §4.7,
  §4.9, §4.10 · **Plan:** [`implementation-plan.md`](../specs/recycle-bin-clear-out/implementation-plan.md)
- **Date:** 2026-10-14
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0096](0096-deleted-work-expires-and-purge-is-refused.md) D4 (the countdown is not the preview) and D9
  (what the operator's bar is, now that there is a command at it).
- **Builds on:** ADR-0072 and ADR-0085 (the audit log refuses `DELETE`, so the removed item's name outlives it),
  ADR-0086 (staff cannot reach customer data), ADR-0087 (scheduled work), ADR-0088 D1 (no flag), ADR-0105 (why this
  needed a spec), ADR-0110 (a test is proven red), ADR-0121 (one derivation), ADR-0190 (what 1.0 promises) and
  ADR-0192 (a tested backup is the precondition).

## Context

Pre-1.0 requirement (c) is that the recycle bin's 90-day clear-out is switched on and proven
(`docs/RELEASE_1_0.md` row 7). Reading the code for that found that "mostly turning it on" understated it.

- **ADR-0096 D4 promised a preview that does not exist while the switch is off.** It said "the countdown ships one
  release before the sweep arms", so an operator could see the blast radius. D11 later withheld the countdown from every
  screen while the switch is off, correctly, because it stated a deletion that was not going to happen
  (`apps/web/src/features/recently-deleted/model/expiry-copy.ts:36`). The screen also shows one organisation at a time,
  to its members. Nothing showed the operator, before switching on, what the first run would permanently delete.
- **A restore could lose to the sweep.** The sweep chooses its candidates, then deletes each in its own transaction by
  id alone. A planner who restored an item in that gap had live work deleted, with a `hierarchy.expired` row saying it
  had expired. The restore answered 404 (the controller re-reads the item afterwards) but only after the service had
  already written a `*.restored` audit row inside the restore's transaction, so the log claimed a restore that did not
  happen.
- **Nothing had ever run the sweep itself against a real database**; only its runner and a mocked selection.

## Decision

**D1: the preview is a read-only command in the API image that calls the sweep's own selector.**
`node dist/cli/clear-out-preview.js`, run with `docker compose exec api` in the stack folder. The selection (three
levels, the descendant skip rule, the strict cutoff) was extracted from `HierarchyExpiryService.sweep` into
`selectExpiryCandidates` and `resolveExpiryScope` (`hierarchy-expiry.candidates.ts`), called by both. A test runs both on
one database and asserts the listed roots are the deleted roots. The command takes no argument that changes what is
selected: a `--days` option would be a second answer to "what will go". It reads the same settings through the same
schema the API uses, so it also tells the operator whether the compose file passes the switch through.

Three properties keep it from deleting, each pinned by a test and not by a habit:

1. It **cannot start the application**. No Nest, no `AppModule`, no `HierarchyExpiryService`: constructing that service
   with the switch on would start a second sweep in the preview's own process, outside the per-process overlap guard.
2. Its session **refuses writes**: one connection (`connection_limit=1`), made read-only as its first statement and read
   back, failing closed if it did not take.
3. It **writes only to the terminal**, never the application log. It prints customer names, and the log is a rotated
   file on the host. Every tenant-typed name is passed through `printable()` first, so a name cannot carry a control or
   bidirectional character that forges or hides a line of the report. Every connection also starts read-only
   (`default_transaction_read_only`), not just the session it holds.

- Rejected: a log line listing what is due (names would persist in the rotated log; kept as a **counts-only** field on the
  `hierarchy_expiry.disabled` line so Dockge shows a number); a staff-console panel (refused by ADR-0096 D9 and ADR-0086:
  staff cannot reach customer data); showing the countdown on Recently deleted while off (per organisation only, and it is
  the claim D11 removed); a `--dry-run` mode of the API itself (boots the whole application beside a timer that deletes,
  one mistyped value from the real thing).
- The command's wording is **not** part of what 1.0 promises (ADR-0190 lists routes, file formats and settings).

**D2: arming is the operator's `.env` setting; the shipped default stays `false` at 1.0.** `RETENTION_HIERARCHY_ENABLED`
is set on the host on a day the owner chooses, after the preview and a same-day `check` (ADR-0192 D8), and redeployed
with **Deploy**, not **Update**, so nothing else changes that day. The first run is at boot and the clock is retroactive
(ADR-0096 D3), so everything already past its period goes at once.

- Rejected: flipping the default to `true` in a release. Watchtower would arm every installation that has not set the
  line, at an hour nobody chose, with no preview and no same-day copy, and rolling the image back afterwards restores
  nothing.

**D3: eligibility is re-asserted inside the deleting transaction, under the root's row lock.** Before anything is
deleted, `claimExpiredRoot` runs `updateMany({ where: { id, deletedAt: { lt: cutoff }, deleteBatchId: seen }, data:
{ deleteBatchId: seen } })` on the root. It writes back the value it matched on, so its only effects are the lock and the
count; a count of 0 means the root was restored or re-deleted since the scan, and the sweep deletes nothing and writes no
audit row. A restore that arrives while the claim is held waits for the lock and then finds the row gone. Either order,
exactly one side wins. The subtree's ids are resolved inside that transaction, after the claim, so they are
never stale. A restore whose own root update matches nothing now throws `NotFoundError` from
`restoreBatch` itself, so the `*.restored` audit row is not written for a restore that did not happen.

- Rejected: `SELECT … FOR UPDATE` (raw SQL is banned in the expiry directory by a structural test); a serializable
  transaction (retries on unrelated conflicts inside a transaction that can run for seconds).
- The claim lives in its own file because the runner's gate forbids the batch key: a batch-keyed **delete** is the bug
  ownership scope exists to avoid (ADR-0096 D5), and this step never deletes by it.

**D4: ADR-0096 D9 is unchanged.** No staff-console view of customer data. The operator's bar for the preview is the host
shell, the same bar as `psql`, which already reads everything (`docs/DEPLOYMENT.md`).

**D5: removed data persists in backups.** "Permanently removed" means removed from the live database. Nightly copies are
kept `BACKUP_KEEP_DAYS` (30), the newest copy of each kind is never pruned (ADR-0192), a restore keeps the old database
as `<db>_before_restore_…`, and the `hierarchy.expired` audit row keeps the item's name for ever. A request to erase a
client's data completely therefore needs the live removal and the copies dealt with. That is ADR-0085's territory and is
not built here; the operator documents state it.

## Consequences

- The 1.0 row is met on the owner's host once the owner switches the setting on (milestone 5). A fresh installation is
  **not** armed by default.
- The boot log's `hierarchy_expiry.disabled` line carries `pastPeriod: { clients, projects, plans }` (roots only, no
  names), counted with the sweep's own bounded scan and flagged `pastPeriodIsAtLeast` when a scan hit the limit, so a
  large bin is never pulled into memory at boot. A failed count is logged and the line still goes out: it can never be the reason the API does not start.
- The `hierarchy.expired` audit row now keeps `activityHistoryCount`. The sweep always recorded it; the redactor's
  allowlist dropped it from every stored row. The audit screen's wording does not show it yet.
- A restore that loses the race answers 404 as before, but now writes no `*.restored` row (`docs/API.md`).
- The preview can list an item the sweep removes a second later (a run in progress); its output is stamped with the time.
- It does not fix per-organisation fairness of the run budget (`docs/TECH_DEBT.md` #141), which stays open: one
  organisation in practice.
- The sweep's run budgets (`ACTIVITY_BUDGET_PER_RUN`, `SCOPE_BUDGET_PER_RUN`) moved to the selector's file so the preview
  states how many runs a backlog needs from the numbers the sweep spends, without importing the service.
